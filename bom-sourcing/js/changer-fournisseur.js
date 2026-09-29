/* ============================================================
   PP — Achats : pop-up partagé « Changer fournisseur / réf »
   v1.0 — 29/09/2026 (chantier 186, séance 1)

   Une seule fenêtre pour les onglets Achats et En attente :
     - offres Mouser / DigiKey (webhook fabstory-ref-info)
     - « Liens fournisseur MPN » (recherche du MPN chez les distributeurs)
     - « Chercher un équivalent par spec » (spec déduite de l'IPN)
     - formulaire : fournisseur (liste), réf fournisseur (remplie seule pour
       DigiKey / Mouser), nouveau MPN si équivalent, nouvel IPN facultatif,
       case « J'ai déjà passé la commande chez ce fournisseur »
     - enchaînement des lignes : « Passer » / « Valider → suivant », compteur i/n

   Le pop-up ne sait PAS écrire : chaque onglet fournit `appliquer(ligne,
   valeurs, msg)` qui fait ses propres appels n8n. Ici, aucune URL d'écriture.

   Usage :
     PPChangerFourn.ouvrir({
       lignes: [{ so, mpn, ipn, fournisseur, ref, carte, extra }],
       refInfoUrl: 'https://…/webhook/fabstory-ref-info',
       stock: stockByIPN | null,             // facultatif : info IPN en stock PP
       caseSupplementaire: { id, texte, coche } | null,   // facultatif
       appliquer: async (ligne, valeurs, msg) => true|false,
       onFin: (nbValides) => {}
     });
   valeurs = { fournisseur, ref, nouveauMpn, nouvelIpn, dejaCommande, [caseSupplementaire.id] }
   ============================================================ */
(function(){
  'use strict';
  const VERSION = '1.0';

  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* Libellés = ceux que Luminovo écrit dans les feuilles achat (vérifié 03/09) */
  const FOURNISSEURS = [
    ['DigiKey USA', 'DigiKey'], ['Mouser USA', 'Mouser'], ['Farnell', 'Farnell'],
    ['RS Components GBR', 'RS'], ['__autre', 'Autre…']
  ];
  /* Clé courte pour la recherche de réf (ref-info renvoie distributeur = DigiKey | Mouser) */
  function cleRefAuto(f){
    const x = String(f||'').toLowerCase();
    if (x.indexOf('digikey') === 0 || x.indexOf('digi-key') === 0) return 'DigiKey';
    if (x.indexOf('mouser') === 0) return 'Mouser';
    return '';
  }

  /* Puissance standard d'une résistance CMS selon le boîtier (règle Olivier 29/09/2026) */
  const PUISSANCE_BOITIER = { '0201':'0.05W', '0402':'0.0625W', '0603':'0.1W', '0805':'0.125W', '1206':'0.25W', '1210':'0.5W', '2010':'0.75W', '2512':'1W' };

  /* Spec lisible depuis l'IPN PP, pour chercher un équivalent.
       C4U2-0402-16V-10P-X5R  -> "4.2uF 0402 16V 10% X5R"
       R2R00-1206             -> "2ohm 1206 1% 0.25W resistor"   (pas de PPM => 1 %, puissance = boîtier)
       R10K-0402-25PPM        -> "10k 0402 25ppm 0.1% 0.0625W resistor"   (PPM => précision) */
  function specDepuisIpn(ipn){
    const p = String(ipn||'').toUpperCase().split('-');
    if (!p.length) return '';
    let m = p[0].match(/^C(\d+)([UNP])(\d*)$/);
    if (m) {
      const unite = { U: 'uF', N: 'nF', P: 'pF' }[m[2]];
      const val = m[3] ? m[1] + '.' + m[3] : m[1];
      const morceaux = [val + unite, p[1] || ''];
      if (p[2]) morceaux.push(p[2].replace(/^(\d+)V(\d+)$/, '$1.$2V').replace(/^(\d+)V$/, '$1V'));
      if (p[3]) morceaux.push(p[3].replace(/^(\d+)P(\d+)$/, '$1.$2%').replace(/^(\d+)P$/, '$1%'));
      if (p[4]) morceaux.push(p[4]);
      return morceaux.filter(Boolean).join(' ');
    }
    m = p[0].match(/^R(\d+)([RKM])(\d*)$/);
    if (m) {
      const val = (m[3] ? m[1] + '.' + m[3].replace(/0+$/, '') : m[1]).replace(/\.$/, '');
      const unite = { R: 'ohm', K: 'k', M: 'M' }[m[2]];
      const boitier = p[1] || '';
      const morceaux = [val + unite, boitier];
      const ppm = p.find(x => /^\d+PPM$/.test(x));
      const tol = p.find(x => /^\d+P\d*$/.test(x) && x !== boitier);
      if (ppm) { morceaux.push(ppm.toLowerCase()); morceaux.push('0.1%'); }
      else morceaux.push(tol ? tol.replace(/^(\d+)P(\d+)$/, '$1.$2%').replace(/^(\d+)P$/, '$1%') : '1%');
      const puiss = p.find(x => /^\d+W\d*$/.test(x) || /^\d+\/\d+W$/.test(x));
      morceaux.push(puiss ? puiss.replace(/^(\d+)W(\d+)$/, '$1.$2W') : (PUISSANCE_BOITIER[boitier] || ''));
      morceaux.push('resistor');
      return morceaux.filter(Boolean).join(' ');
    }
    return '';
  }

  function liens(q){
    const e = encodeURIComponent(q);
    return [
      ['DigiKey', 'https://www.digikey.fr/fr/products/result?keywords=' + e],
      ['Mouser', 'https://www.mouser.fr/c/?q=' + e],
      ['Farnell', 'https://fr.farnell.com/search?st=' + e],
      ['RS', 'https://fr.rs-online.com/web/c/?searchTerm=' + e],
      ['Octopart', 'https://octopart.com/search?q=' + e]
    ].map(([n, u]) => '<a class="btn" style="padding:4px 11px; font-size:12px; text-decoration:none;" target="_blank" rel="noopener" href="' + esc(u) + '">' + n + ' ↗</a>').join('');
  }

  async function offres(refInfoUrl, mpn){
    if (!refInfoUrl || !mpn) return [];
    try {
      const r = await fetch(refInfoUrl + '?mpn=' + encodeURIComponent(mpn));
      const d = await r.json();
      return d.offres || [];
    } catch(e) { return []; }
  }

  function offreHtml(o, mpn){
    const extras = Object.keys(o)
      .filter(k => /stock|dispo|qt|prix|price/i.test(k) && o[k] !== '' && o[k] !== null && o[k] !== undefined)
      .map(k => k + ' : ' + esc(o[k])).join(' · ');
    const dn = String(o.distributeur||'').toLowerCase();
    const q = encodeURIComponent(o.spn || mpn || '');
    const url = o.url || o.lien || (dn.indexOf('digikey') >= 0 ? 'https://www.digikey.fr/fr/products/result?keywords=' + q : (dn.indexOf('mouser') >= 0 ? 'https://www.mouser.fr/c/?q=' + q : ''));
    const valeur = dn.indexOf('digikey') >= 0 ? 'DigiKey USA' : (dn.indexOf('mouser') >= 0 ? 'Mouser USA' : '');
    return '<div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:0.5px solid var(--border); font-size:12px;">'
      + '<b style="min-width:70px;">' + esc(o.distributeur||'?') + '</b>'
      + '<span style="font-family:var(--mono); font-size:11px;">' + esc(o.spn||'') + '</span>'
      + (url ? '<a class="btn" style="padding:2px 8px; font-size:11px; text-decoration:none;" target="_blank" rel="noopener" href="' + esc(url) + '">Site ↗</a>' : '')
      + '<span style="color:var(--text3); flex:1;">' + extras + '</span>'
      + (valeur ? '<button class="btn" style="padding:3px 10px; font-size:11px;" data-choisir="' + esc(valeur) + '" data-spn="' + esc(o.spn||'') + '">Choisir</button>' : '')
      + '</div>';
  }

  function ouvrir(cfg){
    const lignes = (cfg.lignes || []).filter(l => l && l.so);
    if (!lignes.length) return;
    let idx = 0, nbValides = 0;
    let fond = document.getElementById('pp-cf-fond');
    if (!fond) { fond = document.createElement('div'); fond.id = 'pp-cf-fond'; document.body.appendChild(fond); }
    fond.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.62); z-index:9999; display:flex; align-items:center; justify-content:center; padding:20px;';

    const fermer = () => { fond.style.display = 'none'; fond.innerHTML = ''; document.removeEventListener('keydown', onKey); if (cfg.onFin) cfg.onFin(nbValides); };
    const onKey = e => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', onKey);
    fond.onclick = e => { if (e.target === fond) fermer(); };

    const suivant = () => { idx++; if (idx >= lignes.length) fermer(); else rendre(); };

    function rendre(){
      const l = lignes[idx];
      const cible = l.mpn || l.ipn || '';
      const spec = specDepuisIpn(l.ipn);
      const fournActuel = String(l.fournisseur||'').replace(/^\?/, '').trim();
      const fournConnu = FOURNISSEURS.find(([v]) => v !== '__autre' && (v.toLowerCase() === fournActuel.toLowerCase() || v.toLowerCase().indexOf(fournActuel.toLowerCase()) === 0 && fournActuel));
      const stockInfo = (cfg.stock && Object.keys(cfg.stock).length) ? cfg.stock : null;
      const caseSup = cfg.caseSupplementaire;

      fond.innerHTML = '<div style="background:var(--surface); border:1px solid var(--border2); border-radius:var(--radius-lg); padding:18px 20px; width:min(96vw, 820px); max-height:92vh; overflow:auto; box-shadow:0 20px 60px rgba(0,0,0,0.5);">'
        + '<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:4px;">'
        +   '<div style="font-size:14px; font-weight:500;"><i class="ti ti-arrows-left-right" aria-hidden="true"></i> Changer fournisseur / réf'
        +   (lignes.length > 1 ? ' <span style="color:var(--text3); font-weight:400; font-size:12px;">— ligne ' + (idx+1) + ' / ' + lignes.length + '</span>' : '') + '</div>'
        +   '<button class="btn" style="padding:2px 8px;" id="pp-cf-x" title="Fermer"><i class="ti ti-x" aria-hidden="true"></i></button></div>'
        + '<div style="font-size:12px; color:var(--text2); margin-bottom:12px;">' + esc(l.so) + (l.carte ? ' — ' + esc(l.carte) : '')
        +   ' · <span style="font-family:var(--mono);">' + esc(cible) + '</span>' + (l.ipn && l.mpn ? ' · IPN <span style="font-family:var(--mono);">' + esc(l.ipn) + '</span>' : '')
        +   (fournActuel ? ' · actuellement <b>' + esc(fournActuel) + '</b>' : '') + '</div>'
        + '<div id="pp-cf-offres" style="font-size:12px; color:var(--text3); margin-bottom:10px;">Recherche des offres Mouser / DigiKey…</div>'
        + '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">'
        +   '<span style="font-size:13px; font-weight:500; margin-right:4px;">Liens fournisseur MPN :</span>' + (cible ? liens(cible) : '<span style="color:var(--text3);">pas de MPN sur la ligne</span>') + '</div>'
        + (spec
            ? '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:12px; padding-top:8px; border-top:1px dashed var(--border);">'
              + '<span style="font-size:13px; font-weight:500; margin-right:4px;">Chercher un équivalent par spec :</span>'
              + '<span style="background:var(--surface2); border:1px solid var(--border2); border-radius:20px; padding:3px 10px; font-family:var(--mono); font-size:12px; color:var(--text);">' + esc(spec) + '</span>'
              + liens(spec) + '</div>'
            : '')
        + '<div style="border-top:1px dashed var(--border); padding-top:12px;">'
        +   '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px 14px;">'
        +     '<div><div style="font-size:11px; color:var(--text3); margin-bottom:4px;">Fournisseur</div>'
        +       '<select id="pp-cf-fourn" style="width:100%; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface2); color:var(--text);">'
        +         FOURNISSEURS.map(([v, lb]) => '<option value="' + esc(v) + '"' + (fournConnu && fournConnu[0] === v ? ' selected' : '') + '>' + esc(lb) + '</option>').join('')
        +       '</select>'
        +       '<input id="pp-cf-fourn-autre" placeholder="Nom du fournisseur" value="' + esc(fournConnu || !fournActuel ? '' : fournActuel) + '" style="display:none; margin-top:6px; width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface2); color:var(--text);"></div>'
        +     '<div><div style="font-size:11px; color:var(--text3); margin-bottom:4px;">Réf. fournisseur</div>'
        +       '<input id="pp-cf-ref" placeholder="" style="width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px; font-family:var(--mono); border:1px solid var(--border); border-radius:var(--radius); background:var(--surface2); color:var(--text);">'
        +       '<div id="pp-cf-ref-info" style="font-size:11px; color:var(--text3); margin-top:4px;"></div></div>'
        +     '<div><div style="font-size:11px; color:var(--text3); margin-bottom:4px;">Nouveau MPN (seulement si équivalent)</div>'
        +       '<input id="pp-cf-mpn" placeholder="Laisser vide si le MPN ne change pas" style="width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px; font-family:var(--mono); border:1px solid var(--border); border-radius:var(--radius); background:var(--surface2); color:var(--text);"></div>'
        +     '<div><div style="font-size:11px; color:var(--text3); margin-bottom:4px;">Nouvel IPN (facultatif — inchangé si vide)</div>'
        +       '<input id="pp-cf-ipn" placeholder="' + esc(l.ipn || '') + '" style="width:100%; box-sizing:border-box; padding:6px 8px; font-size:13px; font-family:var(--mono); border:1px solid var(--border); border-radius:var(--radius); background:var(--surface2); color:var(--text);">'
        +       '<div id="pp-cf-ipn-info" style="font-size:11px; color:var(--text3); margin-top:4px;"></div></div>'
        +   '</div>'
        +   '<label style="display:flex; gap:8px; align-items:center; font-size:13px; font-weight:400; text-transform:none; letter-spacing:0; color:var(--text); cursor:pointer; margin-top:12px;"><input type="checkbox" id="pp-cf-deja"> J\'ai déjà passé la commande chez ce fournisseur (la ligne est marquée commandée)</label>'
        +   (caseSup ? '<label style="display:flex; gap:8px; align-items:center; font-size:13px; font-weight:400; text-transform:none; letter-spacing:0; color:var(--text); cursor:pointer; margin-top:8px;"><input type="checkbox" id="pp-cf-sup"' + (caseSup.coche ? ' checked' : '') + '> ' + esc(caseSup.texte) + '</label>' : '')
        + '</div>'
        + '<div id="pp-cf-msg" style="font-size:12px; color:var(--red); min-height:16px; margin-top:10px;"></div>'
        + '<div style="display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:8px;">'
        +   '<span style="flex:1; font-size:11px; color:var(--text3);">Fournisseur déjà bon sur la ligne ? Inutile de passer ici : « J\'ai commandé » suffit.</span>'
        +   '<button class="btn" id="pp-cf-annuler">' + (lignes.length > 1 ? 'Tout annuler' : 'Annuler') + '</button>'
        +   (lignes.length > 1 ? '<button class="btn" id="pp-cf-passer">Passer</button>' : '')
        +   '<button class="btn primary" id="pp-cf-ok">' + (idx < lignes.length - 1 ? 'Valider → suivant' : 'Valider le changement') + '</button>'
        + '</div></div>';

      const $ = id => document.getElementById(id);
      const msg = m => { const el = $('pp-cf-msg'); if (el) el.textContent = m || ''; };
      $('pp-cf-x').onclick = fermer;
      $('pp-cf-annuler').onclick = fermer;
      if ($('pp-cf-passer')) $('pp-cf-passer').onclick = suivant;

      /* Fournisseur : liste + champ libre pour « Autre… » */
      const elF = $('pp-cf-fourn'), elFA = $('pp-cf-fourn-autre'), elRef = $('pp-cf-ref'), elM = $('pp-cf-mpn'), elI = $('pp-cf-ipn');
      const fournisseur = () => elF.value === '__autre' ? elFA.value.trim() : elF.value;
      const majAutre = () => { elFA.style.display = (elF.value === '__autre') ? '' : 'none'; if (elF.value === '__autre') elFA.focus(); };
      if (!fournConnu && fournActuel) { elF.value = '__autre'; }
      majAutre();

      /* Réf auto DigiKey / Mouser : à l'ouverture, au changement de fournisseur ou de MPN. N'écrase jamais une saisie manuelle. */
      let refManuelle = false;
      elRef.addEventListener('input', () => { refManuelle = !!elRef.value.trim(); });
      const majRef = async () => {
        const cle = cleRefAuto(fournisseur());
        const info = $('pp-cf-ref-info');
        if (!cle) { if (info) info.textContent = 'Saisie manuelle pour ce fournisseur (réf trouvée automatiquement pour DigiKey et Mouser).'; if (!refManuelle) elRef.placeholder = ''; return; }
        if (refManuelle) return;
        const m = (elM.value || '').trim() || l.mpn || '';
        if (!m) { if (info) info.textContent = 'Pas de MPN : réf à saisir.'; return; }
        elRef.placeholder = 'Recherche en cours…';
        if (info) info.textContent = '';
        const spn = await (async () => { try { const off = await offres(cfg.refInfoUrl, m); const o = off.find(x => x.distributeur === cle); return o && o.spn ? o.spn : ''; } catch(e) { return ''; } })();
        if (document.getElementById('pp-cf-ref') !== elRef || refManuelle) return;
        elRef.value = spn || '';
        elRef.placeholder = spn ? '' : 'Non trouvée — saisir la réf';
        if (info) info.textContent = spn ? 'Réf ' + cle + ' trouvée automatiquement pour ' + m : 'Aucune réf ' + cle + ' trouvée pour ' + m;
      };
      elF.addEventListener('change', () => { majAutre(); majRef(); });
      elFA.addEventListener('change', majRef);
      elM.addEventListener('change', majRef);
      majRef();

      /* IPN : présence dans le stock PP (info, non bloquant) */
      const majIpn = () => {
        const info = $('pp-cf-ipn-info'); if (!info) return;
        const val = elI.value.trim();
        if (!val) { info.textContent = ''; return; }
        const modif = l.ipn && val.toUpperCase() !== String(l.ipn).toUpperCase();
        const stock = !stockInfo ? 'stock PP non chargé' : (stockInfo[val] !== undefined ? 'en stock PP : ' + stockInfo[val] + ' pcs' : 'IPN inconnu du stock PP');
        info.textContent = (modif ? 'Remplace ' + l.ipn + ' · ' : '') + stock;
        info.style.color = modif ? 'var(--amber)' : 'var(--text3)';
      };
      elI.addEventListener('input', majIpn);

      /* Offres : chargées après rendu, bouton « Choisir » pré-remplit fournisseur + réf */
      offres(cfg.refInfoUrl, l.mpn).then(off => {
        const zone = $('pp-cf-offres'); if (!zone) return;
        zone.innerHTML = off.length ? off.map(o => offreHtml(o, l.mpn)).join('') : '<span>Aucune offre Mouser / DigiKey' + (l.mpn ? '' : ' (pas de MPN sur la ligne)') + '.</span>';
        zone.querySelectorAll('button[data-choisir]').forEach(b => b.onclick = () => { elF.value = b.dataset.choisir; majAutre(); elRef.value = b.dataset.spn || ''; refManuelle = !!elRef.value; $('pp-cf-ref-info').textContent = 'Réf reprise de l\'offre.'; });
      });

      $('pp-cf-ok').onclick = async () => {
        const btn = $('pp-cf-ok');
        const v = {
          fournisseur: fournisseur(),
          ref: elRef.value.trim(),
          nouveauMpn: elM.value.trim(),
          nouvelIpn: elI.value.trim(),
          dejaCommande: !!$('pp-cf-deja').checked
        };
        if (caseSup) v[caseSup.id] = !!($('pp-cf-sup') && $('pp-cf-sup').checked);
        if (!v.fournisseur) { msg('Fournisseur requis.'); return; }
        if (v.nouveauMpn && v.nouveauMpn.toUpperCase() === String(l.mpn||'').toUpperCase()) { msg('Le nouveau MPN est identique à l\'ancien : laisser le champ vide.'); return; }
        if (v.nouveauMpn && !v.ref) { msg('Un équivalent (nouveau MPN) exige sa réf fournisseur.'); return; }
        if (v.nouvelIpn && l.ipn && v.nouvelIpn.toUpperCase() === String(l.ipn).toUpperCase()) v.nouvelIpn = '';
        btn.disabled = true;
        try {
          const ok = await cfg.appliquer(l, v, msg);
          if (ok === false) { btn.disabled = false; return; }
          nbValides++;
          suivant();
        } catch(e) { msg('Erreur : ' + e.message); btn.disabled = false; }
      };
      const premier = $('pp-cf-fourn'); if (premier) premier.focus();
    }
    rendre();
    return { fermer };
  }

  window.PPChangerFourn = { ouvrir, specDepuisIpn, VERSION };
})();
