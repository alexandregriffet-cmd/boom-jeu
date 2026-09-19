/* ============================================================
   BooM 💥 — Application (interface + orchestration)
   Fonctionne en trois modes :
     - local  : un seul téléphone passé de main en main
     - hote   : salon en ligne, cet appareil héberge la partie
     - invite : salon en ligne, cet appareil a rejoint via un code
   ============================================================ */

(function () {
  "use strict";

  const { NIVEAUX, NIVEAUX_GAGES } = window.BoomCartes || require("./cartes.js");
  const Engine = window.BoomEngine;

  // ------------------------------------------------------------
  // État de l'application
  // ------------------------------------------------------------
  const contexte = {
    role: null,          // 'local' | 'hote' | 'invite'
    moiId: null,          // id du joueur qui tient l'appareil / mon id réseau
    niveauxChoisis: NIVEAUX.map((n) => n.id),
    vetosParJoueur: 2,
    nbManches: 15,
    joueursLocaux: [],    // construction de la liste avant démarrage (local & hôte)
    packEnCours: null,    // pack sélectionné dans le formulaire d'ajout
  };

  let gameState = null;   // état du moteur (autorité locale ou hôte)
  let peer = null;
  let hostConns = {};      // hôte : joueurId -> DataConnection
  let clientConn = null;   // invité : DataConnection vers l'hôte
  let codeSalon = null;
  let codeSalonRejoint = null; // invité : code du salon, gardé pour une reconnexion
  let nomInvite = null;        // invité : prénom saisi, gardé pour une reconnexion
  let dernierMessageRecu = 0;  // invité : horodatage du dernier message reçu de l'hôte

  let apresTransfert = null; // callback en attente sur l'écran de transfert

  // Serveurs STUN + TURN pour la connexion directe entre deux téléphones.
  // Le STUN seul suffit quand les deux joueurs sont sur le même réseau ;
  // dès qu'ils sont sur des réseaux différents (4G, box différentes...),
  // un relais TURN est souvent indispensable pour que la connexion passe.
  // Identifiants TURN dédiés (compte gratuit Metered — 50 Go/mois).
  const TURN_USER = "2a539e1e1a1eca6d09ce057b";
  const TURN_PASS = "GsFQ91A8uWjvZGje";
  const CONFIG_ICE = {
    iceServers: [
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username: TURN_USER, credential: TURN_PASS },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: TURN_USER, credential: TURN_PASS },
      { urls: "turn:global.relay.metered.ca:443", username: TURN_USER, credential: TURN_PASS },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: TURN_USER, credential: TURN_PASS },
    ],
  };

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
      "mode-invite": () => afficherEcran("ecran-rejoindre"),
      "retour-accueil": () => { reinitialiser(); afficherEcran("ecran-accueil"); },
      "voir-regles": () => $("#modale-regles").classList.add("ouverte"),
      "fermer-regles": () => $("#modale-regles").classList.remove("ouverte"),
      "rejoindre-salon": rejoindreSalon,
      "ajouter-joueur": ajouterJoueurLocal,
      "demarrer-partie": demarrerPartie,
      "transfert-pret": () => { if (apresTransfert) { const cb = apresTransfert; apresTransfert = null; cb(); } },
      "ouvrir-defis": () => { remplirModaleDefis(); $("#modale-defis").classList.add("ouverte"); },
      "fermer-defis": () => $("#modale-defis").classList.remove("ouverte"),
      "resync-invite": demanderResync,
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

  function reinitialiser() {
    contexte.role = null;
    contexte.moiId = null;
    contexte.joueursLocaux = [];
    gameState = null;
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    hostConns = {};
    clientConn = null;
    codeSalon = null;
    codeSalonRejoint = null;
    nomInvite = null;
    arreterBattementCoeur();
    arreterVeilleInvite();
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

    if (role === "hote") {
      initialiserHote();
    }

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
      // L'hôte vient de s'ajouter : on ouvre le salon réseau
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
      diffuser({ t: "debut", state: gameState });
      Engine.demarrerManche(gameState);
      diffuser({ t: "etat", state: gameState });
      afficherEcran("ecran-jeu");
      actualiserEcranJeu();
      demarrerBattementCoeur();
    }
  }

  // ------------------------------------------------------------
  // Battement de cœur hôte : rediffuse l'état régulièrement pour
  // rattraper un message perdu en route (réseau instable / TURN).
  // ------------------------------------------------------------
  let battementCoeurId = null;
  function demarrerBattementCoeur() {
    if (battementCoeurId) return;
    battementCoeurId = setInterval(() => {
      if (contexte.role !== "hote") { arreterBattementCoeur(); return; }
      if (gameState) {
        diffuser({ t: "etat", state: gameState });
      } else {
        diffuserLobby();
      }
    }, 4000);
  }
  function arreterBattementCoeur() {
    if (battementCoeurId) { clearInterval(battementCoeurId); battementCoeurId = null; }
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
    codeSalon = genererCode();
    $("#affichage-code").textContent = codeSalon;
    $("#statut-salon").textContent = "Ouverture du salon…";
    try {
      peer = new Peer(`boom-${codeSalon}`, { config: CONFIG_ICE });
    } catch (e) {
      $("#statut-salon").textContent = "Impossible de créer le salon en ligne (connexion indisponible).";
      return;
    }
    peer.on("open", () => {
      $("#statut-salon").textContent = "✅ Salon prêt — donne ce code aux autres joueurs.";
      $("#erreur-config").textContent = "";
      demarrerBattementCoeur();
    });
    peer.on("error", (err) => {
      console.error("Erreur PeerJS", err);
      if (err.type === "unavailable-id") {
        // Code déjà pris (rare) : on retente avec un nouveau code
        ouvrirSalonReseau();
      } else {
        $("#statut-salon").textContent = "Connexion en ligne instable. Réessaie si un joueur n'arrive pas à rejoindre.";
      }
    });
    peer.on("disconnected", () => {
      $("#statut-salon").textContent = "Connexion perdue avec le serveur de salon, tentative de reconnexion…";
      try { peer.reconnect(); } catch (e) {}
    });
    peer.on("connection", (conn) => {
      conn.on("open", () => {
        conn.on("data", (msg) => receptionHote(conn, msg));
        conn.on("close", () => {
          delete hostConns[conn.peer];
        });
      });
    });
  }

  function initialiserHote() {
    // rien à faire tant que l'hôte n'a pas ajouté son propre prénom
  }

  function receptionHote(conn, msg) {
    if (!msg || !msg.t) return;

    if (msg.t === "inscription") {
      const nom = String(msg.nom || "Invité").slice(0, 20);
      const pack = msg.pack === "M" || msg.pack === "B" ? msg.pack : "M";
      hostConns[conn.peer] = conn;

      if (!gameState) {
        // Partie pas encore démarrée : on ajoute au lobby
        contexte.joueursLocaux.push({ id: conn.peer, nom, pack, distant: true });
        redessinerListeJoueurs();
        conn.send({ t: "bienvenue", joueurId: conn.peer });
        diffuserLobby();
      } else {
        conn.send({ t: "erreur", message: "La partie a déjà commencé." });
      }
      return;
    }

    if (msg.t === "resync") {
      // Un client redemande l'état courant (message précédent perdu en route)
      hostConns[conn.peer] = conn;
      if (gameState) {
        conn.send({ t: "etat", state: gameState });
      } else {
        conn.send({ t: "bienvenue", joueurId: conn.peer });
        diffuserLobby();
      }
      return;
    }

    if (msg.t === "action" && gameState) {
      try {
        appliquerAction(msg.type, msg.payload || {}, conn.peer);
        diffuser({ t: "etat", state: gameState });
        apresMiseAJourEtat();
      } catch (e) {
        conn.send({ t: "erreur", message: e.message });
      }
    }
  }

  function diffuserLobby() {
    const liste = contexte.joueursLocaux.map((j) => ({ nom: j.nom, pack: j.pack }));
    Object.values(hostConns).forEach((c) => c.send({ t: "lobby", joueurs: liste }));
  }

  function diffuser(msg) {
    Object.values(hostConns).forEach((c) => {
      try { c.send(msg); } catch (e) { console.error("Échec d'envoi à", c.peer, e); }
    });
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

    contexte.role = "invite";
    codeSalonRejoint = code;
    nomInvite = nom;
    $("#erreur-rejoindre").textContent = "Connexion au salon…";
    try {
      peer = new Peer(undefined, { config: CONFIG_ICE });
    } catch (e) {
      $("#erreur-rejoindre").textContent = "Connexion en ligne indisponible.";
      return;
    }

    let rejoint = false;
    const delaiEchec = setTimeout(() => {
      if (!rejoint) {
        $("#erreur-rejoindre").textContent =
          "La connexion prend trop de temps. Vérifie le code, ou que l'hôte a bien affiché « Salon prêt ».";
      }
    }, 12000);

    peer.on("open", () => {
      ouvrirConnexionInvite(code, () => {
        rejoint = true;
        clearTimeout(delaiEchec);
      }, (err) => {
        console.error("Erreur de connexion PeerJS", err);
        $("#erreur-rejoindre").textContent = "Salon introuvable. Vérifie le code.";
      });
      clientConn.on("close", () => {
        if (!rejoint) $("#erreur-rejoindre").textContent = "Connexion coupée avant d'avoir rejoint. Réessaie.";
      });
    });
    peer.on("error", (err) => {
      console.error("Erreur PeerJS", err);
      $("#erreur-rejoindre").textContent = "Salon introuvable. Vérifie le code.";
    });
  }

  // Ouvre (ou rouvre) le canal de données vers l'hôte, en réutilisant le
  // même peer.id à chaque fois : côté hôte, cet id EST l'identifiant du
  // joueur, donc une reconnexion garde le même joueur et son score.
  function ouvrirConnexionInvite(code, surOuverture, surErreur) {
    clientConn = peer.connect(`boom-${code}`, { reliable: true });
    clientConn.on("open", () => {
      dernierMessageRecu = Date.now();
      if (contexte.moiId) {
        // Reconnexion : l'hôte connaît déjà ce joueur, on redemande l'état.
        clientConn.send({ t: "resync" });
      } else {
        clientConn.send({ t: "inscription", nom: nomInvite, pack: "M" });
      }
      demarrerVeilleInvite();
      if (surOuverture) surOuverture();
    });
    clientConn.on("data", (msg) => { dernierMessageRecu = Date.now(); receptionInvite(msg); });
    clientConn.on("error", (err) => { if (surErreur) surErreur(err); });
    clientConn.on("close", () => {
      if (contexte.moiId && gameState && !gameState.terminee) {
        $("#statut-connexion").textContent = "Connexion coupée. Appuie sur « Réessayer ».";
      }
    });
  }

  function receptionInvite(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "bienvenue") {
      contexte.moiId = msg.joueurId;
      afficherEcran("ecran-attente");
      $("#statut-connexion").textContent = "Connecté ! En attente du lancement par l'hôte…";
    } else if (msg.t === "lobby") {
      const zone = $("#liste-joueurs-attente");
      zone.innerHTML = "";
      msg.joueurs.forEach((j) => {
        const ligne = document.createElement("div");
        ligne.className = "ligne-joueur";
        ligne.innerHTML = `<span>${j.nom}</span><span class="pack-tag ${j.pack}">${j.pack}</span>`;
        zone.appendChild(ligne);
      });
    } else if (msg.t === "debut") {
      gameState = msg.state;
    } else if (msg.t === "etat") {
      gameState = msg.state;
      if (gameState.terminee) {
        apresMiseAJourEtat();
      } else {
        afficherEcran("ecran-jeu");
        actualiserEcranJeu();
      }
    } else if (msg.t === "fin") {
      gameState = msg.state || gameState;
      afficherFin();
    } else if (msg.t === "erreur") {
      $("#statut-connexion").textContent = msg.message;
    }
  }

  function envoyerActionInvite(type, payload) {
    if (clientConn) clientConn.send({ t: "action", type, payload });
  }

  // Veille invité : si plus aucun message n'arrive de l'hôte pendant un
  // moment (téléphone mis en veille, coupure réseau discrète…), on tente
  // une resynchronisation automatique, sans attendre que le joueur
  // s'aperçoive qu'il est bloqué et appuie lui-même sur « Réessayer ».
  let veilleInviteId = null;
  function demarrerVeilleInvite() {
    if (veilleInviteId) return;
    veilleInviteId = setInterval(() => {
      if (contexte.role !== "invite") { arreterVeilleInvite(); return; }
      if (Date.now() - dernierMessageRecu > 9000) {
        demanderResync();
      }
    }, 5000);
  }
  function arreterVeilleInvite() {
    if (veilleInviteId) { clearInterval(veilleInviteId); veilleInviteId = null; }
  }

  // Demande de resynchronisation manuelle ("Réessayer"). On tente d'abord
  // un simple message sur la connexion actuelle (cas d'un message isolé
  // perdu) ; si rien ne revient en quelques secondes, la connexion est
  // probablement vraiment morte (téléphone mis en veille, changement de
  // réseau…) donc on la reconstruit entièrement, en gardant le même
  // peer.id pour rester reconnu comme le même joueur côté hôte.
  let resyncEnCours = false;
  function demanderResync() {
    if (resyncEnCours) return;
    resyncEnCours = true;
    $("#statut-connexion").textContent = "Resynchronisation…";
    const avant = dernierMessageRecu;

    if (clientConn && clientConn.open) {
      try { clientConn.send({ t: "resync" }); } catch (e) {}
    }

    setTimeout(() => {
      if (dernierMessageRecu !== avant) {
        // Une réponse est arrivée entre-temps, tout est rentré dans l'ordre.
        resyncEnCours = false;
        return;
      }
      // Toujours rien : on reconstruit la connexion depuis zéro.
      $("#statut-connexion").textContent = "Reconnexion en cours…";
      try { if (clientConn) clientConn.close(); } catch (e) {}
      const relancer = () => {
        ouvrirConnexionInvite(codeSalonRejoint, () => {
          $("#statut-connexion").textContent = "Reconnecté, resynchronisation…";
        }, () => {
          $("#statut-connexion").textContent = "Toujours pas de connexion. Réessaie dans un instant.";
        });
        resyncEnCours = false;
      };
      if (peer && !peer.destroyed && !peer.disconnected) {
        relancer();
      } else if (peer && !peer.destroyed) {
        peer.once("open", relancer);
        try { peer.reconnect(); } catch (e) { resyncEnCours = false; $("#statut-connexion").textContent = "Reviens à l'accueil et rejoins à nouveau le salon."; }
      } else {
        resyncEnCours = false;
        $("#statut-connexion").textContent = "Connexion perdue. Reviens à l'accueil et rejoins à nouveau le salon.";
      }
    }, 3500);
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
    if (contexte.role === "hote") diffuser({ t: "etat", state: gameState });
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
    if (contexte.role === "hote") diffuser({ t: "etat", state: gameState });
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
          if (!m2) { diffuser({ t: "fin", state: gameState }); afficherFin(); return; }
          diffuser({ t: "etat", state: gameState });
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
