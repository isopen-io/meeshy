# Configuration Firebase en Local

## 📋 Vue d'ensemble

Guide pour activer Firebase Cloud Messaging (FCM) en développement local, **avec Docker** ou **sans Docker**.

---

## 🎯 Prérequis

### 1. Obtenir les credentials Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet (ou créez-en un)
3. **⚙️ Paramètres du projet** → **Comptes de service**
4. Cliquez sur **"Générer une nouvelle clé privée"**
5. Un fichier JSON sera téléchargé (ex: `meeshy-dev-firebase-adminsdk-xxxxx.json`)

### 2. Placer le fichier dans le projet

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Créer le répertoire secrets (si absent)
mkdir -p secrets

# Renommer et déplacer le fichier téléchargé
mv ~/Downloads/meeshy-dev-firebase-adminsdk-xxxxx.json secrets/firebase-admin-dev.json
```

### 3. (Optionnel) Credentials APNS pour iOS

Si vous testez les notifications VoIP iOS :

1. [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Créez une clé avec **Apple Push Notifications service (APNs)** activé
3. Téléchargez `AuthKey_XXXXXXXXXX.p8`
4. Renommez et placez dans `secrets/` :

```bash
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 secrets/apns-auth-key-dev.p8
```

---

## 🚀 Configuration automatique

### Étape 1 : Vérifier la configuration

```bash
./scripts/setup-firebase-local.sh --check
```

**Résultat attendu :**
```
✅ firebase-admin-dev.json trouvé
✅ JSON valide ✅
✅ .env gateway existe
  → FCM activé ✅
```

### Étape 2 : Configuration automatique

```bash
./scripts/setup-firebase-local.sh --setup
```

Ce script va :
- ✅ Créer `services/gateway/.env` depuis `.env.example`
- ✅ Configurer les chemins vers `firebase-admin-dev.json`
- ✅ Activer les flags FCM/APNS
- ✅ Afficher les instructions pour le frontend

---

## 🐳 Utilisation avec Docker

### Lancer les services

```bash
# Option 1 : Docker Compose local (sans HTTPS)
docker-compose -f docker-compose.local.yml up -d

# Option 2 : Docker Compose local avec HTTPS
docker-compose -f docker-compose.local-https.yml up -d

# Vérifier les logs du gateway
docker logs -f meeshy-local-gateway
```

### Vérifier que Firebase fonctionne

```bash
docker logs meeshy-local-gateway | grep -i firebase

# ✅ Vous devriez voir :
# [Notifications] ✅ Firebase Admin SDK initialized successfully
# [Notifications] → Push notifications ENABLED (WebSocket + Firebase)
```

### Structure des volumes Docker

Le fichier `docker-compose.local.yml` doit monter le répertoire secrets :

```yaml
services:
  gateway:
    volumes:
      - ./secrets:/app/secrets:ro  # ← Important !
```

---

## 💻 Utilisation sans Docker

### Lancer le gateway

```bash
cd services/gateway

# Installer les dépendances si besoin
npm install

# Lancer en mode dev
npm run dev
```

### Modifier le chemin Firebase dans .env

**Différence importante :**
- **Avec Docker** : Chemin relatif `./secrets/firebase-admin-dev.json`
- **Sans Docker** : Chemin absolu nécessaire

**Ouvrir `services/gateway/.env` et modifier :**

```bash
# Pour Docker (relatif)
FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin-dev.json

# Pour sans Docker (absolu)
FIREBASE_ADMIN_CREDENTIALS_PATH=/Users/smpceo/Documents/v2_meeshy/secrets/firebase-admin-dev.json
```

**OU** utiliser une variable d'environnement :

```bash
export FIREBASE_ADMIN_CREDENTIALS_PATH=/Users/smpceo/Documents/v2_meeshy/secrets/firebase-admin-dev.json
npm run dev
```

### Vérifier que Firebase fonctionne

```bash
# Les logs du gateway devraient afficher :
[Notifications] ✅ Firebase Admin SDK initialized successfully
[Notifications] → Push notifications ENABLED (WebSocket + Firebase)
```

---

## 📱 Configuration Frontend (Web)

Pour activer les notifications push dans le frontend web :

### 1. Obtenir les credentials Firebase Web

1. Firebase Console → **⚙️ Paramètres du projet**
2. Onglet **Général** → Section **Vos applications**
3. Cliquez sur l'icône **</>** (Web) ou sélectionnez votre app web existante
4. Copiez la configuration Firebase

### 2. Créer `.env.local` pour le frontend

```bash
cd apps/web
nano .env.local
```

Contenu :

```bash
# Firebase Web Configuration (Frontend)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-dev
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:xxxxx
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxxx...  # Clé VAPID pour notifications web

# Enable notifications
NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
```

### 3. Obtenir la clé VAPID

1. Firebase Console → **⚙️ Paramètres du projet** → **Cloud Messaging**
2. Onglet **Certificats push Web**
3. Cliquez sur **Générer une paire de clés**
4. Copiez la **Clé publique (VAPID)**

### 4. Lancer le frontend

```bash
cd apps/web
npm run dev
```

Accédez à `http://localhost:3100` (ou l'URL configurée)

---

## 🧪 Tester les Notifications

### Test 1 : WebSocket (toujours actif)

**Scénario :** Utilisateur connecté à l'app

1. Ouvrez deux navigateurs (ou deux onglets)
2. Connectez-vous avec deux comptes différents
3. Envoyez un message d'un compte à l'autre
4. ✅ La notification apparaît **instantanément** dans l'app

**Résultat :** WebSocket fonctionne (pas besoin de Firebase pour ça !)

---

### Test 2 : Firebase Push (utilisateur déconnecté)

**Scénario :** Utilisateur ferme l'app mais reste connecté

⚠️ **Important :** En local, Firebase Push ne fonctionnera que sur :
- **Web (Chrome/Firefox)** : Si vous avez configuré le frontend avec VAPID
- **Mobile (iOS/Android)** : Uniquement avec app native + device physique

**Test Web :**

1. Ouvrez le frontend sur Chrome/Firefox
2. Acceptez les permissions de notifications
3. Le token FCM est enregistré en DB
4. Fermez l'onglet (mais gardez le navigateur ouvert)
5. Envoyez un message à ce compte depuis un autre
6. ✅ Une notification système apparaît

---

### Test 3 : APNS VoIP (appels iOS)

**Prérequis :**
- App iOS native compilée
- Device iOS physique (ne fonctionne pas sur simulateur)
- Certificat APNS configuré

**Test :**

1. App iOS installée sur device
2. User se connecte
3. Appelez cet utilisateur depuis un autre compte
4. ✅ Notification VoIP apparaît même si app fermée

---

## 🔍 Dépannage

### Erreur : Firebase credentials file not found

**Cause :** Chemin incorrect vers `firebase-admin-dev.json`

**Solution :**

```bash
# Vérifier que le fichier existe
ls -la secrets/firebase-admin-dev.json

# Vérifier le chemin dans .env
cat services/gateway/.env | grep FIREBASE

# Avec Docker : doit être relatif
FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin-dev.json

# Sans Docker : peut être absolu
FIREBASE_ADMIN_CREDENTIALS_PATH=/Users/smpceo/Documents/v2_meeshy/secrets/firebase-admin-dev.json
```

---

### Firebase ne s'initialise pas

**Vérifier le JSON :**

```bash
# Doit être un JSON valide
cat secrets/firebase-admin-dev.json | jq .

# Doit contenir :
# - type: "service_account"
# - project_id
# - private_key_id
# - private_key
# - client_email
```

**Vérifier les logs :**

```bash
# Avec Docker
docker logs meeshy-local-gateway | grep -i firebase

# Sans Docker
# Regarder la sortie console du npm run dev
```

---

### WebSocket fonctionne mais pas Firebase Push

**C'est NORMAL si l'utilisateur est connecté !**

Firebase Push est un **fallback** utilisé uniquement quand :
- User a fermé l'app
- User est déconnecté
- WebSocket n'est pas disponible

Pour tester Firebase Push :
1. User doit **fermer complètement** l'app (pas juste minimiser)
2. User doit avoir **accordé les permissions** de notifications
3. Backend doit avoir le **FCM token** enregistré en DB

---

### Notifications push web ne fonctionnent pas

**Checklist :**

1. ✅ Frontend `.env.local` configuré avec les bonnes clés
2. ✅ Clé VAPID générée et configurée
3. ✅ Permissions notifications accordées dans le navigateur
4. ✅ HTTPS activé (ou localhost)
5. ✅ Service Worker enregistré (`apps/web/public/firebase-messaging-sw.js`)

**Vérifier dans la console navigateur :**

```javascript
// Ouvrir DevTools → Console
Notification.permission
// Doit être "granted"

// Vérifier le service worker
navigator.serviceWorker.getRegistrations()
// Doit contenir un service worker firebase-messaging
```

---

## ⚙️ Configuration avancée

### Désactiver temporairement Firebase

```bash
./scripts/setup-firebase-local.sh --disable
```

Cela met `ENABLE_FCM_PUSH=false` dans `.env`

Les notifications WebSocket continueront de fonctionner.

---

### Variables d'environnement disponibles

**Backend (`services/gateway/.env`) :**

```bash
# Chemins credentials
FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin-dev.json
APNS_KEY_PATH=./secrets/apns-auth-key-dev.p8

# Identifiants APNS
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX
APNS_BUNDLE_ID=com.meeshy.app
APNS_VOIP_BUNDLE_ID=com.meeshy.app.voip
APNS_ENVIRONMENT=development

# Feature flags
ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_NOTIFICATION_SYSTEM=true
ENABLE_APNS_PUSH=true
ENABLE_FCM_PUSH=true
ENABLE_VOIP_PUSH=true
```

**Frontend (`apps/web/.env.local`) :**

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
```

---

## 🎉 Résumé

| Environnement | WebSocket | Firebase Push | APNS VoIP |
|---------------|-----------|---------------|-----------|
| **Local (Docker)** | ✅ Toujours | ✅ Si configuré | ⚠️ Simulateur non |
| **Local (Sans Docker)** | ✅ Toujours | ✅ Si configuré | ⚠️ Simulateur non |
| **Production** | ✅ Toujours | ✅ Recommandé | ✅ Complet |

---

## 📚 Liens utiles

- [Firebase Console](https://console.firebase.google.com/)
- [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
- [Code NotificationService.ts](../../services/gateway/src/services/notifications/NotificationService.ts)
- [Configuration production](./FIREBASE_PRODUCTION_SETUP.md)

---

## ✅ Checklist Finale

- [ ] Télécharger `firebase-admin-dev.json` depuis Firebase Console
- [ ] Placer dans `secrets/firebase-admin-dev.json`
- [ ] Exécuter `./scripts/setup-firebase-local.sh --setup`
- [ ] Vérifier avec `./scripts/setup-firebase-local.sh --check`
- [ ] Lancer avec Docker : `docker-compose -f docker-compose.local.yml up -d`
- [ ] OU sans Docker : `cd services/gateway && npm run dev`
- [ ] Vérifier les logs : chercher "Firebase Admin SDK initialized successfully"
- [ ] (Optionnel) Configurer frontend `.env.local` pour notifications web
- [ ] Tester notifications WebSocket (user connecté)
- [ ] Tester notifications Firebase Push (user déconnecté, web uniquement en local)

**Votre système de notifications est maintenant actif en local ! 🚀**
