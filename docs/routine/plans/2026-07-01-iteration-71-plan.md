# Iteration 71 — Plan d'implémentation (2026-07-01)

## Objectif
Corriger la **régression build** sur `main` (HEAD `2d91d96d`) causée par la collision inter-agents du
sous-lot F30-d : doublon d'`import { copyToClipboard }` (`TS2300` × 4) + marqueurs de conflit / sections
concaténées dans les docs routine de l'itération 68.

## Étapes (implémentation → vérification)

### Phase A — Déduplication des imports
- [x] `components/conversations/header/use-header-actions.ts` : retirer l'occurrence en double de
      `import { copyToClipboard } from '@/lib/clipboard';` (garder 1).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : idem.

### Phase B — Consolidation des docs routine iter 68
- [x] `docs/routine/analyses/2026-07-01-iteration-68-analyse.md` : supprimer les marqueurs
      `<<<<<<< / ======= / >>>>>>>`, fusionner les deux versions en un récit unique cohérent.
- [x] `docs/routine/plans/2026-07-01-iteration-68-plan.md` : dédupliquer les sections concaténées.

### Phase C — Vérification & livraison
- [x] `tsc --noEmit` (apps/web) : **1198** erreurs (baseline), **0 `TS2300`** (vs 4 sur `main`).
- [x] `jest` ParticipantPresenceIndicator (5/5 vert).
- [ ] Commit + push `claude/sharp-wozniak-vz661u` ; PR vers `main` ; CI verte ; **merge**.

## Continuité
Iter 72 : appliquer strictement le réflexe anti-collision du protocole v2 (grep imports + marqueurs de
conflit au démarrage). Cible candidate **disjointe** de F30 (domaine disputé) : F32 (regex ObjectId
gateway, lot dédié) ou un cluster UI non-clipboard. Ne PAS reprendre un sous-lot F30 sans coordination.

## Statut
- [x] Phase A — imports dédupliqués.
- [x] Phase B — docs iter 68 consolidées.
- [ ] Phase C — tsc OK ; reste jest + push + PR + CI + merge.
