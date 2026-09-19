/* ============================================================
   Configuration Firebase — à remplir avec TES propres identifiants.

   1. Va sur https://console.firebase.google.com/ et connecte-toi avec
      un compte Google (gratuit).
   2. « Ajouter un projet » → donne-lui un nom (ex. "boom-jeu") →
      tu peux désactiver Google Analytics, pas nécessaire → Créer.
   3. Dans le menu de gauche : Build → Realtime Database → Créer une
      base de données → choisis un emplacement (ex. Europe) → démarre
      en mode TEST (on règle les règles de sécurité juste après).
   4. Toujours dans Realtime Database, onglet « Règles », colle :
         {
           "rules": {
             "salons": {
               ".read": true,
               ".write": true
             }
           }
         }
      puis Publier. (Ça limite l'accès public au nœud "salons" — largement
      suffisant pour un jeu entre amis avec un code à 4 lettres.)
   5. Retourne dans les paramètres du projet (icône ⚙️ en haut à gauche)
      → Paramètres du projet → onglet « Général » → tout en bas,
      « Vos applications » → clique sur l'icône </> (Web) → donne un nom
      à l'appli → « Enregistrer l'application ».
   6. Firebase affiche un bloc de code avec un objet firebaseConfig.
      Copie SES VALEURS ci-dessous (remplace tout ce qui suit "TON_...").
   ============================================================ */

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCA_99Co9_bCTe6NsAqgwSvs8iDBHS1Rt4",
  authDomain: "boom-jeu.firebaseapp.com",
  databaseURL: "https://boom-jeu-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "boom-jeu",
  storageBucket: "boom-jeu.firebasestorage.app",
  messagingSenderId: "705322858384",
  appId: "1:705322858384:web:7e0df0bf9f633f15a1a515",
};
