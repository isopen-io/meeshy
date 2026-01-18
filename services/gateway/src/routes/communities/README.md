# Module Communities - Architecture Refactorisée

## Vue d'ensemble

Ce module a été refactorisé pour améliorer la maintenabilité et la lisibilité du code. Le fichier monolithique original de 1,776 lignes a été divisé en 5 modules spécialisés, chacun avec moins de 800 lignes.

## Structure des fichiers

```
src/routes/communities/
├── index.ts          # Point d'entrée principal (34 lignes)
├── types.ts          # Types, schémas Zod et utilitaires (84 lignes)
├── core.ts           # Routes CRUD de base (684 lignes)
├── search.ts         # Routes de recherche publique (192 lignes)
├── members.ts        # Gestion des membres (593 lignes)
└── settings.ts       # Paramètres et modifications (264 lignes)
```

## Responsabilités des modules

### index.ts
- Point d'entrée principal du module
- Enregistre toutes les sous-routes en parallèle via `Promise.all`
- Réexporte les types pour l'utilisation externe

### types.ts
- **Enum**: `CommunityRole` (admin, moderator, member)
- **Schémas Zod**: Validation pour création, mise à jour, ajout/modification de membres
- **Utilitaires**:
  - `validatePagination()` - Validation et assainissement des paramètres de pagination
  - `generateIdentifier()` - Génération d'identifiants avec préfixe `mshy_`
- **Types TypeScript**: Types inférés des schémas Zod

### core.ts
Routes CRUD principales pour les communautés:
- `GET /communities/check-identifier/:identifier` - Vérifier disponibilité d'un identifiant
- `GET /communities` - Liste des communautés de l'utilisateur (avec pagination et recherche)
- `GET /communities/:id` - Détails d'une communauté (par ID ou identifier)
- `POST /communities` - Créer une nouvelle communauté
- `GET /communities/:id/conversations` - Conversations d'une communauté

### search.ts
Routes de recherche publique:
- `GET /communities/search` - Recherche de communautés publiques
  - Recherche dans: nom, identifier, description, noms des membres
  - Pagination complète
  - Retourne uniquement les communautés non-privées

### members.ts
Gestion complète des membres:
- `GET /communities/:id/members` - Liste des membres (avec pagination)
- `POST /communities/:id/members` - Ajouter un membre (admin uniquement)
- `PATCH /communities/:id/members/:memberId/role` - Modifier le rôle d'un membre (admin uniquement)
- `DELETE /communities/:id/members/:memberId` - Retirer un membre (admin uniquement)

### settings.ts
Paramètres et modifications:
- `PUT /communities/:id` - Mettre à jour une communauté (créateur uniquement)
- `DELETE /communities/:id` - Supprimer une communauté (créateur uniquement)

## Caractéristiques préservées

### Sécurité
- Authentification requise sur toutes les routes via `fastify.authenticate`
- Validation stricte des permissions (admin/créateur)
- Vérification d'accès pour les communautés privées
- Validation Zod complète des entrées

### Codes HTTP
Tous les codes HTTP sont préservés:
- `200` - Succès
- `201` - Création réussie
- `401` - Non authentifié
- `403` - Accès refusé
- `404` - Ressource non trouvée
- `409` - Conflit (identifiant déjà existant)
- `500` - Erreur serveur

### Messages d'erreur
Messages d'erreur explicites et cohérents préservés:
- "User must be authenticated"
- "Community not found"
- "Access denied to this community"
- "Only community admins can..."
- "Only community creator can..."
- etc.

### Optimisations
- `Promise.all` utilisé pour les requêtes parallèles (comptage + récupération)
- Pagination validée et limitée
- Includes Prisma optimisés avec sélection de champs spécifiques
- Cache et validation réutilisables

## Schémas OpenAPI

Toutes les routes conservent leurs schémas OpenAPI complets:
- Descriptions détaillées
- Tags appropriés
- Paramètres documentés
- Réponses avec exemples
- Schémas de validation pour body/query/params

## Pattern d'authentification unifié

Utilisation cohérente du nouveau système d'authentification:
```typescript
const authContext = (request as any).authContext;
if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
  return reply.status(401).send({
    success: false,
    error: 'User must be authenticated'
  });
}
const userId = authContext.userId;
```

## Utilisation

L'import reste identique:
```typescript
import { communityRoutes } from './routes/communities';
```

Les types peuvent être importés:
```typescript
import { CommunityRole, validatePagination, generateIdentifier } from './routes/communities';
```

## Migration

1. Le fichier original a été sauvegardé: `communities.ts.backup`
2. Aucune modification des routes n'est nécessaire dans `server.ts`
3. Tous les endpoints restent accessibles aux mêmes URLs
4. Compatibilité 100% avec le code existant

## Performance

- Chargement parallèle des routes via `Promise.all`
- Pas d'impact sur les performances runtime
- Amélioration du temps de compilation (fichiers plus petits)
- Meilleure optimisation possible par module

## Maintenance

### Avantages
- Fichiers plus courts et focalisés (< 800 lignes)
- Séparation claire des responsabilités
- Facilite les tests unitaires par module
- Réduit les conflits git
- Améliore la lisibilité du code

### Convention de nommage
- Fonctions d'enregistrement: `register<Module>Routes()`
- Export de la fonction principale: `export async function register...`
- Types exportés depuis `types.ts`

## Tests

Pour tester le module:
```bash
npm run build  # Vérifier la compilation
npm run dev    # Tester en développement
```

Tous les endpoints existants doivent fonctionner sans modification.
