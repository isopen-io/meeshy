# Plan — Iteration 94i (2026-07-01) — SharePickerView

## Objectif
iOS exclusivement. Rendre `SharePickerView` (feuille « Partager avec… ») compatible Dynamic Type :
migrer 14/16 `.font(.system(size:))` → `MeeshyFont.relative(...)`, garder figée la colonne de
contrôle d'envoi (26pt, alignée avec le `ProgressView` 26×26), masquer VoiceOver la loupe décorative.

## Base de départ
`main` HEAD (`6b8abcbb`, post-#1225/93i mergée). Branche `claude/upbeat-euler-512kep` resync sur
`origin/main` (inclut ma 93i LocationPickerView).

## Contexte de contention
Essaim d'agents iOS très dense (3 PR sur LocationPickerView seule, 4 sur AffiliateView). Toutes les
cibles « chaudes » + la liste « next » (MemberManagementSection…) sont prises ou à haut risque.
`SharePickerView` = **hors-radar total** (0 PR, 0 mention) → choisi pour collision minimale.

## Étapes
1. [x] PR merged 93i → resync sur `main`, `list_pull_requests` (constat essaim + doublons).
2. [x] Survey codebase → surface hors-radar `SharePickerView` (14 sites, 0 PR).
3. [x] Migrer 14 sites (texte + icônes contenu + `ConversationTitleLabel(font:)`).
4. [x] Garder figés 2 glyphes de contrôle 26pt + commentaire (doctrine 86i).
5. [x] Masquer VoiceOver loupe décorative.
6. [x] Docs analyse + plan (`-94i-share`) + `branch-tracking.md`.
7. [ ] Commit + push `claude/upbeat-euler-512kep`.
8. [ ] PR, attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche mergée.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n, 0 test neuf (sweep pur).
- Palette + layout par défaut inchangés → zéro régression visuelle à `.large`.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge après CI verte.
