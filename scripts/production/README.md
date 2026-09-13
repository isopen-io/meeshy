# 🔧 Scripts de Production Meeshy

Ce dossier contient les scripts critiques pour la gestion de la production sur DigitalOcean.

## 📋 Scripts disponibles

### 1. 🔐 `reset-production-passwords.sh`

**Objectif:** Réinitialiser tous les mots de passe en production SANS PERTE DE DONNÉES

**Usage:**
```bash
./scripts/production/reset-production-passwords.sh [DROPLET_IP]
```

**Exemple:**
```bash
./scripts/production/reset-production-passwords.sh 157.230.15.51
```

**Ce qui est réinitialisé:**
- ✅ Traefik Dashboard (admin)
- ✅ MongoDB UI (admin)
- ✅ Redis UI (admin)
- ✅ Utilisateurs application (admin, meeshy, atabeth)
- ✅ MongoDB database password
- ✅ Redis password
- ✅ JWT Secret

**Durée:** ~2-3 minutes  
**Interruption:** ~30 secondes (redémarrage des services)  
**Données:** AUCUNE perte de données MongoDB

**Documentation complète:** [docs/PASSWORD_RESET_GUIDE.md](../../docs/PASSWORD_RESET_GUIDE.md)

---

### 2. 🔍 `verify-password-reset.sh`

**Objectif:** Vérifier que tous les services fonctionnent après la réinitialisation

**Usage:**
```bash
./scripts/production/verify-password-reset.sh [DROPLET_IP]
```

**Exemple:**
```bash
./scripts/production/verify-password-reset.sh 157.230.15.51
```

**Vérifie:**
- État des conteneurs Docker
- Accessibilité de Traefik Dashboard
- Accessibilité de MongoDB UI
- Accessibilité de Redis UI
- Santé du Gateway (API)
- Santé du Translator (ML)
- Accessibilité du Frontend
- Logs récents (erreurs)

**Durée:** ~30 secondes

---

### 3. 📊 `meeshy-status.sh`

**Objectif:** Afficher l'état détaillé de tous les services en production

**Usage:**
```bash
./scripts/production/meeshy-status.sh
```

---

### 4. 📝 `meeshy-logs.sh`

**Objectif:** Consulter les logs des services

**Usage:**
```bash
./scripts/production/meeshy-logs.sh [SERVICE] [OPTIONS]
```

---

## 🚀 Procédure de réinitialisation des mots de passe

### Étape 1: Préparation

1. **Vérifier les prérequis:**
   ```bash
   # macOS
   brew install httpd
   
   # Linux
   sudo apt install apache2-utils
   ```

2. **Récupérer l'IP du serveur DigitalOcean**
   - Connectez-vous à votre compte DigitalOcean
   - Notez l'IP publique du droplet Meeshy

3. **Tester la connexion SSH:**
   ```bash
   ssh root@VOTRE_IP_DROPLET
   ```

### Étape 2: Exécution

```bash
# Naviguer vers le répertoire du projet
cd /Users/smpceo/Documents/Services/Meeshy/meeshy

# Lancer le script de réinitialisation
./scripts/production/reset-production-passwords.sh VOTRE_IP_DROPLET

# Exemple:
./scripts/production/reset-production-passwords.sh 157.230.15.51
```

**Le script va:**
1. Vérifier les prérequis (htpasswd, openssl, ssh)
2. Sauvegarder les secrets actuels
3. Générer de nouveaux mots de passe sécurisés
4. Mettre à jour le serveur
5. Redémarrer les services concernés

**Confirmation requise:** Le script demandera confirmation avant de procéder.

### Étape 3: Vérification

```bash
# Vérifier que tout fonctionne
./scripts/production/verify-password-reset.sh VOTRE_IP_DROPLET
```

### Étape 4: Tests manuels

Testez la connexion aux interfaces suivantes avec les nouveaux mots de passe (disponibles dans `secrets/clear.txt`) :

1. **Traefik Dashboard:** https://traefik.meeshy.me
   - Utilisateur: `admin`
   - Mot de passe: voir `secrets/clear.txt`

2. **MongoDB UI / Redis UI** (#3640 — plus routées par Traefik, accès tunnel SSH uniquement) :
   ```bash
   ssh -L 8081:127.0.0.1:8081 -L 8082:127.0.0.1:8082 root@meeshy.me
   ```
   Puis ouvrir `http://localhost:8081` (Mongo) / `http://localhost:8082` (Redis) en local — aucun mot de passe applicatif, l'accès SSH est le seul contrôle.

3. **Application Meeshy:** https://meeshy.me
   - Testez les 3 utilisateurs:
     - `admin` / [voir secrets/clear.txt]
     - `meeshy` / [voir secrets/clear.txt]
     - `atabeth` / [voir secrets/clear.txt]

## 📁 Fichiers générés

Après l'exécution du script, vous trouverez :

```
secrets/
├── clear.txt                           # ⚠️ MOTS DE PASSE EN CLAIR (NE PAS COMMITER!)
├── production-secrets.env              # Variables d'environnement avec hashes
├── password-reset-TIMESTAMP.log        # Journal détaillé de l'opération
└── backup-TIMESTAMP/                   # Backup des anciens secrets
    ├── production-secrets.env
    └── clear.txt
```

### ⚠️ SÉCURITÉ IMPORTANTE

- **NE JAMAIS** commiter `secrets/clear.txt` dans Git
- **NE JAMAIS** commiter `secrets/production-secrets.env` dans Git
- **TOUJOURS** conserver les mots de passe dans un gestionnaire sécurisé
- Les permissions des fichiers secrets sont automatiquement sécurisées (`600`)

## 🔒 Bonnes pratiques

1. **Rotation des mots de passe:**
   - Changer les mots de passe tous les 90 jours
   - Après un incident de sécurité
   - Après le départ d'un membre de l'équipe

2. **Backups:**
   - Les backups sont automatiquement créés dans `secrets/backup-TIMESTAMP/`
   - Conserver au moins 3 derniers backups
   - Sauvegarder dans un endroit sécurisé hors du serveur

3. **Audit:**
   - Consulter les logs: `secrets/password-reset-TIMESTAMP.log`
   - Vérifier l'accès SSH: `ssh root@IP "tail -100 /var/log/auth.log"`

4. **Tests:**
   - Toujours exécuter `verify-password-reset.sh` après réinitialisation
   - Tester TOUS les services manuellement
   - Vérifier que les données MongoDB sont intactes

## 📞 Support

En cas de problème :

1. **Consulter les logs:**
   ```bash
   cat secrets/password-reset-TIMESTAMP.log
   ```

2. **Vérifier les backups:**
   ```bash
   ls -la secrets/backup-*/
   ```

3. **Restaurer un backup si nécessaire:**
   ```bash
   cp secrets/backup-TIMESTAMP/production-secrets.env secrets/
   # Puis relancer le déploiement
   ```

4. **Consulter la documentation complète:**
   [docs/PASSWORD_RESET_GUIDE.md](../../docs/PASSWORD_RESET_GUIDE.md)

## 📚 Documentation

- **Guide complet:** [docs/PASSWORD_RESET_GUIDE.md](../../docs/PASSWORD_RESET_GUIDE.md)
- **Architecture Meeshy:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md)
- **Déploiement:** [scripts/meeshy-deploy.sh](../meeshy-deploy.sh)

---

**⚠️ ATTENTION:** Ces scripts modifient la configuration de production.  
**Toujours** tester sur un environnement de staging avant la production si possible.

**🎉 Bonne chance avec la gestion de la production !**
