/* PP — signalement : module commun (chantier 72)
   v1.1 — 29/09/2026 : brique commune sortie de bom-sourcing. Nom de l appli = window.PP_APPLI si posé, sinon dossier de la page. */
/* ---------- signalement : module commun (chantier 72) ----------
   Auto-suffisant : URL de production en dur, l'en-tete X-PP-Auth est pose par
   l'intercepteur d'acces commun. Le contexte minimal (appli, version) part
   automatiquement. Destination : Data Table n8n + table Supabase signalements
   (lue par Claude) + mail immediat. */
(function(){
  var URL_SIG = 'https://protoprocess.app.n8n.cloud/webhook/v2-signalement';
  var CLE_SIGNALEUR = 'pp_signaleur';
  var SIG_TYPE = 'bug';
  var APPLI = window.PP_APPLI || (location.pathname.split('/').filter(Boolean).filter(function(x){ return x !== 'recette'; }).slice(-1)[0]) || 'appli';

  window.sigType = function(t){
    SIG_TYPE = t;
    document.querySelectorAll('#sig-types button').forEach(function(b){ b.classList.toggle('on', b.dataset.t === t); });
  };
  window.ouvrirSignalement = function(){
    try{ document.getElementById('sig-auteur').value = localStorage.getItem(CLE_SIGNALEUR) || ''; }catch(e){}
    document.getElementById('sig-msg').textContent = '';
    document.getElementById('sig-fond').classList.remove('hidden');
    document.getElementById('sig-desc').focus();
  };
  window.fermerSignalement = function(){ document.getElementById('sig-fond').classList.add('hidden'); };
  window.envoyerSignalement = function(){
    var desc = document.getElementById('sig-desc').value.trim();
    var msg = document.getElementById('sig-msg');
    if(!desc){ msg.innerHTML = '<span style="color:#f09595">Décrivez ce que vous avez constaté.</span>'; return; }
    var auteur = document.getElementById('sig-auteur').value.trim();
    try{ if(auteur) localStorage.setItem(CLE_SIGNALEUR, auteur); }catch(e){}
    var btn = document.getElementById('sig-env');
    btn.disabled = true;
    msg.innerHTML = '<span style="color:var(--text2,#94a3b8)">Envoi…</span>';
    fetch(URL_SIG, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        type: SIG_TYPE, description: desc, auteur: auteur,
        appli: APPLI, version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '')
      })
    }).then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      msg.innerHTML = '<span style="color:#86c564">Merci, c\'est envoyé.</span>';
      document.getElementById('sig-desc').value = '';
      setTimeout(window.fermerSignalement, 1400);
    }).catch(function(e){
      msg.innerHTML = '<span style="color:#f09595">Envoi impossible : ' + String(e.message).replace(/[<>&]/g,'') + '. Réessayez ou prévenez Olivier.</span>';
    }).then(function(){ btn.disabled = false; });
  };
})();
