# Plan — Iteration 90i (2026-07-01)

## Objectif
Accessibilité `NewConversationView` (écran « Nouvelle conversation ») : **Dynamic Type**. iOS
exclusivement (suffixe `i`). Branche = `claude/upbeat-euler-bx683k`, base = `main` HEAD `591d03e9`.

## Diagnostic
- `NewConversationView.swift` : 17 sites `.font(.system(size:))` → l'écran ignore Dynamic Type
  (rupture règle a11y CLAUDE.md « never fixed font sizes for body text »).
- Couleurs **déjà** toutes tokenisées (`MeeshyColors`, `theme.*`, accent déterministe) → aucune
  dette palette.
- Glyphe décoratif d'état vide `person.slash` (36pt) non masqué de VoiceOver.

## Étapes
1. [x] Vérifier surfaces iOS non prises (`list_pull_requests` → 0 PR ouverte) ; `NewConversationView`
   listé « différé prioritaire » 84i/89i, retenu.
2. [x] Lire le fichier, classer chaque site (texte-de-lecture / glyphe inline vs décoratif fixe).
3. [x] Migrer 16/17 sites `.system(size:)` → `MeeshyFont.relative(size, weight:)` (weight préservé).
4. [x] Garder figé le glyphe `person.slash` (36pt état vide décoratif) + `.accessibilityHidden(true)`
   (précédent 74i/86i).
5. [x] Rédiger analyse `2026-07-01-iteration-90i.md` + ce plan.
6. [ ] Commit + push branche + PR.
7. [ ] Attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main` ; supprimer la branche mergée.
9. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 90i + ligne History) + marquer 89i ✅.

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap purement
  mécanique, `MeeshyFont` déjà consommé par de multiples vues → risque compile ~nul.
- **Débordement glyphe** → seul l'état vide 36pt reste figé ; les glyphes inline migrés scalent en
  tandem avec leur texte adjacent (pas de conteneur à dimension fixe dans cette vue).
- **Aucune dette palette / i18n touchée** → périmètre étroit, régression visuelle nulle au cadre
  Dynamic Type par défaut.

## Hors-scope (différé, documenté dans l'analyse)
- Normalisation des clés i18n français→dot (refactor i18n distinct, risque catalogue).
- Autres grandes surfaces Dynamic Type (`MagicLinkView`, `DataExportView`, `AffiliateView`,
  `LocationPickerView`) → 91i+.
