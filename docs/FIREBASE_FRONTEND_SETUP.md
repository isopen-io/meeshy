# Firebase Frontend (Web) - Configuration

## ✅ Configuration automatique effectuée !

Le fichier `apps/web/.env.local` a été créé avec vos credentials Firebase dev.

---

## 🔑 Étape finale : Générer la clé VAPID

La **clé VAPID** est nécessaire pour les **notifications push web**.

### 1. Ouvrir Firebase Console

```bash
# Ouvrir dans votre navigateur
https://console.firebase.google.com/project/meeshy-dev/settings/cloudmessaging
```

### 2. Générer la clé VAPID

1. Dans Firebase Console, sélectionnez le projet **meeshy-dev**
2. Allez dans **⚙️ Paramètres du projet**
3. Onglet **Cloud Messaging**
4. Section **"Certificats push Web"**
5. Cliquez sur **"Générer une paire de clés"**
6. Copiez la **"Clé publique (VAPID)"** (commence par `B...`)

### 3. Ajouter dans .env.local

```bash
# Ouvrir le fichier
nano apps/web/.env.local

# Remplacer la ligne :
NEXT_PUBLIC_FIREBASE_VAPID_KEY=VOTRE_CLE_VAPID_ICI

# Par :
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🚀 Lancer le frontend

```bash
cd apps/web

# Installer les dépendances si nécessaire
npm install

# Lancer en mode dev
npm run dev

# Ouvrir dans le navigateur
# http://localhost:3100
```

---

## 🧪 Tester les notifications push web

### Test 1 : Vérifier la configuration

1. Ouvrez le frontend dans Chrome/Firefox
2. Ouvrez DevTools (F12) → Console
3. Vérifiez qu'il n'y a pas d'erreurs Firebase
4. Vous devriez voir : `Firebase initialized successfully`

### Test 2 : Demander les permissions

1. Connectez-vous à l'app
2. Quand demandé, cliquez **"Autoriser les notifications"**
3. Le navigateur demandera la permission système
4. Acceptez la permission

### Test 3 : Recevoir une notification

**Scénario A : Utilisateur connecté (WebSocket)**

1. Ouvrez deux onglets
2. Connectez-vous avec deux comptes différents
3. Envoyez un message d'un compte à l'autre
4. ✅ Notification in-app apparaît instantanément (WebSocket)

**Scénario B : Utilisateur déconnecté (Firebase Push)**

1. Ouvrez le frontend, connectez-vous
2. Acceptez les permissions notifications
3. **Fermez l'onglet** (mais gardez le navigateur ouvert)
4. Depuis un autre device, envoyez un message à ce compte
5. ✅ Une notification système doit apparaître

---

## 🔍 Debug

### Vérifier que Firebase est initialisé

**DevTools Console :**

```javascript
// Vérifier les permissions
Notification.permission
// Doit retourner : "granted"

// Vérifier le service worker
navigator.serviceWorker.getRegistrations()
// Doit contenir un service worker Firebase
```

### Vérifier le token FCM

**DevTools Console :**

```javascript
// Le token FCM devrait être enregistré
// Regardez les logs réseau (Network tab) pour voir les appels API
// Cherchez : POST /api/users/register-device-token
```

### Erreurs communes

#### Erreur : "Firebase: Error (messaging/unsupported-browser)"

**Cause :** Navigateur non supporté ou pas en HTTPS

**Solution :**
- Utilisez Chrome ou Firefox récent
- OU utilisez `localhost` (HTTPS pas requis en local)
- OU configurez HTTPS local avec `docker-compose.local-https.yml`

---

#### Erreur : "Notifications blocked"

**Cause :** Permissions refusées

**Solution :**
1. Chrome : Paramètres → Confidentialité et sécurité → Autorisations du site → Notifications
2. Trouvez `localhost:3100` et changez en "Autoriser"
3. Rechargez la page

---

#### Erreur : "Invalid VAPID key"

**Cause :** Clé VAPID incorrecte ou manquante

**Solution :**
```bash
# Vérifier la clé dans .env.local
cat apps/web/.env.local | grep VAPID

# Doit commencer par B et faire ~88 caractères
# Si manquant, générer dans Firebase Console
```

---

## 📱 Service Worker

Le service worker Firebase est nécessaire pour les notifications push.

### Vérifier le service worker

**apps/web/public/firebase-messaging-sw.js** doit exister

Si manquant, créez-le :

```javascript
// apps/web/public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDX3u_0JAmUPXoHYGQtouXO4UAuhNjUG6o",
  authDomain: "meeshy-dev.firebaseapp.com",
  projectId: "meeshy-dev",
  storageBucket: "meeshy-dev.firebasestorage.app",
  messagingSenderId: "392870895507",
  appId: "1:392870895507:web:fd50af64095bc2fcad9266"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification?.title || 'Nouveau message';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
```

---

## ⚙️ Variables d'environnement

### Fichier créé : `apps/web/.env.local`

```bash
# ✅ Déjà configuré avec vos credentials
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDX3u_0JAmUPXoHYGQtouXO4UAuhNjUG6o
NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-dev
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=392870895507
NEXT_PUBLIC_FIREBASE_APP_ID=1:392870895507:web:fd50af64095bc2fcad9266

# ⚠️ À GÉNÉRER
NEXT_PUBLIC_FIREBASE_VAPID_KEY=VOTRE_CLE_VAPID_ICI
```

---

## 🎯 Récapitulatif

| Étape | Status | Action |
|-------|--------|--------|
| **1. Credentials Firebase** | ✅ Fait | Configuré dans `.env.local` |
| **2. Générer clé VAPID** | ⚠️ À faire | Firebase Console → Cloud Messaging |
| **3. Mettre à jour .env.local** | ⚠️ À faire | Ajouter la clé VAPID |
| **4. Lancer frontend** | ⏳ | `npm run dev` dans `apps/web/` |
| **5. Tester notifications** | ⏳ | Suivre les instructions de test |

---

## 🔐 Sécurité

### ✅ Protections en place

- `.env.local` est dans `.gitignore` (pas commité)
- Credentials dev séparés de production
- Clés API publiques (normal pour frontend)
- VAPID key publique (normal pour web push)

### ⚠️ Note importante

Les clés Firebase frontend sont **publiques par design** car elles tournent dans le navigateur. La sécurité est assurée par :
- Firebase Security Rules (Firestore, Storage)
- Backend API authentication
- Rate limiting

**Ne jamais mettre de secrets sensibles dans .env.local** (seulement variables NEXT_PUBLIC_*)

---

## 📚 Prochaines étapes

1. ✅ Générer la clé VAPID
2. ✅ Lancer le frontend
3. ✅ Tester WebSocket (user connecté)
4. ✅ Tester Firebase Push (user déconnecté)

---

**🎉 Frontend Firebase configuré ! Il ne reste plus qu'à générer la clé VAPID.**
