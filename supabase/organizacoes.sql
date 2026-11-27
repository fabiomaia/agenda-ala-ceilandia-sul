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
