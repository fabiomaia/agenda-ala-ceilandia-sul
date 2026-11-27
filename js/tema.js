(function(){var mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null,R=document.documentElement;
// Paletas: [nome, descrição, menu claro, menu escuro, botão claro, destaque, fundo claro]
var PAL={
  pinho:['Pinho','O verde original da agenda','#163f3a','#0d2724','#163f3a','#f0c040','#f3f5f5'],
  terracota:['Terracota e linho','Quente, de casa de avó','#5c3326','#2a1812','#8a4a32','#e0a458','#f6f1ea'],
  oliva:['Oliva e creme','Natural e tranquilo','#3a4530','#1e2618','#55663b','#d4a84a','#f3f1e7'],
  noite:['Azul-noite e areia','Calmo, de fim de tarde','#24324a','#141c2b','#2f4a6e','#d39a62','#f4f0e8'],
  ameixa:['Ameixa e pêssego','Delicado e acolhedor','#4a2c44','#281824','#6b3c62','#eaa98a','#f8f1ee']};
function salvo(){try{return localStorage.getItem('tema')||'auto'}catch(e){return 'auto'}}
function efetivo(){var t=salvo();return t==='auto'?(mq&&mq.matches?'dark':'light'):t}
function paleta(){var p;try{p=localStorage.getItem('paleta')}catch(e){}return PAL[p]?p:'pinho'}
function corBarra(){var p=PAL[paleta()];var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute('content',efetivo()==='dark'?p[3]:p[2])}
function pinta(){var alvo=efetivo()==='dark'?'light':'dark',nome=alvo==='dark'?'Escuro':'Claro';
  document.querySelectorAll('.tema').forEach(function(b){b.setAttribute('data-t',alvo);b.setAttribute('aria-label','Mudar para o modo '+nome.toLowerCase());b.title='Mudar para o modo '+nome.toLowerCase();var s=b.querySelector('span');if(s)s.textContent=nome});
  corBarra()}
function aplica(t){R.setAttribute('data-theme',t);try{localStorage.setItem('tema',t)}catch(e){}pinta()}
function aplicaPaleta(p){if(!PAL[p])p='pinho';if(p==='pinho')R.removeAttribute('data-paleta');else R.setAttribute('data-paleta',p);
  try{localStorage.setItem('paleta',p)}catch(e){}corBarra();
  var pn=document.getElementById('painelcores');if(pn)pn.querySelectorAll('.pco').forEach(function(b){b.setAttribute('aria-checked',b.getAttribute('data-p')===p?'true':'false')});
  try{document.dispatchEvent(new CustomEvent('paleta',{detail:p}))}catch(e){}}

// Botões "Cores" ao lado de cada botão claro/escuro
var ICONE='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5c0-4-4-7.2-9-7.2z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.2" r="1.2" fill="currentColor"/><circle cx="15" cy="7.4" r="1.2" fill="currentColor"/></svg>';
document.querySelectorAll('.tema').forEach(function(t){if(t.nextElementSibling&&t.nextElementSibling.classList.contains('paleta'))return;
  var b=document.createElement('button');b.type='button';b.className='paleta'+(t.classList.contains('tema-desk')?' paleta-desk':'')+(t.classList.contains('tema-mob')?' paleta-mob':'');
  b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Escolher as cores do site');b.title='Escolher as cores do site';
  b.innerHTML=ICONE+'<span>Cores</span>';t.insertAdjacentElement('afterend',b)});

var pn=null,origem=null;
function montar(){pn=document.createElement('div');pn.id='painelcores';pn.hidden=true;pn.setAttribute('role','dialog');pn.setAttribute('aria-modal','false');pn.setAttribute('aria-labelledby','pctit');
  var h='<div class="pch"><b id="pctit">Cores do site</b><button type="button" class="pcx" aria-label="Fechar">×</button></div><div class="pcl" role="radiogroup" aria-labelledby="pctit">';
  Object.keys(PAL).forEach(function(k){var p=PAL[k];
    h+='<button type="button" class="pco" role="radio" data-p="'+k+'" aria-checked="false"><span class="pcm" aria-hidden="true"><i style="background:'+p[2]+'"></i><i style="background:'+p[4]+'"></i><i style="background:'+p[5]+'"></i><i style="background:'+p[6]+'"></i></span><span class="pct"><b>'+p[0]+'</b><small>'+p[1]+'</small></span><span class="pcok" aria-hidden="true">✓</span></button>'});
  h+='</div><p class="pcn">Cada pessoa escolhe a sua. Fica salvo só neste aparelho e vale também no modo escuro. As cores das organizações não mudam.</p>';
  pn.innerHTML=h;document.body.appendChild(pn);
  pn.addEventListener('click',function(e){var o=e.target.closest('.pco');if(o){aplicaPaleta(o.getAttribute('data-p'));return}if(e.target.closest('.pcx'))fechar(true)});
  pn.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();fechar(true);return}
    if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].indexOf(e.key)>=0&&e.target.closest('.pco')){e.preventDefault();e.stopPropagation();
      var bs=[].slice.call(pn.querySelectorAll('.pco')),i=bs.indexOf(e.target),n=bs[(i+(e.key==='ArrowDown'||e.key==='ArrowRight'?1:bs.length-1))%bs.length];n.focus();aplicaPaleta(n.getAttribute('data-p'))}},true);
}
function posicionar(){if(!origem||!pn||pn.hidden)return;var r=origem.getBoundingClientRect(),w=pn.offsetWidth,hh=pn.offsetHeight,vw=innerWidth,vh=innerHeight;
  var left=Math.min(Math.max(12,r.right-w),vw-w-12),top=r.bottom+8;if(top+hh>vh-12)top=Math.max(12,r.top-hh-8);
  pn.style.left=left+'px';pn.style.top=top+'px';pn.style.right='auto';pn.style.bottom='auto'}
function abrir(b){if(!pn)montar();origem=b;aplicaPaleta(paleta());pn.hidden=false;
  document.querySelectorAll('.paleta').forEach(function(x){x.setAttribute('aria-expanded',x===b?'true':'false')});posicionar();
  var s=pn.querySelector('.pco[aria-checked=true]')||pn.querySelector('.pco');s.focus()}
function fechar(foco){if(!pn||pn.hidden)return;pn.hidden=true;document.querySelectorAll('.paleta').forEach(function(x){x.setAttribute('aria-expanded','false')});
  if(foco&&origem&&origem.offsetParent)origem.focus();origem=null}
window.fecharCores=fechar;

document.addEventListener('click',function(e){var b=e.target.closest('.tema');if(b){aplica(b.getAttribute('data-t'));return}
  var p=e.target.closest('.paleta');if(p){if(pn&&!pn.hidden&&origem===p)fechar(false);else abrir(p);return}
  if(pn&&!pn.hidden&&!e.target.closest('#painelcores'))fechar(false)});
addEventListener('resize',posicionar);addEventListener('scroll',posicionar,true);
if(mq&&mq.addEventListener)mq.addEventListener('change',pinta);
aplicaPaleta(paleta());pinta();})();
