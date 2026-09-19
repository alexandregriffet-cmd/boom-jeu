/* ============================================================
   BooM 💥 — Moteur de jeu (logique pure, sans DOM)
   ============================================================
   Déroulé d'une manche :
   1. demarrerManche   → tire une carte, désigne la Cible (rotation)
   2. la Cible :
        - utiliserVeto  → passe la manche, aucun point, véto décompté
        - choisirReaction → choisit en secret 1 de ses 5 réactions
   3. les autres joueurs : parier → misent sur la réaction de la Cible
   4. resoudreManche   → calcule les scores, détecte le BOOM
   5. demarrerManche à nouveau, ou terminerPartie
   Le Joker ("Je / J'") est utilisable une fois par joueur, à tout
   moment où c'est à lui de répondre, à la place d'une réaction.
   ============================================================ */

(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(require("./cartes.js"));
  } else {
    root.BoomEngine = factory(root.BoomCartes);
  }
})(typeof self !== "undefined" ? self : this, function (data) {
  const { CARTES, REACTIONS_M, REACTIONS_B, REACTIONS_D, NIVEAUX_GAGES, RECOMPENSES_GAGNANT } = data;

  function reactionsDuPack(pack) {
    if (pack === "M") return REACTIONS_M;
    if (pack === "D") return REACTIONS_D;
    return REACTIONS_B;
  }

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

    const joueurs = joueursInit.map((j, i) => ({
      id: j.id || `j${i + 1}`,
      nom: j.nom || `Joueur ${i + 1}`,
      pack: j.pack === "M" || j.pack === "B" ? j.pack : (i % 2 === 0 ? "M" : "B"),
      score: 0,
      vetosRestants: vetosParJoueur,
      jokerDisponible: true,
    }));

    const ordreCible = melanger(joueurs.map((j) => j.id), rng);

    return {
      rng,
      config: { niveauxActifs, vetosParJoueur, nbToursTotal: config.nbToursTotal || null },
      joueurs,
      cartesUtilisees: [],
      ordreCible,
      indexOrdre: 0,
      tour: 0,
      manche: null,
      historique: [],
      defisEnAttente: [],
      commentaires: [],
      finale: null,
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

    const cible = joueur(state, cibleId);
    const pack = carte.defi ? "D" : cible.pack;

    state.manche = {
      numero: state.tour,
      carteId: carte.id,
      carteTexte: carte.texte,
      niveau: carte.niveau,
      avecQui: carte.avecQui,
      defi: !!carte.defi,
      libre: !!carte.libre,
      pack, // paquet de réactions utilisé pour cette manche (M, B ou D)
      cibleId,
      // texte_libre (cartes libres uniquement) | reaction_cible | paris | joker_vote | terminee
      phase: carte.libre ? "texte_libre" : "reaction_cible",
      reactionChoisie: null,
      avecQuiReponse: null,
      paris: {},
      joker: null, // { texte, votes: {joueurId: bool} }
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
    m.phase = "reaction_cible";
    return m;
  }

  function utiliserVeto(state, joueurId) {
    const m = state.manche;
    if (!m || (m.phase !== "reaction_cible" && m.phase !== "texte_libre")) {
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

  function choisirReaction(state, joueurId, reactionId) {
    const m = state.manche;
    if (!m || m.phase !== "reaction_cible") throw new Error("Pas le moment de choisir une réaction.");
    if (joueurId !== m.cibleId) throw new Error("Seule la Cible choisit sa réaction ici.");
    const options = reactionsDuPack(m.pack);
    const reaction = options.find((r) => r.id === reactionId);
    if (!reaction) throw new Error("Réaction invalide pour ce pack.");
    m.reactionChoisie = reaction.id;
    m.phase = "paris";
    return m;
  }

  function utiliserJoker(state, joueurId, texteLibre) {
    const m = state.manche;
    if (!m || m.phase !== "reaction_cible") throw new Error("Pas le moment d'utiliser le Joker.");
    if (joueurId !== m.cibleId) throw new Error("Seule la Cible peut jouer son Joker sur sa propre manche.");
    const j = joueur(state, joueurId);
    if (!j.jokerDisponible) throw new Error("Joker déjà utilisé.");
    const texte = (texteLibre || "").trim();
    if (!/^(je|j['’])/i.test(texte)) {
      throw new Error("La réponse Joker doit commencer par « Je » ou « J' ».");
    }
    j.jokerDisponible = false;
    m.joker = { texte, votes: {} };
    m.phase = "joker_vote";
    return m;
  }

  function voterJoker(state, joueurId, approuve) {
    const m = state.manche;
    if (!m || m.phase !== "joker_vote") throw new Error("Pas de vote Joker en cours.");
    if (joueurId === m.cibleId) throw new Error("La Cible ne vote pas pour son propre Joker.");
    m.joker.votes[joueurId] = !!approuve;
    return m.joker;
  }

  function votantsAttendus(state) {
    return state.joueurs.filter((j) => j.id !== state.manche.cibleId).map((j) => j.id);
  }

  function resoudreJoker(state) {
    const m = state.manche;
    if (!m || m.phase !== "joker_vote") throw new Error("Pas de vote Joker en cours.");
    const attendus = votantsAttendus(state);
    const pour = attendus.filter((id) => m.joker.votes[id] === true).length;
    const approuve = pour > attendus.length / 2;
    const cible = joueur(state, m.cibleId);
    if (approuve) cible.score += 3;
    m.phase = "terminee";
    m.resultat = { type: "joker", approuve, texte: m.joker.texte, gain: approuve ? 3 : 0 };
    state.historique.push({ ...m });
    return m.resultat;
  }

  function parier(state, joueurId, reactionId, avecQuiPari) {
    const m = state.manche;
    if (!m || m.phase !== "paris") throw new Error("Pas le moment de parier.");
    if (joueurId === m.cibleId) throw new Error("La Cible ne parie pas sur elle-même.");
    const options = reactionsDuPack(m.pack);
    if (!options.find((r) => r.id === reactionId)) throw new Error("Pari invalide.");
    m.paris[joueurId] = { reactionId, avecQuiPari: avecQuiPari || null };
    return m;
  }

  function pariComplet(state) {
    const attendus = votantsAttendus(state);
    return attendus.every((id) => state.manche.paris[id] !== undefined);
  }

  function resoudreManche(state, avecQuiReponse) {
    const m = state.manche;
    if (!m || m.phase !== "paris") throw new Error("Pas le moment de résoudre la manche.");
    const cible = joueur(state, m.cibleId);
    m.avecQuiReponse = m.avecQui ? (avecQuiReponse || "").trim() : null;

    const gagnantsPari = [];
    for (const [joueurId, pari] of Object.entries(m.paris)) {
      if (pari.reactionId === m.reactionChoisie) {
        joueur(state, joueurId).score += 1;
        gagnantsPari.push(joueurId);
      }
    }
    const boom = gagnantsPari.length === 0;
    if (boom) cible.score += 2;

    m.phase = "terminee";
    m.resultat = {
      type: "manche",
      boom,
      reactionChoisie: m.reactionChoisie,
      gagnantsPari,
      cibleGain: boom ? 2 : 0,
      avecQuiReponse: m.avecQuiReponse,
      defiEnAttente: false,
      defiId: null,
    };

    if (m.defi) {
      const defiId = `d${m.numero}`;
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
  // tard dans la partie. reussi=true rapporte un bonus de 2 points à la Cible.
  function validerDefi(state, defiId, reussi) {
    const idx = state.defisEnAttente.findIndex((d) => d.id === defiId);
    if (idx === -1) throw new Error("Défi introuvable ou déjà validé.");
    const [entree] = state.defisEnAttente.splice(idx, 1);
    const cible = joueur(state, entree.cibleId);
    const bonus = reussi ? 2 : 0;
    cible.score += bonus;
    return { ...entree, reussi: !!reussi, bonus };
  }

  function classement(state) {
    return state.joueurs
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((j, i) => ({ rang: i + 1, ...j }));
  }

  function tirerGage(state, niveauGage, rng = (typeof state.rng === "function" ? state.rng : Math.random)) {
    const liste = NIVEAUX_GAGES[niveauGage] || NIVEAUX_GAGES.doux;
    return liste[Math.floor(rng() * liste.length)];
  }

  function terminerPartie(state, niveauGage = "piquant") {
    // state.rng ne survit pas forcément à un aller-retour réseau (ex :
    // Firebase, qui refuse de stocker des fonctions) : on retombe sur
    // Math.random si besoin plutôt que de planter.
    const rng = typeof state.rng === "function" ? state.rng : Math.random;
    state.terminee = true;
    // La récompense et le gage suggérés ne sont tirés qu'une seule fois et
    // mémorisés dans state.finale : sans ça, chaque appareil (hôte, chaque
    // invité) les tirait indépendamment de son côté et voyait un texte
    // différent. state.finale fait partie de l'état synchronisé via
    // Firebase, donc le premier tirage (celui de l'hôte) est ensuite
    // repris tel quel par tout le monde.
    if (!state.finale) {
      state.finale = {
        recompenseSuggeree: RECOMPENSES_GAGNANT[Math.floor(rng() * RECOMPENSES_GAGNANT.length)],
        gageSuggere: tirerGage(state, niveauGage, rng),
      };
    }
    const classe = classement(state);
    const gagnants = classe.filter((j) => j.score === classe[0].score);
    const scoreMin = classe[classe.length - 1].score;
    const perdants = classe.filter((j) => j.score === scoreMin);
    return {
      classement: classe,
      gagnants,
      perdants,
      recompenseSuggeree: state.finale.recompenseSuggeree,
      gageSuggere: state.finale.gageSuggere,
    };
  }

  // Permet à la Cible de préciser (ou corriger) qui elle visait, à
  // n'importe quel moment après la révélation — plus besoin d'avoir
  // rempli le champ avant de répondre : on peut le faire au moment du
  // BOOM, une fois qu'on sait que ça compte.
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

  // Petit fil de commentaires libres (ex : discuter du gage, confirmer
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
    choisirReaction,
    utiliserJoker,
    voterJoker,
    resoudreJoker,
    parier,
    pariComplet,
    resoudreManche,
    validerDefi,
    classement,
    terminerPartie,
    tirerGage,
    reactionsDuPack,
    preciserAvecQui,
    ajouterCommentaire,
  };
});
