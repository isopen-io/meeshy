# Plan — Iteration 93i (2026-07-01)

## Objectif
Accessibilité `ConversationPreferencesTab` (onglet Préférences de `ConversationInfoSheet`) :
**Dynamic Type** + **VoiceOver** (en-tête de section + glyphes décoratifs masqués). iOS
exclusivement (suffixe `i`). Branche = `claude/upbeat-euler-bx683k`, base = `main` HEAD `33f89430`.

## Diagnostic
- `ConversationPreferencesTab.swift` : 16 sites `.font(.system(size:))` → l'onglet ignore Dynamic
  Type (rupture règle a11y CLAUDE.md « never fixed font sizes for body text »).
- En-têtes de section (`settingsSection`) sans trait `.isHeader` → pas navigables au rotor.
- Glyphes décoratifs en badge non masqués de VoiceOver.
- i18n déjà complet ; teintes = ladder catégoriel par-section (hors-scope palette).

## Étapes
1. [x] Forte contention iOS → `list_pull_requests` (8 PRs) ; surfaces libres restantes vérifiées.
   `ConversationPreferencesTab` = surface neuve absente de toute PR/différé → retenue.
2. [x] Lire le fichier, classer chaque site (texte / glyphe libre vs glyphe en badge fixe 28×28).
3. [x] Migrer 12/16 sites `.system(size:)` → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés).
4. [x] Garder figés 4 glyphes de badge fixe 28×28 (pencil/grid/tag/settingsRow) + `.accessibilityHidden(true)`.
5. [x] `settingsSection` : `.accessibilityLabel(title)` non-uppercased + `.accessibilityAddTraits(.isHeader)`.
6. [x] Rédiger analyse `2026-07-01-iteration-93i.md` + ce plan.
7. [ ] Commit + push branche + PR (numéro 93i — 91i/92i pris par PRs parallèles).
8. [ ] Attendre CI `iOS Tests` verte.
9. [ ] Merger dans `main` ; supprimer la branche mergée.
10. [ ] Mettre à jour `branch-tracking.md` (pointeur autoritaire iOS → 93i + ligne History).

## Risques / mitigations
- **Pas de compile locale** (SwiftUI/Linux) → gate = CI `ios-tests.yml`. Swap mécanique,
  `MeeshyFont` déjà consommé → risque compile ~nul.
- **Débordement badge** → évité en gardant les 4 glyphes de badge 28×28 figés.
- **Numéro** : 91i/92i pris par ~7 PRs iOS parallèles → 93i choisi (> plus haut numéro ouvert).
- **Collision fichier** : `ConversationPreferencesTab` absent de toute PR ouverte → orthogonal.

## Hors-scope (différé, documenté dans l'analyse)
- Ladder catégoriel de teintes par-section (décision charte unique différée).
- Autres grandes surfaces Dynamic Type (`LocationPickerView`, `MemberManagementSection`,
  `MessageOverlayMenu`) → 94i+.
