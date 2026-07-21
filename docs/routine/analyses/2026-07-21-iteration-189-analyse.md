# Iteration 189 — Sûreté Unicode de la troncature des aperçus de contenu utilisateur côté **gateway** : les corps de push, sous-titres, e-mails et snapshots de réponse coupent par unité UTF-16 → paire de substitution scindée → `�` livré sur l'écran verrouillé de TOUTES les plateformes (iOS/Android/web)

## Protocole (démarrage)
`main` @ `04b9bda7` (derniers merges : #2250 android/auth saved-account picker ;
#2247 web share-link truncation ; itérations 187/188 : doctrine `sliceCodePoints`
côté **web** — `truncate.ts`, `community-identifier.ts`, `link-name-generator.ts`).
Branche `claude/brave-archimedes-4r4eh6` réinitialisée sur `origin/main`. Ce cycle
prend **189**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` (le postinstall `generate` échoue
sur fetch pnpm via proxy self-signed — prérequis d'environnement, pas un défaut de
code). Prisma client régénéré (`packages/shared --generator client`) + `dist`
shared rebuild (nécessaires pour un typecheck gateway propre). Harnais validé ce
cycle : shared vitest **1389/1389** (48 suites) ; gateway `tsc --noEmit`
**0 erreur** (après prisma generate) ; gateway jest ciblé — postReplySnapshot +
Comment/PostReactionHandler **52/52**.

PRs ouvertes au démarrage : #2249 (web/messaging `validateMessageContent` trim,
branche sœur `brave-archimedes-w0jdlq`) + ~19 PRs iOS (`laughing-thompson` swarm,
a11y/i18n/design-tokens). **Non touchées.** #2249 traite déjà le candidat #1 de la
section « Future improvements » de 188 (`validateMessageContent`) → **écarté pour
éviter le doublon**.

Sélection : **Priorité 1 (revue état-de-l'art d'une fonctionnalité récente) +
propagation de doctrine.** Les itérations 187/188 ont établi et mergé la doctrine
« découper par point de code, jamais par unité UTF-16 » côté web. Une revue
serveur (`grep` des `.substring/.slice(0, N)` sur du contenu) révèle que le
**gateway** — qui alimente TOUTES les plateformes — porte encore le défaut de
classe sur les **aperçus de contenu utilisateur livrés** (push, e-mail, socket).
Impact bien plus large que les utils web (un seul client).

## Current state

### `services/gateway/src/services/notifications/NotificationService.ts`
Sept points de coupe par unité UTF-16 sur du contenu utilisateur **livré** :
- l.752 `params.subtitle.trim().slice(0, 160)` — sous-titre persisté (LISTE/REST)
- l.806 `params.subtitle.trim().slice(0, 120)` — sous-titre push + toast socket
- l.852 `params.content.substring(0, 200)` — **corps du push (`pushBody`)**, écran verrouillé
- l.1043/1055 `params.content.substring(0, 500)` — `details` des e-mails (sécurité + notif)
- l.1322 `matchedTranslation[1].text.substring(0, 200)` — contenu traduit (Prisme) dans le payload push
- l.1504 `message.content.substring(0, 100) + '…'` — aperçu message d'une notif de réaction

### Snapshots de réponse et aperçus de réaction
- `services/messaging/postReplySnapshot.ts:56` `(content).trim().slice(0, 80)` — `previewText` gelé dans `Message.metadata.postReplyTo`
- `services/posts/postReplySnapshot.ts:42` `trimmed.slice(0, 80)` — idem (2e implémentation)
- `socketio/handlers/CommentReactionHandler.ts:347` `comment.content?.slice(0, 80)` — `commentPreview` d'une notif de réaction
- `socketio/handlers/PostReactionHandler.ts:483` `post.content?.slice(0, 80)` — `postPreview` d'une notif de réaction

### SSOT préexistantes (contexte)
`routes/conversations/core.ts:53` `truncateMessagePreview` boucle **déjà** par
point de code (fixé antérieurement) mais borne un **compte de points de code**
(300), sémantique distincte d'un budget d'unités UTF-16 → laissée **inchangée**
(voir Risk assessment). Côté web, `apps/web/utils/truncate.ts` porte le
`sliceCodePoints` mergé en 187.

## Problems identified
1. **Coupe scindant une paire de substitution → `�` livré (chemins live,
   multi-plateformes).** `🎉` = paire UTF-16. Un contenu `'A'.repeat(199) + '🎉'`
   tronqué par `substring(0, 200)` capture 199 `A` + la demi-paire haute isolée
   `\uD83C`, rendue `�`. Le produit étant un chat social **multilingue** (emoji
   omniprésents, CJK étendu, drapeaux régionaux), le défaut est fréquent. Il
   apparaît sur l'écran verrouillé (push), dans l'e-mail d'alerte, dans le toast
   in-app, et **figé** dans le snapshot de réponse (persisté → durable).
2. **Duplication du défaut de classe sur 5 fichiers gateway / 11 points de coupe**
   — aucune SSOT serveur pour la découpe sûre par point de code (le web en a une,
   pas le gateway).

## Root causes
`String.prototype.substring` / `slice` opèrent sur les unités UTF-16, pas sur les
points de code — la coupe peut atterrir au milieu d'une paire de substitution.
Défaut de la classe **exactement** corrigée côté web en 187/188 (`sliceCodePoints`).

## Business impact
`�` dans une notification push est le **premier contact visuel** hors-app avec
Meeshy (écran verrouillé, bannière). Un artefact cassé y nuit directement à la
crédibilité produit, sur TOUTES les plateformes simultanément (le gateway est la
source unique des payloads). Le snapshot de réponse corrompu est **persisté** →
le glyphe cassé survit à l'expiration/suppression du post cité.

## Technical impact
Défaut de correctness dans des chemins live serveur. **Zéro duplication ajoutée** :
introduction d'**une** SSOT serveur `sliceCodePoints` dans
`packages/shared/utils/text-truncate.ts` (le lieu inter-services, déjà importé par
le gateway), réutilisée aux 11 points. Aucune signature publique modifiée, aucun
impact réseau/état/schéma. L'invariant « sortie ≤ N unités UTF-16 » est **préservé**
(borne aval APNs/colonnes DB intacte) : `sliceCodePoints` borne la longueur UTF-16
tout en écartant en entier un caractère astral qui déborderait.

## Risk assessment
Faible. Un nouvel util pur + testé (7 cas) + 6 fichiers gateway en substitution
mécanique. Comportement **ASCII bit-pour-bit préservé** (les entrées ASCII
traversent `sliceCodePoints` à l'identique d'un `substring`). `truncateMessagePreview`
(`core.ts`) **non touché** : il borne un compte de *points de code* (300), pas
d'unités UTF-16 — le refactorer changerait son plafond pour du contenu astral sans
gain de correctness (il est déjà surrogate-safe) → hors périmètre pour préserver le
comportement. Web `truncate.ts` **non touché** : sa copie testée reste en place
(migration web→shared = travail futur, plus de risque de résolution jest).

## Proposed improvements
1. **`packages/shared/utils/text-truncate.ts`** (nouveau) : `sliceCodePoints(value, max)`
   — SSOT serveur de la découpe par point de code, doctrine identique au web.
   Export via `utils/index.ts`.
2. **NotificationService.ts** : `import` + remplacer les 7 coupes de contenu livré.
3. **Comment/PostReactionHandler.ts** : `import` + remplacer les 2 aperçus de réaction.
4. **messaging/ + posts/postReplySnapshot.ts** : `import` + remplacer les 2 coupes
   de `previewText`.

## Expected benefits
- Un push/e-mail/snapshot dont le contenu déborde la limite au niveau d'un emoji
  n'affiche plus `�` — l'emoji débordant est écarté en entier.
- Cohérence Unicode homogène **web ↔ gateway** : la doctrine `sliceCodePoints`
  couvre désormais les aperçus de contenu utilisateur des deux côtés du fil.
- Une SSOT serveur réutilisable pour toute future troncature côté services TS.

## Implementation complexity
Faible : 1 nouveau fichier + 1 `export` + 5 fichiers en substitution mécanique +
1 suite de tests (RED prouvé via témoin `substring`, + gardes de non-régression).

## Validation criteria
- shared vitest : `text-truncate.test.ts` **7/7** (dont témoin `substring` RED /
  `sliceCodePoints` GREEN au même boundary) ; suite complète **1389/1389**.
- gateway `tsc --noEmit` : **0 erreur** (après prisma generate).
- gateway jest ciblé : postReplySnapshot + Comment/PostReactionHandler **52/52**.
- La suite `NotificationService.*` (temp-config) échoue à l'import
  `preferences/index.ts → ./privacy.js` **de façon identique sur `main` vierge**
  (vérifié par `git stash`) → artefact d'environnement pré-existant, pas une
  régression de ce cycle.

## Statut : COMPLETED

## Future improvements (hors périmètre, itération 190+)
- **Migration web `sliceCodePoints` → SSOT shared** : `apps/web/utils/truncate.ts`
  garde sa copie testée ; la faire déléguer à `@meeshy/shared/utils/text-truncate`
  unifierait la doctrine en une seule implémentation (risque : résolution de module
  jest côté web → à valider séparément).
- **`truncateMessagePreview` (core.ts)** : envisager une variante de la SSOT bornant
  un *compte de points de code* (et non d'unités UTF-16) pour dédupliquer sa boucle
  inline sans changer sa sémantique de plafond.
- **Corroborations déjà trackées (ne pas retraiter)** : `getLanguageInfo`
  (`language-utils.ts:166`, casse `code` verbatim, aucun consommateur prod) ;
  `MAX_LINK_NAME_LENGTH` (constante inutilisée + docstring incohérente) ;
  dead code `sanitizeFileName`/`translation-adapter`/`translation-cleaner` ;
  `notification-translations.ts` (6× `substring(0,30)` non-surrogate-safe mais
  **sans consommateur prod** — module test-only, à câbler ou supprimer).
