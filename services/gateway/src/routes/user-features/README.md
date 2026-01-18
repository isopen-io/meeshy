# User Features Routes

Routes pour la gestion des fonctionnalités et consentements utilisateur (GDPR).

## Structure

```
src/routes/user-features/
├── index.ts             # Point d'entrée principal
├── types.ts             # Types, interfaces et constantes
├── features.ts          # Routes de gestion des features
├── consents.ts          # Routes de gestion des consentements GDPR
└── configuration.ts     # Routes de configuration utilisateur
```

## Modules

### index.ts (51 lignes)
Point d'entrée principal qui orchestre l'enregistrement de toutes les routes.

**Exports:**
- `userFeaturesRoutes()` - Fonction d'enregistrement des routes
- Types: `FeatureParams`, `ConsentParams`, `ConfigurationBody`, `AgeVerificationBody`
- Constantes: `ACTIVATABLE_FEATURES`, `CONSENT_TYPES`, `featureStatusResponseSchema`

**Optimisation:**
Utilise `Promise.all()` pour enregistrer les routes en parallèle.

### types.ts (97 lignes)
Définitions de types, interfaces et constantes partagées.

**Contenu:**
- Interfaces de requête/réponse
- Constantes de features activables
- Constantes de types de consentement
- Schémas de validation JSON

### features.ts (347 lignes)
Routes pour la gestion des fonctionnalités utilisateur.

**Routes:**
- `GET /user-features` - Obtenir le statut complet des features
- `GET /user-features/validate/:feature` - Valider si une feature peut être utilisée
- `POST /user-features/:feature/enable` - Activer une feature
- `POST /user-features/:feature/disable` - Désactiver une feature

### consents.ts (469 lignes)
Routes pour la gestion des consentements GDPR et vérification d'âge.

**Routes:**
- `POST /user-features/consent/:consentType` - Accorder un consentement
- `DELETE /user-features/consent/:consentType` - Révoquer un consentement
- `POST /user-features/age-verification` - Vérifier l'âge de l'utilisateur
- `GET /user-features/consents` - Obtenir tous les statuts de consentement

**Optimisation:**
Utilise `Promise.all()` pour les requêtes parallèles User/UserFeature.

### configuration.ts (386 lignes)
Routes pour la configuration utilisateur (langues, formats, rétention).

**Routes:**
- `GET /user-features/configuration` - Obtenir la configuration utilisateur
- `PUT /user-features/configuration` - Mettre à jour la configuration

**Optimisation:**
Utilise `Promise.all()` pour les mises à jour parallèles User/UserFeature.

## Pattern de données

**DateTime? != null** signifie activé/consenti avec timestamp d'audit.

Exemple:
```typescript
{
  dataProcessingConsentAt: Date | null  // null = pas consenti, Date = consenti à cette date
}
```

## Caractéristiques de qualité

✅ **Modularité**: Séparation claire des responsabilités
✅ **Performance**: Utilisation de Promise.all pour parallélisation
✅ **Type Safety**: Types forts TypeScript partout
✅ **Maintenabilité**: Fichiers < 800 lignes
✅ **Documentation**: JSDoc complet sur toutes les routes
✅ **GDPR**: Audit trail avec timestamps

## Usage

```typescript
import userFeaturesRoutes from './routes/user-features';

// Enregistrer les routes
await fastify.register(userFeaturesRoutes);
```

## Dépendances

- `UserFeaturesService` - Service de gestion des features
- `fastify.authenticate` - Middleware d'authentification
- `fastify.prisma` - Client Prisma pour la base de données
- `@meeshy/shared/types/api-schemas` - Schémas API partagés

## Migration depuis l'ancien fichier

L'ancien fichier monolithique `user-features.ts` (1,251 lignes) a été refactorisé en 5 modules (1,350 lignes au total).

**Changements:**
- Structure de répertoire au lieu d'un fichier unique
- Exports sélectifs des types et constantes
- Parallélisation avec Promise.all
- Aucun changement de comportement ou d'API

**Fichier original:** `src/routes/user-features.ts.old`
