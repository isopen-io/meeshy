# Iteration 72 — Analyse d'optimisation (2026-07-01)

## Protocole renforcé v3 (démarrage) — RÉGRESSION `TS2300` RÉINTRODUITE (2e occurrence)
Le protocole v3 (détection des doublons d'import post-merge) a détecté que la **même régression build**
corrigée en iter 70 (PR #1266, `a08adf17`) a été **réintroduite** sur `main` (`ed04f121`).

### Diagnostic
- `import { copyToClipboard }` de nouveau **en double** dans les 2 fichiers chauds :
  - `use-header-actions.ts` : L3 **et** L6.
  - `ConversationItem.tsx` : L8 **et** L26.
- `tsc` : **4× `TS2300 Duplicate identifier 'copyToClipboard'`**. **Build cassé sur `main`.**
- **Cause** : commit `d31c7ca4` — « Merge branch 'main' into `claude/sharp-wozniak-vz661u` ». Un agent
  parallèle avait une **branche F30-d obsolète** (forkée avant le fix iter 70), a mergé `main` dedans
  **sans résoudre le doublon** que le fix avait retiré, puis sa PR a été mergée → réintroduction du doublon.

C'est la **2e fois** que ces 2 fichiers subissent la même collision : F30-d a été livré indépendamment par
≥3 branches (dont 2 nôtres consolidées + ≥1 parallèle), chacune ré-ajoutant l'import.

### Correction (iter 72)
Suppression du **2e** `import { copyToClipboard }` dans chacun des 2 fichiers (garde la 1re occurrence).
- `tsc` : **4× `TS2300` retirées**, aucune ajoutée → build `main` restauré.
- `jest` header + conversation-item : **27/27** verts.
- Scan app-wide : **aucun autre doublon** `copyToClipboard`.

## Leçon PROC v3 renforcée (→ v3.1)
1. **Fichiers chauds = zone interdite** : la conversion F30-d de `use-header-actions.ts` /
   `ConversationItem.tsx` est **déjà complète et mergée** sur `main`. Aucune itération future (nôtre ou
   parallèle) ne doit y retoucher pour F30 — tout nouvel ajout d'import y est un **doublon par construction**.
2. **Angle mort CI structurel** : le doublon post-merge est **invisible au CI par-PR** (chaque branche est
   propre isolément) — seul un `tsc` au **démarrage de l'itération suivante** (protocole v3) le rattrape.
   Recommandation infra (hors périmètre autonome) : merge-queue ou check post-merge sur `main`, ou règle
   ESLint `no-duplicate-imports` **couplée à un CI post-merge**.
3. **Toujours** exécuter `grep -c "import { X }"` + `tsc` sur les sources uniques récemment adoptées AVANT
   de choisir un lot — priorité absolue à la restauration du build si régression.

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F30 (reste) | ~7 sites exotiques : Header ×4 (landing), use-message-interactions, share-affiliate-modal, admin/{share,tracking}-links, tracking-links.ts, share-utils.ts | MOYEN |
| F31 | `truncateText` dupliqué (`truncate.ts` vs `xss-protection.ts`) | FAIBLE-MOYEN |
| PROC v3.1 | Fichiers chauds F30-d = zone interdite ; angle mort CI post-merge documenté | PROCESS |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT (~75 % BP) |

## Gain
Build `main` **restauré** une 2e fois (0 `TS2300`). Protocole v3.1 : fichiers chauds F30-d marqués zone
interdite. La convergence F30 acquise (iters 65-71) est préservée.
