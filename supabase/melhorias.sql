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
