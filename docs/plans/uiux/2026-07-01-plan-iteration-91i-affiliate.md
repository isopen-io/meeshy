# Plan itération 91i — `AffiliateView` (Dynamic Type + VoiceOver)

**Base** : `main` HEAD (`ae1d5434`)
**Branche** : `claude/upbeat-euler-f80iih`
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`

## Objectif
Rendre l'écran « Parrainage » conforme Dynamic Type + combler les lacunes VoiceOver, sans toucher
la logique, la palette (déjà tokenisée) ni introduire de clé i18n.

## Étapes
1. [x] Vérifier la surface non prise par les PRs iOS en vol (`list_pull_requests`).
2. [x] Confirmer signature `MeeshyFont.relative(size, weight:, design:)` (MeeshyUI).
3. [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design préservés).
4. [x] Garder le hero `link` 36pt figé + commentaire + `.accessibilityHidden(true)`.
5. [x] Ajouter `.accessibilityLabel` sur les 3 boutons d'action de token (SSOT
       `common.copyLink`/`common.share`/`common.delete`) + bouton `+` (`affiliate.create.title`).
6. [x] Grouper stats/méta via `.accessibilityElement(children: .combine)` + en-tête de section `.isHeader`.
7. [x] Rédiger analyse + plan + mettre à jour `branch-tracking.md`.
8. [ ] Commit, push, PR, attendre CI `iOS Tests` verte, merger dans `main`, supprimer la branche.

## Garde-fous
- 0 clé i18n neuve (toutes réutilisées SSOT).
- 0 logique, 0 test neuf (sweep présentation pur).
- Gate = CI `iOS Tests` (pas de toolchain Xcode en local Linux).
