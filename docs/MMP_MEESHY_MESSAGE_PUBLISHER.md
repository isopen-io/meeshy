# Meeshy Message Publisher (MMP)

## Vue d'ensemble

`mmp.sh` est un script Bash unifié et sécurisé pour publier des messages sur la plateforme Meeshy. Il fusionne et améliore les fonctionnalités des anciens scripts `publish-announcement.sh` et `announcement.sh` en ajoutant une vérification robuste des permissions.

## Caractéristiques principales

### 🔐 Sécurité renforcée
- **Authentification obligatoire** : Vérification du token JWT
- **Vérification des permissions** : S'assure que l'utilisateur a le droit de publier dans la conversation ciblée
- **Validation de l'appartenance** : Pour les conversations privées/groupe, vérifie que l'utilisateur est membre

### 📝 Modes de publication flexibles
1. **Fichier POST spécifique** : `-f mon-message.txt`
2. **Fichier POST par défaut** : Utilise automatiquement le fichier `POST` du répertoire courant
3. **Message en ligne de commande** : Passe directement le message en argument

### 💾 Gestion intelligente des fichiers
- **Sauvegarde automatique** : Crée un backup horodaté avant publication (format: `post-YYYYMMDD-HHMMSS`)
- **Nettoyage optionnel** : Supprime le fichier POST après publication (peut être désactivé)
- **Support multi-lignes** : Les messages peuvent contenir des retours à la ligne

### 🎨 Interface utilisateur améliorée
- **Affichage coloré** : Sortie lisible avec des codes couleur
- **Mode verbeux** : Option `-v` pour un débogage détaillé
- **Confirmation interactive** : Demande de confirmation avant publication (peut être désactivée avec `-y`)
- **Progression par étapes** : Suivi clair du processus en 4 étapes

## Installation

Le script est déjà installé dans `/scripts/mmp.sh`. Il nécessite `jq` pour fonctionner :

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Fedora/RHEL
sudo yum install jq
```

## Utilisation

### Syntaxe de base

```bash
./scripts/mmp.sh [OPTIONS] [MESSAGE|FILE]
```

### Variables d'environnement

```bash
export MEESHY_PASSWORD="votre_mot_de_passe"      # REQUIS
export MEESHY_USERNAME="username"                # Optionnel (défaut: meeshy)
export MEESHY_API_URL="https://gate.meeshy.me"  # Optionnel (URL backend)
export MEESHY_FRONTEND_URL="https://meeshy.me"  # Optionnel (URL frontend)
export MEESHY_CONVERSATION_ID="meeshy"          # Optionnel (défaut: meeshy)
export MEESHY_LANGUAGE="en"                     # Optionnel (défaut: en)
export MEESHY_CONNECT_TIMEOUT="10"              # Optionnel (timeout connexion)
export MEESHY_MAX_TIMEOUT="30"                  # Optionnel (timeout max requête)
export MEESHY_MAX_RETRIES="3"                   # Optionnel (nombre de tentatives)
```

**Note importante**: 
- `MEESHY_API_URL` : URL du backend/API (ex: https://gate.meeshy.me)
- `MEESHY_FRONTEND_URL` : URL du frontend pour accéder aux messages publiés (ex: https://meeshy.me)

### Options disponibles

| Option | Description | Exemple |
|--------|-------------|---------|
| `-h, --help` | Afficher l'aide | `./mmp.sh --help` |
| `-f, --file FILE` | Fichier contenant le message | `./mmp.sh -f announcement.txt` |
| `-u, --username USER` | Nom d'utilisateur | `./mmp.sh -u admin` |
| `-p, --password PASS` | Mot de passe | `./mmp.sh -p "secret123"` |
| `-c, --conversation ID` | ID de conversation | `./mmp.sh -c general` |
| `-a, --api-url URL` | URL de l'API | `./mmp.sh -a https://gate.example.com` |
| `-l, --language LANG` | Langue du message | `./mmp.sh -l fr` |
| `-v, --verbose` | Mode verbeux | `./mmp.sh -v` |
| `-y, --yes` | Sauter la confirmation | `./mmp.sh -y` |
| `--no-backup` | Ne pas créer de sauvegarde | `./mmp.sh --no-backup` |
| `--no-cleanup` | Ne pas supprimer le fichier POST | `./mmp.sh --no-cleanup` |
| `--skip-permissions` | Sauter la vérification des permissions | `./mmp.sh --skip-permissions` |

## Exemples d'utilisation

### 1. Publication depuis le fichier POST par défaut

```bash
export MEESHY_PASSWORD="votre_mot_de_passe"
cd scripts
./mmp.sh
```

Le script cherchera automatiquement un fichier `POST` dans le répertoire courant.

### 2. Publication depuis un fichier spécifique

```bash
./mmp.sh -f announcement-fr.txt
```

### 3. Publication d'un message en ligne de commande

```bash
./mmp.sh "🚀 Meeshy v2.0 est maintenant disponible!"
```

### 4. Publication dans une conversation spécifique

```bash
./mmp.sh -c general-announcements -f important-update.txt
```

### 5. Publication en français

```bash
./mmp.sh -l fr -f annonce-fr.txt
```

### 6. Mode non-interactif (pour scripts automatisés)

```bash
./mmp.sh -y -f daily-digest.txt
```

### 7. Mode verbeux pour débogage

```bash
./mmp.sh -v -f test-message.txt
```

### 8. Conservation du fichier POST après publication

```bash
./mmp.sh -f important-announcement.txt --no-cleanup
```

### 9. Publication avec authentification personnalisée

```bash
./mmp.sh -u admin -p "admin_password" -c staff-only -f confidential.txt
```

### 10. Publication multi-utilisateurs

```bash
# Publier le même message dans plusieurs conversations
for conv in general announcements updates; do
    ./mmp.sh -y -c "$conv" -f global-update.txt --no-cleanup
done
```

## Processus de publication (4 étapes)

### Étape 1 : Authentification
- Connexion au gateway Meeshy
- Récupération du token JWT
- Validation de l'identité de l'utilisateur

### Étape 2 : Vérification des permissions
- Récupération des informations de la conversation
- Vérification du type de conversation (global, public, private, group)
- Validation de l'appartenance de l'utilisateur (si applicable)
- Vérification des droits de publication

### Étape 3 : Envoi du message
- Échappement JSON du contenu
- Publication via l'API REST
- Validation de la réponse

### Étape 4 : Nettoyage
- Suppression du fichier POST (si demandé)
- Affichage du résumé de publication

## Vérification des permissions

Le script vérifie automatiquement que :

1. **L'utilisateur est authentifié** : Token JWT valide
2. **La conversation existe** : Retourne une erreur 404 si non trouvée
3. **L'utilisateur a accès** : Retourne une erreur 403 si accès refusé
4. **L'utilisateur est membre** : Pour les conversations privées/groupe
5. **Le type de conversation permet la publication** :
   - `global` : Tous les utilisateurs authentifiés peuvent publier
   - `public` : Tous les utilisateurs authentifiés peuvent publier
   - `group` : Seuls les membres peuvent publier
   - `direct` : Seuls les participants peuvent publier

### Bypass de la vérification des permissions

**⚠️ Non recommandé** : Vous pouvez sauter la vérification avec `--skip-permissions`

```bash
./mmp.sh --skip-permissions -f message.txt
```

## Gestion des erreurs

Le script gère les erreurs suivantes :

| Erreur | Code HTTP | Message |
|--------|-----------|---------|
| Authentification échouée | 401 | "Échec de l'authentification" |
| Token invalide | - | "Token d'authentification non reçu" |
| Conversation inexistante | 404 | "Conversation non trouvée" |
| Accès refusé | 403 | "Accès refusé à la conversation" |
| Non-membre | - | "Vous n'êtes pas membre de cette conversation" |
| Envoi échoué | 4xx/5xx | "Échec de l'envoi du message" |
| Fichier vide | - | "Le fichier est vide" |
| Fichier inexistant | - | "Fichier introuvable" |

Toutes les erreurs incluent un message clair et, en mode verbeux, affichent la réponse complète de l'API.

## Format des fichiers POST

Les fichiers POST peuvent contenir du texte multi-lignes, des emojis, et des caractères spéciaux :

```text
🎉 Meeshy v2.0 est disponible!

Nouvelles fonctionnalités:
- Traduction en temps réel améliorée
- Interface utilisateur redessinée
- Support de 100+ langues

Essayez-le maintenant sur https://meeshy.me
```

## Sauvegarde automatique

Chaque publication depuis un fichier crée automatiquement une sauvegarde :

```bash
# Avant publication
POST

# Après publication
post-20251018-143025  # Sauvegarde horodatée
# POST est supprimé (sauf si --no-cleanup)
```

Format : `post-YYYYMMDD-HHMMSS`

## Intégration dans des scripts

### Exemple : Publication quotidienne automatisée

```bash
#!/bin/bash

# Créer le digest quotidien
./generate-daily-digest.sh > daily-post.txt

# Publier avec MMP
export MEESHY_PASSWORD="$(cat /secure/meeshy-password.txt)"
./scripts/mmp.sh -y -c daily-digest -f daily-post.txt

# Nettoyer
rm daily-post.txt
```

### Exemple : Publication multi-langues

```bash
#!/bin/bash

# Messages en différentes langues
declare -A messages=(
    ["en"]="Welcome to Meeshy!"
    ["fr"]="Bienvenue sur Meeshy!"
    ["es"]="¡Bienvenido a Meeshy!"
)

for lang in "${!messages[@]}"; do
    echo "${messages[$lang]}" > "post-${lang}.txt"
    ./scripts/mmp.sh -y -l "$lang" -f "post-${lang}.txt"
    rm "post-${lang}.txt"
done
```

## Codes de sortie

| Code | Signification |
|------|---------------|
| 0 | Publication réussie |
| 1 | Erreur (voir les logs pour détails) |

## Sécurité

### Meilleures pratiques

1. **Ne pas stocker le mot de passe en clair dans les scripts**
   ```bash
   # ❌ Mauvais
   export MEESHY_PASSWORD="password123"
   
   # ✅ Bon
   export MEESHY_PASSWORD="$(cat ~/.meeshy/password)"
   # ou
   read -sp "Mot de passe Meeshy: " MEESHY_PASSWORD
   export MEESHY_PASSWORD
   ```

2. **Utiliser des variables d'environnement sécurisées**
   ```bash
   # Dans ~/.zshrc ou ~/.bashrc (avec permissions 600)
   export MEESHY_PASSWORD="votre_mot_de_passe"
   ```

3. **Utiliser des gestionnaires de secrets pour la production**
   ```bash
   export MEESHY_PASSWORD="$(aws secretsmanager get-secret-value --secret-id meeshy-bot-password --query SecretString --output text)"
   ```

4. **Limiter les permissions du fichier de configuration**
   ```bash
   chmod 600 ~/.meeshy/config
   ```

## Dépannage

### Le script ne trouve pas `jq`

```bash
# Vérifier l'installation
which jq

# Si absent, installer
brew install jq  # macOS
```

### Erreur "Conversation non trouvée"

- Vérifier que l'ID de conversation est correct
- Vérifier que la conversation existe bien
- Utiliser `-v` pour voir la réponse complète de l'API

### Erreur "Accès refusé"

- Vérifier que vous êtes membre de la conversation
- Vérifier que votre compte a les permissions nécessaires
- Utiliser `--skip-permissions` uniquement pour tester (non recommandé en production)

### Mode verbeux ne fonctionne pas

```bash
# S'assurer d'utiliser -v avant les autres options
./mmp.sh -v -f message.txt
```

## Comparaison avec les anciens scripts

| Fonctionnalité | announcement.sh | publish-announcement.sh | mmp.sh |
|----------------|-----------------|-------------------------|---------|
| Publication de messages | ✅ | ✅ | ✅ |
| Vérification des permissions | ❌ | ❌ | ✅ |
| Support multi-conversations | ✅ | ❌ | ✅ |
| Mode non-interactif | ✅ | ❌ | ✅ |
| Interface utilisateur améliorée | ❌ | ✅ | ✅ |
| Gestion des erreurs détaillée | ⚠️ | ⚠️ | ✅ |
| Mode verbeux complet | ⚠️ | ⚠️ | ✅ |
| Sauvegarde automatique | ✅ | ✅ | ✅ |
| Nettoyage configurable | ✅ | ❌ | ✅ |

## Migration depuis les anciens scripts

### Depuis `announcement.sh`

```bash
# Avant
./announcement.sh -f POST -u meeshy -p password -c meeshy

# Maintenant
./mmp.sh -f POST -u meeshy -p password -c meeshy
```

### Depuis `publish-announcement.sh`

```bash
# Avant
export MEESHY_PASSWORD="password"
./publish-announcement.sh fr

# Maintenant
export MEESHY_PASSWORD="password"
./mmp.sh -l fr -f POST-fr
```

## Support et contribution

- **Issues** : Rapporter les bugs sur le dépôt Git
- **Documentation** : Contribuer à améliorer cette documentation
- **Suggestions** : Proposer de nouvelles fonctionnalités

## Licence

Ce script fait partie du projet Meeshy. Voir le fichier LICENSE à la racine du projet.

---

**Meeshy - Brisons les barrières linguistiques** 🌍

