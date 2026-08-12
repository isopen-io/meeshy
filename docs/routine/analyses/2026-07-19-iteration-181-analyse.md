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
# Iteration 181 — `deviceLocale` middleware : cache de debounce non borné (fuite mémoire par utilisateur distinct)

## Protocole (démarrage)
`main` @ `b158a9b` (derniers merges : #2055/#2052/#2050 android/status, #2044
web/i18n normalize codes, #2037 ios/a11y…). Branche
`claude/brave-archimedes-q76pfd` réinitialisée sur `origin/main`. Ce cycle prend
**181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR iOS ouvertes (#2040→#2056) sont pilotées par
d'autres sessions et hors périmètre. Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface gateway TS — le middleware
`deviceLocale` (Prisme étendu 2026-05-26) est l'ajout serveur récent le plus
directement testable.

## Current state
`services/gateway/src/middleware/deviceLocale.ts` persiste opportunément la locale
appareil (`X-Device-Locale`) dans `User.deviceLocale`, avec un **debounce
par utilisateur de 5 min** implémenté par une `Map` de processus :

```ts
const DEBOUNCE_MS = 5 * 60 * 1000;
const lastUpdateByUserId = new Map<string, number>();  // userId → last write ts
// ...
lastUpdateByUserId.set(userId, now);   // ← une entrée par utilisateur, jamais évincée
```

Le hook est un `preHandler` **global** : il s'exécute sur **chaque requête
authentifiée** de **chaque route**. La `Map` reçoit donc une entrée pour tout
utilisateur enregistré ayant émis au moins une requête portant `X-Device-Locale`.

## Problems identified
1. **Fuite mémoire non bornée (scalabilité).** `lastUpdateByUserId` n'est
   **jamais purgée**. Elle accumule une entrée par utilisateur distinct pour
   **toute la durée de vie du process gateway**. Sur une plateforme visée à
   100k+ utilisateurs (et une gateway à long uptime), la `Map` croît linéairement
   avec le nombre cumulé d'utilisateurs actifs — ~100k entrées ≈ ~10 Mo, 1M ≈
   ~100 Mo — sans plafond. C'est une fuite lente mais réelle.
2. **Entrées mortes conservées.** Une entrée dont l'horodatage dépasse
   `DEBOUNCE_MS` ne peut **plus jamais** supprimer une écriture (la garde
   `now - last < DEBOUNCE_MS` échoue toujours pour elle). Elle est donc du poids
   mort pur : la conserver n'apporte rien mais coûte de la mémoire.

## Root cause
Le debounce a été conçu pour la **correction fonctionnelle** (ne pas marteler la
DB) sans stratégie d'éviction : la `Map` est un cache qui **grandit mais ne
rétrécit jamais**. Le cycle de vie d'une entrée (utile seulement pendant
`DEBOUNCE_MS` après sa dernière écriture) n'était pas exploité pour la libérer.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte du process qui croît de façon
  monotone avec la base d'utilisateurs cumulée — pression GC accrue, risque
  d'OOM sur un uptime long, coût RAM en production.
- **Observabilité** : une croissance mémoire lente et diffuse est difficile à
  diagnostiquer ; la borner par construction supprime une classe entière de
  faux positifs d'investigation.
- **Correctness** : inchangée — le debounce reste strictement identique tant que
  la `Map` est sous le plafond.

## Risk assessment
Très faible. Aucune signature publique ni type de retour modifié. La purge
n'évince que des entrées **expirées** (comportement strictement préservé : elles
ne pouvaient plus supprimer d'écriture). Le plafond dur (`MAX_TRACKED_USERS =
10_000`) ne se déclenche que si >10k utilisateurs distincts écrivent **dans la
même fenêtre de 5 min** — cas pathologique où le seul effet est **une** écriture
`User.update` supplémentaire (idempotente) pour un utilisateur évincé. La purge
est **amortie** (déclenchée uniquement au franchissement du plafond, jamais sur
le chemin chaud nominal). Les 14 tests existants restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`deviceLocale.test.ts`, bloc « bounded debounce cache ») —
  (a) éviction des entrées expirées au franchissement du plafond ; (b) borne dure
  respectée même quand toutes les entrées sont fraîches ; (c) pas de purge sous le
  plafond (amortissement, pas d'éviction eager). Nouveaux seams de test
  `_deviceLocaleCacheSize()` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
- **GREEN** :
  1. `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries(now)` : balaye les
     entrées `now - ts >= DEBOUNCE_MS` puis, si toujours au plafond, évince les
     plus anciennement insérées (ordre d'insertion `Map`).
  2. Chemin d'écriture : avant `set`, si l'utilisateur est nouveau **et** la
     `Map` a atteint le plafond, déclencher la purge. Le hot path nominal (map
     sous plafond) ne paie aucun coût O(n).

## Expected benefits
- Empreinte mémoire du middleware **bornée par construction** (≤
  `MAX_TRACKED_USERS` entrées) quelle que soit la base d'utilisateurs cumulée.
- Élimination d'une fuite mémoire lente sur une fonctionnalité récente.
- Debounce fonctionnellement inchangé sous charge nominale.

## Implementation complexity
Faible — 1 constante + 1 fonction de purge amortie + 1 garde sur le chemin
d'écriture, dans un seul fichier déjà couvert par tests.

## Validation criteria
- `services/gateway` : `deviceLocale.test.ts` **17/17** verts (3 nouveaux, 14
  préexistants inchangés).
- `tsc --noEmit` : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
