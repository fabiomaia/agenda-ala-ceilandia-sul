-- =====================================================================
--  Cópia de segurança automática (o robô salva toda semana no Google Drive)
--  Rode uma vez no Supabase → SQL Editor → New query → Run.
-- =====================================================================

create table if not exists public.robo_estado (
  chave text primary key,
  em    timestamptz not null default now()
);
alter table public.robo_estado enable row level security;
revoke all on table public.robo_estado from anon, authenticated;

-- Todos os dados da agenda (menos a chave do robô), para o robô guardar no Drive do dono.
create or replace function public.backup_dados(p_chave text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb;
begin
  if not chave_lembretes_ok(p_chave) then
    raise exception 'Chave do robô inválida.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'site', 'Calendário de Atividades Ala Ceilândia Sul',
    'ano', ano_agenda(),
    'gerado', now(),
    'versao', 2,
    'tabelas', jsonb_build_object(
      'atividades',         coalesce((select jsonb_agg(to_jsonb(t) order by t.criado) from atividades t), '[]'),
      'solicitacoes',       coalesce((select jsonb_agg(to_jsonb(t) order by t.criado) from solicitacoes t), '[]'),
      'avisos',             coalesce((select jsonb_agg(to_jsonb(t)) from avisos t), '[]'),
      'perfis',             coalesce((select jsonb_agg(to_jsonb(t)) from perfis t), '[]'),
      'aprovacoes',         coalesce((select jsonb_agg(to_jsonb(t)) from aprovacoes t), '[]'),
      'admins',             coalesce((select jsonb_agg(to_jsonb(t)) from admins t), '[]'),
      'config',             coalesce((select jsonb_agg(to_jsonb(t)) from config t), '[]'),
      'config_priv',        coalesce((select jsonb_agg(to_jsonb(t)) from config_priv t), '[]'),
      'responsaveis',       coalesce((select jsonb_agg(to_jsonb(t)) from responsaveis t), '[]'),
      'planos',             coalesce((select jsonb_agg(to_jsonb(t)) from planos t), '[]'),
      'relatorios',         coalesce((select jsonb_agg(to_jsonb(t)) from relatorios t), '[]'),
      'orcamento_org',      coalesce((select jsonb_agg(to_jsonb(t)) from orcamento_org t), '[]'),
      'lembretes_enviados', coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from lembretes_enviados t), '[]'),
      'historico',          coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from historico t), '[]')
    )
  ) into res;
  insert into robo_estado (chave, em) values ('ultimo_backup', now())
  on conflict (chave) do update set em = excluded.em;
  return res;
end $$;

-- Quando foi a última cópia automática (só o dono vê).
create or replace function public.ultimo_backup() returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when eh_dono() then (select em from robo_estado where chave = 'ultimo_backup') end;
$$;

revoke execute on function public.backup_dados(text) from public;
grant  execute on function public.backup_dados(text) to anon, authenticated;
revoke execute on function public.ultimo_backup() from public, anon;
grant  execute on function public.ultimo_backup() to authenticated;
