# BooM 💥

Jeu de soirée à deux ou plus : situations, paris sur les réactions, cartes
Véto, carte Joker, et un gage pour le·la dernier·ère à la fin.

C'est une application web statique (HTML/CSS/JS, sans backend). Elle
fonctionne dans un navigateur de smartphone et peut être hébergée
gratuitement sur GitHub Pages.

## Mettre le jeu en ligne sur GitHub Pages

1. Crée un nouveau dépôt sur GitHub (public ou privé, peu importe).
2. Dépose-y le contenu de ce dossier (`index.html`, `style.css`, `app.js`,
   `engine.js`, `cartes.js`, `peerjs.min.js`) à la racine du dépôt.
3. Dans le dépôt : **Settings → Pages**, choisis la branche `main` et le
   dossier `/ (root)`, puis enregistre.
4. Au bout d'une à deux minutes, GitHub affiche l'adresse du site, du type
   `https://<ton-nom>.github.io/<nom-du-depot>/`. C'est le lien à partager.

Aucune étape de build n'est nécessaire : ce sont des fichiers statiques.

## Les deux façons de jouer

- **Un seul téléphone** : vous vous le passez à tour de rôle. L'écran de
  transfert indique à qui donner le téléphone et cache les réponses des
  autres.
- **Salon en ligne** : un·e joueur·euse crée un salon et obtient un code à
  4 lettres ; les autres le rejoignent depuis leur propre téléphone en
  entrant ce code. La connexion entre les téléphones passe par PeerJS
  (connexion directe entre navigateurs) : elle a besoin d'Internet pour
  s'établir, mais aucune donnée de partie ne transite par un serveur tiers.

  ⚠️ Ce mode fait confiance aux joueurs : les échanges réseau ne sont pas
  chiffrés de bout en bout contre un joueur techniquement curieux qui
  inspecterait son propre appareil. Pour une soirée entre amis, c'est
  largement suffisant.

## Contenu du jeu

- **180 cartes** réparties en 5 niveaux : Doux, Piquant, Coquin, Brûlant et
  Défi — sélectionnables à la configuration.
- **5 réactions** par paquet, imposées par lettre : M pour un paquet,
  B pour l'autre (chaque joueur choisit librement son paquet), et un
  troisième paquet **D** dédié aux cartes Défi.
- **Cartes libres** : sur certaines cartes, c'est la Cible elle-même qui
  invente la situation sur le moment, sans aucun filtre de l'application.
- **Cartes Défi** : une vraie action à réaliser (photo, vidéo, mini-défi).
  La Cible choisit d'abord une réaction (paquet D) sur laquelle les autres
  parient comme d'habitude ; ensuite, n'importe qui peut valider
  manuellement si le défi a été fait ou non — tout de suite ou plus tard
  dans la soirée, depuis le bouton « Défis en attente » (en jeu) ou
  directement sur l'écran de fin. Un défi réussi rapporte +2 points bonus
  à la Cible, en plus des points du pari.
- **Cartes Véto** : 0 à 5 par joueur, réglables avant la partie.
- **Carte Joker « Je / J' »** : une fois par joueur, réponse libre
  commençant par « Je » ou « J' », validée par vote du groupe (+3 points).
- **Fin de partie** : classement, récompense pour le·la premier·ère,
  gage pour le·la dernier·ère (tiré parmi une liste Doux / Piquant / Fou).
  Les défis encore en attente restent validables même après l'affichage
  du podium, qui se met à jour automatiquement.

## Étendre la banque de situations

Toutes les cartes sont dans `cartes.js`, dans le tableau `CARTES_BRUTES`.
Chaque ligne suit le format :

```js
c(niveau, texte, avecQui, defi, libre)
```

- `avecQui` (`true`/`false`) : la situation appelle une précision "avec
  qui" à la révélation.
- `defi` (`true`/`false`) : carte Défi — utilise le paquet de réactions D
  et déclenche la validation manuelle fait/pas fait.
- `libre` (`true`/`false`) : carte à texte libre — laisser `texte` vide,
  c'est la Cible qui l'invente en jeu.

Il suffit d'ajouter des lignes pour enrichir chaque niveau — je peux aussi
générer des lots supplémentaires (100, 200 cartes de plus) sur demande.

## Limites connues (pour une V1)

- Le mode en ligne ne gère pas la reconnexion si un joueur perd sa
  connexion en cours de partie.
- Pas de mode "spectateur" ni de sauvegarde de partie entre deux sessions.
- Le contenu Brûlant reste suggéré, jamais explicite (choix assumé, voir
  la conversation d'origine).
