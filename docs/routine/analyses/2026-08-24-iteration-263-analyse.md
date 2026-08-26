# Iteration 263 — `UpdateMessageBodySchema.content` : le seul transport d'écriture de contenu SANS plafond de sécurité

## Protocole (démarrage)
`main` @ `5a46805c` (dernier commit : `Merge PR #3484 — Cycle 126 convergence`).
Branche `claude/brave-archimedes-u6wx7f` alignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android/Python-ML → surface
testable = TypeScript (web/shared/gateway). Setup parité :
`bun install --ignore-scripts` (3854 paquets), `npx prisma generate --generator
client` + `bun run build` dans `packages/shared`. Suite
`services/gateway/src/__tests__/unit/validation/messages-schemas.test.ts` verte
au départ (74 tests).

**Audit anti-doublon** (6 PRs ouvertes au départ) : #3485 (android feed), #3481
(gateway `anonymous.ts`/`ip-range.ts`), #3477 (android calls), #3475 (web Prisme
posts/focal), #3474 (iOS NSE), #3470 (iOS a11y). **Aucune PR ouverte ne touche
`services/gateway/src/validation/messages-schemas.ts` ni
`socket-event-schemas.ts`** — zéro chevauchement de fichier.

## Sélection : **Priorité 2 — jumeau de contrat portant encore le défaut qu'une famille corrigée a fermé partout ailleurs**

Le dépôt applique un **plafond de sécurité** (`MAX_CONTENT_BYTES = 100_000`) sur
le champ `content` de TOUS les transports SOCKET d'écriture de message. Le
transport REST d'édition `PUT /messages/:messageId` — utilisé par le client iOS
— ne le portait pas. Même classe que les défauts de « jumelle » récurrents du
dépôt (`CLAUDE.md` gateway § « Cette entité a-t-elle une JUMELLE ? ») : une règle
appliquée sur N-1 des N sites qui la partagent.

## Current state (avant correctif)

Trois transports écrivent le contenu textuel d'un message ; leur borne haute :

| transport | schéma | plafond `content` |
|---|---|---|
| SOCKET `message:send` | `SocketMessageSendSchema` | `.max(MAX_CONTENT_BYTES)` = 100 000 |
| SOCKET `message:send-with-attachments` | `SocketMessageSendWithAttachmentsSchema` | `.max(MAX_CONTENT_BYTES)` |
| SOCKET édition | `SocketMessageEditSchema` | `.max(MAX_CONTENT_BYTES)` |
| REST `POST /conversations/:id/messages/:id` (édition, web) | `EditMessageBodySchema` | `.max(10000)` |
| **REST `PUT /messages/:messageId` (édition, iOS)** | **`UpdateMessageBodySchema`** | **AUCUN** |

```ts
// validation/messages-schemas.ts (avant)
export const UpdateMessageBodySchema = z.object({
  content: z.string().trim().optional(),   // ← aucune borne haute
  isEdited: z.boolean().optional()
}).strict();
```

La route (`routes/messages.ts:462`) valide par
`validateBody(UpdateMessageBodySchema)`. Le garde AVAL
(`services/messaging/messageEditContent.ts:78`) ne rejette que le contenu VIDE
(`content.length === 0`), jamais le démesuré. Le contenu édité est ensuite
PERSISTÉ (`Message.content`) puis DIFFUSÉ en `message:edited` à toute la
conversation.

`MAX_CONTENT_BYTES` était par ailleurs une constante `const` PRIVÉE de
`socket-event-schemas.ts` — inaccessible au fichier `messages-schemas.ts` qui en
avait besoin.

## Problems identified

1. **Plafond de sécurité manquant sur un chemin d'écriture.** Le seul des trois
   transports de contenu sans borne haute. Un corps d'édition démesuré traverse
   le gate, est persisté et diffusé.
2. **Constante partagée sans domicile partagé.** `MAX_CONTENT_BYTES` vivait en
   `const` privée d'un des consommateurs, empêchant structurellement le second de
   l'appliquer — la même racine que la dette refermée par `time-range.ts`
   (itération 238) et `object-id.ts`.

## Root cause

Le plafond a été posé sur les transports SOCKET quand ils ont été écrits, comme
`const` locale. Le transport REST d'édition, écrit ailleurs et plus tard, n'a
jamais reçu la borne — et la constante privée rendait impossible de la partager
sans la recopier. Classe « jumelle » : une règle qui doit être retapée à chaque
site finit par manquer à l'un d'eux.

## Business / technical impact

- **Technique.** Un corps d'édition jusqu'à la limite `bodyLimit` de Fastify
  (défaut ~1 Mo, aucun override custom trouvé) — soit ~10× le plafond visé —
  était persisté en base et diffusé à chaque membre de la conversation, sans
  plafond intermédiaire. Amplification : le fan-out `message:edited` multiplie la
  charge par le nombre de destinataires connectés.
- **Produit.** Aucun client légitime ne produit un tel corps (le web plafonne à
  10 000, iOS à sa propre limite de saisie). **Piège armé plus que panne** — mais
  la règle du dépôt (`CLAUDE.md` gateway, cycle 84) est explicite : on ne laisse
  pas un piège armé au motif que personne n'a encore marché dessus.

## Risk assessment

- **Faible.** Le schéma a un seul call site (`routes/messages.ts:462`) qui rejette
  déjà `!success` par la voie `validateBody`. La borne n'ajoute aucun type inféré
  (`z.infer` inchangé — `content?: string`). Le régime `.trim()` précède `.max()` :
  un corps démesuré non-blanc reste démesuré après trim.
- **Rollback :** revert du commit unique (retirer `.max()`, le module
  `content-limits.ts`, les deux imports, les 2 tests).

## Proposed improvements (implémenté)

1. **Extraire `MAX_CONTENT_BYTES` dans un module feuille** `validation/content-limits.ts`
   (doc de la borne portée avec la constante). SSOT — trois transports, deux
   fichiers, une constante. Mirroir exact de `time-range.ts` / `object-id.ts`.
2. **`socket-event-schemas.ts`** importe la constante (refactor behavior-preserving).
3. **`UpdateMessageBodySchema.content`** reçoit `.max(MAX_CONTENT_BYTES)`, aligné
   sur le jumeau SOCKET le plus proche (`SocketMessageEditSchema`).

## Expected benefits
- Tous les chemins d'écriture de contenu appliquent la MÊME borne, à la source.
- La divergence ne peut plus se reformer : la borne a un domicile unique.

## Implementation complexity
**Faible.** 3 fichiers de production (1 neuf feuille, 2 imports + 1 `.max()` +
commentaires), 1 fichier de test (2 gardes + 1 import).

## Validation criteria
- [x] RED prouvé : `content` de `MAX_CONTENT_BYTES + 1` accepté avant fix
      (`Expected false / Received true`).
- [x] Garde de frontière : `content` de `MAX_CONTENT_BYTES` exact accepté (déjà
      vert avant fix — non-régression).
- [x] GREEN : `messages-schemas.test.ts` 77/77.
- [x] Jumeaux SOCKET inchangés : `socket-event-schemas.test.ts` + `messageEditContent.test.ts` 43/43.
- [x] Répertoire `validation` + routes message : 427/427 (14 suites).
- [x] `tsc --noEmit` (gateway) : 0 erreur.
- [ ] Full gateway suite (background) : aligné sur baseline.
- [ ] CI verte sur la PR.

## Future improvements (candidats du survey non retenus ce cycle)
- **`assertReactionAllowed(count)` consolidé** : le garde de limite de réactions
  (`isReactionAllowed(count)` → `throw ConflictError('REACTION_LIMIT_REACHED')`)
  est recopié verbatim dans 5 services (`ReactionService`, `PostReactionService`,
  `CommentReactionService`, `AttachmentReactionService`, `PostCommentService`).
  Miroir exact du précédent `assertValidObjectId`. DRY, impact maintenabilité.
- **`decodeCursor` validation de type** (`utils/keyset-cursor.ts`) : ne vérifie
  que la véracité (`data.createdAt && data.id`), pas le TYPE, avant de caster en
  `CursorData` et de composer un filtre Prisma `Date`. Gap de validation, sévérité
  limitée (curseurs server-mintés). À peser.
