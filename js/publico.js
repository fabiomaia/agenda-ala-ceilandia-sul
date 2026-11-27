{
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const AB=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const SEM=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ORGS=[{k:'primaria',n:'Primária'},{k:'socorro',n:'Sociedade de Socorro'},{k:'elderes',n:'Quórum de Élderes'},{k:'rapazes',n:'Rapazes'},{k:'mocas',n:'Moças'},{k:'escola',n:'Escola Dominical'},{k:'estaca',n:'Estaca Ceilândia'},{k:'geral',n:'Igreja Geral'}];
const ORG=Object.fromEntries(ORGS.map(o=>[o.k,o]));
const ARTG={primaria:'a',socorro:'a',elderes:'o',rapazes:'os',mocas:'as',escola:'a',estaca:'a',geral:'a'};
const aOrg=k=>ARTG[k]+' '+ORG[k].n,daOrg=k=>({a:'da',o:'do',os:'dos',as:'das'})[ARTG[k]]+' '+ORG[k].n,naOrg=k=>({a:'na',o:'no',os:'nos',as:'nas'})[ARTG[k]]+' '+ORG[k].n;
let ANO=2027;const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dim=m=>new Date(ANO,m+1,0).getDate();
const plural=(n,a,b)=>n===1?`1 ${a}`:`${n} ${b}`;
const CFG=window.AGENDA_CONFIG||{};
const ok=typeof CFG.SUPABASE_URL==='string'&&/^https:\/\/[a-z0-9]{15,}\.supabase\.co\/?$/.test(CFG.SUPABASE_URL)&&typeof CFG.SUPABASE_KEY==='string'&&CFG.SUPABASE_KEY.length>20;
const sb=ok&&window.supabase?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null;
let acts=[],carregou=false,filtro=new URLSearchParams(location.search).get('org');if(!ORG[filtro])filtro='todas';
$('#legend').innerHTML=ORGS.map(o=>`<span class="leg o-${o.k}"><i></i>${o.n}</span>`).join('');
const ferCache={};
function feriados(y){
  if(ferCache[y])return ferCache[y];
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
  const pascoa=new Date(y,Math.floor((h+l-7*mm+114)/31)-1,((h+l-7*mm+114)%31)+1),rel=n=>new Date(y,pascoa.getMonth(),pascoa.getDate()+n),out={};
  const add=(dt,n,fac)=>{out[dt.getMonth()+'-'+dt.getDate()]={n,f:!!fac}};
  [[0,1,'Confraternização Universal'],[3,21,'Tiradentes e Fundação de Brasília'],[4,1,'Dia do Trabalho'],[8,7,'Independência do Brasil'],[9,12,'Nossa Senhora Aparecida'],[10,2,'Finados'],[10,15,'Proclamação da República'],[10,20,'Consciência Negra'],[10,30,'Dia do Evangélico (DF)'],[11,25,'Natal']].forEach(([m,dd,n])=>add(new Date(y,m,dd),n));
  add(rel(-48),'Carnaval',1);add(rel(-47),'Carnaval',1);add(rel(-46),'Quarta-feira de Cinzas',1);add(rel(-2),'Sexta-feira Santa');add(rel(60),'Corpus Christi',1);
  return ferCache[y]=out}
const feriado=(m,d)=>feriados(ANO)[m+'-'+d]||null;
const icsUrl=org=>location.origin+(org?'/agenda/'+org+'.ics':'/agenda.ics');
$('#aorg').innerHTML='<option value="">Todas as organizações</option>'+ORGS.filter(o=>o.k!=='estaca'&&o.k!=='geral').map(o=>`<option value="${o.k}">${o.n}</option>`).join('');
function pintaAss(){const w=icsUrl($('#aorg').value).replace(/^https?:/,'webcal:');$('#aical').href=w;$('#agoog').href='https://calendar.google.com/calendar/render?cid='+encodeURIComponent(w)}
$('#aorg').addEventListener('change',pintaAss);
$('#bassinar').addEventListener('click',()=>{$('#aorg').value=filtro!=='todas'&&filtro!=='estaca'&&filtro!=='geral'?filtro:'';pintaAss();const d=$('#dass');if(d.showModal)d.showModal();else d.setAttribute('open','')});
$('#afechar').addEventListener('click',()=>$('#dass').close());
$('#dass').addEventListener('click',e=>{if(e.target===$('#dass'))$('#dass').close()});
$('#acop').addEventListener('click',async()=>{const u=icsUrl($('#aorg').value);try{await navigator.clipboard.writeText(u);$('#acop').textContent='Link copiado ✓'}catch(e){prompt('Copie o link:',u)}setTimeout(()=>$('#acop').textContent='Copiar link da agenda',2500)});
$('#bimprimir').addEventListener('click',()=>window.print());
let pedidoInstalar=null;
const emApp=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
const ehIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const pintaInst=()=>{$('#binstalar').hidden=emApp()||!(pedidoInstalar||ehIOS)};
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pedidoInstalar=e;pintaInst()});
window.addEventListener('appinstalled',()=>{pedidoInstalar=null;pintaInst()});
$('#binstalar').addEventListener('click',()=>{
  if(pedidoInstalar){const p=pedidoInstalar;pedidoInstalar=null;p.prompt();pintaInst();return}
  const safari=!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(navigator.userAgent);
  $('#dinstb').innerHTML=safari?'<ol><li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima), na barra do Safari.</li><li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Confirme em <b>Adicionar</b>. O ícone <b>Calendário Ala</b> aparece na tela inicial.</li></ol>':'<p>No iPhone, o app só pode ser instalado pelo <b>Safari</b>. Abra este endereço no Safari e toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</p>';
  const d=$('#dinst');if(d.showModal)d.showModal();else d.setAttribute('open','')});
$('#dinstok').addEventListener('click',()=>$('#dinst').close());
pintaInst();
if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})});
window.addEventListener('online',()=>carregar());

function clean(r){const m=Number(r.mes),d=Number(r.dia),org=ORG[r.org],nome=String(r.nome??'').trim().slice(0,140);
  if(!Number.isInteger(m)||m<0||m>11||!Number.isInteger(d)||d<1||d>dim(m)||!org||!nome)return null;
  const h=typeof r.horario==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.horario)?r.horario:'';
  return{id:String(r.id),mes:m,dia:d,horario:h,org:org.k,nome,detalhes:String(r.detalhes??'').slice(0,400)}}
const wd=(m,d)=>SEM[new Date(ANO,m,d).getDay()].toLowerCase();
function render(){
  const cnt={};acts.forEach(a=>cnt[a.org]=(cnt[a.org]||0)+1);
  $('#chips').innerHTML=`<button type="button" class="chip" data-f="todas" aria-pressed="${filtro==='todas'}">Todas <small>${acts.length}</small></button>`+
    ORGS.map(o=>`<button type="button" class="chip o-${o.k}" data-f="${o.k}" aria-pressed="${filtro===o.k}"><i></i>${o.n} <small>${cnt[o.k]||0}</small></button>`).join('');
  const v=acts.filter(a=>filtro==='todas'||a.org===filtro);
  const now=new Date(),hoje=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const prox=v.filter(a=>new Date(ANO,a.mes,a.dia)>=hoje).slice(0,3);
  $('#nextw').innerHTML=prox.length?`<p class="nxh">Próximas atividades${filtro!=='todas'?' · '+ORG[filtro].n:''}</p><div class="next">${prox.map(a=>`<div class="nx"><div class="b"><b>${a.dia}</b><small>${AB[a.mes]} · ${wd(a.mes,a.dia)}</small></div><div><div class="t">${esc(a.nome)}</div><div class="o o-${a.org}" style="--c:var(--o-${a.org})">${ORG[a.org].n}${a.horario?' · '+a.horario:''}</div></div></div>`).join('')}</div>`:'';
  if(!carregou){$('#grid').innerHTML='';return}
  $('#msg').innerHTML=v.length?'':`<div class="msg">${acts.length?'Nenhuma atividade com data para '+aOrg(filtro)+' ainda.':'Nenhuma atividade com data definida ainda. Volte em breve.'}</div>`;
  $('#grid').innerHTML=MESES.map((nm,m)=>{
    const l=v.filter(a=>a.mes===m),first=new Date(ANO,m,1).getDay(),n=dim(m);
    let cal=SEM.map(s=>`<span class="w">${s[0]}</span>`).join('');
    for(let i=0;i<first;i++)cal+='<span></span>';
    const fl=[];for(let d=1;d<=n;d++){const di=l.filter(a=>a.dia===d),isH=now.getFullYear()===ANO&&now.getMonth()===m&&now.getDate()===d,fe=feriado(m,d);if(fe)fl.push(`${d} · ${fe.n}${fe.f?' (ponto facultativo)':''}`);const tt=[fe?'🎉 '+fe.n:'',...di.map(a=>(a.horario?a.horario+' ':'')+a.nome)].filter(Boolean).join(' · ');
      cal+=`<span class="d${di.length?' on':''}${isH?' hoje':''}${fe?' fer':''}" ${tt?`title="${esc(tt)}"`:''}>${d}<span class="ds">${di.slice(0,4).map(a=>`<i class="o-${a.org}"></i>`).join('')}</span></span>`}
    return `<section class="mes${l.length?'':' vazio'}" aria-label="${nm} de ${ANO}"><div class="mh"><h2>${nm}</h2><span>${l.length?plural(l.length,'atividade','atividades'):'sem atividades'}</span></div><div class="cal" aria-hidden="true">${cal}</div>${l.length?`<ul>${l.map(a=>`<li><span class="bd"><b>${a.dia}</b><small>${wd(a.mes,a.dia)}</small></span><div><div class="nm">${esc(a.nome)}</div><span class="dot o-${a.org}">${ORG[a.org].n}${a.horario?` · <b class="hr">${a.horario}</b>`:''}</span>${a.detalhes?`<p class="dt">${esc(a.detalhes)}</p>`:''}</div></li>`).join('')}</ul>`:'<p class="none">Nenhuma atividade com data neste mês.</p>'}${fl.length?`<p class="ferl">🎉 ${fl.map(esc).join(' · ')}</p>`:''}</section>`;
  }).join('');
}
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;filtro=b.dataset.f;
  const u=new URL(location.href);if(filtro==='todas')u.searchParams.delete('org');else u.searchParams.set('org',filtro);history.replaceState(null,'',u);render()});
async function carregar(){
  const copia=()=>{try{const c=JSON.parse(localStorage.getItem('pub-copia')||'null');if(!c||!Array.isArray(c.data))return false;
      if(Number.isInteger(c.ano)&&c.ano!==ANO){ANO=c.ano;$('#ptit').textContent='Calendário de Atividades Ala Ceilândia Sul '+ANO}
      acts=c.data.map(clean).filter(Boolean).sort((a,b)=>a.mes-b.mes||a.dia-b.dia||(a.horario||'99').localeCompare(b.horario||'99'));carregou=true;
      $('#upd span').textContent='Sem internet · cópia de '+new Date(c.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});render();return true}catch(e){return false}};
  if(!sb&&copia())return;
  if(!sb){$('#upd span').textContent='Calendário indisponível no momento.';$('#msg').innerHTML='<div class="msg">O site ainda não foi configurado (config.js).</div>';return}
  try{const cf=await sb.from('config').select('chave,valor').eq('chave','ano').maybeSingle();const n=cf&&!cf.error&&cf.data?Number(cf.data.valor):NaN;if(Number.isInteger(n)&&n>=2026&&n<=2100&&n!==ANO){ANO=n;$('#ptit').textContent='Calendário de Atividades Ala Ceilândia Sul '+ANO;document.title='Calendário da Ala Ceilândia Sul '+ANO}
    const{data,error}=await sb.rpc('calendario_publico');if(error)throw error;
    acts=(data||[]).map(clean).filter(Boolean).sort((a,b)=>a.mes-b.mes||a.dia-b.dia||(a.horario||'99').localeCompare(b.horario||'99'));carregou=true;
    try{localStorage.setItem('pub-copia',JSON.stringify({ano:ANO,ts:Date.now(),data:data||[]}))}catch(e){}
    $('#upd span').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});render();
  }catch(e){if(!carregou&&copia())return;if(carregou&&!navigator.onLine){$('#upd span').textContent='Sem internet · mostrando a última versão';return}$('#upd span').textContent='Não foi possível atualizar agora. Tentando de novo…';
    if(/calendario_publico|function/i.test(String(e&&e.message)))$('#msg').innerHTML='<div class="msg">O calendário público ainda não foi ativado no banco de dados.</div>'}
}
render();carregar();
setInterval(()=>{if(!document.hidden)carregar()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)carregar()});
}
