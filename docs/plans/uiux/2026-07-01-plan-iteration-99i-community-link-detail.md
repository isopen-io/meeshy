# Plan — Iteration 99i (2026-07-01) — CommunityLinkDetailView

## Objectif
iOS exclusivement. Enrichir l'accessibilité et l'UX de `CommunityLinkDetailView` (détail d'un
lien communautaire) sur 3 axes :
1. **Dynamic Type** : migrer 8/10 `.font(.system(size:))` → `MeeshyFont.relative(...)`, garder
   figés les 2 glyphes contraints dans un cadre fixe (héros 60×60, badge d'action 52×52).
2. **Sélection / copie de contenu native** : `.textSelection(.enabled)` sur l'URL de jointure
   et les valeurs de la section INFORMATIONS (copie de la chaîne complète via long-press).
3. **VoiceOver** : masquer glyphes décoratifs, combiner cartes de stats + lignes info, trait
   `.isHeader` sur l'en-tête de section.

## Base de départ
`main` HEAD (`ee334ec5`, post-#1240). Branche `claude/upbeat-euler-spied4` resync sur
`origin/main` au démarrage.

## Contexte de contention
Essaim d'agents iOS parallèles (29 PR ouvertes, ~15 iOS 94i→98i). Surfaces prises listées dans
l'analyse. `CommunityLinkDetailView` = **aucune PR** → choisi pour zéro collision. Numéro **99i**
(au-dessus de la plus haute PR ouverte 98i).

## Étapes
1. [x] Diagnostic contention (`list_pull_requests`) → 15 surfaces iOS prises, CommunityLinkDetailView libre.
2. [x] Resync `claude/upbeat-euler-spied4` sur `origin/main`.
3. [x] Migrer 8 sites texte/glyphes-inline → `MeeshyFont.relative(size, weight:, design:)`.
4. [x] Garder figés 2 glyphes (héros 60×60 + badge 52×52) + commentaires + `.accessibilityHidden` héros.
5. [x] Activer `.textSelection(.enabled)` sur URL héros + valeurs info.
6. [x] VoiceOver : `.accessibilityHidden` ×2, `.accessibilityElement(.combine)` ×2, `.isHeader` ×1.
7. [x] Vérifier : 8 `relative` + 2 `.system` figés = 10 ; 2 textSelection ; 5 traits a11y.
8. [x] Docs analyse + plan (`-99i-community-link-detail`) + entrée `branch-tracking.md`.
9. [ ] Commit + push `claude/upbeat-euler-spied4`.
10. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
11. [ ] Merger dans `main`, supprimer la branche mergée.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n, 0 test neuf.
- Palette déjà tokenisée (`communityAccent`/`theme.*`/sémantiques) → intacte.
- `MeeshyFont`/`MeeshyColors` résolus via `@_exported import MeeshyUI` → 0 import ajouté.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge dans `main` après CI verte.
