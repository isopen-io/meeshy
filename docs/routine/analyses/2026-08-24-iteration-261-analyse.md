# Analyse — Itération 261 : le littéral ObjectId `/^[0-9a-fA-F]{24}$/` recopié dans le gateway sous TROIS idiomes, dont un sans SSOT

## Protocole (démarrage)

`main` @ `661a1081` (dernier commit : `Merge PR #3468 — renuméroter la leçon
269 → 272`). Branche `claude/brave-archimedes-yb2wvx` réalignée sur `origin/main`
au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`, `bun run tsc --noEmit` (gateway) exit 0 au départ.

**Audit anti-doublon** (4 PRs ouvertes au départ) :
- #3469 (Android comment translation — `apps/android` uniquement)
- #3467 (gateway/iOS notifications — `services/gateway/src/services/notifications/`,
  `packages/shared/types/notification.ts`, iOS NSE)
- #3465 (gateway messaging/notifications — `services/messaging/messageNotificationFanOut.ts`,
  `services/notifications/NotificationService.ts`)
- #3463 (gateway search pagination — `routes/conversations/messages.ts`)

**Zéro chevauchement de fichier** avec ce lot : aucun des 19 fichiers touchés ici
n'apparaît dans ces PRs. Les zones `notifications/`, `messageNotificationFanOut.ts`,
`notification.ts` et `conversations/messages.ts` ont été délibérément évitées.

## Sélection : **Priorité 3 — achever une migration SSOT commencée aux itérations 258/259, sur les copies restées hors du filet**

Les itérations 258 et 259 ont créé la SSOT du prédicat « chaîne = ObjectId
MongoDB » :
- `packages/shared/utils/object-id.ts` → `OBJECT_ID_REGEX` (`/^[0-9a-fA-F]{24}$/`)
  + `isValidObjectId` (type guard).
- `services/gateway/src/utils/object-id.ts` → `assertValidObjectId` (garde
  « valide ou jette », consommée par les 3 services de réaction).

Mais la 258 n'a rebranché que **les 3 gardes de réaction**, et la 259 n'a traité
que **le package shared lui-même**. Le RESTE du gateway — ~24 sites — a continué
de recopier le littéral à la main, sous **trois idiomes distincts** :

| idiome | forme | SSOT cible |
|---|---|---|
| A — prédicat runtime | `/^[0-9a-fA-F]{24}$/.test(id)` ou `const OBJECT_ID = /…/` | `isValidObjectId` / `OBJECT_ID_REGEX` (existe) |
| B — schéma Zod | `z.string().regex(/^[0-9a-fA-F]{24}$/, …)` | `OBJECT_ID_REGEX` passé à `.regex()` (existe) |
| C — `pattern` JSON Fastify | `pattern: '^[0-9a-fA-F]{24}$'` (chaîne) | **AUCUNE — à créer** |

L'idiome C est le seul sans source : une chaîne, que ni `isValidObjectId` (RegExp)
ni `CommonSchemas.mongoId` (Zod) ne peuvent servir. C'est le travail **neuf** du
lot ; les idiomes A et B en sont l'extension mécanique.

## Current state (avant correctif)

### A. Prédicat runtime (10 sites)
`socketio/queuedEventContract.ts:121`, `socketio/handlers/ReactionHandler.ts:408`,
`socketio/handlers/AttachmentReactionHandler.ts:21`, `socketio/utils/socket-helpers.ts:103`,
`socketio/MeeshySocketIOManager.ts:1117`, `validation/message-read-status-schemas.ts:20`,
`routes/admin/agent.ts:13`, `routes/admin/agent-topics.ts:23`,
`routes/users/profile.ts:960,1190`, `routes/users/preferences.ts:384`.

Deux de ces sites (`profile.ts`, `preferences.ts`) portaient la forme
syntaxique **divergente** `/^[a-f\d]{24}$/i` — même langage (24 hex, casse
indifférente), une graphie de plus à maintenir.

### B. Schéma Zod (9 sites)
Six fichiers `validation/*.ts` déclaraient chacun un `const mongoId =
z.string().regex(/^[0-9a-fA-F]{24}$/, …)` **identique** ; `routes/posts/types.ts`
inline le même à 3 endroits, `routes/admin/agent.ts` à 3 autres.

Piège relevé : les messages d'erreur **diffèrent** entre sites
(`'Invalid MongoDB ObjectId format'`, absence, ou `'ID MongoDB invalide'` dans la
SSOT Zod partagée). Router vers `CommonSchemas.mongoId` aurait donc **changé le
message d'erreur d'API** — un changement de comportement. La migration ne swappe
que le **littéral regex**, en conservant chaque message intact.

### C. `pattern` JSON Fastify (9 sites)
`routes/calls.ts` ×7, `routes/conversation-preferences.ts:130`,
`routes/admin/agent.ts:122` (`objectIdParam`, une SSOT locale à un seul fichier).

## Root cause

Une SSOT n'homogénéise que ce qui la CONSOMME. Créer `OBJECT_ID_REGEX` (259) et
`assertValidObjectId` (258) n'a pas rebranché les copies : chaque idiome exige une
FORME différente de la même règle (booléen `.test`, argument `.regex()`, chaîne
`pattern`), et l'idiome-chaîne n'avait aucune source du tout. Une migration SSOT
« finie » sur un idiome peut laisser deux frères entiers non touchés.

## Business impact
Faible en régime nominal (tous les littéraux décrivent le même langage 24-hex),
mais la divergence est un défaut latent : `/^[a-f\d]{24}$/i` vs
`/^[0-9a-fA-F]{24}$/` sont déjà deux graphies ; la première qui change (bornes,
casse, préfixe) casse la sémantique sur son seul site sans qu'aucun autre ne le
sache. C'est exactement le mode d'échec que la SSOT existe pour fermer.

## Technical impact
- 24 littéraux inline → 1 seule source (`OBJECT_ID_REGEX` + sa projection chaîne
  `OBJECT_ID_PATTERN`), consommée par 19 fichiers.
- Une graphie divergente (`/^[a-f\d]{24}$/i`) éliminée.
- Aucune requête, aucun champ, aucun message d'erreur modifié.

## Risk assessment
**Très faible.** Refactor pur, comportement rigoureusement préservé :
- Idiome A : `isValidObjectId(x)` EST `typeof x === 'string' && OBJECT_ID_REGEX.test(x)` ;
  les sites `.test(string)` gardent leur sémantique (le typeof est un no-op sur
  une valeur déjà typée string).
- Idiome B : le littéral seul change ; chaque message d'erreur est conservé.
- Idiome C : `OBJECT_ID_PATTERN === OBJECT_ID_REGEX.source` (`'^[0-9a-fA-F]{24}$'`),
  ancres comprises — chaîne identique à l'ancienne.

## Scope honnête — ce qui est EXCLU, et pourquoi (changement de comportement)

Un second cluster existe : `/^[a-f0-9]{24}$/` — **minuscules uniquement, sans
flag `/i`** — sur `validation/notification-schemas.ts` (×11),
`services/posts/mediaOwnership.ts`, `routes/posts/sounds.ts`,
`routes/posts/types.ts:159` (`soundId`). C'est un langage **différent**
d'`OBJECT_ID_REGEX` (qui accepte `A-F`). Le migrer **élargirait** la validation
pour accepter l'hexa majuscule — un changement de comportement, pas un refactor.
Exclu de ce lot behavior-preserving ; à instruire séparément avec une décision
sémantique (« un ObjectId majuscule doit-il être accepté sur ces surfaces ? »).

## Validation criteria
- `bun run tsc --noEmit` (gateway + shared) → 0 erreur.
- Nouveau témoin `OBJECT_ID_PATTERN` : RED prouvé (2 tests) avant la constante,
  GREEN après.
- Suites affectées vertes (45 suites, 1570 tests) : validation schemas, socketio
  handlers, socket-helpers, agent/agent-topics routes, calls routes,
  conversation-preferences, message-read-status, mentions, admin-schemas,
  conversation-encryption, users profile/preferences, posts types/storyEffects.

## Proposed improvements (réalisées)
Voir `docs/routine/plans/2026-08-24-iteration-261-plan.md`.
