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
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  fim  date;
begin
  if auth.uid() is not null and not eh_admin() and (tg_op = 'INSERT' or new.mes <> old.mes) then
    fim := (make_date(2027, new.mes + 1, 1) + interval '1 month - 1 day')::date;
    if hoje > fim then
      raise exception 'Este mês já passou. Escolha outro mês.' using errcode = 'P0001', hint = 'prazo_encerrado';
    elsif fim - hoje <= 5 then
      raise exception 'Prazo muito curto: faltam % dia(s) para o fim do mês. Escolha um mês seguinte.', fim - hoje using errcode = 'P0001', hint = 'prazo_curto';
    end if;
  end if;
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

-- ---------- Permissões para o site (projetos novos exigem) ---------
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.atividades, public.perfis, public.aprovacoes, public.admins
  to authenticated;
grant execute on function public.eh_admin(), public.eh_dono(), public.minha_org() to authenticated;

-- Calendário público: qualquer pessoa (sem login) consulta SÓ as atividades
-- que já têm dia definido. Não expõe quem marcou nem dados de cadastro.
create or replace function public.calendario_publico()
returns table (id uuid, mes smallint, dia smallint, nome text, org text, detalhes text)
language sql stable security definer set search_path = public as $$
  select id, mes, dia, nome, org, detalhes
  from atividades
  where dia is not null
  order by mes, dia, criado;
$$;

revoke all on function public.calendario_publico() from public;
grant execute on function public.calendario_publico() to anon, authenticated;

-- ---------- Atualização em tempo real ---------------------------------
do $$
begin
  alter publication supabase_realtime add table public.atividades, public.admins, public.aprovacoes, public.perfis;
exception when others then
  raise notice 'Tempo real: tabelas já estavam ativadas (ou publicação inexistente).';
end $$;


-- =====================================================================
--  Horários + solicitações de alteração/cancelamento dos líderes
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- 1) Horário da atividade (24 horas, HH:MM). Vazio = a definir.
alter table public.atividades add column if not exists horario text;
alter table public.atividades drop constraint if exists atividades_horario_check;
alter table public.atividades add constraint atividades_horario_check
  check (horario is null or horario ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- 2) Regras da atividade: prazo do mês e bloqueio de edição direta
--    de atividade já agendada (o líder precisa enviar solicitação).
create or replace function public.atividades_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  fim   date;
  lider boolean := auth.uid() is not null and not eh_admin();
begin
  if lider and tg_op = 'UPDATE' and old.dia is not null then
    raise exception 'Esta atividade já está agendada. Para alterar ou cancelar, envie uma solicitação ao administrador.' using errcode = 'P0001', hint = 'agendada';
  end if;
  if lider and (tg_op = 'INSERT' or new.mes <> old.mes) then
    fim := (make_date(2027, new.mes + 1, 1) + interval '1 month - 1 day')::date;
    if hoje > fim then
      raise exception 'Este mês já passou. Escolha outro mês.' using errcode = 'P0001', hint = 'prazo_encerrado';
    elsif fim - hoje <= 5 then
      raise exception 'Prazo muito curto: faltam % dia(s) para o fim do mês. Escolha um mês seguinte.', fim - hoje using errcode = 'P0001', hint = 'prazo_curto';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.autor      := coalesce(auth.uid(), new.autor);
    new.autor_nome := coalesce((select nome from perfis where id = new.autor), new.autor_nome, '');
    new.criado     := now();
  else
    new.autor      := old.autor;
    new.autor_nome := old.autor_nome;
    new.criado     := old.criado;
    new.atualizado := now();
  end if;
  if lider then new.dia := null; end if;
  new.nome := btrim(new.nome);
  if new.horario = '' then new.horario := null; end if;
  if new.dia is not null and new.dia > extract(day from (make_date(2027, new.mes + 1, 1) + interval '1 month - 1 day')) then
    raise exception 'O dia % não existe nesse mês.', new.dia using errcode = '22008';
  end if;
  return new;
end $$;

-- Líder só exclui direto atividade ainda sem dia; agendada precisa de solicitação.
drop policy if exists "atividades_excluir" on public.atividades;
create policy "atividades_excluir" on public.atividades for delete to authenticated
  using (eh_admin() or (autor = auth.uid() and org = minha_org() and dia is null));

-- 3) Solicitações dos líderes
create table if not exists public.solicitacoes (
  id            uuid primary key default gen_random_uuid(),
  atividade     uuid references public.atividades (id) on delete set null,
  tipo          text not null check (tipo in ('alterar','cancelar')),
  autor         uuid references auth.users (id) on delete cascade,
  autor_nome    text not null default '',
  antes         jsonb not null default '{}'::jsonb,
  depois        jsonb,
  motivo        text not null default '' check (char_length(motivo) <= 300),
  status        text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  resposta      text not null default '' check (char_length(resposta) <= 300),
  final         jsonb,
  criado        timestamptz not null default now(),
  resolvido     timestamptz,
  resolvido_por uuid references auth.users (id) on delete set null,
  visto         boolean not null default false
);
create unique index if not exists solicitacoes_uma_pendente on public.solicitacoes (atividade) where status = 'pendente';

create or replace function public.solicitacoes_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a atividades;
  v boolean;
begin
  if tg_op = 'INSERT' then
    select * into a from atividades where id = new.atividade;
    if not found then raise exception 'Atividade não encontrada.'; end if;
    if not eh_admin() and (a.autor is distinct from auth.uid() or a.org is distinct from minha_org()) then
      raise exception 'Você só pode pedir mudanças nas suas atividades.' using errcode = '42501';
    end if;
    new.autor := auth.uid();
    new.autor_nome := coalesce((select nome from perfis where id = auth.uid()), '');
    new.antes := jsonb_build_object('nome', a.nome, 'mes', a.mes, 'dia', a.dia, 'horario', a.horario, 'org', a.org, 'detalhes', a.detalhes);
    new.status := 'pendente'; new.resposta := ''; new.final := null;
    new.resolvido := null; new.resolvido_por := null; new.visto := false; new.criado := now();
    if new.tipo = 'cancelar' then
      new.depois := null;
    else
      if new.depois is null
         or coalesce((new.depois->>'mes')::int, -1) not between 0 and 11
         or char_length(btrim(coalesce(new.depois->>'nome',''))) not between 1 and 140
         or char_length(coalesce(new.depois->>'detalhes','')) > 400
         or (coalesce(new.depois->>'horario','') <> '' and (new.depois->>'horario') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
        raise exception 'Dados da alteração inválidos.' using errcode = '22023';
      end if;
      new.depois := jsonb_build_object('nome', btrim(new.depois->>'nome'), 'mes', (new.depois->>'mes')::int,
        'horario', nullif(new.depois->>'horario',''), 'detalhes', coalesce(new.depois->>'detalhes',''));
    end if;
    return new;
  end if;
  -- UPDATE: o líder só pode marcar a resposta como vista
  if not eh_admin() then
    if old.autor is distinct from auth.uid() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
    v := new.visto;
    new := old;
    new.visto := coalesce(v, old.visto);
  end if;
  return new;
end $$;

drop trigger if exists solicitacoes_antes on public.solicitacoes;
create trigger solicitacoes_antes before insert or update on public.solicitacoes
for each row execute function public.solicitacoes_antes();

alter table public.solicitacoes enable row level security;
drop policy if exists "solic_ver" on public.solicitacoes;
drop policy if exists "solic_criar" on public.solicitacoes;
drop policy if exists "solic_editar" on public.solicitacoes;
drop policy if exists "solic_excluir" on public.solicitacoes;
create policy "solic_ver" on public.solicitacoes for select to authenticated using (autor = auth.uid() or eh_admin());
create policy "solic_criar" on public.solicitacoes for insert to authenticated with check (eh_admin() or minha_org() is not null);
create policy "solic_editar" on public.solicitacoes for update to authenticated using (autor = auth.uid() or eh_admin()) with check (autor = auth.uid() or eh_admin());
-- líder pode desistir de um pedido ainda pendente; admin pode apagar qualquer um
create policy "solic_excluir" on public.solicitacoes for delete to authenticated using (eh_admin() or (autor = auth.uid() and status = 'pendente'));

-- 4) Resposta do administrador (tudo de uma vez, com segurança)
create or replace function public.resolver_solicitacao(p_id uuid, p_aprovar boolean, p_dia int default null, p_horario text default null, p_resposta text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes; a atividades;
begin
  if not eh_admin() then raise exception 'Só o administrador pode responder solicitações.' using errcode = '42501'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found or s.status <> 'pendente' then raise exception 'Solicitação não encontrada ou já respondida.'; end if;
  if p_aprovar then
    if s.tipo = 'cancelar' then
      delete from atividades where id = s.atividade;
    else
      update atividades set
        nome = coalesce(s.depois->>'nome', nome),
        mes = coalesce((s.depois->>'mes')::smallint, mes),
        detalhes = coalesce(s.depois->>'detalhes', detalhes),
        horario = nullif(coalesce(p_horario, s.depois->>'horario', ''), ''),
        dia = p_dia
      where id = s.atividade
      returning * into a;
    end if;
  end if;
  update solicitacoes set
    status = case when p_aprovar then 'aprovado' else 'recusado' end,
    resposta = left(coalesce(p_resposta, ''), 300),
    final = case when p_aprovar and s.tipo = 'alterar' then jsonb_build_object('nome', a.nome, 'mes', a.mes, 'dia', a.dia, 'horario', a.horario) end,
    resolvido = now(), resolvido_por = auth.uid(), visto = false
  where id = p_id;
end $$;

-- 5) Calendário público com horário
drop function if exists public.calendario_publico();
create function public.calendario_publico()
returns table (id uuid, mes smallint, dia smallint, horario text, nome text, org text, detalhes text)
language sql stable security definer set search_path = public as $$
  select id, mes, dia, horario, nome, org, detalhes
  from atividades
  where dia is not null
  order by mes, dia, horario nulls last, criado;
$$;

-- 6) Permissões e tempo real
grant select, insert, update, delete on table public.solicitacoes to authenticated;
revoke all on function public.resolver_solicitacao(uuid, boolean, int, text, text) from public;
grant execute on function public.resolver_solicitacao(uuid, boolean, int, text, text) to authenticated;
revoke all on function public.calendario_publico() from public;
grant execute on function public.calendario_publico() to anon, authenticated;
do $$
begin
  alter publication supabase_realtime add table public.solicitacoes;
exception when others then
  raise notice 'Tempo real: solicitacoes já estava ativada.';
end $$;
