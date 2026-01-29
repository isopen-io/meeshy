# Fix - Dates Notifications et Marquage Comme Lu

## Problèmes identifiés

### 1. ❌ Toutes les notifications affichent "à l'instant"
**Symptôme** : Toutes les notifications montrent la même date/heure exacte (11:55:27 ou 11:55:33)

**Cause racine** :
- Les notifications dans la DB ont un `createdAt` null ou invalide
- Le backend utilise `new Date()` comme fallback lors du formatage
- Résultat : toutes les notifications reçoivent la date actuelle au moment du rendu

**Logs observés** :
```
createdAt: Thu Jan 29 2026 11:55:27 GMT+0100 (identique pour toutes)
```

---

### 2. ❌ Le marquage comme lu ne fonctionne pas
**Symptôme** : Cliquer sur une notification ne la marque pas comme lue visuellement

**Cause racine** :
- Le handler Socket.IO mettait à jour `n.isRead` au lieu de `n.state.isRead`
- Structure incorrecte dans la mise à jour du cache React Query

**Code problématique** :
```typescript
// ❌ AVANT
n.id === notificationId ? { ...n, isRead: true } : n
```

**Code corrigé** :
```typescript
// ✅ APRÈS
n.id === notificationId
  ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
  : n
```

---

## Solutions implémentées

### 1. Amélioration du parsing côté client

**Fichier** : `apps/web/services/notification.service.ts`

**Améliorations** :
```typescript
// Helper robuste pour parser les dates
const parseDate = (dateValue: any): Date | null => {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
};

// Cherche createdAt dans plusieurs champs possibles
const createdAtValue = stateData.createdAt || raw.createdAt || raw.created_at || raw.createdDate;
const createdAtDate = parseDate(createdAtValue);

state: {
  createdAt: createdAtDate || new Date(),
  readAt: parseDate(stateData.readAt || raw.readAt),
  expiresAt: parseDate(stateData.expiresAt || raw.expiresAt) || undefined,
}
```

**Avantages** :
- ✅ Parse correctement les dates ISO string depuis JSON
- ✅ Essaie plusieurs champs possibles
- ✅ Gère les valeurs null/undefined/invalides
- ✅ Logs de debug (10% des notifications pour performance)

---

### 2. Correction du handler Socket.IO

**Fichier** : `apps/web/hooks/queries/use-notifications-manager-rq.tsx`

**Correction** :
```typescript
const handleNotificationRead = (notificationId: string) => {
  console.log('[useNotificationsManagerRQ] Marking notification as read:', notificationId);

  queryClient.setQueryData(
    queryKeys.notifications.lists(),
    (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          notifications: page.notifications?.map((n: Notification) =>
            n.id === notificationId
              ? { ...n, state: { ...n.state, isRead: true, readAt: new Date() } }
              : n
          ),
        })),
      };
    }
  );

  // Décrémenter le compteur
  queryClient.setQueryData(
    queryKeys.notifications.unreadCount(),
    (old: number | undefined) => Math.max(0, (old ?? 1) - 1)
  );
};
```

**Avantages** :
- ✅ Met à jour la structure correcte `state.isRead`
- ✅ Ajoute `readAt` avec la date actuelle
- ✅ Logs pour debugging
- ✅ Cache React Query correctement mis à jour

---

### 3. Logs améliorés côté backend

**Fichier** : `services/gateway/src/services/notifications/NotificationService.ts`

**Ajout** :
```typescript
private formatNotification(raw: any): Notification {
  const readAtDate = this.sanitizeDate(raw.readAt, null);
  const createdAtDate = this.sanitizeDate(raw.createdAt, new Date())!;
  const expiresAtDate = this.sanitizeDate(raw.expiresAt, null);

  // Debug: Log si createdAt est null/invalide
  if (!raw.createdAt || !(raw.createdAt instanceof Date)) {
    notificationLogger.warn('⚠️ Notification missing valid createdAt', {
      notificationId: raw.id,
      rawCreatedAt: raw.createdAt,
      typeofCreatedAt: typeof raw.createdAt,
      usingFallback: true,
      fallbackDate: createdAtDate.toISOString(),
    });
  }

  return {
    // ...
  };
}
```

**Avantages** :
- ✅ Identifie les notifications avec dates invalides
- ✅ Logs détaillés dans les logs gateway
- ✅ Facilite le debugging

---

### 4. Script de migration DB

**Fichier** : `services/gateway/scripts/fix-notification-dates.ts`

**Usage** :
```bash
cd services/gateway
npx ts-node scripts/fix-notification-dates.ts
```

**Fonctionnement** :
1. Trouve toutes les notifications avec `createdAt` invalide (null, undefined, ou NaN)
2. Pour chaque notification invalide :
   - Utilise `readAt` si disponible (date probable de création)
   - Sinon utilise fallback de 7 jours dans le passé
3. Met à jour la DB avec les dates corrigées

**Exemple de sortie** :
```
🔍 Recherche des notifications avec dates invalides...
📊 Total de notifications: 150
❌ Notifications avec createdAt invalide: 8

⏳ Progression: 8/8 corrigées...

✅ Migration terminée !
   - Total corrigé: 8/8
   - Date fallback utilisée: 2026-01-22T10:00:00.000Z
```

---

## Étapes de déploiement

### Étape 1 : Déployer les corrections frontend

```bash
cd apps/web
# Les fichiers suivants ont été modifiés :
# - services/notification.service.ts
# - hooks/queries/use-notifications-manager-rq.tsx

# Redémarrer le dev server
npm run dev
```

### Étape 2 : Déployer les logs backend

```bash
cd services/gateway
# Le fichier suivant a été modifié :
# - src/services/notifications/NotificationService.ts

# Redémarrer le service
npm run dev
```

### Étape 3 : Exécuter la migration DB

```bash
cd services/gateway
npx ts-node scripts/fix-notification-dates.ts
```

**⚠️ IMPORTANT** : Exécuter cette migration une seule fois !

### Étape 4 : Vérifier les logs

#### Logs backend (Gateway)
Chercher dans les logs du gateway :
```
⚠️ Notification missing valid createdAt
```

Si vous voyez ces warnings après la migration, ça signifie que de nouvelles notifications sont créées sans date valide.

#### Logs frontend (Console navigateur)
```javascript
🔍 [parseNotification] Raw data: {
  id: '...',
  stateCreatedAt: '2026-01-29T10:30:00.000Z',  // ← Devrait être une date valide
  parsedCreatedAt: '2026-01-29T10:30:00.000Z',
  ...
}
```

Si `parsedCreatedAt` est toujours la date actuelle, le problème persiste.

---

## Tests à effectuer

### Test 1 : Vérifier les dates après migration

1. **Exécuter la migration** :
   ```bash
   cd services/gateway
   npx ts-node scripts/fix-notification-dates.ts
   ```

2. **Recharger la page** `/notifications`

3. **Vérifier dans la console** :
   ```
   📋 Notifications Debug
   Total notifications: 8
   First 3 notifications dates:
     1. ID: 697b3a44c8f9133b138b43e8
        createdAt: Mon Jan 22 2026 11:00:00 GMT+0100  ← Date dans le passé
   ```

4. **Vérifier visuellement** :
   - Les notifications devraient afficher "il y a 7j" ou dates relatives correctes
   - Pas toutes "à l'instant"

---

### Test 2 : Marquer une notification comme lue

1. **Ouvrir** `/notifications`

2. **Identifier une notification non lue** :
   - Fond bleu (`bg-blue-50/80`)
   - Point bleu pulsant
   - Opacité 100%

3. **Cliquer sur la notification**

4. **Vérifier le changement visuel** :
   - Fond devient blanc/gris (`bg-white/60`)
   - Point bleu disparaît
   - Opacité réduite à 75% (notification plus pâle)

5. **Vérifier la console** :
   ```
   [useNotificationsManagerRQ] Marking notification as read: 697b3a44c8f9133b138b43e8
   ```

---

### Test 3 : Nouvelle notification en temps réel

1. **Créer une nouvelle notification** (envoyer un message, etc.)

2. **Vérifier dans les logs backend** :
   - ✅ Aucun warning `⚠️ Notification missing valid createdAt`

3. **Vérifier dans l'UI** :
   - Notification apparaît avec "à l'instant" (correct pour nouvelle notification)

4. **Attendre 2 minutes**

5. **Recharger la page**

6. **Vérifier** :
   - Notification affiche "il y a 2 min" (pas "à l'instant")

---

## Schéma Prisma (Référence)

Le modèle `Notification` définit correctement `createdAt` :

```prisma
model Notification {
  id        String   @id @default(auto()) @map("_id") @db.ObjectId
  userId    String   @db.ObjectId
  type      String
  content   String
  priority  String   @default("normal")

  // ... autres champs ...

  isRead    Boolean   @default(false)
  readAt    DateTime?
  expiresAt DateTime?
  createdAt DateTime  @default(now())  // ← Valeur par défaut

  // ... delivery ...
}
```

---

## Diagnostic si le problème persiste

### Si les dates sont toujours invalides après migration :

1. **Vérifier les logs backend** :
   ```bash
   cd services/gateway
   npm run dev
   # Chercher : ⚠️ Notification missing valid createdAt
   ```

2. **Vérifier la DB directement** :
   ```javascript
   // Dans MongoDB Compass ou shell
   db.notifications.find({}).limit(5).pretty()
   // Vérifier que createdAt existe et est valide
   ```

3. **Vérifier que Prisma est à jour** :
   ```bash
   cd packages/shared
   npx prisma generate
   ```

---

### Si le marquage comme lu ne fonctionne pas :

1. **Vérifier les mutations React Query** :
   ```javascript
   // Console navigateur
   // Après avoir cliqué sur une notification, chercher :
   [useNotificationsManagerRQ] Marking notification as read: <id>
   ```

2. **Vérifier la réponse API** :
   ```javascript
   // Onglet Network dans DevTools
   // POST /api/notifications/<id>/read
   // Réponse devrait contenir : { success: true, data: { state: { isRead: true } } }
   ```

3. **Vérifier le cache React Query** :
   ```javascript
   // Installer React Query DevTools
   // Vérifier que la notification a state.isRead: true
   ```

---

## Fichiers modifiés

### Frontend
1. `apps/web/services/notification.service.ts`
   - Parsing robuste des dates
   - Support multi-format
   - Logs de debug

2. `apps/web/hooks/queries/use-notifications-manager-rq.tsx`
   - Correction handler Socket.IO
   - Mise à jour correcte de `state.isRead`
   - Logs de debug

### Backend
3. `services/gateway/src/services/notifications/NotificationService.ts`
   - Logs pour dates invalides
   - Identification des notifications problématiques

### Scripts
4. `services/gateway/scripts/fix-notification-dates.ts`
   - Script de migration pour corriger les dates existantes

---

## Prochaines étapes recommandées

1. **Exécuter la migration DB** immédiatement

2. **Surveiller les logs backend** pendant 24h pour identifier de nouvelles notifications invalides

3. **Si le problème persiste** :
   - Vérifier le code de création des notifications
   - Vérifier les migrations Prisma
   - Investiguer si un autre service crée des notifications

4. **Considérer une contrainte DB** :
   ```prisma
   createdAt DateTime @default(now()) @db.Date
   ```
   Pour forcer MongoDB à valider les dates

---

## Impact

- ✅ **Dates notifications correctes** après migration
- ✅ **Marquage comme lu fonctionnel** immédiatement
- ✅ **Logs détaillés** pour debugging
- ✅ **Script de migration** réutilisable
- ✅ **Parsing robuste** côté client
- ✅ **Compatibilité** avec anciennes et nouvelles données
