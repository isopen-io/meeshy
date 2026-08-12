# Iteration 102 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `ecc384f` (« feat(android/profile): stats projection SSOT #1489 »), working tree propre.
Branche de travail `claude/brave-archimedes-5uevhq` recréée depuis `origin/main`
(`git reset --hard origin/main`), 0 commit non-mergé à préserver.

PR ouvertes au démarrage : **#1491** (iOS calls — setAudioEffect guard), **#1490** (gateway presence —
blocking leak sur socket), **#1488** (gateway/iOS calls — orphaned session protocol), **#1487**
(web utils — truncateFilename / formatCompactNumber F65/F66). **Toutes disjointes** du fichier ciblé
ici (`packages/shared/utils/calendar-date.ts`) — laissées à leurs sessions.

Backlog F-series : F60 (usernames à tiret) mergé (PR #1481, `171a232`). F65/F66 en cours (#1487).
Cible retenue ce cycle : **F67** — bug DST dans `calendarDayDiff`, découvert par audit ciblé des
utilitaires temps/date purs de `packages/shared/utils/` (duration-format, time-remaining,
relative-time, calendar-date), disjoint de toutes les PR ouvertes, purement TS/vitest-testable.

## Cible : F67 — `calendarDayDiff` renvoie 0 au lieu de 1 le lendemain d'un passage à l'heure d'été

### Current state
`packages/shared/utils/calendar-date.ts` expose `calendarDayDiff(targetMs, nowMs)` — nombre de
**jours calendaires** entre deux instants (insensible à l'heure de la journée). Implémentation
d'origine :
```ts
Math.floor((startOfLocalDayMs(nowMs) - startOfLocalDayMs(targetMs)) / DAY_MS)   // DAY_MS = 86_400_000
```
Elle soustrait deux minuits **locaux** puis divise par une constante 24 h. C'est la SSOT de
« Aujourd'hui / Hier / il y a X jours » :
- `apps/web/utils/date-format.ts` → `formatRelativeDate` (en-têtes de date des messages) +
  `formatConversationDate` (liste de conversations).
- `apps/web/utils/presence-format.ts` → `formatPresenceLabel` (« Vu hier à HH:mm » /
  « avant-hier »).
(`startOfLocalDayMs` est aussi consommé seul par `notification-helpers.ts` pour un vrai timestamp de
minuit local — usage légitime, **non modifié**.)

### Problems identified
- **[LIVE, ~2×/an, par fuseau] « Hier » affiché comme « Aujourd'hui ».** Le jour d'un passage à
  l'heure d'été ne dure que **23 h**. La différence de deux minuits locaux encadrant ce jour vaut
  donc `82_800_000 ms` ; `floor(82_800_000 / 86_400_000) = 0`. Résultat : le lendemain d'un
  spring-forward, un message posté « hier » est classé `diffDays === 0` →
  - `formatConversationDate` n'affiche que l'heure (indiscernable d'un message du jour, perte du
    label « Hier ») ;
  - `formatRelativeDate` retombe dans la branche `hoursAgo` au lieu de `yesterday` ;
  - `formatPresenceLabel` perd « Vu hier à HH:mm » au profit du format heures.
  Reproduit en `TZ=America/New_York` : `calendarDayDiff(8 mars 10:00, 9 mars 10:00) === 0` (attendu
  `1`). Le fall-back (jour de 25 h) donnait `floor(90_000_000/86_400_000) = 1` — correct par chance,
  mais fragile.

### Root cause
Deux minuits **locaux** consécutifs ne sont **pas** toujours espacés de `DAY_MS` : lors des
transitions DST, un jour dure 23 h ou 25 h. Diviser leur écart brut par une constante 24 h suppose à
tort que tous les jours font 24 h. L'index de jour calendaire doit être calculé sur une échelle
**sans DST**.

### Business impact
Bug silencieux, non diagnosticable, sur une primitive d'affichage vue par **tous** les utilisateurs
d'un fuseau à DST (Amérique du Nord, Europe, Australie, NZ…), à chaque transition printanière. Il
n'efface pas de données mais dégrade la lisibilité temporelle (regroupement de messages, dernière
connexion) précisément le jour où l'horloge est déjà déroutante pour l'utilisateur.

### Technical impact
Correction purement locale au fichier SSOT : introduction d'un `localDayIndex(ms)` privé qui projette
le triplet (année, mois, jour) **local** sur une échelle **UTC** (`Date.UTC(...) / DAY_MS`), immune au
DST car deux minuits UTC consécutifs sont toujours espacés d'exactement `DAY_MS`. `calendarDayDiff`
devient la simple différence de deux index. `startOfLocalDayMs` (vrai minuit local, autre
sémantique, autre consommateur) reste inchangé. Aucun changement de signature, aucune migration.

### Risk assessment
Très faible. Le comportement est **identique** hors transitions DST (prouvé : le test d'équivalence
« legacy midnight-difference formula » sur un span estival reste vert) et **corrigé** au voisinage des
transitions. Validé identique en UTC, Europe/Paris, America/New_York, Australia/Sydney,
Pacific/Chatham (offset +12:45). `Math.round` (au lieu de `floor`) sur la division protège des
imprécisions flottantes ; les valeurs étant des multiples exacts de `DAY_MS`, le résultat est entier.

### Proposed improvements
1. `calendar-date.ts` : ajouter `localDayIndex(ms) = Math.round(Date.UTC(y, m, d) / DAY_MS)` ;
   `calendarDayDiff = localDayIndex(nowMs) - localDayIndex(targetMs)`.
2. Conserver `startOfLocalDayMs` tel quel (consommateur `notification-helpers`).
3. Tests DST : spring-forward (jour 23 h) → 1 ; fall-back (jour 25 h) → 1 ; deux instants d'un jour
   de transition → 0. Cas TZ-indépendants (passent aussi en UTC) documentant le contrat.

### Expected benefits
- « Hier » / « Vu hier » corrects le lendemain d'un spring-forward, partout où `calendarDayDiff`
  arbitre (messages, liste de conversations, présence).
- SSOT date/jour désormais robuste aux jours de 23 h / 25 h — zéro régression future de la même
  classe.

### Implementation complexity
Faible (1 fichier source, 1 fichier test). Aucune migration, aucun changement d'API publique.

### Validation criteria
- [x] Tests RED d'abord (standalone harness, `TZ=America/New_York`) : ancienne formule
      `calendarDayDiff(8 mars, 9 mars) === 0`, nouvelle `=== 1`.
- [x] GREEN vitest : `calendar-date.test.ts` **11/11** ; suite `__tests__/utils/` complète
      **124/124** (0 régression sur relative-time, duration-format, time-remaining, notification-
      strings, presence-visibility…).
- [x] `bun run build` shared (tsc `--project`) : **0 erreur**, dist régénéré (gitignored).
- [x] Fix validé identique à l'ancien hors DST, corrigé aux transitions, sur 5 fuseaux
      (UTC, Paris, New York, Sydney, Chatham).

## Candidats écartés ce cycle (documentés)
- **`formatTimeRemaining` / `formatClock` / `classifyRelativeTime`** : relus, corrects (arithmétique
  d'écart brut en ms, pas de découpage calendaire → insensibles au DST par construction). Rien à
  faire.
- **iOS `RelativeTimeFormatter`** : contrepartie du même contrat côté Swift — hors périmètre de
  validation (pas de toolchain Swift dans l'environnement). À auditer en itération iOS dédiée si
  divergence DST confirmée (F67b).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW) : aligner le parsing de mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW, neuf) : auditer le découpage jour-calendaire iOS (`RelativeTimeFormatter`,
  `Calendar.startOfDay`) — `Calendar` natif gère le DST, à confirmer côté web/iOS parité.
