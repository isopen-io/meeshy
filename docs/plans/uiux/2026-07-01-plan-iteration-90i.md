# Plan — Itération 90i (2026-07-01)

## Objectif
Dynamic Type `FeedCommentsSheet.swift` (feuille de commentaires du feed). iOS exclusivement
(suffixe `i`). Branche = `claude/upbeat-euler-ghu3bp`, base = `main` HEAD `c8063196`.

## Motivation
Surface flaggée « à re-vérifier » depuis 84i (historique 72i/`429ad8b7` prétendait la migration,
mais le fichier restait **28 fixed / 0 relative**). Re-vérification confirmée avant travail :
la migration n'avait jamais eu lieu. 90i comble ce trou réel.

## Étapes
1. [x] Resync branche désignée sur `main` HEAD (`c8063196`).
2. [x] Re-vérifier `FeedCommentsSheet.swift` : 28 `.font(.system(size:))` / 0 `MeeshyFont.relative`.
3. [x] Migrer 23 sites texte-de-lecture + glyphes inline appariés → `MeeshyFont.relative(size, weight:)`.
4. [x] Garder 5 sites figés (2 chrome `xmark` cadre fixe, 2 drapeaux d'état, 1 icône décorative) + commenter.
5. [x] Vérifier compte (23 relative + 5 fixed = 28) et bonne formation des appels.
6. [x] Rédiger analyse + plan 90i.
7. [ ] Commit + push branche `claude/upbeat-euler-ghu3bp`.
8. [ ] Ouvrir PR, attendre CI `iOS Tests` verte, merger dans `main`.
9. [ ] Mettre à jour `branch-tracking.md` (pointeur 91i = `main` HEAD).

## Portée
- 1 fichier, sweep typographique pur. 0 logique, 0 clé i18n, 0 test neuf.
- Gate unique = CI `iOS Tests` (pas de toolchain Xcode en local Linux).

## Différé prioritaire iOS 91i+
- Dynamic Type grandes surfaces restantes : `StoryViewerView+Content` (31, coordonner i18n),
  `ConversationView+Composer` (22, lot prudent), `MagicLinkView` (17), `DataExportView` (17),
  `AffiliateView` (17).
- Glass adoption reste (`MessageOverlayMenu` — lot dédié `AdaptiveGlassContainer`).
- **NE PLUS re-flagger** `FeedCommentsSheet` (soldé 90i ; 5 `.system(size:)` figés à dessein).
