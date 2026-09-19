/* ============================================================
   BooM 💥 — Banque de situations
   4 niveaux : doux, piquant, coquin, brulant
   Le jeton {cible} est remplacé par un prénom choisi par le joueur
   quand avecQui = true (le joueur désigne quelqu'un du groupe).
   ============================================================ */

const NIVEAUX = [
  { id: "doux",    nom: "Doux 🌤️",     couleur: "#7CD1B8" },
  { id: "piquant", nom: "Piquant 🌶️",  couleur: "#F2B441" },
  { id: "coquin",  nom: "Coquin 😏",    couleur: "#F2617A" },
  { id: "brulant", nom: "Brûlant 🔥",   couleur: "#C4336B" },
  { id: "defi",    nom: "Défi 🎯",      couleur: "#4FA8E0" },
];

// niveau, texte, avecQui, defi (validation manuelle fait/pas fait), libre (texte écrit par la Cible)
function c(niveau, texte, avecQui = false, defi = false, libre = false) {
  return { niveau, texte, avecQui, defi, libre };
}

const CARTES_BRUTES = [
  // ------------------------------------------------------------
  // DOUX — quotidien, absurde, inoffensif
  // ------------------------------------------------------------
  c("doux", "Manger des huîtres au petit déjeuner"),
  c("doux", "Chanter sous la douche à pleins poumons"),
  c("doux", "Porter des chaussettes dépareillées toute une semaine par choix"),
  c("doux", "Dormir avec la lumière allumée"),
  c("doux", "Manger de la pizza à l'ananas"),
  c("doux", "Faire du camping sans tente, à la belle étoile"),
  c("doux", "Apprendre le jonglage en une semaine"),
  c("doux", "Adopter un furet"),
  c("doux", "Aller au travail en pyjama un jour"),
  c("doux", "Passer une journée entière sans réseaux sociaux"),
  c("doux", "Manger uniquement des aliments orange pendant une journée"),
  c("doux", "Te réveiller à 5h du matin pour voir le lever du soleil"),
  c("doux", "Apprendre trois mots de klingon"),
  c("doux", "Porter un chapeau ridicule toute une soirée"),
  c("doux", "Faire du vélo sous la pluie sans imperméable"),
  c("doux", "Manger un plat que tu détestais enfant"),
  c("doux", "Passer un dimanche entier sans dire un mot"),
  c("doux", "Danser seul·e dans le salon pendant dix minutes"),
  c("doux", "Te déguiser en super-héros pour aller faire les courses"),
  c("doux", "Écrire une lettre à la main à un vieil ami"),
  c("doux", "Goûter à un insecte comestible"),
  c("doux", "Apprendre à faire une roulade avant"),
  c("doux", "Partir en week-end à Cracovie sans réserver l'hôtel à l'avance"),
  c("doux", "Faire un régime sans sucre pendant une semaine"),
  c("doux", "Prendre un bain glacé de deux minutes"),
  c("doux", "Assister à un opéra sans jamais y être allé"),
  c("doux", "Manger avec des baguettes pendant une semaine entière"),
  c("doux", "Te lancer dans un puzzle de 2000 pièces ce week-end"),
  c("doux", "Faire un triathlon l'année prochaine"),
  c("doux", "Passer une soirée sans écran, juste des bougies"),
  c("doux", "Adopter un accent différent pendant une journée entière"),
  c("doux", "Te lever et courir 5 km avant le travail demain"),
  c("doux", "Cuisiner un plat d'un pays que tu ne connais pas"),
  c("doux", "Faire du stand-up devant des inconnus"),
  c("doux", "Prendre des cours de poterie"),
  c("doux", "Dormir dans une cabane dans les arbres"),
  c("doux", "Passer une journée à parler uniquement en rimes"),
  c("doux", "Manger un citron entier comme une orange"),
  c("doux", "Aller au cinéma tout seul un samedi soir"),
  c("doux", "Faire un don anonyme à quelqu'un que tu connais"),
  c("doux", "Te faire couper les cheveux très courts"),
  c("doux", "Apprendre à faire du feu sans allumettes"),
  c("doux", "Manger un plat entièrement de couleur noire (activated charcoal)"),
  c("doux", "Passer 24h sans te plaindre de rien"),
  c("doux", "Faire un marathon de films d'horreur toute une nuit"),
  c("doux", "Apprendre à lire dans les cartes de tarot"),
  c("doux", "Sauter en parachute cette année"),
  c("doux", "Suivre un cours de salsa avec {cible}", true),
  c("doux", "Partir en randonnée de nuit avec {cible}", true),
  c("doux", "Cuisiner un brunch complet pour {cible} demain matin", true),
  c("doux", "", true, false, true),
  c("doux", "", true, false, true),

  // ------------------------------------------------------------
  // PIQUANT — social, un peu gênant, drôle
  // ------------------------------------------------------------
  c("piquant", "T'exhiber torse nu (ou en soutien-gorge) dans un lieu public"),
  c("piquant", "Envoyer un message vocal chantant à ton patron"),
  c("piquant", "Appeler ton ex pour lui souhaiter bonne nuit, là, maintenant"),
  c("piquant", "Publier une photo embarrassante de toi sur tes réseaux"),
  c("piquant", "Draguer la première personne que tu croises demain, juste pour voir"),
  c("piquant", "Raconter ton pire souvenir de soirée devant tout le monde"),
  c("piquant", "Avouer la dernière fois que tu as menti à quelqu'un ici"),
  c("piquant", "Faire un strip-tease (habillé) sur une chanson imposée par le groupe"),
  c("piquant", "Montrer les cinq dernières photos de ta galerie sans filtre"),
  c("piquant", "Laisser {cible} lire tes trois derniers messages", true),
  c("piquant", "Danser un slow très lentement avec {cible} devant tout le monde", true),
  c("piquant", "Faire un compliment ultra-embarrassant à {cible} devant le groupe", true),
  c("piquant", "Envoyer un texto coquin à {cible} là, maintenant", true),
  c("piquant", "Avouer à {cible} ce que tu penses vraiment de lui/elle", true),
  c("piquant", "Faire un câlin de trente secondes à {cible}, minuté", true),
  c("piquant", "Sortir en soirée sans téléphone, complètement déconnecté"),
  c("piquant", "Embrasser {cible} sur la joue en public", true),
  c("piquant", "Te faire masser les pieds par {cible} pendant deux minutes", true),
  c("piquant", "Partager ton dernier fantasme de voyage romantique devant tout le monde"),
  c("piquant", "Faire semblant d'être en couple avec {cible} devant des inconnus toute une soirée", true),
  c("piquant", "Chanter une chanson d'amour a cappella pour {cible}", true),
  c("piquant", "Raconter ta pire expérience de rendez-vous amoureux"),
  c("piquant", "Décrire ton type physique idéal sans filtre"),
  c("piquant", "Montrer la dernière photo que tu as prise de toi devant un miroir"),
  c("piquant", "Avouer qui, dans la pièce, tu trouves le plus charismatique"),
  c("piquant", "Laisser le groupe choisir ta photo de profil pour la semaine"),
  c("piquant", "Faire semblant de te déclarer à {cible} devant tout le monde", true),
  c("piquant", "Réciter un poème d'amour improvisé pour {cible}", true),
  c("piquant", "Partager le dernier rêve un peu bizarre que tu as fait"),
  c("piquant", "Avouer la chose la plus folle que tu as faite pour séduire quelqu'un"),
  c("piquant", "Te faire chatouiller pendant trente secondes par {cible}", true),
  c("piquant", "Faire un défilé de mode improvisé avec ce que tu portes"),
  c("piquant", "Décrire ta soirée parfaite en tête à tête avec {cible}", true),
  c("piquant", "Avouer la dernière fois où tu as eu un coup de cœur soudain"),
  c("piquant", "Faire deviner au groupe ton premier baiser, année et lieu"),
  c("piquant", "Envoyer une photo (habillée) de toi à {cible} sous les yeux du groupe", true),
  c("piquant", "Te laisser maquiller ou coiffer par {cible} pendant cinq minutes", true),
  c("piquant", "Partager ton dernier message doux envoyé à quelqu'un, sans dire à qui"),
  c("piquant", "Faire un massage d'épaules d'une minute à {cible}", true),
  c("piquant", "Avouer ce que tu as pensé en arrivant ce soir en voyant {cible}", true),
  c("piquant", "", true, false, true),
  c("piquant", "", true, false, true),

  // ------------------------------------------------------------
  // COQUIN — suggestif, allusif, assumé
  // ------------------------------------------------------------
  c("coquin", "Partir en week-end romantique à Cracovie avec {cible}", true),
  c("coquin", "Passer une nuit entière à discuter au lit avec {cible}, rien d'autre", true),
  c("coquin", "Faire un massage sensuel de deux minutes à {cible}", true),
  c("coquin", "Chuchoter quelque chose de coquin à l'oreille de {cible}", true),
  c("coquin", "Partager ton fantasme le plus doux, sans donner de détails crus"),
  c("coquin", "Danser un slow très rapproché avec {cible}, front contre front", true),
  c("coquin", "Avouer la dernière fois où tu as eu un frisson en pensant à quelqu'un"),
  c("coquin", "Écrire un mot doux et coquin à {cible} et le lui glisser discrètement", true),
  c("coquin", "Faire semblant d'être en lune de miel avec {cible} pendant toute la soirée", true),
  c("coquin", "Décrire ta tenue de nuit idéale pour un rendez-vous romantique"),
  c("coquin", "Passer la nuit à Cracovie dans la même chambre que {cible}, un seul lit", true),
  c("coquin", "Avouer qui, ici, tu embrasserais sans hésiter si le jeu te le demandait"),
  c("coquin", "Faire un baiser sur la main à {cible}, à l'ancienne", true),
  c("coquin", "Partager le souvenir le plus sensuel que tu gardes d'une soirée d'été"),
  c("coquin", "Proposer un rendez-vous romantique à {cible}, sérieusement, là tout de suite", true),
  c("coquin", "Décrire la scène romantique parfaite pour une première nuit avec quelqu'un"),
  c("coquin", "Faire durer un regard intense avec {cible} pendant dix secondes, sans rire", true),
  c("coquin", "Avouer ta plus grande faiblesse quand quelqu'un te séduit"),
  c("coquin", "Faire une déclaration passionnée à {cible}, façon film romantique", true),
  c("coquin", "Décrire le dessous ou vêtement de nuit que tu préfères porter"),
  c("coquin", "Avouer le compliment le plus troublant qu'on t'ait fait"),
  c("coquin", "Faire un jeu de mains coquin avec {cible}, juste les mains, une minute", true),
  c("coquin", "Partager ta chanson qui te met dans une ambiance sensuelle"),
  c("coquin", "Avouer si tu préfères qu'on te dévore des yeux ou des mots"),
  c("coquin", "Faire semblant de rougir en confiant un secret coquin au groupe"),
  c("coquin", "Décrire le premier geste que tu ferais en tête à tête avec {cible}", true),
  c("coquin", "Avouer la dernière fois où tu as mouillé d'excitation avant même le premier geste"),
  c("coquin", "Avouer la dernière fois où tu as bandé rien qu'en y pensant"),
  c("coquin", "Raconter ton réveil le plus sensuel, sans entrer dans les détails"),
  c("coquin", "Faire une promesse coquine à {cible} pour plus tard dans la soirée", true),
  c("coquin", "Avouer quel vêtement de {cible} tu aimerais lui enlever du regard, ce soir", true),
  c("coquin", "Décrire l'ambiance parfaite (musique, lumière) pour une nuit avec quelqu'un"),
  c("coquin", "Faire semblant de proposer le mariage à {cible}, à genoux", true),
  c("coquin", "Avouer si tu préfères recevoir ou donner les compliments au lit"),
  c("coquin", "Chuchoter un compte à rebours coquin à l'oreille de {cible}", true),
  c("coquin", "Raconter le baiser le plus mémorable de ta vie, sans nommer la personne"),
  c("coquin", "Faire une caresse sur le bras de {cible}, lentement, dix secondes", true),
  c("coquin", "Avouer ton fantasme de lieu insolite pour un tête-à-tête"),
  c("coquin", "Partager le mot que tu préfères entendre chuchoté à ton oreille"),
  c("coquin", "Avouer combien de fois tu as pensé à {cible} de façon coquine cette semaine", true),
  c("coquin", "", true, false, true),
  c("coquin", "", true, false, true),

  // ------------------------------------------------------------
  // BRÛLANT — le plus assumé, toujours suggéré, jamais explicite
  // ------------------------------------------------------------
  c("brulant", "Faire une sextape avec {cible}, et dire laquelle des deux caméras filmerait le mieux", true),
  c("brulant", "Passer une nuit entière avec {cible}, portes closes, sans rien dire au groupe le lendemain", true),
  c("brulant", "Avouer le fantasme le plus fou que tu n'as jamais osé dire à voix haute"),
  c("brulant", "Décrire la dernière fois où tu as jouis rien qu'en y repensant"),
  c("brulant", "Avouer ce que tu ferais à {cible} si vous étiez seuls cette nuit", true),
  c("brulant", "Faire l'amour à {cible} cette nuit, et dire dans quelle pièce de la maison", true),
  c("brulant", "Avouer combien de fois tu as fantasmé sur quelqu'un dans cette pièce, ce soir"),
  c("brulant", "Décrire ta position préférée en un mot, sans détail"),
  c("brulant", "Avouer la dernière personne à qui tu as envoyé une photo très osée"),
  c("brulant", "Passer la nuit à Cracovie avec {cible}, et dire ce qui se passerait au retour", true),
  c("brulant", "Avouer si tu préfères dominer ou être dominé·e ce soir"),
  c("brulant", "Décrire le dernier rêve érotique dont tu te souviens, en une phrase"),
  c("brulant", "Avouer ce que tu murmurerais à {cible} juste avant de l'embrasser", true),
  c("brulant", "Faire une promesse brûlante à {cible} pour la fin de soirée", true),
  c("brulant", "Avouer le lieu le plus insolite où tu as déjà fait l'amour"),
  c("brulant", "Décrire en un mot ce que tu ressens en regardant {cible} ce soir", true),
  c("brulant", "Avouer ton safe word imaginaire, juste pour le fun"),
  c("brulant", "Raconter ta nuit la plus torride, sans nommer qui que ce soit"),
  c("brulant", "Avouer si tu préfères la lumière allumée ou éteinte, et pourquoi"),
  c("brulant", "Décrire le message le plus chaud que tu aies jamais reçu"),
  c("brulant", "", true, false, true),
  c("brulant", "", true, false, true),

  // ------------------------------------------------------------
  // DÉFI — une vraie action à réaliser, validée manuellement
  // ensuite (fait / pas fait), tout de suite ou plus tard.
  // ------------------------------------------------------------
  c("defi", "Envoie une photo de toi en train de danser, là, maintenant.", false, true),
  c("defi", "Fais 20 pompes devant tout le monde.", false, true),
  c("defi", "Réalise une vidéo de 10 secondes où tu imites {cible}.", true, true),
  c("defi", "Envoie un message vocal chantant à un contact choisi par le groupe.", false, true),
  c("defi", "Tente une roue (ou une tentative sincère) devant tout le monde.", false, true),
  c("defi", "Bois d'un trait un mélange improbable choisi par le groupe (sans alcool fort).", false, true),
  c("defi", "Appelle un proche et récite-lui un poème improvisé.", false, true),
  c("defi", "Poste une story avec la légende imposée par le groupe.", false, true),
  c("defi", "Échange un vêtement avec {cible} pour le reste de la soirée.", true, true),
  c("defi", "Fais un compliment filmé à chaque joueur, façon interview.", false, true),
  c("defi", "Dessine {cible} en 60 secondes chrono et montre le résultat.", true, true),
  c("defi", "Envoie ta pire photo d'identité à un proche avec un message très flatteur.", false, true),
  c("defi", "Fais deviner un mot imposé en mimant, sans parler, pendant une minute.", false, true),
  c("defi", "Chante filmé le refrain d'une chanson imposée par le groupe.", false, true),
  c("defi", "Improvise une chorégraphie de 15 secondes sur la musique choisie par le groupe.", false, true),
  c("defi", "Chuchote un secret inoffensif à l'oreille de {cible} et laisse le groupe deviner.", true, true),
  c("defi", "Fais un shot de jus de citron pur devant tout le monde.", false, true),
  c("defi", "Envoie tout de suite un message d'excuse absurde à quelqu'un du groupe.", false, true),
  c("defi", "Traverse la pièce en marchant en crabe.", false, true),
  c("defi", "Fais une déclaration d'amour improvisée et sincère à un objet de la pièce.", false, true),
  c("defi", "Fais un strip-tease (habillé) de 15 secondes sur la musique imposée.", false, true),
  c("defi", "Envoie un message doux et osé à {cible}, et montre-le au groupe une fois envoyé.", true, true),
];

// Attribution des identifiants et vérification de cohérence
const CARTES = CARTES_BRUTES.map((carte, i) => ({
  id: `c${String(i + 1).padStart(3, "0")}`,
  ...carte,
}));

// ------------------------------------------------------------
// Réactions des joueurs — 5 par genre, une lettre imposée
// ------------------------------------------------------------
const REACTIONS_M = [
  { id: "m1", lettre: "M", texte: "Miam !", profil: "envie" },
  { id: "m2", lettre: "M", texte: "Mille fois non !", profil: "refus" },
  { id: "m3", lettre: "M", texte: "Ma foi… pourquoi pas ?", profil: "hesitation" },
  { id: "m4", lettre: "M", texte: "Moi d'abord !", profil: "fonceuse" },
  { id: "m5", lettre: "M", texte: "Mouillée d'avance 💦", profil: "coquin" },
];

const REACTIONS_B = [
  { id: "b1", lettre: "B", texte: "Bueno !", profil: "envie" },
  { id: "b2", lettre: "B", texte: "Bof…", profil: "hesitation" },
  { id: "b3", lettre: "B", texte: "Banco, je fonce !", profil: "fonceur" },
  { id: "b4", lettre: "B", texte: "Basta !", profil: "refus" },
  { id: "b5", lettre: "B", texte: "Bandant 😏", profil: "coquin" },
];

// Paquet dédié aux cartes Défi — indépendant du pack M/B du joueur
const REACTIONS_D = [
  { id: "d1", lettre: "D", texte: "Dingue, j'adore !", profil: "envie" },
  { id: "d2", lettre: "D", texte: "Doucement, laisse-moi réfléchir…", profil: "hesitation" },
  { id: "d3", lettre: "D", texte: "Direct, je fonce !", profil: "fonceur" },
  { id: "d4", lettre: "D", texte: "Décliné.", profil: "refus" },
  { id: "d5", lettre: "D", texte: "Dévergondé·e à souhait 😏", profil: "coquin" },
];

// ------------------------------------------------------------
// Gages et récompenses
// ------------------------------------------------------------
const RECOMPENSES_GAGNANT = [
  "Tu choisis le gage du/de la dernier·ère dans la liste, ou tu en inventes un.",
  "Tu es servi·e par les autres joueurs pendant 10 minutes (boisson, snack).",
  "Tu gagnes une carte Véto bonus pour la prochaine partie.",
  "Tu poses une question cash à un joueur de ton choix, qui doit répondre sans véto.",
];

const GAGES_DOUX = [
  "Imiter un animal au choix du groupe pendant une minute.",
  "Parler avec l'accent imposé par le groupe pendant trois tours.",
  "Faire un compliment sincère à chaque joueur, un par un.",
  "Offrir la tournée ou le dessert à toute la tablée.",
  "Raconter une blague, et si elle ne fait rire personne, en raconter une deuxième.",
  "Envoyer un mème choisi par le groupe dans ton groupe de discussion familial.",
];

const GAGES_PIQUANT = [
  "Raconter ton pire rendez-vous amoureux, en détail.",
  "Danser sensuellement pendant trente secondes devant le groupe.",
  "Faire un massage de deux minutes à un joueur consentant.",
  "Envoyer un texto choisi par le groupe, relu et validé par toi avant l'envoi.",
  "Répondre sans mentir à une question cash posée par chaque joueur.",
  "Laisser le groupe fouiller ta galerie photo pendant une minute (tu peux en retirer une avant).",
];

const GAGES_FOU = [
  "Chanter en public, dans la rue ou sur un balcon.",
  "Appeler un ami pour lui faire une déclaration absurde et assumée.",
  "Laisser le groupe choisir ta photo de profil pendant une heure.",
  "Porter un vêtement du gagnant pendant le reste de la soirée.",
  "Envoyer un message vocal chanté à la dernière personne contactée.",
  "Faire une story publique où tu avoues ta défaite, façon grand discours.",
];

const NIVEAUX_GAGES = {
  doux: GAGES_DOUX,
  piquant: GAGES_PIQUANT,
  fou: GAGES_FOU,
};

const BoomCartes = {
  NIVEAUX,
  CARTES,
  REACTIONS_M,
  REACTIONS_B,
  REACTIONS_D,
  RECOMPENSES_GAGNANT,
  NIVEAUX_GAGES,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = BoomCartes;
} else if (typeof window !== "undefined") {
  window.BoomCartes = BoomCartes;
}
