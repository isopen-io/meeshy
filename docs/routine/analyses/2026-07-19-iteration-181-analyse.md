# Iteration 181 — `generateDefaultConversationTitle` : ordre de priorité du nom divergent (`username` avant `firstName+lastName`) → titres `@username` là où l'app affiche le vrai nom

## Protocole (démarrage)
`main` @ `fa11f7d` (derniers merges : #2052/#2050/#2048/#2046 android/status,
#2044 web/i18n language codes, #2037 ios/a11y). Branche
`claude/brave-archimedes-1vymkp` réinitialisée sur `origin/main`. Ce cycle prend
**181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (shared/web/gateway). Les deux findings de backlog des itérations
178–180 (`getUserLanguageChoices`, `resolveParticipantDisplayName`) sont soldés.
Point de départ : sweep des fonctions pures `packages/shared/utils` à la recherche
d'une **divergence SSOT** non encore corrigée.

## Current state
`packages/shared/utils/conversation-helpers.ts` → `generateDefaultConversationTitle`
génère le titre par défaut des conversations sans titre (groupes/DMs). Il résolvait
le nom de chaque membre via, en **DEUX copies** (branche 1-membre + `resolveName`
multi-membres) :

```ts
return m.displayName?.trim() || m.username?.trim() || fullName || 'Unknown User';
//                              ^^^^^^^^^^^^^^^^^^^ username AVANT firstName+lastName
```

Soit l'ordre : **`displayName` → `username` → `firstName+lastName`**.

## Problems identified
1. **Ordre de priorité divergent de la SSOT (product-visible).** La règle canonique
   d'affichage du nom, testée et documentée, est
   **`displayName` → `firstName+lastName` → `username`** :
   - `apps/web/utils/user-display-name.ts` → `getUserDisplayName` (+ son spec
     `__tests__/utils/user-display-name.test.ts` qui asserte explicitement
     `displayName > firstName+lastName > username`).
   - Le gateway lui-même applique l'ordre canonique en snapshottant un participant :
     `services/gateway/src/services/messaging/MessagingService.ts:553` →
     `user.displayName || \`${firstName} ${lastName}\`.trim() || user.username`.

   `generateDefaultConversationTitle` était le **seul** site à inverser `username`
   et `firstName+lastName`.
2. **Duplication.** La même résolution de nom était réécrite deux fois (branche
   1-membre inline + `resolveName` pour 2 et 3+ membres) — risque de dérive.

## Root cause
La fonction (antérieure à l'extraction de `getUserDisplayName`) a codé son propre
ordre de coalescence sans jamais être rebranchée sur la règle produit canonique.
Aucun test n'exerçait le **cas conflictuel** (un membre portant À LA FOIS
`username` ET `firstName/lastName`) : les tests existants isolaient chaque champ
(`username` seul → username, `firstName/lastName` seuls → nom complet), laissant la
divergence invisible.

## Business / Technical impact
- **UX** : une conversation de groupe sans titre dont un membre a un compte avec
  prénom/nom mais pas de `displayName` (cas fréquent) s'intitulait `@jdoe123` au
  lieu de « John Doe » — incohérent avec l'avatar/le header/la liste de membres qui,
  eux, passent par `getUserDisplayName`. Les callers réels
  (`routes/conversations/core.ts`, `search.ts`) fournissent bien
  `firstName`/`lastName` au helper, donc l'impact est effectif en production.
- **Cohérence** : le dernier site de résolution de nom web/shared s'aligne enfin sur
  la SSOT.
- **Dette** : deux copies de la coalescence remplacées par un seul helper
  `resolveMemberName`.

## Risk assessment
Très faible. Type de retour inchangé (`string`). Aucun test existant n'assertait
l'ordre inversé pour le cas conflictuel. Les tests de routes gateway
(`conversation-core`, `search-threads`, …) **mockent** entièrement
`generateDefaultConversationTitle` (`mockReturnValue(...)`) → insensibles au
changement d'implémentation. Le repli local `'Unknown User'` est préservé (aucun
cross-import du repli français `'Utilisateur inconnu'` du helper web).

## Proposed improvements / Correctif (TDD)
- **RED** : +5 tests (`conversation-helpers.test.ts`) sur le cas conflictuel —
  `firstName+lastName` prioritaire sur `username` (1 membre et multi-membres),
  `displayName` reste prioritaire sur les deux, repli `username` quand
  `firstName/lastName` sont blancs.
- **GREEN** :
  1. Extraction d'un helper unique `resolveMemberName` (ordre canonique
     `displayName → firstName+lastName → username → 'Unknown User'`), blank-aware.
  2. Les branches 1-membre, 2-membres et 3+-membres délèguent toutes à ce helper
     (duplication supprimée).

## Expected benefits
- Titres par défaut cohérents avec le reste de l'app (nom réel, pas `@username`).
- Parité stricte avec `getUserDisplayName` (web) et le snapshot gateway
  `MessagingService`.
- Une seule source pour la résolution du nom de membre dans ce helper.

## Implementation complexity
Faible — réordonnancement d'une coalescence + extraction d'un helper, 2 sites d'un
même fichier.

## Validation criteria
- `packages/shared` : `conversation-helpers.test.ts` **84/84** verts (5 nouveaux) ;
  suite complète **46 fichiers / 1368 tests** verts ; `bun run build` (tsc) OK.
- Tests de routes gateway inchangés (fonction mockée).

## Backlog (candidats consignés pour une itération future)
- **Candidat 2 (Explore)** : `Math.random().toString(36).substring(2, 8)` ne
  garantit pas 6 caractères (répliqué sur ~8 sites web+gateway :
  `community-identifier.ts`, `link-identifier.ts`, `avatar-upload.ts`,
  `routes/links/creation.ts`, …). Bug latent de raccourcissement d'identifiant
  URL-facing ; fix = helper `randomSuffix(len)` longueur fixe (bonus SSOT).
- **Candidat 3 (Explore)** : `apps/web/utils/date-format.ts:71,120` —
  `formatRelativeDate`/`formatConversationDate` classent un timestamp **futur**
  (skew d'horloge / message optimiste) comme « cette semaine » (`diffDays < 7`
  satisfait par `-1`). Garde `diffDays >= 2 && diffDays < 7` ou clamp des négatifs.
- **Divergence CallEventsHandler** : `CallEventsHandler.ts:1552,1679,2031` —
  l'avatar de participant est résolu **user-first**
  (`participant?.user?.avatar || participant?.avatar`), à l'inverse de l'ordre
  canonique local-first de `resolveParticipantAvatar`, et le `displayName` voisin
  est local-first (incohérence intra-objet). Socket handlers → couverture de test
  plus lourde, à traiter dédié.
- `MeeshySocketIOManager.ts:752` — ordre `username ?? displayName ?? …` (sémantique
  « présence key ») : hors périmètre, à ne PAS uniformiser sans analyse dédiée.
