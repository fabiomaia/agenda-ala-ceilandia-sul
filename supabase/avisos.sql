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
