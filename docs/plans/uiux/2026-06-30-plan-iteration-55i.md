# Plan — Iteration 55i (2026-06-30)

> **Renuméroté 54i → 55i** (suivi documentaire) : développé/mergé sous le label « 54i »
> (PR #1128), renuméroté pour résoudre une collision multi-agents (GlobalSearchView #1089 =
> 54i canonique ; palette = 56i ; InviteFriendsSheet = 57i). Le code est déjà dans `main` ;
> ce suivi ne touche que les docs/ledger.

## Objectif
iOS only. **Accessibilité Dynamic Type** : migrer la plus grosse surface iOS encore figée,
`ConversationInfoSheet` (fiche d'information de conversation), des `.font(.system(size:))`
codées en dur vers l'atome SDK `MeeshyFont.relative(...)`. Poursuite de 54i (`GlobalSearchView`).

## Périmètre
- **1 fichier** : `apps/ios/Meeshy/Features/Main/Components/ConversationInfoSheet.swift`.
- iOS exclusivement (suffixe `i`). Aucune dépendance web/Android.

## Base
- Branche : `claude/upbeat-euler-ukl6b1`, resync sur `main` HEAD `0d3498b` (post 53i GlobalSearchView).

## Changements
- [x] 51 × `.font(.system(size: N, …))` → `.font(MeeshyFont.relative(N, …))` (header bar,
      en-têtes direct+hero, sélecteur d'onglets, onglets Membres/Médias, aperçu + feuille
      épinglés, état vide, section sécurité E2E, boutons action + bloquer).
- [x] 1 badge numérique de comptage d'onglet (`size:10`) gardé figé avec commentaire d'exception.

## Vérification
- [x] 51 `MeeshyFont.relative`, 1 figé restant, aucun double-paren, `MeeshyFont` exposé par
      MeeshyUI (déjà importé).
- [x] CI `ios-tests.yml` verte → **PR #1128 mergée dans `main`**.

## Merge / suivi
- [x] PR #1128 mergée ; branche supprimée.
- [x] De-collision documentaire : déconcaténation du `54i.md`/plan mashé (4 agents) en fichiers
      distincts 54i (GlobalSearchView), 55i (ConversationInfoSheet), 56i (palette),
      57i (InviteFriendsSheet) ; refs de plan corrigées ; ledger annoté.
- [ ] Base 56i+ : `main` HEAD (toujours resync avant de commencer).
