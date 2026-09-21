/* =============================================================================
   Proto Process — Bouton « Retour à l'accueil »
   Version 1.0 — 21/09/2026 (chantier 174, accueil unique)

   POURQUOI CE FICHIER
   Quand on arrive dans une appli par le nouvel accueil (« Que veux-tu faire
   maintenant ? »), on doit pouvoir y revenir d'un clic.

   N'APPARAIT QUE SI ON EST PASSE PAR LE NOUVEL ACCUEIL
   L'accueil pose une marque dans la session du navigateur (sessionStorage,
   même origine protoprocess.github.io pour toutes les applis). Sans cette
   marque — accès par l'ancien accueil ou par un favori — le bouton ne
   s'affiche pas : la prod reste inchangée pendant la recette.
   L'adresse de retour est celle de l'accueil qui a posé la marque : au
   passage en prod, rien à modifier ici.

   PLACEMENT : en bas à gauche. Le bouton « Signaler » occupe déjà le bas à
   droite de chaque appli.

   APPEL : une seule ligne en fin de page, chemin relatif au dépôt :
     <script src="../shared/retour-accueil.js" defer></script>
   ========================================================================== */
(function () {
  'use strict';
  var VERSION = '1.0';
  var url = null;
  try { url = sessionStorage.getItem('pp_accueil_url'); } catch (e) { url = null; }
  if (!url) return;

  var css = document.createElement('style');
  css.textContent =
    '#pp-accueil{position:fixed;left:18px;bottom:18px;z-index:60;display:inline-flex;align-items:center;gap:7px;' +
    'padding:9px 14px;border-radius:20px;background:#1a2030;color:#e2e8f0;border:1px solid #333d55;' +
    'font:500 13px -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;' +
    'text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.35)}' +
    '#pp-accueil:hover,#pp-accueil:focus-visible{border-color:#F07B1F;color:#fff;outline:none}' +
    '#pp-accueil svg{flex:none}' +
    '@media print{#pp-accueil{display:none}}';
  document.head.appendChild(css);

  var a = document.createElement('a');
  a.id = 'pp-accueil';
  a.href = url;
  a.title = 'Retour à l\'accueil (bouton v' + VERSION + ')';
  a.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F07B1F" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l-2 0l9 -9l9 9l-2 0"/>' +
    '<path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg>' +
    '<span>Accueil</span>';
  document.body.appendChild(a);
})();
