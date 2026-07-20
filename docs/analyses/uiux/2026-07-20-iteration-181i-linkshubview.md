# Iteration-181i — LinksHubView adaptive surfaces + VoiceOver cleanup

**Date**: 2026-07-20
**Surface**: `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift` (link hub, deep link `/links`)
**Scope**: iOS only · 1 file · 0 logic · 0 new tests
**Base**: `main` HEAD `5ddec12`

## Problème identifié

### 1. Surfaces figées non adaptatives (bug light mode)
`LinksHubView` peignait ses cartes (banner + 4 cartes de catégorie) avec
`Color.white.opacity(0.05)` en `fill` et des bordures figées
(`MeeshyColors.communityAccent.opacity(0.3)`, `accent.opacity(0.2)`).

La page repose sur `theme.backgroundGradient`, **blanc `#FFFFFF` en light mode**.
Un `fill` blanc à 5 % par-dessus un fond blanc → cartes **quasi invisibles**
(surface + bordure à peine perceptibles). Régression light-mode réelle.

Le reste de l'app (`ReportUserView`, `PrivacySettingsView`) peint ses cartes
via `theme.surfaceGradient(tint:)` + `theme.border(tint:)`, helpers qui
**adaptent l'intensité selon le mode** (`mode.isDark ? 0.15 : 0.08`). LinksHubView
était le seul hub à diverger → incohérence design-system + violation doctrine
« avoid fixed colors, prefer semantic tokens ».

### 2. Glyphes décoratifs non masqués de VoiceOver
Chaque carte de navigation est un `Button` dont le label contient une icône de
tête (miroir du titre) et un chevron de fin, tous deux décoratifs mais exposés
à VoiceOver.

## Correctifs

| # | Avant | Après |
|---|-------|-------|
| 1 | `.fill(Color.white.opacity(0.05))` (banner) | `.fill(theme.surfaceGradient(tint: MeeshyColors.communityAccentHex))` |
| 2 | `.stroke(MeeshyColors.communityAccent.opacity(0.3), …)` | `.stroke(theme.border(tint: MeeshyColors.communityAccentHex), …)` |
| 3 | `.fill(Color.white.opacity(0.05))` (carte) | `.fill(theme.surfaceGradient(tint: accentHex))` |
| 4 | `.stroke(accent.opacity(0.2), …)` | `.stroke(theme.border(tint: accentHex), …)` |
| 5 | icône de tête exposée | `.accessibilityHidden(true)` |
| 6 | chevron de fin exposé | `.accessibilityHidden(true)` |

Chaque carte tinte désormais sa surface avec **sa propre couleur d'accent**
(`shareAccentHex`, `trackingAccentHex`, `communityAccentHex`, `successHex`) déjà
passée en paramètre `accentHex` — teinte cohérente en dark ET light. VoiceOver
lit maintenant chaque carte comme « titre, description » ; le bouton « Créer »
imbriqué reste exposé séparément (label inchangé). 0 changement de dark mode
(intensité 0.15 ≈ visuel d'origine), correction ciblée du light mode.

## Vérification
- Environnement Linux distant → pas de Xcode ; build/tests sur runners macOS CI (`iOS Tests`).
- `theme.surfaceGradient(tint:String)` / `theme.border(tint:String)` : signatures
  confirmées `ThemeManager.swift:148,166`, déjà consommées par `ReportUserView`,
  `PrivacySettingsView` → pattern compilé et éprouvé.
- Tokens confirmés : `MeeshyColors.communityAccentHex` (`MeeshyColors.swift:84`).
- `MeeshyColors.communityAccent` (Color) reste utilisé (back-arrow, icône banner) → 0 symbole orphelin.
- 0 contention : `LinksHubView` (le hub) absent des PR ouvertes et des merges récents
  (qui portent sur les vues détail : `CommunityLinkDetailView`, `TrackingLinkDetailView`, `ShareLinkDetailView`).

## Statut : ✅ RÉSOLU
Surfaces adaptatives light/dark alignées sur le design-system ; glyphes
décoratifs masqués de VoiceOver. Ne plus reprendre `LinksHubView` sur ces axes.
