# Configuration Firebase en Production

## 📋 Vue d'ensemble

Votre système de notifications utilise un fallback gracieux entre WebSocket (Socket.IO) et Firebase Cloud Messaging (FCM). Firebase est **optionnel** mais recommandé pour les notifications push quand l'utilisateur est déconnecté.

## 🏗️ Architecture actuelle

```
┌─────────────────────────────────────────────────────────────┐
│  Système de Notifications Hybride                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1️⃣ WebSocket (Socket.IO) - PRIORITAIRE                    │
│     • User connecté → Notification temps réel in-app ✅     │
│     • Fonctionne AVEC ou SANS Firebase                     │
│                                                             │
│  2️⃣ Firebase Cloud Messaging - OPTIONNEL                   │
│     • User déconnecté → Push notification système ✅        │
│     • Si absent → Notification sauvegardée en DB            │
│                                                             │
│  3️⃣ @parse/node-apn - iOS VoIP                             │
│     • Notifications VoIP pour appels iOS ✅                 │
│     • Requiert certificat APNS séparé                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Gestion des Secrets en Production

### Structure actuelle

```bash
/opt/meeshy/secrets/              # Serveur de production
├── firebase-admin.json           # À créer (credentials Firebase)
├── apns-auth-key.p8             # À créer (clé APNS iOS)
└── production-secrets.env        # Fichier principal des secrets
```

### Le fichier `production-secrets.env` est lu par :
- `scripts/deployment/deploy-prepare-files.sh` (ligne 97-116)
- Variables intégrées automatiquement dans `.env` lors du déploiement

---

## 📝 Variables Firebase à ajouter

### 1. Ouvrir le fichier des secrets en production

```bash
ssh root@meeshy.me
nano /opt/meeshy/secrets/production-secrets.env
```

### 2. Ajouter les variables Firebase

```bash
# ===== FIREBASE CLOUD MESSAGING (FCM) =====
# Optionnel - Si absent, seul WebSocket fonctionne

# Chemin vers le fichier de credentials Firebase Admin SDK
FIREBASE_ADMIN_CREDENTIALS_PATH=/opt/meeshy/secrets/firebase-admin.json

# ===== APPLE PUSH NOTIFICATIONS (APNS) =====
# Requis pour notifications iOS natives et VoIP

# Identifiant de la clé APNS (trouvé dans Apple Developer Portal)
APNS_KEY_ID=XXXXXXXXXX

# Team ID Apple (trouvé dans Membership de votre compte Apple Developer)
APNS_TEAM_ID=XXXXXXXXXX

# Chemin vers le fichier de clé APNS (.p8)
APNS_KEY_PATH=/opt/meeshy/secrets/apns-auth-key.p8

# Bundle IDs de vos applications iOS
APNS_BUNDLE_ID=me.meeshy.app
APNS_VOIP_BUNDLE_ID=me.meeshy.app.voip

# Environnement APNS (development ou production)
APNS_ENVIRONMENT=production

# ===== FEATURE FLAGS =====
# Activer/désactiver les notifications push

ENABLE_PUSH_NOTIFICATIONS=true
ENABLE_NOTIFICATION_SYSTEM=true
ENABLE_APNS_PUSH=true
ENABLE_FCM_PUSH=true
ENABLE_VOIP_PUSH=true
```

---

## 🔑 Obtenir les Credentials Firebase

### Étape 1 : Créer un projet Firebase

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez sur "Ajouter un projet"
3. Nom du projet : `meeshy-production` (ou autre)
4. Activez Google Analytics si désiré
5. Créez le projet

### Étape 2 : Générer la clé de service (Service Account)

1. Dans Firebase Console, allez dans **⚙️ Paramètres du projet**
2. Onglet **Comptes de service**
3. Cliquez sur **Générer une nouvelle clé privée**
4. Un fichier JSON sera téléchargé : `meeshy-production-firebase-adminsdk-xxxxx.json`

### Étape 3 : Renommer et uploader le fichier

```bash
# Sur votre machine locale
mv ~/Downloads/meeshy-production-firebase-adminsdk-xxxxx.json firebase-admin.json

# Uploader vers le serveur de production
scp firebase-admin.json root@meeshy.me:/opt/meeshy/secrets/

# Vérifier les permissions
ssh root@meeshy.me
chmod 600 /opt/meeshy/secrets/firebase-admin.json
chown root:root /opt/meeshy/secrets/firebase-admin.json
```

### Étape 4 : Configurer Firebase pour iOS/Android/Web

#### Pour iOS :
1. Firebase Console → **⚙️ Paramètres du projet** → **Ajouter une application iOS**
2. Bundle ID : `com.meeshy.app`
3. Téléchargez `GoogleService-Info.plist`
4. Intégrez dans Xcode (apps/ios/)

#### Pour Android :
1. Firebase Console → **⚙️ Paramètres du projet** → **Ajouter une application Android**
2. Package name : `com.meeshy.app`
3. Téléchargez `google-services.json`
4. Placez dans `apps/android/app/`

#### Pour Web :
1. Firebase Console → **⚙️ Paramètres du projet** → **Ajouter une application Web**
2. Nom : `meeshy-web`
3. Cochez "Configurer aussi Firebase Hosting"
4. Notez les clés API (déjà dans votre `.env.example`) :
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

---

## 🍎 Obtenir les Credentials APNS (iOS)

### Étape 1 : Créer une clé APNS

1. Allez sur [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Cliquez sur **+** (créer une nouvelle clé)
3. Nom : `Meeshy APNS Production Key`
4. Cochez **Apple Push Notifications service (APNs)**
5. Cliquez sur **Continue** puis **Register**
6. **Téléchargez la clé** : `AuthKey_XXXXXXXXXX.p8`
   - ⚠️ **IMPORTANT** : Vous ne pouvez la télécharger qu'une seule fois !
7. Notez le **Key ID** (10 caractères, ex: `ABCD1234EF`)

### Étape 2 : Trouver votre Team ID

1. Dans Apple Developer Portal, allez dans **Membership**
2. Notez le **Team ID** (10 caractères, ex: `XYZ9876ABC`)

### Étape 3 : Uploader la clé sur le serveur

```bash
# Sur votre machine locale
mv ~/Downloads/AuthKey_XXXXXXXXXX.p8 apns-auth-key.p8

# Uploader vers le serveur de production
scp apns-auth-key.p8 root@meeshy.me:/opt/meeshy/secrets/

# Vérifier les permissions
ssh root@meeshy.me
chmod 600 /opt/meeshy/secrets/apns-auth-key.p8
chown root:root /opt/meeshy/secrets/apns-auth-key.p8
```

---

## 🚀 Déploiement

### Déploiement automatique avec vos scripts

```bash
# Depuis votre machine locale
cd /Users/smpceo/Documents/v2_meeshy

# Déployer avec intégration automatique des secrets
./scripts/deployment/deploy-orchestrator.sh deploy meeshy.me

# Le script va :
# 1. Lire /opt/meeshy/secrets/production-secrets.env
# 2. Intégrer les variables dans .env
# 3. Copier firebase-admin.json et apns-auth-key.p8
# 4. Redémarrer les services
```

### Vérification après déploiement

```bash
# Se connecter au serveur
ssh root@meeshy.me

# Vérifier que les fichiers existent
ls -la /opt/meeshy/secrets/
# Devrait afficher :
# firebase-admin.json (600)
# apns-auth-key.p8 (600)
# production-secrets.env (600)

# Vérifier les logs du service gateway
docker logs meeshy-gateway-1 | grep -i firebase

# ✅ Si Firebase fonctionne, vous verrez :
# [Notifications] ✅ Firebase Admin SDK initialized successfully
# [Notifications] → Push notifications ENABLED (WebSocket + Firebase)

# ❌ Si Firebase est absent (pas grave, WebSocket fonctionne) :
# [Notifications] → Push notifications DISABLED (WebSocket only)
```

---

## 🧪 Test des Notifications

### Test WebSocket (toujours actif)

```bash
# User connecté à l'app web/mobile
# Envoyez un message → notification apparaît instantanément in-app ✅
```

### Test Firebase Push (user déconnecté)

```bash
# 1. User s'enregistre pour les notifications (frontend)
# 2. User ferme l'app / se déconnecte
# 3. Envoyez un message vers ce user
# 4. Push notification apparaît dans la barre système ✅
```

### Test APNS VoIP (appels iOS)

```bash
# 1. User iOS connecté
# 2. Appelez cet user depuis un autre compte
# 3. Notification VoIP apparaît même si app fermée ✅
```

---

## 🔍 Dépannage

### Firebase ne s'initialise pas

```bash
# Vérifier le contenu du fichier
cat /opt/meeshy/secrets/firebase-admin.json

# Doit être un JSON valide avec :
# - type: "service_account"
# - project_id
# - private_key_id
# - private_key
# - client_email

# Vérifier les permissions
ls -la /opt/meeshy/secrets/firebase-admin.json
# Doit être : -rw------- (600)
```

### APNS ne fonctionne pas

```bash
# Vérifier la clé APNS
cat /opt/meeshy/secrets/apns-auth-key.p8

# Doit commencer par :
# -----BEGIN PRIVATE KEY-----
# Et finir par :
# -----END PRIVATE KEY-----

# Vérifier les variables dans .env
docker exec meeshy-gateway-1 env | grep APNS
```

### Notifications WebSocket fonctionnent mais pas les push

```bash
# C'est normal si user est CONNECTÉ !
# WebSocket a la priorité sur Firebase

# Pour tester Firebase :
# 1. User doit fermer complètement l'app
# 2. User doit avoir accordé permission notifications
# 3. Backend doit avoir son FCM token enregistré
```

---

## 📊 Monitoring

### Métriques de notifications

```bash
# API endpoint pour voir les stats
curl http://localhost:3000/api/notifications/metrics

# Réponse :
{
  "notificationsCreated": 1250,
  "webSocketSent": 1100,
  "firebaseSent": 150,
  "firebaseFailed": 5,
  "firebaseEnabled": true
}
```

---

## 🛡️ Sécurité

### ✅ Bonnes pratiques appliquées

1. **Fichiers secrets en 600** : Lisibles uniquement par root
2. **Pas de secrets dans git** : `.gitignore` protège `.env*` et `secrets/`
3. **Firebase isolé** : Ne crashe JAMAIS l'app si absent
4. **Fallback gracieux** : WebSocket fonctionne toujours

### ⚠️ À NE PAS FAIRE

- ❌ Commiter `firebase-admin.json` dans git
- ❌ Partager les clés APNS `.p8` publiquement
- ❌ Utiliser les mêmes credentials dev/prod
- ❌ Donner permissions 777 aux fichiers de secrets

---

## 📚 Références

- [Firebase Admin SDK Setup](https://firebase.google.com/docs/admin/setup)
- [APNS Documentation](https://developer.apple.com/documentation/usernotifications)
- [Votre code NotificationService.ts](../../services/gateway/src/services/notifications/NotificationService.ts)
- [Architecture de déploiement](../../scripts/deployment/README.md)

---

## ✅ Checklist de Production

- [ ] Créer projet Firebase
- [ ] Télécharger `firebase-admin.json`
- [ ] Uploader vers `/opt/meeshy/secrets/`
- [ ] Créer clé APNS
- [ ] Télécharger `apns-auth-key.p8`
- [ ] Uploader vers `/opt/meeshy/secrets/`
- [ ] Ajouter variables dans `production-secrets.env`
- [ ] Vérifier permissions (600) sur tous les fichiers
- [ ] Redéployer avec `deploy-orchestrator.sh`
- [ ] Vérifier logs : `docker logs meeshy-gateway-1 | grep Firebase`
- [ ] Tester notifications push
- [ ] Tester appels VoIP iOS

---

**Système prêt à fonctionner avec ou sans Firebase ! 🚀**
