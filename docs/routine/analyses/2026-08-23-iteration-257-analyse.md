# Analyse — Itération 257 : quatre formateurs de planification d'agent, copiés-collés entre deux panneaux

## Protocole (démarrage)

`main` @ `e3f15c6f` (dernier commit : `feat(android/stories): reader
fadeIn/fadeOut envelope on the viewer canvas (#3416)`). Branche
`claude/brave-archimedes-1m9ffb` réalignée sur `origin/main` (0 avance / 0 retard
au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`. Web testable via Jest 30 (`node_modules/.bin/jest`).
Baseline verte au départ : `AgentScheduleTimeline` + `TriggerSchedulingModal` +
`audio-formatters` (100 tests).

**Audit anti-doublon** (2 PRs ouvertes au départ) : #3415 (réactions —
`ReactionService`, `use-reactions-query`, `reaction.ts`, `socketio-events.ts`,
SDK), #3395 (iOS a11y). **Aucune ne touche
`apps/web/components/admin/agent/`** — zéro chevauchement de fichier.

## Sélection : **Priorité 1 — feature récente (console admin agents) au code dupliqué**

Le panneau de planification d'agent (`admin/agent/`) est une surface récente et
active (nombreux composants, cf. `AgentConfigDialog`, `ScanControlPanel`…). Deux
de ses vues affichent EXACTEMENT les mêmes données de planning/budget et se sont
partagé leurs formateurs par copier-coller.

## Current state (avant correctif)

Quatre fonctions pures de présentation étaient **dupliquées verbatim** entre deux
composants frères :

| fonction | `TriggerSchedulingModal.tsx` | `AgentScheduleTimeline.tsx` | identique ? |
|---|---|---|---|
| `formatTime(ts, locale)` | :38 | :26 | **oui, à la ligne près** |
| `formatDuration(ms)` | :42 | :30 | **quasi** — un seul diff (cf. infra) |
| `budgetColor(ratio)` | :51 | :38 | **oui** |
| `budgetGlow(ratio)` | :57 | :44 | **oui** |

Seule divergence : le `formatDuration` de `TriggerSchedulingModal` portait une
garde `if (ms <= 0) return '0min';` que celui de `AgentScheduleTimeline`
n'avait pas — alors que c'est précisément `AgentScheduleTimeline` (et l'autre
panneau) qui lui passe des deltas SIGNÉS pouvant devenir négatifs :
`formatDuration(schedule.burst.cooldownEndsAt - now)` et
`formatDuration(now - schedule.lastScan)`. Sans la garde, un compte à rebours qui
vient d'expirer affiche « -1min ».

## Problems identified

1. **Duplication littérale de logique de présentation.** Quatre fonctions,
   recopiées sur deux fichiers, sans lien autre que la vigilance. La première qui
   dérive (une bande de budget déplacée, un format d'heure changé) désynchronise
   silencieusement les deux vues d'un MÊME jeu de données.
2. **Une garde de robustesse présente à un seul des deux sites.** Le site qui en
   avait le PLUS besoin (deltas signés) était justement celui qui ne l'avait pas
   — symptôme classique du copier-coller : le correctif appliqué à une copie
   n'atteint pas l'autre.

## Root causes

`AgentScheduleTimeline` a vraisemblablement été écrit d'abord ; `TriggerSchedulingModal`
a copié ses formateurs puis a durci `formatDuration` (garde `<= 0`) sans remonter
le correctif vers l'original. Aucun module partagé n'existait pour ces helpers,
alors que le répertoire porte déjà le patron d'un util local extrait
(`config-form-merge.ts`, `mergeDefinedFields`).

## Business impact

**Quasi nul en runtime**, à une exception près qui est une **correction** : le
timeline cesse d'afficher des durées négatives (« -1min ») lorsqu'un cooldown ou
un dernier-scan vient de basculer. Le gain principal est de **cohérence** : les
deux panneaux de planification partagent désormais une définition unique, gelée
par test.

## Technical impact

- **Nouveau module SSOT** `apps/web/components/admin/agent/schedule-format.ts`
  (44 lignes) exportant les quatre fonctions, sur le patron sibling déjà en place
  (`config-form-merge.ts`). Docstring qui explique la garde `<= 0`.
- **`formatDuration` unifié sur la version gardée** — plus robuste, et strictement
  identique à l'ancien comportement pour toute entrée `> 0`. Pour `ms === 0` les
  deux anciennes versions donnaient déjà `'0min'` ; seul le domaine négatif change
  (« -1min » → « 0min »).
- **Deux composants allégés** : −47 lignes nettes (25 dans `AgentScheduleTimeline`,
  26 dans `TriggerSchedulingModal`, remplacées par un import chacun). Aucun autre
  fichier ne référençait ces fonctions (grep exhaustif).
- **Aucun export mort** : les quatre fonctions ont deux consommateurs dès le
  premier commit.

## Risk assessment

- **Négligeable.** Les fonctions sont pures et déplacées sans changement de corps
  (sauf l'unification de garde, qui ne fait que borner un cas d'affichage
  aberrant). Les 76 tests des deux composants + le nouveau module restent verts.
- **`tsc --noEmit` (web) : 1196 erreurs AVANT comme APRÈS** — backlog pré-existant
  du dépôt, strictement inchangé par ce diff (aucune erreur ne nomme les fichiers
  touchés).
- **Rollback :** supprimer `schedule-format.ts` + son test, réinliner les quatre
  fonctions aux deux sites.

## Proposed improvements

1. **RED** : `apps/web/__tests__/components/admin/agent/schedule-format.test.ts`
   (7 tests) — dont la garde `formatDuration(-90_000) === '0min'` qui prouve le
   comportement unifié, et les bornes de bande de `budgetColor` / `budgetGlow`.
2. **GREEN** : `schedule-format.ts` avec les quatre exports.
3. **REFACTOR** : les deux composants importent depuis `./schedule-format` et
   perdent leurs définitions locales.

## Expected benefits

- Quatre formateurs déclarés UNE fois ; dérive de bande/format impossible sans
  faire tomber un test.
- Garde de durée négative appliquée aux DEUX panneaux (correction du timeline).
- Répertoire `admin/agent/` un cran plus proche d'un style homogène (util local
  extrait, comme `config-form-merge.ts`).

## Implementation complexity

- **Faible.** 1 nouveau fichier (+44), 1 nouveau test (+58), 2 composants
  allégés (−47).

## Validation criteria

- [x] RED prouvé : la suite neuve échoue avant `schedule-format.ts` (module
      introuvable).
- [x] GREEN : `schedule-format` 7/7.
- [x] `AgentScheduleTimeline` + `TriggerSchedulingModal` + `schedule-format` :
      **76/76** après refactor.
- [x] `tsc --noEmit` (web) : 1196 erreurs avant = 1196 après (delta 0, aucune sur
      les fichiers touchés).
- [ ] ESLint non exécutable dans ce bac à sable (eslint-plugin-react 7.37.5
      incompatible avec eslint 10.x — `getFilename is not a function`, casse sur
      TOUT fichier). Style verbatim de l'existant ; gate ESLint réel côté CI.
- [ ] CI verte sur la PR.

## Améliorations futures (hors périmètre)

- **`formatDuration` / `formatTime` à l'échelle du web.** Il existe au moins trois
  autres `formatDuration` de signatures DIFFÉRENTES (`utils/audio-formatters.ts`
  en secondes, `app/dashboard/LastMessagePreview.tsx` en ms, `duration-format.ts`
  `formatClock` en secondes). Elles ne sont PAS interchangeables (unités et
  formats distincts) — une unification transverse demande un audit dédié et n'est
  pas justifiée tant que les usages ne convergent pas.
- **Bandes de budget dans le SDK ?** Les seuils 0.6/0.3 sont une règle produit
  web-only pour l'instant ; à ne mutualiser côté shared que si un second client
  affiche le même budget d'agent.
