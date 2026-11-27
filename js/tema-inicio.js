try{var t=localStorage.getItem('tema');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);
var p=localStorage.getItem('paleta');if(/^(terracota|oliva|noite|ameixa)$/.test(p||''))document.documentElement.setAttribute('data-paleta',p)}catch(e){}
