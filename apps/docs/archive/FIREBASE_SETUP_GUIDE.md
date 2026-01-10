# 🔥 Guide Configuration Firebase pour Meeshy

Ce guide vous accompagne pour configurer Firebase Cloud Messaging dans Meeshy.

---

## 📋 Étape 1 : Récupérer les Credentials Firebase

### 1.1 Aller dans la Console Firebase

1. Ouvrir **https://console.firebase.google.com**
2. Sélectionner votre projet **Meeshy** (ou le nom que vous avez donné)

### 1.2 Ajouter une App Web

```
Console Firebase
├─ Cliquer sur l'icône "Web" (</> symbole)
├─ Nom de l'app: "Meeshy Web"
├─ Cocher "Also set up Firebase Hosting" (optionnel)
└─ Cliquer "Register app"
```

### 1.3 Copier les Credentials

Vous verrez un écran comme celui-ci :

```javascript
// Copier ces valeurs (exemple)
const firebaseConfig = {
  apiKey: "AIzaSyC-xxxxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "meeshy-xxxxx.firebaseapp.com",
  projectId: "meeshy-xxxxx",
  storageBucket: "meeshy-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdefghijklmnop",
  measurementId: "G-XXXXXXXXXX" // Optionnel
};
```

**🔴 IMPORTANT:** Ne fermez pas cet onglet, vous en aurez besoin à l'étape 2 !

---

## 📋 Étape 2 : Générer la VAPID Key (Web Push)

### 2.1 Activer Cloud Messaging

1. Dans la console Firebase, aller dans **Project Settings** (icône engrenage en haut à gauche)
2. Cliquer sur l'onglet **Cloud Messaging**

### 2.2 Générer la clé VAPID

```
Cloud Messaging Tab
├─ Scroll vers "Web configuration"
├─ Section "Web Push certificates"
├─ Cliquer "Generate key pair"
└─ Copier la clé générée (commence par "B...")
```

Exemple de VAPID key :
```
BNxK7xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**🔴 GARDEZ CETTE CLÉ !** Elle est nécessaire pour les notifications Web.

---

## 📋 Étape 3 : Ajouter au .env.local

### 3.1 Copier le template

Ouvrir `/Users/smpceo/Documents/Services/Meeshy/meeshy/apps/web/.env.local`

### 3.2 Ajouter ces lignes à la FIN du fichier

```bash
# =========================================
# FIREBASE CLOUD MESSAGING (FCM)
# =========================================

# Firebase Web App Configuration (Public - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyC-xxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=meeshy-xxxxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-xxxxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=meeshy-xxxxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdefghijklmnop
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Firebase Web Push (VAPID Key)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxK7xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Feature Flags
NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
NEXT_PUBLIC_ENABLE_PWA_BADGES=true
```

### 3.3 Remplacer les valeurs

**Remplacer les `xxxxx` par VOS vraies valeurs** copiées à l'étape 1 et 2.

---

## 📋 Étape 4 : Vérifier la Configuration

### 4.1 Créer un fichier de test

Créer `/Users/smpceo/Documents/Services/Meeshy/meeshy/apps/web/test-firebase-config.js`

```javascript
// Test rapide de la configuration Firebase
require('dotenv').config({ path: '.env.local' });

console.log('🔥 Configuration Firebase:\n');

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
};

// Vérifier que toutes les valeurs sont définies
const missing = [];
Object.entries(config).forEach(([key, value]) => {
  if (!value || value.includes('xxxxx')) {
    missing.push(key);
    console.log(`❌ ${key}: MANQUANT ou non remplacé`);
  } else {
    console.log(`✅ ${key}: ${value.substring(0, 20)}...`);
  }
});

if (missing.length === 0) {
  console.log('\n✅ Configuration Firebase COMPLÈTE !');
} else {
  console.log(`\n⚠️  ${missing.length} valeur(s) manquante(s)`);
}
```

### 4.2 Lancer le test

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend
node test-firebase-config.js
```

**Résultat attendu:**
```
🔥 Configuration Firebase:

✅ apiKey: AIzaSyC-xxxxxxxxxxx...
✅ authDomain: meeshy-xxxxx.fire...
✅ projectId: meeshy-xxxxx...
✅ storageBucket: meeshy-xxxxx.app...
✅ messagingSenderId: 123456789012...
✅ appId: 1:123456789012:we...
✅ vapidKey: BNxK7xxxxxxxxxxxx...

✅ Configuration Firebase COMPLÈTE !
```

---

## 📋 Étape 5 : Installer les Dépendances

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend

# Installer Firebase SDK
npm install firebase

# Installer next-pwa pour Service Worker
npm install next-pwa

# Installer workbox pour caching
npm install workbox-window
```

---

## 📋 Étape 6 : Tester dans le Navigateur

### 6.1 Démarrer le serveur dev

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend
npm run dev
```

### 6.2 Ouvrir la console Chrome

1. Ouvrir **https://192.168.1.39:3100** (votre frontend)
2. Ouvrir DevTools (F12)
3. Aller dans l'onglet **Console**

### 6.3 Tester Firebase

Copier-coller ce code dans la console :

```javascript
// Tester si Firebase est configuré
import('firebase/app').then(({ initializeApp }) => {
  const config = {
    apiKey: "VOTRE_API_KEY",
    projectId: "VOTRE_PROJECT_ID",
    messagingSenderId: "VOTRE_SENDER_ID",
    appId: "VOTRE_APP_ID"
  };

  try {
    const app = initializeApp(config);
    console.log('✅ Firebase initialisé avec succès !', app.name);
  } catch (error) {
    console.error('❌ Erreur Firebase:', error.message);
  }
});
```

**Si ça fonctionne:** Vous verrez `✅ Firebase initialisé avec succès !`

---

## 📋 Étape 7 : Backend - Firebase Admin SDK

### 7.1 Créer une Service Account

1. Dans Firebase Console, aller dans **Project Settings** → **Service Accounts**
2. Cliquer **"Generate new private key"**
3. Télécharger le fichier JSON (ex: `meeshy-firebase-adminsdk.json`)

### 7.2 Placer le fichier

```bash
# Créer dossier secrets
mkdir -p /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/secrets

# Copier le fichier téléchargé
cp ~/Downloads/meeshy-firebase-adminsdk-xxxxx.json \
   /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/secrets/firebase-admin.json

# IMPORTANT: Ajouter au .gitignore
echo "secrets/" >> /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/.gitignore
```

### 7.3 Configurer .env backend

Éditer `/Users/smpceo/Documents/Services/Meeshy/meeshy/gateway/.env`

```bash
# Firebase Admin SDK
FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin.json
```

### 7.4 Installer Firebase Admin SDK

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/gateway
npm install firebase-admin
```

---

## 🧪 Tests Complets

### Test 1: Configuration Frontend

```bash
cd /Users/smpceo/Documents/Services/Meeshy/meeshy/frontend
node test-firebase-config.js
```

**Attendu:** Tous les ✅

### Test 2: Firebase Initialisé

```bash
# Dans le navigateur Console (F12)
window.FIREBASE_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // ... autres configs
};
console.log(window.FIREBASE_CONFIG);
```

**Attendu:** Toutes les valeurs affichées (pas de undefined)

### Test 3: Service Worker Enregistré

```bash
# Dans le navigateur Console (F12)
navigator.serviceWorker.getRegistrations().then(regs => {
  console.log('Service Workers:', regs.length);
});
```

**Attendu:** Au moins 1 Service Worker

---

## 🐛 Troubleshooting

### Erreur: "Firebase App named '[DEFAULT]' already exists"

**Solution:** Firebase est déjà initialisé. C'est normal, ignorez cette erreur.

### Erreur: "Invalid API key"

**Solution:** Vérifiez que vous avez bien copié la clé complète depuis Firebase Console.

### Erreur: "VAPID key is not valid"

**Solution:**
1. Retournez dans Firebase Console → Cloud Messaging
2. Générez une nouvelle clé VAPID
3. Remplacez la valeur dans `.env.local`

### Les notifications ne fonctionnent pas

**Checklist:**
- [ ] Variables d'environnement définies
- [ ] VAPID key générée
- [ ] Service Worker enregistré
- [ ] Permission notifications accordée (chrome://settings/content/notifications)
- [ ] Navigateur supporte les notifications (Chrome, Edge, Firefox)

### iOS ne reçoit pas de notifications

**C'est normal si:**
- iOS < 16.4 (pas de support)
- App pas installée "Add to Home Screen"
- Safari (support limité)

**Solution:** Utiliser le composant `IOSInstallPrompt` que j'ai créé.

---

## ✅ Checklist Finale

Avant de passer à l'intégration dans l'app :

- [ ] Projet Firebase créé
- [ ] App Web ajoutée dans Firebase
- [ ] VAPID key générée
- [ ] Credentials ajoutés à `.env.local`
- [ ] `test-firebase-config.js` passe tous les tests
- [ ] Dépendances npm installées (`firebase`, `next-pwa`)
- [ ] Service Account téléchargée (backend)
- [ ] Firebase Admin SDK installé (backend)

**Si tous les ✅ sont cochés → Vous êtes prêt pour l'étape suivante !** 🎉

---

## 📚 Prochaines Étapes

1. **Intégrer dans le Layout** - Ajouter `useFCMNotifications()` hook
2. **Tester les notifications** - Envoyer une notification de test
3. **Configurer le backend** - Envoyer push via Firebase Admin SDK
4. **Déployer** - Staging puis production

---

## 📞 Support

**Si vous êtes bloqué:**

1. Vérifier le fichier `PWA_PUSH_NOTIFICATIONS_README.md`
2. Regarder les logs dans DevTools Console
3. Tester avec `test-firebase-config.js`

**Fichiers de référence:**
- Configuration: `/apps/web/.env.local`
- Code Firebase: `/apps/web/firebase-config.ts`
- Manager FCM: `/apps/web/utils/fcm-manager.ts`

---

**Date:** 21 Novembre 2025
**Status:** Guide de configuration
**Version:** 1.0.0

Suivez ce guide étape par étape et vous serez opérationnel en 20 minutes ! 🚀
