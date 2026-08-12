# Iteration 72 — Plan d'implémentation (2026-07-01)

## Objectif
**Corriger (2e fois) la régression build sur `main`** : doublon `import { copyToClipboard }` (`TS2300`)
réintroduit par un merge parallèle (`d31c7ca4`, branche F30-d obsolète) après le fix iter 70.

## Étapes

### Phase A — Correction de la régression
- [x] `components/conversations/header/use-header-actions.ts` : suppression du 2e import `copyToClipboard`
      (L6), garde le 1er (L3).
- [x] `components/conversations/conversation-item/ConversationItem.tsx` : suppression du 2e import (L26),
      garde le 1er (L8).

### Phase B — Vérification & livraison
- [x] `tsc --noEmit` : 4× `TS2300` retirées, 0 ajoutée → build `main` restauré.
- [x] `jest` header + conversation-item : **27/27** verts.
- [x] Scan app-wide : aucun autre doublon `copyToClipboard`.
- [ ] Commit + push `claude/sharp-wozniak-0fc6ol` (force-with-lease) ; PR vers `main` ; CI (Quality-bun) ; **merge**.

## Continuité (protocole v3.1)
- **Fichiers chauds F30-d (`use-header-actions`, `ConversationItem`) = ZONE INTERDITE** : conversion déjà
  complète sur `main` ; ne plus y toucher pour F30 (tout ajout d'import = doublon par construction).
- Itération suivante : protocole v3 (`tsc` + `grep -c` au démarrage), puis F30 sur cluster **exotique**
  restant (`use-message-interactions`, `share-affiliate-modal`, admin links) ou F31 (dédup `truncateText`).

## Statut (mis à jour en fin d'itération)
- [x] Phase A — 2 doublons supprimés.
- [x] Phase B — tsc 4×TS2300 retirées + 27/27 ; reste : push + PR + CI + merge.
