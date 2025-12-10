# Meeshy Scripts Collection

Ce dossier contient les scripts utilitaires et outils CLI pour la plateforme Meeshy.

## 🎯 Outils CLI Principaux

### 📤 MMP (Meeshy Message Publisher) v1.0.1
Script de publication de messages vers la plateforme Meeshy.

**Fichier**: `mmp.sh`

**Utilisation**:
```bash
# Publier depuis le fichier POST par défaut
export MEESHY_PASSWORD="your_password"
./mmp.sh

# Publier un fichier spécifique
./mmp.sh -f announcement.txt

# Publier un message en ligne
./mmp.sh "Hello Meeshy!"

# Publier vers une conversation spécifique
./mmp.sh -c tech-team -f update.txt
```

**Documentation complète**: [README_MMP.md](./README_MMP.md) (à créer si besoin)

### 📥 MMR (Meeshy Message Receiver) v1.0.0
Script de récupération et affichage de messages depuis la plateforme Meeshy.

**Fichier**: `mmr.sh`

**Utilisation**:
```bash
# Récupérer les 50 derniers messages
export MEESHY_PASSWORD="your_password"
./mmr.sh

# Récupérer 200 messages
./mmr.sh -n 200

# Récupérer les messages des 2 dernières heures
./mmr.sh -t 2h

# Récupérer les messages des 3 derniers jours
./mmr.sh -t 3d

# Format JSON pour traitement
./mmr.sh -n 100 -f json | jq '.[] | .content'

# Format compact pour monitoring
./mmr.sh -t 30m -f compact

# Affichage complet avec traductions
./mmr.sh -n 20 --show-translations --show-metadata
```

**Formats disponibles**:
- `pretty` (défaut) - Affichage formaté avec couleurs
- `json` - JSON brut pour traitement
- `compact` - Une ligne par message
- `raw` - Contenu uniquement
- `ai` - **Format optimisé pour agents IA/RAG** (données structurées et propres)

**Filtres temporels** (avec filtrage client-side précis):
- Minutes: `10m`, `30min`, `45minutes`
- Heures: `2h`, `5hour`, `12hours`
- Jours: `1d`, `7day`, `14days`
- Semaines: `1w`, `2week`, `4weeks`
- Mois: `1M`, `2month`, `6months`

**🤖 Spécial Agent IA**: Le format `ai` est conçu spécifiquement pour:
- Ingestion RAG et construction de contexte
- Agents conversationnels automatisés
- Analyse de conversation multi-langue
- Intégration LLM/Chatbot
- Voir [MMR_AI_FORMAT.md](./MMR_AI_FORMAT.md) pour documentation complète

**Documentation complète**: [README_MMR.md](./README_MMR.md)

### 📚 Guide Complet MMP & MMR
Comparaison détaillée, cas d'usage et intégrations: [MMP_MMR_GUIDE.md](./MMP_MMR_GUIDE.md)

## 📋 Scripts de Migration et Maintenance MongoDB

### 1. `fix-null-identifiers.js`
**Objectif**: Corriger les champs `identifier` null dans les collections qui nécessitent des identifiers uniques.

**Utilisation**:
```bash
node scripts/fix-null-identifiers.js
```

**Collections concernées**:
- `Conversation` → Génère des identifiers au format `conv_<timestamp>_<random>_<index>`
- `ConversationShareLink` → Génère des identifiers au format `share_<timestamp>_<random>_<index>`
- `Community` → Génère des identifiers au format `comm_<timestamp>_<random>_<index>`

**Quand l'utiliser**:
- Avant d'appliquer `prisma db push` pour la première fois
- Quand l'erreur `E11000 duplicate key error` apparaît pour `identifier: null`

### 2. `cleanup-message-status.mongodb.js`
**Objectif**: Supprimer les doublons dans la collection `message_status`.

**Utilisation**:
```bash
mongosh mongodb://localhost:27017/meeshy --quiet scripts/cleanup-message-status.mongodb.js
```

**Logique**:
- Trouve tous les doublons basés sur `messageId` + `userId`
- Garde le document le plus récent (`createdAt`)
- Supprime tous les autres

**Quand l'utiliser**:
- Avant d'appliquer `prisma db push` pour la première fois
- Quand l'erreur `E11000 duplicate key error` apparaît pour `message_status_messageId_userId_key`

### 3. `cleanup-user-stats.mongodb.js`
**Objectif**: Supprimer les doublons dans la collection `UserStats`.

**Utilisation**:
```bash
mongosh mongodb://localhost:27017/meeshy --quiet scripts/cleanup-user-stats.mongodb.js
```

**Logique**:
- Trouve tous les doublons basés sur `userId`
- Garde le document le plus récent (`createdAt`)
- Supprime tous les autres

**Quand l'utiliser**:
- Avant d'appliquer `prisma db push` pour la première fois
- Quand l'erreur `E11000 duplicate key error` apparaît pour `UserStats_userId_key`

### 4. `fix-message-status-duplicates.js`
**Objectif**: Version Node.js du script de nettoyage message_status (utilise mongosh en interne).

**Utilisation**:
```bash
node scripts/fix-message-status-duplicates.js
```

## 🔄 Workflow de Migration Complet

Lorsque vous rencontrez des erreurs d'index lors de `prisma db push`, suivez ces étapes :

### Étape 1: Identifier l'erreur
```bash
cd gateway
pnpm prisma db push --schema=shared/prisma/schema.prisma
```

### Étape 2: Appliquer les corrections nécessaires

**Pour les identifiers null**:
```bash
node scripts/fix-null-identifiers.js
```

**Pour les doublons message_status**:
```bash
mongosh mongodb://localhost:27017/meeshy --quiet scripts/cleanup-message-status.mongodb.js
```

**Pour les doublons UserStats**:
```bash
mongosh mongodb://localhost:27017/meeshy --quiet scripts/cleanup-user-stats.mongodb.js
```

### Étape 3: Réappliquer Prisma
```bash
cd gateway
pnpm prisma db push --schema=shared/prisma/schema.prisma
```

## 📊 Exemple de Sortie

### fix-null-identifiers.js
```
✅ Connexion à MongoDB via mongosh...

🔍 Vérification de la collection Conversation...
   Trouvé 8 documents avec identifier: null
✅ 68bd4e495adf599956567f7a: conv_mgr6r7a6_qm1ue_0
✅ 68bd6afa4f77c3f8d94b4e0e: conv_mgr6r7ct_o4vqk_1
   ✅ Documents mis à jour dans Conversation

🔍 Vérification de la collection ConversationShareLink...
   Trouvé 66 documents avec identifier: null
   ✅ Documents mis à jour dans ConversationShareLink

✅ Migration terminée
```

### cleanup-message-status.mongodb.js
```
🔍 Trouvé 163 groupes de doublons

🗑️  Supprimé doublon: 68c28b3feaf65f7e0b866378
🗑️  Supprimé doublon: 68c292d12b071c5be5c501eb
...

✅ 273 doublons supprimés
```

## ⚠️ Précautions

1. **Backup**: Toujours faire un backup de la base de données avant d'exécuter ces scripts
2. **Environnement**: Ces scripts sont conçus pour l'environnement de développement
3. **Production**: Sur production, vérifier manuellement les données avant suppression
4. **DATABASE_URL**: Les scripts utilisent `process.env.DATABASE_URL` ou `mongodb://localhost:27017/meeshy` par défaut

## 🔧 Configuration

Les scripts utilisent la variable d'environnement `DATABASE_URL` pour se connecter à MongoDB.

**Exemple**:
```bash
export DATABASE_URL="mongodb://localhost:27017/meeshy"
node scripts/fix-null-identifiers.js
```

Ou directement dans la commande :
```bash
DATABASE_URL="mongodb://user:pass@host:27017/db" node scripts/fix-null-identifiers.js
```

## 📝 Notes Importantes

- Ces scripts sont **idempotents** : ils peuvent être exécutés plusieurs fois sans danger
- Les identifiers générés sont **uniques** grâce au timestamp + random
- Les doublons sont identifiés par **date de création** (le plus récent est gardé)
- Tous les scripts affichent des **logs détaillés** de leurs actions

## 🐛 Debugging

Si un script échoue, vérifier :

1. **MongoDB est démarré**: `mongosh mongodb://localhost:27017/meeshy --eval "db.stats()"`
2. **Permissions**: L'utilisateur MongoDB a les droits d'écriture
3. **DATABASE_URL**: La variable d'environnement est correcte
4. **Collections**: Les collections existent dans la base de données

## 📚 Ressources

- [Prisma MongoDB Guide](https://www.prisma.io/docs/concepts/database-connectors/mongodb)
- [MongoDB Index Documentation](https://www.mongodb.com/docs/manual/indexes/)
- [Prisma db push](https://www.prisma.io/docs/reference/api-reference/command-reference#db-push)
