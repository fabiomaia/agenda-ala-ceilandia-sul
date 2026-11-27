// Agenda para assinar no Google Agenda, no iPhone ou no Outlook (formato iCalendar).
//   /agenda.ics            → todas as atividades com data
//   /agenda/primaria.ics   → só a Primária, mais a Estaca e a Igreja Geral
// Usa só a chave pública do site e a função calendario_publico (a mesma da página pública).
const SITE = 'https://calendario-ala-ceilandia-sul.vercel.app';
const ORGS = {
  primaria: 'Primária', socorro: 'Sociedade de Socorro', elderes: 'Quórum de Élderes', rapazes: 'Rapazes',
  mocas: 'Moças', escola: 'Escola Dominical', estaca: 'Estaca Ceilândia', geral: 'Igreja Geral'
};
const ESPECIAIS = ['estaca', 'geral'];

let cfg = null;
async function config() {
  if (cfg) return cfg;
  const t = await (await fetch(SITE + '/config.js')).text();
  const url = (t.match(/SUPABASE_URL\s*:\s*["']([^"']+)["']/) || [])[1];
  const key = (t.match(/SUPABASE_KEY\s*:\s*["']([^"']+)["']/) || [])[1];
  if (!url || !key || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) throw new Error('config.js inválido');
  cfg = { url: url.replace(/\/$/, ''), key };
  return cfg;
}

async function supa(c, caminho, corpo) {
  const r = await fetch(c.url + caminho, {
    method: corpo ? 'POST' : 'GET',
    headers: { apikey: c.key, Authorization: 'Bearer ' + c.key, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  if (!r.ok) throw new Error(caminho + ' respondeu ' + r.status);
  return r.json();
}

const dois = n => String(n).padStart(2, '0');
const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Linhas de no máximo 75 bytes (regra do formato), quebrando sem partir letras acentuadas.
function dobra(linha) {
  const out = [];
  let atual = '', bytes = 0, lim = 75;
  for (const ch of linha) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > lim) { out.push(atual); atual = ' '; bytes = 1; lim = 75; }
    atual += ch; bytes += b;
  }
  out.push(atual);
  return out.join('\r\n');
}

function montar(ano, lista, org) {
  const agora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const nomeCal = 'Ala Ceilândia Sul ' + ano + (org ? ' · ' + ORGS[org] : '');
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ala Ceilandia Sul//Calendario de Atividades//PT-BR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + txt(nomeCal), 'X-WR-TIMEZONE:America/Sao_Paulo',
    'X-WR-CALDESC:' + txt('Atividades da Ala Ceilândia Sul com data definida. Atualiza sozinho.'),
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
    'TZOFFSETFROM:-0300', 'TZOFFSETTO:-0300', 'TZNAME:-03', 'END:STANDARD', 'END:VTIMEZONE'
  ];
  for (const a of lista) {
    const mes = Number(a.mes), dia = Number(a.dia);
    if (!Number.isInteger(mes) || !Number.isInteger(dia) || !ORGS[a.org]) continue;
    const data = ano + dois(mes + 1) + dois(dia);
    L.push('BEGIN:VEVENT', 'UID:' + a.id + '@calendario-ala-ceilandia-sul', 'DTSTAMP:' + agora);
    const h = typeof a.horario === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(a.horario) ? a.horario : '';
    if (h) {
      const [hh, mm] = h.split(':').map(Number);
      const fim = Math.min(hh * 60 + mm + 120, 23 * 60 + 59);
      L.push('DTSTART;TZID=America/Sao_Paulo:' + data + 'T' + dois(hh) + dois(mm) + '00',
             'DTEND;TZID=America/Sao_Paulo:' + data + 'T' + dois(Math.floor(fim / 60)) + dois(fim % 60) + '00');
    } else {
      const d2 = new Date(Date.UTC(ano, mes, dia + 1));
      L.push('DTSTART;VALUE=DATE:' + data,
             'DTEND;VALUE=DATE:' + d2.getUTCFullYear() + dois(d2.getUTCMonth() + 1) + dois(d2.getUTCDate()));
    }
    const desc = [ORGS[a.org], a.detalhes || '', h ? '' : 'Horário a confirmar.', 'Calendário da ala: ' + SITE + '/publico/']
      .filter(Boolean).join('\n');
    L.push('SUMMARY:' + txt(a.nome + ' (' + ORGS[a.org] + ')'), 'DESCRIPTION:' + txt(desc),
           'URL:' + SITE + '/publico/', 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(dobra).join('\r\n') + '\r\n';
}

module.exports = async (req, res) => {
  try {
    const q = new URL(req.url, 'https://x').searchParams;
    let org = String(q.get('org') || '').toLowerCase().replace(/\.ics$/, '');
    if (org && !ORGS[org]) { res.statusCode = 404; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.end('Organização desconhecida.'); }
    const c = await config();
    const [cf, lista] = await Promise.all([
      supa(c, '/rest/v1/config?select=valor&chave=eq.ano'),
      supa(c, '/rest/v1/rpc/calendario_publico', {})
    ]);
    const ano = Number(cf && cf[0] && cf[0].valor) || new Date().getFullYear();
    const sel = (lista || []).filter(a => !org || a.org === org || (!ESPECIAIS.includes(org) && ESPECIAIS.includes(a.org)));
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="agenda-ala-ceilandia-sul' + (org ? '-' + org : '') + '.ics"');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
    res.end(montar(ano, sel, org));
  } catch (e) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end('Agenda indisponível no momento. Tente de novo em alguns minutos.');
  }
};
module.exports.montar = montar;
