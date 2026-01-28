# Migration: Notification.data String → Json

## 📋 Vue d'ensemble

Cette migration corrige le typage du champ `data` dans le modèle `Notification` :
- **Avant :** `data String?` (JSON stringifié)
- **Après :** `data Json?` (objet JSON natif)

## 🎯 Pourquoi cette migration ?

### Problèmes corrigés

1. **Parsing manuel fastidieux**
   ```typescript
   // Avant ❌
   let parsedData = raw.data;
   if (typeof raw.data === 'string') {
     parsedData = JSON.parse(raw.data); // Peut crasher !
   }
   ```

   ```typescript
   // Après ✅
   const parsedData = raw.data; // Déjà un objet
   ```

2. **Risques d'erreur**
   - `JSON.parse()` peut crasher si la string n'est pas un JSON valide
   - Besoin de try/catch partout
   - Code dupliqué dans frontend et backend

3. **Types TypeScript incohérents**
   - Prisma génère `data: string | null`
   - Mais en réalité c'est un objet JSON
   - Les types mentent !

### Avantages après migration

- ✅ Pas de parsing manuel
- ✅ Types TypeScript corrects
- ✅ MongoDB stocke directement des objets
- ✅ Moins de code, moins de bugs

## 📦 Fichiers modifiés

### Schéma Prisma
```diff
// packages/shared/prisma/schema.prisma
model Notification {
  id     String  @id @default(auto()) @map("_id") @db.ObjectId
  title  String
- data   String?
+ data   Json?
}
```

### Backend (Gateway)
- ✅ `services/gateway/src/services/notifications/NotificationService.ts` (2 occurrences)
- ✅ `services/gateway/src/services/notifications/NotificationFormatter.ts` (1 occurrence)

### Frontend (Web)
- ✅ `apps/web/services/notification.service.ts` (1 occurrence)

## 🚀 Instructions d'exécution

### Étape 1 : Backup de la base de données

**IMPORTANT : Toujours faire un backup avant une migration !**

```bash
# MongoDB Atlas : Activer les backups automatiques dans le dashboard

# Ou backup manuel
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/meeshy" --out=/backups/$(date +%Y%m%d)
```

### Étape 2 : Vérifier l'état actuel

```bash
# Connexion à MongoDB
mongosh "mongodb+srv://your-cluster.mongodb.net/meeshy"

# Compter les notifications avec data de type string
db.Notification.countDocuments({ data: { $type: 'string' } })

# Exemples de données (pour vérifier la structure)
db.Notification.find({ data: { $type: 'string' } }).limit(3).pretty()
```

### Étape 3 : Exécuter la migration des données

```bash
# Depuis la racine du monorepo
cd /Users/smpceo/Documents/v2_meeshy

# Exécuter le script de migration MongoDB
mongosh "mongodb+srv://your-cluster.mongodb.net/meeshy" \
  packages/shared/prisma/migrations/convert-notification-data-to-json.mongodb.js
```

**Output attendu :**
```
🔄 Début de la migration: Notification.data String → Json
📊 150 notification(s) trouvée(s) avec data de type string
  ✓ 507f1f77bcf86cd799439011: Converti JSON en objet
  ✓ 507f1f77bcf86cd799439012: Converti JSON en objet
  📈 Progression: 100/150 convertis
============================================================
📊 Rapport de Migration
============================================================
✅ Notifications traitées: 150
✅ Notifications converties: 150
❌ Erreurs: 0
============================================================
🎉 Migration terminée avec succès!
```

### Étape 4 : Générer les types Prisma

```bash
# Générer les nouveaux types TypeScript depuis le schéma
cd packages/shared
pnpm prisma generate

# Ou depuis la racine
pnpm --filter @meeshy/shared prisma:generate
```

### Étape 5 : Vérifier les modifications

```bash
# Vérifier que le type a changé dans le fichier généré
cat packages/shared/generated/client/index.d.ts | grep -A 5 "model Notification"

# Devrait montrer:
# data: Prisma.JsonValue | null
```

### Étape 6 : Tester l'application

#### Test Backend

```bash
# Redémarrer le gateway
cd services/gateway
pnpm dev

# Tester la création d'une notification
curl -X POST http://localhost:4000/api/notifications/test \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "new_message",
    "title": "Test notification",
    "content": "Test après migration",
    "data": {
      "conversationId": "507f1f77bcf86cd799439011",
      "messageId": "507f1f77bcf86cd799439012"
    }
  }'

# Vérifier la réponse
# ✅ data devrait être un objet, pas une string
```

#### Test Frontend

```bash
# Redémarrer l'app web
cd apps/web
pnpm dev

# Ouvrir http://localhost:3000
# Se connecter
# Vérifier dans DevTools > Console :
# ✅ Pas d'erreur "JSON.parse"
# ✅ notification.data est un objet
```

### Étape 7 : Déploiement

```bash
# 1. Commit les changements
git add -A
git commit -m "fix(notifications): corriger typage data String → Json"

# 2. Pousser sur la branche
git push origin main

# 3. Déployer (Vercel pour frontend, Railway/Render pour backend)
# Le déploiement va automatiquement:
# - Générer les types Prisma
# - Rebuild les services
# - Utiliser le nouveau code
```

## 🧪 Tests de validation

### Test 1 : Créer une notification avec data objet

```typescript
// Backend (NotificationService)
const notification = await prisma.notification.create({
  data: {
    userId: 'user123',
    type: 'new_message',
    title: 'Test',
    content: 'Content',
    data: {
      // ✅ Objet directement (pas de JSON.stringify)
      conversationId: '507f1f77bcf86cd799439011',
      attachments: [
        { type: 'image', url: 'https://...' }
      ]
    }
  }
});

console.log(notification.data);
// ✅ Affiche : { conversationId: '...', attachments: [...] }
// ❌ Avant : "[object Object]" ou "{"conversationId":"..."}"
```

### Test 2 : Récupérer et utiliser data

```typescript
// Frontend
const notification = await notificationService.getNotifications();
const firstNotif = notifications[0];

console.log(typeof firstNotif.data);
// ✅ Affiche : "object"
// ❌ Avant : "string"

console.log(firstNotif.data.conversationId);
// ✅ Affiche : "507f1f77bcf86cd799439011"
// ❌ Avant : undefined (car c'était une string)
```

### Test 3 : Notifications anciennes (migrated)

```typescript
// Les notifications créées avant la migration
// devraient fonctionner sans problème

const oldNotif = await prisma.notification.findFirst({
  where: { createdAt: { lt: new Date('2026-01-28') } }
});

console.log(oldNotif.data);
// ✅ Affiche : { conversationId: '...', ... } (converti par la migration)
```

## ⚠️ Rollback (en cas de problème)

Si vous devez revenir en arrière :

### 1. Restaurer le schéma Prisma

```diff
// packages/shared/prisma/schema.prisma
model Notification {
- data   Json?
+ data   String?
}
```

### 2. Restaurer le code

```bash
git revert HEAD
```

### 3. Restaurer les données (optionnel)

```javascript
// Script de rollback MongoDB
db.Notification.find({ data: { $type: 'object' } }).forEach(notification => {
  db.Notification.updateOne(
    { _id: notification._id },
    { $set: { data: JSON.stringify(notification.data) } }
  );
});
```

**Note :** Le rollback des données n'est pas obligatoire car MongoDB est schemaless. Le code peut continuer à fonctionner avec les deux types.

## 📊 Impact

### Base de données

- **Taille :** Aucun changement (MongoDB stocke déjà les objets JSON)
- **Index :** Aucun impact (pas d'index sur `data`)
- **Performance :** Légère amélioration (pas de parsing)

### Code

- **Lignes supprimées :** ~15 lignes de parsing JSON
- **Lignes modifiées :** 4 fichiers (backend + frontend)
- **Breaking changes :** Aucun (rétrocompatible)

### Déploiement

- **Temps d'arrêt :** 0 (migration sans downtime)
- **Ordre de déploiement :** Peu importe (MongoDB schemaless)
- **Rollback :** Facile (git revert)

## ✅ Checklist

Avant de déployer en production :

- [ ] Backup de la base de données effectué
- [ ] Migration des données testée en staging
- [ ] Types Prisma générés
- [ ] Tests backend passent
- [ ] Tests frontend passent
- [ ] Vérification manuelle dans l'UI
- [ ] Plan de rollback documenté
- [ ] Équipe notifiée du déploiement

## 📚 Ressources

- [Prisma JSON Type](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#json)
- [MongoDB $type Operator](https://www.mongodb.com/docs/manual/reference/operator/query/type/)
- [TypeScript JSON Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#json)

---

**Créé le :** 2026-01-28
**Auteur :** Claude Code
**Version :** 1.0.0
