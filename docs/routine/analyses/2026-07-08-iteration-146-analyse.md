# Iteration 146 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `6fe0e5f3` (dernier merge, PR #1724 iter 145 — divergence incrémental/recompute des stats).
Branche `claude/brave-archimedes-0tjy4o` recréée depuis `origin/main`. PRs ouvertes au démarrage :
#1725 (Android pinned-messages sheet, autre session, hors périmètre autonome). Ce cycle prend **146**.

Fan-out : deux agents Explore parallèles sur (a) `services/gateway/src` (services récents : présence,
delivery queue, stats), (b) `packages/shared/utils` + `apps/web/{utils,hooks,lib}`. Consigne : **un**
défaut de correction de logique quasi-pure, haute confiance, **actuellement utilisé en production**, non
couvert par les tests. Priorité 1 = features récemment développées → **le modèle de présence 4 états**
(online / recent / away / offline) livré sur web+iOS+android dans les commits les plus récents.

---

## Cible : F114 — `toMinimalUser` fabrique `Date.now()` pour un `lastActiveAt` absent → un contact hors-ligne s'affiche « en ligne » (point orange pulsant)

### Current state
`apps/web/hooks/use-user-status-realtime.ts`. Le hook `useUserStatusRealtime` (monté une fois à la
racine via `PresenceProvider`) écoute `PRESENCE_SNAPSHOT` (seed initial de présence des contacts) et
mappe **chaque** entrée via `toMinimalUser` avant de la stocker (`mergeParticipants`).

`toMinimalUser` normalisait `lastActiveAt` ainsi :

```ts
const lastActiveAt =
  entry.lastActiveAt instanceof Date
    ? entry.lastActiveAt
    : entry.lastActiveAt
      ? new Date(entry.lastActiveAt)
      : new Date();          // ← fabrique « maintenant » quand lastActiveAt est absent
```

### Problems identified
Le fallback `new Date()` **fabrique l'instant courant** quand `lastActiveAt` est `null`/`undefined`.
Or la source de vérité du statut, `getUserStatus` (`apps/web/lib/user-status.ts:39-47`), traite
explicitement l'absence de timestamp :

```ts
if (lastActiveAt == null) return isOnline === true ? 'online' : 'offline';
const elapsed = Date.now() - new Date(lastActiveAt).getTime();
if (elapsed <= 60_000) return 'online'; // orange + pulse
```

En fabriquant `now`, `toMinimalUser` **court-circuite** ce branchement : `elapsed ≈ 0 ≤ 60 s` →
`getUserStatus` renvoie **`'online'`** (point orange pulsant, « en ligne maintenant ») pour un contact
dont `isOnline` vaut `false`.

Entrée concrète (forme réelle du snapshot — cf. gateway ci-dessous) :
`{ userId: 'u3', username: 'carol', isOnline: false, lastActiveAt: null }`
→ `toMinimalUser` → `{ …, isOnline: false, lastActiveAt: <now> }`
→ `getUserStatus` → `'online'` (attendu : `'offline'`, aucun indicateur).

### Root causes
Incohérence entre les trois chemins qui alimentent le store de présence. `onUserStatus`
(`use-user-status-realtime.ts:92`) et le resync REST (`:163`) passent **`undefined`** quand le
timestamp manque (`event.lastActiveAt ? new Date(...) : undefined`). Seul `toMinimalUser` divergeait
en fabriquant `new Date()`. Le snapshot est le **seul** des trois chemins à trahir le contrat de
`getUserStatus`.

### Business impact
Le Prisme Présence perd sa fiabilité : un utilisateur voit un point orange pulsant « en ligne » à côté
de contacts en réalité **hors-ligne**. Cela sape la confiance dans l'indicateur de présence et peut
inciter à écrire un message « à chaud » à quelqu'un d'absent depuis des heures.

### Technical impact
Le gateway **annule délibérément** `lastActiveAt` dans le builder de snapshot
(`services/gateway/src/socketio/MeeshySocketIOManager.ts:592-597`, `_applyPresencePrefs`) pour :
- un contact **bloqué** → `{ isOnline: false, lastActiveAt: null }` ;
- un contact avec `showOnlineStatus=false` → `{ isOnline: false, lastActiveAt: null }` ;
- un contact avec `showLastSeen=false` (mais `showOnlineStatus=true`) → `lastActiveAt: null`,
  `isOnline` préservé — **peut être hors-ligne** (`isOnline` calculé par
  `this.connectedUsers.has(...)`, l.646-657).

Les trois cas produisent en production `{ isOnline: false, lastActiveAt: null }`, entrée exacte qui
déclenche le faux « online ». Effet secondaire : le timestamp fabriqué valant toujours ≈ `Date.now()`
(donc maximal), le contrôle de fraîcheur `incomingTime >= existingTime` de `mergeParticipants`
(`stores/user-store.ts:52-54`) **écrase** un `lastActiveAt` correct déjà présent.

### Risk assessment
Risque **très faible**. Le correctif aligne `toMinimalUser` sur le comportement déjà en place dans les
deux autres chemins (`undefined`). Aucun changement de schéma, d'API ou de contrat de type (l'objet est
`as unknown as User`). `mergeParticipants` (l.52-53) et `getUserStatus` (l.39) gèrent tous deux
`undefined` sans branche supplémentaire.

### Proposed improvements
Remplacer le fallback `new Date()` par `undefined`. Ajouter un commentaire d'invariant expliquant
pourquoi un timestamp absent doit le rester.

### Expected benefits
- Un contact hors-ligne à `lastActiveAt` nul → **`'offline'`** (aucun indicateur), conforme au Prisme
  Présence 4 états.
- Plus d'écrasement d'un `lastActiveAt` valide par un snapshot à timestamp manquant.
- Cohérence des trois chemins d'alimentation du store de présence.

### Implementation complexity
Triviale — une ligne de logique + un test de régression comportemental.

### Validation criteria
- RED : un snapshot `{ isOnline: false, lastActiveAt: null }` produit un user dont `getUserStatus`
  renvoyait `'online'` (timestamp fabriqué) → test rouge.
- GREEN : après correctif, `merged.lastActiveAt === undefined` et `getUserStatus(merged) === 'offline'`.
- Non-régression : suites `use-user-status-realtime`, `user-store`, `user-status` vertes (73/73).

### Proof no existing test caught it
`__tests__/hooks/use-user-status-realtime.test.tsx:208-219` fournissait déjà
`{ userId:'u2', isOnline:false, lastActiveAt:null }` mais n'assertait que
`toMatchObject({ id, username, isOnline })` — jamais `lastActiveAt` ni le statut dérivé. `toMinimalUser`
n'est pas exporté ; `__tests__/lib/user-status.test.ts` teste correctement `getUserStatus` (y compris
`{isOnline:false, lastActiveAt:null} → 'offline'`), confirmant que le défaut est la fabrication, pas
`getUserStatus`.

---

## Notes de revue (fan-out)
- Couche pure `packages/shared/utils` + `apps/web/utils` : toujours pristine (cf. iters 140-145).
  Dead code connu inchangé (`translation-cleaner.ts`, `TranslationCache.ts findSimilarTranslations`).
- Second `getUserStatus` (3 états) dans `apps/web/services/users.service.ts:222` : correct et cohérent
  (`diffMinutes < 5 → online`, `< 30 → away`, sinon `offline`), non concerné.
- Candidat secondaire (même classe, plus faible) : `stores/user-store.ts:102`
  `lastActiveAt: updates.lastActiveAt || new Date()` dans la branche « nouveau user » de
  `updateUserStatus`. Partiellement gardé (le chemin existant, l.87, ne set que si truthy) et couvert de
  façon lâche. **Non retenu ce cycle** — reporté comme amélioration future (voir plan).
