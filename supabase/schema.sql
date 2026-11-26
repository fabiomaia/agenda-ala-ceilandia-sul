-- =====================================================================
--  Calendário de Atividades Ala Ceilândia Sul 2027 — banco de dados
--  Cole TUDO no Supabase → SQL Editor → New query → Run (uma vez só).
-- =====================================================================

-- ---------- Tabelas ----------------------------------------------------

-- Cadastro do líder (nome, organização e WhatsApp)
create table if not exists public.perfis (
  id        uuid primary key references auth.users (id) on delete cascade,
  nome      text not null check (char_length(nome) between 3 and 80),
  org       text not null check (org in ('primaria','socorro','elderes','rapazes','mocas','escola')),
  whats     text not null check (whats ~ '^[0-9]{11,15}$'),
  email     text,
  criado    timestamptz not null default now(),
  atualizado timestamptz
);

-- Decisão do dono sobre cada cadastro
create table if not exists public.aprovacoes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status  text not null check (status in ('aprovado','recusado')),
  org     text check (org in ('primaria','socorro','elderes','rapazes','mocas','escola')),
  por     uuid references auth.users (id) on delete set null,
  em      timestamptz not null default now(),
  check (status = 'recusado' or org is not null)
);

-- Administradores (o dono é marcado com dono = true)
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dono    boolean not null default false,
  criado  timestamptz not null default now()
);

-- Atividades do ano (mes: 0 = janeiro … 11 = dezembro; dia vazio = "a definir")
create table if not exists public.atividades (
  id         uuid primary key default gen_random_uuid(),
  mes        smallint not null check (mes between 0 and 11),
  nome       text not null check (char_length(btrim(nome)) between 1 and 140),
  org        text not null check (org in ('primaria','socorro','elderes','rapazes','mocas','escola')),
  detalhes   text not null default '' check (char_length(detalhes) <= 400),
  dia        smallint check (dia between 1 and 31),
  autor      uuid references auth.users (id) on delete set null,
  autor_nome text not null default '',
  criado     timestamptz not null default now(),
  atualizado timestamptz
);
create index if not exists atividades_mes_idx on public.atividades (mes, dia);

-- ---------- Funções de apoio ------------------------------------------

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create or replace function public.eh_dono() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and dono);
$$;

-- Organização aprovada do usuário logado (null se não aprovado)
create or replace function public.minha_org() returns text
language sql stable security definer set search_path = public as $$
  select org from aprovacoes where user_id = auth.uid() and status = 'aprovado';
$$;

-- ---------- Regras automáticas (gatilhos) -----------------------------

-- Atividades: autor e datas são preenchidos pelo banco;
-- só administradores definem o dia; o dia precisa existir em 2027.
create or replace function public.atividades_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.autor      := coalesce(auth.uid(), new.autor);
    new.autor_nome := coalesce((select nome from perfis where id = new.autor), new.autor_nome, '');
    new.criado     := now();
    if auth.uid() is not null and not eh_admin() then
      new.dia := null;
    end if;
  else
    new.autor      := old.autor;
    new.autor_nome := old.autor_nome;
    new.criado     := old.criado;
    new.atualizado := now();
    if auth.uid() is not null and not eh_admin() then
      -- líder não mexe no dia; se trocar o mês, o dia volta a ficar "a definir"
      new.dia := case when new.mes = old.mes then old.dia else null end;
    end if;
  end if;
  new.nome := btrim(new.nome);
  if new.dia is not null and new.dia > extract(day from (make_date(2027, new.mes + 1, 1) + interval '1 month - 1 day')) then
    raise exception 'O dia % não existe nesse mês.', new.dia using errcode = '22008';
  end if;
  return new;
end $$;

drop trigger if exists atividades_antes on public.atividades;
create trigger atividades_antes before insert or update on public.atividades
for each row execute function public.atividades_antes();

-- Perfis: e-mail vem da conta de login; datas automáticas
create or replace function public.perfis_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := coalesce(auth.jwt() ->> 'email', new.email);
  if tg_op = 'INSERT' then
    new.criado := now();
  else
    new.criado := old.criado;
    new.atualizado := now();
  end if;
  return new;
end $$;

drop trigger if exists perfis_antes on public.perfis;
create trigger perfis_antes before insert or update on public.perfis
for each row execute function public.perfis_antes();

-- Ao mudar o nome no cadastro, atualiza o "marcada por" das atividades
create or replace function public.perfis_depois() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nome is distinct from old.nome then
    update atividades set autor_nome = new.nome where autor = new.id;
  end if;
  return new;
end $$;

drop trigger if exists perfis_depois on public.perfis;
create trigger perfis_depois after update on public.perfis
for each row execute function public.perfis_depois();

-- ---------- Segurança: quem pode ver e mudar o quê (RLS) -------------

alter table public.perfis     enable row level security;
alter table public.aprovacoes enable row level security;
alter table public.admins     enable row level security;
alter table public.atividades enable row level security;

-- Atividades: qualquer pessoa logada vê; administrador faz tudo;
-- líder aprovado cria/edita/exclui só as próprias, da própria organização.
drop policy if exists "atividades_ver"     on public.atividades;
drop policy if exists "atividades_criar"   on public.atividades;
drop policy if exists "atividades_editar"  on public.atividades;
drop policy if exists "atividades_excluir" on public.atividades;
create policy "atividades_ver" on public.atividades for select to authenticated using (true);
create policy "atividades_criar" on public.atividades for insert to authenticated
  with check (eh_admin() or (org = minha_org() and autor = auth.uid()));
create policy "atividades_editar" on public.atividades for update to authenticated
  using      (eh_admin() or (autor = auth.uid() and org = minha_org()))
  with check (eh_admin() or (autor = auth.uid() and org = minha_org()));
create policy "atividades_excluir" on public.atividades for delete to authenticated
  using (eh_admin() or (autor = auth.uid() and org = minha_org()));

-- Perfis: cada um vê e mexe no seu; só o dono vê todos (WhatsApps).
drop policy if exists "perfis_ver"     on public.perfis;
drop policy if exists "perfis_criar"   on public.perfis;
drop policy if exists "perfis_editar"  on public.perfis;
drop policy if exists "perfis_excluir" on public.perfis;
create policy "perfis_ver" on public.perfis for select to authenticated using (id = auth.uid() or eh_dono());
create policy "perfis_criar" on public.perfis for insert to authenticated with check (id = auth.uid());
create policy "perfis_editar" on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfis_excluir" on public.perfis for delete to authenticated using (id = auth.uid() or eh_dono());

-- Aprovações: cada um vê a sua; só o dono aprova, recusa ou remove.
drop policy if exists "aprovacoes_ver"   on public.aprovacoes;
drop policy if exists "aprovacoes_dono"  on public.aprovacoes;
create policy "aprovacoes_ver" on public.aprovacoes for select to authenticated using (user_id = auth.uid() or eh_dono());
create policy "aprovacoes_dono" on public.aprovacoes for all to authenticated using (eh_dono()) with check (eh_dono());

-- Administradores: todos logados veem quem é admin; só o dono promove/remove
-- (o próprio dono não pode ser removido pelo app).
drop policy if exists "admins_ver"      on public.admins;
drop policy if exists "admins_criar"    on public.admins;
drop policy if exists "admins_excluir"  on public.admins;
create policy "admins_ver" on public.admins for select to authenticated using (true);
create policy "admins_criar" on public.admins for insert to authenticated with check (eh_dono() and dono = false);
create policy "admins_excluir" on public.admins for delete to authenticated using (eh_dono() and dono = false);

-- ---------- Atualização em tempo real ---------------------------------
do $$
begin
  alter publication supabase_realtime add table public.atividades, public.admins, public.aprovacoes, public.perfis;
exception when others then
  raise notice 'Tempo real: tabelas já estavam ativadas (ou publicação inexistente).';
end $$;
