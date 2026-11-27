(function(){var mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):null;
function salvo(){try{return localStorage.getItem('tema')||'auto'}catch(e){return 'auto'}}
function efetivo(){var t=salvo();return t==='auto'?(mq&&mq.matches?'dark':'light'):t}
function pinta(){var alvo=efetivo()==='dark'?'light':'dark',nome=alvo==='dark'?'Escuro':'Claro';
  document.querySelectorAll('.tema').forEach(function(b){b.setAttribute('data-t',alvo);b.setAttribute('aria-label','Mudar para o modo '+nome.toLowerCase());b.title='Mudar para o modo '+nome.toLowerCase();b.querySelector('span').textContent=nome})}
function aplica(t){var r=document.documentElement;r.setAttribute('data-theme',t);try{localStorage.setItem('tema',t)}catch(e){}pinta()}
document.addEventListener('click',function(e){var b=e.target.closest('.tema');if(b)aplica(b.getAttribute('data-t'))});
if(mq&&mq.addEventListener)mq.addEventListener('change',pinta);
pinta();})();
