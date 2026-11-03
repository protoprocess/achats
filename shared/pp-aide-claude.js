/* pp-aide-claude.js — v1.0 (03/11/2026)
 * ------------------------------------------------------------------
 * UN SEUL CHEMIN VERS CLAUDE, POUR TOUTES LES APPLIS PP.
 *
 * Demande d Olivier du 03/11/2026 au soir : « on peut rajouter les initiales de tout le
 * monde dans tous les appels a Claude depuis les applis puisqu on sait qui est derriere ? »
 *
 * POURQUOI L IDENTITE COMPTE. L equipe entiere questionne Claude dans le projet Proto
 * Process, et jusqu ici Claude ne savait pas qui ouvrait le fil : il traitait chaque
 * session comme si elle venait d Olivier, y compris pour des demandes qui engagent du code
 * ou un workflow. Le perimetre n est pas le meme. Ce fichier fait dire a l outil ce que la
 * personne ne pense pas a dire.
 *
 * CE QUE CA REMPLACE. Avant : l appli copiait un resume dans le presse-papier, ouvrait le
 * projet, et il fallait coller a la main — un geste de plus, souvent oublie, et un fil qui
 * commencait par « de quoi parlez-vous ? ». Maintenant le resume part DANS L URL : le fil
 * s ouvre deja ecrit.
 *
 * TOUTES LES APPLIS SONT SUR protoprocess.github.io, donc meme origine, donc MEME
 * localStorage : l identite choisie une fois sur le tableau de bord est lisible partout.
 * C est ce qui rend ce fichier possible sans rien demander a personne.
 *
 * UN SEUL EXEMPLAIRE, servi depuis achats/shared/ comme pp-acces.js. Les applis du depot
 * commercial le chargent par URL absolue : deux copies finiraient par diverger.
 *
 * USAGE :
 *   <script src="https://protoprocess.github.io/achats/shared/pp-aide-claude.js"></script>
 *   PPAide.ouvrir(resume, { appli: 'Achats PP', version: APP_VERSION });
 *
 * Le resume est le texte que l appli fabriquait deja. PPAide lui pose l identite devant et
 * n y touche pas autrement : chaque appli reste maitresse de ce qu elle raconte.
 * ------------------------------------------------------------------ */
(function (g) {
  'use strict';

  var VERSION = '1.1';
  var PROJET  = '019f6f80-4cd1-76bb-9d15-a5163b498d26';

  /* Au-dela de cette longueur l URL devient fragile (proxys, historique, navigateurs
     anciens). Un resume de BOM entiere peut depasser : on retombe alors sur le
     presse-papier, qui etait le fonctionnement d avant. Mieux vaut un geste de plus qu un
     lien casse. */
  var MAX_URL = 7000;

  function lire(cle) {
    try { return localStorage.getItem(cle) || ''; } catch (e) { return ''; }
  }

  /* QUI EST DEVANT L ECRAN.
     - pp_moi       : les initiales, ecrites par Mon tableau de bord depuis la v1.19
     - pp_personne  : le prenom, ecrit par le hub puis par le tableau de bord
     - pp_signaleur : le prenom, ecrit par le formulaire de signalement (plus ancien)
     On prend ce qu on trouve, dans cet ordre de fiabilite. Personne n est force de choisir
     son nom quelque part : si rien n est connu, on le DIT au lieu d inventer. */
  function qui(force) {
    /* Une appli qui SAIT mieux que le localStorage peut imposer l identite : Mon tableau de
       bord ouvert en ?qui=MM, par exemple, affiche la page d une personne sans rien
       memoriser sur le poste — c est fait pour un ecran d atelier ou pour regarder la page
       d un collegue. Sans ce passage de relais, le fil s ouvrait en disant qu on ne sait
       pas qui parle, alors que la page l affichait en haut a droite. */
    var ini = (force && force.initiales) || lire('pp_moi');
    var nom = (force && force.nom) || lire('pp_personne') || lire('pp_signaleur');
    ini = String(ini || '').toUpperCase();
    return { initiales: ini, nom: nom,
             libelle: ini ? (ini + (nom ? ' (' + nom + ')' : ''))
                          : (nom || '') };
  }

  /* La premiere ligne du fil. Sans identite connue, on demande a Claude de la demander :
     c est plus sur qu un fil anonyme traite comme s il venait de la direction. */
  function entete(o) {
    o = o || {};
    var q = qui(o.qui);
    var ou = (o.appli || 'une appli PP') + (o.version ? ' v' + o.version : '');
    return q.libelle
      ? "C'est " + q.libelle + ', depuis ' + ou + '.'
      : "Je suis un membre de l'équipe Proto Process, depuis " + ou
        + " — mon poste ne sait pas encore qui je suis, demande-moi mes initiales avant"
        + " toute action qui modifie quelque chose.";
  }

  function lien(texte) {
    return 'https://claude.ai/new?project=' + PROJET + '&q=' + encodeURIComponent(texte);
  }

  /* Repli : l ancien comportement, presse-papier puis ouverture du projet. Il ne sert que
     pour les resumes trop longs pour une URL. */
  function parPressePapier(texte) {
    var ok = function () {
      var m = document.createElement('div');
      m.innerHTML = '<b>&#10004; Résumé copié.</b> Il est trop long pour le lien : '
                  + 'dans Claude, ouvre un nouveau fil et colle (Ctrl+V).';
      m.style.cssText = 'position:fixed;top:18px;left:50%;transform:translateX(-50%);'
        + 'background:#17697A;color:#fff;border-radius:8px;padding:12px 20px;z-index:99999;'
        + 'font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.35)';
      document.body.appendChild(m);
      setTimeout(function () { m.remove(); }, 6000);
    };
    var ouvrir = function () {
      setTimeout(function () {
        window.open('https://claude.ai/project/' + PROJET, '_blank', 'noopener');
      }, 1200);
    };
    var copie = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = texte; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      copie = document.execCommand('copy'); ta.remove();
    } catch (e) {}
    if (copie) { ok(); ouvrir(); return; }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(texte).then(
        function () { ok(); ouvrir(); },
        function () { prompt('Copie ce résumé (Ctrl+C) puis colle-le dans Claude :', texte); ouvrir(); });
      return;
    }
    prompt('Copie ce résumé (Ctrl+C) puis colle-le dans Claude :', texte);
    ouvrir();
  }

  /* LE POINT D ENTREE. resume = ce que l appli raconte, tel quel.
     opts : { appli, version, question }
     « question » n est ajoutee que si le resume n en porte pas deja une — le deroule devis
     termine ses resumes par sa propre question, il ne faut pas la doubler. */
  function ouvrir(resume, opts) {
    opts = opts || {};
    var corps = String(resume == null ? '' : resume).trim();
    var bas = '';
    if (!/ma question\s*:/i.test(corps)) bas = '\n\nMa question :\n' + (opts.question || '');
    var texte = entete(opts) + (corps ? '\n\n' + corps : '') + bas;
    var url = lien(texte);
    if (url.length > MAX_URL) { parPressePapier(texte); return texte; }
    window.open(url, '_blank', 'noopener');
    return texte;
  }

  g.PPAide = { version: VERSION, qui: qui, entete: entete, lien: lien, ouvrir: ouvrir,
               projet: PROJET };
})(window);
