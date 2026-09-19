/* ============================================================
   BooM 💥 — Application (interface + orchestration)
   Fonctionne en trois modes :
     - local  : un seul téléphone passé de main en main
     - hote   : salon en ligne, cet appareil héberge la partie
     - invite : salon en ligne, cet appareil a rejoint via un code

   Le mode en ligne passe par Firebase Realtime Database : tous les
   téléphones parlent à un serveur central (celui de Google), jamais
   directement entre eux. C'est ce qui rend la connexion fiable sur
   n'importe quel réseau (4G, box, opérateurs différents...) — voir
   firebase-config.js pour la configuration du projet.
   ============================================================ */

(function () {
  "use strict";

  const { NIVEAUX, NIVEAUX_GAGES } = window.BoomCartes || require("./cartes.js");
  const Engine = window.BoomEngine;

  // ------------------------------------------------------------
  // Firebase (salon en ligne)
  // ------------------------------------------------------------
  let db = null;
  try {
    if (window.firebase && window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.databaseURL) {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.database();
    }
  } catch (e) {
    console.error("Firebase non initialisé", e);
    db = null;
  }

  // ------------------------------------------------------------
  // État de l'application
  // ------------------------------------------------------------
  const contexte = {
    role: null,          // 'local' | 'hote' | 'invite'
    moiId: null,          // id du joueur qui tient l'appareil
    niveauxChoisis: NIVEAUX.map((n) => n.id),
    vetosParJoueur: 2,
    nbManches: 15,
    joueursLocaux: [],    // construction de la liste avant démarrage (local & hôte)
    packEnCours: null,    // pack sélectionné dans le formulaire d'ajout
  };

  let gameState = null;   // état du moteur (autorité locale ou hôte)
  let codeSalon = null;         // hôte : code du salon qu'il héberge
  let codeSalonRejoint = null;  // invité : code du salon rejoint
  let nomInvite = null;         // invité : prénom saisi
  let refSalon = null;          // référence Firebase vers /salons/<code>
  let monJoueurId = null;       // identifiant de joueur permanent (hôte ou invité)
  let ecouteursActifs = [];     // listeners Firebase actifs, à détacher au reset

  let apresTransfert = null; // callback en attente sur l'écran de transfert

  function genererIdJoueur() {
    return "j" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function ecouter(ref, event, cb) {
    ref.on(event, cb);
    ecouteursActifs.push({ ref, event, cb });
  }
  function detacherEcouteurs() {
    ecouteursActifs.forEach(({ ref, event, cb }) => { try { ref.off(event, cb); } catch (e) {} });
    ecouteursActifs = [];
  }

  // ------------------------------------------------------------
  // Utilitaires DOM
  // ------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function afficherEcran(id) {
    $$(".ecran").forEach((e) => e.classList.remove("actif"));
    const cible = document.getElementById(id);
    if (cible) cible.classList.add("actif");
  }

  function couleurNiveau(id) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--niveau-${id}`).trim();
  }

  function nomJoueur(id) {
    if (!gameState) return "—";
    const j = gameState.joueurs.find((j) => j.id === id);
    return j ? j.nom : "—";
  }

  // ------------------------------------------------------------
  // Écran d'accueil
  // ------------------------------------------------------------
  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    const gestionnaires = {
      "mode-local": () => demarrerConfiguration("local"),
      "mode-hote": () => demarrerConfiguration("hote"),
      "mode-invite": () => {
        contexte.packEnCours = null;
        $$("#ecran-rejoindre .btn-pack").forEach((b) => b.classList.remove("actif"));
        afficherEcran("ecran-rejoindre");
      },
      "retour-accueil": () => { reinitialiser(); afficherEcran("ecran-accueil"); },
      "voir-regles": () => $("#modale-regles").classList.add("ouverte"),
      "fermer-regles": () => $("#modale-regles").classList.remove("ouverte"),
      "rejoindre-salon": rejoindreSalon,
      "ajouter-joueur": ajouterJoueurLocal,
      "demarrer-partie": demarrerPartie,
      "transfert-pret": () => { if (apresTransfert) { const cb = apresTransfert; apresTransfert = null; cb(); } },
      "ouvrir-defis": () => { remplirModaleDefis(); $("#modale-defis").classList.add("ouverte"); },
      "fermer-defis": () => $("#modale-defis").classList.remove("ouverte"),
      "resync-invite": forcerRafraichissementInvite,
    };
    if (gestionnaires[action]) gestionnaires[action]();
  });

  document.addEventListener("click", (ev) => {
    const pack = ev.target.closest(".btn-pack");
    if (pack) {
      $$(".btn-pack").forEach((b) => b.classList.remove("actif"));
      pack.classList.add("actif");
      contexte.packEnCours = pack.dataset.pack;
    }
    const veto = ev.target.closest("[data-veto-delta]");
    if (veto) {
      const sel = $("#selecteur-vetos");
      let v = parseInt(sel.dataset.valeur, 10) + parseInt(veto.dataset.vetoDelta, 10);
      v = Math.max(0, Math.min(5, v));
      sel.dataset.valeur = v;
      $("#valeur-vetos").textContent = v;
      contexte.vetosParJoueur = v;
    }
    const manches = ev.target.closest("[data-manches-delta]");
    if (manches) {
      const sel = $("#selecteur-manches");
      let v = parseInt(sel.dataset.valeur, 10) + parseInt(manches.dataset.manchesDelta, 10);
      v = Math.max(5, Math.min(50, v));
      sel.dataset.valeur = v;
      $("#valeur-manches").textContent = v;
      contexte.nbManches = v;
    }
  });

  // Petit indicateur de connexion internet (Firebase expose cette
  // référence spéciale ; elle se met à jour automatiquement, y compris
  // après une coupure/reprise réseau ou une mise en veille du téléphone).
  if (db) {
    db.ref(".info/connected").on("value", (snap) => {
      const connecte = snap.val() === true;
      if (contexte.role === "invite" && document.getElementById("ecran-attente").classList.contains("actif")) {
        $("#statut-connexion").textContent = connecte
          ? "Connecté ! En attente du lancement par l'hôte…"
          : "Connexion internet perdue… reconnexion automatique en cours.";
      }
    });
  }

  function reinitialiser() {
    contexte.role = null;
    contexte.moiId = null;
    contexte.joueursLocaux = [];
    gameState = null;
    detacherEcouteurs();
    if (codeSalon && db) {
      // On était l'hôte : on nettoie le salon pour ne rien laisser traîner.
      try { db.ref("salons/" + codeSalon).remove(); } catch (e) {}
    }
    refSalon = null;
    codeSalon = null;
    codeSalonRejoint = null;
    nomInvite = null;
    monJoueurId = null;
  }

  // ------------------------------------------------------------
  // Écran de configuration (local + hôte)
  // ------------------------------------------------------------
  function demarrerConfiguration(role) {
    contexte.role = role;
    contexte.joueursLocaux = [];
    $("#erreur-config").textContent = "";
    $("#liste-joueurs").innerHTML = "";

    // Niveaux
    const zone = $("#choix-niveaux");
    zone.innerHTML = "";
    NIVEAUX.forEach((n) => {
      const div = document.createElement("div");
      div.className = "niveau-case selectionne";
      div.style.background = n.couleur;
      div.textContent = n.nom;
      div.dataset.niveau = n.id;
      div.addEventListener("click", () => {
        div.classList.toggle("selectionne");
        contexte.niveauxChoisis = $$(".niveau-case.selectionne").map((d) => d.dataset.niveau);
      });
      zone.appendChild(div);
    });
    contexte.niveauxChoisis = NIVEAUX.map((n) => n.id);

    $("#selecteur-vetos").dataset.valeur = 2;
    $("#valeur-vetos").textContent = 2;
    contexte.vetosParJoueur = 2;

    $("#selecteur-manches").dataset.valeur = 15;
    $("#valeur-manches").textContent = 15;
    contexte.nbManches = 15;

    $("#bloc-code-salon").style.display = role === "hote" ? "block" : "none";
    $("#aide-joueurs").textContent =
      role === "hote"
        ? "Ajoute-toi en premier, puis attends que les autres rejoignent avec le code."
        : "Ajoute chaque joueur avec son prénom et son paquet de réactions.";

    afficherEcran("ecran-config");
  }

  function ajouterJoueurLocal() {
    const champ = $("#champ-prenom-joueur");
    const nom = champ.value.trim();
    $("#erreur-config").textContent = "";
    if (!nom) { $("#erreur-config").textContent = "Donne un prénom."; return; }
    if (!contexte.packEnCours) { $("#erreur-config").textContent = "Choisis un paquet, M ou B."; return; }
    const id = `l${Date.now()}${Math.floor(Math.random() * 1000)}`;
    contexte.joueursLocaux.push({ id, nom, pack: contexte.packEnCours });
    champ.value = "";
    $$(".btn-pack").forEach((b) => b.classList.remove("actif"));
    contexte.packEnCours = null;
    redessinerListeJoueurs();

    if (contexte.role === "hote" && contexte.joueursLocaux.length === 1) {
      // L'hôte vient de s'ajouter : on ouvre le salon en ligne
      ouvrirSalonReseau();
    }
  }

  function redessinerListeJoueurs() {
    const zone = $("#liste-joueurs");
    zone.innerHTML = "";
    contexte.joueursLocaux.forEach((j, i) => {
      const ligne = document.createElement("div");
      ligne.className = "ligne-joueur";
      const retirable = !(contexte.role === "hote" && j.distant);
      ligne.innerHTML = `
        <span>${j.nom}</span>
        <span class="pack-tag ${j.pack}">${j.pack}</span>
        ${retirable ? `<button class="btn-retirer" data-retirer="${i}">✕</button>` : `<span class="texte-aide">en ligne</span>`}
      `;
      zone.appendChild(ligne);
    });
    zone.querySelectorAll("[data-retirer]").forEach((b) => {
      b.addEventListener("click", () => {
        contexte.joueursLocaux.splice(parseInt(b.dataset.retirer, 10), 1);
        redessinerListeJoueurs();
      });
    });
    if (contexte.role === "hote" && contexte.joueursLocaux.length >= 1) {
      $("#ajout-joueur-local").style.display = "none";
    }
  }

  function demarrerPartie() {
    $("#erreur-config").textContent = "";
    if (contexte.joueursLocaux.length < 2) {
      $("#erreur-config").textContent = "Il faut au moins 2 joueurs pour commencer.";
      return;
    }
    if (contexte.niveauxChoisis.length === 0) {
      $("#erreur-config").textContent = "Choisis au moins un niveau de cartes.";
      return;
    }
    const config = {
      niveauxActifs: contexte.niveauxChoisis,
      vetosParJoueur: contexte.vetosParJoueur,
      nbToursTotal: contexte.nbManches,
    };
    gameState = Engine.creerPartie(contexte.joueursLocaux, config);

    if (contexte.role === "local") {
      contexte.moiId = null;
      demarrerMancheEtTransferer();
    } else if (contexte.role === "hote") {
      contexte.moiId = contexte.joueursLocaux[0].id;
      Engine.demarrerManche(gameState);
      if (refSalon) refSalon.child("demarree").set(true);
      diffuser();
      afficherEcran("ecran-jeu");
      actualiserEcranJeu();
    }
  }

  // ------------------------------------------------------------
  // Salon en ligne — hôte
  // ------------------------------------------------------------
  function genererCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    let code = "";
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    return code;
  }

  function ouvrirSalonReseau() {
    if (!db) {
      $("#statut-salon").textContent = "Connexion en ligne indisponible (configuration manquante).";
      return;
    }
    codeSalon = genererCode();
    monJoueurId = contexte.joueursLocaux[0].id;
    $("#affichage-code").textContent = codeSalon;
    $("#statut-salon").textContent = "Ouverture du salon…";

    refSalon = db.ref("salons/" + codeSalon);
    refSalon
      .set({ cree: firebase.database.ServerValue.TIMESTAMP, lobby: { joueurs: [] }, demarree: false })
      .then(() => {
        $("#statut-salon").textContent = "✅ Salon prêt — donne ce code aux autres joueurs.";
        $("#erreur-config").textContent = "";
      })
      .catch((e) => {
        console.error("Erreur Firebase (création du salon)", e);
        $("#statut-salon").textContent = "Impossible de créer le salon (vérifie ta connexion internet).";
      });

    // Un invité écrit sa propre inscription ; on l'ajoute au lobby local
    // dès qu'elle apparaît (une reconnexion réécrit la même entrée, donc
    // pas de doublon possible).
    ecouter(refSalon.child("inscriptions"), "value", (snap) => {
      if (gameState) return; // partie déjà lancée : plus de nouvelles entrées
      const inscriptions = snap.val() || {};
      let changement = false;
      Object.keys(inscriptions).forEach((joueurId) => {
        if (contexte.joueursLocaux.some((j) => j.id === joueurId)) return;
        const info = inscriptions[joueurId] || {};
        contexte.joueursLocaux.push({
          id: joueurId,
          nom: String(info.nom || "Invité").slice(0, 20),
          pack: info.pack === "B" ? "B" : "M",
          distant: true,
        });
        changement = true;
      });
      if (changement) {
        redessinerListeJoueurs();
        diffuserLobby();
      }
    });

    // Actions envoyées par les invités pendant la partie.
    ecouter(refSalon.child("actions"), "child_added", (snap) => {
      const msg = snap.val();
      snap.ref.remove().catch(() => {});
      if (!msg || !gameState) return;
      try {
        appliquerAction(msg.type, msg.payload || {}, msg.joueurId);
        diffuser();
        apresMiseAJourEtat();
      } catch (e) {
        console.error("Action invalide reçue de " + msg.joueurId, e);
      }
    });
  }

  function diffuserLobby() {
    if (!refSalon) return;
    const liste = contexte.joueursLocaux.map((j) => ({ nom: j.nom, pack: j.pack }));
    refSalon.child("lobby").set({ joueurs: liste }).catch((e) => console.error("Échec d'envoi du lobby", e));
  }

  function diffuser() {
    if (!refSalon) return;
    // gameState contient un champ "rng" (une fonction, pour le tirage
    // aléatoire des cartes) que Firebase refuse de stocker — contrairement
    // à l'ancien transport PeerJS, il ne l'ignore pas silencieusement, il
    // lève une erreur. Un aller-retour JSON élimine proprement toute
    // fonction (et toute valeur "undefined") avant l'envoi.
    let etatSerialisable;
    try {
      etatSerialisable = JSON.parse(JSON.stringify(gameState));
    } catch (e) {
      console.error("État de partie non sérialisable", e);
      return;
    }
    refSalon.child("etat").set(etatSerialisable).catch((e) => console.error("Échec d'envoi de l'état", e));
  }

  // ------------------------------------------------------------
  // Salon en ligne — invité
  // ------------------------------------------------------------
  function rejoindreSalon() {
    const code = $("#champ-code-salon").value.trim().toUpperCase();
    const nom = $("#champ-prenom-invite").value.trim();
    $("#erreur-rejoindre").textContent = "";
    if (code.length !== 4) { $("#erreur-rejoindre").textContent = "Le code fait 4 lettres."; return; }
    if (!nom) { $("#erreur-rejoindre").textContent = "Donne ton prénom."; return; }
    if (!contexte.packEnCours) { $("#erreur-rejoindre").textContent = "Choisis un paquet, M ou B."; return; }
    if (!db) { $("#erreur-rejoindre").textContent = "Connexion en ligne indisponible (configuration manquante)."; return; }

    contexte.role = "invite";
    codeSalonRejoint = code;
    nomInvite = nom;
    const packInvite = contexte.packEnCours;
    if (!monJoueurId) monJoueurId = genererIdJoueur();
    contexte.moiId = monJoueurId;
    $("#erreur-rejoindre").textContent = "Connexion au salon…";

    const cible = db.ref("salons/" + code);
    cible
      .get()
      .then((snap) => {
        if (!snap.exists()) {
          $("#erreur-rejoindre").textContent = "Salon introuvable. Vérifie le code.";
          return;
        }
        refSalon = cible;
        return refSalon.child("inscriptions/" + monJoueurId).set({ nom: nomInvite, pack: packInvite });
      })
      .then(() => {
        if (!refSalon) return; // le salon n'existait pas, déjà signalé plus haut
        afficherEcran("ecran-attente");
        $("#statut-connexion").textContent = "Connecté ! En attente du lancement par l'hôte…";
        ecouterSalonInvite();
      })
      .catch((e) => {
        console.error("Erreur Firebase (rejoindre le salon)", e);
        $("#erreur-rejoindre").textContent = "Connexion en ligne indisponible. Vérifie ta connexion internet.";
      });
  }

  function ecouterSalonInvite() {
    ecouter(refSalon.child("lobby"), "value", (snap) => {
      if (gameState) return; // la partie est lancée, le lobby ne sert plus
      const val = snap.val();
      if (!val) return;
      const zone = $("#liste-joueurs-attente");
      zone.innerHTML = "";
      (val.joueurs || []).forEach((j) => {
        const ligne = document.createElement("div");
        ligne.className = "ligne-joueur";
        ligne.innerHTML = `<span>${j.nom}</span><span class="pack-tag ${j.pack}">${j.pack}</span>`;
        zone.appendChild(ligne);
      });
    });

    ecouter(refSalon.child("etat"), "value", (snap) => {
      const val = snap.val();
      if (!val) return;
      gameState = val;
      if (gameState.terminee) {
        const ecranActif = document.querySelector(".ecran.actif");
        if (ecranActif && ecranActif.id === "ecran-fin") {
          apresMiseAJourEtat();
        } else {
          afficherFin();
        }
      } else {
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      }
    });
  }

  function envoyerActionInvite(type, payload) {
    if (!refSalon) return;
    refSalon
      .child("actions")
      .push({ type, payload: payload || {}, joueurId: monJoueurId, ts: firebase.database.ServerValue.TIMESTAMP })
      .catch((e) => console.error("Échec d'envoi de l'action", e));
  }

  // Bouton « Réessayer » de la salle d'attente : Firebase se
  // resynchronise déjà tout seul (les écouteurs .on("value") reçoivent
  // automatiquement la dernière valeur dès que la connexion revient),
  // donc ce bouton sert surtout de filet de sécurité visuel.
  function forcerRafraichissementInvite() {
    if (!refSalon) return;
    $("#statut-connexion").textContent = "Vérification…";
    refSalon
      .child("etat")
      .get()
      .then((snap) => {
        const val = snap.val();
        if (val) {
          gameState = val;
          if (gameState.terminee) afficherFin();
          else { afficherEcran("ecran-jeu"); actualiserEcranJeu(); }
        } else {
          $("#statut-connexion").textContent = "En attente du lancement par l'hôte…";
        }
      })
      .catch(() => {
        $("#statut-connexion").textContent = "Toujours hors-ligne. Vérifie ta connexion internet.";
      });
  }

  // ------------------------------------------------------------
  // Application des actions sur le moteur (local & hôte)
  // ------------------------------------------------------------
  function appliquerAction(type, payload, actorId) {
    switch (type) {
      case "texte-libre":
        Engine.soumettreTexteLibre(gameState, actorId, payload.texte);
        break;
      case "veto":
        Engine.utiliserVeto(gameState, actorId);
        break;
      case "valider-defi":
        Engine.validerDefi(gameState, payload.defiId, !!payload.reussi);
        break;
      case "reaction":
        Engine.choisirReaction(gameState, actorId, payload.reactionId);
        if (gameState.manche.avecQui) gameState.manche.avecQuiEnAttente = (payload.avecQuiTexte || "").trim();
        break;
      case "joker":
        Engine.utiliserJoker(gameState, actorId, payload.texte);
        break;
      case "joker-vote":
        Engine.voterJoker(gameState, actorId, !!payload.approuve);
        {
          const attendus = gameState.joueurs.filter((j) => j.id !== gameState.manche.cibleId).map((j) => j.id);
          const tousVote = attendus.every((id) => gameState.manche.joker.votes[id] !== undefined);
          if (tousVote) Engine.resoudreJoker(gameState);
        }
        break;
      case "parier":
        Engine.parier(gameState, actorId, payload.reactionId);
        if (Engine.pariComplet(gameState)) {
          Engine.resoudreManche(gameState, gameState.manche.avecQuiEnAttente);
        }
        break;
      case "manche-suivante":
        Engine.demarrerManche(gameState);
        break;
      default:
        throw new Error("Action inconnue : " + type);
    }
  }

  function envoyerAction(type, payload) {
    if (contexte.role === "invite") {
      envoyerActionInvite(type, payload);
      return;
    }
    appliquerAction(type, payload, contexte.moiId);
    if (contexte.role === "hote") diffuser();
    if (contexte.role === "local") {
      local_avancer();
    } else {
      actualiserEcranJeu();
    }
  }

  // Validation d'un défi (fait / pas fait) : accessible à tout moment,
  // par n'importe quel joueur présent — ça ne fait pas partie du tour
  // secret en cours, donc ça ne passe jamais par les écrans de transfert.
  function validerDefiUI(defiId, reussi) {
    if (contexte.role === "invite") {
      envoyerActionInvite("valider-defi", { defiId, reussi });
      return;
    }
    Engine.validerDefi(gameState, defiId, reussi);
    if (contexte.role === "hote") diffuser();
    apresMiseAJourEtat();
  }

  // Rafraîchit ce qui doit l'être après un changement d'état qui n'est
  // pas forcément lié au tour en cours (ex : validation d'un défi).
  function apresMiseAJourEtat() {
    actualiserBarreDefis();
    if ($("#modale-defis").classList.contains("ouverte")) remplirModaleDefis();
    const ecran = document.querySelector(".ecran.actif");
    const id = ecran ? ecran.id : null;
    if (id === "ecran-jeu") {
      actualiserEcranJeu();
    } else if (id === "ecran-fin") {
      rendrePodium();
      rendreConsequences();
      rendreDefisAttenteFin();
    }
  }

  // ------------------------------------------------------------
  // Orchestration du mode local (pass-and-play)
  // ------------------------------------------------------------
  function demarrerMancheEtTransferer() {
    const m = Engine.demarrerManche(gameState);
    if (!m) { afficherFin(); return; }
    contexte.moiId = null;
    local_avancer();
  }

  function joueursRestants(idsDejaFaits, exclureId) {
    return gameState.joueurs
      .filter((j) => j.id !== exclureId)
      .map((j) => j.id)
      .filter((id) => !idsDejaFaits.includes(id));
  }

  function local_avancer() {
    const m = gameState.manche;
    if (!m) { demarrerMancheEtTransferer(); return; }

    if (m.phase === "texte_libre") {
      if (contexte.moiId !== m.cibleId) {
        montrerTransfert(m.cibleId, "À toi d'inventer la situation, sans filtre 🤫", () => {
          contexte.moiId = m.cibleId;
          afficherEcran("ecran-jeu");
          actualiserEcranJeu();
        });
      } else {
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      }
      return;
    }

    if (m.phase === "reaction_cible") {
      if (contexte.moiId !== m.cibleId) {
        montrerTransfert(m.cibleId, "C'est à ton tour de répondre 🤫", () => {
          contexte.moiId = m.cibleId;
          afficherEcran("ecran-jeu");
          actualiserEcranJeu();
        });
      } else {
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      }
      return;
    }

    if (m.phase === "joker_vote") {
      const restants = joueursRestants(Object.keys(m.joker.votes), m.cibleId);
      avancerFileLocale(restants, "Vote sur son Joker 🃏");
      return;
    }

    if (m.phase === "paris") {
      const restants = joueursRestants(Object.keys(m.paris), m.cibleId);
      avancerFileLocale(restants, "À toi de parier 🎲");
      return;
    }

    if (m.phase === "terminee") {
      montrerTransfert(null, "Tout le monde est là ? On révèle !", () => {
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      }, "Révéler le résultat");
      return;
    }
  }

  function avancerFileLocale(restants, consigne) {
    if (restants.length === 0) { afficherEcran("ecran-jeu"); actualiserEcranJeu(); return; }
    const suivant = restants[0];
    if (contexte.moiId !== suivant) {
      montrerTransfert(suivant, consigne, () => {
        contexte.moiId = suivant;
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      });
    } else {
      afficherEcran("ecran-jeu");
      actualiserEcranJeu();
    }
  }

  function montrerTransfert(joueurId, consigne, onReady, libelleBouton) {
    $("#transfert-nom").textContent = joueurId ? nomJoueur(joueurId) : "tout le monde 👀";
    $("#transfert-consigne").textContent = consigne || "Les autres détournent le regard 👀";
    $("[data-action='transfert-pret']").textContent = libelleBouton || "C'est fait, j'ai le téléphone";
    apresTransfert = onReady;
    afficherEcran("ecran-transfert");
  }

  // ------------------------------------------------------------
  // Rendu de l'écran de jeu (commun local / hôte / invité)
  // ------------------------------------------------------------
  function actualiserEcranJeu() {
    if (!gameState) return;
    const m = gameState.manche;
    if (!m && gameState.terminee) { afficherFin(); return; }
    if (!m) return;

    $("#compteur-manche").textContent = `Manche ${m.numero}`;
    const badge = $("#badge-niveau");
    badge.textContent = NIVEAUX.find((n) => n.id === m.niveau).nom;
    badge.style.background = couleurNiveau(m.niveau);

    actualiserBarreDefis();

    // Tableau des scores
    const tableau = $("#tableau-scores");
    tableau.innerHTML = "";
    gameState.joueurs.forEach((j) => {
      const chip = document.createElement("div");
      chip.className = "score-chip" + (j.id === m.cibleId ? " est-cible" : "");
      chip.innerHTML = `<span class="nom">${j.nom}${j.id === m.cibleId ? " 🎯" : ""}</span><span class="pts">${j.score}</span>`;
      tableau.appendChild(chip);
    });

    // Carte
    const zoneCarte = $("#zone-carte");
    const cible = gameState.joueurs.find((j) => j.id === m.cibleId);
    const enAttenteTexteLibre = m.libre && m.phase === "texte_libre";
    const texteAffiche = enAttenteTexteLibre
      ? "🃏 Carte libre — la Cible invente sa situation…"
      : m.carteTexte.replace("{cible}", "…");
    zoneCarte.innerHTML = `
      <span class="etiquette-cible">🎯 Cible : ${cible.nom}${m.defi ? " · Défi" : ""}</span>
      <p class="texte-situation">${texteAffiche}</p>
      ${m.avecQui && !enAttenteTexteLibre ? `<span class="avec-qui">La Cible précisera avec qui, si BOOM il y a.</span>` : ""}
    `;

    const zoneAction = $("#zone-action");
    zoneAction.innerHTML = "";

    const jeSuisCible = contexte.moiId === m.cibleId;

    if (m.phase === "texte_libre") {
      if (jeSuisCible) {
        rendreTexteLibre(zoneAction, m);
      } else {
        zoneAction.innerHTML = `<div class="zone-attente-cible">✍️ ${cible.nom} invente la situation, sans filtre…</div>`;
      }
      return;
    }

    if (m.phase === "reaction_cible") {
      if (jeSuisCible) {
        rendreChoixReaction(zoneAction, m.pack, m);
      } else {
        zoneAction.innerHTML = `<div class="zone-attente-cible">🤫 ${cible.nom} choisit sa réaction en secret…</div>`;
      }
      return;
    }

    if (m.phase === "joker_vote") {
      if (jeSuisCible) {
        zoneAction.innerHTML = `<div class="zone-attente-cible">🃏 « ${m.joker.texte} »<br>Le groupe vote sur ta réponse…</div>`;
      } else if (m.joker.votes[contexte.moiId] !== undefined) {
        zoneAction.innerHTML = `<div class="zone-attente-cible">Vote enregistré. En attente des autres…</div>`;
      } else {
        zoneAction.innerHTML = `
          <div class="resultat-calme"><strong>${cible.nom} joue son Joker :</strong><br>« ${m.joker.texte} »</div>
          <div class="actions-secondaires">
            <button class="btn btn-secondaire" data-vote="oui">👍 J'approuve</button>
            <button class="btn btn-secondaire" data-vote="non">👎 Pas convaincu</button>
          </div>`;
        zoneAction.querySelectorAll("[data-vote]").forEach((b) => {
          b.addEventListener("click", () => envoyerAction("joker-vote", { approuve: b.dataset.vote === "oui" }));
        });
      }
      return;
    }

    if (m.phase === "paris") {
      if (jeSuisCible) {
        zoneAction.innerHTML = `<div class="zone-attente-cible">🎲 Les autres parient sur ta réaction…</div>`;
      } else if (m.paris[contexte.moiId] !== undefined) {
        zoneAction.innerHTML = `<div class="zone-attente-cible">Pari enregistré. En attente des autres…</div>`;
      } else {
        rendreChoixPari(zoneAction, m.pack);
      }
      return;
    }

    if (m.phase === "terminee") {
      rendreResultat(zoneAction, m, cible);
    }
  }

  function rendreTexteLibre(zone, m) {
    const cible = gameState.joueurs.find((j) => j.id === m.cibleId);
    zone.innerHTML = `
      <p class="texte-aide">Carte libre : invente ta situation, sans aucun filtre.</p>
      <textarea id="champ-texte-libre" class="champ" rows="3" maxlength="220" placeholder="Écris ta situation ou ton action…"></textarea>
      <button class="btn btn-principal" id="btn-valider-texte-libre">Valider ma situation</button>
      <p id="erreur-texte-libre" class="texte-erreur"></p>
      <div class="actions-secondaires">
        <button class="btn-veto" data-action-locale="veto" ${cible.vetosRestants <= 0 ? "disabled" : ""}>
          🙅 Véto (${cible.vetosRestants})
        </button>
      </div>
    `;
    zone.querySelector("#btn-valider-texte-libre").addEventListener("click", () => {
      const texte = zone.querySelector("#champ-texte-libre").value.trim();
      if (!texte) {
        zone.querySelector("#erreur-texte-libre").textContent = "Écris quelque chose avant de valider.";
        return;
      }
      envoyerAction("texte-libre", { texte });
    });
    zone.querySelector("[data-action-locale='veto']").addEventListener("click", () => envoyerAction("veto", {}));
  }

  function rendreChoixReaction(zone, pack, m) {
    const reactions = Engine.reactionsDuPack(pack);
    const div = document.createElement("div");
    div.innerHTML = `
      <p class="texte-aide">Choisis ta réaction en secret (lettre ${pack}) :</p>
      <div class="grille-reactions"></div>
      ${m.avecQui ? `<input id="champ-avec-qui" class="champ" placeholder="Avec qui ? (annoncé seulement si BOOM)" maxlength="30" />` : ""}
      <div class="actions-secondaires">
        <button class="btn-veto" data-action-locale="veto" ${estCibleActuelle() && gameState.joueurs.find(j=>j.id===m.cibleId).vetosRestants <= 0 ? "disabled" : ""}>
          🙅 Véto (${gameState.joueurs.find((j) => j.id === m.cibleId).vetosRestants})
        </button>
        <button class="btn-joker" data-action-locale="joker" ${!gameState.joueurs.find((j) => j.id === m.cibleId).jokerDisponible ? "disabled" : ""}>🃏 Joker</button>
      </div>
    `;
    zone.appendChild(div);
    const grille = div.querySelector(".grille-reactions");
    reactions.forEach((r) => {
      const b = document.createElement("button");
      b.className = "btn-reaction";
      b.textContent = r.texte;
      b.addEventListener("click", () => {
        const avecQuiTexte = m.avecQui ? ($("#champ-avec-qui") ? $("#champ-avec-qui").value : "") : "";
        envoyerAction("reaction", { reactionId: r.id, avecQuiTexte });
      });
      grille.appendChild(b);
    });
    div.querySelector("[data-action-locale='veto']").addEventListener("click", () => envoyerAction("veto", {}));
    div.querySelector("[data-action-locale='joker']").addEventListener("click", () => rendreSaisieJoker(zone));
  }

  function estCibleActuelle() {
    return gameState.manche && contexte.moiId === gameState.manche.cibleId;
  }

  function rendreSaisieJoker(zone) {
    zone.innerHTML = `
      <p class="texte-aide">La réponse la plus incroyable pour toi, en commençant par « Je » ou « J' » :</p>
      <input id="champ-joker" class="champ" placeholder="Je veux… / J'ai…" maxlength="120" />
      <button class="btn btn-principal" id="btn-confirmer-joker">Valider mon Joker</button>
      <p id="erreur-joker" class="texte-erreur"></p>
    `;
    zone.querySelector("#btn-confirmer-joker").addEventListener("click", () => {
      const texte = zone.querySelector("#champ-joker").value.trim();
      if (!/^(je|j['’])/i.test(texte)) {
        zone.querySelector("#erreur-joker").textContent = "Ça doit commencer par « Je » ou « J' ».";
        return;
      }
      envoyerAction("joker", { texte });
    });
  }

  function rendreChoixPari(zone, packCible) {
    const reactions = Engine.reactionsDuPack(packCible);
    zone.innerHTML = `<p class="texte-aide">Quelle réaction va-t-elle/il choisir ?</p><div class="grille-reactions"></div>`;
    const grille = zone.querySelector(".grille-reactions");
    reactions.forEach((r) => {
      const b = document.createElement("button");
      b.className = "btn-reaction";
      b.textContent = r.texte;
      b.addEventListener("click", () => envoyerAction("parier", { reactionId: r.id }));
      grille.appendChild(b);
    });
  }

  function rendreResultat(zone, m, cible) {
    const res = m.resultat;
    let html = "";
    if (res.type === "veto") {
      html = `<div class="resultat-calme"><h4>Manche passée 🙈</h4><p>${cible.nom} a utilisé une carte Véto.</p></div>`;
    } else if (res.type === "joker") {
      html = res.approuve
        ? `<div class="resultat-boom"><p class="titre-boom">Joker validé ! +3 🎉</p><p>« ${res.texte} »</p></div>`
        : `<div class="resultat-calme"><h4>Joker non retenu</h4><p>« ${res.texte} »</p></div>`;
    } else if (res.type === "manche") {
      const reaction = Engine.reactionsDuPack(m.pack).find((r) => r.id === res.reactionChoisie);
      if (res.boom) {
        html = `
          <div class="resultat-boom">
            <p class="titre-boom">BOOM 💥</p>
            <p>${cible.nom} répond : <strong>${reaction.texte}</strong></p>
            <p>Personne n'avait deviné — +2 pour ${cible.nom} !</p>
            ${m.avecQui ? `<p><em>Avec qui : ${res.avecQuiReponse || "(non précisé)"}</em></p>` : ""}
          </div>`;
      } else {
        const noms = res.gagnantsPari.map((id) => nomJoueur(id)).join(", ");
        html = `
          <div class="resultat-calme">
            <h4>${cible.nom} répond : ${reaction.texte}</h4>
            <p>Bien deviné par : ${noms} (+1 chacun)</p>
            ${m.avecQui ? `<p><em>Avec qui : ${res.avecQuiReponse || "(non précisé)"}</em></p>` : ""}
          </div>`;
      }
    }

    const encoreEnAttente = res.defiId && gameState.defisEnAttente.some((d) => d.id === res.defiId);
    if (encoreEnAttente) {
      html += `
        <div class="resultat-calme">
          <h4>🎯 Défi à valider</h4>
          <p>${cible.nom} devait : « ${m.carteTexte} »</p>
          <div class="actions-secondaires">
            <button class="btn btn-secondaire" data-defi-valider="1">✅ C'est fait (+2)</button>
            <button class="btn btn-secondaire" data-defi-valider="0">❌ Pas fait</button>
          </div>
          <p class="texte-aide">Tu peux aussi le valider plus tard depuis « Défis en attente ».</p>
        </div>`;
    }

    const peutContinuer = contexte.role !== "invite";
    zone.innerHTML = html + (peutContinuer
      ? `<button class="btn btn-principal" id="btn-manche-suivante">Manche suivante ➡️</button>`
      : `<div class="zone-attente-cible">En attente de l'hôte pour la suite…</div>`);

    if (encoreEnAttente) {
      zone.querySelectorAll("[data-defi-valider]").forEach((b) => {
        b.addEventListener("click", () => {
          validerDefiUI(res.defiId, b.dataset.defiValider === "1");
          rendreResultat(zone, m, cible);
        });
      });
    }

    if (peutContinuer) {
      zone.querySelector("#btn-manche-suivante").addEventListener("click", () => {
        if (contexte.role === "local") {
          demarrerMancheEtTransferer();
        } else {
          const m2 = Engine.demarrerManche(gameState);
          diffuser();
          if (!m2) { afficherFin(); return; }
          actualiserEcranJeu();
        }
      });
    }
  }

  // ------------------------------------------------------------
  // Défis en attente (validation manuelle, à tout moment)
  // ------------------------------------------------------------
  function actualiserBarreDefis() {
    const barre = $("#barre-defis");
    if (!barre || !gameState) return;
    const n = gameState.defisEnAttente.length;
    barre.style.display = n > 0 ? "block" : "none";
    $("#nb-defis-attente").textContent = n;
  }

  function remplirModaleDefis() {
    const zone = $("#liste-defis-attente");
    if (!gameState || gameState.defisEnAttente.length === 0) {
      zone.innerHTML = `<p class="texte-aide">Aucun défi en attente pour le moment.</p>`;
      return;
    }
    zone.innerHTML = "";
    gameState.defisEnAttente.forEach((d) => {
      const ligne = document.createElement("div");
      ligne.className = "ligne-defi";
      ligne.innerHTML = `
        <p><span class="nom-cible">${d.cibleNom}</span> — « ${d.texte} »</p>
        <div class="actions-secondaires">
          <button class="btn btn-secondaire" data-defi="${d.id}" data-reussi="1">✅ Fait (+2)</button>
          <button class="btn btn-secondaire" data-defi="${d.id}" data-reussi="0">❌ Pas fait</button>
        </div>
      `;
      zone.appendChild(ligne);
    });
    zone.querySelectorAll("[data-defi]").forEach((b) => {
      b.addEventListener("click", () => validerDefiUI(b.dataset.defi, b.dataset.reussi === "1"));
    });
  }

  function rendreDefisAttenteFin() {
    const zone = $("#defis-attente-fin");
    if (!zone || !gameState) return;
    if (gameState.defisEnAttente.length === 0) { zone.innerHTML = ""; return; }
    let html = `<div class="bloc"><h3>Défis encore en attente</h3>`;
    gameState.defisEnAttente.forEach((d) => {
      html += `
        <div class="ligne-defi">
          <p><span class="nom-cible">${d.cibleNom}</span> — « ${d.texte} »</p>
          <div class="actions-secondaires">
            <button class="btn btn-secondaire" data-defi-fin="${d.id}" data-reussi="1">✅ Fait (+2)</button>
            <button class="btn btn-secondaire" data-defi-fin="${d.id}" data-reussi="0">❌ Pas fait</button>
          </div>
        </div>`;
    });
    html += `</div>`;
    zone.innerHTML = html;
    zone.querySelectorAll("[data-defi-fin]").forEach((b) => {
      b.addEventListener("click", () => validerDefiUI(b.dataset.defiFin, b.dataset.reussi === "1"));
    });
  }

  // ------------------------------------------------------------
  // Fin de partie
  // ------------------------------------------------------------
  let finActuelle = null; // récompense/gage tirés une seule fois, le classement se rafraîchit ensuite

  function rendrePodium() {
    const classe = Engine.classement(gameState);
    const podium = $("#podium");
    podium.innerHTML = "";
    classe.forEach((j) => {
      const ligne = document.createElement("div");
      ligne.className = "ligne-podium" + (j.rang === 1 ? " premier" : "");
      ligne.innerHTML = `<span>#${j.rang} ${j.nom}${j.rang === 1 ? " 👑" : ""}</span><span>${j.score} pts</span>`;
      podium.appendChild(ligne);
    });
  }

  function rendreConsequences() {
    const classe = Engine.classement(gameState);
    const meilleur = classe[0].score;
    const pire = classe[classe.length - 1].score;
    const gagnants = classe.filter((j) => j.score === meilleur);
    const perdants = classe.filter((j) => j.score === pire);
    $("#carte-consequence").innerHTML = `
      <h4>👑 ${gagnants.map((g) => g.nom).join(", ")}</h4>
      <p>${finActuelle.recompenseSuggeree}</p>
      <h4>🙈 ${perdants.map((p) => p.nom).join(", ")}</h4>
      <p>${finActuelle.gageSuggere}</p>
    `;
  }

  function afficherFin() {
    finActuelle = Engine.terminerPartie(gameState, "piquant");
    afficherEcran("ecran-fin");
    rendrePodium();
    rendreConsequences();
    rendreDefisAttenteFin();
  }
})();
