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
