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

-- =====================================================================
--  Avisos ao líder: atividade agendada (ou remarcada) pelo administrador
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
--  (Depende de horarios-solicitacoes.sql já ter sido rodado.)
-- =====================================================================

create table if not exists public.avisos (
  id        uuid primary key default gen_random_uuid(),
  usuario   uuid not null references auth.users (id) on delete cascade,
  atividade uuid references public.atividades (id) on delete cascade,
  tipo      text not null check (tipo in ('agendada','remarcada')),
  dados     jsonb not null default '{}'::jsonb,
  criado    timestamptz not null default now(),
  visto     boolean not null default false
);
create index if not exists avisos_usuario on public.avisos (usuario) where not visto;

-- Quando o admin define/muda o dia (ou o horário) de uma atividade de outra
-- pessoa, o autor recebe um aviso. Um só aviso não lido por atividade.
create or replace function public.atividades_aviso() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  av avisos;
  t  text;
  d  jsonb;
begin
  if new.autor is null or new.autor is not distinct from auth.uid() then
    return new;
  end if;
  if coalesce(current_setting('app.sem_aviso', true), '') = '1' then
    -- mudança vinda da aprovação de um pedido: a resposta do pedido já avisa
    delete from avisos where usuario = new.autor and atividade = new.id and not visto;
    return new;
  end if;
  select * into av from avisos where usuario = new.autor and atividade = new.id and not visto limit 1;
  if new.dia is null then
    -- voltou para "a definir": o aviso não lido deixa de valer
    delete from avisos where usuario = new.autor and atividade = new.id and not visto;
    return new;
  end if;
  if old.dia is not distinct from new.dia and old.mes is not distinct from new.mes
     and old.horario is not distinct from new.horario then
    return new;
  end if;
  if found then
    t := av.tipo;
    d := av.dados;
    delete from avisos where id = av.id;
  else
    t := case when old.dia is null then 'agendada' else 'remarcada' end;
    d := jsonb_build_object('antes_mes', old.mes, 'antes_dia', old.dia, 'antes_horario', old.horario);
  end if;
  insert into avisos (usuario, atividade, tipo, dados)
  values (new.autor, new.id, t, d || jsonb_build_object('nome', new.nome, 'mes', new.mes, 'dia', new.dia, 'horario', new.horario));
  return new;
end $$;

drop trigger if exists atividades_aviso on public.atividades;
create trigger atividades_aviso after update on public.atividades
for each row execute function public.atividades_aviso();

alter table public.avisos enable row level security;
drop policy if exists "avisos_ver" on public.avisos;
drop policy if exists "avisos_editar" on public.avisos;
drop policy if exists "avisos_excluir" on public.avisos;
create policy "avisos_ver" on public.avisos for select to authenticated using (usuario = auth.uid());
create policy "avisos_editar" on public.avisos for update to authenticated using (usuario = auth.uid()) with check (usuario = auth.uid());
create policy "avisos_excluir" on public.avisos for delete to authenticated using (usuario = auth.uid());

-- O líder só lê, marca como visto ou apaga os próprios avisos (quem cria é o gatilho).
revoke all on table public.avisos from anon, authenticated;
grant select, delete on table public.avisos to authenticated;
grant update (visto) on table public.avisos to authenticated;

-- A aprovação de um pedido já gera a resposta do pedido; não duplica com aviso.
create or replace function public.resolver_solicitacao(p_id uuid, p_aprovar boolean, p_dia int default null, p_horario text default null, p_resposta text default '')
returns void language plpgsql security definer set search_path = public as $$
declare s solicitacoes; a atividades;
begin
  if not eh_admin() then raise exception 'Só o administrador pode responder solicitações.' using errcode = '42501'; end if;
  select * into s from solicitacoes where id = p_id for update;
  if not found or s.status <> 'pendente' then raise exception 'Solicitação não encontrada ou já respondida.'; end if;
  perform set_config('app.sem_aviso', '1', true);
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
  perform set_config('app.sem_aviso', '', true);
  update solicitacoes set
    status = case when p_aprovar then 'aprovado' else 'recusado' end,
    resposta = left(coalesce(p_resposta, ''), 300),
    final = case when p_aprovar and s.tipo = 'alterar' then jsonb_build_object('nome', a.nome, 'mes', a.mes, 'dia', a.dia, 'horario', a.horario) end,
    resolvido = now(), resolvido_por = auth.uid(), visto = false
  where id = p_id;
end $$;
revoke all on function public.resolver_solicitacao(uuid, boolean, int, text, text) from public;
grant execute on function public.resolver_solicitacao(uuid, boolean, int, text, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.avisos;
exception when others then
  raise notice 'Tempo real: avisos já estava ativada.';
end $$;

-- =====================================================================
--  Reforço de segurança
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- 1) Atividades: só líderes aprovados e administradores leem.
--    (Quem entrou com Google mas ainda não foi aprovado não vê nada;
--     o calendário público continua aberto via calendario_publico().)
drop policy if exists "atividades_ver" on public.atividades;
create policy "atividades_ver" on public.atividades for select to authenticated
  using (eh_admin() or minha_org() is not null);

-- 1b) Correção: mudar o nome no cadastro atualiza o "marcada por" mesmo
--     em atividades já agendadas.
create or replace function public.atividades_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  fim   date;
  lider boolean := auth.uid() is not null and not eh_admin();
  v_nome text;
begin
  -- Atualização interna vinda de outro gatilho (ex.: líder mudou o nome no
  -- cadastro e o "marcada por" acompanha): só o nome do autor muda.
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    v_nome := new.autor_nome;
    new := old;
    new.autor_nome := v_nome;
    return new;
  end if;
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

-- 2) Funções de gatilho: ninguém chama direto (os gatilhos continuam funcionando).
revoke execute on function public.atividades_antes()   from public, anon, authenticated;
revoke execute on function public.atividades_aviso()   from public, anon, authenticated;
revoke execute on function public.perfis_antes()       from public, anon, authenticated;
revoke execute on function public.perfis_depois()      from public, anon, authenticated;
revoke execute on function public.solicitacoes_antes() from public, anon, authenticated;

-- 3) Funções de apoio das regras: só usuários logados (as regras precisam delas).
revoke execute on function public.eh_admin()  from public, anon;
revoke execute on function public.eh_dono()   from public, anon;
revoke execute on function public.minha_org() from public, anon;
grant  execute on function public.eh_admin(), public.eh_dono(), public.minha_org() to authenticated;

-- 4) Respostas a pedidos: só logados (a função ainda confere se é admin).
revoke execute on function public.resolver_solicitacao(uuid, boolean, int, text, text) from public, anon;
grant  execute on function public.resolver_solicitacao(uuid, boolean, int, text, text) to authenticated;

-- 5) Calendário público continua aberto a todos (é o link público).
grant execute on function public.calendario_publico() to anon, authenticated;

-- =====================================================================
--  Ano configurável, prazo de planejamento e histórico de mudanças
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
--  (Depende de seguranca.sql já ter sido rodado.)
-- =====================================================================

-- 1) Configurações da agenda (ano e prazo). Todos leem; só o dono muda.
create table if not exists public.config (
  chave      text primary key check (chave in ('ano','prazo')),
  valor      jsonb not null default 'null'::jsonb,
  atualizado timestamptz not null default now(),
  por        uuid
);
insert into public.config (chave, valor) values ('ano', '2027'::jsonb), ('prazo', 'null'::jsonb)
on conflict (chave) do nothing;

create or replace function public.config_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare a int; p date;
begin
  if new.chave = 'ano' then
    begin a := (new.valor #>> '{}')::int; exception when others then a := null; end;
    if a is null or a < 2026 or a > 2100 then
      raise exception 'Ano inválido.' using errcode = '22023';
    end if;
    new.valor := to_jsonb(a);
  elsif new.chave = 'prazo' then
    if new.valor is null or jsonb_typeof(new.valor) = 'null' or (new.valor #>> '{}') = '' then
      new.valor := 'null'::jsonb;
    else
      begin p := (new.valor #>> '{}')::date; exception when others then p := null; end;
      if p is null then raise exception 'Data do prazo inválida.' using errcode = '22023'; end if;
      new.valor := to_jsonb(to_char(p, 'YYYY-MM-DD'));
    end if;
  end if;
  new.atualizado := now();
  new.por := auth.uid();
  return new;
end $$;
drop trigger if exists config_antes on public.config;
create trigger config_antes before insert or update on public.config
for each row execute function public.config_antes();

alter table public.config enable row level security;
drop policy if exists "config_ver" on public.config;
drop policy if exists "config_editar" on public.config;
create policy "config_ver" on public.config for select to anon, authenticated using (true);
create policy "config_editar" on public.config for update to authenticated using (eh_dono()) with check (eh_dono());
revoke all on table public.config from anon, authenticated;
grant select on table public.config to anon, authenticated;
grant update (valor) on table public.config to authenticated;

create or replace function public.ano_agenda() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (valor #>> '{}')::int from config where chave = 'ano'), 2027);
$$;
create or replace function public.prazo_agenda() returns date
language sql stable security definer set search_path = public as $$
  select (select (valor #>> '{}')::date from config where chave = 'prazo' and jsonb_typeof(valor) = 'string');
$$;

-- 2) Cada atividade pertence a um ano (as de anos anteriores ficam guardadas).
alter table public.atividades add column if not exists ano smallint;
update public.atividades set ano = 2027 where ano is null;
alter table public.atividades alter column ano set default public.ano_agenda();
alter table public.atividades alter column ano set not null;

-- 3) Regras da atividade, agora com ano configurável e prazo de planejamento.
create or replace function public.atividades_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  fim   date;
  v_ano int;
  prazo date := prazo_agenda();
  lider boolean := auth.uid() is not null and not eh_admin();
  v_nome text;
begin
  -- Atualização interna vinda de outro gatilho (ex.: nome do autor no cadastro).
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    v_nome := new.autor_nome;
    new := old;
    new.autor_nome := v_nome;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ano := ano_agenda();
  else
    new.ano := old.ano;
  end if;
  v_ano := new.ano;
  if lider and tg_op = 'UPDATE' and old.ano <> ano_agenda() then
    raise exception 'Esta atividade é de outro ano e não pode mais ser alterada.' using errcode = 'P0001';
  end if;
  if lider and tg_op = 'INSERT' and prazo is not null and hoje > prazo then
    raise exception 'O prazo para propor atividades terminou em %. Fale com o administrador.', to_char(prazo, 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'prazo_planejamento';
  end if;
  if lider and tg_op = 'UPDATE' and old.dia is not null then
    raise exception 'Esta atividade já está agendada. Para alterar ou cancelar, envie uma solicitação ao administrador.' using errcode = 'P0001', hint = 'agendada';
  end if;
  if lider and (tg_op = 'INSERT' or new.mes <> old.mes) then
    fim := (make_date(v_ano, new.mes + 1, 1) + interval '1 month - 1 day')::date;
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
  if new.dia is not null and new.dia > extract(day from (make_date(v_ano, new.mes + 1, 1) + interval '1 month - 1 day')) then
    raise exception 'O dia % não existe nesse mês.', new.dia using errcode = '22008';
  end if;
  return new;
end $$;

-- 4) Calendário público: só o ano atual da agenda.
drop function if exists public.calendario_publico();
create function public.calendario_publico()
returns table (id uuid, mes smallint, dia smallint, horario text, nome text, org text, detalhes text)
language sql stable security definer set search_path = public as $$
  select id, mes, dia, horario, nome, org, detalhes
  from atividades
  where dia is not null and ano = ano_agenda()
  order by mes, dia, horario nulls last, criado;
$$;

-- 5) Histórico de mudanças (só administradores leem; só os gatilhos escrevem).
create table if not exists public.historico (
  id        bigserial primary key,
  quando    timestamptz not null default now(),
  quem      uuid,
  quem_nome text not null default '',
  acao      text not null,
  origem    text not null default '',
  atividade uuid,
  nome      text not null default '',
  org       text,
  ano       smallint,
  antes     jsonb,
  depois    jsonb,
  detalhe   text not null default ''
);
create index if not exists historico_quando on public.historico (quando desc);

create or replace function public.quem_agora() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif((select nome from perfis where id = auth.uid()), ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    nullif(auth.jwt() ->> 'email', ''),
    'Sistema');
$$;

create or replace function public.atividades_hist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a jsonb; d jsonb; ac text; r atividades;
  pedido boolean := coalesce(current_setting('app.sem_aviso', true), '') = '1';
begin
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and not pedido then
    return null;  -- sincronização interna (nome do autor)
  end if;
  if tg_op <> 'INSERT' then
    a := jsonb_build_object('nome', old.nome, 'mes', old.mes, 'dia', old.dia, 'horario', old.horario, 'org', old.org, 'detalhes', old.detalhes);
  end if;
  if tg_op <> 'DELETE' then
    d := jsonb_build_object('nome', new.nome, 'mes', new.mes, 'dia', new.dia, 'horario', new.horario, 'org', new.org, 'detalhes', new.detalhes);
  end if;
  if tg_op = 'INSERT' then ac := 'criou'; r := new;
  elsif tg_op = 'DELETE' then ac := 'excluiu'; r := old;
  else
    r := new;
    if a = d then return null; end if;
    if old.dia is null and new.dia is not null then ac := 'agendou';
    elsif old.dia is not null and new.dia is null then ac := 'tirou a data';
    elsif old.dia is distinct from new.dia or old.mes is distinct from new.mes or old.horario is distinct from new.horario then ac := 'remarcou';
    else ac := 'editou';
    end if;
  end if;
  insert into historico (quem, quem_nome, acao, origem, atividade, nome, org, ano, antes, depois)
  values (auth.uid(), quem_agora(), ac, case when pedido then 'pedido aprovado' else '' end,
          r.id, r.nome, r.org, r.ano, a, d);
  return null;
end $$;
drop trigger if exists atividades_hist on public.atividades;
create trigger atividades_hist after insert or update or delete on public.atividades
for each row execute function public.atividades_hist();

create or replace function public.solicitacoes_hist() returns trigger
language plpgsql security definer set search_path = public as $$
declare at atividades;
begin
  select * into at from atividades where id = new.atividade;
  if tg_op = 'INSERT' then
    insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, antes, depois, detalhe)
    values (auth.uid(), quem_agora(), case when new.tipo = 'cancelar' then 'pediu cancelamento' else 'pediu alteração' end,
            new.atividade, coalesce(new.antes ->> 'nome', at.nome, ''), coalesce(new.antes ->> 'org', at.org), at.ano,
            new.antes, new.depois, new.motivo);
  elsif new.status = 'recusado' and old.status = 'pendente' then
    insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, antes, depois, detalhe)
    values (auth.uid(), quem_agora(), case when new.tipo = 'cancelar' then 'recusou o cancelamento' else 'recusou a alteração' end,
            new.atividade, coalesce(new.antes ->> 'nome', at.nome, ''), coalesce(new.antes ->> 'org', at.org), at.ano,
            new.antes, new.depois, new.resposta);
  end if;
  return null;
end $$;
drop trigger if exists solicitacoes_hist on public.solicitacoes;
create trigger solicitacoes_hist after insert or update on public.solicitacoes
for each row execute function public.solicitacoes_hist();

alter table public.historico enable row level security;
drop policy if exists "historico_ver" on public.historico;
create policy "historico_ver" on public.historico for select to authenticated using (eh_admin());
revoke all on table public.historico from anon, authenticated;
grant select on table public.historico to authenticated;
revoke all on sequence public.historico_id_seq from anon, authenticated;

-- 6) Funções internas fechadas; as de consulta ficam para quem está logado.
revoke execute on function public.config_antes()       from public, anon, authenticated;
revoke execute on function public.atividades_antes()   from public, anon, authenticated;
revoke execute on function public.atividades_hist()    from public, anon, authenticated;
revoke execute on function public.solicitacoes_hist()  from public, anon, authenticated;
revoke execute on function public.quem_agora()         from public, anon, authenticated;
revoke execute on function public.ano_agenda()         from public, anon;
revoke execute on function public.prazo_agenda()       from public, anon;
grant  execute on function public.ano_agenda(), public.prazo_agenda() to authenticated;
revoke all on function public.calendario_publico() from public;
grant execute on function public.calendario_publico() to anon, authenticated;

-- 7) Tempo real para as configurações (todos veem o novo ano/prazo na hora).
do $$
begin
  alter publication supabase_realtime add table public.config;
exception when others then
  raise notice 'Tempo real: config já estava ativada.';
end $$;

-- =====================================================================
--  Organizações especiais: Estaca Ceilândia e Igreja Geral
--  (só o administrador marca; reservam o dia no calendário)
--  + eventos mundiais da Igreja em 2027 (Church News, 25/09/2026)
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- 1) Atividades aceitam as duas novas organizações.
--    (Cadastro de líderes e aprovações continuam só com as 6 da ala.)
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.atividades'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%org%primaria%'
  loop
    execute format('alter table public.atividades drop constraint %I', c);
  end loop;
end $$;
alter table public.atividades add constraint atividades_org_check
  check (org in ('primaria','socorro','elderes','rapazes','mocas','escola','estaca','geral'));

-- 2) Só administradores criam ou alteram atividades da Estaca e da Igreja Geral.
create or replace function public.atividades_antes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  fim   date;
  v_ano int;
  prazo date := prazo_agenda();
  lider boolean := auth.uid() is not null and not eh_admin();
  v_nome text;
begin
  -- Atualização interna vinda de outro gatilho (ex.: nome do autor no cadastro).
  if tg_op = 'UPDATE' and pg_trigger_depth() > 1 then
    v_nome := new.autor_nome;
    new := old;
    new.autor_nome := v_nome;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.ano := ano_agenda();
  else
    new.ano := old.ano;
  end if;
  v_ano := new.ano;
  if lider and (new.org in ('estaca','geral') or (tg_op = 'UPDATE' and old.org in ('estaca','geral'))) then
    raise exception 'Atividades da Estaca Ceilândia e da Igreja Geral só podem ser marcadas pelo administrador.' using errcode = '42501';
  end if;
  if lider and tg_op = 'UPDATE' and old.ano <> ano_agenda() then
    raise exception 'Esta atividade é de outro ano e não pode mais ser alterada.' using errcode = 'P0001';
  end if;
  if lider and tg_op = 'INSERT' and prazo is not null and hoje > prazo then
    raise exception 'O prazo para propor atividades terminou em %. Fale com o administrador.', to_char(prazo, 'DD/MM/YYYY')
      using errcode = 'P0001', hint = 'prazo_planejamento';
  end if;
  if lider and tg_op = 'UPDATE' and old.dia is not null then
    raise exception 'Esta atividade já está agendada. Para alterar ou cancelar, envie uma solicitação ao administrador.' using errcode = 'P0001', hint = 'agendada';
  end if;
  if lider and (tg_op = 'INSERT' or new.mes <> old.mes) then
    fim := (make_date(v_ano, new.mes + 1, 1) + interval '1 month - 1 day')::date;
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
  if new.dia is not null and new.dia > extract(day from (make_date(v_ano, new.mes + 1, 1) + interval '1 month - 1 day')) then
    raise exception 'O dia % não existe nesse mês.', new.dia using errcode = '22008';
  end if;
  return new;
end $$;
revoke execute on function public.atividades_antes() from public, anon, authenticated;

-- 3) Eventos e transmissões mundiais da Igreja em 2027 (horários de Brasília).
--    Fonte: https://pt.thechurchnews.com/membros/2026/09/25/igreja-anuncia-datas-transmissoes-eventos-2027/
insert into public.atividades (mes, dia, horario, nome, org, detalhes, ano)
select v.mes, v.dia, v.horario, v.nome, 'geral', v.detalhes, 2027
from (values
  (1, 7,  '22:00', 'Devocional Mundial para Jovens Adultos', 'Com o élder Ronald A. Rasband. Transmissão às 18h de Salt Lake City (22h em Brasília).'),
  (2, 6,  '17:30', 'Dia de Descoberta Familiar (RootsTech)', 'Transmissão com mensagem de um apóstolo, às 13h30 de Salt Lake City (17h30 em Brasília). Ao vivo ou sob demanda.'),
  (2, 6,  null,    'Devocional Mundial da Sociedade de Socorro', 'Horário ainda não divulgado.'),
  (2, 28, null,    'Domingo de Páscoa', 'Reunião sacramental especial de Páscoa em toda a Igreja.'),
  (3, 3,  '13:00', 'Conferência Geral (sábado)', 'Transmissão ao vivo. Sessões às 10h e 14h de Salt Lake City (13h e 17h em Brasília).'),
  (3, 4,  '13:00', 'Conferência Geral (domingo)', 'Transmissão ao vivo. Sessões às 10h e 14h de Salt Lake City (13h e 17h em Brasília).'),
  (3, 10, null,    'Abertura da Celebração do Templo de Salt Lake', 'Evento presencial e virtual. A celebração vai até 1º de outubro.'),
  (4, 2,  '21:00', 'Devocional Mundial para Jovens Adultos', 'Com o élder Ronald A. Rasband. Transmissão às 18h de Salt Lake City (21h em Brasília).'),
  (5, 10, null,    'Conferência de Educadores Religiosos', 'Transmissão ao vivo ou sob demanda (10 e 11 de junho).'),
  (5, 11, null,    'Conferência de Educadores Religiosos', 'Transmissão ao vivo ou sob demanda (10 e 11 de junho).'),
  (9, 2,  '13:00', 'Conferência Geral (sábado)', 'Transmissão ao vivo. Sessões às 10h e 14h de Salt Lake City (13h e 17h em Brasília).'),
  (9, 3,  '13:00', 'Conferência Geral (domingo)', 'Transmissão ao vivo. Sessões às 10h e 14h de Salt Lake City (13h e 17h em Brasília).'),
  (10, 7, '22:00', 'Devocional Mundial para Jovens Adultos', 'Com o élder Ronald A. Rasband. Transmissão às 18h de Salt Lake City (22h em Brasília; os EUA já saíram do horário de verão).'),
  (11, 5, null,    'Devocional de Natal da Primeira Presidência', 'Transmissão para toda a Igreja. Horário ainda não divulgado.')
) as v(mes, dia, horario, nome, detalhes)
where not exists (
  select 1 from public.atividades a
  where a.org = 'geral' and a.ano = 2027 and a.mes = v.mes and a.dia = v.dia and a.nome = v.nome
);
