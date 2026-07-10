# Iteration 163 — Analyse d'optimisation (2026-07-10)

## Protocole (démarrage)
`main` @ `6987f25` (dernier commit : test(ios/camera) save-path guard). Branche
`claude/brave-archimedes-uhh8cq` alignée sur `origin/main` (0/0). Ce cycle prend **163**.

PRs/périmètres ouverts au démarrage (autres sessions, hors périmètre autonome — issus des
notes des itérations 160–162) : mentions autocomplete, stats participant / online-users,
posts/story watch-time, realtime delivery/receipts, calls/signaling, typing suppression,
translator queue, presence label, message-edit empty-content, attachment-reaction offline
replay, notification:read badge (iter 161), commentCount orphan replies (iter 162).

Cible retenue : **candidat explicitement consigné par l'itération 162 pour un futur cycle**
(« DST-unsafe `hier` boundary dans `formatContentPublishedAt` »). Aucun autre cycle ne touche
`apps/web/utils/notification-helpers.ts` → zéro risque de conflit.

---

## Cible retenue : F126 — `formatContentPublishedAt` calcule la borne « hier » par soustraction fixe de 86 400 000 ms au lieu de la SSOT DST-safe `calendarDayDiff`, ce qui décale la frontière d'une heure les jours de transition heure d'été/hiver

### Current state
`apps/web/utils/notification-helpers.ts:242` — `formatContentPublishedAt(iso, t, locale)` rend
l'horodatage relatif du contenu social affiché sous chaque notification (post créé, commentaire,
etc. — appelé l.537 via `notification.context?.postCreatedAt`).

Avant ce cycle, le découpage aujourd'hui / hier / au-delà reposait sur une soustraction manuelle :

```ts
const startOfToday = startOfLocalDayMs(now.getTime());
const startOfYesterday = startOfToday - 86400000;   // ← 24 h fixes
...
if (date.getTime() >= startOfToday)      return t('timeAgo.hour')...;
if (date.getTime() >= startOfYesterday)  return t('timeAgo.yesterdayAt')...;
```

`startOfLocalDayMs` (minuit local) est DST-safe, mais lui **retrancher exactement 24 h** ne
retombe **pas** sur le minuit local de la veille les jours de transition :
- **Retour à l'heure d'hiver (jour de 25 h)** : `startOfToday − 24 h` tombe à **01:00** de la
  veille. Un contenu publié dans la **première heure** de la veille (00:00–01:00) est
  `< startOfYesterday` → rétrogradé en **date absolue** au lieu de « hier ».
- **Passage à l'heure d'été (jour de 23 h)** : `startOfToday − 24 h` tombe à **23:00** de
  l'avant-veille. Un contenu de la dernière heure de l'avant-veille peut être étiqueté « hier ».

Vérifié numériquement (TZ `America/New_York`, fall-back US 2 nov. 2025, jour de 25 h) :
`now = 3 nov. 12:00`, `post = 2 nov. 00:30` → ancienne branche « hier » **fausse** (date absolue),
`calendarDayDiff(post, now) === 1` → **« hier »** correct.

Ironie : `calendarDayDiff` — la SSOT DST-safe qui résout précisément ce problème — était
**déjà importée** dans le fichier (et utilisée juste en dessous par `groupNotificationsByDate`),
mais `formatContentPublishedAt` ne s'en servait pas. Régression de cohérence pure.

### Problems identified
- Étiquette temporelle incorrecte (« il y a X » absolu vs « hier ») deux jours par an, TZ à DST.
- Duplication d'intention : arithmétique jour-calendaire réimplémentée à côté de la SSOT importée.

### Root cause
Soustraction de durée brute (`− 86400000`) là où il faut une **différence de jours calendaires**
locaux (comparaison de minuits projetés hors-DST). C'est exactement le contrat de `calendarDayDiff`.

### Business / technical impact
- **Business** : cosmétique mais visible — un post de la nuit de bascule paraît « plus vieux »
  qu'il ne l'est dans le feed de notifications. Faible fréquence (2 j/an × fuseaux à DST), impact
  confiance faible mais réel.
- **Technical** : élimine une réimplémentation divergente de la SSOT ; converge vers le principe
  *Single Source of Truth* du CLAUDE.md (résolution jour-calendaire unique).

### Risk assessment
Très faible. Changement local et purement logique ; délègue à une fonction déjà couverte par des
tests DST (23 h / 25 h) dans `packages/shared/__tests__/utils/calendar-date.test.ts`.

### Proposed improvement (implémenté)
```ts
const dayDiff = calendarDayDiff(date.getTime(), now.getTime());
if (dayDiff === 0) return t('timeAgo.hour')...;
if (dayDiff === 1) return t('timeAgo.yesterdayAt')...;
```
+ suppression de l'import désormais inutile `startOfLocalDayMs`.

### Expected benefits
Frontière « hier » exacte tous les jours de l'année, tous fuseaux ; −2 variables locales ;
cohérence avec `groupNotificationsByDate` (même SSOT).

### Implementation complexity
Triviale : 5 lignes touchées, 1 import réduit.

### Validation criteria
- `notification-helpers.test.ts` : 79/79 verts.
- Nouveau test déterministe (fake timers) verrouillant le **découpage par jour calendaire**
  (et non une fenêtre glissante de 24 h) : veille tardive (< 24 h) → « hier », même-jour → « il y a Nh »,
  avant-veille → date absolue.
- Note d'honnêteté : sous jest, le runtime est en **UTC** (aucune DST) et `process.env.TZ` fixé
  en cours de test n'est **pas** relu par V8 → il est *impossible* de distinguer l'ancien du
  nouveau code **via cette fonction** dans jest. La garantie DST est **structurelle** : la
  fonction délègue désormais à `calendarDayDiff`, dont les régressions 23 h / 25 h sont couvertes
  au niveau de la SSOT. Le test ajouté verrouille l'intention (jour calendaire) sans prétendre
  faussement rejouer la DST.

## Suivi / candidats futurs
- (rappel iter 162) aucun autre candidat pur-logique en attente identifié ce cycle.
