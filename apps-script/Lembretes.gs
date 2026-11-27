/**
 * Robô de lembretes — Calendário de Atividades Ala Ceilândia Sul
 *
 * Todo dia às 8h (horário de Brasília) envia aos líderes os lembretes de
 * 1 mês, 1 semana e 1 dia antes de cada atividade da organização.
 *
 * Instalação (uma vez):
 *  1. Configurações do projeto (engrenagem) → Propriedades do script →
 *     adicionar CHAVE_LEMBRETES com a chave gerada no site (Membros → Robô de e-mails).
 *  2. Escolher a função "instalar" e clicar em Executar (autorizar com a sua conta Google).
 *  3. Opcional: executar "testar" para receber os 3 modelos no seu e-mail.
 */

const SITE = 'https://calendario-ala-ceilandia-sul.vercel.app/';
const REMETENTE = 'Agenda da Ala Ceilândia Sul';
const COR = '#163f3a';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const SEMANA = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const ORGS = {primaria:'Primária',socorro:'Sociedade de Socorro',elderes:'Quórum de Élderes',rapazes:'Rapazes',mocas:'Moças',escola:'Escola Dominical'};
const DA = {primaria:'da',socorro:'da',elderes:'do',rapazes:'dos',mocas:'das',escola:'da'};
const FEM = ['primaria','socorro','mocas'];

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

/** Cria (ou recria) o agendamento diário às 8h. */
function instalar() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'enviarLembretes'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarLembretes').timeBased().everyDays(1).atHour(8).inTimezone('America/Sao_Paulo').create();
  const n = (rpc_(config_(), 'lembretes_pendentes', {p_chave: chave_()}) || []).length;
  console.log('Pronto! O robô roda todo dia às 8h. Lembretes para enviar hoje: ' + n);
}

/** Só confere a conexão e mostra o que seria enviado hoje (não envia nada). */
function verificar() {
  const lista = rpc_(config_(), 'lembretes_pendentes', {p_chave: chave_()}) || [];
  console.log(lista.length ? lista.map(function (l) { return l.tipo + ' · ' + l.nome + ' → ' + l.para; }).join('\n') : 'Nada para enviar hoje.');
}

/** Envia os 3 modelos para o seu próprio e-mail, com dados de exemplo. */
function testar() {
  const para = Session.getEffectiveUser().getEmail();
  exemplos_().forEach(function (l) {
    const m = montarEmail(l);
    MailApp.sendEmail({to: para, subject: '[TESTE] ' + m.assunto, htmlBody: m.html, body: m.texto, name: REMETENTE});
  });
  console.log('3 e-mails de teste enviados para ' + para);
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

  if (l.tipo === '1d') {
    assunto = '✅ É amanhã: ' + l.nome + (l.horario ? ' às ' + l.horario : '');
    linhas.push(['p', prez + ',']);
    linhas.push(['p', 'Amanhã é o dia da atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ': <b>' + quando + '</b>.']);
    linhas.push(['h', 'Confira as ações e os responsáveis:']);
    linhas.push(['li', '💰 Orçamento conferido']);
    resp.forEach(function (r) { linhas.push(['li', r[0] + ' ' + r[1] + ': ' + (r[2] ? '<b>' + esc_(r[2]) + '</b>' : '⚠️ não definido')]); });
    if (faltam.length) linhas.push(['p', '⚠️ Ainda falta definir responsável. Fale hoje com a liderança da ala.']);
    botao = ['🔗 Ver a atividade no site', link];
    rodape = 'Desejamos uma ótima atividade! 🎉';
  } else if (l.tipo === '7d') {
    assunto = '⏰ ' + cap_(verbo) + ' ' + tempo + ': ' + l.nome + ' (' + curta + ') — designe os responsáveis';
    linhas.push(['p', prez + ',']);
    linhas.push(['p', verbo.charAt(0).toUpperCase() + verbo.slice(1) + ' <b>' + tempo + '</b> para a atividade <b>' + esc_(l.nome) + '</b>' + esc_(org) + ', agendada para <b>' + quando + '</b>.']);
    linhas.push(['h', 'Lembre-se de:']);
    linhas.push(['li', '💰 Verificar o orçamento para a atividade']);
    resp.forEach(function (r) { linhas.push(['li', r[0] + ' ' + r[1] + ': ' + (r[2] ? '✅ <b>' + esc_(r[2]) + '</b>' : '⏳ a definir')]); });
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
    linhas.push(['li', '💰 Verificar o orçamento para a atividade']);
    linhas.push(['li', '⛪ Portador do Sacerdócio designado na atividade']);
    linhas.push(['li', '🔑 Quem abrirá e fechará a capela']);
    linhas.push(['li', '🧹 Quem fará a limpeza']);
    linhas.push(['p', '📝 Uma semana antes, o site vai pedir os nomes dos responsáveis.']);
    botao = ['🔗 Ver a atividade no site', link];
    rodape = 'Obrigado pelo seu serviço! 🙏';
  }

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
  const texto = linhas.map(function (x) { return (x[0] === 'li' ? '  ' : '') + x[1].replace(/<[^>]+>/g, ''); }).join('\n')
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
    Object.assign({}, base, {tipo: '1d', dias: 1, sacerdocio: 'Irmão Carlos Souza', capela: 'Irmão Pedro Lima', limpeza: 'Família Oliveira'})
  ];
}
