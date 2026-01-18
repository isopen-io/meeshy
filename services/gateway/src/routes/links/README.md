# Links Routes Module

Module refactorisé pour la gestion des liens de partage de conversations.

## Structure

```
src/routes/links/
├── index.ts                        # Point d'entrée principal (23 lignes)
├── types.ts                        # Schémas Zod et types TypeScript (233 lignes)
├── validation.ts                   # Vérification d'identifiant (84 lignes)
├── creation.ts                     # Création de liens (349 lignes)
├── retrieval.ts                    # GET /links/:identifier (291 lignes)
├── messages-retrieval.ts           # GET /links/:identifier/messages (167 lignes)
├── messages.ts                     # POST messages via liens (547 lignes)
├── management.ts                   # PUT/PATCH mise à jour (338 lignes)
├── admin.ts                        # Liste, toggle, extend, delete (601 lignes)
└── utils/
    ├── link-helpers.ts             # Fonctions helper générales (164 lignes)
    ├── prisma-queries.ts           # Requêtes Prisma réutilisables (311 lignes)
    └── message-formatters.ts       # Formatage de messages (98 lignes)
```

## Modules

### `index.ts`
Point d'entrée qui enregistre toutes les routes dans l'ordre logique.

### `types.ts`
- Schémas de validation Zod (createLinkSchema, updateLinkSchema, sendMessageSchema)
- Schémas JSON pour OpenAPI (shareLinkSchema, conversationSummarySchema, etc.)
- Types TypeScript exportés

### `validation.ts`
- `GET /links/check-identifier/:identifier` - Vérifier disponibilité d'un identifiant

### `creation.ts`
- `POST /links` - Créer un lien de partage

### `retrieval.ts`
- `GET /links/:identifier` - Récupérer les détails d'un lien avec messages

### `messages-retrieval.ts`
- `GET /links/:identifier/messages` - Récupérer les messages d'un lien

### `messages.ts`
- `POST /links/:identifier/messages` - Envoyer message (anonyme)
- `POST /links/:identifier/messages/auth` - Envoyer message (authentifié)

### `management.ts`
- `PUT /links/:conversationShareLinkId` - Mettre à jour par ID base de données
- `PATCH /links/:linkId` - Mettre à jour par linkId public

### `admin.ts`
- `GET /links/my-links` - Lister les liens de l'utilisateur
- `PATCH /links/:linkId/toggle` - Activer/désactiver un lien
- `PATCH /links/:linkId/extend` - Prolonger l'expiration
- `DELETE /links/:linkId` - Supprimer un lien

## Utilitaires

### `utils/link-helpers.ts`
- `createLegacyHybridRequest()` - Adapter le contexte d'auth unifié
- `resolveShareLinkId()` - Résoudre un identifiant en ID
- `generateInitialLinkId()` - Générer linkId initial
- `generateConversationIdentifier()` - Générer identifiant de conversation
- `generateFinalLinkId()` - Générer linkId final
- `ensureUniqueShareLinkIdentifier()` - Vérifier unicité d'identifiant

### `utils/prisma-queries.ts`
- `shareLinkIncludeStructure` - Structure d'inclusion complète
- `findShareLinkByIdentifier()` - Trouver lien par différents identifiants
- `getConversationMessages()` - Récupérer messages avec pagination
- `getConversationMessagesWithDetails()` - Récupérer messages complets
- `countConversationMessages()` - Compter total de messages

### `utils/message-formatters.ts`
- `formatMessageWithUnifiedSender()` - Formatter avec sender unifié
- `formatMessageWithSeparateSenders()` - Formatter avec senders séparés

## Principes de la refactorisation

1. **Séparation des responsabilités** - Chaque module a une responsabilité claire
2. **Réutilisabilité** - Fonctions helper extraites dans utils/
3. **Types forts** - Pas de `any`, utilisation stricte de TypeScript
4. **Limite de lignes** - Chaque fichier < 800 lignes
5. **Préservation de la logique** - Aucune modification de la logique métier
6. **Codes HTTP préservés** - Tous les codes de statut HTTP maintenus
7. **Messages d'erreur préservés** - Tous les messages d'erreur maintenus

## Routes API

Toutes les routes sont préfixées par `/links`:

| Méthode | Route | Description | Auth |
|---------|-------|-------------|------|
| GET | `/check-identifier/:identifier` | Vérifier disponibilité | Required |
| POST | `/` | Créer lien | Required |
| GET | `/:identifier` | Détails du lien | Optional |
| GET | `/:identifier/messages` | Messages du lien | Optional |
| POST | `/:identifier/messages` | Envoyer message (anonyme) | Session |
| POST | `/:identifier/messages/auth` | Envoyer message (auth) | Required |
| PUT | `/:conversationShareLinkId` | Mettre à jour (DB ID) | Required |
| PATCH | `/:linkId` | Mettre à jour (linkId) | Required |
| GET | `/my-links` | Lister mes liens | Required |
| PATCH | `/:linkId/toggle` | Toggle actif/inactif | Required |
| PATCH | `/:linkId/extend` | Prolonger expiration | Required |
| DELETE | `/:linkId` | Supprimer lien | Required |

## Utilisation

```typescript
import { linksRoutes } from './routes/links';

// Enregistrer toutes les routes
await fastify.register(linksRoutes);
```

## Tests

Les tests existants continuent de fonctionner sans modification car l'API externe n'a pas changé.

## Migration depuis l'ancien fichier

Le fichier monolithique `src/routes/links.ts` (3201 lignes) a été divisé en 12 fichiers modulaires.

Aucun changement de comportement n'a été introduit. Toute la logique métier, les codes HTTP, et les messages d'erreur ont été préservés.
