-- =====================================================================
--  Lembretes por e-mail + responsáveis da atividade
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- 1) Responsáveis da atividade (só o líder da organização e os administradores veem)
create table if not exists public.responsaveis (
  atividade  uuid primary key references public.atividades (id) on delete cascade,
  sacerdocio text not null default '' check (char_length(sacerdocio) <= 120),
  capela     text not null default '' check (char_length(capela) <= 120),
  limpeza    text not null default '' check (char_length(limpeza) <= 120),
  atualizado timestamptz not null default now(),
  por        uuid,
  por_nome   text not null default ''
);

create or replace function public.pode_responsaveis(a uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_admin() or exists (
    select 1 from atividades x
    where x.id = a and x.org not in ('estaca','geral')
      and (x.autor = auth.uid() or x.org = minha_org())
  );
$$;

create or replace function public.responsaveis_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.sacerdocio := btrim(coalesce(new.sacerdocio, ''));
  new.capela     := btrim(coalesce(new.capela, ''));
  new.limpeza    := btrim(coalesce(new.limpeza, ''));
  new.atualizado := now();
  new.por        := auth.uid();
  new.por_nome   := quem_agora();
  if tg_op = 'UPDATE' then new.atividade := old.atividade; end if;
  return new;
end $$;
drop trigger if exists responsaveis_antes on public.responsaveis;
create trigger responsaveis_antes before insert or update on public.responsaveis
for each row execute function public.responsaveis_antes();

create or replace function public.responsaveis_hist() returns trigger
language plpgsql security definer set search_path = public as $$
declare at atividades;
begin
  if tg_op = 'UPDATE' and old.sacerdocio = new.sacerdocio and old.capela = new.capela and old.limpeza = new.limpeza then
    return null;
  end if;
  select * into at from atividades where id = new.atividade;
  insert into historico (quem, quem_nome, acao, atividade, nome, org, ano, detalhe)
  values (auth.uid(), quem_agora(), 'definiu responsáveis de', new.atividade, coalesce(at.nome, ''), at.org, at.ano,
          'Sacerdócio: ' || coalesce(nullif(new.sacerdocio, ''), '—') ||
          ' · Capela: ' || coalesce(nullif(new.capela, ''), '—') ||
          ' · Limpeza: ' || coalesce(nullif(new.limpeza, ''), '—'));
  return null;
end $$;
drop trigger if exists responsaveis_hist on public.responsaveis;
create trigger responsaveis_hist after insert or update on public.responsaveis
for each row execute function public.responsaveis_hist();

alter table public.responsaveis enable row level security;
drop policy if exists "resp_ver" on public.responsaveis;
drop policy if exists "resp_criar" on public.responsaveis;
drop policy if exists "resp_editar" on public.responsaveis;
drop policy if exists "resp_excluir" on public.responsaveis;
create policy "resp_ver"     on public.responsaveis for select to authenticated using (pode_responsaveis(atividade));
create policy "resp_criar"   on public.responsaveis for insert to authenticated with check (pode_responsaveis(atividade));
create policy "resp_editar"  on public.responsaveis for update to authenticated using (pode_responsaveis(atividade)) with check (pode_responsaveis(atividade));
create policy "resp_excluir" on public.responsaveis for delete to authenticated using (eh_admin());
revoke all on table public.responsaveis from anon, authenticated;
grant select, insert, update, delete on table public.responsaveis to authenticated;

-- 2) Configuração privada: WhatsApp da liderança para pedidos de ajuda
create table if not exists public.config_priv (
  chave text primary key check (chave in ('whats_ajuda')),
  valor text not null default ''
);
insert into public.config_priv (chave, valor) values ('whats_ajuda', '') on conflict (chave) do nothing;

create or replace function public.config_priv_antes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.valor := regexp_replace(coalesce(new.valor, ''), '\D', '', 'g');
  if new.valor <> '' and char_length(new.valor) not between 10 and 15 then
    raise exception 'WhatsApp inválido: use DDD e número, por exemplo 61 99999-8888.' using errcode = '22023';
  end if;
  if new.valor <> '' and char_length(new.valor) between 10 and 11 then new.valor := '55' || new.valor; end if;
  return new;
end $$;
drop trigger if exists config_priv_antes on public.config_priv;
create trigger config_priv_antes before insert or update on public.config_priv
for each row execute function public.config_priv_antes();

alter table public.config_priv enable row level security;
drop policy if exists "cfgp_ver" on public.config_priv;
drop policy if exists "cfgp_editar" on public.config_priv;
create policy "cfgp_ver"    on public.config_priv for select to authenticated using (eh_admin() or minha_org() is not null);
create policy "cfgp_editar" on public.config_priv for update to authenticated using (eh_dono()) with check (eh_dono());
revoke all on table public.config_priv from anon, authenticated;
grant select on table public.config_priv to authenticated;
grant update (valor) on table public.config_priv to authenticated;

-- 3) Chave secreta do robô de e-mails (só o resumo criptográfico fica guardado)
create table if not exists public.segredos (
  nome   text primary key,
  hash   text not null,
  criado timestamptz not null default now()
);
alter table public.segredos enable row level security;
revoke all on table public.segredos from anon, authenticated;

create or replace function public.gerar_chave_lembretes() returns text
language plpgsql volatile security definer set search_path = public, extensions as $$
declare t text;
begin
  if not eh_dono() then raise exception 'Só o dono pode gerar a chave.' using errcode = '42501'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into segredos (nome, hash) values ('lembretes', encode(extensions.digest(t, 'sha256'), 'hex'))
  on conflict (nome) do update set hash = excluded.hash, criado = now();
  return t;
end $$;

create or replace function public.chave_lembretes_ok(p text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from segredos where nome = 'lembretes'
                 and hash = encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex'));
$$;

create or replace function public.chave_lembretes_criada() returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when eh_dono() then (select criado from segredos where nome = 'lembretes') end;
$$;

-- 4) Registro dos e-mails enviados (evita repetir)
create table if not exists public.lembretes_enviados (
  id        bigserial primary key,
  atividade uuid references public.atividades (id) on delete cascade,
  tipo      text not null check (tipo in ('30d','7d','1d')),
  para      text not null,
  enviado   timestamptz not null default now(),
  unique (atividade, tipo, para)
);
alter table public.lembretes_enviados enable row level security;
drop policy if exists "lemb_ver" on public.lembretes_enviados;
create policy "lemb_ver" on public.lembretes_enviados for select to authenticated using (eh_admin());
revoke all on table public.lembretes_enviados from anon, authenticated;
grant select on table public.lembretes_enviados to authenticated;

-- 5) O que o robô deve enviar hoje (1 mês, 1 semana ou 1 dia antes)
--    Se o dia for marcado em cima da hora, manda só o lembrete que ainda faz sentido.
create or replace function public.lembretes_pendentes(p_chave text)
returns table (atividade uuid, tipo text, dias int, para text, lider text, nome text, org text,
               mes int, dia int, ano int, horario text, detalhes text,
               sacerdocio text, capela text, limpeza text)
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
    select b.*, case when b.d = 1 then '1d' when b.d between 2 and 7 then '7d' else '30d' end as tp
    from base b where b.d between 1 and 30
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
         coalesce(r.sacerdocio, ''), coalesce(r.capela, ''), coalesce(r.limpeza, '')
  from t join dest ds on ds.aid = t.id
  left join responsaveis r on r.atividade = t.id
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
            case p_tipo when '30d' then '1 mês antes' when '7d' then '1 semana antes' else '1 dia antes' end || ' · para ' || lower(p_para));
  end if;
end $$;

-- 6) Permissões das funções
revoke execute on function public.responsaveis_antes()   from public, anon, authenticated;
revoke execute on function public.responsaveis_hist()    from public, anon, authenticated;
revoke execute on function public.config_priv_antes()    from public, anon, authenticated;
revoke execute on function public.chave_lembretes_ok(text) from public, anon, authenticated;
revoke execute on function public.pode_responsaveis(uuid) from public, anon;
grant  execute on function public.pode_responsaveis(uuid) to authenticated;
revoke execute on function public.gerar_chave_lembretes() from public, anon;
grant  execute on function public.gerar_chave_lembretes() to authenticated;
revoke execute on function public.chave_lembretes_criada() from public, anon;
grant  execute on function public.chave_lembretes_criada() to authenticated;
-- o robô usa a chave pública do site + a chave secreta do robô
revoke execute on function public.lembretes_pendentes(text) from public;
grant  execute on function public.lembretes_pendentes(text) to anon, authenticated;
revoke execute on function public.lembrete_enviado(text, uuid, text, text) from public;
grant  execute on function public.lembrete_enviado(text, uuid, text, text) to anon, authenticated;

-- 7) Tempo real para os responsáveis
do $$
begin
  alter publication supabase_realtime add table public.responsaveis;
exception when others then
  raise notice 'Tempo real: responsaveis já estava ativada.';
end $$;
