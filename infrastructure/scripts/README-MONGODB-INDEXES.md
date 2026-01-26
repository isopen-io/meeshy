# Scripts d'Index MongoDB - Optimisations Performances

## Vue d'ensemble

Ce dossier contient les scripts MongoDB pour créer les index nécessaires aux optimisations de performance, notamment pour la route `/api/v1/conversations`.

## Performance Avant/Après

### AVANT optimisations
- **conversationsQuery**: 2.5-6.3s
- **countQuery**: 1.8-5.4s
- **unreadCounts**: 0.05-2.5s
- **TOTAL**: **6-11 secondes** ❌

### APRÈS optimisations (code + index)
- **conversationsQuery**: 0.2-0.5s
- **parallelQueries** (count+unread+users): 0.05-0.3s
- **TOTAL**: **0.25-0.9 secondes** ✅

**Amélioration: 10-40x plus rapide**

---

## 📁 Scripts Disponibles

### `mongodb-add-conversation-indexes.js`

Script principal pour ajouter tous les index de performance sur les collections conversations.

**Collections affectées:**
- `ConversationMember`
- `Message`
- `Conversation`
- `ConversationReadCursor`
- `UserConversationPreferences`

---

## 🚀 Exécution des Scripts

### Option 1: Via mongosh (Recommandé)

```bash
# En local (développement)
mongosh mongodb://localhost:27017/meeshy < infrastructure/scripts/mongodb-add-conversation-indexes.js

# En staging
ssh root@meeshy.me
mongosh mongodb://localhost:27017/meeshy-staging < /path/to/mongodb-add-conversation-indexes.js

# En production
ssh root@meeshy.me
mongosh mongodb://localhost:27017/meeshy < /path/to/mongodb-add-conversation-indexes.js
```

### Option 2: Via MongoDB Compass

1. Ouvrir MongoDB Compass
2. Se connecter à la base de données
3. Ouvrir le shell MongoDB (en bas)
4. Copier-coller le contenu du fichier `mongodb-add-conversation-indexes.js`
5. Appuyer sur "Run"

### Option 3: Via Docker (pour staging/prod)

```bash
# Staging
docker exec -i meeshy-database-staging mongosh meeshy-staging < infrastructure/scripts/mongodb-add-conversation-indexes.js

# Production
docker exec -i meeshy-database-prod mongosh meeshy < infrastructure/scripts/mongodb-add-conversation-indexes.js
```

---

## 📊 Index Créés

### Priorité P0 - CRITIQUES (exécuter en premier)

#### 1. `idx_member_user_active_conv` sur `ConversationMember`
```javascript
{ "userId": 1, "isActive": 1, "conversationId": 1 }
```
**But**: Recherche rapide des conversations d'un utilisateur actif

**Impact**: -50% sur conversationsQuery

#### 2. `idx_message_conv_notdeleted_created` sur `Message`
```javascript
{ "conversationId": 1, "isDeleted": 1, "createdAt": -1 }
```
**But**: Recherche rapide du dernier message d'une conversation

**Impact**: -40% sur lastMessage lookup

---

### Priorité P1 - IMPORTANTS

#### 3. `idx_conversation_active_lastmsg` sur `Conversation`
```javascript
{ "isActive": 1, "lastMessageAt": -1 }
```
**But**: Tri et filtre rapide sur les conversations actives

**Impact**: -20% sur le tri

#### 4. `idx_cursor_user_conv` sur `ConversationReadCursor`
```javascript
{ "userId": 1, "conversationId": 1 }
```
**But**: Recherche rapide des curseurs de lecture (unreadCounts)

**Impact**: -50% sur unreadCounts

#### 5. `idx_userprefs_user_conv` sur `UserConversationPreferences`
```javascript
{ "userId": 1, "conversationId": 1 }
```
**But**: Recherche rapide des préférences utilisateur (isPinned, isMuted, etc.)

**Impact**: -30% sur userPreferences lookup

---

### Priorité P2 - OPTIONNELS

#### 6. `idx_conversation_type_active_lastmsg` sur `Conversation`
```javascript
{ "type": 1, "isActive": 1, "lastMessageAt": -1 }
```
**But**: Filtre par type de conversation + tri

**Impact**: -10% lorsque filtre type utilisé

---

## ⚠️ Précautions

### 1. **Index en arrière-plan**
Tous les index utilisent `background: true` pour éviter le blocage des écritures pendant la création.

### 2. **Espace disque**
Chaque index ajoute environ **10-50 MB** selon la taille de la collection.
Vérifier l'espace disponible avant:
```bash
db.stats()
```

### 3. **Durée de création**
- **Petites collections** (<1M docs): 1-5 minutes
- **Moyennes collections** (1-10M docs): 5-30 minutes
- **Grandes collections** (>10M docs): 30+ minutes

### 4. **Index existants**
Le script détecte automatiquement les index existants et les ignore (pas d'erreur).

---

## 🔍 Vérification Post-Installation

### Vérifier que les index sont créés

```javascript
// Dans mongosh ou Compass
db.ConversationMember.getIndexes()
db.Message.getIndexes()
db.Conversation.getIndexes()
db.ConversationReadCursor.getIndexes()
db.UserConversationPreferences.getIndexes()
```

### Vérifier l'utilisation des index

```javascript
// Exemple: vérifier que l'index est utilisé pour la query principale
db.Conversation.find({
  "members": { $elemMatch: { "userId": ObjectId("..."), "isActive": true } },
  "isActive": true
}).sort({ "lastMessageAt": -1 }).explain("executionStats")

// Chercher "indexName" dans le résultat pour voir quel index est utilisé
```

### Analyser les performances

Après avoir créé les index, vérifier les logs de performance de la route `/conversations`:

```
[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)
  - conversationsQuery: XXXms  ← Devrait être <500ms
  - parallelQueries: XXXms     ← Devrait être <300ms
  TOTAL: XXXms                 ← Devrait être <900ms
```

---

## 🔧 Maintenance des Index

### Supprimer un index (si besoin)

```javascript
db.ConversationMember.dropIndex("idx_member_user_active_conv")
```

### Reconstruire un index

```javascript
db.ConversationMember.reIndex()
```

### Statistiques d'utilisation

```javascript
db.ConversationMember.aggregate([
  { $indexStats: {} }
])
```

---

## 📝 Notes Importantes

1. **Production**: TOUJOURS tester en staging avant la production
2. **Backup**: Faire un backup avant modifications majeures
3. **Monitoring**: Surveiller les métriques CPU/RAM pendant la création
4. **Rollback**: Les index peuvent être supprimés sans perdre de données

---

## 🆘 Troubleshooting

### Erreur "Index already exists"
**Solution**: Normal, le script gère automatiquement ce cas

### Erreur "Not enough disk space"
**Solution**: Libérer de l'espace ou utiliser une machine avec plus d'espace

### Index non utilisé dans explain()
**Solution**: Vérifier que les champs de la query correspondent exactement à l'index

### Performances toujours lentes après index
**Solutions**:
1. Vérifier que les index sont bien créés: `db.collection.getIndexes()`
2. Vérifier que le code optimisé est déployé (version gateway >= 1.0.43)
3. Vérifier les logs pour voir quels index sont utilisés
4. Analyser avec `explain("executionStats")`

---

## 📞 Support

Pour toute question ou problème:
1. Vérifier les logs MongoDB
2. Utiliser `explain()` pour analyser les queries
3. Consulter la documentation MongoDB sur les index: https://docs.mongodb.com/manual/indexes/
