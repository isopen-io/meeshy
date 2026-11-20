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
Routes CRUD principales pour les communautés.

**Un membre est une ligne `CommunityMember` ACTIVE (#16603).** Un départ ou un retrait laisse la ligne en `isActive: false` : toute route qui demande « est-il membre ? » passe `activeMembershipOf(userId)` (`serialization.ts`), et tout `memberCount` passe `COMMUNITY_ACTIVE_COUNTS`. La liste et le détail se servent par le même `communityForViewer`.

- `GET /communities/check-identifier/:identifier` - Vérifier disponibilité d'un identifiant
- `GET /communities` - Liste des communautés de l'utilisateur (avec pagination et recherche) ; une communauté quittée n'y figure plus, chaque carte sert `currentUserRole`, et la route ne charge plus la liste des membres de chaque communauté
- `GET /communities/:id` - Détails d'une communauté (par ID ou identifier) ; sert `currentUserRole` (rôle ACTIF du lecteur, `admin` pour le créateur, `null` sinon — #6378). Ne charge que la ligne d'adhésion active du lecteur, jamais la liste des membres ; un ancien membre (`isActive: false`) est refusé d'une communauté privée ; `memberCount` ne compte que les membres actifs. Sert aussi `currentUserJoinRequest` (#19868) : `'pending'` quand le lecteur, non membre d'une communauté qui valide chaque entrée, attend une réponse, `null` sinon — l'état seul, jamais l'identifiant de la demande ni rien d'un autre demandeur (`join-request-state.ts`). Et `currentUserJoinRetryAt` (#19879) : après un refus de moins de sept jours, l'instant ISO où le lecteur peut redemander, `null` sinon — jamais qui a refusé.
- `POST /communities` - Créer une nouvelle communauté
- `GET /communities/:id/conversations` - Conversations d'une communauté (privée : membres ACTIFS et créateur seulement)
- `POST /communities/:id/conversations/:conversationId` - Rattacher une conversation : administrateur ACTIF (ou créateur) de la cible, et de la source si elle en a une
- `POST /conversations` avec `communityId` (route des conversations) - Créer un salon de la communauté : communauté active (sinon 404), appelant membre ACTIF ou créateur. Ses participants qui ne sont pas membres actifs y ENTRENT sous la loi de `…/invite` (#16639, `services/conversations/communityMembershipSync.ts`) : communauté privée ⇒ créateur, administrateur ou modérateur seulement (403 `COMMUNITY_INVITE_FORBIDDEN`), compte vivant et sans blocage (404), ligne d'un retiré réactivée en `member`. Le refus tombe AVANT la création : rien n'est écrit. Différence assumée avec `…/invite` : le créateur de la communauté sans ligne active (il ne peut ni partir ni être retiré) y revient `admin`.

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

**Qui peut être ajouté (#6376).** `POST …/members` et `POST …/invite` (`membership.ts`) ajoutent quelqu'un sans son accord : toutes deux passent `isAddableUser` (`addable-user.ts`) — compte vivant (ni `deactivatedAt`, ni `deletedAt`, `isActive`), aucun blocage dans un sens ou dans l'autre — et rendent le même 404 qu'un inconnu.
- `PATCH /communities/:id/members/:memberId/role` - Modifier le rôle d'un membre (admin uniquement)
- `DELETE /communities/:id/members/:memberId` - Retirer un membre (admin uniquement)

**Ne plus être membre d'une communauté qui garde ses salons, c'est en sortir (#16704).** `DELETE …/members/:memberId` et `POST /communities/:id/leave` (`membership.ts`), sur une communauté privée ou désactivée (`communityGuardsItsSalons`), font sortir la personne de chaque salon vivant de la communauté par `exitCommunitySalons` (`services/conversations/communitySalonExit.ts`) : le même départ que `POST /conversations/:id/leave` (`leftAt`, succession du créateur, avis « X a quitté la conversation », `conversation:participant-left` avec l'effectif absolu, fin d'appartenance), sans jamais clore un salon. Une communauté publique vivante ne fait sortir de rien : ses salons sont ouverts à quiconque.

**Une demande d'entrée ne survit ni à l'entrée ni à trente jours (#19872).** Toute entrée — adhésion directe, acceptation, `POST …/invite`, `POST …/members`, `applyCommunityAdmission` — clôt les demandes en attente de la personne (`closePendingJoinRequests`, `services/community-join-request-lifecycle.ts` : `accepted`, au nom de qui fait entrer ; ne lève jamais). Une demande non tranchée en trente jours (`JOIN_REQUEST_TTL_MS`) n'est plus servie ni tranchable : chaque lecture et chaque bascule passe par `liveJoinRequestWhere`, et redemander écrit l'ancienne `expired`. Décision : `services/gateway/decisions/2026-11-19-une-demande-d-entree-se-clot-a-l-entree-et-expire-a-30-jours-19872.md`.

**Une acceptation restée sans entrée redevient tranchable (#19924).** Quand l'écriture de l'appartenance ET sa relecture échouent, l'acceptation ne rouvre rien sur une ignorance (#19914). `reopenOrphanedAcceptances` (même service) la rouvre au prochain accès — liste des demandes d'un intendant (première page), détail lu par le demandeur — sur PREUVE seulement : décision vieille de plus de dix minutes (`ORPHAN_ACCEPTANCE_GRACE_MS`), demande encore vivante par son âge, aucune autre demande en attente, et aucune ligne d'appartenance pour la paire ou seulement des lignes inactives quittées AVANT la décision. Une ligne active, un départ postérieur ou un départ sans date ne rouvrent rien ; la réparation ne lève jamais. Une demande rouverte qui reste en attente s'annonce aux intendants par `community:join-requested` (compteur compris), quelle que soit la porte qui l'a réparée (#20002) ; la décision effacée (`requestId`, `decidedBy` d'avant) est journalisée, jamais servie.

**Entrer par une autre porte se voit aussi (#19406).** Les admissions IMPLICITES — créer un salon avec un `communityId`, y ajouter ou y inviter quelqu'un, le débannir, y entrer par le lien d'un salon, rattacher un salon à une communauté privée (`POST /communities/:id/conversations/:conversationId`), et l'entrée des occupants quand la communauté passe en privée — ont toutes un écrivain unique, `applyCommunityAdmission` (`services/conversations/communityMembershipSync.ts`). Il reçoit l'annonce en paramètre REQUIS (`CommunityMemberAnnounce`, `services/community-member-broadcast.ts`) et annonce ce qu'il a ÉCRIT : `community:member-joined`, `via: self` pour l'appelant qui revient administrateur, `invited` sinon, rang écrit, effectif d'après l'écriture, relu une fois pour tout le lot. Le cliquet `src/__tests__/community-member-writer-sweep.test.ts` fige chaque fichier qui écrit une ligne `CommunityMember` avec la façon dont il le fait savoir ; reste muet : la désactivation des appartenances d'un compte supprimé (#18769).

### settings.ts
Paramètres et modifications:
- `PUT /communities/:id` - Mettre à jour une communauté (créateur uniquement)
  - **Passer en privée fait entrer les occupants de ses salons (#16723).** Une communauté publique qui devient privée (ici, ou par `PATCH /admin/communities/:id`) fait d'abord entrer dans la communauté chaque occupant inscrit, actif et non banni de ses salons (clos compris) qui n'en a JAMAIS été membre, sous l'autorité du créateur (`admitSalonOccupants`, `services/conversations/communitySalonAdoption.ts` : compte vivant, aucun blocage avec le créateur) ; un ANCIEN membre (parti, ou retiré d'une communauté encore publique) n'est pas réinscrit. Puis, la bascule écrite, une seconde passe rattrape les retardataires et ceux qui n'ont pas pu entrer — anciens membres compris — sortent des salons (`closeSalonsAfterSwitch`, loi de #16704). Une admission en panne n'écrit pas la bascule (500, rejouable). Les invités sans compte et les bots ne sont pas touchés.
  - **Le geste se voit chez les membres (#18435).** Après l'écriture — ici comme par `PATCH /admin/communities/:id` — `community:updated` part, après la réponse, sur la room personnelle `user:<id>` de chaque membre ACTIF et du créateur (`scheduleCommunityUpdatedBroadcastFrom`, `services/community-updated-broadcast.ts`). La charge (`CommunityUpdatedEventData`) ne porte que l'identité publique écrite et l'effectif actif : ni membres, ni présence, ni coordonnées. Une communauté désactivée n'annonce rien. Le web l'applique au cache (`apps/web/src/lib/api/community-live.ts`) ; iOS et Android : #18439.
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
