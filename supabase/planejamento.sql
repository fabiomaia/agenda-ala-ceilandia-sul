-- =====================================================================
--  Planejamento, relatório, orçamento, espaços, resumo semanal
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

-- 1) Planejamento da atividade: espaços do prédio, orçamento previsto e checklist
create table if not exists public.planos (
  atividade  uuid primary key references public.atividades (id) on delete cascade,
  espacos    text[] not null default '{}'
             check (espacos <@ array['capela','salao','salas','cozinha','patio','batisterio']::text[]),
  orcamento  numeric(10,2) check (orcamento is null or (orcamento >= 0 and orcamento <= 1000000)),
  modelo     text not null default '' check (char_length(modelo) <= 40),
  checklist  jsonb not null default '[]'::jsonb
             check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  atualizado timestamptz not null default now(),
  por        uuid,
  por_nome   text not null default ''
);

create or replace function public.planos_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.atividade := old.atividade; end if;
  new.espacos := coalesce((select array_agg(distinct x order by x) from unnest(new.espacos) x), '{}');
  new.modelo := btrim(coalesce(new.modelo, ''));
  if jsonb_typeof(new.checklist) is distinct from 'array' then new.checklist := '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('t', left(btrim(e->>'t'), 120), 'ok', coalesce(e->'ok' = 'true'::jsonb, false)))
           filter (where btrim(coalesce(e->>'t', '')) <> ''), '[]'::jsonb)
    into new.checklist from jsonb_array_elements(new.checklist) e;
  new.atualizado := now();
  new.por        := auth.uid();
  new.por_nome   := quem_agora();
  return new;
end $$;
drop trigger if exists planos_antes on public.planos;
create trigger planos_antes before insert or update on public.planos
for each row execute function public.planos_antes();

create or replace function public.reais(v numeric) returns text
language sql immutable set search_path = public as $$
  select case when v is null then '—'
              else 'R$ ' || replace(replace(replace(to_char(v, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') end;
$$;

create or replace function public.planos_hist() returns trigger
language plpgsql security definer set search_path = public as $$
declare at atividades;
begin
  if tg_op = 'UPDATE' and old.espacos = new.espacos and old.orcamento is not distinct from new.orcamento then
    return null;
  end if;
  select * into at from atividades where id = new.atividade;
  insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, detalhe)
  values (auth.uid(), quem_agora(), 'atualizou o planejamento de', new.atividade, coalesce(at.nome, ''), at.org, at.ano,
          'Espaços: ' || coalesce(nullif(array_to_string(array(
            select case x when 'capela' then 'Capela' when 'salao' then 'Salão cultural' when 'salas' then 'Salas de aula'
                          when 'cozinha' then 'Cozinha' when 'patio' then 'Área externa' when 'batisterio' then 'Batistério' else x end
            from unnest(new.espacos) x), ', '), ''), '—') || ' · Orçamento: ' || reais(new.orcamento));
  return null;
end $$;
drop trigger if exists planos_hist on public.planos;
create trigger planos_hist after insert or update on public.planos
for each row execute function public.planos_hist();

alter table public.planos enable row level security;
drop policy if exists "planos_ver" on public.planos;
drop policy if exists "planos_criar" on public.planos;
drop policy if exists "planos_editar" on public.planos;
drop policy if exists "planos_excluir" on public.planos;
create policy "planos_ver"     on public.planos for select to authenticated using (pode_responsaveis(atividade));
create policy "planos_criar"   on public.planos for insert to authenticated with check (pode_responsaveis(atividade));
create policy "planos_editar"  on public.planos for update to authenticated using (pode_responsaveis(atividade)) with check (pode_responsaveis(atividade));
create policy "planos_excluir" on public.planos for delete to authenticated using (eh_admin());
revoke all on table public.planos from anon, authenticated;
grant select, insert, update, delete on table public.planos to authenticated;

-- 2) Relatório depois da atividade: aconteceu?, presença, gasto real, observações
create table if not exists public.relatorios (
  atividade  uuid primary key references public.atividades (id) on delete cascade,
  realizada  boolean not null default true,
  presenca   int check (presenca is null or presenca between 0 and 5000),
  gasto      numeric(10,2) check (gasto is null or (gasto >= 0 and gasto <= 1000000)),
  obs        text not null default '' check (char_length(obs) <= 1000),
  atualizado timestamptz not null default now(),
  por        uuid,
  por_nome   text not null default ''
);

create or replace function public.relatorios_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.atividade := old.atividade; end if;
  new.obs        := btrim(coalesce(new.obs, ''));
  new.atualizado := now();
  new.por        := auth.uid();
  new.por_nome   := quem_agora();
  return new;
end $$;
drop trigger if exists relatorios_antes on public.relatorios;
create trigger relatorios_antes before insert or update on public.relatorios
for each row execute function public.relatorios_antes();

create or replace function public.relatorios_hist() returns trigger
language plpgsql security definer set search_path = public as $$
declare at atividades;
begin
  select * into at from atividades where id = new.atividade;
  insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, detalhe)
  values (auth.uid(), quem_agora(), case when tg_op = 'INSERT' then 'enviou o relatório de' else 'atualizou o relatório de' end,
          new.atividade, coalesce(at.nome, ''), at.org, at.ano,
          case when new.realizada then 'Presença: ' || coalesce(new.presenca::text, '—') || ' · Gasto: ' || reais(new.gasto)
               else 'Não aconteceu' end);
  return null;
end $$;
drop trigger if exists relatorios_hist on public.relatorios;
create trigger relatorios_hist after insert or update on public.relatorios
for each row execute function public.relatorios_hist();

alter table public.relatorios enable row level security;
drop policy if exists "rel_ver" on public.relatorios;
drop policy if exists "rel_criar" on public.relatorios;
drop policy if exists "rel_editar" on public.relatorios;
drop policy if exists "rel_excluir" on public.relatorios;
create policy "rel_ver"     on public.relatorios for select to authenticated using (pode_responsaveis(atividade));
create policy "rel_criar"   on public.relatorios for insert to authenticated with check (pode_responsaveis(atividade));
create policy "rel_editar"  on public.relatorios for update to authenticated using (pode_responsaveis(atividade)) with check (pode_responsaveis(atividade));
create policy "rel_excluir" on public.relatorios for delete to authenticated using (eh_admin());
revoke all on table public.relatorios from anon, authenticated;
grant select, insert, update, delete on table public.relatorios to authenticated;

-- 3) Verba anual de cada organização (o admin define; o líder vê a da sua organização)
create table if not exists public.orcamento_org (
  org   text not null check (org in ('primaria','socorro','elderes','rapazes','mocas','escola')),
  ano   smallint not null check (ano between 2026 and 2100),
  valor numeric(10,2) not null default 0 check (valor >= 0 and valor <= 10000000),
  primary key (org, ano)
);
alter table public.orcamento_org enable row level security;
drop policy if exists "verba_ver" on public.orcamento_org;
drop policy if exists "verba_admin" on public.orcamento_org;
create policy "verba_ver"   on public.orcamento_org for select to authenticated using (eh_admin() or org = minha_org());
create policy "verba_admin" on public.orcamento_org for all to authenticated using (eh_admin()) with check (eh_admin());
revoke all on table public.orcamento_org from anon, authenticated;
grant select, insert, update, delete on table public.orcamento_org to authenticated;

-- 4) Espaços já pedidos no ano (para avisar conflito; não mostra orçamento nem checklist)
create or replace function public.espacos_reservados()
returns table (atividade uuid, mes smallint, dia smallint, horario text, nome text, org text, espacos text[])
language sql stable security definer set search_path = public as $$
  select a.id, a.mes, a.dia, a.horario, a.nome, a.org, p.espacos
  from atividades a join planos p on p.atividade = a.id
  where a.ano = ano_agenda() and cardinality(p.espacos) > 0
    and (eh_admin() or minha_org() is not null);
$$;

-- 5) Registro do "Preciso de ajuda da liderança" (aparece no histórico e no painel)
create or replace function public.registrar_ajuda(p_atividade uuid, p_faltam text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not pode_responsaveis(p_atividade) then
    raise exception 'Você não tem permissão para fazer isso.' using errcode = '42501';
  end if;
  insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, detalhe)
  select auth.uid(), quem_agora(), 'pediu ajuda da liderança para', a.id, a.nome, a.org, a.ano, left(coalesce(p_faltam, ''), 300)
  from atividades a where a.id = p_atividade;
end $$;

-- 6) Lembretes: inclui o "Como foi?" no dia seguinte e os dados do planejamento
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.lembretes_enviados'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%tipo%'
  loop
    execute format('alter table public.lembretes_enviados drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.lembretes_enviados add constraint lembretes_enviados_tipo_check
  check (tipo in ('30d','7d','1d','pos'));

drop function if exists public.lembretes_pendentes(text);
create function public.lembretes_pendentes(p_chave text)
returns table (atividade uuid, tipo text, dias int, para text, lider text, nome text, org text,
               mes int, dia int, ano int, horario text, detalhes text,
               sacerdocio text, capela text, limpeza text,
               orcamento numeric, espacos text[], ck_total int, ck_ok int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not chave_lembretes_ok(p_chave) then
    raise exception 'Chave do robô inválida.' using errcode = '42501';
  end if;
  return query
  with base as (
    select a.*, (make_date(a.ano, a.mes + 1, a.dia) - (now() at time zone 'America/Sao_Paulo')::date) as d
    from atividades a
    where a.dia is not null and a.ano = ano_agenda() and a.org not in ('estaca','geral')
  ), t as (
    select b.*, case when b.d < 0 then 'pos' when b.d = 1 then '1d' when b.d between 2 and 7 then '7d' else '30d' end as tp
    from base b
    where b.d between 1 and 30
       or (b.d between -3 and -1 and not exists (select 1 from relatorios r where r.atividade = b.id))
  ), dest as (
    select t.id as aid, p.email as em, p.nome as nm
    from t join aprovacoes ap on ap.org = t.org and ap.status = 'aprovado'
           join perfis p on p.id = ap.user_id
    where coalesce(p.email, '') <> ''
    union
    select t.id, p.email, p.nome
    from t join perfis p on p.id = t.autor
    where coalesce(p.email, '') <> ''
      and not exists (select 1 from aprovacoes ap2 where ap2.org = t.org and ap2.status = 'aprovado')
  )
  select t.id, t.tp, t.d::int, ds.em, ds.nm, t.nome, t.org, t.mes::int, t.dia::int, t.ano::int, t.horario, t.detalhes,
         coalesce(r.sacerdocio, ''), coalesce(r.capela, ''), coalesce(r.limpeza, ''),
         pl.orcamento, coalesce(pl.espacos, '{}'),
         coalesce(jsonb_array_length(pl.checklist), 0),
         coalesce((select count(*)::int from jsonb_array_elements(pl.checklist) e where e->'ok' = 'true'::jsonb), 0)
  from t join dest ds on ds.aid = t.id
  left join responsaveis r on r.atividade = t.id
  left join planos pl on pl.atividade = t.id
  where not exists (select 1 from lembretes_enviados e
                    where e.atividade = t.id and e.tipo = t.tp and lower(e.para) = lower(ds.em))
  order by t.d, t.nome;
end $$;

create or replace function public.lembrete_enviado(p_chave text, p_atividade uuid, p_tipo text, p_para text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare at atividades;
begin
  if not chave_lembretes_ok(p_chave) then
    raise exception 'Chave do robô inválida.' using errcode = '42501';
  end if;
  insert into lembretes_enviados (atividade, tipo, para) values (p_atividade, p_tipo, lower(p_para))
  on conflict do nothing;
  if found then
    select * into at from atividades where id = p_atividade;
    insert into historico (quem_nome, acao, atividade, nome, org, ano, detalhe)
    values ('Robô de e-mails', 'enviou lembrete de', p_atividade, coalesce(at.nome, ''), at.org, at.ano,
            case p_tipo when '30d' then '1 mês antes' when '7d' then '1 semana antes' when '1d' then '1 dia antes'
                        else 'pedido de relatório (“Como foi?”)' end || ' · para ' || lower(p_para));
  end if;
end $$;

-- 7) Resumo semanal para os administradores (bispado)
create or replace function public.resumo_semanal(p_chave text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_ano int := ano_agenda(); res jsonb;
begin
  if not chave_lembretes_ok(p_chave) then
    raise exception 'Chave do robô inválida.' using errcode = '42501';
  end if;
  with ats as (
    select a.*, make_date(a.ano, a.mes + 1, a.dia) as dt
    from atividades a where a.ano = v_ano and a.dia is not null
  )
  select jsonb_build_object(
    'ano', v_ano,
    'hoje', hoje,
    'para', coalesce((select jsonb_agg(distinct u.email) from admins ad join auth.users u on u.id = ad.user_id
                      where coalesce(u.email, '') <> ''), '[]'::jsonb),
    'semana', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'nome', x.nome, 'org', x.org, 'mes', x.mes, 'dia', x.dia, 'horario', x.horario, 'dias', x.dt - hoje,
        'sacerdocio', coalesce(r.sacerdocio, ''), 'capela', coalesce(r.capela, ''), 'limpeza', coalesce(r.limpeza, ''),
        'espacos', coalesce(pl.espacos, '{}'), 'orcamento', pl.orcamento,
        'ck_total', coalesce(jsonb_array_length(pl.checklist), 0),
        'ck_ok', coalesce((select count(*) from jsonb_array_elements(pl.checklist) e where e->'ok' = 'true'::jsonb), 0))
        order by x.dt, x.horario nulls last)
      from ats x left join responsaveis r on r.atividade = x.id left join planos pl on pl.atividade = x.id
      where x.dt between hoje and hoje + 7), '[]'::jsonb),
    'pedidos', (select count(*) from solicitacoes s where s.status = 'pendente'),
    'sem_dia', (select count(*) from atividades a where a.ano = v_ano and a.dia is null),
    'cadastros', (select count(*) from perfis p where not exists (select 1 from aprovacoes ap where ap.user_id = p.id)),
    'relatorios', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'org', x.org, 'mes', x.mes, 'dia', x.dia) order by x.dt)
      from ats x where x.org not in ('estaca','geral') and x.dt between hoje - 30 and hoje - 1
        and not exists (select 1 from relatorios r where r.atividade = x.id)), '[]'::jsonb),
    'conflitos', coalesce((select jsonb_agg(c order by c->>'data') from (
        select jsonb_build_object('data', x.dt, 'mes', x.mes, 'dia', x.dia, 'espaco', e, 'nomes', jsonb_agg(x.nome order by x.horario nulls last)) as c
        from ats x join planos pl on pl.atividade = x.id cross join unnest(pl.espacos) e
        where x.dt between hoje and hoje + 30
        group by x.dt, x.mes, x.dia, e having count(*) > 1) q), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- 8) Permissões das funções
revoke execute on function public.planos_antes()      from public, anon, authenticated;
revoke execute on function public.planos_hist()       from public, anon, authenticated;
revoke execute on function public.relatorios_antes()  from public, anon, authenticated;
revoke execute on function public.relatorios_hist()   from public, anon, authenticated;
revoke execute on function public.espacos_reservados() from public, anon;
grant  execute on function public.espacos_reservados() to authenticated;
revoke execute on function public.registrar_ajuda(uuid, text) from public, anon;
grant  execute on function public.registrar_ajuda(uuid, text) to authenticated;
revoke execute on function public.lembretes_pendentes(text) from public;
grant  execute on function public.lembretes_pendentes(text) to anon, authenticated;
revoke execute on function public.lembrete_enviado(text, uuid, text, text) from public;
grant  execute on function public.lembrete_enviado(text, uuid, text, text) to anon, authenticated;
revoke execute on function public.resumo_semanal(text) from public;
grant  execute on function public.resumo_semanal(text) to anon, authenticated;

-- 9) Tempo real
do $$
begin
  begin alter publication supabase_realtime add table public.planos; exception when others then null; end;
  begin alter publication supabase_realtime add table public.relatorios; exception when others then null; end;
  begin alter publication supabase_realtime add table public.orcamento_org; exception when others then null; end;
end $$;
