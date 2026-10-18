/* ============================================================
   PP_EQUIV — règle d'équivalence « le candidat COUVRE la demande »
   v1.0 — 18/10/2026 (décision Olivier 18/10/2026)

   Une seule brique pour tous les écrans (Achats PP aujourd'hui, service de
   codification demain) : dit si une pièce en stock peut remplacer la pièce
   demandée sans dégrader la carte.

   Lecture d'un IPN Proto Process :
     R<valeur>-<boîtier>[-<puissance 0W33|1W>][-<ppm>PPM]      R10K-0603, R20R-2512-1W, R15K-0805-25PPM
     C<valeur>-<boîtier>-<tension>-<tolérance>-<diélectrique>  C100N-0603-50V-10P-X7R
     CT<valeur>-<case>-<tension>-<tolérance>[-<ESR>]           CT10U-B-25V-10P-3R
   Autre chose (actif) : pas de lecture, identité après retrait des suffixes.

   Règle (famille R / C / CT) :
     identiques   : valeur, boîtier                 → sinon JAMAIS
     candidat ≥   : tension, puissance, diélectrique (C0G > X8R > X7R > X7S > X6S > X5R > Y5V/Z5U)
     candidat ≤   : tolérance, ppm, ESR
     champ demandé absent chez le candidat → refus (jamais le bénéfice du doute, règle du 02/09/2026)
     champ absent dans la demande → non contraint
   ============================================================ */
(function (global) {
  'use strict';
  var VERSION = 'v1.0 - 18/10/2026';

  var DIEL_RANG = { 'C0G': 7, 'NP0': 7, 'NPO': 7, 'U2J': 7, 'X8R': 6, 'X7R': 5, 'X7S': 4, 'X7T': 4, 'X6S': 3, 'X5R': 2, 'Y5V': 1, 'Z5U': 1, 'X7U': 1 };

  function num(s) { var n = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isNaN(n) ? null : n; }

  function tensionV(seg) {
    var s = String(seg || '').toUpperCase(), m;
    m = s.match(/^(\d+)KV(\d*)$/); if (m) return parseFloat(m[1] + '.' + (m[2] || '0')) * 1000;
    m = s.match(/^(\d+)V(\d*)$/); if (m) return parseFloat(m[1] + '.' + (m[2] || '0'));
    return null;
  }
  function tolP(seg) { var m = String(seg || '').toUpperCase().match(/^(\d+)P(\d*)$/); return m ? parseFloat(m[1] + '.' + (m[2] || '0')) : null; }
  function puissanceW(seg) { var m = String(seg || '').toUpperCase().match(/^(\d+)W(\d*)$/); return m ? parseFloat(m[1] + '.' + (m[2] || '0')) : null; }
  function ppmN(seg) { var m = String(seg || '').toUpperCase().match(/^(\d+)PPM$/); return m ? parseFloat(m[1]) : null; }
  function esrR(seg) { var m = String(seg || '').toUpperCase().match(/^(\d+)R(\d*)$/); return m ? parseFloat(m[1] + '.' + (m[2] || '0')) : null; }

  /* Lit un IPN. Renvoie null si ce n'est pas un passif au format PP. */
  function lireIpn(ipn) {
    var s = String(ipn || '').trim().toUpperCase();
    if (!s) return null;
    var p = s.split('-'), m;
    if (p.length < 2) return null;

    m = p[0].match(/^R(\d+[RKM]\d*)$/);
    if (m && /^\d{4}$/.test(p[1])) {
      var r = { famille: 'R', valeur: m[1], boitier: p[1], puissance: null, ppm: null };
      for (var i = 2; i < p.length; i++) {
        if (puissanceW(p[i]) !== null) r.puissance = puissanceW(p[i]);
        else if (ppmN(p[i]) !== null) r.ppm = ppmN(p[i]);
      }
      return r;
    }
    m = p[0].match(/^CT(\d+[PNUM]\d*)$/);
    if (m) {
      return { famille: 'CT', valeur: m[1], boitier: p[1] || '', tension: tensionV(p[2]), tol: tolP(p[3]), esr: esrR(p[4]) };
    }
    m = p[0].match(/^C(\d+[PNUM]\d*)$/);
    if (m && /^\d{4}$/.test(p[1])) {
      return { famille: 'C', valeur: m[1], boitier: p[1], tension: tensionV(p[2]), tol: tolP(p[3]), diel: p[4] ? p[4].toUpperCase() : null };
    }
    return null;
  }

  /* Le candidat peut-il remplacer la demande ? → { ok, motif, ecart }
     ecart = distance pour classer plusieurs candidats (0 = identique). */
  function couvre(demandeIpn, candidatIpn) {
    var a = lireIpn(demandeIpn), b = lireIpn(candidatIpn);
    if (!a || !b) return { ok: null, motif: 'pas un passif PP', ecart: null };
    if (a.famille !== b.famille) return { ok: false, motif: 'famille ' + a.famille + ' / ' + b.famille, ecart: null };
    if (a.valeur !== b.valeur) return { ok: false, motif: 'valeur ' + a.valeur + ' / ' + b.valeur, ecart: null };
    if (a.boitier !== b.boitier) return { ok: false, motif: 'boitier ' + a.boitier + ' / ' + b.boitier, ecart: null };

    var ecart = 0, motifs = [];
    function sup(nom, va, vb, unite) {           // candidat doit être >= demandé
      if (va === null || va === undefined) return true;
      if (vb === null || vb === undefined) { motifs.push(nom + ' inconnu(e) chez le candidat'); return false; }
      if (vb < va) { motifs.push(nom + ' ' + vb + unite + ' < ' + va + unite); return false; }
      if (vb > va) ecart += (vb - va) / va;
      return true;
    }
    function inf(nom, va, vb, unite) {           // candidat doit être <= demandé
      if (va === null || va === undefined) return true;
      if (vb === null || vb === undefined) { motifs.push(nom + ' inconnu(e) chez le candidat'); return false; }
      if (vb > va) { motifs.push(nom + ' ' + vb + unite + ' > ' + va + unite); return false; }
      if (vb < va) ecart += (va - vb) / va;
      return true;
    }
    var ok = true;
    if (a.famille === 'R') {
      ok = sup('puissance', a.puissance, b.puissance, ' W') && ok;
      ok = inf('ppm', a.ppm, b.ppm, ' ppm') && ok;
    }
    if (a.famille === 'C' || a.famille === 'CT') {
      ok = sup('tension', a.tension, b.tension, ' V') && ok;
      ok = inf('tolerance', a.tol, b.tol, ' %') && ok;
    }
    if (a.famille === 'C' && a.diel) {
      var ra = DIEL_RANG[a.diel], rb = b.diel ? DIEL_RANG[b.diel] : undefined;
      if (rb === undefined) { motifs.push('dielectrique inconnu chez le candidat'); ok = false; }
      else if (ra !== undefined && rb < ra) { motifs.push('dielectrique ' + b.diel + ' < ' + a.diel); ok = false; }
      else if (ra !== undefined && rb > ra) ecart += 0.1 * (rb - ra);
    }
    if (a.famille === 'CT') ok = inf('ESR', a.esr, b.esr, ' ohm') && ok;

    return ok ? { ok: true, motif: ecart === 0 ? 'identique' : 'couvre la demande', ecart: ecart }
              : { ok: false, motif: motifs.join(', '), ecart: null };
  }

  global.PP_EQUIV = { VERSION: VERSION, lireIpn: lireIpn, couvre: couvre, DIEL_RANG: DIEL_RANG };
})(typeof window !== 'undefined' ? window : globalThis);
