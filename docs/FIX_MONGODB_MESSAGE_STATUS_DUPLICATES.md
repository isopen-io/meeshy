# 🔧 Correction des doublons MongoDB dans message_status

**Date**: 17 octobre 2025  
**Statut**: ✅ Solution disponible  
**Sévérité**: ⚠️ Moyenne (non-bloquant mais génère des logs d'erreur)

---

## 📋 Problème

### Symptôme

Au démarrage du service `meeshy-translator`, on observe l'erreur suivante :

```
[TRANSLATOR] Tentative 1/2: Application du schema MongoDB avec prisma db push...
[TRANSLATOR] Tentative 1 echouee: Error: MongoDB error
Kind: Command failed: Error code 11000 (DuplicateKey): Index build failed: 
E11000 duplicate key error collection: meeshy.message_status 
index: message_status_messageId_userId_key 
dup key: { messageId: ObjectId('...'), userId: ObjectId('...') }
```

### Cause

1. **Doublons dans la collection** : La collection `message_status` contient des entrées dupliquées pour la même combinaison `(messageId, userId)`

2. **Contrainte d'unicité** : Le schéma Prisma définit un index unique :
   ```prisma
   model MessageStatus {
     messageId  String @db.ObjectId
     userId     String @db.ObjectId
     // ...
     @@unique([messageId, userId], name: "messageId_userId")
   }
   ```

3. **Création d'index impossible** : MongoDB ne peut pas créer l'index unique tant que des doublons existent

### Impact

- ⚠️ **Non-bloquant** : Le service continue en mode dégradé
- 📝 **Logs d'erreur** : Génère des messages d'erreur à chaque démarrage
- 🔍 **Intégrité des données** : Les doublons peuvent causer des incohérences

---

## ✅ Solutions

### Solution 1 : Script automatique de nettoyage (Recommandé)

Un script a été créé pour détecter et supprimer automatiquement les doublons.

#### Utilisation

```bash
# Depuis la racine du projet
./scripts/fix-message-status-duplicates.sh
```

#### Ce que fait le script

1. ✅ Trouve tous les doublons `(messageId, userId)`
2. ✅ Pour chaque doublon :
   - Garde le document le plus récent (basé sur `readAt`, `receivedAt`, ou `_id`)
   - Supprime tous les anciens documents
3. ✅ Affiche un rapport détaillé
4. ✅ Vérifie qu'il ne reste plus de doublons

#### Résultat attendu

```
🔍 [FIX] Recherche des doublons dans message_status...
📊 [FIX] Trouvé 5 paires (messageId, userId) en double

📝 [1/5] Traitement doublon:
   messageId: 68c2dc0043ebb97e261e3225
   userId: 68c074009fa8702138033b8e
   3 documents trouvés
   ✅ Conservation du document: 68f225827a98f82c1c986ac6
   🗑️  Supprimés: 2 documents

[...]

📊 [FIX] Résumé du nettoyage:
   Total de documents en double: 15
   Documents conservés: 5
   Documents supprimés: 10

✅ [FIX] Succès! Aucun doublon restant.
💡 [FIX] Vous pouvez maintenant redémarrer le translator:
   docker-compose restart meeshy-translator
```

---

### Solution 2 : Nettoyage manuel via MongoDB

Si vous préférez inspecter les données manuellement :

```bash
# 1. Se connecter à MongoDB
docker-compose exec meeshy-database mongosh meeshy

# 2. Trouver les doublons
db.message_status.aggregate([
  {
    $group: {
      _id: { messageId: "$messageId", userId: "$userId" },
      count: { $sum: 1 },
      ids: { $push: "$_id" }
    }
  },
  {
    $match: { count: { $gt: 1 } }
  }
])

# 3. Pour chaque doublon, garder le plus récent
# Exemple pour un doublon spécifique:
const messageId = ObjectId("68c2dc0043ebb97e261e3225");
const userId = ObjectId("68c074009fa8702138033b8e");

// Trouver tous les documents triés par date
const docs = db.message_status.find({
  messageId: messageId,
  userId: userId
}).sort({ readAt: -1 }).toArray();

// Garder le premier, supprimer les autres
const keepId = docs[0]._id;
db.message_status.deleteMany({
  messageId: messageId,
  userId: userId,
  _id: { $ne: keepId }
});
```

---

### Solution 3 : Drop et recréation de l'index

⚠️ **Attention** : Cette solution force la suppression de l'index existant

```bash
# Se connecter à MongoDB
docker-compose exec meeshy-database mongosh meeshy

# Supprimer l'index problématique
db.message_status.dropIndex("message_status_messageId_userId_key")

# Redémarrer le translator pour recréer l'index
docker-compose restart meeshy-translator
```

**Note** : Cette approche ne résout pas les doublons, elle force juste la recréation de l'index

---

## 🔍 Prévention

### Comment les doublons sont-ils créés ?

Les doublons peuvent apparaître dans plusieurs situations :

1. **Race conditions** : Deux requêtes simultanées créent le même statut
2. **Migrations imparfaites** : Transfert de données sans vérification
3. **Bugs dans le code** : Logique métier qui ne vérifie pas l'existence avant l'insertion

### Recommandations

#### 1. Utiliser `upsert` dans le code

**Avant (peut créer des doublons)** :
```typescript
await prisma.messageStatus.create({
  data: { messageId, userId, readAt: new Date() }
});
```

**Après (upsert = update or insert)** :
```typescript
await prisma.messageStatus.upsert({
  where: {
    messageId_userId: { messageId, userId }
  },
  create: {
    messageId,
    userId,
    readAt: new Date()
  },
  update: {
    readAt: new Date()
  }
});
```

#### 2. Vérifier l'existence avant l'insertion

```typescript
const existing = await prisma.messageStatus.findUnique({
  where: {
    messageId_userId: { messageId, userId }
  }
});

if (!existing) {
  await prisma.messageStatus.create({
    data: { messageId, userId, readAt: new Date() }
  });
}
```

#### 3. Activer le mode strict dans Prisma

Dans `prisma/schema.prisma` :
```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["strictUndefinedChecks"]
}
```

---

## 🚀 Amélioration du script de démarrage

Le script `translator/docker-entrypoint-mongodb.sh` a été amélioré pour :

1. ✅ **Détecter** l'erreur spécifique de doublon `message_status`
2. ✅ **Continuer** le démarrage (erreur non-bloquante)
3. ✅ **Informer** l'utilisateur du script de correction disponible

### Nouveau comportement

```
[TRANSLATOR] Tentative 1 echouee: Error: E11000 duplicate key...
[TRANSLATOR] ⚠️  Erreur de doublon dans message_status détectée
[TRANSLATOR] 💡 Cette erreur est non-bloquante, le service peut continuer
[TRANSLATOR] 📝 Pour corriger: scripts/fix-message-status-duplicates.sh
[TRANSLATOR] Schema MongoDB applique (mode degrade)
[TRANSLATOR] Demarrage de l application Translator...
```

---

## 📝 Checklist de résolution

- [ ] Exécuter le script de nettoyage :
  ```bash
  ./scripts/fix-message-status-duplicates.sh
  ```

- [ ] Vérifier les résultats du nettoyage

- [ ] Redémarrer le translator :
  ```bash
  docker-compose restart meeshy-translator
  ```

- [ ] Vérifier les logs - plus d'erreur E11000 :
  ```bash
  docker-compose logs -f meeshy-translator | grep -A 5 "prisma db push"
  ```

- [ ] (Optionnel) Auditer le code pour utiliser `upsert` au lieu de `create`

---

## 🔗 Références

- **Schéma Prisma** : `shared/schema.prisma` (ligne 252-265)
- **Script de correction** : `scripts/fix-message-status-duplicates.js`
- **Script de démarrage** : `translator/docker-entrypoint-mongodb.sh`
- **Issue MongoDB** : E11000 Duplicate Key Error

---

## 📊 Tests de validation

### Test 1 : Vérifier les doublons

```bash
docker-compose exec meeshy-database mongosh meeshy --eval "
  db.message_status.aggregate([
    { \$group: { _id: { messageId: '\$messageId', userId: '\$userId' }, count: { \$sum: 1 } } },
    { \$match: { count: { \$gt: 1 } } }
  ]).toArray().length
"
```

**Résultat attendu** : `0` (aucun doublon)

### Test 2 : Vérifier l'index

```bash
docker-compose exec meeshy-database mongosh meeshy --eval "
  db.message_status.getIndexes()
"
```

**Résultat attendu** : L'index `message_status_messageId_userId_key` est présent

### Test 3 : Démarrage propre du translator

```bash
docker-compose restart meeshy-translator && docker-compose logs -f meeshy-translator
```

**Résultat attendu** : Aucune erreur E11000, message de succès `[TRANSLATOR] Schema MongoDB applique avec db push`

---

**Auteur**: AI Assistant  
**Review**: Pending  
**Deployment**: Script prêt à l'emploi


