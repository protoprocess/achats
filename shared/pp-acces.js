/* PP — accès aux webhooks n8n (code d accès partagé, en-tête X-PP-Auth)
   v1.0 — 29/09/2026 : brique commune sortie de bom-sourcing (identique à appro-v2). A charger EN PREMIER, sans defer. */
(function(){
  var KEY='pp_access_code', HDR='X-PP-Auth', HOST='protoprocess.app.n8n.cloud';
  function get(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
  function set(v){try{localStorage.setItem(KEY,v)}catch(e){}}
  function del(){try{localStorage.removeItem(KEY)}catch(e){}}

  /* 1) Interception installee EN PREMIER : ne depend d'aucun element HTML */
  var _f = window.fetch;
  window.fetch = function(input, init){
    var url = '';
    try { url = (typeof input === 'string') ? input : ((input && input.url) || ''); } catch(e){}
    if (url.indexOf(HOST) === -1) { return _f.apply(this, arguments); }
    init = init || {};
    try { var h = new Headers(init.headers || {}); h.set(HDR, get()); init.headers = h; } catch(e){}
    return _f.call(this, input, init).then(function(r){
      if (r && (r.status === 401 || r.status === 403)) { del(); demander("Code d'acces refuse. Ressaisissez-le."); }
      return r;
    });
  };

  /* 2) Ecran construit en JS : aucune dependance au HTML de l'appli */
  var box = null;
  function construire(){
    if (box) return box;
    box = document.createElement('div');
    box.id = 'pp-gate';
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0a0c12;display:none;'
      + 'align-items:center;justify-content:center;padding:20px;'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif';
    box.innerHTML =
      '<div style="background:#1a2030;border:1px solid #262e42;border-radius:10px;padding:26px;max-width:380px;width:100%">'
      + '<div style="font-size:13px;font-weight:500;margin-bottom:14px">'
      +   '<span style="color:#fff">PROTO PROCESS</span><span style="color:#444;margin:0 3px">/</span>'
      +   '<span style="color:#F07B1F">Acces</span></div>'
      + '<div style="font-size:12.5px;color:#94a3b8;line-height:1.55;margin-bottom:16px">'
      +   "Saisissez le code d'acces interne. Il ne vous sera demande qu'une fois sur cet appareil.</div>"
      + '<input id="pp-in" type="password" placeholder="Code d acces" autocomplete="off" '
      +   'style="width:100%;background:#161b27;border:1px solid #262e42;border-radius:6px;color:#e2e8f0;'
      +   'padding:9px 11px;font-size:13px;outline:none;font-family:inherit;box-sizing:border-box">'
      + '<div id="pp-err" style="font-size:12px;color:#f09595;margin-top:9px;min-height:16px"></div>'
      + '<button id="pp-btn" style="width:100%;margin-top:12px;padding:9px;background:#F07B1F;color:#fff;'
      +   'border:none;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Valider</button>'
      + '</div>';
    document.body.appendChild(box);
    var inp = box.querySelector('#pp-in'), btn = box.querySelector('#pp-btn');
    btn.addEventListener('click', function(){
      var v = (inp.value || '').trim();
      if (!v) { box.querySelector('#pp-err').textContent = 'Code requis.'; return; }
      set(v); inp.value = ''; box.style.display = 'none'; location.reload();
    });
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') { btn.click(); } });
    return box;
  }

  function demander(msg){
    if (!document.body) { document.addEventListener('DOMContentLoaded', function(){ demander(msg); }); return; }
    var b = construire();
    b.querySelector('#pp-err').textContent = msg || '';
    b.style.display = 'flex';
    setTimeout(function(){ try { b.querySelector('#pp-in').focus(); } catch(e){} }, 50);
  }

  window.ppChangerCode = function(){ del(); demander(''); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ if (!get()) demander(''); });
  } else if (!get()) { demander(''); }
})();
