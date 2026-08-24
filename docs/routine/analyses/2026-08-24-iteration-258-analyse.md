# Analyse — Itération 258 : le littéral ObjectId `/^[0-9a-fA-F]{24}$/` recopié à travers le gateway, rebranché sur `isValidMongoId`

## Protocole (démarrage)

`main` @ `5cb8ce45` (dernier commit : `Merge PR #3415 — cycle 115 : un agrégat
DIFFUSÉ ne peut pas porter la réponse d'un lecteur`). Branche
`claude/brave-archimedes-68ln0q` réalignée sur `origin/main` (0 avance / 0 retard
au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`, `bun run tsc --noEmit` (gateway) exit 0 au départ.

**Audit anti-doublon** (2 PRs ouvertes au départ) : #3421 (Android story text
objects — `apps/android` uniquement) et #3418 (web/admin `schedule-format` SSOT,
itération 257 — `apps/web/components/admin/agent/`). **Aucune ne touche
`services/gateway/src`** — zéro chevauchement de fichier.

## Sélection : **Priorité 3 — homogénéisation d'un invariant recopié, rebranché sur une SSOT existante**

Le prédicat « cet identifiant est-il un ObjectId Mongo bien formé ? » — le littéral
`/^[0-9a-fA-F]{24}$/` — vivait recopié sur **huit** sites du gateway alors qu'une
source unique existe et est déjà consommée : `isValidMongoId(id)`
(`packages/shared/utils/conversation-helpers.ts:400`), la MÊME regex ancrée, déjà
testée (`conversation-helpers.test.ts`), déjà importée par
`routes/users/blocking.ts`.

## Current state (avant correctif)

Deux familles de duplication, toutes deux du même littéral :

### A. La garde « valide ou jette », TRIPLÉE verbatim

Trois services de réaction voisins portaient chacun MOT POUR MOT la même
constante + méthode de garde, seul le NOM du domaine changeant :

| service | constante | garde |
|---|---|---|
| `ReactionService.ts:64` | `private static readonly OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/` | `validateMessageId` → `Invalid message ID format: ${id.substring(0,20)}` |
| `PostReactionService.ts:78` | idem | `validatePostId` → `Invalid post ID format: …` |
| `CommentReactionService.ts:77` | idem | `validateCommentId` → `Invalid comment ID format: …` |

Le prédicat, la borne de troncature (`substring(0, 20)`) et le gabarit du message
étaient identiques — synchronisés à la main sur trois fichiers.

### B. Le prédicat booléen inline, sur cinq sites autonomes

```
routes/anonymous.ts:91                         if (/^[0-9a-fA-F]{24}$/.test(identifier))
routes/links/utils/link-helpers.ts:56          if (/^[0-9a-fA-F]{24}$/.test(identifier))
routes/links/utils/prisma-queries.ts:91        const isObjectId = /^[0-9a-fA-F]{24}$/.test(identifier)
services/messaging/forwardAdmission.ts:225      const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/  (×2 usages)
utils/conversation-id-cache.ts:13               const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/
```

## Problems identified

1. **Un invariant SSOT consommé à moitié.** `isValidMongoId` existe précisément
   pour que ce littéral ne soit pas recopié — il l'est huit fois, dont deux fois
   à travers une constante privée nommée localement.
2. **Une garde « jumelle » tenue par la vigilance, pas par le compilateur.** Les
   trois `validate*Id` sont le patron exact que le harnais du gateway réduit sans
   cesse (« Cette entité a-t-elle une JUMELLE ? », `services/gateway/CLAUDE.md`) :
   trois copies d'une même règle, gardées à la main. La première qui dérive (un
   `{24}` transformé en `{23,25}`, un `substring(0,20)` déplacé) casse le contrat
   sans qu'aucune autre ne le sache.

## Root causes

Chaque site a posé la regex à mesure du besoin, avant que `isValidMongoId` ne
devienne le point de convergence (il n'était consommé que par `blocking.ts`). Les
trois `validate*Id` ont été copiés-collés entre services frères créés à des cycles
différents. Aucun garde-fou ne signalait la présence d'un littéral qui a une SSOT.

## Business impact

**Nul en runtime** — le comportement est rigoureusement inchangé : `isValidMongoId`
EST `/^[0-9a-fA-F]{24}$/.test`, la garde `!id` court-circuite en amont comme avant,
et les messages d'erreur (`Invalid <noun> ID format: …`, troncature à 20) sont
conservés à l'identique. Le gain est de **cohérence et de prévention de dérive** :
huit sites qui doivent rester d'accord partagent désormais une définition unique,
gelée par test.

## Technical impact

- **Nouveau `services/gateway/src/utils/object-id.ts`** : `assertValidObjectId(id,
  label)` — la garde « valide ou jette » écrite une fois, paramétrée par le seul
  axe qui varie (le libellé de domaine), reliée à `isValidMongoId`. Docstring en
  style maison.
- **Trois services** : constante `OBJECT_ID_REGEX` supprimée, `validate*Id` réduit
  à une délégation d'une ligne. Les 12 sites d'appel (`this.validate*Id(x)`,
  4× par service) restent INCHANGÉS — rayon de souffle minimal.
- **Cinq sites booléens** rebranchés sur `isValidMongoId` (prédicat, pas garde
  jetante). Deux constantes locales (`OBJECT_ID_RE`, `OBJECT_ID_REGEX`)
  supprimées.
- **`tsc --noEmit` (gateway) : exit 0.** Types inchangés. `isValidMongoId(id:
  string)` reçoit partout une chaîne (garde `!id`/`x &&`/type `string` en amont).

## Risk assessment

- **Négligeable.** Le prédicat est identique au littéral qu'il remplace, à la
  source. Toutes les suites concernées restent vertes.
- **Hors périmètre, par décision** : les deux `normalizeConversationId`
  (`socketio/utils/socket-helpers.ts`, `MeeshySocketIOManager.ts`) inlinent aussi
  la regex, mais à l'intérieur de deux fonctions quasi-jumelles (injection Prisma +
  cache) — les consolider est un twin PLUS GROS, laissé à une passe dédiée.
- **Rollback :** réinliner le littéral aux huit sites, supprimer `object-id.ts` et
  son test.

## Proposed improvements (réalisées)

1. **RED** : 6 tests dans `utils/__tests__/object-id.test.ts` (valide → ne jette
   pas ; vide/court/non-hex/24-non-hex → jette avec préfixe + troncature ; label
   interpolé ; troncature à 20). Un des tests a d'abord ROUGI en révélant que le
   24-char non-hex est tronqué à 20 — comportement correct, assertion corrigée.
2. **GREEN** : `assertValidObjectId` + docstring.
3. **Rebranchement** des 3 services (garde) + des 5 sites booléens (prédicat).

## Expected benefits

- **Huit copies du littéral devenues un import** sur les deux familles traitées :
  la garde jetante triplée (3 services) et cinq prédicats booléens autonomes.
- La garde `Invalid <label> ID format:` déclarée UNE fois.
- La dérive silencieuse du prédicat ou de la troncature, sur ces huit sites,
  devient impossible sans faire tomber un test.

**Ce lot ne prétend PAS épuiser le littéral dans le gateway** (un compte est une
AFFIRMATION, `services/gateway/CLAUDE.md`). Un balayage mesuré révèle les familles
qui SUBSISTENT, laissées à des lots dédiés (voir « Améliorations futures ») —
chacune a une raison d'être traitée séparément : forme différente, cible SSOT
différente, ou proximité d'un travail concurrent.

## Implementation complexity

- **Faible.** 1 fichier neuf (util + docstring), 8 fichiers rebranchés (import +
  1–3 lignes chacun), +6 tests.

## Validation criteria

- [x] RED prouvé : le test importe un module absent (échec de résolution), puis
      1 assertion tombe sur la troncature avant correction.
- [x] GREEN : `object-id` 6/6.
- [x] Services de réaction + handlers : **429/429** (15 suites).
- [x] `forwardAdmission` + `conversation-id-cache` + `object-id` : **33/33**.
- [x] Routes share/link/anonymous : **741/741** (40 suites).
- [x] `bun run tsc --noEmit` (gateway) : exit 0.
- [x] Zéro littéral `/^[0-9a-fA-F]{24}$/` restant dans les 8 fichiers touchés.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre) — inventaire mesuré du littéral restant

Balayage `grep '[0-9a-f].*{24}'` sur `services/gateway/src` (hors tests, hors la
docstring de `object-id.ts`). Trois familles, chacune un lot à part :

### 1. Prédicat runtime `.test()` encore inline (bindable à `isValidMongoId`)
- `socketio/handlers/ReactionHandler.ts:408`, `socketio/handlers/AttachmentReactionHandler.ts:21`
  (const) — famille socket des réactions ; pré-check qui rend une erreur au
  callback (pas une garde jetante), patrons de test propres aux handlers.
- `socketio/utils/socket-helpers.ts:103`, `MeeshySocketIOManager.ts:1117` — les
  deux `normalizeConversationId` quasi-jumelles (cache + résolution Prisma) : twin
  PLUS LARGE, le CLAUDE.md note déjà le cache « duplicate » côté manager.
- `socketio/queuedEventContract.ts:121` (const `OBJECT_ID`).
- `routes/admin/agent.ts:17`, `routes/admin/agent-topics.ts` (×5) — littéral EXACT,
  mais routes de la console agent, laissées à l'écart d'un travail concurrent
  (#3418 touche `apps/web/components/admin/agent/`).
- **Variante `i`-flag `/^[0-9a-f]{24}$/i`** (équivalente : le flag `i` fait matcher
  `A-F`) : `services/MessageReadStatusService.ts:92`,
  `services/notifications/NotificationService.ts:4547,4666`,
  `routes/conversations/messages.ts:69`. Forme différente → rebranchement
  fonctionnellement neutre mais à prouver cas par cas.

### 2. Cluster Zod `.regex(/^[0-9a-fA-F]{24}$/, …)` (cible : `CommonSchemas.mongoId`)
`validation/{mentions,message-read-status,socket-event,messages,admin,conversation-encryption}-schemas.ts`,
`routes/posts/types.ts` (×3), `routes/admin/agent.ts` (×3). Rebranchement viable
MAIS il change le message d'erreur servi (`Invalid MongoDB ObjectId format` vs
`ID MongoDB invalide`) — décision de contrat, tests `violations[].message` requis.

### 3. Motifs de JSON-Schema `pattern: '^[0-9a-fA-F]{24}$'` (NON bindables)
`routes/calls.ts` (×7), `routes/admin/agent.ts`, `routes/conversation-preferences.ts`.
Ce sont des chaînes passées à AJV/fast-json-stringify, pas des appels de fonction —
aucune SSOT de fonction ne s'y substitue. Une constante partagée de motif serait
le seul geste possible, gain marginal.

### 4. Footgun `substring` sur entrée nullish
`assertValidObjectId(undefined)` jette un `TypeError` opaque (comme les trois
originaux) plutôt qu'un message propre — comportement PRÉSERVÉ ici. Durcissement
(troncature sûre) à décider en connaissance des tests handler qui documentent ce
footgun (`PostReactionHandler.test.ts:786`).
