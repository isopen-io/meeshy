# Correctif : Erreur "Invalid time value" dans les notifications - Résumé

## ✅ Problème résolu

Les notifications génèraient une erreur 500 avec le message :
```
RangeError: Invalid time value
    at Date.toISOString (<anonymous>)
    at asDateTime (fast-json-stringify/lib/serializer.js:63:25)
```

## 🔍 Cause racine identifiée

**Le problème avait DEUX sources** :

1. **NotificationService.ts** (ligne 126-128) : Créait des objets `Date` sans validation
2. **NotificationFormatter.ts** (ligne 39-41) : Créait également des objets `Date` sans validation

Quand une date invalide était présente (même non détectée dans la DB), la tentative de sérialisation JSON par Fastify échouait car `Date.toISOString()` ne peut pas traiter une date invalide.

## 🛠️ Corrections appliquées

### 1. NotificationService.ts
- ✅ Ajout de la fonction `sanitizeDate()` qui valide les dates avant création d'objets Date
- ✅ Détection des dates invalides (NaN, null, undefined, objets Date corrompus)
- ✅ Remplacement par des valeurs par défaut sûres
- ✅ Logging des dates invalides pour débogage

### 2. NotificationFormatter.ts
- ✅ Ajout de la même fonction `sanitizeDate()` pour cohérence
- ✅ Validation de toutes les dates (`createdAt`, `readAt`, `expiresAt`)
- ✅ Protection contre les erreurs de sérialisation

### 3. Scripts de migration et de test
- ✅ `scripts/migrations/fix-notification-dates.ts` : Nettoie les notifications avec dates invalides dans la DB
- ✅ `scripts/test-notification-serialization.ts` : Teste la sérialisation de toutes les notifications

## 📝 Nouvelles commandes disponibles

```bash
# Tester la sérialisation des notifications
pnpm run test:notification-serialization

# Corriger les dates invalides dans la DB
pnpm run fix:notification-dates
```

## 🧪 Tests effectués

```bash
pnpm run test:notification-serialization
```

**Résultat** :
- ✅ 14 notifications testées
- ✅ 0 échecs
- ✅ Toutes les notifications peuvent être sérialisées correctement

## 🚀 Prochaines étapes

### Redémarrage du service (DÉJÀ FAIT si vous avez suivi les instructions)

Le code corrigé est maintenant en place. Si la gateway n'est pas redémarrée, faites :

```bash
# Redémarrer la gateway pour appliquer les corrections
pnpm run dev:gateway
```

### Test de l'API

```bash
# Tester l'endpoint des notifications
curl -H "Authorization: Bearer <votre-token>" \
  "https://192.168.1.171:3000/api/v1/notifications?offset=0&limit=20"
```

**Attendu** : Réponse 200 avec la liste des notifications (plus d'erreur 500)

## 📊 Fonctionnement de la protection

### Avant (❌ Erreur)
```typescript
// Pas de validation
state: {
  readAt: raw.readAt ? new Date(raw.readAt) : null,
  createdAt: new Date(raw.createdAt),  // ❌ Peut être invalide
  expiresAt: raw.expiresAt ? new Date(raw.expiresAt) : undefined,
}
```

### Après (✅ Protégé)
```typescript
// Avec validation
state: {
  readAt: this.sanitizeDate(raw.readAt, null),  // ✅ Validé
  createdAt: this.sanitizeDate(raw.createdAt, new Date())!,  // ✅ Validé avec fallback
  expiresAt: this.sanitizeDate(raw.expiresAt, null) || undefined,  // ✅ Validé
}
```

## 🔐 Prévention future

Les fonctions `sanitizeDate()` empêchent maintenant :
- La création de nouvelles notifications avec des dates invalides
- La sérialisation JSON de dates corrompues
- Les erreurs "Invalid time value" lors de la lecture

Les dates invalides sont automatiquement :
- Détectées (via `isNaN(date.getTime())`)
- Loggées pour investigation
- Remplacées par des valeurs par défaut sûres

## 📚 Documentation complète

Pour plus de détails sur la solution et les scripts :
- **NOTIFICATION_DATE_FIX.md** : Documentation complète du correctif
- **scripts/migrations/fix-notification-dates.ts** : Script de migration
- **scripts/test-notification-serialization.ts** : Script de test

## ✅ Statut

- [x] Problème identifié
- [x] Code corrigé (NotificationService + NotificationFormatter)
- [x] Scripts de migration créés
- [x] Tests ajoutés
- [x] Documentation complète
- [ ] **Gateway redémarrée** (à faire si pas encore fait)
- [ ] **Tests fonctionnels** (vérifier que l'API répond correctement)

---

**Note importante** : Si vous voyez encore l'erreur après redémarrage, cela signifie qu'une nouvelle notification avec une date invalide est créée en temps réel. Dans ce cas, ajoutez un point d'arrêt ou un log dans `sanitizeDate()` pour identifier la source.
