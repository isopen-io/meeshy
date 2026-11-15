# Correctif : Erreur "Invalid time value" dans les notifications

## Problème identifié

Les notifications génèrent une erreur 500 avec le message :
```
RangeError: Invalid time value
    at Date.toISOString (<anonymous>)
    at asDateTime (fast-json-stringify/lib/serializer.js:63:25)
```

### Cause

Certaines notifications dans la base de données ont des dates invalides (`createdAt`, `readAt`, ou `expiresAt`) qui causent une erreur lors de la sérialisation JSON par Fastify.

## Solution implémentée

### 1. Validation côté code (NotificationService.ts)

Ajout d'une fonction `sanitizeDate()` qui :
- Valide que les dates sont correctes avant la sérialisation
- Remplace les dates invalides par des valeurs par défaut sûres
- Log les dates invalides pour le débogage

**Fichier modifié** : `services/gateway/src/services/notifications/NotificationService.ts`

### 2. Script de migration pour nettoyer la base de données

**Fichier créé** : `scripts/migrations/fix-notification-dates.ts`

Ce script :
- Identifie toutes les notifications avec des dates invalides
- Supprime les notifications avec `createdAt` invalide (données corrompues)
- Corrige les notifications avec `readAt` ou `expiresAt` invalide (met à null)

## Utilisation

### Exécuter le script de migration

```bash
# Depuis la racine du projet
pnpm run fix:notification-dates
```

Ou directement avec tsx :

```bash
cd /Users/smpceo/Documents/v2_meeshy
npx tsx scripts/migrations/fix-notification-dates.ts
```

### Résultat attendu

```
🔍 Recherche des notifications avec des dates invalides...

📊 Total de notifications à analyser : X

❌ Notifications avec dates invalides : Y

🔧 Stratégie de correction :
  - Si createdAt invalide : supprimer la notification (donnée corrompue)
  - Si readAt invalide : mettre readAt à null
  - Si expiresAt invalide : mettre expiresAt à null

✅ Notification corrigée : <id>
🗑️  Notification supprimée (createdAt invalide) : <id>

📊 Résumé de la migration :
  Total de notifications analysées : X
  Notifications avec createdAt invalide : Y
  Notifications avec readAt invalide : Z
  Notifications avec expiresAt invalide : W
  Notifications corrigées : A
  Notifications supprimées : B
  Erreurs rencontrées : 0

✅ Migration terminée avec succès !
```

## Vérification

Après avoir exécuté le script, testez l'API :

```bash
# Récupérer les notifications (devrait fonctionner sans erreur 500)
curl -H "Authorization: Bearer <token>" \
  "https://192.168.1.171:3000/api/v1/notifications?offset=0&limit=20"
```

## Prévention future

La fonction `sanitizeDate()` dans `NotificationService` empêche maintenant la création de nouvelles notifications avec des dates invalides et nettoie automatiquement les dates corrompues lors de la lecture.

## Notes techniques

### Dates valides vs invalides

Une date est considérée comme **invalide** si :
- `new Date(value).getTime()` retourne `NaN`
- Exemples : `""`, `"invalid"`, `undefined` (si utilisé dans new Date), objets corrompus

Une date est considérée comme **valide** si :
- Elle peut être convertie en timestamp valide
- Exemples : `new Date()`, timestamps numériques, chaînes ISO valides

### Pourquoi supprimer les notifications avec createdAt invalide ?

Le champ `createdAt` est fondamental pour :
- Le tri des notifications
- Les indexes de la base de données
- La logique métier (âge de la notification, etc.)

Une notification sans `createdAt` valide est considérée comme corrompue et doit être supprimée.
