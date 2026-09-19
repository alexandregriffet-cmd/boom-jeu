# BooM 💥

Jeu de soirée à deux ou plus : situations, paris sur les réactions, cartes
Véto, carte Joker, et un gage pour le·la dernier·ère à la fin.

C'est une application web statique (HTML/CSS/JS) hébergée gratuitement sur
GitHub Pages. Le mode « salon en ligne » s'appuie sur Firebase Realtime
Database (gratuit) comme serveur central de synchronisation — voir plus bas.

## Mettre le jeu en ligne sur GitHub Pages

1. Crée un nouveau dépôt sur GitHub (public ou privé, peu importe).
2. Dépose-y le contenu de ce dossier (`index.html`, `style.css`, `app.js`,
   `engine.js`, `cartes.js`, `firebase-config.js`) à la racine du dépôt.
3. Dans le dépôt : **Settings → Pages**, choisis la branche `main` et le
   dossier `/ (root)`, puis enregistre.
4. Au bout d'une à deux minutes, GitHub affiche l'adresse du site, du type
   `https://<ton-nom>.github.io/<nom-du-depot>/`. C'est le lien à partager.

Aucune étape de build n'est nécessaire : ce sont des fichiers statiques.

## Configurer Firebase (obligatoire pour le salon en ligne)

Le mode « Un seul téléphone » fonctionne sans rien configurer. Pour que
« Créer un salon en ligne » / « Rejoindre un salon » fonctionnent entre
plusieurs téléphones, il faut un projet Firebase gratuit (5-10 minutes,
une seule fois) : toutes les instructions détaillées sont dans les
commentaires en haut de `firebase-config.js`. En résumé :

1. Crée un projet gratuit sur https://console.firebase.google.com/
2. Active « Realtime Database » (mode test), et publie les règles
   d'accès données dans `firebase-config.js`.
3. Récupère la configuration de l'application web du projet et colle-la
   dans `firebase-config.js` à la place des valeurs `TON_...`.
4. Redéploie (remplace `firebase-config.js` dans ton dépôt GitHub).

Tant que `firebase-config.js` garde ses valeurs par défaut, le jeu affiche
un message clair (« configuration manquante ») au lieu de planter.

## Les deux façons de jouer

- **Un seul téléphone** : vous vous le passez à tour de rôle. L'écran de
  transfert indique à qui donner le téléphone et cache les réponses des
  autres.
- **Salon en ligne** : un·e joueur·euse crée un salon et obtient un code à
  4 lettres ; les autres le rejoignent depuis leur propre téléphone en
  entrant ce code. Tous les téléphones synchronisent la partie via
  Firebase (un serveur central), pas entre eux directement : c'est ce qui
  rend la connexion fiable quel que soit le réseau de chacun (4G, box,
  opérateurs différents), contrairement à une connexion directe
  téléphone-à-téléphone qui échoue souvent selon les NAT/pare-feux
  mobiles.

  ⚠️ Ce mode fait confiance aux joueurs : les règles Firebase données
  ci-dessus ouvrent la lecture/écriture du nœud "salons" à qui connaît
  l'URL de la base ; combiné à un code de salon à 4 lettres tiré au sort
  et à des parties éphémères, c'est largement suffisant pour une soirée
  entre amis, mais ce n'est pas un chiffrement de bout en bout.

  Un salon n'expire jamais tout seul côté serveur : un code reste valable
  toute une journée (ou plus), même si personne ne le rejoint tout de
  suite. Chaque téléphone (hôte comme invité) garde aussi en mémoire
  locale le salon rejoint, pour se rebrancher automatiquement dessus si la
  page recharge (mise en veille prolongée, appli relancée…) — inutile de
  recréer un salon ou de retaper le code à chaque fois. Le salon n'est
  supprimé que si l'hôte appuie explicitement sur « Retour » ou
  « Nouvelle partie ».

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

- Pas de mode "spectateur" ni de sauvegarde de partie entre deux sessions.
- Le contenu Brûlant reste suggéré, jamais explicite (choix assumé, voir
  la conversation d'origine).
- Les règles Firebase proposées ci-dessus sont volontairement simples
  (pas d'authentification) — largement suffisant pour un jeu entre amis,
  mais à ne pas réutiliser telles quelles pour une appli grand public.
