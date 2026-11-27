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
