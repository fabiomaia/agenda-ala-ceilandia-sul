{
const MESES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const AB=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const SEM=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const ORGS=[{k:'primaria',n:'Primária'},{k:'socorro',n:'Sociedade de Socorro'},{k:'elderes',n:'Quórum de Élderes'},{k:'rapazes',n:'Rapazes'},{k:'mocas',n:'Moças'},{k:'escola',n:'Escola Dominical'},{k:'estaca',n:'Estaca Ceilândia'},{k:'geral',n:'Igreja Geral'}];
const ESPECIAIS=['estaca','geral'],ehEspecial=k=>ESPECIAIS.includes(k);
const ORG=Object.fromEntries(ORGS.map(o=>[o.k,o]));
const ARTG={primaria:'a',socorro:'a',elderes:'o',rapazes:'os',mocas:'as',escola:'a',estaca:'a',geral:'a'};
const ORGS_LID=ORGS.filter(o=>!ehEspecial(o.k));
const aOrg=k=>ARTG[k]+' '+ORG[k].n,daOrg=k=>({a:'da',o:'do',os:'dos',as:'das'})[ARTG[k]]+' '+ORG[k].n,naOrg=k=>({a:'na',o:'no',os:'nos',as:'nas'})[ARTG[k]]+' '+ORG[k].n;
let ANO=2027,PRAZO='';const LSM='atividades-ala-2027-mes',LSOFF='agenda-copia';let offline=false;
const VIEWS=['calendario','ano','organizacoes','cadastro','membros','pendentes','historico','numeros'];let planos={},rels={},verbas={},espRes=[],ajudas=[],ajudasOk=false,planoTmp=null;let ultBackup=null;let resps={},WHATS_AJUDA='',abrirDepois=null,chaveCriada=null,hist=[],histLim=200,histOrg='todas',histCarregando=false,histErro='';let pendOrg='todas',desigId=null,solics=[],avisosL=[],formModo='';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dim=m=>new Date(ANO,m+1,0).getDate();
const plural=(n,a,b)=>n===1?`1 ${a}`:`${n} ${b}`;
const orgOpts=(sel,todas)=>(todas?ORGS:ORGS.filter(o=>!ehEspecial(o.k))).map(o=>`<option value="${o.k}"${o.k===sel?' selected':''}>${o.n}</option>`).join('');
const CFG=window.AGENDA_CONFIG||{};
const configurado=typeof CFG.SUPABASE_URL==='string'&&/^https:\/\/[a-z0-9]{15,}\.supabase\.co\/?$/.test(CFG.SUPABASE_URL)&&typeof CFG.SUPABASE_KEY==='string'&&CFG.SUPABASE_KEY.length>20&&!/SEU-PROJETO|COLE-AQUI/i.test(CFG.SUPABASE_URL+CFG.SUPABASE_KEY);
const sb=configurado&&window.supabase?window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_KEY):null;
const VOLTA=location.origin+location.pathname;

let sessao=null,myId=null,meEmail='',meNome='',acts=[],items=[],carregado=false;
let adminIds=[],isAdmin=false,isDono=false,meuCad=undefined,minhaAprov=undefined,membros={},aprovs={};
let view='calendario',filtro='todas',editId=null,undoItem=null,flash=null,toastT=0,busy=false,pickDia=0,autoCad=false,canal=null,recT=0;
let mes=0;try{const s=Number(localStorage.getItem(LSM));if(Number.isInteger(s)&&s>=0&&s<12)mes=s}catch(e){}
const now=new Date();if(now.getFullYear()===ANO)mes=now.getMonth();

$('#filtro').innerHTML='<option value="todas">Todas as organizações</option>'+orgOpts('',true);
$('#fmes').innerHTML=MESES.map((m,i)=>`<option value="${i}">${m}</option>`).join('');
$('#forgs').innerHTML=ORGS.map(o=>`<label class="org o-${o.k}"><input type="radio" name="org" value="${o.k}"><span>${o.n}</span></label>`).join('');

/* ================= LOGIN ================= */
let amodo='entrar';
function authModo(m){
  amodo=m;$('#aerr').textContent='';$('#aok').textContent='';
  document.querySelectorAll('#atabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===m)));
  $('#atabs').hidden=m==='esqueci'||m==='nova';$('#agoogw').hidden=m==='esqueci'||m==='nova';
  $('#aemailw').hidden=m==='nova';$('#asenhaw').hidden=m==='esqueci';
  $('#asenha').autocomplete=m==='entrar'?'current-password':'new-password';
  $('#asenha').previousElementSibling.textContent=m==='nova'?'Nova senha (mínimo 8 caracteres, com letras e números)':m==='criar'?'Crie uma senha (mínimo 8 caracteres, com letras e números)':'Senha';
  $('#asubmit').textContent={entrar:'Entrar',criar:'Criar conta',esqueci:'Enviar link para redefinir',nova:'Salvar nova senha'}[m];
  $('#alink').hidden=m!=='entrar';
  $('#aesqueci').textContent=m==='esqueci'?'Voltar para entrar':'Esqueci minha senha';$('#aesqueci').hidden=m==='nova'||m==='criar';
  $('#atop').textContent={entrar:'Entre para ver e marcar as atividades da sua organização.',criar:'Crie sua conta. Depois você preenche o cadastro de líder.',esqueci:'Informe seu e-mail e enviaremos um link para criar uma nova senha.',nova:'Escolha uma nova senha para sua conta.'}[m];
}
function traduz(e){
  const m=String(e&&e.message||e||'');
  if(/Invalid login credentials/i.test(m))return 'E-mail ou senha incorretos.';
  if(/already registered|already exists/i.test(m))return 'Este e-mail já tem conta. Use “Entrar”.';
  if(/Email not confirmed/i.test(m))return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if(/Password should be at least|weak|should contain/i.test(m))return 'Senha fraca: use pelo menos 8 caracteres, com letras e números.';
  if(/rate limit|security purposes/i.test(m))return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  if(/provider is not enabled/i.test(m))return 'O login com Google ainda não foi ativado no Supabase.';
  if(/row-level security|42501/i.test(m))return 'Você não tem permissão para fazer isso.';
  if(/O prazo para propor atividades|outro ano|Ano inválido|Data do prazo|não existe nesse mês|Prazo muito curto|Este mês já passou|já está agendada|Só o administrador|Você só pode pedir|já respondida|Dados da alteração/i.test(m))return m;
  if(/solicitacoes_uma_pendente|duplicate key/i.test(m))return 'Já existe um pedido pendente para esta atividade. Aguarde a resposta do administrador.';
  if(/horario_check/i.test(m))return 'Horário inválido. Use o formato 24 horas, de 00:00 a 23:59.';
  if(/Failed to fetch|NetworkError/i.test(m))return 'Sem conexão com o servidor. Verifique a internet.';
  return 'Algo deu errado: '+m;
}
$('#atabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)authModo(b.dataset.tab)});
$('#aesqueci').addEventListener('click',()=>authModo(amodo==='esqueci'?'entrar':'esqueci'));
$('#agoogle').addEventListener('click',async()=>{
  $('#aerr').textContent='';const{error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:VOLTA}});
  if(error)$('#aerr').textContent=traduz(error);
});
$('#aform').addEventListener('submit',async ev=>{
  ev.preventDefault();if(busy)return;
  const email=$('#aemail').value.trim(),senha=$('#asenha').value,err=$('#aerr'),ok=$('#aok');err.textContent='';ok.textContent='';
  if(amodo!=='nova'&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){err.textContent='Digite um e-mail válido.';$('#aemail').focus();return}
  if(amodo==='entrar'&&!senha){err.textContent='Digite sua senha.';$('#asenha').focus();return}
  if((amodo==='criar'||amodo==='nova')&&(senha.length<8||!/[A-Za-z]/.test(senha)||!/\d/.test(senha))){err.textContent='Senha fraca: use pelo menos 8 caracteres, com letras e números.';$('#asenha').focus();return}
  busy=true;$('#asubmit').disabled=true;let r;
  try{
    if(amodo==='entrar')r=await sb.auth.signInWithPassword({email,password:senha});
    else if(amodo==='criar'){r=await sb.auth.signUp({email,password:senha,options:{emailRedirectTo:VOLTA}});
      if(!r.error&&!r.data.session){ok.textContent='Conta criada! Enviamos um link de confirmação para '+email+'. Abra o e-mail e clique no link para entrar.';$('#asenha').value=''}}
    else if(amodo==='esqueci'){r=await sb.auth.resetPasswordForEmail(email,{redirectTo:VOLTA});if(!r.error)ok.textContent='Se existir uma conta com esse e-mail, o link para nova senha já foi enviado.'}
    else{r=await sb.auth.updateUser({password:senha});if(!r.error){toast('Senha alterada');$('#asenha').value='';const ss=sessao;sessao=null;authModo('entrar');if(ss)entrou(ss);else mostrarApp()}}
    if(r&&r.error)err.textContent=traduz(r.error);
  }catch(e){err.textContent=traduz(e)}
  busy=false;$('#asubmit').disabled=false;
});
$('#sair').addEventListener('click',async()=>{try{localStorage.removeItem(LSOFF)}catch(e){}if(offline&&!sessao){offline=false;saiu();return}await sb.auth.signOut()});
$('#alink').addEventListener('click',async()=>{
  if(busy)return;const email=$('#aemail').value.trim(),err=$('#aerr'),ok=$('#aok');err.textContent='';ok.textContent='';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){err.textContent='Digite seu e-mail acima e toque de novo em “Entrar com link”.';$('#aemail').focus();return}
  busy=true;$('#alink').disabled=true;
  try{const r=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:VOLTA}});
    if(r.error&&/rate limit|security purposes/i.test(r.error.message||''))err.textContent=traduz(r.error);
    else ok.textContent='Pronto! Se este e-mail tiver conta, enviamos um link de acesso para '+email+'. Abra o e-mail neste aparelho e toque no link para entrar.'}
  catch(e){err.textContent=traduz(e)}
  busy=false;$('#alink').disabled=false;
});
function mostrarLogin(){$('#auth').hidden=false;document.querySelector('.app').inert=true}
function mostrarApp(){$('#auth').hidden=true;document.querySelector('.app').inert=false}

/* ================= DADOS ================= */
function clean(r){
  if(!r)return null;const m=Number(r.mes),org=ORG[r.org],nome=String(r.nome??'').trim().slice(0,140);
  if(!Number.isInteger(m)||m<0||m>11||!org||!nome)return null;
  let dia=Number(r.dia);if(!Number.isInteger(dia)||dia<1||dia>dim(m))dia=0;
  const h=typeof r.horario==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.horario)?r.horario:'';
  return{id:String(r.id),mes:m,dia,horario:h,org:org.k,nome,detalhes:String(r.detalhes??'').slice(0,400),autor:r.autor?String(r.autor):'',autorNome:String(r.autor_nome??'').slice(0,80),criado:Date.parse(r.criado)||0};
}
function cleanSol(r){if(!r||!['alterar','cancelar'].includes(r.tipo))return null;const ob=o=>o&&typeof o==='object'?o:{};const hv=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:'';const ad=o=>{o=ob(o);const m=Number(o.mes);return{nome:String(o.nome??'').slice(0,140),mes:Number.isInteger(m)&&m>=0&&m<12?m:0,dia:Number.isInteger(Number(o.dia))?Number(o.dia):0,horario:hv(o.horario),org:ORG[o.org]?o.org:'',detalhes:String(o.detalhes??'').slice(0,400)}};
  return{id:String(r.id),atividade:r.atividade?String(r.atividade):'',tipo:r.tipo,autor:r.autor?String(r.autor):'',autorNome:String(r.autor_nome??'').slice(0,80),antes:ad(r.antes),depois:r.depois?ad(r.depois):null,final:r.final?ad(r.final):null,motivo:String(r.motivo??'').slice(0,300),status:['pendente','aprovado','recusado'].includes(r.status)?r.status:'pendente',resposta:String(r.resposta??'').slice(0,300),criado:Date.parse(r.criado)||0,visto:!!r.visto}}
function cleanAviso(r){if(!r||!['agendada','remarcada'].includes(r.tipo))return null;const d=r.dados&&typeof r.dados==='object'?r.dados:{};const hv=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?v:'';const nm=v=>{v=Number(v);return Number.isInteger(v)?v:null};const m=nm(d.mes),di=nm(d.dia);if(m===null||m<0||m>11||!di)return null;const am=nm(d.antes_mes),ad=nm(d.antes_dia);
  return{id:String(r.id),atividade:r.atividade?String(r.atividade):'',tipo:r.tipo,nome:String(d.nome??'').slice(0,140),mes:m,dia:di,horario:hv(d.horario),antesMes:am!==null&&am>=0&&am<=11?am:null,antesDia:ad,antesHora:hv(d.antes_horario)}}
function cleanMembro(r){if(!r)return null;return{nome:String(r.nome??'').slice(0,80),org:ORG[r.org]?r.org:'',whats:String(r.whats??'').replace(/\D/g,'').slice(0,15),email:String(r.email??'').slice(0,120),em:Date.parse(r.criado)||0}}
function cleanAprov(r){if(!r)return null;const st=r.status==='aprovado'||r.status==='recusado'?r.status:null;return st?{status:st,org:ORG[r.org]?r.org:''}:null}
async function carregar(){
  if(!sb||!myId)return;
  const q=[sb.from('atividades').select('*').order('criado'),sb.from('admins').select('user_id,dono'),sb.from('solicitacoes').select('*').or('status.eq.pendente,visto.eq.false').order('criado'),sb.from('avisos').select('*').eq('visto',false).order('criado'),sb.from('config').select('chave,valor'),sb.from('responsaveis').select('*'),sb.from('config_priv').select('chave,valor'),sb.from('planos').select('*'),sb.from('relatorios').select('*'),sb.from('orcamento_org').select('*'),sb.rpc('espacos_reservados')];
  if(!isDono){q.push(sb.from('perfis').select('*').eq('id',myId).maybeSingle(),sb.from('aprovacoes').select('*').eq('user_id',myId).maybeSingle())}
  const [a,ad,sl,av,cf,rsp,cpv,pl,rl,vb,er,pf,ap]=await Promise.all(q);
  resps={};if(rsp&&!rsp.error)(rsp.data||[]).forEach(r=>{resps[String(r.atividade)]={sacerdocio:String(r.sacerdocio||'').slice(0,120),capela:String(r.capela||'').slice(0,120),limpeza:String(r.limpeza||'').slice(0,120),porNome:String(r.por_nome||'').slice(0,80),atualizado:Date.parse(r.atualizado)||0}});
  WHATS_AJUDA='';if(cpv&&!cpv.error)(cpv.data||[]).forEach(r=>{if(r.chave==='whats_ajuda')WHATS_AJUDA=String(r.valor||'').replace(/\D/g,'')});
  if(cf&&!cf.error)aplicarConfig(cf.data);
  planos={};if(pl&&!pl.error)(pl.data||[]).forEach(r=>{planos[String(r.atividade)]=cleanPlano(r)});
  rels={};if(rl&&!rl.error)(rl.data||[]).forEach(r=>{const n=Number(r.presenca),g=r.gasto==null?null:Number(r.gasto);rels[String(r.atividade)]={realizada:r.realizada!==false,presenca:Number.isInteger(n)&&r.presenca!=null?n:null,gasto:Number.isFinite(g)?g:null,obs:String(r.obs||'').slice(0,1000),porNome:String(r.por_nome||'').slice(0,80),atualizado:Date.parse(r.atualizado)||0}});
  verbas={};if(vb&&!vb.error)(vb.data||[]).forEach(r=>{if(ORG[r.org]&&Number(r.ano)===ANO&&Number.isFinite(Number(r.valor)))verbas[r.org]=Number(r.valor)});
  espRes=er&&!er.error?(er.data||[]).map(r=>({id:String(r.atividade),mes:Number(r.mes),dia:Number(r.dia)||0,horario:typeof r.horario==='string'?r.horario.slice(0,5):'',nome:String(r.nome||'').slice(0,140),org:ORG[r.org]?r.org:'geral',espacos:(Array.isArray(r.espacos)?r.espacos:[]).filter(e=>ESP[e])})):[];
  solics=sl&&!sl.error?(sl.data||[]).map(cleanSol).filter(Boolean):[];
  avisosL=av&&!av.error?(av.data||[]).map(cleanAviso).filter(Boolean):[];
  if(a.error){if(/Failed to fetch|NetworkError|Load failed|fetch/i.test(String(a.error.message||''))&&usarCopia())return;setStatus('Erro ao carregar',true);toast(traduz(a.error));return}
  offline=false;
  acts=(a.data||[]).filter(r=>r.ano==null||Number(r.ano)===ANO).map(clean).filter(Boolean);items=acts;
  const adm=ad.data||[];adminIds=adm.map(r=>String(r.user_id));
  const eraDono=isDono;isDono=adm.some(r=>String(r.user_id)===myId&&r.dono);isAdmin=adminIds.includes(myId);
  if(isDono){
    if(!eraDono){meuCad=null;minhaAprov=null}
    const [m,p]=await Promise.all([sb.from('perfis').select('*').order('criado'),sb.from('aprovacoes').select('*')]);
    membros={};(m.data||[]).forEach(r=>{const c=cleanMembro(r);if(c)membros[String(r.id)]=c});
    aprovs={};(p.data||[]).forEach(r=>{const c=cleanAprov(r);if(c)aprovs[String(r.user_id)]=c});
  }else{
    meuCad=pf&&!pf.error?cleanMembro(pf.data):null;minhaAprov=ap&&!ap.error?cleanAprov(ap.data):null;
    if(!meuCad&&!isAdmin&&!autoCad&&!location.hash){autoCad=true;location.hash='cadastro'}
  }
  carregado=true;setStatus('Sincronizado');render();
  try{localStorage.setItem(LSOFF,JSON.stringify({uid:myId,ts:Date.now(),atividades:a.data||[],admins:ad.data||[],config:cf&&!cf.error?cf.data:[],meuCad:isDono?null:meuCad,minhaAprov:isDono?null:minhaAprov}))}catch(e){}
  if(view==='historico'&&isAdmin)carregarHist();
  if(view==='numeros'&&isAdmin)carregarAjudas();
  if(abrirDepois){const it=items.find(i=>i.id===abrirDepois);abrirDepois=null;if(it){if(it.mes!==mes){mes=it.mes;persistMes();render()}openForm(it)}}
  if(isDono&&view==='membros'&&chaveCriada===null)sb.rpc('chave_lembretes_criada').then(r=>{chaveCriada=r&&!r.error&&r.data?Date.parse(r.data)||0:0;if(view==='membros')render()});
  if(isDono&&view==='membros'&&ultBackup===null)sb.rpc('ultimo_backup').then(r=>{ultBackup=r&&!r.error&&r.data?Date.parse(r.data)||0:0;if(view==='membros'){const ae=document.activeElement;if(!(ae&&ae.closest&&ae.closest('#cfgform')))render()}});
  if(bvEstado==='esperando')bvTexto();
  talvezTour();
}
function agendar(){clearTimeout(recT);recT=setTimeout(carregar,350)}
function ouvir(){
  if(canal)sb.removeChannel(canal);
  canal=sb.channel('agenda').on('postgres_changes',{event:'*',schema:'public'},agendar).subscribe();
}
window.addEventListener('focus',()=>{if(myId)agendar()});

/* ================= PAPÉIS ================= */
function papel(){
  if(isAdmin)return 'admin';
  if(!carregado||meuCad===undefined)return 'carregando';
  if(!meuCad)return 'sem-cadastro';
  if(minhaAprov&&minhaAprov.status==='aprovado'&&minhaAprov.org)return 'aprovado';
  if(minhaAprov&&minhaAprov.status==='recusado')return 'recusado';
  return 'pendente';
}
const minhaOrg=()=>papel()==='aprovado'?minhaAprov.org:'';
function aplicarConfig(rows){(rows||[]).forEach(r=>{if(r.chave==='ano'){const n=Number(r.valor);if(Number.isInteger(n)&&n>=2026&&n<=2100)ANO=n}if(r.chave==='prazo')PRAZO=typeof r.valor==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.valor)?r.valor:''})}
function prazoStatus(){if(!PRAZO)return null;const p=new Date(PRAZO+'T00:00:00'),dias=Math.round((p-hojeData())/864e5);return{dias,fim:dias<0,data:p.toLocaleDateString('pt-BR')}}
const prazoFechado=()=>{const s=prazoStatus();return !isAdmin&&!!s&&s.fim};
const podeAdicionar=()=>{const p=papel();return !offline&&(p==='admin'||(p==='aprovado'&&!prazoFechado()))};
function pintaPrazo(){
  const el=$('#prazoinfo'),s=prazoStatus(),p=papel();
  if(!s||!myId||!['calendario','ano','organizacoes'].includes(view)||!['admin','aprovado'].includes(p)){el.hidden=true;return}
  let t,c='';
  if(s.fim){c='fim';t=isAdmin?`🔒 Prazo de propostas encerrado em ${s.data}. Só administradores ainda podem adicionar atividades.`:`🔒 O prazo para propor atividades terminou em ${s.data}. Para incluir algo novo, fale com o administrador.`}
  else if(s.dias===0){c='urg';t=`⏳ Hoje é o último dia para propor atividades (${s.data}).`}
  else if(s.dias<=7){c='urg';t=`⏳ ${s.dias===1?'Falta 1 dia':'Faltam '+s.dias+' dias'} para o fim do prazo de propostas (${s.data}).`}
  else t=`📅 Prazo para propor atividades: até ${s.data} · faltam ${s.dias} dias.`;
  el.className='prazoinfo'+(c?' '+c:'');el.textContent=t;el.hidden=false;
}
const podeEditar=i=>{const p=papel();return p==='admin'||(p==='aprovado'&&i.autor===myId&&i.org===minhaOrg())};
const ord=(a,b)=>(a.dia||99)-(b.dia||99)||(a.horario||'99').localeCompare(b.horario||'99')||a.criado-b.criado;
const solPend=id=>solics.find(s=>s.status==='pendente'&&s.atividade===id);
const validaHora=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
function fmtData(m,d){return d?`${d} de ${MESES[m]} (${SEM[new Date(ANO,m,d).getDay()].toLowerCase()})`:`${MESES[m]}, dia a definir`}
const vis=()=>items.filter(i=>filtro==='todas'||i.org===filtro);
function normWhats(v){let d=String(v).replace(/\D/g,'');if(d.length===10||d.length===11)d='55'+d;if(/^55\d{10,11}$/.test(d))return d;return String(v).trim().startsWith('+')&&d.length>=11&&d.length<=15?d:null}
function fmtWhats(d){if(!d)return '';if(d.startsWith('55')&&(d.length===12||d.length===13)){const r=d.slice(4);return `+55 (${d.slice(2,4)}) ${r.slice(0,-4)}-${r.slice(-4)}`}return '+'+d}

function setStatus(t,off){const s=$('#status');s.classList.toggle('off',!!off);s.querySelector('span').textContent=t}
let toastAcao=null;
function toast(msg,undo,acao){$('#tmsg').textContent=msg;$('#tbtn').hidden=!undo;toastAcao=acao||null;const b2=$('#tbtn2');b2.hidden=!acao;if(acao)b2.textContent=acao.label;$('#toast').style.display='flex';clearTimeout(toastT);toastT=setTimeout(()=>{$('#toast').style.display='none';undoItem=null;toastAcao=null},acao?12000:undo?7000:4000)}
$('#tbtn2').addEventListener('click',()=>{const a=toastAcao;toastAcao=null;clearTimeout(toastT);$('#toast').style.display='none';if(a)a.fn()});
function badge(i){return i.dia?`<span class="badge"><b>${i.dia}</b><small>${AB[i.mes]}</small></span>`:`<span class="badge wt"><small>dia a<br>definir</small></span>`}
function agRow(i){return `<li><button type="button" data-act="edit" data-id="${esc(i.id)}"${isAdmin?` draggable="true" data-drag="${esc(i.id)}"`:''} class="${i.id===flash?'pop':''}">${badge(i)}<span><span class="t">${esc(i.nome)}</span><span class="dot o-${i.org}">${ORG[i.org].n}${i.horario?` · <span class="hr">${i.horario}</span>${i.dia?'':' (a confirmar)'}`:''}</span>${(()=>{const s=solPend(i.id);return s?` <span class="tag${s.tipo==='cancelar'?' del':''}">${s.tipo==='cancelar'?'Cancelamento pendente':'Alteração pendente'}</span>`:''})()}</span><svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button></li>`}

/* ================= TELAS ================= */
function vCalendario(){
  const first=new Date(ANO,mes,1).getDay(),n=dim(mes),list=vis().filter(i=>i.mes===mes);
  const isToday=d=>now.getFullYear()===ANO&&now.getMonth()===mes&&now.getDate()===d;
  let cells='';
  for(let i=0;i<first;i++)cells+='<div class="cell out"></div>';
  for(let d=1;d<=n;d++){
    const di=list.filter(i=>i.dia===d).sort(ord);
    const pills=di.slice(0,3).map(i=>`<button type="button" class="pill o-${i.org}" data-act="edit" data-id="${esc(i.id)}"${isAdmin?` draggable="true" data-drag="${esc(i.id)}"`:''} title="${i.horario?i.horario+' · ':''}${esc(i.nome)} · ${ORG[i.org].n}"><span>${i.horario?`<b class="hr">${i.horario}</b> `:''}${esc(i.nome)}</span></button>`).join('')+(di.length>3?`<span class="more">+${di.length-3} mais</span>`:'');
    const lab=`${d} de ${MESES[mes]}${di.length?', '+plural(di.length,'atividade','atividades'):''}`;
    const rsv=reservas(mes,d),fe=feriado(mes,d),tt=[fe?(fe.f?'Ponto facultativo: ':'Feriado: ')+fe.n:'',rsv.length?'Dia reservado: '+rsv.map(x=>x.nome+' ('+ORG[x.org].n+')').join(' · '):''].filter(Boolean).join(' — ');cells+=`<div class="cell${di.length?' has':''}${isToday(d)?' today':''}${rsv.length?' res':''}${fe?' fer':''}" data-dia="${d}"${tt?` title="${esc(tt)}"`:''}>${isAdmin?`<button type="button" class="dn" data-act="pick" data-d="${d}" aria-label="${lab}. Definir atividade para este dia"><span class="d">${d}</span><span class="plus" aria-hidden="true">+</span></button>`:`<span class="dn" style="pointer-events:none" aria-label="${lab}"><span class="d">${d}</span></span>`}<div class="pills">${fe?`<span class="fer">🎉 ${esc(fe.n)}</span>`:''}${pills}</div></div>`;
  }
  const tail=(7-(first+n)%7)%7;for(let i=0;i<tail;i++)cells+='<div class="cell out"></div>';
  const all=items.filter(i=>i.mes===mes),com=all.filter(i=>i.dia),orgsCom=new Set(all.map(i=>i.org)),falta=ORGS_LID.filter(o=>!orgsCom.has(o.k));
  const pct=all.length?Math.round(com.length/all.length*100):0;
  const wait=list.filter(i=>!i.dia).sort(ord),dated=list.filter(i=>i.dia).sort(ord),load=!carregado;
  return `<div class="layout"><div>
    <div class="mnav"><button class="btn" type="button" data-act="prev" aria-label="Mês anterior"${mes===0?' disabled':''}>‹</button><b>${MESES[mes]} de ${ANO}</b><button class="btn" type="button" data-act="next" aria-label="Próximo mês"${mes===11?' disabled':''}>›</button></div>
    <div class="card cal"><div class="wk">${SEM.map(s=>`<span>${s}</span>`).join('')}</div><div class="days">${cells}</div></div>
    <div class="legend">${ORGS.map(o=>`<span class="leg o-${o.k}"><i></i>${o.n}</span>`).join('')}</div>
  </div>
  <div class="col">
    <section class="card panel wait" id="waitbox"><h3>Aguardando data · ${MESES[mes]}</h3>
      ${isAdmin&&wait.length?'<p class="hint">Arraste uma atividade para um dia do calendário, ou clique no dia.</p>':''}
      ${wait.length?`<ul class="ag">${wait.map(agRow).join('')}</ul>`:`<p class="empty">${load?'Carregando…':isAdmin&&dated.length?'Tudo com data. Arraste um item do calendário para cá para tirar a data.':'Nenhuma atividade aguardando data.'}</p>`}
      ${!isAdmin&&wait.length?'<p class="small" style="margin-top:8px">O administrador vai definir o dia destas atividades.</p>':''}
    </section>
    <section class="card panel"><h3>Com data definida</h3>${dated.length?`<ul class="ag">${dated.map(agRow).join('')}</ul>`:`<p class="empty">${load?'Carregando…':'Nenhuma atividade com dia definido ainda.'}</p>`}</section>
    <section class="card panel"><h3>Resumo de ${MESES[mes]} de ${ANO}</h3>
      <div class="tiles"><div class="tile"><b>${all.length}</b><span>Atividades</span></div><div class="tile g"><b>${com.length}</b><span>Com data</span></div><div class="tile"><b>${all.length-com.length}</b><span>Aguardando</span></div></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="small">${all.length?`${com.length} de ${all.length} atividades já têm dia definido (${pct}%).`:'Nenhuma atividade marcada neste mês.'}</p>
      ${falta.length&&falta.length<ORGS.length?`<p class="small" style="margin-top:10px">Ainda sem atividade neste mês:</p><div class="miss">${falta.map(o=>`<span class="o-${o.k}">${o.n}</span>`).join('')}</div>`:''}
    </section>
  </div></div>`;
}
function vAno(){
  const v=vis();
  return `<div class="year">${MESES.map((m,mi)=>{const l=v.filter(i=>i.mes===mi).sort(ord);
    return `<section class="card"><h3><button type="button" data-act="goto" data-m="${mi}">${m}</button><small>${plural(l.length,'atividade','atividades')}</small></h3>${l.length?`<ul class="ag">${l.map(agRow).join('')}</ul>`:`<p class="empty">Nada marcado.</p>`}</section>`}).join('')}</div>`;
}
function vOrg(){
  const tot=ORGS.map(o=>items.filter(i=>i.org===o.k).length);
  return `<div class="card panel"><h3>Atividades por organização em ${ANO}</h3><div class="scroll"><table><thead><tr><th>Organização</th>${AB.map(a=>`<th>${a}</th>`).join('')}<th>Total</th></tr></thead><tbody>${ORGS.map((o,oi)=>`<tr><td><span class="dot o-${o.k}" style="color:var(--ink);font-size:14px">${o.n}</span></td>${MESES.map((_,mi)=>{const c=items.filter(i=>i.org===o.k&&i.mes===mi).length;return `<td class="${c?'':'z'}">${c||'·'}</td>`}).join('')}<td><b>${tot[oi]}</b></td></tr>`).join('')}</tbody></table></div>
  <p class="small" style="margin-top:12px">Meses com “·” ainda não têm atividade daquela organização.</p></div>`;
}
function stPill(){const p=papel();return p==='aprovado'?`<span class="st ok">Aprovado · ${ORG[minhaOrg()].n}</span>`:p==='recusado'?'<span class="st no">Cadastro recusado</span>':p==='pendente'?'<span class="st">Aguardando aprovação</span>':''}
function vCadastro(){
  const p=papel();
  if(p==='admin')return `<div class="card cad"><h2>Cadastro</h2><p class="small">Você é administrador e não precisa de cadastro.${isDono?' Os pedidos dos líderes aparecem em <a href="#membros">Membros</a>.':''}</p></div>`;
  if(p==='carregando')return `<div class="card cad"><p class="empty">Carregando…</p></div>`;
  const c=meuCad||{nome:meNome,org:'',whats:''};
  const mudou=p==='aprovado'&&c.org&&c.org!==minhaOrg();
  return `<form class="card cad" id="cadform" novalidate>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h2>${meuCad?'Meu cadastro':'Cadastro de líder'}</h2>${stPill()}</div>
    <p class="small">${meuCad?(p==='aprovado'?'Você já pode marcar atividades da sua organização.':p==='recusado'?'O administrador recusou este cadastro. Corrija os dados e envie de novo, ou fale com ele.':'O administrador vai conferir seus dados e liberar seu acesso.'):'Preencha uma vez. Depois que o administrador aprovar, você poderá marcar atividades da sua organização.'}</p>
    <div><label for="cnome">Nome completo</label><input id="cnome" maxlength="80" autocomplete="name" value="${esc(c.nome)}"></div>
    <div><label for="corg">Organização que você lidera</label><select id="corg"><option value="">Escolha…</option>${orgOpts(c.org)}</select>${mudou?`<p class="small" style="margin-top:6px">Pedido de mudança para ${aOrg(c.org)} enviado. Até o administrador aceitar, você continua ${naOrg(minhaOrg())}.</p>`:''}</div>
    <div><label for="cwhats">WhatsApp</label><input id="cwhats" type="tel" inputmode="tel" autocomplete="tel" placeholder="(61) 99999-9999" value="${esc(c.whats?fmtWhats(c.whats):'')}"><p class="small" style="margin-top:6px">Use o número com DDD. Para número de outro país, comece com + e o código do país.</p></div>
    <label class="chk"><input type="checkbox" id="cok"${meuCad?' checked':''}><span>Autorizo que o administrador da ala veja meu nome, e-mail e WhatsApp para falar comigo sobre as atividades.</span></label>
    <div class="err" id="cerr" role="alert"></div>
    <div><button class="btn pri" type="submit" id="csave">${meuCad?'Salvar alterações':'Enviar cadastro'}</button></div>
  </form>`;
}
function vMembros(){
  if(!isDono)return `<div class="card cad"><p class="small">Só o dono vê esta tela.</p></div>`;
  const ids=Object.keys(membros);
  const pend=ids.filter(id=>!aprovs[id]);
  const mud=ids.filter(id=>aprovs[id]&&aprovs[id].status==='aprovado'&&membros[id].org&&membros[id].org!==aprovs[id].org);
  const apr=ids.filter(id=>aprovs[id]&&aprovs[id].status==='aprovado').sort((a,b)=>ORGS.findIndex(o=>o.k===aprovs[a].org)-ORGS.findIndex(o=>o.k===aprovs[b].org));
  const rec=ids.filter(id=>aprovs[id]&&aprovs[id].status==='recusado');
  const info=id=>{const m=membros[id];return `<div><b>${esc(m.nome||'Sem nome')}${adminIds.includes(id)?' <span class="st ok" style="margin-left:6px">Administrador</span>':''}</b><p class="small">${m.email?esc(m.email)+' · ':''}${m.whats?`<a href="https://wa.me/${esc(m.whats)}" target="_blank" rel="noopener">WhatsApp ${esc(fmtWhats(m.whats))}</a>`:'sem WhatsApp'}</p></div>`};
  const sec=(t,arr,f,vazio)=>`<h3 class="memh" style="font-size:17px;margin-top:6px">${t} <span class="small">(${arr.length})</span></h3><div class="mems">${arr.length?arr.map(f).join(''):`<p class="empty">${vazio}</p>`}</div>`;
  return sec('Aguardando aprovação',pend,id=>`<div class="card mem" data-uid="${esc(id)}">${info(id)}<div class="small">Pediu: <b style="display:inline;font-size:14px">${membros[id].org?ORG[membros[id].org].n:'—'}</b></div><div class="ctl"><select aria-label="Organização" data-org>${orgOpts(membros[id].org)}</select><button class="btn" type="button" data-mem="recusar">Recusar</button><button class="btn pri" type="button" data-mem="aprovar">Aprovar</button></div></div>`,'Nenhum pedido novo.')
   +(mud.length?sec('Pedidos de mudança de organização',mud,id=>`<div class="card mem" data-uid="${esc(id)}">${info(id)}<div class="small">Quer mudar ${daOrg(aprovs[id].org)} para <b style="display:inline;font-size:14px">${aOrg(membros[id].org)}</b></div><div class="ctl"><button class="btn pri" type="button" data-mem="mudar">Aceitar mudança</button></div></div>`,''):'')
   +sec('Líderes aprovados',apr,id=>`<div class="card mem" data-uid="${esc(id)}">${info(id)}<div><span class="dot o-${aprovs[id].org}" style="color:var(--ink);font-size:14px">${ORG[aprovs[id].org].n}</span></div><div class="ctl"><select aria-label="Organização" data-org>${orgOpts(aprovs[id].org)}</select><button class="btn" type="button" data-mem="aprovar">Salvar</button><button class="btn" type="button" data-mem="${adminIds.includes(id)?'desadmin':'admin'}">${adminIds.includes(id)?'Tirar de administrador':'Tornar administrador'}</button><button class="btn danger" type="button" data-mem="remover">Remover</button></div></div>`,'Ninguém aprovado ainda.')
   +(rec.length?sec('Recusados',rec,id=>`<div class="card mem" data-uid="${esc(id)}">${info(id)}<div class="small">Pediu: ${membros[id].org?ORG[membros[id].org].n:'—'}</div><div class="ctl"><select aria-label="Organização" data-org>${orgOpts(membros[id].org)}</select><button class="btn" type="button" data-mem="aprovar">Aprovar</button><button class="btn danger" type="button" data-mem="remover">Apagar</button></div></div>`,''):'')
   +`<p class="small">Administradores definem os dias e editam qualquer atividade; só você aprova cadastros e vê os contatos. “Remover” apaga o cadastro e a aprovação: a pessoa continua com a conta de login, mas precisa se cadastrar de novo e ser aprovada para marcar atividades.</p>`
   +cfgHtml()+roboHtml()+backupHtml();
}
function cfgHtml(){
  const s=prazoStatus(),anos=[];for(let y=Math.min(ANO,new Date().getFullYear());y<=Math.max(ANO,new Date().getFullYear())+3;y++)anos.push(y);
  return `<form class="card cad" id="cfgform" style="margin-top:18px" novalidate><h3 style="font-size:17px;margin:0 0 6px">Configurações da agenda</h3><p class="small" style="margin:0 0 12px">O prazo vale para os líderes: depois dessa data eles não conseguem propor atividades novas (pedidos de alteração continuam). Administradores não têm prazo.</p>
  <div class="cfg"><div><label for="cfgano">Ano da agenda</label><select id="cfgano">${anos.map(y=>`<option value="${y}"${y===ANO?' selected':''}>${y}</option>`).join('')}</select></div>
  <div><label for="cfgprazo">Prazo para os líderes proporem atividades</label><input type="date" id="cfgprazo" value="${esc(PRAZO)}"${PRAZO?'':' disabled'}><label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px;font-weight:500"><input type="checkbox" id="cfgsem"${PRAZO?'':' checked'}> Sem prazo</label></div></div>
  <div class="cfg"><div><label for="cfgwa">WhatsApp da liderança para pedidos de ajuda</label><input id="cfgwa" inputmode="tel" maxlength="20" autocomplete="off" placeholder="Ex.: 61 99999-8888" value="${esc(fmtWhats(WHATS_AJUDA))}"><p class="small" style="margin:6px 0 0">Recebe o “Preciso de ajuda da liderança” dos líderes. Só líderes aprovados e administradores veem este número.</p></div></div>
  <div class="err" id="cfgerr" role="alert"></div>
  <div class="notif" style="justify-content:flex-start;align-items:center;gap:12px"><button type="submit" class="btn pri" id="cfgsalvar">Salvar configurações</button><span class="small">${s?(s.fim?'Prazo encerrado em '+s.data:'Prazo atual: '+s.data):'Sem prazo definido'}</span></div></form>`;
}
async function salvarConfig(){
  if(!isDono||busy)return;const ano=Number($('#cfgano').value),sem=$('#cfgsem').checked,pz=$('#cfgprazo').value;$('#cfgerr').textContent='';
  if(!sem&&!/^\d{4}-\d{2}-\d{2}$/.test(pz)){$('#cfgerr').textContent='Escolha a data do prazo ou marque “Sem prazo”.';return}
  const wa=$('#cfgwa').value.replace(/\D/g,'');if(wa&&(wa.length<10||wa.length>13)){$('#cfgerr').textContent='WhatsApp inválido: use DDD e número, por exemplo 61 99999-8888.';return}
  const grava=async()=>{if(document.activeElement)document.activeElement.blur();busy=true;let ok=!!await exec(sb.from('config').update({valor:sem?null:pz}).eq('chave','prazo'));if(ok&&wa!==WHATS_AJUDA.replace(/^55(?=\d{10,11}$)/,'')&&wa!==WHATS_AJUDA)ok=!!await exec(sb.from('config_priv').update({valor:wa}).eq('chave','whats_ajuda'));if(ok&&ano!==ANO)ok=!!await exec(sb.from('config').update({valor:ano}).eq('chave','ano'));busy=false;if(!ok)return false;
    const mudouAno=ano!==ANO;if(mudouAno){ANO=ano;mes=0;persistMes()}toast(mudouAno?`Agenda agora é de ${ano}.`:'Configurações salvas.');carregar();return true};
  if(ano!==ANO)return pergunta({titulo:`Mudar a agenda para ${ano}?`,html:`<p style="margin:0 0 10px">O calendário, o link público, as exportações e as propostas dos líderes passam a ser de <b>${ano}</b>.</p><p class="small" style="margin:0">As atividades de ${ANO} <b>não são apagadas</b>: ficam guardadas no banco e na cópia de segurança, e voltam a aparecer se você escolher ${ANO} de novo.</p>`,ok:`Mudar para ${ano}`,acao:grava});
  await grava();
}
document.addEventListener('submit',e=>{if(e.target.id==='cfgform'){e.preventDefault();salvarConfig()}});
document.addEventListener('change',e=>{if(e.target.id==='cfgsem'){$('#cfgprazo').disabled=e.target.checked;if(!e.target.checked)$('#cfgprazo').focus()}if(e.target.id==='historg'){histOrg=e.target.value;render()}});
function roboHtml(){
  const c=chaveCriada;
  return `<div class="card cad" style="margin-top:18px"><h3 style="font-size:17px;margin:0 0 6px">📧 Robô de e-mails (lembretes)</h3><p class="small" style="margin:0 0 10px">Todo dia às 8h, um script na sua conta Google envia aos líderes os lembretes de 1 mês, 1 semana e 1 dia antes de cada atividade. O script usa uma chave secreta para buscar só o necessário.</p>
  <p class="small" style="margin:0 0 10px">${c===null?'Verificando…':c?'🔑 Chave ativa, criada em '+new Date(c).toLocaleDateString('pt-BR')+'. Gerar outra desliga a anterior.':'⚠️ Nenhuma chave gerada ainda: os e-mails só começam depois que você gerar a chave e colar no script.'}</p>
  <div class="notif" style="justify-content:flex-start;gap:12px"><button type="button" class="btn${c?'':' pri'}" id="chavegerar">${c?'Gerar nova chave':'Gerar chave do robô'}</button></div>
  <div id="chavebox" hidden><div class="chavebox"><input id="chaveval" readonly aria-label="Chave do robô de e-mails"><button type="button" class="btn pri" id="chavecopiar">Copiar</button></div><p class="small" style="margin:8px 0 0">Cole esta chave no script do Google (Configurações do projeto → Propriedades do script → <b>CHAVE_LEMBRETES</b>). Ela aparece só agora: se perder, gere outra.</p></div></div>`;
}
async function gerarChave(){
  if(!isDono||busy)return;
  const gera=async()=>{busy=true;const r=await exec(sb.rpc('gerar_chave_lembretes'));busy=false;if(!r||!r.data)return false;chaveCriada=Date.now();render();setTimeout(()=>{const bx=$('#chavebox');if(bx){bx.hidden=false;$('#chaveval').value=r.data;$('#chaveval').select()}},50);return true};
  if(chaveCriada)return pergunta({titulo:'Gerar nova chave?',html:'<p style="margin:0">A chave atual deixa de funcionar e o robô só volta a enviar e-mails depois que você colar a nova chave no script do Google.</p>',ok:'Gerar nova chave',perigo:true,acao:gera});
  await gera();
}
function backupHtml(){
  let ult='';try{const t=Number(localStorage.getItem('ultimoBackup'));if(t)ult=new Date(t).toLocaleDateString('pt-BR')}catch(e){}
  return `<div class="card cad" style="margin-top:18px"><h3 style="font-size:17px;margin:0 0 6px">Cópia de segurança</h3><p class="small" style="margin:0 0 12px">Baixa um arquivo com todas as atividades, pedidos, cadastros e aprovações. O plano gratuito do Supabase não guarda backups que você possa restaurar. Por isso, o robô de e-mails salva uma cópia <b>toda semana no seu Google Drive</b>, na pasta “Agenda da Ala - cópias de segurança”, e mantém as 12 mais recentes. Você também pode baixar uma cópia agora. <b>O arquivo tem WhatsApp e e-mail dos líderes: guarde em local seguro e não compartilhe.</b></p><p class="small" style="margin:0 0 12px">${ultBackup===null?'Verificando a última cópia automática…':ultBackup?'☁️ Última cópia automática no Drive: '+esc(new Date(ultBackup).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})):'⚠️ Nenhuma cópia automática ainda. Ela começa depois que o robô de e-mails for atualizado e instalado.'}</p><div class="notif" style="justify-content:flex-start;align-items:center;gap:12px"><button type="button" class="btn pri" id="backupBtn">Baixar cópia dos dados</button><span class="small">${ult?'Última cópia baixada neste aparelho: '+esc(ult):'Nenhuma cópia baixada neste aparelho ainda.'}</span></div></div>`;
}
async function baixarBackup(){
  if(!isDono||busy)return;busy=true;const b=$('#backupBtn');if(b){b.disabled=true;b.textContent='Preparando…'}
  try{
    const tabs=['atividades','solicitacoes','perfis','aprovacoes','admins','config','historico','responsaveis','lembretes_enviados','planos','relatorios','orcamento_org'],dados={};
    for(const t of tabs){const r=await sb.from(t).select('*').limit(5000);if(r.error)throw r.error;dados[t]=r.data||[]}
    const hoje=new Date(),d=hoje.toISOString().slice(0,10);
    const arq={site:`Calendário de Atividades Ala Ceilândia Sul ${ANO}`,ano:ANO,gerado:hoje.toISOString(),versao:1,contagem:Object.fromEntries(tabs.map(t=>[t,dados[t].length])),tabelas:dados};
    baixar(new Blob([JSON.stringify(arq,null,2)],{type:'application/json'}),`backup-calendario-ala-${d}.json`);
    try{localStorage.setItem('ultimoBackup',String(hoje.getTime()))}catch(e){}
    toast(`Cópia baixada: ${plural(dados.atividades.length,'atividade','atividades')}, ${plural(dados.perfis.length,'cadastro','cadastros')}.`);
  }catch(e){toast('Não foi possível baixar a cópia: '+traduz(e))}
  finally{busy=false;render()}
}
function aviso(){
  const p=papel(),a=$('#aviso');let h='',cls='';
  if(['calendario','ano','organizacoes'].includes(view)){
    if(p==='sem-cadastro')h=`<p><b>Faça seu cadastro</b> para marcar atividades da sua organização.</p><a class="btn pri" href="#cadastro">Fazer cadastro</a>`;
    else if(p==='pendente')h=`<p><b>Cadastro enviado.</b> Aguarde o administrador aprovar para marcar atividades.</p><a class="btn" href="#cadastro">Ver cadastro</a>`;
    else if(p==='recusado'){cls='no';h=`<p><b>Seu cadastro foi recusado.</b> Revise os dados ou fale com o administrador.</p><a class="btn" href="#cadastro">Revisar</a>`}
    else if(isAdmin){
      const na=items.filter(i=>!i.dia).length,ns=solics.filter(s=>s.status==='pendente').length,nm=isDono?Object.keys(membros).filter(id=>!aprovs[id]).length:0,partes=[],btns=[];
      if(ns){partes.push(`<b>${plural(ns,'pedido de alteração/cancelamento','pedidos de alteração/cancelamento')}</b> dos líderes`);btns.push('<a class="btn pri" href="#pendentes">Ver pedidos</a>')}
      if(na){const ms=[...new Set(items.filter(i=>!i.dia).map(i=>i.mes))].sort((x,y)=>x-y);partes.push(`<b>${plural(na,'atividade aguarda','atividades aguardam')} dia</b> (${ms.map(m=>AB[m]).join(', ')})`);if(!ns)btns.push('<a class="btn pri" href="#pendentes">Definir dias</a>')}
      if(nm){partes.push(`<b>${plural(nm,'novo líder aguarda','novos líderes aguardam')} aprovação</b>`);btns.push(`<a class="btn${na||ns?'':' pri'}" href="#membros">Ver cadastros</a>`)}
      const nc=conflitosFuturos().length;if(nc){partes.push(`<b>${plural(nc,'conflito','conflitos')} de espaço</b> no prédio`);if(!btns.length)btns.push('<a class="btn pri" href="#pendentes">Ver</a>')}
      const sr=semRespSemana().length;if(sr){partes.push(`<b>${plural(sr,'atividade da próxima semana está','atividades da próxima semana estão')} sem responsáveis</b>`);if(!btns.length)btns.push('<a class="btn pri" href="#pendentes">Ver</a>')}
      if(partes.length)h=`<p>🔔 ${partes.join(' · ')}.</p><div class="notif">${btns.join('')}</div>`;
    }else if(p==='aprovado'){
      const resp=solics.filter(s=>s.autor===myId&&s.status!=='pendente'&&!s.visto),pend=solics.filter(s=>s.autor===myId&&s.status==='pendente');
      if(resp.length||avisosL.length){
        const tit=resp.length&&avisosL.length?'Novidades nas suas atividades':resp.length?`O administrador respondeu ${resp.length===1?'ao seu pedido':'aos seus pedidos'}`:avisosL.length===1?(avisosL[0].tipo==='agendada'?'Sua atividade foi agendada pelo administrador':'Sua atividade foi remarcada pelo administrador'):'O administrador definiu a data das suas atividades';
        h=`<div class="resp" style="width:100%"><p><b>🔔 ${tit}:</b></p>${avisosL.map(v=>{const qd=`<b>${fmtData(v.mes,v.dia)}${v.horario?' às '+v.horario:''}</b>`;let t;
          if(v.tipo==='agendada')t=`📅 <b>Agendada</b>: “${esc(v.nome)}” será em ${qd}.`;
          else t=`📅 <b>Remarcada</b>: “${esc(v.nome)}”${v.antesMes!==null&&v.antesDia?` saiu de ${fmtData(v.antesMes,v.antesDia)}${v.antesHora?' às '+v.antesHora:''} e`:''} agora é em ${qd}.`;
          return `<div class="linha"><span>${t}</span><button type="button" class="btn" data-vermes="${v.mes}">Ver no calendário</button></div>`}).join('')}${resp.map(s=>{const nm=esc((s.final||s.depois||s.antes).nome||s.antes.nome);let t;
          if(s.status==='recusado')t=`❌ <b>${s.tipo==='cancelar'?'Cancelamento':'Alteração'} recusado(a)</b>: “${esc(s.antes.nome)}” continua como estava.`;
          else if(s.tipo==='cancelar')t=`✅ <b>Cancelamento aprovado</b>: “${esc(s.antes.nome)}” foi retirada do calendário.`;
          else{const f=s.final||s.depois;t=`✅ <b>Alteração aprovada</b>: “${nm}” agora em <b>${fmtData(f.mes,f.dia)}${f.horario?' às '+f.horario:''}</b>.`}
          return `<div class="linha${s.status==='recusado'?' no':''}"><span>${t}${s.resposta?`<br><span class="small">Resposta: ${esc(s.resposta)}</span>`:''}</span>${s.status==='aprovado'&&s.tipo==='alterar'?`<button type="button" class="btn" data-vermes="${(s.final||s.depois).mes}">Ver no calendário</button>`:''}</div>`}).join('')}<div class="notif"><button type="button" class="btn pri" id="vistoBtn">Ok, entendi</button></div></div>`;
      }else if(pend.length)h=`<p>⏳ ${plural(pend.length,'pedido seu aguarda','pedidos seus aguardam')} aprovação do administrador.</p>`;
      h+=proximasHtml();
    }
  }
  a.className='aviso'+(cls?' '+cls:'');a.hidden=!h;a.innerHTML=h;
}
$('#aviso').addEventListener('click',async e=>{
  const ab=e.target.closest('[data-abrir]');if(ab){const it=items.find(i=>i.id===ab.dataset.abrir);if(it)openForm(it);return}
  const v=e.target.closest('[data-vermes]');if(v){mes=Number(v.dataset.vermes);persistMes();location.hash='calendario';render();return}
  if(e.target.id==='vistoBtn'){const ids=solics.filter(s=>s.autor===myId&&s.status!=='pendente'&&!s.visto).map(s=>s.id),avs=avisosL.map(v=>v.id);solics=solics.filter(s=>!ids.includes(s.id));avisosL=[];render();if(ids.length)await exec(sb.from('solicitacoes').update({visto:true}).in('id',ids));if(avs.length)await exec(sb.from('avisos').update({visto:true}).in('id',avs))}
});
function notifs(){
  const na=isAdmin?items.filter(i=>!i.dia).length+solics.filter(s=>s.status==='pendente').length:0,nm=isDono?Object.keys(membros).filter(id=>!aprovs[id]).length:0,nr=!isAdmin?solics.filter(s=>s.autor===myId&&s.status!=='pendente'&&!s.visto).length+avisosL.length:0;
  $('#navpend').hidden=!isAdmin;$('#navhist').hidden=!isAdmin;$('#navnum').hidden=!isAdmin;$('#pendcnt').hidden=!na;$('#pendcnt').textContent=na;
  const t=`Calendário de Atividades Ala Ceilândia Sul ${ANO}`,n=na+nm+nr;document.title=n?`(${n}) ${t}`:t;
}
function vPendentes(){
  if(!isAdmin)return `<div class="card cad"><p class="small">Só administradores veem esta tela.</p></div>`;
  const todos=items.filter(i=>!i.dia),cnt={};todos.forEach(i=>cnt[i.org]=(cnt[i.org]||0)+1);
  const lista=todos.filter(i=>pendOrg==='todas'||i.org===pendOrg).sort((a,b)=>a.mes-b.mes||a.criado-b.criado);
  const meses=[...new Set(lista.map(i=>i.mes))];
  const chips=`<div class="chips">${[['todas','Todas',todos.length],...ORGS.filter(o=>cnt[o.k]).map(o=>[o.k,o.n,cnt[o.k]])].map(([k,n,c])=>`<label class="chip"><input type="radio" name="pfilt" value="${k}"${pendOrg===k?' checked':''}><span>${k==='todas'?'':`<i style="width:9px;height:9px;border-radius:50%;background:var(--o-${k});margin-right:8px;display:inline-block"></i>`}${n} · ${c}</span></label>`).join('')}</div>`;
  const sp=solics.filter(s=>s.status==='pendente');
  const sr=semRespSemana().sort((x,y)=>diasPara(x)-diasPara(y));
  const respSec=sr.length?`<section><h3 class="memh" style="font-size:17px;margin:0 0 10px">Sem responsáveis na próxima semana <span class="small">(${sr.length})</span></h3><div class="prox">${sr.map(i=>`<div class="linha"><span>📅 <b>${esc(i.nome)}</b> · <span class="dot o-${i.org}" style="display:inline-flex">${ORG[i.org].n}</span> · ${dataCurta(i)}${i.horario?' às '+i.horario:''} · ${faltamTxt(diasPara(i))} <span class="stt ${respStatus(i).c}">Falta: ${respFalta(i).map(x=>x[2]).join(' ')}</span></span><button type="button" class="btn" data-abrir="${esc(i.id)}">Abrir</button></div>`).join('')}</div></section>`:'';
  const rp=relPendentes(),cfs=conflitosFuturos();
  const relSec=rp.length?`<section><h3 class="memh" style="font-size:17px;margin:0 0 10px">Relatórios pendentes <span class="small">(${rp.length})</span></h3><div class="prox">${rp.map(i=>`<div class="linha"><span>📝 <b>${esc(i.nome)}</b> · <span class="dot o-${i.org}" style="display:inline-flex">${ORG[i.org].n}</span> · ${dataCurta(i)} · foi há ${-diasPara(i)} ${-diasPara(i)===1?'dia':'dias'}</span><button type="button" class="btn" data-abrir="${esc(i.id)}">Abrir</button></div>`).join('')}</div></section>`:'';
  const cfSec=cfs.length?`<section><h3 class="memh" style="font-size:17px;margin:0 0 10px">Conflitos de espaço <span class="small">(${cfs.length})</span></h3><div class="prox">${cfs.map(c=>`<div class="linha"><span>🏛️ <b>${ESP[c.e][1]}</b> · ${c.d} de ${MESES[c.m]}: ${c.l.map(x=>`“${esc(x.nome)}” (${ORG[x.org].n}${x.horario?', '+x.horario:''})`).join(' e ')}</span><button type="button" class="btn" data-abrir="${esc(c.l[0].id)}">Abrir</button></div>`).join('')}</div></section>`:'';
  const pedidos=cfSec+respSec+relSec+(sp.length?`<section><h3 class="memh" style="font-size:17px;margin:0 0 10px">Pedidos dos líderes <span class="small">(${sp.length})</span></h3><div class="mems" style="margin:0">${sp.map(cardPedido).join('')}</div></section>`:'');
  if(!todos.length)return `<div class="pend">${pedidos}<div class="card cad"><h2>${sp.length?'Nenhuma atividade aguardando dia':'Tudo em dia ✓'}</h2><p class="small">Quando um líder marcar uma atividade, ela aparece aqui com o mês escolhido.</p></div></div>`;
  return `<div class="pend">${pedidos}
    <div class="ptiles"><div class="tile"><b>${todos.length}</b><span>Aguardando dia</span></div><div class="tile"><b>${new Set(todos.map(i=>i.mes)).size}</b><span>Meses</span></div><div class="tile"><b>${Object.keys(cnt).length}</b><span>Organizações</span></div></div>
    ${chips}
    <p class="small" style="margin:0">Toque numa atividade para escolher o dia dentro do mês que o líder pediu.</p>
    ${meses.map(m=>{const l=lista.filter(i=>i.mes===m);return `<section class="pmes"><h3>${MESES[m]} <small>${plural(l.length,'atividade','atividades')}</small></h3>${l.map(i=>`<button type="button" class="prow o-${i.org}" data-act="designar" data-id="${esc(i.id)}"><span class="bar"></span><span><span class="t">${esc(i.nome)}</span><span class="s"><span class="dot o-${i.org}">${ORG[i.org].n}</span>${i.horario?' · <span class="hr">'+i.horario+'</span> (pedido)':''}${i.autorNome?' · marcada por '+esc(i.autorNome):''}${i.detalhes?' · '+esc(i.detalhes.slice(0,80))+(i.detalhes.length>80?'…':''):''}</span></span><span class="go">Definir dia →</span></button>`).join('')}</section>`}).join('')}
  </div>`;
}
function cardPedido(s){
  const A=s.antes,D=s.depois,canc=s.tipo==='cancelar',cel=(x,y,f)=>{const mud=!canc&&f(x)!==f(y);return `<td>${mud?`<span class="de">${f(x)}</span> → <span class="para">${f(y)}</span>`:f(x)}</td>`},row=(lab,x,y,f)=>{const mud=!canc&&f(x)!==f(y);return `<tr class="${mud?'mud':''}"><td>${lab}</td>${cel(x,y,f)}</tr>`};
  const fm=o=>MESES[o.mes],fd=o=>o.dia?String(o.dia):'a definir',fh=o=>o.horario||'—',fn=o=>esc(o.nome),fl=o=>esc(o.detalhes||'—');
  const Dd=D?{...D,dia:D.mes===A.mes?A.dia:0}:A;
  return `<div class="card scard" data-sol="${esc(s.id)}"><div class="top"><span><span class="tag${canc?' del':''}">${canc?'Cancelamento':'Alteração'}</span> <span class="nm">${esc(A.nome)}</span></span><span class="dot o-${A.org}">${ORG[A.org]?ORG[A.org].n:''}</span></div>
    <p class="small" style="margin:0">Pedido por ${esc(s.autorNome||'líder')} em ${new Date(s.criado).toLocaleDateString('pt-BR')}${s.motivo?` · motivo: “${esc(s.motivo)}”`:''}</p>
    <table class="diff">${row('Mês',A,Dd,fm)}${row('Dia',A,Dd,fd)}${row('Horário',A,Dd,fh)}${row('Nome',A,Dd,fn)}${row('Local/obs.',A,Dd,fl)}</table>
    ${!canc&&D.mes!==A.mes?'<p class="small" style="margin:0">O mês mudou: ao aprovar, escolha o novo dia.</p>':''}
    <div class="sbtns"><button type="button" class="btn" data-sact="recusar">Recusar</button><button type="button" class="btn pri${canc?' danger-pri':''}" data-sact="aprovar">${canc?'Confirmar exclusão':'Aprovar alteração'}</button></div></div>`;
}
function responderPedido(id,acao){
  const s=solics.find(x=>x.id===id);if(!s)return;
  const rpc=async(ok,dia,hora,resp)=>{const r=await exec(sb.rpc('resolver_solicitacao',{p_id:id,p_aprovar:ok,p_dia:dia||null,p_horario:hora===undefined?null:hora,p_resposta:resp||''}));if(!r){$('#qerr').textContent=$('#ferr').textContent;return false}
    const base={...s.antes,autor:s.autor},alvo=!ok?base:s.tipo==='cancelar'?base:{...base,...s.depois,org:s.antes.org,dia:dia||0,horario:hora===undefined||hora===null?(s.depois.horario||''):hora};
    const msg=msgLider(!ok?'recusado':s.tipo==='cancelar'?'cancelar':'alterar',alvo,resp);
    toast(ok?(s.tipo==='cancelar'?'Cancelamento confirmado. O líder será avisado no site.':'Alteração aprovada. O líder será avisado no site.'):'Pedido recusado. O líder será avisado no site.',false,acaoWa(s.autor,msg));carregar();return true};
  if(acao==='recusar')return pergunta({titulo:'Recusar pedido',html:`<p style="margin:0 0 12px">Recusar o pedido de ${s.tipo==='cancelar'?'cancelamento':'alteração'} de <b>${esc(s.antes.nome)}</b>? A atividade continua como está.</p><label for="qresp">Resposta ao líder (opcional)</label><input id="qresp" maxlength="300" autocomplete="off">`,ok:'Recusar pedido',acao:()=>rpc(false,null,undefined,$('#qresp').value.trim())});
  if(s.tipo==='cancelar')return pergunta({titulo:'Confirmar exclusão',html:`<p style="margin:0 0 12px">Excluir <b>${esc(s.antes.nome)}</b> (${fmtData(s.antes.mes,s.antes.dia)}${s.antes.horario?' às '+s.antes.horario:''})? Ela sai do calendário e do calendário público.</p><label for="qresp">Mensagem ao líder (opcional)</label><input id="qresp" maxlength="300" autocomplete="off">`,ok:'Excluir atividade',perigo:true,acao:()=>rpc(true,null,undefined,$('#qresp').value.trim())});
  const D=s.depois,m=D.mes,diaIni=m===s.antes.mes?s.antes.dia:0;
  let ackRes=0;const ops='<option value="0">A definir</option>'+Array.from({length:dim(m)},(_,i)=>{const d=i+1,oc=items.filter(x=>x.mes===m&&x.dia===d&&x.id!==s.atividade).length,rs=reservas(m,d,s.atividade),fe=feriado(m,d);return `<option value="${d}"${d===diaIni?' selected':''}>${d} · ${SEM[new Date(ANO,m,d).getDay()].toLowerCase()}${fe?' · 🎉 '+esc(fe.n):''}${rs.length?' · reservado: '+esc(rs.map(x=>x.nome).join(', ')):oc?` (${oc} já marcada${oc>1?'s':''})`:''}</option>`}).join('');
  pergunta({titulo:'Aprovar alteração',html:`<p style="margin:0 0 12px"><b>${esc(D.nome)}</b> em <b>${MESES[m]}</b>. Confira o dia e o horário antes de aprovar.</p><div class="two"><div><label for="qdia">Dia</label><select id="qdia">${ops}</select></div><div><label for="qhora">Horário (24 horas)</label><input id="qhora" inputmode="numeric" maxlength="5" value="${esc(D.horario||'')}" placeholder="Ex.: 19:00"></div></div><div style="margin-top:12px"><label for="qresp">Mensagem ao líder (opcional)</label><input id="qresp" maxlength="300" autocomplete="off"></div>`,ok:'Aprovar alteração',
    acao:()=>{const h=$('#qhora').value.trim();if(h&&!validaHora(h)){$('#qerr').textContent='Horário inválido: use 24 horas, de 00:00 a 23:59.';return false}const dd=Number($('#qdia').value)||0,al=alertasDia(m,dd,s.atividade);if(dd&&al.tem&&ackRes!==dd){ackRes=dd;$('#qerr').innerHTML=alertasHtml(al)+'Toque de novo em “Aprovar alteração” para agendar mesmo assim.';return false}return rpc(true,dd||null,h,$('#qresp').value.trim())}});
}
function openDesignar(id){
  const it=items.find(i=>i.id===id);if(!it||!isAdmin)return;desigId=id;
  const m=it.mes,first=new Date(ANO,m,1).getDay(),n=dim(m),marcadas=items.filter(i=>i.mes===m&&i.dia).sort(ord);
  $('#dt').textContent=it.nome;$('#dhora').value=it.horario||'';
  $('#dsub').innerHTML=`<span class="dot o-${it.org}">${ORG[it.org].n}</span> · escolha o dia em <b>${MESES[m]} de ${ANO}</b>`;
  let g=SEM.map(s=>`<span class="w">${s}</span>`).join('');for(let i=0;i<first;i++)g+='<span></span>';
  for(let d=1;d<=n;d++){const di=marcadas.filter(i=>i.dia===d),dw=new Date(ANO,m,d).getDay();
    const rs=reservas(m,d,id),fe=feriado(m,d),cf=conflitosEsp(m,d,planos[id]?planos[id].espacos:[],id);g+=`<button type="button" data-dia="${d}" class="${di.length?'tem':''}${rs.length?' res':''}${fe?' fer':''}" aria-label="${d} de ${MESES[m]}${fe?', '+esc(fe.n):''}${rs.length?', reservado para '+esc(rs.map(x=>x.nome).join(', ')):di.length?', já tem '+plural(di.length,'atividade','atividades'):''}${cf.length?', espaço já pedido':''}" title="${esc([fe?'🎉 '+fe.n:'',cf.length?'🏛️ Espaço já pedido: '+cf.map(x=>x.nome).join(', '):'',...di.map(i=>i.nome+' ('+ORG[i.org].n+')')].filter(Boolean).join(' · '))}"><span class="${dw===0?'dom':''}">${d}</span><span class="ds">${di.slice(0,4).map(i=>`<i class="o-${i.org}"></i>`).join('')}</span></button>`}
  $('#dgrid').innerHTML=g;
  $('#djam').innerHTML=marcadas.length?`<b style="color:var(--ink)">Já marcadas em ${MESES[m]}:</b>${marcadas.map(i=>`<span>${i.dia} (${SEM[new Date(ANO,m,i.dia).getDay()].toLowerCase()}) · ${esc(i.nome)} · ${ORG[i.org].n}</span>`).join('')}`:`<span>Nenhuma atividade com dia em ${MESES[m]} ainda.</span>`;
  $('#dov').classList.add('on');setTimeout(()=>{const b=$('#dgrid button');if(b)b.focus()},30);
}
$('#dhora').addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=d.length>2?d.slice(0,2)+':'+d.slice(2):d});
$('#dgrid').addEventListener('click',async e=>{const b=e.target.closest('button[data-dia]');if(!b||!desigId)return;const h=$('#dhora').value.trim();if(h&&!validaHora(h)){$('#dhoranote').textContent='Horário inválido: use 24 horas, de 00:00 a 23:59.';$('#dhoranote').style.color='#c0392b';$('#dhora').focus();return}$('#dhoranote').style.color='';const id=desigId;$('#dov').classList.remove('on');desigId=null;await moverPara(id,Number(b.dataset.dia),h)});
$('#dclose').addEventListener('click',()=>{$('#dov').classList.remove('on');desigId=null});
$('#dov').addEventListener('click',e=>{if(e.target===$('#dov')){$('#dov').classList.remove('on');desigId=null}});
$('#deditar').addEventListener('click',()=>{const it=items.find(i=>i.id===desigId);$('#dov').classList.remove('on');if(it)openForm(it)});
$('#dmes').addEventListener('click',()=>{const it=items.find(i=>i.id===desigId);$('#dov').classList.remove('on');if(it){mes=it.mes;persistMes();location.hash='calendario';render()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#dov').classList.contains('on')){$('#dov').classList.remove('on');desigId=null}});
$('#view').addEventListener('change',e=>{if(e.target.name==='pfilt'){pendOrg=e.target.value;render()}});
function render(){
  const p=papel();
  $('#navcad').hidden=isAdmin;$('#navmem').hidden=!isDono;
  const n=Object.keys(membros).filter(id=>!aprovs[id]).length;$('#memcnt').hidden=!n||!isDono;$('#memcnt').textContent=n;
  if(view==='membros'&&!isDono&&carregado)view='calendario';
  if(view==='pendentes'&&!isAdmin&&carregado)view='calendario';
  if(view==='historico'&&!isAdmin&&carregado)view='calendario';
  if(view==='numeros'&&!isAdmin&&carregado)view='calendario';
  notifs();
  document.querySelectorAll('nav a').forEach(a=>{if(a.dataset.v===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  $('#titulo').textContent={calendario:`Calendário de Atividades Ala Ceilândia Sul ${ANO}`,ano:`Atividades de ${ANO}`,organizacoes:'Resumo por organização',cadastro:'Meu cadastro',membros:'Membros e aprovações',pendentes:'Atividades aguardando dia',historico:'Histórico de mudanças',numeros:`Números de ${ANO}`}[view];
  $('#filtro').hidden=!['calendario','ano'].includes(view);
  pintaQuem();
  $('#role').textContent=p==='admin'?(isDono?'Administrador (dono)':'Administrador'):p==='aprovado'?'Líder · '+ORG[minhaOrg()].n:p==='carregando'?'…':'Líder (sem aprovação)';
  $('#sub').textContent=view==='historico'?'Quem criou, mudou ou excluiu cada atividade, e quando. Só administradores veem esta tela.':view==='numeros'?'Atividades, responsáveis, relatórios e orçamento de cada organização. Só administradores veem esta tela.':p==='admin'?(isDono?'Os líderes escolhem o mês e a atividade. Você define o dia e aprova os cadastros.':'Os líderes escolhem o mês e a atividade. Você define o dia de cada uma.'):p==='aprovado'?`Marque as atividades ${daOrg(minhaOrg())}. O administrador define o dia.`:'Líderes escolhem o mês e a atividade; o administrador define o dia.';
  $('#novo').disabled=!podeAdicionar();$('#novo').title=prazoFechado()&&papel()==='aprovado'?'O prazo para propor atividades terminou':'';
  pintaPrazo();pintaInstalar();
  $('#meemail').textContent=meEmail||(offline?'modo sem internet':'');
  aviso();
  const ae=document.activeElement,keep=ae&&((view==='cadastro'&&ae.closest('#cadform'))||(view==='membros'&&ae.closest('#cfgform'))||(view==='numeros'&&ae.closest('#verbaform')));
  if(!keep)$('#view').innerHTML=view==='ano'?vAno():view==='organizacoes'?vOrg():view==='cadastro'?vCadastro():view==='membros'?vMembros():view==='pendentes'?vPendentes():view==='historico'?vHistorico():view==='numeros'?vNumeros():vCalendario();
  flash=null;
  if($('#pov').classList.contains('on'))renderPick();
}
function route(){let h=location.hash.slice(1);if(h.startsWith('atividade=')){abrirDepois=decodeURIComponent(h.slice(10));h='calendario';try{history.replaceState(null,'','#calendario')}catch(e){}if(carregado){const it=items.find(i=>i.id===abrirDepois);abrirDepois=null;if(it){mes=it.mes;persistMes();view='calendario';render();openForm(it);return}}}view=VIEWS.includes(h)?h:'calendario';render();if(view==='historico'&&isAdmin&&!histCarregando)carregarHist();if(view==='numeros'&&isAdmin)carregarAjudas()}

/* ================= ESCRITA ================= */
async function exec(promise,msgErro){
  try{const r=await promise;if(r&&r.error){const t=traduz(r.error);$('#ferr').textContent=t;toast(msgErro||t);return null}return r||{}}
  catch(e){const t=traduz(e);$('#ferr').textContent=t;toast(t);return null}
}
async function setDia(id,dia,hora){if(!isAdmin)return false;const up={dia:dia||null};if(hora!==undefined)up.horario=hora||null;return !!await exec(sb.from('atividades').update(up).eq('id',id))}
const reservas=(m,d,exceto)=>d?items.filter(i=>ehEspecial(i.org)&&i.mes===m&&i.dia===d&&i.id!==exceto):[];
const resTxt=l=>l.map(i=>`<b>${esc(i.nome)}</b> (${ORG[i.org].n}${i.horario?', '+i.horario:''})`).join(', ');
function alertasDia(m,d,id,esp){const r=reservas(m,d,id),f=feriado(m,d),pl=esp||(id&&planos[id]?planos[id].espacos:[]),c=conflitosEsp(m,d,pl,id);return{r,f,c,tem:!!(r.length||f||c.length)}}
function alertasHtml(a){const p=[];
  if(a.r.length)p.push(`📌 Dia reservado para ${resTxt(a.r)}. Atividades da Estaca e da Igreja Geral reservam o dia para as organizações da ala.`);
  if(a.f)p.push(`🎉 É ${a.f.f?'ponto facultativo':'feriado'}: <b>${esc(a.f.n)}</b>. Muitas famílias viajam ou têm outros compromissos.`);
  if(a.c.length)p.push(`🏛️ Espaço já pedido no mesmo dia: ${a.c.map(x=>`<b>${esc(x.comuns.map(e=>ESP[e][1]).join(', '))}</b> por “${esc(x.nome)}” (${ORG[x.org].n}${x.horario?', '+x.horario:''})`).join('; ')}.`);
  return p.map(t=>`<p style="margin:0 0 10px">${t}</p>`).join('')}
function confirmarDia(a,m,d,seguir){
  return pergunta({titulo:`Atenção: ${d} de ${MESES[m]}`,html:alertasHtml(a)+'<p class="small" style="margin:0">Você pode agendar mesmo assim, se for o caso.</p>',ok:'Agendar mesmo assim',acao:async()=>{await seguir();return true}});
}
async function moverPara(id,dia,hora,forcar){
  const it=items.find(i=>i.id===id);if(!it)return;
  if(dia&&!forcar&&dia!==it.dia){const a=alertasDia(it.mes,dia,id);if(a.tem)return confirmarDia(a,it.mes,dia,()=>moverPara(id,dia,hora,true))}
  if((dia||0)===it.dia&&(hora===undefined||hora===(it.horario||'')))return;
  const tinha=it.dia;it.dia=dia||0;if(hora!==undefined)it.horario=hora;render();
  if(await setDia(id,dia,hora)){flash=id;const wa=dia&&it.autor&&it.autor!==myId?acaoWa(it.autor,msgLider(tinha?'remarcada':'agendada',it)):null;toast(dia?`“${it.nome}” em ${dia} de ${MESES[it.mes]}${it.horario?' às '+it.horario:''}`:`“${it.nome}” voltou a aguardar data`,false,wa)}
  agendar();
}

/* ---- formulário de atividade ---- */
function diaOpts(m,sel){$('#fdia').innerHTML='<option value="0">A definir</option>'+Array.from({length:dim(m)},(_,i)=>{const d=i+1;return `<option value="${d}">${d} · ${SEM[new Date(ANO,m,d).getDay()].toLowerCase()}</option>`}).join('');$('#fdia').value=String(sel<=dim(m)?sel:0)}
/* ---- prazo para líderes ---- */
function hojeData(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate())}
function statusMes(m){if(isAdmin)return 'ok';const h=hojeData(),fim=new Date(ANO,m,dim(m));if(h>fim)return 'passado';const faltam=Math.round((fim-h)/864e5);return faltam<=5?'curto':'ok'}
function faltamDias(m){return Math.round((new Date(ANO,m,dim(m))-hojeData())/864e5)}
function proximoMes(m){for(let k=m+1;k<12;k++)if(statusMes(k)==='ok')return k;return -1}
function primeiroMesOk(){for(let k=0;k<12;k++)if(statusMes(k)==='ok')return k;return -1}
function mesOpts(atual){$('#fmes').innerHTML=MESES.map((n,i)=>{const s=statusMes(i);return `<option value="${i}"${s==='passado'&&i!==atual?' disabled':''}>${n}${s==='passado'?' (encerrado)':s==='curto'?' (prazo curto)':''}</option>`}).join('')}
function prazoNota(){const m=Number($('#fmes').value),s=statusMes(m),el=$('#fprazo'),it=items.find(i=>i.id===editId),mesmo=it&&it.mes===m;
  el.textContent=isAdmin||mesmo||s==='ok'?'':s==='passado'?'Este mês já passou. Escolha outro mês.':`Prazo curto: faltam ${plural(faltamDias(m),'dia','dias')} para o fim de ${MESES[m]}.`;el.hidden=!el.textContent}
function openForm(it){
  if(!it&&!podeAdicionar())return;
  const pode=!it||podeEditar(it),mo=minhaOrg(),sp=it?solPend(it.id):null;
  formModo=!it?'novo':!pode?'ver':isAdmin?'admin':sp?'pendente':it.dia?'pedido':'direto';
  editId=it?it.id:null;$('#ferr').textContent='';
  $('#mt').textContent={novo:'Nova atividade',ver:'Atividade',admin:'Editar atividade',pendente:'Pedido em análise',pedido:'Pedir alteração',direto:'Editar atividade'}[formModo];
  let mm=it?it.mes:mes;mesOpts(it?it.mes:-1);if(!it&&statusMes(mm)!=='ok'){const p=proximoMes(mm)>=0?proximoMes(mm):primeiroMesOk();if(p>=0)mm=p}
  const fonte=sp&&sp.depois?sp.depois:it;
  $('#fmes').value=String(sp&&sp.depois?sp.depois.mes:mm);diaOpts(mm,it?it.dia:0);
  $('#fdiaw').hidden=!isAdmin;$('#fdatas').style.gridTemplateColumns=isAdmin?'':'minmax(0,1fr)';
  $('#fdianote').textContent=isAdmin||formModo==='pedido'||formModo==='pendente'?'':'O dia será definido pelo administrador.';
  $('#fnome').value=fonte?fonte.nome:'';$('#fdet').value=fonte?fonte.detalhes:'';$('#fhora').value=fonte?fonte.horario||'':'';$('#fmotivo').value='';
  $('#fhoranote').textContent=isAdmin?'Formato 24 horas, por exemplo 19:00. Deixe vazio se ainda não houver horário.':'Formato 24 horas, por exemplo 19:00. O horário passa por revisão do administrador antes de ser aprovado.';
  const sol=$('#fsol');sol.hidden=true;sol.className='solbox';
  if(formModo==='pedido'){sol.hidden=false;sol.className='solbox info';sol.innerHTML=`Esta atividade já está agendada para <b>${fmtData(it.mes,it.dia)}${it.horario?' às '+it.horario:''}</b>. Alterações e cancelamento <b>só valem depois da aprovação do administrador</b>.`}
  if(formModo==='pendente'){sol.hidden=false;sol.innerHTML=sp.tipo==='cancelar'?`<b>Pedido de cancelamento enviado</b> em ${new Date(sp.criado).toLocaleDateString('pt-BR')}. Pendente de aprovação do administrador.`:`<b>Pedido de alteração enviado</b> em ${new Date(sp.criado).toLocaleDateString('pt-BR')}. Pendente de aprovação do administrador. Abaixo estão os dados que você pediu.`}
  if(formModo==='direto'){sol.hidden=false;sol.className='solbox info';sol.innerHTML='Esta atividade ainda está <b>pendente de aprovação do administrador</b>. Suas alterações continuam em análise até ele definir o dia.'}
  const editavel=['novo','admin','pedido','direto'].includes(formModo);
  document.querySelectorAll('#form input,#form select,#form textarea').forEach(e=>e.disabled=!editavel);
  document.querySelectorAll('input[name=org]').forEach(r=>{r.checked=it?r.value===it.org:mo?r.value===mo:filtro!=='todas'&&r.value===filtro;if(formModo==='pedido')r.disabled=true;else if(mo&&editavel&&!isAdmin)r.disabled=r.value!==mo});
  document.querySelectorAll('#forgs label').forEach(l=>{const v=l.querySelector('input').value;l.hidden=ehEspecial(v)&&!isAdmin&&!(it&&it.org===v)});
  $('#fmotivow').hidden=formModo!=='pedido';
  pintaResp(it);pintaPlano(it);pintaRel(it);
  $('#fdel').hidden=!['admin','pedido','direto'].includes(formModo);$('#fdel').textContent=formModo==='pedido'?'Pedir cancelamento':'Excluir';
  $('#fsave').hidden=!editavel;$('#fsave').textContent=formModo==='pedido'?'Enviar pedido':'Salvar';
  $('#fdesistir').hidden=formModo!=='pendente';
  {const wa=$('#fwa'),av=isAdmin&&it&&it.autor&&it.autor!==myId;wa.hidden=!it||(!av&&!it.dia);wa.textContent=av?'Avisar o líder no WhatsApp':'Compartilhar no WhatsApp'}
  prazoNota();
  $('#fwho').textContent=it?(it.autor===myId?'Marcada por você':it.autorNome?'Marcada por '+it.autorNome:''):'';
  $('#ov').classList.add('on');setTimeout(()=>{const rf=!$('#fresp').hidden&&!$('#frespcampos').hidden?[...document.querySelectorAll('#frespcampos input')].find(x=>!x.value):null;(rf||$(editavel?'#fnome':'#fcancel')).focus()},30);
}
$('#fwa').addEventListener('click',()=>{const it=items.find(i=>i.id===editId);if(!it)return;if(isAdmin&&it.autor&&it.autor!==myId)waAbrir(liderContato(it.autor).num,msgLider(it.dia?'agendada':'semdia',it));else waAbrir('',msgCompartilhar(it))});
function closeForm(){$('#ov').classList.remove('on');editId=null}
$('#fhora').addEventListener('input',e=>{const d=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=d.length>2?d.slice(0,2)+':'+d.slice(2):d});
$('#fmes').addEventListener('change',()=>{diaOpts(Number($('#fmes').value),Number($('#fdia').value));prazoNota()});
$('#form').addEventListener('submit',async ev=>{
  ev.preventDefault();if(busy)return;$('#ferr').textContent='';
  const nome=$('#fnome').value.trim(),m=Number($('#fmes').value),org=(document.querySelector('input[name=org]:checked')||{}).value,hora=$('#fhora').value.trim();
  if(!nome){$('#ferr').textContent='Dê um nome à atividade.';$('#fnome').focus();return}
  if(hora&&!validaHora(hora)){$('#ferr').textContent='Horário inválido. Use o formato 24 horas, de 00:00 a 23:59 (ex.: 19:00).';$('#fhora').focus();return}
  if(!org){$('#ferr').textContent='Escolha a organização.';(document.querySelector('input[name=org]:not(:disabled)')||$('#fnome')).focus();return}
  if(!isAdmin&&org!==minhaOrg()){$('#ferr').textContent='Você só pode marcar atividades da sua organização.';return}
  const it=items.find(i=>i.id===editId),mudouMes=!it||it.mes!==m,s=statusMes(m);
  if(formModo==='pedido'&&it.mes===m&&it.nome===nome&&(it.horario||'')===hora&&it.detalhes===$('#fdet').value.trim()){$('#ferr').textContent='Nada foi alterado. Mude o mês, o horário, o nome ou o local antes de enviar o pedido.';return}
  if(!isAdmin&&mudouMes&&s==='passado'){$('#ferr').textContent='Este mês já passou. Escolha outro mês.';$('#fmes').focus();return}
  const seguir0=mm=>formModo==='pedido'?enviarPedido(mm):salvarAtividade(mm);
  const seguir=mm=>{const d=isAdmin?Number($('#fdia').value)||0:0;if(d&&(!it||it.dia!==d||it.mes!==mm)){const a=alertasDia(mm,d,editId);if(a.tem)return confirmarDia(a,mm,d,()=>seguir0(mm))}return seguir0(mm)};
  if(!isAdmin&&mudouMes&&s==='curto'){confirmarPrazo(m,seguir);return}
  await seguir(m);
});
async function enviarPedido(m){
  const it=items.find(i=>i.id===editId);if(!it)return;
  const depois={nome:$('#fnome').value.trim(),mes:m,horario:$('#fhora').value.trim(),detalhes:$('#fdet').value.trim()};
  busy=true;$('#fsave').disabled=true;
  const r=await exec(sb.from('solicitacoes').insert({atividade:it.id,tipo:'alterar',depois,motivo:$('#fmotivo').value.trim()}));
  busy=false;$('#fsave').disabled=false;
  if(r){closeForm();toast('Pedido de alteração enviado — pendente de aprovação do administrador');carregar()}
}
async function pedirCancelamento(it){
  pergunta({titulo:'Pedir cancelamento',html:`<p style="margin:0 0 12px">Pedir o cancelamento de <b>${esc(it.nome)}</b> (${fmtData(it.mes,it.dia)}${it.horario?' às '+it.horario:''})?</p><p class="small" style="margin:0 0 12px">A atividade continua no calendário até o administrador aprovar o cancelamento.</p><label for="amot">Motivo (opcional)</label><input id="amot" maxlength="300" autocomplete="off">`,ok:'Enviar pedido',perigo:true,
    acao:async()=>{const r=await exec(sb.from('solicitacoes').insert({atividade:it.id,tipo:'cancelar',motivo:$('#amot').value.trim()}));if(!r)return false;closeForm();toast('Pedido de cancelamento enviado — pendente de aprovação do administrador');carregar();return true}});
}
let prazoCb=null;
function confirmarPrazo(m,cb){prazoCb=cb||salvarAtividade;
  const p=proximoMes(m),f=faltamDias(m);
  $('#ct').textContent='Prazo muito curto';
  $('#cmsg').innerHTML=`Faltam só <b>${plural(f,'dia','dias')}</b> para o fim de <b>${MESES[m]}</b>. A atividade está com prazo muito curto para ser organizada e executada.`+(p>=0?`<br><br>Deseja ${formModo==='pedido'?'pedir a mudança':'marcar'} para <b>${MESES[p]}</b>, o próximo mês disponível?`:'<br><br>Não há mais meses disponíveis em '+ANO+'. Fale com o administrador.');
  $('#cpok').hidden=p<0;$('#cpok').textContent=p>=0?`Marcar em ${MESES[p]}`:'';$('#cpok').dataset.m=p;
  $('#cpno').textContent=p>=0?'Escolher outro mês':'Entendi';
  $('#cov').classList.add('on');setTimeout(()=>$(p>=0?'#cpok':'#cpno').focus(),30);
}
$('#cpok').addEventListener('click',async()=>{const p=Number($('#cpok').dataset.m);$('#cov').classList.remove('on');if(p>=0){$('#fmes').value=String(p);diaOpts(p,0);prazoNota();await (prazoCb||salvarAtividade)(p)}});
$('#cpno').addEventListener('click',()=>{$('#cov').classList.remove('on');$('#fmes').focus()});
$('#cov').addEventListener('click',e=>{if(e.target===$('#cov'))$('#cov').classList.remove('on')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#cov').classList.remove('on')});
async function salvarAtividade(m){
  const nome=$('#fnome').value.trim(),org=(document.querySelector('input[name=org]:checked')||{}).value,detalhes=$('#fdet').value.trim();
  const dia=isAdmin?Number($('#fdia').value)||0:null;
  const row={mes:m,nome,org,detalhes,horario:$('#fhora').value.trim()||null};if(isAdmin)row.dia=dia||null;
  busy=true;$('#fsave').disabled=true;const era=editId,antes=era?items.find(i=>i.id===era):null;let r;
  if(era)r=await exec(sb.from('atividades').update(row).eq('id',era).select('id'));
  else r=await exec(sb.from('atividades').insert(row).select('id').single());
  busy=false;$('#fsave').disabled=false;
  if(r){const id=era||(r.data&&r.data.id);if(era&&Array.isArray(r.data)&&!r.data.length){$('#ferr').textContent='Você não tem permissão para editar esta atividade.';return}
    const mudouDia=isAdmin&&antes&&dia&&antes.autor&&antes.autor!==myId&&(antes.dia!==dia||antes.mes!==m||(antes.horario||'')!==(row.horario||''));
    const wa=mudouDia?acaoWa(antes.autor,msgLider(antes.dia?'remarcada':'agendada',{...antes,mes:m,dia,nome,org,horario:row.horario||''})):null;
    flash=id;toast(era?(isAdmin?'Atividade atualizada':'Atividade atualizada — continua pendente de aprovação do administrador'):`Marcada em ${MESES[m]}`+(isAdmin&&dia?` (dia ${dia})`:' — pendente de aprovação do administrador'),false,wa);closeForm();if(view==='calendario')mes=m;persistMes();carregar()}
}
$('#fdel').addEventListener('click',async()=>{
  const it=items.find(a=>a.id===editId);if(!it)return;
  if(formModo==='pedido'){pedirCancelamento(it);return}
  const r=await exec(sb.from('atividades').delete().eq('id',it.id).select('id'));
  if(!r)return;if(Array.isArray(r.data)&&!r.data.length){$('#ferr').textContent='Você não tem permissão para excluir esta atividade.';return}
  closeForm();undoItem=it;toast(`“${it.nome}” excluída`,true);carregar();
});
$('#tbtn').addEventListener('click',async()=>{if(!undoItem)return;const it=undoItem;undoItem=null;$('#toast').style.display='none';
  const row={id:it.id,mes:it.mes,nome:it.nome,org:it.org,detalhes:it.detalhes,horario:it.horario||null};if(isAdmin&&it.dia)row.dia=it.dia;
  if(await exec(sb.from('atividades').insert(row)))carregar()});
$('#fcancel').addEventListener('click',closeForm);
$('#fdesistir').addEventListener('click',async()=>{const it=items.find(i=>i.id===editId),sp=it&&solPend(it.id);if(!sp)return;
  const r=await exec(sb.from('solicitacoes').delete().eq('id',sp.id).select('id'));if(r){closeForm();toast('Pedido retirado. A atividade continua como estava.');carregar()}});
/* ---- janela de confirmação genérica ---- */
let perguntaAcao=null;
function pergunta(o){$('#qt').textContent=o.titulo;$('#qbody').innerHTML=o.html||'';$('#qerr').textContent='';$('#qok').textContent=o.ok||'Confirmar';$('#qok').className='btn '+(o.perigo?'pri danger-pri':'pri');perguntaAcao=o.acao;$('#qov').classList.add('on');setTimeout(()=>{const f=$('#qbody input,#qbody select');(f||$('#qok')).focus()},30)}
$('#qform').addEventListener('submit',async e=>{e.preventDefault();if(!perguntaAcao||busy)return;busy=true;$('#qok').disabled=true;let ok=false;try{ok=await perguntaAcao()}catch(err){ok=false}busy=false;$('#qok').disabled=false;if(ok!==false)$('#qov').classList.remove('on');else if(!$('#qerr').textContent)$('#qerr').textContent=$('#ferr').textContent||'Não foi possível concluir.'});
$('#qcancel').addEventListener('click',()=>$('#qov').classList.remove('on'));
$('#qov').addEventListener('click',e=>{if(e.target===$('#qov'))$('#qov').classList.remove('on')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#qov').classList.remove('on')});
$('#qbody').addEventListener('input',e=>{if(e.target.id==='qhora'){const d=e.target.value.replace(/\D/g,'').slice(0,4);e.target.value=d.length>2?d.slice(0,2)+':'+d.slice(2):d}});
$('#ov').addEventListener('click',e=>{if(e.target===$('#ov'))closeForm()});

/* ---- cadastro e aprovações ---- */
$('#view').addEventListener('submit',async ev=>{
  if(ev.target.id!=='cadform')return;ev.preventDefault();if(busy)return;
  const nome=$('#cnome').value.trim(),org=$('#corg').value,raw=$('#cwhats').value.trim(),ok=$('#cok').checked,err=$('#cerr');err.textContent='';
  if(nome.length<3){err.textContent='Escreva seu nome completo.';$('#cnome').focus();return}
  if(!ORG[org]){err.textContent='Escolha a organização que você lidera.';$('#corg').focus();return}
  const w=normWhats(raw);if(!w){err.textContent='Confira o WhatsApp: use DDD + número, por exemplo (61) 99999-9999.';$('#cwhats').focus();return}
  if(!ok){err.textContent='Marque a autorização para enviar o cadastro.';$('#cok').focus();return}
  busy=true;$('#csave').disabled=true;
  const r=await exec(sb.from('perfis').upsert({id:myId,nome,org,whats:w}));
  busy=false;
  if(r){toast(meuCad?'Cadastro atualizado':'Cadastro enviado — aguarde a aprovação');document.activeElement.blur();meuCad={nome,org,whats:w,email:meEmail,em:Date.now()};render();carregar()}
  else{err.textContent=$('#ferr').textContent;const b=$('#csave');if(b)b.disabled=false}
});
$('#view').addEventListener('input',ev=>{if(ev.target.id!=='cwhats')return;if(ev.target.value.trim().startsWith('+'))return;const d=ev.target.value.replace(/\D/g,'').slice(0,11);let f=d;if(d.length>2)f=`(${d.slice(0,2)}) `+d.slice(2);if(d.length>6)f=`(${d.slice(0,2)}) ${d.slice(2,d.length-4)}-${d.slice(-4)}`;ev.target.value=f});
async function acaoMembro(btn){
  const card=btn.closest('[data-uid]'),id=card.dataset.uid,m=btn.dataset.mem,sel=card.querySelector('[data-org]');
  const nome=(membros[id]&&membros[id].nome)||'Líder';btn.disabled=true;let ok=true;
  if(m==='aprovar'||m==='mudar'){const org=m==='mudar'?membros[id].org:sel.value;ok=!!await exec(sb.from('aprovacoes').upsert({user_id:id,status:'aprovado',org,por:myId}));if(ok)toast(`${nome} aprovado(a) ${naOrg(org)}`)}
  if(m==='recusar'){ok=!!await exec(sb.from('aprovacoes').upsert({user_id:id,status:'recusado',org:null,por:myId}));if(ok)toast(`Cadastro de ${nome} recusado`)}
  if(m==='admin'){ok=!!await exec(sb.from('admins').insert({user_id:id}));if(ok)toast(`${nome} agora é administrador(a)`)}
  if(m==='desadmin'){ok=!!await exec(sb.from('admins').delete().eq('user_id',id));if(ok)toast(`${nome} voltou a ser só líder`)}
  if(m==='remover'){ok=!!await exec(sb.from('admins').delete().eq('user_id',id))&&!!await exec(sb.from('aprovacoes').delete().eq('user_id',id))&&!!await exec(sb.from('perfis').delete().eq('id',id));if(ok)toast(`${nome} removido(a)`)}
  if(!ok)btn.disabled=false;carregar();
}

/* ---- seletor de dia (admin) ---- */
function renderPick(){
  const d=pickDia,list=items.filter(i=>i.mes===mes);
  const wait=list.filter(i=>!i.dia).sort(ord),here=list.filter(i=>i.dia===d).sort(ord),other=list.filter(i=>i.dia&&i.dia!==d).sort(ord);
  const row=(i,act,extra)=>`<li><button type="button" class="o-${i.org}" data-pk="${act}" data-id="${esc(i.id)}"><span class="o"></span><span>${esc(i.nome)}<br><small style="color:var(--mute);font-weight:500">${ORG[i.org].n}${i.dia&&act==='set'?` · agora no dia ${i.dia}`:''}</small></span>${extra||''}</button></li>`;
  $('#pt').textContent=`${d} de ${MESES[mes]} (${SEM[new Date(ANO,mes,d).getDay()].toLowerCase()})`;
  $('#pbody').innerHTML=
    (here.length?`<p class="sub">Neste dia</p><ul class="pk" style="margin:10px 0 14px">${here.map(i=>row(i,'clear','<span class="x">Tirar data</span>')).join('')}</ul>`:'')+
    `<p class="sub">Aguardando data</p><ul class="pk" style="margin-top:10px">${wait.length?wait.map(i=>row(i,'set')).join(''):'<li class="empty">Nenhuma atividade aguardando data em '+MESES[mes]+'.</li>'}</ul>`+
    (other.length?`<details style="margin-top:14px"><summary class="small" style="cursor:pointer">Mover de outro dia (${other.length})</summary><ul class="pk" style="margin-top:10px">${other.map(i=>row(i,'set')).join('')}</ul></details>`:'');
}
function openPick(d){pickDia=d;renderPick();$('#pov').classList.add('on');setTimeout(()=>$('#pclose').focus(),30)}
$('#pbody').addEventListener('click',async e=>{const b=e.target.closest('[data-pk]');if(!b)return;
  const set=b.dataset.pk==='set';if(set)$('#pov').classList.remove('on');await moverPara(b.dataset.id,set?pickDia:0);if(!set)renderPick()});
$('#pclose').addEventListener('click',()=>$('#pov').classList.remove('on'));
$('#pov').addEventListener('click',e=>{if(e.target===$('#pov'))$('#pov').classList.remove('on')});

/* ---- arrastar e soltar (admin) ---- */
const V=$('#view');let dragId=null;
V.addEventListener('dragstart',e=>{const el=e.target.closest('[data-drag]');if(!el||!isAdmin)return;dragId=el.dataset.drag;e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragId)}catch(_){}});
V.addEventListener('dragend',()=>{dragId=null;V.querySelectorAll('.drop').forEach(x=>x.classList.remove('drop'))});
const alvo=e=>e.target.closest('.cell[data-dia],#waitbox');
V.addEventListener('dragover',e=>{if(!dragId)return;const t=alvo(e);if(!t)return;e.preventDefault();V.querySelectorAll('.drop').forEach(x=>x!==t&&x.classList.remove('drop'));t.classList.add('drop')});
V.addEventListener('dragleave',e=>{const t=alvo(e);if(t&&!t.contains(e.relatedTarget))t.classList.remove('drop')});
V.addEventListener('drop',async e=>{const t=alvo(e);if(!t||!dragId)return;e.preventDefault();const id=dragId;dragId=null;t.classList.remove('drop');
  const it=items.find(i=>i.id===id);if(!it)return;
  if(it.mes!==mes&&t.dataset.dia){toast('Essa atividade é de outro mês.');return}
  await moverPara(id,t.dataset.dia?Number(t.dataset.dia):0)});

/* ---- navegação ---- */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if($('#pov').classList.contains('on'))$('#pov').classList.remove('on');else if($('#ov').classList.contains('on'))closeForm()}
  if(view==='calendario'&&!document.querySelector('.overlay.on')&&$('#auth').hidden&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){if(e.key==='ArrowLeft'&&mes>0){mes--;persistMes();render()}if(e.key==='ArrowRight'&&mes<11){mes++;persistMes();render()}}});
function persistMes(){try{localStorage.setItem(LSM,String(mes))}catch(e){}}
V.addEventListener('click',e=>{
  if(e.target.closest('#backupBtn')){baixarBackup();return}
  {const ab=e.target.closest('[data-abrir]');if(ab){const it=items.find(i=>i.id===ab.dataset.abrir);if(it)openForm(it);return}}
  if(e.target.closest('#chavegerar')){gerarChave();return}
  if(e.target.closest('#chavecopiar')){const i=$('#chaveval');i.select();try{navigator.clipboard.writeText(i.value);toast('Chave copiada')}catch(er){toast('Selecionei a chave: copie com Ctrl+C')}return}
  if(e.target.closest('#histmais')){histLim+=200;carregarHist();return}
  const sa=e.target.closest('[data-sact]');if(sa&&isAdmin){responderPedido(sa.closest('[data-sol]').dataset.sol,sa.dataset.sact);return}
  const dz=e.target.closest('[data-act=designar]');if(dz&&isAdmin){openDesignar(dz.dataset.id);return}
  const mb=e.target.closest('[data-mem]');if(mb&&isDono){acaoMembro(mb);return}
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  if(a==='prev'&&mes>0){mes--;persistMes();render()}
  if(a==='next'&&mes<11){mes++;persistMes();render()}
  if(a==='pick'&&isAdmin)openPick(Number(b.dataset.d));
  if(a==='edit'){const it=items.find(i=>i.id===b.dataset.id);if(it)openForm(it)}
  if(a==='goto'){mes=Number(b.dataset.m);persistMes();location.hash='calendario'}
});
$('#novo').addEventListener('click',()=>openForm(null));
$('#filtro').addEventListener('change',e=>{filtro=e.target.value;render()});
$('#copiar').addEventListener('click',async()=>{
  const txt=`Atividades Ala Ceilândia Sul · ${ANO}`+(filtro!=='todas'?` · ${ORG[filtro].n}`:'')+'\n'+MESES.map((m,mi)=>{const l=vis().filter(i=>i.mes===mi).sort(ord);
    return `\n${m}\n`+(l.length?l.map(i=>`• ${i.dia?String(i.dia).padStart(2,'0')+'/'+String(mi+1).padStart(2,'0'):'dia a definir'}${i.horario?' às '+i.horario:''} — ${i.nome} (${ORG[i.org].n})${i.detalhes?' — '+i.detalhes:''}`).join('\n'):'• (nenhuma atividade)')}).join('\n');
  try{await navigator.clipboard.writeText(txt);toast('Lista copiada — cole no e-mail ou no WhatsApp')}catch(e){toast('Não foi possível copiar neste navegador')}
});
window.addEventListener('hashchange',route);

/* ================= EXPORTAR (PDF / PNG) ================= */
const PERIODOS=[{k:'ano',n:'Ano inteiro',m:[0,1,2,3,4,5,6,7,8,9,10,11]},{k:'t1',n:'1º trimestre',m:[0,1,2]},{k:'t2',n:'2º trimestre',m:[3,4,5]},{k:'t3',n:'3º trimestre',m:[6,7,8]},{k:'t4',n:'4º trimestre',m:[9,10,11]},{k:'meses',n:'Escolher meses',m:null}];
const COR={primaria:'#c98f00',socorro:'#8a4fa3',elderes:'#2d62b3',rapazes:'#2b8452',mocas:'#c8436f',escola:'#c25a24',estaca:'#0e7490',geral:'#475569'};
const PINE='#163f3a',INK='#17211f',MUTE='#62716e',LINE='#dde3e1',SOFT='#f4f7f6';
const FONT='Inter, "Segoe UI", Roboto, Arial, sans-serif';
$('#eorg').innerHTML='<option value="todas">Todas as organizações</option>'+orgOpts('',true);
$('#eper').innerHTML=PERIODOS.map((p,i)=>`<label class="chip"><input type="radio" name="eper" value="${p.k}"${i===0?' checked':''}><span>${p.n}</span></label>`).join('');
$('#emeses').innerHTML=AB.map((a,i)=>`<label class="chip"><input type="checkbox" name="emes" value="${i}"><span>${a}</span></label>`).join('');
function exSel(){
  const org=$('#eorg').value,per=(document.querySelector('input[name=eper]:checked')||{}).value||'ano';
  const meses=per==='meses'?[...document.querySelectorAll('input[name=emes]:checked')].map(c=>Number(c.value)):PERIODOS.find(p=>p.k===per).m;
  const fmt=(document.querySelector('input[name=efmt]:checked')||{}).value||'pdf';
  const base=items.filter(i=>(org==='todas'||i.org===org)&&meses.includes(i.mes));
  return{org,per,meses,fmt,com:base.filter(i=>i.dia).sort((a,b)=>a.mes-b.mes||a.dia-b.dia||a.criado-b.criado),sem:base.filter(i=>!i.dia).length};
}
function exInfo(){
  const s=exSel();$('#emesesw').hidden=s.per!=='meses';$('#eerr').textContent='';
  let h;
  if(!s.meses.length)h='Escolha pelo menos um mês.';
  else if(!s.com.length)h=`<b>Nenhuma atividade com dia definido</b> nesse período${s.org!=='todas'?' para '+aOrg(s.org):''}.${s.sem?` ${plural(s.sem,'atividade ainda aguarda','atividades ainda aguardam')} o administrador definir o dia.`:''}`;
  else h=`<b>${plural(s.com.length,'atividade será exportada','atividades serão exportadas')}</b>${s.fmt==='pdf'?` em ${plural(s.meses.length,'página','páginas')}`:''}.${s.sem?` ${plural(s.sem,'atividade sem dia definido não aparece','atividades sem dia definido não aparecem')}.`:''}`;
  $('#einfo').innerHTML=h;$('#egerar').disabled=!s.meses.length||!s.com.length;
}
$('#exportar').addEventListener('click',()=>{$('#eorg').value=filtro;exInfo();$('#eov').classList.add('on');setTimeout(()=>$('#eorg').focus(),30)});
$('#eform').addEventListener('change',exInfo);
$('#ecancel').addEventListener('click',()=>$('#eov').classList.remove('on'));
$('#eov').addEventListener('click',e=>{if(e.target===$('#eov'))$('#eov').classList.remove('on')});

/* ---- desenho ---- */
function rgba(hex,a){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${a})`}
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}
function fnt(c,w,s){c.font=`${w} ${s}px ${FONT}`}
function ellip(c,t,max){if(c.measureText(t).width<=max)return t;let a=0,b=t.length;while(a<b){const m=(a+b+1)>>1;if(c.measureText(t.slice(0,m)+'…').width<=max)a=m;else b=m-1}return t.slice(0,a).trimEnd()+'…'}
function wrap(c,t,max,maxLines){const ws=String(t).split(/\s+/).filter(Boolean),out=[];let cur='';
  for(const w of ws){const tst=cur?cur+' '+w:w;if(c.measureText(tst).width<=max)cur=tst;else{if(cur)out.push(cur);cur=c.measureText(w).width<=max?w:ellip(c,w,max)}if(out.length===maxLines)break}
  if(out.length<maxLines&&cur)out.push(cur);
  if(out.length===maxLines&&ws.join(' ')!==out.join(' ')){out[maxLines-1]=ellip(c,out[maxLines-1]+' …',max)}
  return out.slice(0,maxLines)}
// Grade de um mês. Retorna nada; desenha em (x,y,w,h).
function drawGrid(c,x,y,w,h,m,list,s){
  const first=new Date(ANO,m,1).getDay(),n=dim(m),rows=Math.ceil((first+n)/7),hh=34*s,cw=w/7,ch=(h-hh)/rows;
  c.fillStyle='#fff';rr(c,x,y,w,h,12*s);c.fill();c.strokeStyle=LINE;c.lineWidth=1.5*s;c.stroke();
  c.save();rr(c,x,y,w,h,12*s);c.clip();
  c.fillStyle=SOFT;c.fillRect(x,y,w,hh);
  fnt(c,600,14*s);c.fillStyle=MUTE;c.textAlign='center';c.textBaseline='middle';
  SEM.forEach((d,i)=>c.fillText(d,x+cw*i+cw/2,y+hh/2));
  c.textAlign='left';c.textBaseline='alphabetic';
  for(let k=0;k<rows*7;k++){
    const col=k%7,row=Math.floor(k/7),cx=x+col*cw,cy=y+hh+row*ch,d=k-first+1;
    if(d<1||d>n){c.fillStyle='#f7f9f8';c.fillRect(cx,cy,cw,ch);continue}
    const di=list.filter(i=>i.dia===d);
    if(di.length){c.fillStyle=rgba(PINE,.035);c.fillRect(cx,cy,cw,ch)}
    const fe=feriado(m,d);fnt(c,700,15*s);c.fillStyle=fe?'#b4471b':di.length?INK:'#7c8a87';c.fillText(String(d),cx+8*s,cy+20*s);
    if(fe){const dw=c.measureText(String(d)).width;fnt(c,600,10.5*s);c.fillStyle='#b4471b';c.fillText(ellip(c,fe.n,cw-dw-22*s),cx+14*s+dw,cy+19*s)}
    const top=cy+28*s,bottom=cy+ch-6*s,px=cx+5*s,pw=cw-10*s,lhT=15*s;let py=top,shown=0;
    fnt(c,600,12.5*s);
    for(let j=0;j<di.length;j++){
      const it=di[j],ln=wrap(c,(it.horario?it.horario+' ':'')+it.nome,pw-22*s,2),ph=ln.length*lhT+8*s,rest=di.length-j-1;
      const need=py+ph+(rest?18*s:0);
      if(need>bottom&&!(rest===0&&py+ph<=bottom)){break}
      c.fillStyle=rgba(COR[it.org],.16);rr(c,px,py,pw,ph,5*s);c.fill();
      c.fillStyle=COR[it.org];c.beginPath();c.arc(px+9*s,py+4*s+lhT/2,4*s,0,7);c.fill();
      fnt(c,600,12.5*s);c.fillStyle=INK;ln.forEach((l,k)=>c.fillText(l,px+17*s,py+4*s+lhT*(k+1)-3.5*s));
      py+=ph+3*s;shown++;
    }
    if(di.length>shown){fnt(c,600,12*s);c.fillStyle=MUTE;c.fillText(`+${di.length-shown} mais`,cx+8*s,Math.min(py+13*s,bottom))}
  }
  c.strokeStyle=LINE;c.lineWidth=1*s;
  for(let i=1;i<7;i++){c.beginPath();c.moveTo(x+i*cw,y+hh);c.lineTo(x+i*cw,y+h);c.stroke()}
  for(let r=0;r<=rows;r++){c.beginPath();c.moveTo(x,y+hh+r*ch);c.lineTo(x+w,y+hh+r*ch);c.stroke()}
  c.restore();
}
// Lista de atividades de um mês. dry=true só mede. Retorna altura usada.
function drawList(c,x,y,w,list,s,maxH,dry){
  let cy=y;const bw=54*s,gap=14*s,tx=x+bw+gap,tw=w-bw-gap;
  if(!list.length){if(!dry){fnt(c,500,15*s);c.fillStyle=MUTE;c.fillText('Nenhuma atividade com dia definido neste mês.',x,cy+18*s)}return 28*s}
  for(let i=0;i<list.length;i++){
    const it=list[i];fnt(c,700,16*s);const nl=wrap(c,it.nome,tw,2);fnt(c,400,13.5*s);const dl=it.detalhes?wrap(c,it.detalhes,tw,2):[];
    const ih=Math.max(bw,nl.length*21*s+22*s+dl.length*18*s)+12*s;
    if(maxH&&cy+ih-y>maxH){const rest=list.length-i;if(!dry){fnt(c,600,14*s);c.fillStyle=MUTE;c.fillText(`+ ${plural(rest,'atividade','atividades')} neste mês`,x,cy+18*s)}return cy-y+28*s}
    if(!dry){
      c.fillStyle=PINE;rr(c,x,cy,bw,bw,10*s);c.fill();c.fillStyle='#fff';c.textAlign='center';
      fnt(c,800,21*s);c.fillText(String(it.dia),x+bw/2,cy+26*s);fnt(c,600,11*s);c.fillText(SEM[new Date(ANO,it.mes,it.dia).getDay()].toLowerCase(),x+bw/2,cy+43*s);c.textAlign='left';
      let ty=cy+17*s;fnt(c,700,16*s);c.fillStyle=INK;nl.forEach(l=>{c.fillText(l,tx,ty);ty+=21*s});
      c.fillStyle=COR[it.org];c.beginPath();c.arc(tx+5*s,ty-4*s,5*s,0,7);c.fill();fnt(c,600,13.5*s);c.fillStyle=MUTE;c.fillText(ORG[it.org].n+(it.horario?' · '+it.horario:''),tx+15*s,ty);ty+=20*s;
      fnt(c,400,13.5*s);dl.forEach(l=>{c.fillText(l,tx,ty);ty+=18*s});
    }
    cy+=ih;
  }
  return cy-y;
}
function drawHeader(c,x,y,w,s,sub){
  fnt(c,800,30*s);c.fillStyle=INK;c.fillText(`Calendário de Atividades Ala Ceilândia Sul ${ANO}`,x,y+30*s);
  fnt(c,500,16*s);c.fillStyle=MUTE;c.fillText(sub,x,y+58*s);
}
function drawLegend(c,x,y,s,orgs){
  let cx=x;fnt(c,600,13.5*s);
  orgs.forEach(o=>{c.fillStyle=COR[o.k];c.beginPath();c.arc(cx+6*s,y-5*s,6*s,0,7);c.fill();c.fillStyle=INK;c.fillText(o.n,cx+18*s,y);cx+=c.measureText(o.n).width+42*s});
}
function legendaOrgs(sel){return sel.org==='todas'?ORGS.filter(o=>sel.com.some(i=>i.org===o.k)):[ORG[sel.org]]}
function subtitulo(sel){
  const p=PERIODOS.find(p=>p.k===sel.per);
  const per=sel.per==='meses'?(sel.meses.length===12?'Ano inteiro':sel.meses.map(m=>MESES[m]).join(', ')):p.n;
  const hoje=new Date().toLocaleDateString('pt-BR');
  return `${sel.org==='todas'?'Todas as organizações':ORG[sel.org].n} · ${per} · gerado em ${hoje}`;
}
function canvasPDFPage(sel,m){
  const W=2339,H=1654,s=1.6,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,W,H);
  x.fillStyle=PINE;x.fillRect(0,0,W,14*s);
  const pad=90;drawHeader(x,pad,40*s,W-2*pad,s,subtitulo(sel));
  const list=sel.com.filter(i=>i.mes===m);
  fnt(x,800,40*s);x.fillStyle=PINE;x.fillText(MESES[m],pad,170*s);
  const mw=x.measureText(MESES[m]).width;fnt(x,600,18*s);x.fillStyle=MUTE;x.fillText(`${ANO} · ${plural(list.length,'atividade','atividades')}`,pad+mw+16*s,170*s);
  const gy=195*s,gh=H-gy-80*s,lw=560*s,gw=W-2*pad-lw-40*s;
  drawGrid(x,pad,gy,gw,gh,m,list,s);
  const lx=pad+gw+40*s;fnt(x,700,18*s);x.fillStyle=INK;x.fillText('Atividades do mês',lx,gy+18*s);
  drawList(x,lx,gy+38*s,lw,list,s,gh-40*s,false);
  drawQR(x,W-pad-118*s,22*s,118*s,s);
  drawLegend(x,pad,H-36*s,s,legendaOrgs(sel));
  fnt(x,500,12.5*s);x.fillStyle=MUTE;x.textAlign='right';x.fillText('Só aparecem atividades com dia definido pelo administrador.',W-pad,H-36*s);x.textAlign='left';
  return c;
}
function canvasPNG(sel){
  const ms=sel.meses,cols=ms.length===1?1:ms.length===2||ms.length===4?2:3,s=1.25,pad=56*s,gap=36*s;
  const W=cols===1?1500:cols===2?2200:2700,cw=(W-2*pad-(cols-1)*gap)/cols,gh=cw*0.78;
  const meas=document.createElement('canvas').getContext('2d');
  const blocks=ms.map(m=>{const list=sel.com.filter(i=>i.mes===m);return{m,list,h:52*s+gh+24*s+drawList(meas,0,0,cw,list,s,0,true)}});
  const rowsH=[];for(let i=0;i<blocks.length;i+=cols)rowsH.push(Math.max(...blocks.slice(i,i+cols).map(b=>b.h)));
  const top=150*s,H=Math.ceil(top+rowsH.reduce((a,b)=>a+b+gap,0)+60*s);
  const c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,W,H);x.fillStyle=PINE;x.fillRect(0,0,W,12*s);
  drawHeader(x,pad,34*s,W-2*pad,s,subtitulo(sel));drawLegend(x,pad,122*s,s,legendaOrgs(sel));drawQR(x,W-pad-104*s,18*s,104*s,s);
  let y=top;
  blocks.forEach((b,i)=>{const col=i%cols,bx=pad+col*(cw+gap);if(i&&col===0)y+=rowsH[Math.floor(i/cols)-1]+gap;
    fnt(x,800,28*s);x.fillStyle=PINE;x.fillText(MESES[b.m],bx,y+30*s);const mw=x.measureText(MESES[b.m]).width;
    fnt(x,600,15*s);x.fillStyle=MUTE;x.fillText(plural(b.list.length,'atividade','atividades'),bx+mw+12*s,y+30*s);
    drawGrid(x,bx,y+44*s,cw,gh,b.m,b.list,s*0.9);drawList(x,bx,y+44*s+gh+24*s,cw,b.list,s*0.9,0,false)});
  fnt(x,500,13*s);x.fillStyle=MUTE;x.fillText('Só aparecem atividades com dia definido pelo administrador.',pad,H-24*s);
  return c;
}
/* ---- PDF mínimo com imagens JPEG (A4 paisagem) ---- */
async function pdfDeCanvases(cs){
  const enc=new TextEncoder(),parts=[],off=[];let len=0;
  const put=x=>{const b=typeof x==='string'?enc.encode(x):x;parts.push(b);len+=b.length};
  const obj=(id,body,stream)=>{off[id]=len;put(`${id} 0 obj\n${body}`);if(stream){put('\nstream\n');put(stream);put('\nendstream')}put('\nendobj\n')};
  const imgs=[];for(const c of cs){const bl=await new Promise(r=>c.toBlob(r,'image/jpeg',0.9));imgs.push({b:new Uint8Array(await bl.arrayBuffer()),w:c.width,h:c.height})}
  const n=imgs.length,PW=841.89,PH=595.28;
  put('%PDF-1.4\n');put(new Uint8Array([37,226,227,207,211,10]));
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,`<< /Type /Pages /Kids [${imgs.map((_,i)=>`${3+3*i} 0 R`).join(' ')}] /Count ${n} >>`);
  imgs.forEach((im,i)=>{const p=3+3*i,ct=p+1,ix=p+2,cs=`q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
    obj(p,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${ix} 0 R >> >> /Contents ${ct} 0 R >>`);
    obj(ct,`<< /Length ${cs.length} >>`,cs);
    obj(ix,`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.b.length} >>`,im.b)});
  const max=2+3*n,xr=len;
  put(`xref\n0 ${max+1}\n0000000000 65535 f \n`+Array.from({length:max},(_,i)=>String(off[i+1]).padStart(10,'0')+' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${max+1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF\n`);
  return new Blob(parts,{type:'application/pdf'});
}
function baixar(blob,nome){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nome;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},4000)}
$('#eform').addEventListener('submit',async ev=>{
  ev.preventDefault();const sel=exSel();if(!sel.meses.length||!sel.com.length)return;
  const b=$('#egerar');b.disabled=true;b.textContent='Gerando…';$('#eerr').textContent='';
  try{
    try{await Promise.all(['400','500','600','700','800'].map(w=>document.fonts.load(`${w} 16px Inter`)))}catch(e){}
    const slug=(sel.org==='todas'?'todas':sel.org)+'-'+(sel.per==='meses'?sel.meses.map(m=>AB[m]).join('-'):sel.per);
    if(sel.fmt==='pdf'){const blob=await pdfDeCanvases(sel.meses.map(m=>canvasPDFPage(sel,m)));baixar(blob,`atividades-${ANO}-${slug}.pdf`)}
    else{const c=canvasPNG(sel);const blob=await new Promise(r=>c.toBlob(r,'image/png'));baixar(blob,`atividades-${ANO}-${slug}.png`)}
    toast('Arquivo gerado');$('#eov').classList.remove('on');
  }catch(e){$('#eerr').textContent='Não foi possível gerar o arquivo neste navegador.'}
  b.disabled=false;b.textContent='Gerar arquivo';
});

document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#eov').classList.remove('on')});

/* ================= LINK PÚBLICO ================= */
const LINK_PUBLICO=location.origin+'/publico/';
$('#lurl').value=LINK_PUBLICO;$('#labrir').href=LINK_PUBLICO;
$('#lorg').innerHTML='<option value="">Todas as organizações</option>'+orgOpts('',false);
function icsUrl(org){return location.origin+(org?'/agenda/'+org+'.ics':'/agenda.ics')}
function pintaAssinar(){const u=icsUrl($('#lorg').value),w=u.replace(/^https?:/,'webcal:');$('#lical').href=w;$('#lgoogle').href='https://calendar.google.com/calendar/render?cid='+encodeURIComponent(w)}
pintaAssinar();$('#lorg').addEventListener('change',pintaAssinar);
$('#lcopics').addEventListener('click',async()=>{const u=icsUrl($('#lorg').value);try{await navigator.clipboard.writeText(u);toast('Link da agenda copiado')}catch(e){toast(u)}});
$('#publico').addEventListener('click',()=>{if(!$('#lqr').firstChild)$('#lqr').innerHTML=qrSvg();$('#lov').classList.add('on');setTimeout(()=>$('#lcopiar').focus(),30)});
$('#lcopiar').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(LINK_PUBLICO);toast('Link copiado — cole no grupo da ala')}catch(e){$('#lurl').select();toast('Selecionei o link: copie com Ctrl+C')}});
$('#lurl').addEventListener('focus',e=>e.target.select());
$('#lclose').addEventListener('click',()=>$('#lov').classList.remove('on'));
$('#lov').addEventListener('click',e=>{if(e.target===$('#lov'))$('#lov').classList.remove('on')});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#lov').classList.remove('on')});

/* ================= HISTÓRICO ================= */
function cleanHist(r){if(!r)return null;const snap=o=>o&&typeof o==='object'?{nome:String(o.nome??'').slice(0,140),mes:Number.isInteger(Number(o.mes))?Number(o.mes):null,dia:Number(o.dia)||0,horario:typeof o.horario==='string'?o.horario.slice(0,5):'',org:ORG[o.org]?o.org:'',detalhes:String(o.detalhes??'').slice(0,400)}:null;
  return{id:String(r.id),quando:Date.parse(r.quando)||0,quem:String(r.quem_nome||'Sistema').slice(0,80),acao:String(r.acao||'').slice(0,40),origem:String(r.origem||'').slice(0,40),nome:String(r.nome||'').slice(0,140),org:ORG[r.org]?r.org:'',ano:Number(r.ano)||null,antes:snap(r.antes),depois:snap(r.depois),detalhe:String(r.detalhe||'').slice(0,300)}}
async function carregarHist(){
  if(!isAdmin||!sb)return;histCarregando=true;if(view==='historico')render();
  const r=await sb.from('historico').select('*').order('quando',{ascending:false}).limit(histLim);
  histCarregando=false;histErro=r.error?traduz(r.error):'';hist=r.error?[]:(r.data||[]).map(cleanHist).filter(Boolean);if(view==='historico')render();
}
function vHistorico(){
  if(!isAdmin)return `<div class="card cad"><p class="small">Só administradores veem esta tela.</p></div>`;
  const qd=o=>o?(o.mes===null?'':o.dia?`${o.dia} de ${MESES[o.mes]}`:`${MESES[o.mes]} (dia a definir)`)+(o.horario?' às '+o.horario:''):'';
  const lista=hist.filter(h=>histOrg==='todas'||h.org===histOrg);
  const filtros=`<div class="histf"><select class="sel" id="historg" aria-label="Filtrar histórico por organização"><option value="todas">Todas as organizações</option>${orgOpts(histOrg==='todas'?'':histOrg,true)}</select><span class="small">${histCarregando?'Carregando…':plural(lista.length,'registro','registros')}</span></div>`;
  if(histErro)return filtros+`<div class="card cad"><p class="small">Não foi possível carregar o histórico: ${esc(histErro)}</p></div>`;
  if(!lista.length)return filtros+`<div class="card cad"><p class="empty">${histCarregando?'Carregando…':'Nenhuma mudança registrada ainda.'}</p></div>`;
  let dAnt='',html='';
  for(const h of lista){
    const dt=new Date(h.quando),dk=dt.toDateString();
    if(dk!==dAnt){if(dAnt)html+='</div>';html+=`<p class="hdia">${esc((s=>s.charAt(0).toUpperCase()+s.slice(1))(dt.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})))}</p><div class="hlist">`;dAnt=dk}
    const A=h.antes,D=h.depois,nm=`<b>“${esc(h.nome)}”</b>`;let det='';
    if(h.acao==='criou')det=D?'em '+esc(qd(D)):'';
    else if(h.acao==='agendou')det=D?'para '+esc(qd(D)):'';
    else if(h.acao==='remarcou')det=A&&D?`de ${esc(qd(A))} para ${esc(qd(D))}`:'';
    else if(h.acao==='tirou a data'||h.acao==='excluiu')det=A&&A.mes!==null?'estava em '+esc(qd(A)):'';
    else if(h.acao==='editou'&&A&&D){const ch=[];if(A.nome!==D.nome)ch.push(`nome: “${esc(A.nome)}” → “${esc(D.nome)}”`);if(A.org!==D.org&&ORG[A.org]&&ORG[D.org])ch.push(`organização: ${ORG[A.org].n} → ${ORG[D.org].n}`);if(A.detalhes!==D.detalhes)ch.push(`local/obs.: “${esc(A.detalhes||'—')}” → “${esc(D.detalhes||'—')}”`);det=ch.join(' · ')}
    else if(h.acao==='pediu alteração'&&D)det='quer '+esc(qd({...D,dia:0}).replace(' (dia a definir)',''))+(D.nome&&A&&D.nome!==A.nome?` · novo nome “${esc(D.nome)}”`:'');
    if(h.detalhe)det+=(det?' · ':'')+(h.acao.startsWith('recusou')?'resposta: ':h.acao.startsWith('pediu')?'motivo: ':'')+esc(h.detalhe);
    const ini=h.quem.split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'?';
    html+=`<div class="hrow"><span class="hh">${dt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span><span class="hav" style="--c:${h.org?`var(--o-${h.org})`:'var(--pri)'}" aria-hidden="true">${esc(ini)}</span><div><div class="ht"><b>${esc(h.quem)}</b> ${esc(h.acao)} ${nm}${h.org?` <span class="dot o-${h.org}" style="display:inline-flex">${ORG[h.org].n}</span>`:''}${h.origem?`<span class="tagp">${esc(h.origem)}</span>`:''}${h.ano&&h.ano!==ANO?`<span class="tagp">${h.ano}</span>`:''}</div>${det?`<div class="hd">${det}</div>`:''}</div></div>`;
  }
  html+='</div>';
  return filtros+html+(hist.length>=histLim?`<div style="margin-top:14px"><button type="button" class="btn" id="histmais">Carregar mais</button></div>`:'');
}

/* ================= RESPONSÁVEIS / LEMBRETES ================= */
const RCAMPOS=[['sacerdocio','Portador do Sacerdócio responsável','⛪'],['capela','Quem abrirá e fechará a capela','🔑'],['limpeza','Responsável pela limpeza','🧹']];
const diasPara=it=>it&&it.dia?Math.round((new Date(ANO,it.mes,it.dia)-hojeData())/864e5):null;
const dataCurta=(it,menos)=>{const d=new Date(ANO,it.mes,it.dia-(menos||0));return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})};
const podeResp=it=>!!it&&!ehEspecial(it.org)&&(isAdmin||it.autor===myId||it.org===minhaOrg());
const respFalta=it=>{const r=resps[it.id]||{};return RCAMPOS.filter(([k])=>!(r[k]||'').trim())};
function respStatus(it){const dd=diasPara(it),f=respFalta(it);
  if(dd>7)return{c:'',t:`🗓️ Responsáveis a partir de ${dataCurta(it,7)}`};
  if(!f.length)return{c:'ok',t:'✅ Responsáveis definidos'};
  if(dd>3)return{c:'urg',t:`✍️ Definir responsáveis até ${dataCurta(it,3)}`};
  return{c:'fim',t:'🙋 Prazo encerrado: peça ajuda'}}
const faltamTxt=dd=>dd===0?'é hoje':dd===1?'é amanhã':dd===7?'falta 1 semana':`faltam ${dd} dias`;
function proximasHtml(){
  if(papel()!=='aprovado')return '';
  const l=items.filter(i=>i.dia&&podeResp(i)&&(i.org===minhaOrg()||i.autor===myId)).map(i=>[i,diasPara(i)]).filter(([,d])=>d>=0&&d<=30).sort((x,y)=>x[1]-y[1]);
  const rp=items.filter(i=>i.dia&&podeResp(i)&&(i.org===minhaOrg()||i.autor===myId)&&!rels[i.id]).map(i=>[i,diasPara(i)]).filter(([,d])=>d<0&&d>=-21).sort((x,y)=>y[1]-x[1]);
  if(!l.length&&!rp.length)return '';
  return `<div class="prox">${l.length?`<p style="margin:0"><b>⏰ Suas próximas atividades</b></p>${l.map(([i,d])=>{const s=respStatus(i),ck=ckResumo(i.id);return `<div class="linha"><span>📅 <b>${esc(i.nome)}</b> · ${dataCurta(i)}${i.horario?' às '+i.horario:''} · ${faltamTxt(d)} <span class="stt ${s.c}">${s.t}</span>${ck?` <span class="stt${ck.ok===ck.tot?' ok':''}">📋 ${ck.ok}/${ck.tot}</span>`:''}</span><button type="button" class="btn" data-abrir="${esc(i.id)}">${d<=7&&respFalta(i).length?'Designar responsáveis':'Abrir'}</button></div>`}).join('')}`:''}${rp.length?`<p style="margin:${l.length?'8px':'0'} 0 0"><b>📝 Conte como foi</b></p>${rp.map(([i,d])=>`<div class="linha"><span>✔️ <b>${esc(i.nome)}</b> · ${dataCurta(i)} · ${d===-1?'foi ontem':'foi há '+(-d)+' dias'}</span><button type="button" class="btn pri" data-abrir="${esc(i.id)}">Enviar relatório</button></div>`).join('')}`:''}</div>`;
}
function semRespSemana(){return items.filter(i=>i.dia&&!ehEspecial(i.org)).filter(i=>{const d=diasPara(i);return d>=0&&d<=7&&respFalta(i).length})}
function pintaResp(it){
  const R=$('#fresp'),dd=diasPara(it);
  if(!it||!it.dia||!podeResp(it)||dd===null||dd<0){R.hidden=true;return}
  R.hidden=false;const r=resps[it.id]||{},f=respFalta(it),aberto=isAdmin||dd<=7,dentro=dd>3;
  $('#frespcampos').hidden=!aberto;$('#resperr').textContent='';
  ['rsac','rcap','rlim'].forEach((id,ix)=>{const e=$('#'+id);e.value=r[RCAMPOS[ix][0]]||'';e.disabled=false});
  let nota,cls='';
  if(!aberto)nota=`Os responsáveis serão designados a partir de ${dataCurta(it,7)} (1 semana antes da atividade).`;
  else if(!f.length){cls='ok';nota=`✅ Responsáveis definidos${r.porNome?' por '+r.porNome:''}. Você pode ajustar se precisar.`}
  else if(dentro){cls='urg';nota=`Obrigatório: preencha os três campos até ${dataCurta(it,3)} (3 dias antes). Se ainda não souber, toque em “Preencher depois”.`}
  else{cls='fim';nota=isAdmin?'⚠️ Faltam responsáveis e o prazo do líder (3 dias antes) já passou.':'⚠️ O prazo para designar (3 dias antes) terminou. Preencha agora ou peça ajuda à liderança.'}
  R.className='respbox'+(cls?' '+cls:'');$('#frespnota').textContent=nota;
  $('.respbtns').hidden=!aberto;$('#rdepois').hidden=!(aberto&&dentro&&f.length);$('#rajuda').hidden=!(aberto&&!dentro&&f.length&&!isAdmin);
}
async function salvarResp(parcial){
  const it=items.find(i=>i.id===editId);if(!it||busy)return;
  const v={atividade:it.id,sacerdocio:$('#rsac').value.trim(),capela:$('#rcap').value.trim(),limpeza:$('#rlim').value.trim()};
  const falta=RCAMPOS.filter(([k])=>!v[k]);
  if(!parcial&&falta.length){$('#resperr').textContent=`Preencha: ${falta.map(x=>x[1]).join(', ')}.`+(diasPara(it)>3?' Se ainda não souber, toque em “Preencher depois”.':'');return}
  if(parcial&&!v.sacerdocio&&!v.capela&&!v.limpeza){closeForm();toast(`Tudo bem! Lembre-se de designar os responsáveis até ${dataCurta(it,3)}.`);return}
  busy=true;const r=await exec(sb.from('responsaveis').upsert(v,{onConflict:'atividade'}));busy=false;
  if(!r){$('#resperr').textContent=$('#ferr').textContent;return}
  resps[it.id]={...(resps[it.id]||{}),...v};closeForm();
  toast(falta.length?`Salvo. Complete os responsáveis até ${dataCurta(it,3)}.`:'✅ Responsáveis salvos.');carregar();
}
$('#rsalvar').addEventListener('click',()=>salvarResp(false));
$('#rdepois').addEventListener('click',()=>salvarResp(true));
$('#rajuda').addEventListener('click',()=>{const it=items.find(i=>i.id===editId);if(!it)return;const vals={sacerdocio:$('#rsac').value.trim(),capela:$('#rcap').value.trim(),limpeza:$('#rlim').value.trim()};const f=RCAMPOS.filter(([k])=>!vals[k]),s=quemSou();sb.rpc('registrar_ajuda',{p_atividade:it.id,p_faltam:f.map(x=>x[1]).join(', ')}).then(()=>{},()=>{});
  waAbrir(WHATS_AJUDA,`Olá! Sou ${s.nome||'líder'}${s.pres?', '+s.pres:''}.\nPreciso de ajuda da liderança para designar responsáveis da atividade “${it.nome}” (${quandoTxt(it)}):\n${f.map(([,l,e])=>`${e} ${l}`).join('\n')}\n\nObrigado!`)});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest&&(e.target.closest('#frespcampos')||((e.target.closest('#fplan')||e.target.closest('#frel'))&&e.target.tagName==='INPUT'))){e.preventDefault();if(e.target.id==='pckn')$('#pckadd').click()}});

/* ================= WHATSAPP ================= */
function waAbrir(num,txt){window.open('https://wa.me/'+String(num||'').replace(/\D/g,'')+'?text='+encodeURIComponent(txt),'_blank','noopener')}
function liderContato(uid){const m=isDono&&uid?membros[uid]:null;return{num:m&&m.whats?m.whats:'',nome:m&&m.nome?nomeCurto(m.nome).split(' ')[0]:''}}
function quandoTxt(it){return it.dia?fmtData(it.mes,it.dia)+(it.horario?' às '+it.horario:''):MESES[it.mes]+(it.horario?', às '+it.horario:'')+' (dia a definir)'}
function msgLider(tipo,it,extra){
  const c=liderContato(it.autor),oi=c.nome?`Olá, ${c.nome}!`:'Olá!',org=ORG[it.org]?` (${ORG[it.org].n})`:'',q=quandoTxt(it);
  const t={
    agendada:`${oi} A atividade “${it.nome}”${org} foi agendada para ${q}.`,
    remarcada:`${oi} A atividade “${it.nome}”${org} foi remarcada para ${q}.`,
    semdia:`${oi} Sobre a atividade “${it.nome}”${org}: está prevista para ${q}. O dia ainda será definido pelo administrador.`,
    alterar:`${oi} Seu pedido de alteração de “${it.nome}” foi aprovado. Agora a atividade é em ${q}.`,
    cancelar:`${oi} Seu pedido de cancelamento de “${it.nome}” foi aprovado. A atividade saiu do calendário.`,
    recusado:`${oi} Seu pedido sobre “${it.nome}” não foi aprovado.`+(extra?` Resposta do administrador: ${extra}`:'')
  }[tipo];
  return t+(tipo==='cancelar'?'':`\n\nCalendário da ala: ${LINK_PUBLICO}`);
}
function msgCompartilhar(it){return `📅 ${it.nome}${ORG[it.org]?' — '+ORG[it.org].n:''}\n${quandoTxt(it)}${it.detalhes?'\n📍 '+it.detalhes:''}\n\nCalendário da ala: ${LINK_PUBLICO}`}
const acaoWa=(uid,txt)=>({label:'Avisar no WhatsApp',fn:()=>waAbrir(liderContato(uid).num,txt)});

/* ================= FERIADOS (nacionais e do DF) ================= */
const ferCache={};
function feriados(y){
  if(ferCache[y])return ferCache[y];
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,mm=Math.floor((a+11*h+22*l)/451);
  const pascoa=new Date(y,Math.floor((h+l-7*mm+114)/31)-1,((h+l-7*mm+114)%31)+1),rel=n=>new Date(y,pascoa.getMonth(),pascoa.getDate()+n),out={};
  const add=(dt,n,fac)=>{out[dt.getMonth()+'-'+dt.getDate()]={n,f:!!fac}};
  [[0,1,'Confraternização Universal'],[3,21,'Tiradentes e Fundação de Brasília'],[4,1,'Dia do Trabalho'],[8,7,'Independência do Brasil'],[9,12,'Nossa Senhora Aparecida'],[10,2,'Finados'],[10,15,'Proclamação da República'],[10,20,'Consciência Negra'],[10,30,'Dia do Evangélico (DF)'],[11,25,'Natal']].forEach(([m,dd,n])=>add(new Date(y,m,dd),n));
  add(rel(-48),'Carnaval',1);add(rel(-47),'Carnaval',1);add(rel(-46),'Quarta-feira de Cinzas',1);add(rel(-2),'Sexta-feira Santa');add(rel(60),'Corpus Christi',1);
  return ferCache[y]=out}
const feriado=(m,d)=>d?feriados(ANO)[m+'-'+d]||null:null;

/* ================= QR CODE DO CALENDÁRIO PÚBLICO ================= */
const QRN=33,QRM='111111101110110011111101001111111100000101101110001001001001000001101110100110100100111001101011101101110101111101011010011101011101101110100001001001010010101011101100000100011111000010000001000001111111101010101010101010101111111000000001000101001100000100000000101101110011001011000101001001011011110000100100010111101001101111001010100011001010000001111111011101010000010011010110010100101000111001110000000101000010110111011111010011010010010010010010101010001110110001001110110010001001100111101000000110010010110011001100110100110001100100101110011010100010101011011111101001001111011011100001101111010101001100100110100001010001001010011100001100010011000000100010001101000111000101110110001011111010100111101001001101001001111000110010000101101010011011101010101101010111010101101010101101101011100101000010111110001000000001100111110011101100011000111111101110000001111101101010000100000101010111100011111100011110101110100000000101010111111110100101110101110001000001101000101101101110101110101000000100101100100100000100000000111101011101111001111111101100110111110101001010100';
function qrSvg(){let d='';for(let r=0;r<QRN;r++)for(let c=0;c<QRN;c++)if(QRM.charCodeAt(r*QRN+c)===49)d+=`M${c+4} ${r+4}h1v1h-1z`;return `<svg viewBox="0 0 ${QRN+8} ${QRN+8}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`}
function drawQR(c,x,y,size,s){const u=size/(QRN+8);c.fillStyle='#fff';rr(c,x,y,size,size,8*s);c.fill();c.strokeStyle=LINE;c.lineWidth=1.5*s;c.stroke();c.fillStyle='#111';
  for(let r=0;r<QRN;r++)for(let k=0;k<QRN;k++)if(QRM.charCodeAt(r*QRN+k)===49)c.fillRect(Math.floor(x+(k+4)*u),Math.floor(y+(r+4)*u),Math.ceil(u),Math.ceil(u));
  fnt(c,600,11*s);c.fillStyle=MUTE;c.textAlign='center';c.fillText('Calendário sempre atualizado',x+size/2,y+size+15*s);c.textAlign='left'}

/* ================= PLANEJAMENTO: ESPAÇOS, ORÇAMENTO, CHECKLIST ================= */
const ESPACOS=[['capela','Capela','⛪'],['salao','Salão cultural','🎭'],['salas','Salas de aula','🏫'],['cozinha','Cozinha','🍳'],['patio','Área externa / quadra','🌳'],['batisterio','Batistério','💧']];
const ESP=Object.fromEntries(ESPACOS.map(e=>[e[0],e]));
const MODELOS={
  acampamento:{n:'Acampamento',p:/acamp/i,itens:['Autorização dos pais ou responsáveis','Ficha médica e contato de emergência','Pelo menos 2 adultos responsáveis','Local reservado e confirmado','Transporte e motoristas','Alimentação e água','Kit de primeiros socorros']},
  batismo:{n:'Batismo',p:/batism/i,itens:['Entrevista batismal marcada','Fonte batismal limpa e cheia com antecedência','Roupas brancas e toalhas','Testemunhas designadas','Discursantes e orações designados','Programa impresso','Registro do batismo']},
  comida:{n:'Atividade com comida',p:/lanche|jantar|almoço|almoco|churrasco|festa|confraterniz|piquenique|café|cafe|ceia|bolo/i,itens:['Cardápio definido','Quem traz o quê','Pratos, copos e talheres','Cozinha reservada','Limpeza da cozinha e do lixo']},
  passeio:{n:'Passeio ou viagem',p:/passeio|viagem|excurs|visita|templo|trilha/i,itens:['Autorização dos pais ou responsáveis','Pelo menos 2 adultos responsáveis','Transporte e motoristas','Horário de saída e de volta divulgado','Lista de presença','Contato de emergência']},
  servico:{n:'Projeto de serviço',p:/servi[çc]o|servir|doa[çc]|mutir|caridade/i,itens:['Instituição ou local contatado','Materiais e ferramentas','Transporte','Divulgação na ala','Fotos com autorização']},
  esporte:{n:'Atividade esportiva',p:/futebol|v[oô]lei|basquete|esporte|olimp|gincana|jogo|corrida/i,itens:['Quadra ou local reservado','Material (bolas, coletes, apito)','Água','Kit de primeiros socorros','Adulto responsável pela segurança']},
  devocional:{n:'Devocional, aula ou palestra',p:/devocional|aula|palestra|ser[ãa]o|workshop|oficina|treinamento/i,itens:['Orador ou professor confirmado','Oração e hinos escolhidos','Equipamento (som, projetor)','Divulgação na ala']}
};
const sugerirModelo=n=>Object.keys(MODELOS).find(k=>MODELOS[k].p.test(n||''))||'';
function cleanPlano(r){const o=Number(r.orcamento);return{espacos:(Array.isArray(r.espacos)?r.espacos:[]).filter(e=>ESP[e]),orcamento:r.orcamento==null||!Number.isFinite(o)?null:o,modelo:MODELOS[r.modelo]||r.modelo==='proprio'?r.modelo:'',checklist:(Array.isArray(r.checklist)?r.checklist:[]).filter(x=>x&&typeof x.t==='string'&&x.t.trim()).slice(0,30).map(x=>({t:x.t.trim().slice(0,120),ok:x.ok===true})),atualizado:Date.parse(r.atualizado)||0}}
const reais=v=>v==null?'—':v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtNum=v=>v==null?'':v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function lerValor(t){t=String(t||'').replace(/R\$|\s/g,'');if(!t)return null;if(t.includes(','))t=t.replace(/\./g,'').replace(',','.');else if((t.match(/\./g)||[]).length>1||/\.\d{3}$/.test(t))t=t.replace(/\./g,'');if(!/^\d+(\.\d{1,2})?$/.test(t))return NaN;const v=Number(t);return v>1000000?NaN:v}
function ckResumo(id){const p=planos[id];if(!p||!p.checklist.length)return null;return{tot:p.checklist.length,ok:p.checklist.filter(x=>x.ok).length}}
function conflitosEsp(m,d,esp,exceto){if(!d||!esp||!esp.length)return [];return espRes.filter(x=>x.id!==exceto&&x.mes===m&&x.dia===d&&x.espacos.some(e=>esp.includes(e))&&items.some(i=>i.id===x.id)).map(x=>({...x,comuns:x.espacos.filter(e=>esp.includes(e))}))}
function conflitosFuturos(){const g={};espRes.forEach(x=>{if(!x.dia||!items.some(i=>i.id===x.id))return;const dd=Math.round((new Date(ANO,x.mes,x.dia)-hojeData())/864e5);if(dd<0)return;x.espacos.forEach(e=>{const k=x.mes+'-'+x.dia+'-'+e;(g[k]=g[k]||{m:x.mes,d:x.dia,e,l:[]}).l.push(x)})});return Object.values(g).filter(c=>c.l.length>1).sort((a,b)=>a.m-b.m||a.d-b.d)}
function previstoOrg(org){return items.filter(i=>i.org===org&&planos[i.id]&&planos[i.id].orcamento!=null).reduce((t,i)=>t+planos[i.id].orcamento,0)}
function comprometidoOrg(org){return items.filter(i=>i.org===org).reduce((t,i)=>{const r=rels[i.id],p=planos[i.id];return t+(r&&r.gasto!=null?r.gasto:r&&!r.realizada?0:p&&p.orcamento!=null?p.orcamento:0)},0)}
function gastoOrg(org){return items.filter(i=>i.org===org&&rels[i.id]&&rels[i.id].gasto!=null).reduce((t,i)=>t+rels[i.id].gasto,0)}
function planoResumo(p){const ck=p.checklist.length?`${p.checklist.filter(x=>x.ok).length}/${p.checklist.length} itens`:'';return [p.espacos.map(e=>ESP[e][1]).join(', '),p.orcamento!=null?reais(p.orcamento):'',ck].filter(Boolean).join(' · ')||'Espaços, orçamento e checklist'}
function pintaPlano(it){
  const P=$('#fplan');$('#planerr').textContent='';
  if(!it||!podeResp(it)){P.hidden=true;planoTmp=null;return}
  const p=planos[it.id]||{espacos:[],orcamento:null,modelo:'',checklist:[]};
  planoTmp={id:it.id,espacos:[...p.espacos],modelo:p.modelo,checklist:p.checklist.map(x=>({...x})),salvo:!!planos[it.id]};
  if(!p.modelo&&!p.checklist.length){const sg=sugerirModelo(it.nome);if(sg){planoTmp.modelo=sg;planoTmp.checklist=MODELOS[sg].itens.map(t=>({t,ok:false}))}}
  P.hidden=false;$('#porc').value=fmtNum(p.orcamento);
  P.querySelectorAll('input,select,button').forEach(e=>e.disabled=false);
  const dd=diasPara(it);P.open=dd!==null&&dd>=0&&dd<=30;
  $('#fplanres').textContent=planos[it.id]?planoResumo(p):'Espaços, orçamento e checklist';
  pintaPlanoCorpo();
}
function pintaPlanoCorpo(){
  const t=planoTmp,it=t&&items.find(i=>i.id===t.id);if(!t||!it)return;
  $('#pesp').innerHTML=ESPACOS.map(([k,n,e])=>`<label class="chip"><input type="checkbox" data-esp="${k}"${t.espacos.includes(k)?' checked':''}><span>${e} ${n}</span></label>`).join('');
  const cf=conflitosEsp(it.mes,it.dia,t.espacos,it.id);
  $('#pespconf').hidden=!cf.length;$('#pespconf').innerHTML=cf.length?`⚠️ No mesmo dia: ${cf.map(x=>`<b>${esc(x.comuns.map(e=>ESP[e][1]).join(', '))}</b> já pedido por “${esc(x.nome)}” (${ORG[x.org].n}${x.horario?', '+x.horario:''})`).join('; ')}. Combine com a outra organização ou com a liderança.`:'';
  $('#pmod').innerHTML='<option value="">Sem checklist</option>'+Object.entries(MODELOS).map(([k,m])=>`<option value="${k}"${t.modelo===k?' selected':''}>${m.n}</option>`).join('')+`<option value="proprio"${t.modelo==='proprio'?' selected':''}>Minha lista</option>`;
  $('#pck').innerHTML=t.checklist.map((x,i)=>`<div class="ci${x.ok?' ok':''}"><label><input type="checkbox" data-ck="${i}"${x.ok?' checked':''}><span>${esc(x.t)}</span></label><button type="button" data-ckdel="${i}" aria-label="Tirar “${esc(x.t)}” da lista" title="Tirar da lista">×</button></div>`).join('')+(t.checklist.length?'':'<p class="small" style="margin:0">Escolha um modelo ou adicione seus próprios itens.</p>');
  const v=verbas[it.org];$('#porcnota').textContent=v!=null?`Verba anual ${daOrg(it.org)}: ${reais(v)} · previsto no ano: ${reais(previstoOrg(it.org))} · saldo: ${reais(v-comprometidoOrg(it.org))}`:'Valor que a atividade deve custar. Ajuda o bispado a acompanhar o orçamento.';
}
$('#fplan').addEventListener('change',e=>{const t=planoTmp;if(!t)return;
  if(e.target.dataset.esp){const k=e.target.dataset.esp;t.espacos=e.target.checked?[...new Set([...t.espacos,k])]:t.espacos.filter(x=>x!==k);pintaPlanoCorpo()}
  else if(e.target.id==='pmod'){const k=e.target.value;t.modelo=k;if(MODELOS[k]){const ja=new Map(t.checklist.map(x=>[x.t,x.ok]));t.checklist=MODELOS[k].itens.map(x=>({t:x,ok:!!ja.get(x)}))}else if(!k)t.checklist=[];pintaPlanoCorpo()}
  else if(e.target.dataset.ck!==undefined){const x=t.checklist[Number(e.target.dataset.ck)];if(x){x.ok=e.target.checked;e.target.closest('.ci').classList.toggle('ok',x.ok);if(t.salvo)salvarPlano(true)}}});
$('#fplan').addEventListener('click',e=>{const t=planoTmp;if(!t)return;const del=e.target.closest('[data-ckdel]');if(del){t.checklist.splice(Number(del.dataset.ckdel),1);if(t.modelo&&t.modelo!=='proprio')t.modelo='proprio';pintaPlanoCorpo()}});
$('#pckadd').addEventListener('click',()=>{const t=planoTmp,v=$('#pckn').value.trim();if(!t||!v)return;if(t.checklist.length>=30){$('#planerr').textContent='A lista pode ter até 30 itens.';return}t.checklist.push({t:v.slice(0,120),ok:false});if(t.modelo!=='proprio'&&MODELOS[t.modelo])t.modelo='proprio';else if(!t.modelo)t.modelo='proprio';$('#pckn').value='';pintaPlanoCorpo();$('#pckn').focus()});
async function salvarPlano(quieto){
  const t=planoTmp;if(!t||(busy&&!quieto))return;$('#planerr').textContent='';
  const orc=lerValor($('#porc').value);if(Number.isNaN(orc)){if(!quieto){$('#planerr').textContent='Orçamento inválido: use só números, por exemplo 150,00.';$('#porc').focus()}return}
  const row={atividade:t.id,espacos:t.espacos,orcamento:orc,modelo:t.modelo,checklist:t.checklist};
  if(!quieto)busy=true;const r=await exec(sb.from('planos').upsert(row,{onConflict:'atividade'}));if(!quieto)busy=false;
  if(!r){$('#planerr').textContent=$('#ferr').textContent;$('#ferr').textContent='';return}
  planos[t.id]={...row,checklist:row.checklist.map(x=>({...x})),atualizado:Date.now()};t.salvo=true;
  const ex=espRes.find(x=>x.id===t.id),it=items.find(i=>i.id===t.id);if(ex)ex.espacos=[...t.espacos];else if(it&&t.espacos.length)espRes.push({id:it.id,mes:it.mes,dia:it.dia,horario:it.horario,nome:it.nome,org:it.org,espacos:[...t.espacos]});
  $('#fplanres').textContent=planoResumo(planos[t.id]);
  if(!quieto){const cf=it?conflitosEsp(it.mes,it.dia,t.espacos,it.id):[];toast(cf.length?'Planejamento salvo. Atenção: há conflito de espaço no mesmo dia.':'📋 Planejamento salvo.');render()}
}
$('#psalvar').addEventListener('click',()=>salvarPlano(false));

/* ================= RELATÓRIO PÓS-ATIVIDADE ================= */
function pintaRel(it){
  const R=$('#frel'),dd=diasPara(it);$('#relerr').textContent='';
  if(!it||!podeResp(it)||dd===null||dd>=0){R.hidden=true;return}
  const r=rels[it.id];R.hidden=false;R.open=!r;R.querySelectorAll('input,textarea,button').forEach(e=>e.disabled=false);
  document.querySelector(`input[name=rreal][value="${!r||r.realizada?1:0}"]`).checked=true;
  $('#rpres').value=r&&r.presenca!=null?r.presenca:'';$('#rgasto').value=r?fmtNum(r.gasto):'';$('#robs').value=r?r.obs:'';
  $('#relnums').hidden=!!r&&!r.realizada;
  $('#frelres').textContent=r?`✅ Enviado${r.porNome?' por '+r.porNome:''}${r.realizada?` · ${r.presenca!=null?r.presenca+' pessoas':''}${r.gasto!=null?' · '+reais(r.gasto):''}`:' · não aconteceu'}`:'⏳ Ainda não enviado';
  $('#relsalvar').textContent=r?'Atualizar relatório':'Enviar relatório';
}
$('#frel').addEventListener('change',e=>{if(e.target.name==='rreal')$('#relnums').hidden=e.target.value==='0'});
$('#relsalvar').addEventListener('click',async()=>{
  const it=items.find(i=>i.id===editId);if(!it||busy)return;$('#relerr').textContent='';
  const real=(document.querySelector('input[name=rreal]:checked')||{}).value!=='0',ps=$('#rpres').value.trim(),g=lerValor($('#rgasto').value);
  if(real&&ps&&!/^\d{1,4}$/.test(ps)){$('#relerr').textContent='Presença: use só números, por exemplo 35.';$('#rpres').focus();return}
  if(real&&Number.isNaN(g)){$('#relerr').textContent='Gasto inválido: use só números, por exemplo 120,00.';$('#rgasto').focus();return}
  if(real&&!ps&&g===null&&!$('#robs').value.trim()){$('#relerr').textContent='Conte pelo menos a presença, o gasto ou uma observação.';$('#rpres').focus();return}
  const row={atividade:it.id,realizada:real,presenca:real&&ps?Number(ps):null,gasto:real?g:null,obs:$('#robs').value.trim()};
  busy=true;const r=await exec(sb.from('relatorios').upsert(row,{onConflict:'atividade'}));busy=false;
  if(!r){$('#relerr').textContent=$('#ferr').textContent;$('#ferr').textContent='';return}
  rels[it.id]={...row,porNome:quemSou().nome,atualizado:Date.now()};closeForm();toast('📝 Relatório enviado. Obrigado!');render();carregar();
});
function relPendentes(){return items.filter(i=>i.dia&&!ehEspecial(i.org)&&!rels[i.id]).filter(i=>{const d=diasPara(i);return d<0&&d>=-60}).sort((a,b)=>diasPara(b)-diasPara(a))}

/* ================= NÚMEROS (painel do admin) ================= */
async function carregarAjudas(){
  if(!isAdmin||!sb)return;const r=await sb.from('historico').select('org,ano').eq('acao','pediu ajuda da liderança para').limit(2000);
  ajudas=r.error?[]:(r.data||[]).filter(h=>Number(h.ano)===ANO&&ORG[h.org]);ajudasOk=true;if(view==='numeros'){const ae=document.activeElement;if(!(ae&&ae.closest&&ae.closest('#verbaform')))$('#view').innerHTML=vNumeros()}
}
function vNumeros(){
  if(!isAdmin)return `<div class="card cad"><p class="small">Só administradores veem esta tela.</p></div>`;
  const L=items.filter(i=>!ehEspecial(i.org)),pas=L.filter(i=>i.dia&&diasPara(i)<0),vence=L.filter(i=>i.dia&&diasPara(i)<3);
  const noPrazo=i=>{const r=resps[i.id];if(!r||respFalta(i).length)return false;return r.atualizado<=new Date(ANO,i.mes,i.dia-3,23,59,59).getTime()};
  const relOk=pas.filter(i=>rels[i.id]),real=relOk.filter(i=>rels[i.id].realizada),pres=real.reduce((t,i)=>t+(rels[i.id].presenca||0),0);
  const totVerba=ORGS_LID.reduce((t,o)=>t+(verbas[o.k]||0),0),totComp=ORGS_LID.filter(o=>verbas[o.k]!=null).reduce((t,o)=>t+comprometidoOrg(o.k),0),totPrev=ORGS_LID.reduce((t,o)=>t+previstoOrg(o.k),0),totGasto=ORGS_LID.reduce((t,o)=>t+gastoOrg(o.k),0);
  const tile=(v,l,c)=>`<div class="tile${c?' '+c:''}"><b>${v}</b><span>${l}</span></div>`;
  const porMes=MESES.map((_,m)=>L.filter(i=>i.mes===m).length),mx=Math.max(1,...porMes);
  const rows=ORGS_LID.map(o=>{const l=L.filter(i=>i.org===o.k),p=pas.filter(i=>i.org===o.k),vc=vence.filter(i=>i.org===o.k),v=verbas[o.k],pv=previstoOrg(o.k),gs=gastoOrg(o.k);
    return `<tr><td><span class="dot o-${o.k}" style="color:var(--ink);font-size:14px">${o.n}</span></td><td class="r">${l.length}</td><td class="r">${l.filter(i=>i.dia).length}</td><td class="r">${vc.length?`${vc.filter(noPrazo).length}/${vc.length}`:'—'}</td><td class="r">${ajudasOk?ajudas.filter(h=>h.org===o.k).length:'…'}</td><td class="r">${p.length?`${p.filter(i=>rels[i.id]).length}/${p.length}`:'—'}</td><td class="r"><input data-verba="${o.k}" inputmode="decimal" maxlength="12" aria-label="Verba anual ${daOrg(o.k)}" value="${esc(v!=null?fmtNum(v):'')}" placeholder="0,00"></td><td class="r">${reais(pv)}</td><td class="r">${reais(gs)}</td><td class="r">${v!=null?`<b style="color:${v-comprometidoOrg(o.k)<0?'#c0392b':'inherit'}">${reais(v-comprometidoOrg(o.k))}</b>`:'—'}</td></tr>`}).join('');
  return `<div class="pend">
    <div class="ntiles">${tile(L.length,'Atividades da ala')}${tile(L.filter(i=>i.dia).length,'Com data','g')}${tile(`${relOk.length}/${pas.length}`,'Relatórios entregues')}${tile(pres,'Pessoas nas atividades realizadas')}${tile(ajudasOk?ajudas.length:'…','Pedidos de ajuda')}${tile(reais(totGasto),'Gasto real no ano')}</div>
    <section class="card panel"><h3>Atividades por mês em ${ANO}</h3><div class="mbars" role="img" aria-label="Atividades por mês: ${MESES.map((m,i)=>m+' '+porMes[i]).join(', ')}">${porMes.map((n,m)=>`<div class="mb" title="${MESES[m]}: ${plural(n,'atividade','atividades')}"><b>${n||''}</b><i style="height:${Math.round(n/mx*130)}px"></i><small>${AB[m]}</small></div>`).join('')}</div></section>
    <form class="card panel" id="verbaform" novalidate><h3>Por organização</h3><div class="scroll"><table class="num-org"><thead><tr><th>Organização</th><th class="r">Atividades</th><th class="r">Com data</th><th class="r" title="Responsáveis definidos até 3 dias antes">Responsáveis no prazo</th><th class="r">Pedidos de ajuda</th><th class="r">Relatórios</th><th class="r">Verba anual (R$)</th><th class="r">Previsto</th><th class="r">Gasto real</th><th class="r">Saldo</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td><b>Total</b></td><td class="r"><b>${L.length}</b></td><td class="r"><b>${L.filter(i=>i.dia).length}</b></td><td class="r">${vence.length?`${vence.filter(noPrazo).length}/${vence.length}`:'—'}</td><td class="r">${ajudasOk?ajudas.length:'…'}</td><td class="r">${pas.length?`${relOk.length}/${pas.length}`:'—'}</td><td class="r"><b>${reais(totVerba)}</b></td><td class="r"><b>${reais(totPrev)}</b></td><td class="r"><b>${reais(totGasto)}</b></td><td class="r"><b>${reais(totVerba-totComp)}</b></td></tr></tfoot></table></div>
    <div class="err" id="verbaerr" role="alert"></div>
    <div class="notif" style="justify-content:flex-start;align-items:center;gap:12px;margin-top:12px"><button type="submit" class="btn pri" id="verbasalvar">Salvar verbas</button><span class="small">“Responsáveis no prazo”: definidos até 3 dias antes. “Previsto” vem do planejamento de cada atividade e “Gasto real”, dos relatórios. “Saldo” é a verba menos o gasto real (ou o previsto, enquanto não há relatório). O líder vê a verba e o saldo da própria organização.</span></div></form>
  </div>`;
}
document.addEventListener('submit',async e=>{if(e.target.id!=='verbaform')return;e.preventDefault();if(!isAdmin||busy)return;$('#verbaerr').textContent='';
  const rows=[];for(const inp of document.querySelectorAll('[data-verba]')){const v=lerValor(inp.value);if(Number.isNaN(v)){$('#verbaerr').textContent='Valor inválido em '+ORG[inp.dataset.verba].n+': use só números, por exemplo 1.500,00.';inp.focus();return}if(v!==null||verbas[inp.dataset.verba]!=null)rows.push({org:inp.dataset.verba,ano:ANO,valor:v||0})}
  if(!rows.length){toast('Nada para salvar.');return}
  busy=true;const r=await exec(sb.from('orcamento_org').upsert(rows,{onConflict:'org,ano'}));busy=false;
  if(!r){$('#verbaerr').textContent=$('#ferr').textContent;return}
  rows.forEach(x=>verbas[x.org]=x.valor);if(document.activeElement)document.activeElement.blur();toast('💰 Verbas salvas.');render();
});

/* ================= QUEM SOU / BOAS-VINDAS ================= */
const FEM=['primaria','socorro','mocas'];
function nomeCurto(n){const w=String(n||'').trim().split(/\s+/).filter(Boolean);return w.length>1?w[0]+' '+w[w.length-1]:(w[0]||'')}
function quemSou(){
  const p=papel(),org=minhaAprov&&minhaAprov.status==='aprovado'&&ORG[minhaAprov.org]?minhaAprov.org:'';
  const completo=(meuCad&&meuCad.nome)||(membros[myId]&&membros[myId].nome)||meNome||(meEmail?meEmail.split('@')[0]:'');
  const nome=nomeCurto(completo);
  const pres=org?`Presidente ${daOrg(org)}`:'';
  let tit;
  if(p==='admin')tit=pres?pres+' · Administrador':(isDono?'Administrador da agenda':'Administrador');
  else if(p==='aprovado')tit=pres;
  else if(p==='pendente')tit='Cadastro em análise';
  else if(p==='recusado')tit='Cadastro não aprovado';
  else if(p==='sem-cadastro')tit='Complete seu cadastro';
  else tit='…';
  const ini=nome.split(' ').map(x=>x[0]||'').join('').toUpperCase().slice(0,2)||'?';
  return{nome,tit,pres,org,ini,saud:org?(FEM.includes(org)?'Bem-vinda':'Bem-vindo'):'Boas-vindas'};
}
function pintaQuem(){
  const q=$('#quem');if(!myId){q.hidden=true;return}
  const s=quemSou();q.hidden=false;
  $('#quemnome').textContent=s.nome||'Olá!';$('#quemtit').textContent=s.tit;$('#quemav').textContent=s.ini;
  q.style.setProperty('--c',s.org?`var(--o-${s.org})`:'var(--pri)');
}
let bvEstado=null,bvT=0;
const bvChave=s=>s&&s.user?s.user.id+'|'+(s.user.last_sign_in_at||''):'';
function bvAbrir(){
  const o=$('#bv');clearTimeout(bvT);o.className='bv';o.hidden=false;$('#bv1').textContent='';$('#bv2').textContent='';$('#bv3').textContent='';
  bvEstado='esperando';requestAnimationFrame(()=>requestAnimationFrame(()=>o.classList.add('on')));
  bvT=setTimeout(bvTexto,5000);
}
function bvTexto(){
  if(bvEstado!=='esperando')return;bvEstado='mostrando';clearTimeout(bvT);
  const s=quemSou();
  if(s.pres){$('#bv1').textContent=s.saud;$('#bv2').textContent=s.pres;$('#bv3').textContent=s.nome}
  else{$('#bv1').textContent=s.saud;$('#bv2').textContent=(s.nome||'que bom ter você aqui')+(s.nome?'!':'');$('#bv3').textContent=papel()==='admin'?s.tit:'Calendário de Atividades Ala Ceilândia Sul '+ANO}
  $('#bv').classList.add('txt');bvT=setTimeout(bvFechar,2800);
}
function bvFechar(){
  if(!bvEstado)return;bvEstado=null;clearTimeout(bvT);const o=$('#bv'),app=document.querySelector('.app');
  if(papel()!=='sem-cadastro'&&view!=='calendario')location.hash='calendario';
  o.classList.add('sai');app.classList.remove('entra');void app.offsetWidth;app.classList.add('entra');
  setTimeout(()=>{o.hidden=true;o.className='bv';app.classList.remove('entra');talvezTour()},700);
}
$('#bv').addEventListener('click',()=>{if(bvEstado==='mostrando')bvFechar()});
document.addEventListener('keydown',e=>{if(bvEstado==='mostrando'&&(e.key==='Enter'||e.key===' '||e.key==='Escape')){e.preventDefault();bvFechar()}});

/* ================= APP NO CELULAR (PWA) ================= */
function lerCopia(){try{const c=JSON.parse(localStorage.getItem(LSOFF)||'null');return c&&c.uid&&Array.isArray(c.atividades)?c:null}catch(e){return null}}
function usarCopia(uid){
  const c=lerCopia();if(!c||(uid||myId)!==c.uid)return false;
  if(!myId){myId=c.uid}
  aplicarConfig(c.config);acts=c.atividades.filter(r=>r.ano==null||Number(r.ano)===ANO).map(clean).filter(Boolean);items=acts;
  const adm=Array.isArray(c.admins)?c.admins:[];adminIds=adm.map(r=>String(r.user_id));isDono=adm.some(r=>String(r.user_id)===myId&&r.dono);isAdmin=adminIds.includes(myId);
  meuCad=isDono?null:(c.meuCad||null);minhaAprov=isDono?null:(c.minhaAprov||null);
  offline=true;carregado=true;mostrarApp();
  setStatus('Sem internet · cópia de '+new Date(c.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}),true);
  render();toast('📴 Sem internet: mostrando a última cópia salva neste aparelho. Para marcar ou alterar, conecte-se.');return true}
window.addEventListener('online',()=>{if(offline){if(sessao)carregar();else location.reload()}});
let pedidoInstalar=null;
const emApp=()=>(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;
const ehIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function pintaInstalar(){let fechado=false;try{fechado=!!localStorage.getItem('instalarFechado')}catch(e){}
  $('#instalar').hidden=!(myId&&!emApp()&&!fechado&&(pedidoInstalar||ehIOS))}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();pedidoInstalar=e;pintaInstalar()});
window.addEventListener('appinstalled',()=>{pedidoInstalar=null;try{localStorage.setItem('instalarFechado','instalado')}catch(e){}pintaInstalar();toast('📱 App instalado! Procure o ícone “Agenda da Ala” na tela inicial.')});
$('#instnao').addEventListener('click',()=>{try{localStorage.setItem('instalarFechado',String(Date.now()))}catch(e){}pintaInstalar()});
$('#instbtn').addEventListener('click',async()=>{
  if(pedidoInstalar){const p=pedidoInstalar;pedidoInstalar=null;p.prompt();try{const r=await p.userChoice;if(r&&r.outcome!=='accepted')pedidoInstalar=null}catch(e){}pintaInstalar();return}
  const safari=!/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(navigator.userAgent);
  pergunta({titulo:'📱 Instalar no iPhone',html:safari?`<ol class="passos"><li>Toque no botão <b>Compartilhar</b> (o quadrado com a seta para cima), na barra do Safari.</li><li>Role e toque em <b>Adicionar à Tela de Início</b>.</li><li>Confirme em <b>Adicionar</b>. O ícone <b>Agenda da Ala</b> aparece na tela inicial.</li></ol>`:`<p style="margin:0 0 10px">No iPhone, o app só pode ser instalado pelo <b>Safari</b>.</p><ol class="passos"><li>Copie o endereço do site e abra no Safari.</li><li>Toque em <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</li></ol>`,ok:'Entendi',acao:async()=>true});
});
if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register('/sw.js').catch(()=>{})});

/* ================= TOUR PELO SITE ================= */
let tourPassos=[],tourI=0,tourAntes=null,tourAuto=false;
const tourChave=()=>'tour:'+(myId||'');
const visivel=el=>!!el&&el.getClientRects().length>0&&!el.closest('[hidden]')&&getComputedStyle(el).visibility!=='hidden';
const primeiro=sel=>[...document.querySelectorAll(sel)].find(visivel)||null;
function passosTour(){
  const adm=isAdmin,P=[];
  P.push({t:'👋 Bem-vindo à Agenda da Ala!',d:'Em menos de um minuto você conhece as principais funções do site. Use “Próximo” ou as setas do teclado. Se preferir, toque em “Pular tour”.'});
  P.push({el:'#quem',t:'🙂 Este é você',d:adm?'Seu nome e seu papel. Como administrador, você define os dias, responde aos pedidos dos líderes e acompanha tudo.':'Seu nome e sua organização. O site mostra e libera o que é da sua organização.'});
  P.push({el:'aside nav',t:'🧭 Menu',d:'Calendário do mês, ano inteiro e o resumo por organização.'+(adm?' Mais abaixo ficam as telas de administração.':' Em “Meu cadastro” você confere seus dados.')});
  P.push({el:'#novo',t:'➕ Adicionar atividade',d:adm?'Crie atividades de qualquer organização, já com o dia e o horário, se quiser.':'Escolha o mês, o nome e o horário da atividade. O administrador define o dia e você recebe um aviso aqui no site.'});
  P.push({el:'.card.cal',t:'📅 Calendário do mês',d:'Cada cor é uma organização. 🎉 marca feriados e os dias listrados estão reservados pela Estaca ou pela Igreja Geral.'+(adm?' Toque num dia ou arraste uma atividade para definir a data.':'')});
  P.push({el:'#waitbox',t:'⏳ Aguardando data',d:adm?'Atividades que os líderes marcaram e ainda esperam o dia. Arraste para o calendário ou toque para escolher a data.':'Atividades que ainda esperam o administrador definir o dia.'});
  P.push({el:'.ag li button, .pill',t:'🗂️ Dentro de cada atividade',d:'Toque numa atividade para abrir os detalhes. Lá ficam os 👥 responsáveis (a partir de 1 semana antes), o 📋 planejamento com espaços, orçamento e checklist, e o 📝 relatório depois que ela acontece.'});
  if(visivel($('#aviso')))P.push({el:'#aviso',t:'🔔 Avisos para você',d:'O que precisa da sua atenção: atividades chegando, responsáveis a definir, relatórios e respostas do administrador.'});
  P.push({el:'#filtro',t:'🎨 Filtrar por organização',d:'Mostre no calendário só as atividades de uma organização.'});
  P.push({el:'#publico',t:'🔗 Link público',d:'O endereço para divulgar à ala, sem login. Tem QR code e o botão para assinar a agenda no Google Agenda ou no iPhone.'});
  P.push({el:'#exportar',t:'🖨️ Exportar',d:'Gera um PDF ou uma imagem do mês ou do ano, com QR code, pronto para o mural da capela.'});
  if(adm){
    P.push({el:'#navpend',t:'📥 Pendentes',d:'Atividades sem dia, pedidos de alteração dos líderes, responsáveis em falta, relatórios atrasados e conflitos de espaço.'});
    P.push({el:'#navnum',t:'📊 Números',d:'Atividades por mês e, por organização, responsáveis no prazo, relatórios, verba anual, gasto e saldo.'});
    P.push({el:'#navhist',t:'🕘 Histórico',d:'Quem criou, mudou ou excluiu cada atividade, e quando.'});
    if(isDono)P.push({el:'#navmem',t:'👥 Membros',d:'Aprove os líderes, nomeie administradores e ajuste as configurações: ano, prazo, WhatsApp de ajuda, robô de e-mails e cópia dos dados.'});
  }
  P.push({el:'.tema-desk, .tema-mob',t:'🌙 Modo escuro',d:'Alterne entre claro e escuro quando quiser. O site lembra a sua escolha.'});
  P.push({el:'#tourbtn',t:'✨ Tudo pronto!',d:'Quando quiser rever este passeio, toque em “Fazer tour” aqui embaixo. Bom trabalho!',fim:true});
  return P.filter(p=>!p.el||primeiro(p.el));
}
function iniciarTour(auto){
  if(!myId||!$('#tour').hidden)return;
  tourAuto=!!auto;try{localStorage.setItem(tourChave(),String(Date.now()))}catch(e){}
  closeForm();document.querySelectorAll('.overlay.on').forEach(o=>o.classList.remove('on'));
  const comecar=()=>{tourPassos=passosTour();tourI=0;tourAntes=document.activeElement;$('#tour').hidden=false;document.body.style.overflow='hidden';mostrarPasso()};
  if(view!=='calendario'){location.hash='calendario';setTimeout(comecar,350)}else comecar();
}
function fecharTour(){
  if($('#tour').hidden)return;$('#tour').hidden=true;document.body.style.overflow='';
  const l=$('#tourluz');l.style.width=l.style.height='0px';
  if(tourAntes&&tourAntes.focus)try{tourAntes.focus()}catch(e){}
}
function mostrarPasso(){
  const p=tourPassos[tourI];if(!p){fecharTour();return}
  const card=$('#tourcard'),luz=$('#tourluz'),el=p.el?primeiro(p.el):null,red=matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.classList.add('troca');
  $('#tourn').textContent=`${tourI+1} de ${tourPassos.length}`;$('#tourt').textContent=p.t;$('#tourd').textContent=p.d;
  if(!$('#tourdots').firstChild)$('#tourdots').innerHTML='<i></i>';$('#tourdots').firstChild.style.setProperty('--p',Math.round((tourI+1)/tourPassos.length*100)+'%');
  $('#tourvoltar').hidden=tourI===0;$('#tourprox').textContent=p.fim||tourI===tourPassos.length-1?'Concluir':tourI===0?'Começar':'Próximo';
  const mostra=()=>{posicionarTour(el);card.classList.remove('troca');$('#tourprox').focus()};
  if(!el){setTimeout(mostra,30);return}
  const r0=el.getBoundingClientRect();if(r0.top<70||r0.bottom>innerHeight-40)el.scrollIntoView({block:r0.height>innerHeight*.6?'start':'center',behavior:red?'auto':'smooth'});
  // espera a rolagem terminar antes de medir
  let ult='',n=0;const t0=performance.now();const f=()=>{const r=el.getBoundingClientRect(),k=Math.round(r.top)+','+Math.round(r.left);if(k===ult)n++;else{n=0;ult=k}if(n>=4||performance.now()-t0>1500)mostra();else requestAnimationFrame(f)};requestAnimationFrame(f);
}
function posicionarTour(el){
  const card=$('#tourcard'),luz=$('#tourluz'),m=12,W=innerWidth,H=innerHeight,cw=card.offsetWidth,ch=card.offsetHeight;
  if(!el){luz.classList.add('vazio');luz.style.left=W/2+'px';luz.style.top=H/2+'px';luz.style.width=luz.style.height='0px';card.dataset.pos='centro';card.style.left=Math.max(m,(W-cw)/2)+'px';card.style.top=Math.max(m,(H-ch)/2)+'px';return}
  const r=el.getBoundingClientRect(),pad=8,x=Math.max(4,r.left-pad),y=Math.max(4,r.top-pad),w=Math.min(W-8,r.right+pad)-x,h=Math.min(H-8,r.bottom+pad)-y;
  luz.classList.remove('vazio');luz.style.left=x+'px';luz.style.top=y+'px';luz.style.width=w+'px';luz.style.height=h+'px';luz.style.borderRadius=Math.min(16,h/2)+'px';
  let top,pos;
  if(y+h+14+ch<=H-m){top=y+h+14;pos='abaixo'}else if(y-14-ch>=m){top=y-14-ch;pos='acima'}else{top=Math.max(m,H-ch-m);pos='centro'}
  const cx=x+w/2,left=Math.min(Math.max(m,cx-cw/2),W-cw-m);
  card.dataset.pos=pos;card.style.left=left+'px';card.style.top=top+'px';card.style.setProperty('--ax',Math.min(Math.max(22,cx-left),cw-22)+'px');
}
$('#tourprox').addEventListener('click',()=>{if(tourI>=tourPassos.length-1){fecharTour();toast('🧭 Tour concluído. Para rever, toque em “Fazer tour”.');return}tourI++;mostrarPasso()});
$('#tourvoltar').addEventListener('click',()=>{if(tourI>0){tourI--;mostrarPasso()}});
$('#tourpular').addEventListener('click',()=>{fecharTour();toast('Tudo bem! Para ver o tour depois, toque em “Fazer tour”.')});
$('#tourbtn').addEventListener('click',()=>iniciarTour(false));
document.addEventListener('keydown',e=>{if($('#tour').hidden)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();fecharTour()}
  else if(e.key==='ArrowRight'){e.preventDefault();e.stopImmediatePropagation();$('#tourprox').click()}
  else if(e.key==='ArrowLeft'){e.preventDefault();e.stopImmediatePropagation();if(tourI>0)$('#tourvoltar').click()}
  else if(e.key==='Tab'){const f=[...$('#tourcard').querySelectorAll('button:not([hidden])')];const i=f.indexOf(document.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}},true);
let tourRT=0;const reposTour=()=>{if($('#tour').hidden)return;clearTimeout(tourRT);tourRT=setTimeout(()=>{const p=tourPassos[tourI];posicionarTour(p&&p.el?primeiro(p.el):null)},60)};
window.addEventListener('resize',reposTour);window.addEventListener('scroll',reposTour,true);
function talvezTour(){
  if(!myId||!carregado||offline||bvEstado||!$('#tour').hidden||document.querySelector('.overlay.on'))return;
  if(!['admin','aprovado'].includes(papel()))return;
  let visto=true;try{visto=!!localStorage.getItem(tourChave())}catch(e){}
  if(!visto)setTimeout(()=>{if(!bvEstado&&$('#tour').hidden&&!document.querySelector('.overlay.on'))iniciarTour(true)},700);
}

/* ================= INÍCIO ================= */
function entrou(s){
  const novo=!sessao||sessao.user.id!==s.user.id;sessao=s;myId=s.user.id;meEmail=s.user.email||'';
  const md=s.user.user_metadata||{};meNome=String(md.full_name||md.name||'').slice(0,80);
  if(novo){let ver=false;try{const k=bvChave(s);ver=localStorage.getItem('bvLogin')!==k;localStorage.setItem('bvLogin',k)}catch(e){}if(ver)bvAbrir()}
  mostrarApp();if(offline&&!novo)carregar();if(novo){carregado=false;meuCad=undefined;minhaAprov=undefined;isDono=false;isAdmin=false;membros={};aprovs={};render();carregar();ouvir()}
}
function saiu(){offline=false;if(bvEstado){bvEstado=null;clearTimeout(bvT);$('#bv').hidden=true}sessao=null;myId=null;acts=[];items=[];carregado=false;isAdmin=false;isDono=false;if(canal){sb.removeChannel(canal);canal=null}authModo('entrar');mostrarLogin()}
function init(){
  route();
  if(!sb){
    $('#abody').innerHTML=`<p class="err">${window.supabase?'O arquivo config.js ainda não foi preenchido.':'Não foi possível carregar a biblioteca do Supabase. Verifique a internet.'}</p><p class="small">Abra o arquivo <b>config.js</b> e cole a Project URL e a chave publishable do seu projeto Supabase (Settings → API). Veja o passo a passo no README.</p>`;
    mostrarLogin();return;
  }
  authModo('entrar');
  sb.auth.onAuthStateChange((ev,s)=>{
    setTimeout(()=>{
      if(ev==='PASSWORD_RECOVERY'){if(s)sessao=s;mostrarLogin();authModo('nova');return}
      if(s&&s.user){if(amodo!=='nova')entrou(s)}
      else if(ev==='INITIAL_SESSION'&&!navigator.onLine&&lerCopia()){usarCopia(lerCopia().uid)}
      else saiu();
    },0);
  });
}
init();
}
