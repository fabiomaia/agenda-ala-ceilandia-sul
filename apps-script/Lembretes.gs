/**
 * Robô de lembretes — Calendário de Atividades Ala Ceilândia Sul
 *
 * Todo dia às 8h (horário de Brasília) envia aos líderes os lembretes de
 * 1 mês, 1 semana e 1 dia antes de cada atividade da organização, e o
 * "Como foi?" no dia seguinte. Todo domingo às 7h envia o resumo da semana
 * aos administradores (bispado) e às 6h salva uma cópia de segurança dos dados
 * no Google Drive (pasta "Agenda da Ala - cópias de segurança", guarda as 12 últimas).
 *
 * Instalação (uma vez):
 *  1. Configurações do projeto (engrenagem) → Propriedades do script →
 *     adicionar CHAVE_LEMBRETES com a chave gerada no site (Membros → Robô de e-mails).
 *  2. Escolher a função "instalar" e clicar em Executar (autorizar com a sua conta Google).
 *  3. Opcional: executar "testar" para receber os modelos no seu e-mail e
 *     "testarResumo" para receber o resumo semanal com os dados de verdade.
 */

const SITE = 'https://calendario-ala-ceilandia-sul.vercel.app/';
const REMETENTE = 'Agenda da Ala Ceilândia Sul';
const COR = '#163f3a';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const ORGS = {primaria:'Primária',socorro:'Sociedade de Socorro',elderes:'Quórum de Élderes',rapazes:'Rapazes',mocas:'Moças',escola:'Escola Dominical'};
const DA = {primaria:'da',socorro:'da',elderes:'do',rapazes:'dos',mocas:'das',escola:'da'};
const FEM = ['primaria','socorro','mocas'];
const ESPACOS = {capela:'Capela',salao:'Salão cultural',salas:'Salas de aula',cozinha:'Cozinha',patio:'Área externa',batisterio:'Batistério'};
const ORGS_TODAS = Object.assign({estaca:'Estaca Ceilândia', geral:'Igreja Geral'}, ORGS);

/* ---------------- rotina diária ---------------- */

function enviarLembretes() {
  const c = config_(), k = chave_();
  const lista = rpc_(c, 'lembretes_pendentes', {p_chave: k}) || [];
  let enviados = 0;
  const erros = [];
  lista.forEach(function (l) {
    try {
      const m = montarEmail(l);
      MailApp.sendEmail({to: l.para, subject: m.assunto, htmlBody: m.html, body: m.texto, name: REMETENTE});
      rpc_(c, 'lembrete_enviado', {p_chave: k, p_atividade: l.atividade, p_tipo: l.tipo, p_para: l.para});
      enviados++;
    } catch (e) {
      erros.push(l.para + ' — ' + l.nome + ': ' + e.message);
    }
  });
  console.log('Lembretes enviados: ' + enviados + ' de ' + lista.length);
  if (erros.length) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '⚠️ Robô de lembretes: ' + erros.length + ' erro(s)',
      'Não foi possível enviar alguns lembretes:\n\n' + erros.join('\n'));
  }
}

/** Cria (ou recria) os agendamentos: lembretes todo dia às 8h e resumo aos domingos às 7h. */
function instalar() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return ['enviarLembretes', 'enviarResumo', 'fazerBackup'].indexOf(t.getHandlerFunction()) >= 0; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarLembretes').timeBased().everyDays(1).atHour(8).inTimezone('America/Sao_Paulo').create();
  ScriptApp.newTrigger('enviarResumo').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(7).inTimezone('America/Sao_Paulo').create();
  ScriptApp.newTrigger('fazerBackup').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(6).inTimezone('America/Sao_Paulo').create();
  const n = (rpc_(config_(), 'lembretes_pendentes', {p_chave: chave_()}) || []).length;
  console.log('Pronto! Lembretes todo dia às 8h, cópia de segurança aos domingos às 6h e resumo às 7h. Lembretes para enviar hoje: ' + n);
}

/* ---------------- cópia de segurança no Google Drive ---------------- */
// Usa a API do Drive com a permissão mínima (drive.file): o robô só enxerga
// a pasta e os arquivos que ele mesmo criou.

const PASTA_BACKUP = 'Agenda da Ala - cópias de segurança';
const MANTER_BACKUPS = 12;

/** Todo domingo: salva todos os dados da agenda num arquivo .json no seu Drive. */
function fazerBackup() {
  try {
    const dados = rpc_(config_(), 'backup_dados', {p_chave: chave_()});
    const pasta = pastaBackup_();
    const nome = 'backup-agenda-ala-' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd-HHmm') + '.json';
    const limite = 'agenda' + Date.now();
    const corpo = '--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify({name: nome, parents: [pasta], mimeType: 'application/json'})
      + '\r\n--' + limite + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
      + JSON.stringify(dados, null, 1) + '\r\n--' + limite + '--';
    drive_('post', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', corpo, 'multipart/related; boundary=' + limite);
    const lista = drive_('get', 'https://www.googleapis.com/drive/v3/files?pageSize=200&orderBy=createdTime%20desc&fields=files(id,name)&q='
      + encodeURIComponent("'" + pasta + "' in parents and trashed = false")).files || [];
    const antigos = lista.filter(function (f) { return /^backup-agenda-ala-/.test(f.name); }).slice(MANTER_BACKUPS);
    antigos.forEach(function (f) { drive_('patch', 'https://www.googleapis.com/drive/v3/files/' + f.id, JSON.stringify({trashed: true}), 'application/json'); });
    const n = (dados.tabelas && dados.tabelas.atividades || []).length;
    console.log('Cópia salva no Drive: ' + nome + ' (' + n + ' atividades). Cópias antigas apagadas: ' + antigos.length);
  } catch (e) {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(), '⚠️ Robô da agenda: cópia de segurança falhou',
      'Não foi possível salvar a cópia de segurança semanal no Google Drive.\n\nErro: ' + e.message
      + '\n\nVocê pode baixar uma cópia manual no site: Membros → Cópia de segurança.');
    throw e;
  }
}

function pastaBackup_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PASTA_BACKUP');
  if (id) {
    try {
      const f = drive_('get', 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=id,trashed');
      if (f && !f.trashed) return id;
    } catch (e) { /* pasta apagada: cria outra */ }
  }
  const nova = drive_('post', 'https://www.googleapis.com/drive/v3/files?fields=id',
    JSON.stringify({name: PASTA_BACKUP, mimeType: 'application/vnd.google-apps.folder'}), 'application/json');
  props.setProperty('PASTA_BACKUP', nova.id);
  return nova.id;
}

function drive_(metodo, url, corpo, tipo) {
  const op = {method: metodo, muteHttpExceptions: true, headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()}};
  if (corpo !== undefined) { op.payload = Utilities.newBlob(corpo).getBytes(); op.contentType = tipo; }  // UTF-8 (acentos)
  const r = UrlFetchApp.fetch(url, op);
  const t = r.getContentText();
  if (r.getResponseCode() >= 300) throw new Error('Google Drive respondeu ' + r.getResponseCode() + ': ' + t.slice(0, 300));
  return t ? JSON.parse(t) : null;
}

/* ---------------- resumo semanal ---------------- */

/** Todo domingo: resumo da semana para os administradores. */
function enviarResumo() {
  const r = rpc_(config_(), 'resumo_semanal', {p_chave: chave_()});
  const para = (r && r.para) || [];
  if (!para.length) { console.log('Nenhum administrador com e-mail.'); return; }
  const m = montarResumo(r);
  MailApp.sendEmail({to: para.join(','), subject: m.assunto, htmlBody: m.html, body: m.texto, name: REMETENTE});
  console.log('Resumo enviado para ' + para.join(', '));
}

/** Envia o resumo desta semana (dados de verdade) só para você. */
function testarResumo() {
  const r = rpc_(config_(), 'resumo_semanal', {p_chave: chave_()});
  const m = montarResumo(r);
  const eu = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({to: eu, subject: '[TESTE] ' + m.assunto, htmlBody: m.html, body: m.texto, name: REMETENTE});
  console.log('Resumo de teste enviado para ' + eu + ' (iria para: ' + ((r && r.para) || []).join(', ') + ')');
}

function montarResumo(r) {
  const sem = r.semana || [], rel = r.relatorios || [], cf = r.conflitos || [];
  const linhas = [];
  const dataAt = function (a) { return dataLonga_({ano: r.ano, mes: a.mes, dia: a.dia}) + (a.horario ? ', ' + a.horario : ''); };
  linhas.push(['p', 'Bom dia! Este é o resumo da agenda da ala para os próximos 7 dias.']);
  linhas.push(['h', '📅 Atividades da semana (' + sem.length + ')']);
  if (!sem.length) linhas.push(['li', 'Nenhuma atividade marcada para esta semana.']);
  sem.forEach(function (a) {
    const esp = (a.espacos || []).map(function (e) { return ESPACOS[e] || e; }).join(', ');
    const falta = [['sacerdocio', 'Sacerdócio'], ['capela', 'Capela'], ['limpeza', 'Limpeza']].filter(function (x) { return !a[x[0]]; }).map(function (x) { return x[1]; });
    const especial = a.org === 'estaca' || a.org === 'geral';
    let t = '<b>' + esc_(a.nome) + '</b> · ' + esc_(ORGS_TODAS[a.org] || '') + ' · ' + dataAt(a);
    if (!especial) t += '<br>' + (falta.length ? '⚠️ Falta responsável: ' + falta.join(', ') : '✅ Responsáveis definidos')
      + (esp ? ' · 🏛️ ' + esc_(esp) : '') + (a.orcamento != null ? ' · 💰 ' + reais_(a.orcamento) : '')
      + (a.ck_total ? ' · 📋 ' + a.ck_ok + '/' + a.ck_total : '');
    linhas.push(['li', t]);
  });
  if (cf.length) {
    linhas.push(['h', '🏛️ Conflitos de espaço (próximos 30 dias)']);
    cf.forEach(function (c) { linhas.push(['li', '⚠️ ' + esc_(ESPACOS[c.espaco] || c.espaco) + ' em ' + dd_(c.dia) + '/' + dd_(c.mes + 1) + ': ' + c.nomes.map(esc_).join(' e ')]); });
  }
  const pend = [];
  if (r.pedidos) pend.push('🔁 ' + r.pedidos + (r.pedidos === 1 ? ' pedido de alteração/cancelamento' : ' pedidos de alteração/cancelamento'));
  if (r.sem_dia) pend.push('🗓️ ' + r.sem_dia + (r.sem_dia === 1 ? ' atividade aguarda dia' : ' atividades aguardam dia'));
  if (r.cadastros) pend.push('👤 ' + r.cadastros + (r.cadastros === 1 ? ' cadastro aguarda aprovação' : ' cadastros aguardam aprovação'));
  if (rel.length) pend.push('📝 ' + rel.length + (rel.length === 1 ? ' relatório pendente: ' : ' relatórios pendentes: ') + rel.slice(0, 6).map(function (a) { return esc_(a.nome); }).join(', ') + (rel.length > 6 ? '…' : ''));
  linhas.push(['h', '📌 Pendências no site']);
  if (!pend.length) linhas.push(['li', '✅ Nada pendente. Tudo em dia!']);
  pend.forEach(function (t) { linhas.push(['li', t]); });
  const falt = sem.filter(function (a) { return a.org !== 'estaca' && a.org !== 'geral' && (!a.sacerdocio || !a.capela || !a.limpeza); }).length;
  const assunto = '🗓️ Resumo da semana: ' + (sem.length === 1 ? '1 atividade' : sem.length + ' atividades') + (falt ? ' · ' + falt + ' sem responsáveis' : '') + (pend.length ? ' · ' + pend.length + ' pendência' + (pend.length > 1 ? 's' : '') : '');
  return htmlEmail_(assunto, linhas, ['🔗 Abrir a agenda', SITE + '#pendentes'], 'Uma ótima semana! 🙏');
}

/** Só confere a conexão e mostra o que seria enviado hoje (não envia nada). */
function verificar() {
  const lista = rpc_(config_(), 'lembretes_pendentes', {p_chave: chave_()}) || [];
  console.log(lista.length ? lista.map(function (l) { return l.tipo + ' · ' + l.nome + ' → ' + l.para; }).join('\n') : 'Nada para enviar hoje.');
}

/** Envia os 4 modelos para o seu próprio e-mail, com dados de exemplo. */
function testar() {
  const para = Session.getEffectiveUser().getEmail();
  exemplos_().forEach(function (l) {
    const m = montarEmail(l);
    MailApp.sendEmail({to: para, subject: '[TESTE] ' + m.assunto, htmlBody: m.html, body: m.texto, name: REMETENTE});
  });
  console.log('4 e-mails de teste enviados para ' + para);
}

/* ---------------- e-mail ---------------- */

function montarEmail(l) {
  const fem = FEM.indexOf(l.org) >= 0;
  const prez = (fem ? 'Prezada' : 'Prezado') + ' líder ' + primeiroNome_(l.lider);
  const quando = dataLonga_(l) + (l.horario ? ', às ' + l.horario : '');
  const curta = dd_(l.dia) + '/' + dd_(l.mes + 1);
  const link = SITE + '#atividade=' + encodeURIComponent(l.atividade);
  const prazo = dataMenos_(l, 3);
  const resp = [
    ['⛪', 'Portador do Sacerdócio', l.sacerdocio],
    ['🔑', 'Abre e fecha a capela', l.capela],
    ['🧹', 'Limpeza', l.limpeza]
  ];
  const faltam = resp.filter(function (r) { return !r[2]; });
  const tempo = l.dias === 1 ? '1 dia' : l.dias === 7 ? '1 semana' : l.dias === 30 ? '1 mês' : l.dias + ' dias';
  const verbo = l.dias === 1 ? 'falta' : (l.dias === 7 || l.dias === 30) ? 'falta' : 'faltam';
  const org = ORGS[l.org] ? ' (' + ORGS[l.org] + ')' : '';

  let assunto, linhas = [], botao, rodape;
  const esp = (l.espacos || []).map(function (e) { return ESPACOS[e] || e; }).join(', ');
  const ck = l.ck_total ? '📋 Checklist: ' + l.ck_ok + ' de ' + l.ck_total + ' itens feitos' + (l.ck_ok === l.ck_total ? ' ✅' : '') : '';

  if (l.tipo === 'pos') {
    assunto = '📝 Como foi “' + l.nome + '”?';
    linhas.push(['p', prez + ',']);
    linhas.push(['p', 'Esperamos que a atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ' (' + quando + ') tenha sido abençoada! 🙌']);
    linhas.push(['h', 'Conte em 1 minuto como foi:']);
    linhas.push(['li', '👥 Quantas pessoas participaram']);
    linhas.push(['li', '💰 Quanto foi gasto' + (l.orcamento != null ? ' (previsto: ' + reais_(l.orcamento) + ')' : '')]);
    linhas.push(['li', '💬 O que deu certo e o que melhorar']);
    linhas.push(['p', 'Isso ajuda o bispado a acompanhar o orçamento e a planejar o próximo ano.']);
    botao = ['📝 Enviar o relatório', link];
    rodape = 'Obrigado pelo seu serviço! 🙏';
    return htmlEmail_(assunto, linhas, botao, rodape);
  }

  if (l.tipo === '1d') {
    assunto = '✅ É amanhã: ' + l.nome + (l.horario ? ' às ' + l.horario : '');
    linhas.push(['p', prez + ',']);
    linhas.push(['p', 'Amanhã é o dia da atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ': <b>' + quando + '</b>.']);
    linhas.push(['h', 'Confira as ações e os responsáveis:']);
    linhas.push(['li', '💰 Orçamento conferido' + (l.orcamento != null ? ' (' + reais_(l.orcamento) + ')' : '')]);
    resp.forEach(function (r) { linhas.push(['li', r[0] + ' ' + r[1] + ': ' + (r[2] ? '<b>' + esc_(r[2]) + '</b>' : '⚠️ não definido')]); });
    if (esp) linhas.push(['li', '🏛️ Espaços: ' + esc_(esp)]);
    if (ck) linhas.push(['li', ck]);
    if (faltam.length) linhas.push(['p', '⚠️ Ainda falta definir responsável. Fale hoje com a liderança da ala.']);
    botao = ['🔗 Ver a atividade no site', link];
    rodape = 'Desejamos uma ótima atividade! 🎉';
  } else if (l.tipo === '7d') {
    assunto = '⏰ ' + cap_(verbo) + ' ' + tempo + ': ' + l.nome + ' (' + curta + ') — designe os responsáveis';
    linhas.push(['p', prez + ',']);
    linhas.push(['p', verbo.charAt(0).toUpperCase() + verbo.slice(1) + ' <b>' + tempo + '</b> para a atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ', agendada para <b>' + quando + '</b>.']);
    linhas.push(['h', 'Lembre-se de:']);
    linhas.push(['li', '💰 Verificar o orçamento para a atividade' + (l.orcamento != null ? ' (previsto: ' + reais_(l.orcamento) + ')' : '')]);
    resp.forEach(function (r) { linhas.push(['li', r[0] + ' ' + r[1] + ': ' + (r[2] ? '✅ <b>' + esc_(r[2]) + '</b>' : '⏳ a definir')]); });
    if (esp) linhas.push(['li', '🏛️ Espaços: ' + esc_(esp)]);
    if (ck) linhas.push(['li', ck]);
    linhas.push(['p', !faltam.length ? '✅ Todos os responsáveis já estão definidos. Obrigado!'
      : l.dias > 3 ? '✍️ Designe os responsáveis no site até <b>' + prazo + '</b> (3 dias antes). Se precisar, use o botão “🙋 Preciso de ajuda da liderança” na atividade.'
      : '⚠️ O prazo para designar (3 dias antes) já passou. Designe hoje no site ou use o botão “🙋 Preciso de ajuda da liderança” na atividade.']);
    botao = [faltam.length ? '✍️ Designar responsáveis' : '🔗 Ver a atividade no site', link];
    rodape = 'Bom trabalho na preparação! 🙌';
  } else {
    assunto = '📅 ' + cap_(verbo) + ' ' + tempo + ': ' + l.nome + ' (' + curta + ')';
    linhas.push(['p', prez + ',']);
    linhas.push(['p', verbo.charAt(0).toUpperCase() + verbo.slice(1) + ' <b>' + tempo + '</b> para a atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ', agendada para <b>' + quando + '</b>.']);
    linhas.push(['h', 'Lembre-se de:']);
    linhas.push(['li', '💰 Verificar o orçamento para a atividade' + (l.orcamento != null ? ' (previsto: ' + reais_(l.orcamento) + ')' : '')]);
    linhas.push(['li', '⛪ Portador do Sacerdócio designado na atividade']);
    linhas.push(['li', '🔑 Quem abrirá e fechará a capela']);
    linhas.push(['li', '🧹 Quem fará a limpeza']);
    linhas.push(['li', '🏛️ Reservar os espaços do prédio' + (esp ? ' (pedidos: ' + esc_(esp) + ')' : ' no site')]);
    linhas.push(['p', '📝 No site você já pode marcar espaços, orçamento e checklist. Uma semana antes, ele vai pedir os nomes dos responsáveis.']);
    botao = ['🔗 Ver a atividade no site', link];
    rodape = 'Obrigado pelo seu serviço! 🙏';
  }

  return htmlEmail_(assunto, linhas, botao, rodape);
}

function htmlEmail_(assunto, linhas, botao, rodape) {
  // HTML simples
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#17211f;max-width:560px">';
  let lista = false;
  linhas.forEach(function (x) {
    if (x[0] === 'li') { if (!lista) { html += '<div style="margin:4px 0 12px">'; lista = true; } html += '<div style="margin:4px 0">' + x[1] + '</div>'; return; }
    if (lista) { html += '</div>'; lista = false; }
    if (x[0] === 'h') html += '<p style="margin:16px 0 4px"><b>' + x[1] + '</b></p>';
    else html += '<p style="margin:0 0 12px">' + x[1] + '</p>';
  });
  if (lista) html += '</div>';
  html += '<p style="margin:18px 0"><a href="' + botao[1] + '" style="display:inline-block;background:' + COR + ';color:#ffffff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">' + botao[0] + '</a></p>';
  html += '<p style="margin:0 0 4px">' + rodape + '</p>';
  html += '<p style="margin:18px 0 0;font-size:12.5px;color:#62716e">📆 <a href="' + SITE + '" style="color:#62716e">Calendário de Atividades Ala Ceilândia Sul</a> · lembrete automático</p></div>';

  // Texto puro (para quem não vê HTML)
  const texto = linhas.map(function (x) { return (x[0] === 'li' ? '  ' : '') + x[1].replace(/<br>/g, ' — ').replace(/<[^>]+>/g, ''); }).join('\n')
    + '\n\n' + botao[0] + ': ' + botao[1] + '\n\n' + rodape + '\n\n— Calendário de Atividades Ala Ceilândia Sul\n' + SITE;

  return {assunto: assunto, html: html, texto: texto};
}

/* ---------------- apoio ---------------- */

function config_() {
  const t = UrlFetchApp.fetch(SITE + 'config.js', {muteHttpExceptions: true}).getContentText();
  const url = (t.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/) || [])[1];
  const key = (t.match(/SUPABASE_KEY\s*:\s*["']([^"']+)["']/) || [])[1];
  if (!url || !key) throw new Error('Não consegui ler o config.js do site.');
  return {url: url.replace(/\/$/, ''), key: key};
}

function chave_() {
  const k = PropertiesService.getScriptProperties().getProperty('CHAVE_LEMBRETES');
  if (!k) throw new Error('Falta a propriedade CHAVE_LEMBRETES (gere no site: Membros → Robô de e-mails).');
  return k.trim();
}

function rpc_(c, nome, corpo) {
  const r = UrlFetchApp.fetch(c.url + '/rest/v1/rpc/' + nome, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {apikey: c.key, Authorization: 'Bearer ' + c.key}, payload: JSON.stringify(corpo)
  });
  const t = r.getContentText();
  if (r.getResponseCode() >= 300) throw new Error(nome + ' respondeu ' + r.getResponseCode() + ': ' + t);
  return t ? JSON.parse(t) : null;
}

function reais_(v) {
  const n = Number(v), p = n.toFixed(2).split('.');
  return 'R$ ' + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1];
}

function dataLonga_(l) {
  const d = new Date(l.ano, l.mes, l.dia);
  return SEMANA[d.getDay()] + ', ' + l.dia + ' de ' + MESES[l.mes];
}
function dataMenos_(l, n) {
  const d = new Date(l.ano, l.mes, l.dia - n);
  return dd_(d.getDate()) + '/' + dd_(d.getMonth() + 1);
}
function dd_(n) { return (n < 10 ? '0' : '') + n; }
function cap_(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function primeiroNome_(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
function esc_(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }

function exemplos_() {
  const base = {atividade: 'exemplo', lider: 'Fábio Maia', nome: 'Noite de talentos da ala', org: 'elderes', ano: 2027, mes: 5, dia: 12, horario: '19:00', detalhes: 'Capela'};
  return [
    Object.assign({}, base, {tipo: '30d', dias: 30, sacerdocio: '', capela: '', limpeza: ''}),
    Object.assign({}, base, {tipo: '7d', dias: 7, sacerdocio: 'Irmão Carlos Souza', capela: '', limpeza: ''}),
    Object.assign({}, base, {tipo: '1d', dias: 1, sacerdocio: 'Irmão Carlos Souza', capela: 'Irmão Pedro Lima', limpeza: 'Família Oliveira', orcamento: 250, espacos: ['salao', 'cozinha'], ck_total: 5, ck_ok: 5}),
    Object.assign({}, base, {tipo: 'pos', dias: -1, orcamento: 250})
  ];
}
