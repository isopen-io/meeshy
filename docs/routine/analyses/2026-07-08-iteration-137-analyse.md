# Iteration 137 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `7ed93b5` (dernier merge PR #1652, iter 136). Branche `claude/brave-archimedes-hus6dh` recréée
depuis `origin/main`. Numérotation : l'itération **136** est prise (#1652). Ce cycle prend **137**.

## Cible : F101 — `TrackingLinkService.getTrackingLinkStats` : `clicksByHour` en heure locale serveur (drift vs `clicksByDate` UTC)

### Current state
`services/gateway/src/services/TrackingLinkService.ts` → `getTrackingLinkStats()`. Deux histogrammes
temporels sont dérivés du **même** jeu de clics :

```ts
// Par heure (0-23)
const hour = click.clickedAt.getHours().toString().padStart(2, '0');   // ← heure LOCALE serveur
clicksByHour[hour] = (clicksByHour[hour] || 0) + 1;
...
// Par date
const dateKey = click.clickedAt.toISOString().split('T')[0];           // ← jour UTC
clicksByDate[dateKey] = (clicksByDate[dateKey] || 0) + 1;
```

`clicksByHour` utilise `getHours()` (fuseau local du process) tandis que `clicksByDate` utilise
`toISOString()` (UTC). Les deux histogrammes dérivent de `click.clickedAt` mais dans deux référentiels
temporels différents.

### Problems identified
Incohérence de référentiel temporel entre deux agrégats du même endpoint : un clic à `23:30Z` est compté
dans le jour UTC `…-01` mais dans une heure locale décalée (p.ex. `08` en Asia/Tokyo, `18` en
America/New_York). Un consommateur qui croise « heure de pointe » et « jour de pointe » obtient des
courbes désynchronisées.

### Root causes
Oubli d'harmonisation UTC lors de l'ajout du bucket horaire : `toISOString()` (UTC) a été choisi pour la
date mais `getHours()` (local) pour l'heure.

### Business impact
Analytics de liens de tracking (dashboards de campagne / partage de posts). Impact **latent** en
production : le runtime `node:22-slim` tourne `TZ=UTC`, donc `getHours() === getUTCHours()` — les deux
histogrammes coïncident tant que le déploiement reste UTC. Le bug se réveillerait dès qu'un déploiement
(ou un job local d'analytics, ou un test sur poste dev non-UTC) tourne dans un autre fuseau, produisant
silencieusement des « heures de pointe » décalées.

### Technical impact
Défaut de cohérence (Single Source of Truth temporel). Deux dérivations du même instant doivent partager
le même référentiel. `getUTCHours()` aligne les deux sur UTC de façon déterministe, indépendamment du
fuseau du process.

### Risk assessment
Très faible. Changement d'une seule expression (`getHours()` → `getUTCHours()`). Zéro changement de
signature, de forme de réponse, ou de sémantique en production UTC (les valeurs restent identiques là où
`TZ=UTC`). Seul effet observable : sur un host non-UTC, `clicksByHour` bascule du référentiel local vers
UTC — le comportement **voulu**.

### Proposed improvements
Remplacer `click.clickedAt.getHours()` par `click.clickedAt.getUTCHours()` pour aligner `clicksByHour`
sur `clicksByDate` (UTC). Commentaire mis à jour pour documenter le référentiel UTC.

### Expected benefits
- Cohérence temporelle des deux histogrammes indépendamment du fuseau de déploiement.
- Élimination d'un bug latent masqué par la contrainte `TZ=UTC` (fragile — dépend d'une config runtime).
- Analytics déterministes et reproductibles quel que soit le host (CI, dev, prod).

### Implementation complexity
Triviale — 1 ligne de production + commentaire. 1 fichier de test de régression dédié qui force un fuseau
non-UTC (`TZ=Asia/Tokyo`) pour prouver le contrat UTC (impossible à distinguer sous `TZ=UTC`).

### Validation criteria
- **RED prouvé** : sous `TZ=Asia/Tokyo`, un clic `2024-06-01T23:30:00Z` bucketé par `getHours()` tombe en
  heure `08` (jour suivant local) ≠ `23` attendu → test rouge avant fix.
- Après : `clicksByHour` bucke `{ '23': 1 }`, cohérent avec `clicksByDate` `{ '2024-06-01': 1 }`.
- Tous les tests existants de `TrackingLinkService` restent verts (invariants sous `TZ=UTC` du CI).

## Backlog mis à jour
- **F100** (report) : `isTextMessageStat` — aligner exactement sur `recompute` (décision sémantique
  produit : un message texte whitespace-only compte-t-il comme texte ?).
- **F97** (report) : `use-message-translations.ts` — dedup alias `t.model` (pas de consommateur prod).
- **F98** (report) : `NotificationService.isDNDActive` — sémantique jour d'une fenêtre DND nocturne.
- **F90** (report) : message-search — recall des traductions.
