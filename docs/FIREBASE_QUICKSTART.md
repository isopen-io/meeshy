# Firebase - Quick Start Guide

## 🚀 Activation Firebase en 5 minutes

### Pour le développement LOCAL

```bash
# 1. Téléchargez firebase-admin.json depuis Firebase Console
# https://console.firebase.google.com/ → Comptes de service → Générer clé

# 2. Placez le fichier dans secrets/
mv ~/Downloads/meeshy-dev-xxxxx.json secrets/firebase-admin-dev.json

# 3. Configuration automatique
./scripts/setup-firebase-local.sh --setup

# 4. Vérification
./scripts/setup-firebase-local.sh --check

# 5a. Lancer avec Docker
docker-compose -f docker-compose.local.yml up -d

# 5b. OU lancer sans Docker
cd services/gateway && npm run dev

# 6. Vérifier les logs
docker logs meeshy-local-gateway | grep Firebase
# OU si sans Docker, regarder la console

# ✅ Vous devez voir :
# [Notifications] ✅ Firebase Admin SDK initialized successfully
```

---

### Pour la PRODUCTION

```bash
# 1. Préparez les credentials localement
cd secrets/
cp production-secrets.env.example production-secrets.env
nano production-secrets.env  # Remplir les variables

# 2. Ajoutez firebase-admin.json (production)
# Téléchargez depuis Firebase Console (projet production)

# 3. (Optionnel) Ajoutez apns-auth-key.p8 pour iOS

# 4. Vérifier les fichiers locaux
../scripts/deployment/deploy-firebase-secrets.sh --check

# 5. Uploader vers le serveur
../scripts/deployment/deploy-firebase-secrets.sh --upload

# 6. Redéployer les services
../scripts/deployment/deploy-orchestrator.sh deploy meeshy.me

# 7. Vérifier sur le serveur
ssh root@meeshy.me
docker logs meeshy-gateway-1 | grep Firebase

# ✅ Vous devez voir :
# [Notifications] ✅ Firebase Admin SDK initialized successfully
```

---

## 📊 Tableau récapitulatif

| Environnement | Fichier Firebase | Chemin | Script |
|---------------|------------------|--------|--------|
| **Local** | `firebase-admin-dev.json` | `secrets/` | `setup-firebase-local.sh` |
| **Production** | `firebase-admin.json` | `/opt/meeshy/secrets/` | `deploy-firebase-secrets.sh` |

---

## 🧪 Test rapide

```bash
# Test automatique (local)
./scripts/test-firebase-local.sh

# Test manuel
# 1. Ouvrez deux navigateurs
# 2. Connectez-vous avec deux comptes
# 3. Envoyez un message
# 4. ✅ Notification instantanée dans l'app (WebSocket)
```

---

## ❓ Problèmes courants

### "Firebase credentials file not found"

```bash
# Vérifier que le fichier existe
ls -la secrets/firebase-admin-dev.json

# Relancer la configuration
./scripts/setup-firebase-local.sh --setup
```

### Firebase ne s'initialise pas

```bash
# Vérifier que le JSON est valide
cat secrets/firebase-admin-dev.json | jq .

# Doit contenir : type, project_id, private_key, client_email
```

### Les notifications ne fonctionnent pas

**C'est normal si :**
- User est **connecté** → WebSocket a la priorité (plus rapide)
- Firebase Push est utilisé **uniquement** si user déconnecté

**Pour tester Firebase Push :**
1. User ferme complètement l'app
2. Un autre user lui envoie un message
3. Notification système doit apparaître

---

## 📚 Documentation complète

- **Local :** [FIREBASE_LOCAL_SETUP.md](./FIREBASE_LOCAL_SETUP.md)
- **Production :** [FIREBASE_PRODUCTION_SETUP.md](./FIREBASE_PRODUCTION_SETUP.md)

---

## ✅ Checklist

### Local
- [ ] `firebase-admin-dev.json` dans `secrets/`
- [ ] Exécuter `setup-firebase-local.sh --setup`
- [ ] Lancer services (Docker ou npm)
- [ ] Voir "Firebase Admin SDK initialized successfully" dans logs

### Production
- [ ] `firebase-admin.json` dans `secrets/`
- [ ] `production-secrets.env` configuré
- [ ] Exécuter `deploy-firebase-secrets.sh --upload`
- [ ] Redéployer avec `deploy-orchestrator.sh`
- [ ] Vérifier logs serveur

**Firebase configuré ! Les notifications fonctionnent en local et en production 🎉**
