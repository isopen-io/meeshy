# Firebase - Gestion Multi-Environnements

## 🎯 Pourquoi plusieurs projets Firebase ?

### ✅ Avantages de la séparation dev/prod

| Aspect | Projet unique | Projets séparés |
|--------|---------------|-----------------|
| **Sécurité** | ❌ Risque de toucher prod en dev | ✅ Isolation totale |
| **Données** | ❌ Données de test polluent prod | ✅ Données séparées |
| **Quotas** | ❌ Quotas partagés | ✅ Quotas indépendants |
| **Analytics** | ❌ Stats mélangées | ✅ Stats propres |
| **Coûts** | ❌ Difficile à tracer | ✅ Coûts par env |
| **Testabilité** | ❌ Peur de casser prod | ✅ Tests en toute sécurité |

---

## 🏗️ Architecture recommandée

```
Firebase Console
│
├── 📦 meeshy-dev
│   ├── Project ID: meeshy-dev
│   ├── Credentials: firebase-admin-dev.json
│   ├── Usage: Développement local
│   └── Analytics: Désactivé (optionnel)
│
├── 📦 meeshy-staging (optionnel)
│   ├── Project ID: meeshy-staging
│   ├── Credentials: firebase-admin-staging.json
│   ├── Usage: Tests pré-production
│   └── Analytics: Activé
│
└── 📦 meeshy-production
    ├── Project ID: meeshy-production
    ├── Credentials: firebase-admin-production.json
    ├── Usage: Production réelle
    └── Analytics: Activé + alertes
```

---

## 📝 Étapes de configuration

### 1. Créer les projets Firebase

#### Projet de développement

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Cliquez **"Ajouter un projet"**
3. Nom du projet : **`meeshy-dev`**
4. Google Analytics : **Désactiver** (optionnel pour dev)
5. Créez le projet

#### Projet de production

1. Même processus
2. Nom du projet : **`meeshy-production`**
3. Google Analytics : **Activer** (recommandé)
4. Créez le projet

#### (Optionnel) Projet de staging

1. Nom du projet : **`meeshy-staging`**
2. Même configuration que production
3. Utilisé pour tests pré-déploiement

---

### 2. Générer les credentials

Pour **chaque projet** :

1. Sélectionnez le projet dans Firebase Console
2. **⚙️ Paramètres du projet** → **Comptes de service**
3. Cliquez **"Générer une nouvelle clé privée"**
4. Téléchargez le fichier JSON
5. Renommez selon l'environnement :
   - Dev : `firebase-admin-dev.json`
   - Staging : `firebase-admin-staging.json`
   - Production : `firebase-admin-production.json`

---

### 3. Organiser les fichiers localement

```bash
cd /Users/smpceo/Documents/v2_meeshy

# Structure des secrets
secrets/
├── firebase-admin-dev.json          # ← Pour développement local
├── firebase-admin-staging.json      # ← Pour staging (optionnel)
├── firebase-admin-production.json   # ← Pour production
├── apns-auth-key-dev.p8            # ← APNS dev (optionnel)
└── apns-auth-key-production.p8     # ← APNS prod (optionnel)
```

**Déplacer les fichiers :**

```bash
# Dev
mv ~/Downloads/meeshy-dev-firebase-adminsdk-xxxxx.json \
   secrets/firebase-admin-dev.json

# Production
mv ~/Downloads/meeshy-production-firebase-adminsdk-xxxxx.json \
   secrets/firebase-admin-production.json
```

---

### 4. Configuration par environnement

#### A. Développement local (Docker)

**services/gateway/.env**
```bash
NODE_ENV=development
FIREBASE_ADMIN_CREDENTIALS_PATH=./secrets/firebase-admin-dev.json

# Feature flags
ENABLE_FCM_PUSH=true
ENABLE_APNS_PUSH=true
```

#### B. Développement local (sans Docker)

**services/gateway/.env**
```bash
NODE_ENV=development
FIREBASE_ADMIN_CREDENTIALS_PATH=/Users/smpceo/Documents/v2_meeshy/secrets/firebase-admin-dev.json

# Feature flags
ENABLE_FCM_PUSH=true
ENABLE_APNS_PUSH=true
```

#### C. Staging (optionnel)

**Sur serveur staging : `/opt/meeshy-staging/secrets/`**
```bash
NODE_ENV=staging
FIREBASE_ADMIN_CREDENTIALS_PATH=/opt/meeshy-staging/secrets/firebase-admin-staging.json

# Feature flags
ENABLE_FCM_PUSH=true
ENABLE_APNS_PUSH=true
```

#### D. Production

**Sur serveur production : `/opt/meeshy/secrets/production-secrets.env`**
```bash
NODE_ENV=production
FIREBASE_ADMIN_CREDENTIALS_PATH=/opt/meeshy/secrets/firebase-admin-production.json

# Feature flags
ENABLE_FCM_PUSH=true
ENABLE_APNS_PUSH=true
```

---

## 🚀 Déploiement par environnement

### Développement (local)

```bash
# Configuration automatique
./scripts/setup-firebase-local.sh --setup

# Vérification
./scripts/setup-firebase-local.sh --check

# Lancer
docker-compose -f docker-compose.local.yml up -d

# Logs
docker logs meeshy-local-gateway | grep Firebase
# ✅ [Notifications] Project ID: meeshy-dev
```

---

### Production

```bash
# 1. Préparer les secrets localement
cd secrets/
cp production-secrets.env.example production-secrets.env

# Éditer et ajouter les variables Firebase
nano production-secrets.env

# 2. Vérifier les fichiers
cd ..
./scripts/deployment/deploy-firebase-secrets.sh --check

# 3. Uploader vers serveur
./scripts/deployment/deploy-firebase-secrets.sh --upload

# 4. Redéployer
./scripts/deployment/deploy-orchestrator.sh deploy meeshy.me

# 5. Vérifier
ssh root@meeshy.me "docker logs meeshy-gateway-1 | grep Firebase"
# ✅ [Notifications] Project ID: meeshy-production
```

---

## 🧪 Vérifier quel projet est utilisé

### Via les logs

```bash
# Local
docker logs meeshy-local-gateway | grep "project_id"

# Production
ssh root@meeshy.me "docker logs meeshy-gateway-1 | grep 'project_id'"
```

### Via API Firebase

Votre code peut afficher le project_id au démarrage :

**services/gateway/src/services/notifications/NotificationService.ts**

```typescript
// Dans FirebaseStatusChecker.checkFirebase()
const credContent = fs.readFileSync(credPath, 'utf8');
const credentials = JSON.parse(credContent);

logger.info(`[Notifications] Using Firebase project: ${credentials.project_id}`);
logger.info(`[Notifications] Environment: ${process.env.NODE_ENV}`);
```

---

## 📱 Configuration Frontend par environnement

### A. Développement (apps/web/.env.local)

```bash
# Firebase Dev Project
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...dev...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-dev
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:xxxxx-dev
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxxx...dev...

NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
```

### B. Production (apps/web/.env.production)

```bash
# Firebase Production Project
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...prod...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=meeshy-production
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=987654321
NEXT_PUBLIC_FIREBASE_APP_ID=1:987654321:web:xxxxx-prod
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BNxxx...prod...

NEXT_PUBLIC_ENABLE_PUSH_NOTIFICATIONS=true
```

---

## 🔐 Bonnes pratiques de sécurité

### ✅ À FAIRE

1. **Séparation stricte** : Jamais utiliser credentials prod en dev
2. **Contrôle d'accès** : Équipes différentes pour chaque projet
3. **Rotation des clés** : Changer les credentials régulièrement
4. **Monitoring** : Alertes sur usage anormal
5. **Backup** : Sauvegarder les credentials en lieu sûr (Vault)
6. **Audit** : Logs d'accès aux credentials

### ❌ À ÉVITER

1. ❌ Utiliser même projet pour dev et prod
2. ❌ Commiter les credentials dans Git
3. ❌ Partager credentials par email/Slack
4. ❌ Laisser credentials dans code source
5. ❌ Permissions 777 sur fichiers secrets
6. ❌ Utiliser credentials prod pour tests

---

## 📊 Tableau de correspondance

| Environnement | Fichier | Project ID | Emplacement |
|---------------|---------|------------|-------------|
| **Dev Local** | `firebase-admin-dev.json` | `meeshy-dev` | `secrets/` |
| **Staging** | `firebase-admin-staging.json` | `meeshy-staging` | `/opt/meeshy-staging/secrets/` |
| **Production** | `firebase-admin-production.json` | `meeshy-production` | `/opt/meeshy/secrets/` |

---

## 🧪 Tests par environnement

### Test isolation dev/prod

**Scénario :** Vérifier qu'un message envoyé en dev n'arrive pas en prod

1. **Terminal 1 (Dev)** :
   ```bash
   docker-compose -f docker-compose.local.yml up -d
   docker logs -f meeshy-local-gateway | grep Firebase
   # → Project: meeshy-dev
   ```

2. **Terminal 2 (Prod)** :
   ```bash
   ssh root@meeshy.me "docker logs -f meeshy-gateway-1 | grep Firebase"
   # → Project: meeshy-production
   ```

3. **Action** : Envoyer message en dev

4. **Résultat** : ✅ Notification visible seulement en dev

---

## 🔄 Migration des données (si nécessaire)

Si vous avez déjà un projet Firebase unique et voulez séparer :

### Option 1 : Créer nouveau projet dev, garder l'ancien pour prod

```bash
# 1. Créer nouveau projet meeshy-dev
# 2. Télécharger credentials dev
# 3. Utiliser ancien projet comme production
# 4. Aucune migration nécessaire
```

### Option 2 : Dupliquer le projet (plus complexe)

Firebase ne permet pas de cloner directement. Alternatives :
- Exporter/importer Firestore data
- Re-créer les règles Firebase manuellement
- Reconfigurer les apps (iOS/Android/Web)

**Recommandation** : Utilisez Option 1 (plus simple)

---

## 🆘 Dépannage

### Erreur : Mauvais project_id utilisé

**Symptôme** : Logs montrent projet prod alors que vous êtes en dev

**Solution** :
```bash
# Vérifier le chemin dans .env
cat services/gateway/.env | grep FIREBASE_ADMIN_CREDENTIALS_PATH

# Vérifier le contenu du fichier
jq -r '.project_id' secrets/firebase-admin-dev.json

# Doit afficher : meeshy-dev
```

---

### Erreur : Notifications envoyées au mauvais environnement

**Symptôme** : Notification de test apparaît en prod

**Cause** : Mauvais credentials chargés

**Solution** :
```bash
# Redémarrer avec bon fichier
docker-compose down
docker-compose -f docker-compose.local.yml up -d

# Vérifier immédiatement
docker logs meeshy-local-gateway | grep "project_id"
```

---

## 📚 Ressources

- [Firebase Projects Documentation](https://firebase.google.com/docs/projects/learn-more)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
- [Notre guide local](./FIREBASE_LOCAL_SETUP.md)
- [Notre guide production](./FIREBASE_PRODUCTION_SETUP.md)

---

## ✅ Checklist finale

### Développement
- [ ] Créer projet Firebase `meeshy-dev`
- [ ] Télécharger `firebase-admin-dev.json`
- [ ] Placer dans `secrets/`
- [ ] Configurer `.env` avec chemin dev
- [ ] Vérifier project_id dans logs : `meeshy-dev`

### Production
- [ ] Créer projet Firebase `meeshy-production`
- [ ] Télécharger `firebase-admin-production.json`
- [ ] Uploader vers `/opt/meeshy/secrets/`
- [ ] Configurer `production-secrets.env`
- [ ] Vérifier project_id dans logs : `meeshy-production`

### (Optionnel) Staging
- [ ] Créer projet Firebase `meeshy-staging`
- [ ] Télécharger credentials staging
- [ ] Configurer serveur staging
- [ ] Vérifier project_id dans logs : `meeshy-staging`

---

**🎉 Environnements Firebase séparés et sécurisés ! Dev et Prod isolés.**
