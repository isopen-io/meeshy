# 🔥 Firebase - Guide de Configuration Complet

Système de notifications hybride : **WebSocket (prioritaire)** + **Firebase Push (fallback)**

---

## 📁 Fichiers créés

### Scripts
- `scripts/setup-firebase-local.sh` - Configuration automatique en local
- `scripts/test-firebase-local.sh` - Tests automatiques
- `scripts/deployment/deploy-firebase-secrets.sh` - Upload vers production

### Documentation
- `docs/FIREBASE_QUICKSTART.md` - Guide rapide (5 min)
- `docs/FIREBASE_LOCAL_SETUP.md` - Configuration locale détaillée
- `docs/FIREBASE_PRODUCTION_SETUP.md` - Configuration production détaillée

### Configuration
- `secrets/.gitignore` - Protection des secrets
- `secrets/README.md` - Documentation du répertoire
- `secrets/production-secrets.env.example` - Template production

---

## 🚀 Démarrage Rapide

### 1️⃣ Configuration LOCAL (développement)

```bash
# IMPORTANT : Créez un projet Firebase SÉPARÉ pour le développement
# https://console.firebase.google.com/ → "Ajouter un projet" → Nom: "meeshy-dev"

# Télécharger firebase-admin.json depuis ce projet dev
# Paramètres projet → Comptes de service → Générer clé

# Renommer et placer
mv ~/Downloads/meeshy-dev-xxxxx.json secrets/firebase-admin-dev.json

# Configuration automatique
./scripts/setup-firebase-local.sh --setup

# Test
./scripts/test-firebase-local.sh

# Lancer avec Docker
docker-compose -f docker-compose.local.yml up -d

# OU sans Docker
cd services/gateway && npm run dev
```

### 2️⃣ Configuration PRODUCTION

```bash
# Préparer les secrets
cd secrets/
cp production-secrets.env.example production-secrets.env
nano production-secrets.env  # Compléter les variables

# Ajouter firebase-admin.json (production)
# Télécharger depuis Firebase Console (projet prod)

# Vérifier
../scripts/deployment/deploy-firebase-secrets.sh --check

# Uploader
../scripts/deployment/deploy-firebase-secrets.sh --upload

# Redéployer
../scripts/deployment/deploy-orchestrator.sh deploy meeshy.me
```

---

## 📊 Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Système de Notifications Hybride                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  1️⃣ WebSocket (Socket.IO) - PRIORITAIRE                 │
│     • User connecté → Notification temps réel ✅          │
│     • Fonctionne AVEC ou SANS Firebase                   │
│                                                           │
│  2️⃣ Firebase Cloud Messaging - FALLBACK                  │
│     • User déconnecté → Push système ✅                   │
│     • Si absent → Notification en DB                     │
│                                                           │
│  3️⃣ @parse/node-apn - iOS VoIP                           │
│     • Appels iOS même si app fermée ✅                    │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ Vérification

### Logs à surveiller

**✅ Firebase activé :**
```
[Notifications] ✅ Firebase Admin SDK initialized successfully
[Notifications] → Push notifications ENABLED (WebSocket + Firebase)
```

**ℹ️ Firebase désactivé (OK) :**
```
[Notifications] Firebase Admin SDK not installed
[Notifications] → Push notifications DISABLED (WebSocket only)
```

### Commandes de vérification

```bash
# Local (Docker)
docker logs meeshy-local-gateway | grep Firebase

# Local (sans Docker)
# Regarder la console du npm run dev

# Production
ssh root@meeshy.me "docker logs meeshy-gateway-1 | grep Firebase"
```

---

## 🧪 Tests

### Test WebSocket (toujours actif)
1. Ouvrir deux navigateurs
2. Connecter deux comptes différents
3. Envoyer un message
4. ✅ Notification instantanée

### Test Firebase Push (user déconnecté)
1. Ouvrir frontend, accepter permissions
2. Fermer l'onglet (navigateur ouvert)
3. Envoyer message à ce compte
4. ✅ Notification système apparaît

---

## 🔐 Sécurité

### ✅ Protection appliquée
- Fichiers secrets dans `.gitignore`
- Permissions 600 sur serveur
- Séparation dev/prod
- Fallback gracieux si Firebase absent

### ⚠️ À ne PAS faire
- ❌ Commiter `firebase-admin.json`
- ❌ Partager les clés publiquement
- ❌ Utiliser mêmes credentials dev/prod
- ❌ Permissions 777 sur fichiers secrets

---

## 📚 Documentation

| Guide | Usage |
|-------|-------|
| [FIREBASE_QUICKSTART.md](docs/FIREBASE_QUICKSTART.md) | Démarrage en 5 min |
| [FIREBASE_MULTI_ENVIRONMENT.md](docs/FIREBASE_MULTI_ENVIRONMENT.md) | ✨ **Projets séparés dev/prod** |
| [FIREBASE_LOCAL_SETUP.md](docs/FIREBASE_LOCAL_SETUP.md) | Configuration locale complète |
| [FIREBASE_PRODUCTION_SETUP.md](docs/FIREBASE_PRODUCTION_SETUP.md) | Configuration production complète |

---

## 🆘 Support

### Scripts d'aide

```bash
# Vérifier la configuration
./scripts/setup-firebase-local.sh --check

# Configuration automatique
./scripts/setup-firebase-local.sh --setup

# Tester Firebase
./scripts/test-firebase-local.sh

# Upload production
./scripts/deployment/deploy-firebase-secrets.sh --upload
```

### Problèmes courants

Consultez la section **Dépannage** de :
- [Local](docs/FIREBASE_LOCAL_SETUP.md#dépannage)
- [Production](docs/FIREBASE_PRODUCTION_SETUP.md#dépannage)

---

## ✅ Checklist finale

### Développement LOCAL
- [ ] Télécharger `firebase-admin-dev.json`
- [ ] Placer dans `secrets/`
- [ ] Exécuter `./scripts/setup-firebase-local.sh --setup`
- [ ] Vérifier avec `./scripts/test-firebase-local.sh`
- [ ] Lancer services (Docker ou npm)
- [ ] Chercher "Firebase Admin SDK initialized" dans logs

### Production
- [ ] Configurer `secrets/production-secrets.env`
- [ ] Ajouter `firebase-admin.json` (production)
- [ ] Exécuter `./scripts/deployment/deploy-firebase-secrets.sh --upload`
- [ ] Redéployer avec `deploy-orchestrator.sh`
- [ ] Vérifier logs serveur

---

**🎉 Firebase configuré ! Système de notifications complet (WebSocket + Push) actif.**
