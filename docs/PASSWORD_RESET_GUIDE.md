# 🔐 GUIDE DE RÉINITIALISATION DES MOTS DE PASSE EN PRODUCTION

## 📋 Vue d'ensemble

Ce document décrit la procédure de réinitialisation des mots de passe en production sur DigitalOcean **SANS PERTE DE DONNÉES**.

**Date de création:** $(date +"%Y-%m-%d")  
**Version:** 1.0.0  
**Auteur:** Meeshy DevOps Team

---

## 🎯 Objectif

Réinitialiser tous les mots de passe de l'infrastructure Meeshy en production :

1. ✅ **Traefik Dashboard** - Interface d'administration du reverse proxy
2. ✅ **MongoDB UI (NoSQLClient)** - Interface de gestion MongoDB
3. ✅ **Redis UI (P3X)** - Interface de gestion Redis
4. ✅ **Utilisateurs application** - admin, meeshy, atabeth
5. ✅ **Services backend** - MongoDB database password, Redis password

⚠️ **IMPORTANT:** Cette procédure ne supprime AUCUNE donnée de la base de données MongoDB.

---

## 🛠️ Prérequis

### Sur votre machine locale

Avant de lancer le script, assurez-vous d'avoir :

1. **htpasswd** installé (pour générer les hashes bcrypt)
   ```bash
   # macOS
   brew install httpd
   
   # Linux (Ubuntu/Debian)
   sudo apt install apache2-utils
   
   # Vérification
   htpasswd -V
   ```

2. **openssl** installé (normalement déjà présent)
   ```bash
   openssl version
   ```

3. **ssh** configuré avec accès au serveur DigitalOcean
   ```bash
   # Tester la connexion
   ssh root@VOTRE_IP_DROPLET "echo 'OK'"
   ```

4. **Accès en écriture** au dossier `secrets/`
   ```bash
   ls -la secrets/
   ```

---

## 🚀 Procédure d'exécution

### Étape 1: Préparation

1. **Naviguer vers le répertoire du projet**
   ```bash
   cd /Users/smpceo/Documents/Services/Meeshy/meeshy
   ```

2. **Vérifier l'IP du serveur DigitalOcean**
   ```bash
   # Récupérer l'IP depuis votre tableau de bord DigitalOcean
   # Exemple: 157.230.15.51
   ```

3. **Tester la connexion SSH**
   ```bash
   ssh root@VOTRE_IP_DROPLET
   # Ctrl+D pour quitter après vérification
   ```

### Étape 2: Lancer le script

```bash
./scripts/production/reset-production-passwords.sh VOTRE_IP_DROPLET
```

**Exemple concret:**
```bash
./scripts/production/reset-production-passwords.sh 157.230.15.51
```

### Étape 3: Suivre les étapes du script

Le script va automatiquement :

1. ✅ **Vérifier les prérequis** (htpasswd, openssl, ssh)
2. ✅ **Sauvegarder les secrets actuels** dans `secrets/backup-TIMESTAMP/`
3. ✅ **Générer de nouveaux mots de passe sécurisés**
4. ✅ **Sauvegarder les nouveaux secrets localement**
5. ✅ **Tester la connexion SSH au serveur**
6. ✅ **Mettre à jour les variables d'environnement** sur le serveur
7. ✅ **Mettre à jour les mots de passe utilisateurs** dans MongoDB
8. ✅ **Redémarrer les services** concernés (Traefik, Gateway, MongoDB UI, Redis UI)

**Confirmation requise:** Le script demandera confirmation avant de procéder.

---

## 📊 Détails techniques

### Mots de passe générés

| Service | Utilisateur | Longueur | Type |
|---------|-------------|----------|------|
| Application Admin | admin | 20 caractères | Alphanumeric secure |
| Application Meeshy | meeshy | 20 caractères | Alphanumeric secure |
| Application Atabeth | atabeth | 20 caractères | Alphanumeric secure |
| Traefik Dashboard | admin | 20 caractères | Bcrypt hash |
| MongoDB UI | admin | 20 caractères | Bcrypt hash |
| Redis UI | admin | 20 caractères | Bcrypt hash |
| MongoDB Service | meeshy | 24 caractères | Alphanumeric secure |
| Redis Service | - | 20 caractères | Alphanumeric secure |
| JWT Secret | - | 64 caractères | Base64 secure |

### Algorithmes utilisés

- **Génération de mots de passe:** `openssl rand -base64`
- **Hashing bcrypt:** `htpasswd -nbB` (coût factor: 5)
- **Hashing MongoDB users:** `bcryptjs` avec cost factor 10

### Services redémarrés

Le script redémarre les services suivants (interruption brève ~30 secondes) :

1. **traefik** - Reverse proxy (nouveaux hashes d'authentification)
2. **nosqlclient** - MongoDB UI (nouvelle authentification)
3. **p3x-redis-ui** - Redis UI (nouvelle authentification)
4. **gateway** - Backend (nouveau JWT_SECRET et mots de passe utilisateurs)

⚠️ **Services NON redémarrés** (aucun impact) :
- database (MongoDB)
- redis
- translator
- frontend

---

## 📁 Fichiers générés

### 1. `secrets/clear.txt`

**Contenu:** Tous les mots de passe en clair avec instructions d'utilisation  
**Permissions:** `600` (lecture/écriture propriétaire uniquement)  
**⚠️ CRITIQUE:** Ne JAMAIS commiter ce fichier dans Git

```bash
# Localisation
/Users/smpceo/Documents/Services/Meeshy/meeshy/secrets/clear.txt

# Contenu (exemple — valeurs FICTIVES, à générer via `openssl rand -base64 20`)
ADMIN_PASSWORD_CLEAR="<mot-de-passe-admin-genere>"
MEESHY_PASSWORD_CLEAR="<mot-de-passe-meeshy-genere>"
TRAEFIK_PASSWORD_CLEAR="<mot-de-passe-traefik-genere>"
...
```

### 2. `secrets/production-secrets.env`

**Contenu:** Variables d'environnement avec hashes bcrypt  
**Permissions:** `600`  
**Usage:** Source pour déploiement

```bash
# Localisation
/Users/smpceo/Documents/Services/Meeshy/meeshy/secrets/production-secrets.env

# Contenu (exemple — valeurs FICTIVES, à générer via `openssl rand -hex 32`)
JWT_SECRET="<secret-64-caracteres-hex-genere>"
ADMIN_PASSWORD="<mot-de-passe-admin-genere>"
TRAEFIK_USERS="admin:<hash-bcrypt-genere-par-htpasswd>"
...
```

### 3. `secrets/backup-TIMESTAMP/`

**Contenu:** Backup des secrets précédents  
**Permissions:** `700` (répertoire)  
**Utilité:** Restauration en cas de problème

```bash
# Exemple de localisation
/Users/smpceo/Documents/Services/Meeshy/meeshy/secrets/backup-20250915-143022/
├── production-secrets.env
└── clear.txt
```

### 4. `secrets/password-reset-TIMESTAMP.log`

**Contenu:** Journal détaillé de toutes les opérations  
**Permissions:** `600`  
**Utilité:** Audit et troubleshooting

```bash
# Exemple
[2025-09-15 14:30:22] INFO: Début de l'opération
[2025-09-15 14:30:23] SUCCESS: htpasswd est installé
[2025-09-15 14:30:24] SUCCESS: Backup créé dans: secrets/backup-20250915-143022
...
```

---

## 🔍 Vérifications post-déploiement

### 1. Vérifier l'état des services

```bash
ssh root@VOTRE_IP_DROPLET "cd /opt/meeshy && docker-compose ps"
```

**Résultat attendu:** Tous les services doivent être `Up` et `healthy`

### 2. Tester Traefik Dashboard

```bash
# Ouvrir dans le navigateur
https://traefik.meeshy.me

# Identifiants
Utilisateur: admin
Mot de passe: [VOIR secrets/clear.txt]
```

### 3. Tester MongoDB UI / Redis UI

Plus routées par Traefik (#3640) — accès par tunnel SSH uniquement, aucun
mot de passe applicatif :

```bash
ssh -L 8081:127.0.0.1:8081 -L 8082:127.0.0.1:8082 root@meeshy.me
# puis, en local :
# http://localhost:8081 (Mongo) / http://localhost:8082 (Redis)
```

### 4. Tester l'application Meeshy

```bash
# Ouvrir dans le navigateur
https://meeshy.me

# Tester avec les 3 utilisateurs
1. admin / [VOIR secrets/clear.txt]
2. meeshy / [VOIR secrets/clear.txt]
3. atabeth / [VOIR secrets/clear.txt]
```

### 5. Vérifier les logs

```bash
# Logs Gateway (gestion des utilisateurs)
ssh root@VOTRE_IP_DROPLET "cd /opt/meeshy && docker-compose logs --tail=50 gateway"

# Logs Traefik
ssh root@VOTRE_IP_DROPLET "cd /opt/meeshy && docker-compose logs --tail=50 traefik"
```

---

## ❌ Troubleshooting

### Problème 1: htpasswd non trouvé

**Symptôme:**
```
❌ htpasswd n'est pas installé
```

**Solution:**
```bash
# macOS
brew install httpd

# Linux
sudo apt install apache2-utils
```

### Problème 2: Connexion SSH échoue

**Symptôme:**
```
❌ Impossible de se connecter au serveur
```

**Solutions:**
1. Vérifier l'IP du serveur
2. Vérifier la clé SSH
3. Vérifier le firewall

```bash
# Test manuel
ssh -v root@VOTRE_IP_DROPLET

# Vérifier la clé SSH
ssh-add -l
```

### Problème 3: Services ne redémarrent pas

**Symptôme:**
```
Error response from daemon: container not found
```

**Solution:**
```bash
# Se connecter au serveur
ssh root@VOTRE_IP_DROPLET

# Vérifier l'état
cd /opt/meeshy
docker-compose ps

# Redémarrer manuellement
docker-compose restart traefik gateway nosqlclient p3x-redis-ui
```

### Problème 4: Mot de passe MongoDB non mis à jour

**Symptôme:**
L'authentification échoue avec les nouveaux mots de passe dans l'application.

**Solution:**
```bash
# Se connecter au serveur
ssh root@VOTRE_IP_DROPLET

# Accéder au conteneur Gateway
docker exec -it meeshy-gateway sh

# Vérifier la connexion MongoDB
node -e "
const { MongoClient } = require('mongodb');
MongoClient.connect('mongodb://meeshy-database:27017/meeshy?replicaSet=rs0')
  .then(() => console.log('OK'))
  .catch(err => console.error(err));
"

# Relancer le script de mise à jour des mots de passe si nécessaire
```

### Problème 5: Backup perdu

**Solution:**
Les backups sont dans `secrets/backup-TIMESTAMP/`. Si vous avez besoin de restaurer :

```bash
# Lister les backups disponibles
ls -la secrets/backup-*/

# Restaurer un backup
cp secrets/backup-20250915-143022/production-secrets.env secrets/
cp secrets/backup-20250915-143022/clear.txt secrets/

# Redéployer avec les anciens secrets
./scripts/production/reset-production-passwords.sh VOTRE_IP_DROPLET
```

---

## 🔒 Sécurité

### Bonnes pratiques

1. **Ne JAMAIS commiter les fichiers secrets**
   ```bash
   # Vérifier .gitignore
   cat .gitignore | grep secrets
   
   # Doit contenir:
   secrets/
   *.env
   clear.txt
   ```

2. **Conserver les mots de passe dans un gestionnaire sécurisé**
   - 1Password
   - LastPass
   - Bitwarden
   - etc.

3. **Limiter l'accès au fichier clear.txt**
   ```bash
   # Vérifier les permissions
   ls -la secrets/clear.txt
   # Doit afficher: -rw------- (600)
   ```

4. **Changer les mots de passe régulièrement**
   - Recommandé: tous les 90 jours
   - Après un incident de sécurité
   - Après le départ d'un membre de l'équipe

5. **Utiliser SSH avec clé uniquement**
   ```bash
   # Désactiver l'authentification par mot de passe SSH
   ssh root@VOTRE_IP_DROPLET
   sudo nano /etc/ssh/sshd_config
   # PasswordAuthentication no
   sudo systemctl restart sshd
   ```

### Audit de sécurité

```bash
# Vérifier les permissions des fichiers secrets
find secrets/ -type f -exec ls -la {} \;

# Vérifier que les secrets ne sont pas dans Git
git status | grep secrets

# Vérifier les logs d'accès SSH
ssh root@VOTRE_IP_DROPLET "tail -100 /var/log/auth.log"
```

---

## 📋 Checklist post-réinitialisation

- [ ] Script exécuté sans erreur
- [ ] Backup créé dans `secrets/backup-TIMESTAMP/`
- [ ] Fichier `clear.txt` créé avec nouveaux mots de passe
- [ ] Fichier `production-secrets.env` mis à jour
- [ ] Connexion SSH au serveur réussie
- [ ] Variables d'environnement mises à jour sur le serveur
- [ ] Mots de passe MongoDB mis à jour
- [ ] Services redémarrés (Traefik, Gateway, MongoDB UI, Redis UI)
- [ ] Traefik Dashboard accessible avec nouveau mot de passe
- [ ] MongoDB UI accessible avec nouveau mot de passe
- [ ] Redis UI accessible avec nouveau mot de passe
- [ ] Application Meeshy accessible avec nouveaux mots de passe
- [ ] Connexion testée pour les 3 utilisateurs (admin, meeshy, atabeth)
- [ ] Données MongoDB vérifiées (aucune perte)
- [ ] Logs vérifiés (pas d'erreurs)
- [ ] Mots de passe sauvegardés dans gestionnaire sécurisé
- [ ] Fichiers secrets NON commités dans Git
- [ ] Documentation mise à jour si nécessaire

---

## 📞 Support

En cas de problème, contacter :

- **DevOps Lead:** support@meeshy.me
- **Documentation:** [GitHub Issues](https://github.com/jcnm/meeshy/issues)
- **Logs:** `secrets/password-reset-TIMESTAMP.log`

---

## 📝 Historique des versions

| Version | Date | Changements |
|---------|------|-------------|
| 1.0.0 | 2025-09-15 | Version initiale du guide |

---

## 📚 Références

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [MongoDB Security](https://docs.mongodb.com/manual/security/)
- [bcrypt Best Practices](https://github.com/kelektiv/node.bcrypt.js#readme)
- [OWASP Password Guidelines](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

**🎉 Fin du guide - Bonne chance avec la réinitialisation des mots de passe !**
