/* ============================================================
   BooM 💥 — Moteur de jeu (logique pure, sans DOM)
   ============================================================
   Déroulé d'une manche, version simplifiée (sans pari ni Joker) :
   1. demarrerManche   → tire une carte, désigne la Cible (rotation).
      De temps en temps, c'est un gage qui sort à la place d'une
      situation classique.
   2. la Cible :
        - utiliserVeto     → passe la manche, elle est juste sautée
        - soumettreTexteLibre → (cartes "libres" uniquement) invente
          sa situation avant de répondre
        - validerManche    → la Cible a répondu/agi, on passe à la
          manche suivante
   Pas de points, pas de classement, pas de gagnant·e ni de
   perdant·e : juste des cartes et des gages qui s'enchaînent.
   Les cartes "Défi" restent validées manuellement (fait / pas
   fait) juste pour le suivi, sans bonus de points.
   ============================================================ */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./cartes.js"));
  } else {
    root.BoomEngine = factory(root.BoomCartes);
  }
})(typeof self !== "undefined" ? self : this, function (data) {
  const { CARTES, NIVEAUX_GAGES, REPONSES_SITUATION } = data;

  function melanger(tableau, rng) {
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
  }

  function creerPartie(joueursInit, config, rng = Math.random) {
    if (!Array.isArray(joueursInit) || joueursInit.length < 2) {
      throw new Error("Il faut au moins 2 joueurs pour démarrer une partie.");
    }
    const niveauxActifs = config.niveauxActifs && config.niveauxActifs.length
      ? config.niveauxActifs
      : ["doux", "piquant", "coquin", "brulant"];
    const vetosParJoueur = Number.isInteger(config.vetosParJoueur)
      ? Math.max(0, Math.min(5, config.vetosParJoueur))
      : 2;
    const probabiliteGage = typeof config.probabiliteGage === "number"
      ? Math.max(0, Math.min(1, config.probabiliteGage))
      : 0.2;

    const joueurs = joueursInit.map((j, i) => ({
      id: j.id || `j${i + 1}`,
      nom: j.nom || `Joueur ${i + 1}`,
      vetosRestants: vetosParJoueur,
    }));

    const ordreCible = melanger(joueurs.map((j) => j.id), rng);

    return {
      rng,
      config: { niveauxActifs, vetosParJoueur, probabiliteGage, nbToursTotal: config.nbToursTotal || null },
      joueurs,
      cartesUtilisees: [],
      ordreCible,
      indexOrdre: 0,
      tour: 0,
      manche: null,
      historique: [],
      defisEnAttente: [],
      commentaires: [],
      terminee: false,
    };
  }

  function joueur(state, id) {
    const j = state.joueurs.find((j) => j.id === id);
    if (!j) throw new Error(`Joueur inconnu : ${id}`);
    return j;
  }

  function piocherCarte(state) {
    const pool = CARTES.filter(
      (c) =>
        state.config.niveauxActifs.includes(c.niveau) &&
        !state.cartesUtilisees.includes(c.id)
    );
    if (pool.length === 0) return null;
    const idx = Math.floor(state.rng() * pool.length);
    return pool[idx];
  }

  function tirerGage(state, niveau, rng = (typeof state.rng === "function" ? state.rng : Math.random)) {
    const liste = NIVEAUX_GAGES[niveau] || NIVEAUX_GAGES.doux;
    return liste[Math.floor(rng() * liste.length)];
  }

  function demarrerManche(state) {
    if (state.terminee) throw new Error("La partie est terminée.");
    if (state.manche && state.manche.phase !== "terminee") {
      throw new Error("La manche en cours n'est pas terminée.");
    }
    if (
      state.config.nbToursTotal &&
      state.tour >= state.config.nbToursTotal
    ) {
      state.terminee = true;
      state.manche = null;
      return null;
    }
    const carte = piocherCarte(state);
    if (!carte) {
      state.terminee = true;
      state.manche = null;
      return null;
    }
    const cibleId = state.ordreCible[state.indexOrdre % state.ordreCible.length];
    state.indexOrdre += 1;
    state.tour += 1;
    state.cartesUtilisees.push(carte.id);

    // De temps en temps, un gage sort directement à la place d'une
    // situation classique — jamais sur une carte Défi (déjà une vraie
    // action) ni sur une carte "libre" (rien à remplacer, la Cible n'a
    // encore rien écrit).
    const eligibleGage = carte.niveau !== "defi" && !carte.libre;
    const estGage = eligibleGage && state.rng() < state.config.probabiliteGage;
    const gageTexte = estGage ? tirerGage(state, carte.niveau) : null;

    state.manche = {
      numero: state.tour,
      carteId: carte.id,
      carteTexte: carte.texte,
      niveau: carte.niveau,
      avecQui: carte.avecQui,
      defi: !!carte.defi,
      libre: !!carte.libre,
      estGage,
      gageTexte,
      cibleId,
      // texte_libre (cartes libres uniquement) | en_cours | terminee
      phase: carte.libre ? "texte_libre" : "en_cours",
      avecQuiReponse: null,
      resultat: null,
    };
    return state.manche;
  }

  function soumettreTexteLibre(state, joueurId, texte) {
    const m = state.manche;
    if (!m || m.phase !== "texte_libre") throw new Error("Pas le moment d'écrire une situation libre.");
    if (joueurId !== m.cibleId) throw new Error("Seule la Cible invente la situation ici.");
    const t = (texte || "").trim();
    if (!t) throw new Error("La situation ne peut pas être vide.");
    m.carteTexte = t;
    m.phase = "en_cours";
    return m;
  }

  function utiliserVeto(state, joueurId) {
    const m = state.manche;
    if (!m || (m.phase !== "en_cours" && m.phase !== "texte_libre")) {
      throw new Error("Pas le moment d'utiliser un véto.");
    }
    if (joueurId !== m.cibleId) throw new Error("Seule la Cible peut passer son tour.");
    const j = joueur(state, joueurId);
    if (j.vetosRestants <= 0) throw new Error("Plus de carte Véto disponible.");
    j.vetosRestants -= 1;
    m.phase = "terminee";
    m.resultat = { type: "veto", cibleId: joueurId };
    state.historique.push({ ...m });
    return m.resultat;
  }

  // La Cible a répondu/agi : on clôt la manche, sans aucun calcul de
  // points. Si la carte en demandait un, le champ "avec qui" peut être
  // précisé maintenant (ou plus tard via preciserAvecQui).
  //
  // Sur une carte situation classique (ni Défi, ni gage), la Cible doit
  // choisir une des 5 réponses honnêtes (reponseId) plutôt que de juste
  // taper "c'est fait" : personne ne devine, elle dit juste la vérité.
  // Elle peut aussi écrire sa propre réponse libre (reponseId = "libre",
  // avec reponseLibre rempli) plutôt que de choisir l'une des 5.
  // Les cartes Défi et les gages restent validées tout court.
  function validerManche(state, reponseId, avecQuiReponse, reponseLibre) {
    const m = state.manche;
    if (!m || m.phase !== "en_cours") throw new Error("Pas le moment de valider cette manche.");

    const demandeReponse = !m.defi && !m.estGage;
    let reponse = null;
    let texteLibre = null;
    if (demandeReponse) {
      if (reponseId === "libre") {
        texteLibre = (reponseLibre || "").trim().slice(0, 140);
        if (!texteLibre) throw new Error("Écris ta réponse avant de valider.");
      } else {
        reponse = REPONSES_SITUATION.find((r) => r.id === reponseId);
        if (!reponse) throw new Error("Choisis une réponse avant de valider.");
      }
    }

    m.reponseId = reponse ? reponse.id : texteLibre !== null ? "libre" : null;
    m.reponseLibre = texteLibre;
    m.avecQuiReponse = m.avecQui ? (avecQuiReponse || "").trim() : null;
    m.phase = "terminee";
    m.resultat = {
      type: "fait",
      reponseId: m.reponseId,
      reponseLibre: m.reponseLibre,
      avecQuiReponse: m.avecQuiReponse,
      defiEnAttente: false,
      defiId: null,
    };

    if (m.defi) {
      const defiId = `d${m.numero}`;
      const cible = joueur(state, m.cibleId);
      state.defisEnAttente.push({
        id: defiId,
        mancheNumero: m.numero,
        cibleId: m.cibleId,
        cibleNom: cible.nom,
        texte: m.carteTexte,
      });
      m.resultat.defiEnAttente = true;
      m.resultat.defiId = defiId;
    }

    state.historique.push({ ...m });
    return m.resultat;
  }

  // Valide manuellement un défi (fait / pas fait), tout de suite ou plus
  // tard dans la partie — juste pour le suivi, sans bonus de points.
  function validerDefi(state, defiId, reussi) {
    const idx = state.defisEnAttente.findIndex((d) => d.id === defiId);
    if (idx === -1) throw new Error("Défi introuvable ou déjà validé.");
    const [entree] = state.defisEnAttente.splice(idx, 1);
    return { ...entree, reussi: !!reussi };
  }

  function terminerPartie(state) {
    state.terminee = true;
    return {
      manchesJouees: state.tour,
      defisEnAttente: state.defisEnAttente.slice(),
    };
  }

  // Permet à la Cible de préciser (ou corriger) qui elle visait, à
  // n'importe quel moment après la fin de la manche.
  function preciserAvecQui(state, joueurId, texte) {
    const m = state.manche;
    if (!m || m.phase !== "terminee") throw new Error("Pas le moment de préciser ça.");
    if (!m.avecQui) throw new Error("Cette carte ne demande pas de précision.");
    if (joueurId !== m.cibleId) throw new Error("Seule la Cible peut préciser ça.");
    const t = (texte || "").trim().slice(0, 60);
    m.avecQuiReponse = t;
    if (m.resultat) m.resultat.avecQuiReponse = t;
    return m.resultat;
  }

  // Petit fil de commentaires libres (ex : discuter d'un gage, confirmer
  // qu'il a été fait…), utilisable pendant la partie ou à l'écran de fin.
  function ajouterCommentaire(state, joueurId, texte) {
    const t = (texte || "").trim().slice(0, 200);
    if (!t) throw new Error("Le commentaire ne peut pas être vide.");
    const j = joueur(state, joueurId);
    if (!Array.isArray(state.commentaires)) state.commentaires = [];
    const entree = {
      id: "com" + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      joueurId,
      nom: j.nom,
      texte: t,
      ts: Date.now(),
    };
    state.commentaires.push(entree);
    return entree;
  }

  return {
    creerPartie,
    demarrerManche,
    soumettreTexteLibre,
    utiliserVeto,
    validerManche,
    validerDefi,
    terminerPartie,
    tirerGage,
    preciserAvecQui,
    ajouterCommentaire,
  };
});
