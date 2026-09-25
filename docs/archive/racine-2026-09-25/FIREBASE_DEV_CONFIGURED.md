# 🎉 Firebase DEV - Configuration Terminée !

## ✅ Ce qui a été configuré

### Backend (Gateway)
- ✅ Script de configuration : `scripts/setup-firebase-local.sh`
- ✅ Fichier attendu : `secrets/firebase-admin-dev.json`
- ⏳ **Action requise** : Télécharger le fichier depuis Firebase Console

### Frontend (Web)  
- ✅ Fichier créé : `apps/web/.env.local`
- ✅ Credentials configurés avec projet `meeshy-dev`
- ⏳ **Action requise** : Générer la clé VAPID

---

## 🔑 Vos credentials Firebase DEV

```javascript
// Projet : meeshy-dev
apiKey: "AIzaSyDX3u_0JAmUPXoHYGQtouXO4UAuhNjUG6o"
authDomain: "meeshy-dev.firebaseapp.com"
projectId: "meeshy-dev"
storageBucket: "meeshy-dev.firebasestorage.app"
messagingSenderId: "392870895507"
appId: "1:392870895507:web:fd50af64095bc2fcad9266"
measurementId: "G-4YGK1QT8P1"
```

---

## 📝 Actions à faire MAINTENANT

### 1️⃣ Télécharger firebase-admin-dev.json (Backend)

```bash
# 1. Allez sur https://console.firebase.google.com/project/meeshy-dev/settings/serviceaccounts
# 2. Cliquez "Générer une nouvelle clé privée"
# 3. Téléchargez le fichier JSON

# 4. Renommer et déplacer
cd /Users/smpceo/Documents/v2_meeshy
mv ~/Downloads/meeshy-dev-firebase-adminsdk-*.json secrets/firebase-admin-dev.json

# 5. Configuration automatique
./scripts/setup-firebase-local.sh --setup
```

---

### 2️⃣ Générer la clé VAPID (Frontend)

```bash
# 1. Ouvrir dans votre navigateur
https://console.firebase.google.com/project/meeshy-dev/settings/cloudmessaging

# 2. Section "Certificats push Web"
# 3. Cliquez "Générer une paire de clés"
# 4. Copiez la clé publique (commence par B...)

# 5. Ajouter dans apps/web/.env.local
nano apps/web/.env.local
# Remplacez : NEXT_PUBLIC_FIREBASE_VAPID_KEY=VOTRE_CLE_VAPID_ICI
# Par votre vraie clé VAPID
```

---

## 🚀 Lancer les services

### Avec Docker

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Lancer tous les services
docker-compose -f docker-compose.local.yml up -d

# Vérifier le gateway
docker logs meeshy-local-gateway | grep Firebase
# ✅ Vous devriez voir : "Firebase Admin SDK initialized successfully"

# Vérifier le frontend
# Ouvrir http://localhost:3100 dans Chrome/Firefox
```

### Sans Docker

```bash
# Terminal 1 : Gateway
cd services/gateway
npm run dev

# Terminal 2 : Frontend
cd apps/web
npm run dev

# Ouvrir http://localhost:3100
```

---

## 🧪 Tester les notifications

### Test WebSocket (toujours actif)

1. Ouvrez deux navigateurs
2. Connectez-vous avec deux comptes
3. Envoyez un message
4. ✅ Notification instantanée dans l'app

### Test Firebase Push (user déconnecté)

1. Ouvrez le frontend, connectez-vous
2. Acceptez les permissions notifications
3. Fermez l'onglet (navigateur ouvert)
4. Envoyez message à ce compte
5. ✅ Notification système apparaît

---

## 📊 État actuel

| Composant | Fichier | Status |
|-----------|---------|--------|
| **Backend** | `secrets/firebase-admin-dev.json` | ⏳ À télécharger |
| **Frontend** | `apps/web/.env.local` | ✅ Créé |
| **VAPID Key** | Dans `.env.local` | ⏳ À générer |

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [FIREBASE_FRONTEND_SETUP.md](docs/FIREBASE_FRONTEND_SETUP.md) | Configuration frontend détaillée |
| [FIREBASE_LOCAL_SETUP.md](docs/FIREBASE_LOCAL_SETUP.md) | Configuration backend locale |
| [FIREBASE_MULTI_ENVIRONMENT.md](docs/FIREBASE_MULTI_ENVIRONMENT.md) | Projets séparés dev/prod |
| [FIREBASE_QUICKSTART.md](docs/FIREBASE_QUICKSTART.md) | Guide rapide 5 min |

---

## ✅ Checklist

- [x] Projet Firebase `meeshy-dev` créé
- [x] Credentials frontend configurés
- [x] Fichier `.env.local` créé
- [ ] Télécharger `firebase-admin-dev.json`
- [ ] Générer clé VAPID
- [ ] Ajouter VAPID dans `.env.local`
- [ ] Configurer backend avec `setup-firebase-local.sh`
- [ ] Lancer les services
- [ ] Tester notifications WebSocket
- [ ] Tester notifications Firebase Push

---

## 🆘 Besoin d'aide ?

```bash
# Vérifier la configuration
./scripts/setup-firebase-local.sh --check

# Tester Firebase
./scripts/test-firebase-local.sh

# Voir la doc complète
cat docs/FIREBASE_FRONTEND_SETUP.md
```

---

**Prochaines étapes : Téléchargez firebase-admin-dev.json et générez la clé VAPID ! 🚀**
