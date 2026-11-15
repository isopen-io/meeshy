# Correctif : Erreur Prisma P2032 - context null dans notifications

## 🐛 Problème identifié

### Symptôme
```
Invalid `prisma.notification.findMany()` invocation:
Error converting field "context" of expected non-nullable type "Json", found incompatible value of "null".
```

**Code d'erreur** : `P2032`
**Contexte** : Se produit lors de `markConversationNotificationsAsRead`

### Cause racine

1. **Refactoring des notifications** (commit `77b39f5`) a changé la structure :
   - Ancien : champs plats
   - Nouveau : structure groupée avec `context`, `metadata`, `delivery` en Json

2. **Migration incomplète** :
   - Anciennes notifications ont `context: null`, `metadata: null`, `delivery: null`
   - Nouveau schema Prisma définit ces champs comme **non-nullable** (`Json`)
   - Prisma refuse de lire les anciennes données

3. **Impact** :
   - Crash lors de la lecture des notifications
   - Impossible de marquer les notifications comme lues
   - Service de notifications partiellement cassé

---

## ✅ Solution appliquée

### 1. Schema Prisma rendu tolérant

**Fichier** : `packages/shared/prisma/schema.prisma`

```prisma
// AVANT (non-nullable, crashait)
context  Json
metadata Json
delivery Json

// APRÈS (nullable avec defaults)
context  Json? @default("{}")
metadata Json? @default("{}")
delivery Json? @default("{\"emailSent\":false,\"pushSent\":false}")
```

**Bénéfices** :
- ✅ Prisma peut lire les anciennes notifications
- ✅ Nouvelles notifications ont des valeurs par défaut
- ✅ Pas de crash si données corrompues

### 2. NotificationService sécurisé

**Fichier** : `services/gateway/src/services/notifications/NotificationService.ts`

**Changement** :
```typescript
// Filtrer côté application pour trouver celles liées à cette conversation
// Note: Vérifier que context existe et n'est pas null (anciennes données)
const relevantNotifications = notifications.filter((n: any) => {
  // Ignorer les notifications avec context null ou invalide
  if (!n.context || typeof n.context !== 'object') {
    notificationLogger.warn('Notification with invalid context found', {
      notificationId: n.id,
      userId: n.userId,
      contextValue: n.context
    });
    return false;
  }
  return n.context.conversationId === conversationId;
});
```

**Bénéfices** :
- ✅ Ne crash pas si notification invalide
- ✅ Log les notifications problématiques
- ✅ Continue de fonctionner avec les données valides

### 3. Script de migration créé

**Fichier** : `scripts/migrations/fix-notification-context-null.ts`

**Fonction** : Corriger toutes les anciennes notifications

**Transformations** :
- `context: null` → `context: {}`
- `metadata: null` → `metadata: {}`
- `delivery: null` → `delivery: { emailSent: false, pushSent: false }`

---

## 🚀 Comment appliquer le correctif

### Étape 1 : Régénérer Prisma Client

Le schema a changé, il faut régénérer le client Prisma :

```bash
cd packages/shared
pnpm prisma generate
```

### Étape 2 : Exécuter la migration

Corriger les anciennes données :

```bash
pnpm fix:notification-context-null
```

**Sortie attendue** :
```
🔍 Recherche des notifications avec context/metadata/delivery null...

📊 Total de notifications trouvées: 42

✅ Migration terminée:
   - Notifications avec context null: 15
   - Notifications avec metadata null: 12
   - Notifications avec delivery null: 18
   - Total de notifications corrigées: 23
```

### Étape 3 : Redémarrer la gateway

```bash
pnpm dev:gateway
```

**Vérification** :
- ✅ Pas d'erreur Prisma P2032 dans les logs
- ✅ Notifications se chargent correctement
- ✅ Marquage comme lu fonctionne

---

## 📊 Vérification

### 1. Tester le marquage comme lu

1. Ouvrir l'application web
2. Recevoir une notification de message
3. Ouvrir la conversation
4. La notification doit être marquée comme lue automatiquement

### 2. Vérifier les logs

Dans les logs de la gateway, vous ne devriez **plus** voir :
```
❌ Invalid `prisma.notification.findMany()` invocation
❌ Error converting field "context"
```

Vous devriez voir :
```
✅ [MessageReadStatus] User X marked conversation Y as read
```

### 3. Si des notifications invalides sont trouvées

Les logs afficheront :
```json
{
  "level": "warn",
  "module": "notifications",
  "msg": "Notification with invalid context found",
  "notificationId": "...",
  "userId": "...",
  "contextValue": null
}
```

→ Ces notifications seront ignorées (pas de crash) et vous saurez lesquelles sont problématiques.

---

## 🔍 Debugging

### Si l'erreur persiste après migration

1. **Vérifier que Prisma est régénéré** :
```bash
cat packages/shared/prisma/client/schema.prisma | grep "context"
# Doit afficher : context Json? @default("{}")
```

2. **Vérifier que la migration a tourné** :
```bash
pnpm fix:notification-context-null
```

3. **Vérifier la base de données directement** :
```bash
# Via mongosh
db.Notification.find({ context: null }).count()
# Doit retourner : 0
```

4. **Nettoyer et reconstruire** (si nécessaire) :
```bash
cd packages/shared
rm -rf prisma/client
pnpm prisma generate
cd ../..
pnpm dev:gateway
```

---

## 📚 Fichiers de référence

- **NOTIFICATION_FIX_SUMMARY.md** : Correctif des dates invalides
- **NOTIFICATION_DATE_FIX.md** : Documentation détaillée dates
- **NOTIFICATION_REALTIME_FIX_COMPLETE.md** : Notifications temps réel
- **NOTIFICATION_CONTEXT_NULL_FIX.md** : Ce document

---

## 🎯 Résultat attendu

Après ces corrections :

1. ✅ Plus d'erreur Prisma P2032
2. ✅ Anciennes notifications lisibles
3. ✅ Nouvelles notifications ont structure correcte
4. ✅ Service de notifications stable
5. ✅ Marquage comme lu fonctionne

---

**Note** : Ce correctif est **défensif**. Même si de nouvelles notifications invalides sont créées dans le futur, le système ne crashera pas et loggera simplement un warning.
