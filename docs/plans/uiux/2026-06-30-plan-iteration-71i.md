# Plan — Iteration 71i (2026-06-30)

## Objectif
Solder le différé palette **hex-string** de 70i sur les écrans Support/Signalement : remplacer
les chaînes hex sémantiques hardcodées par les tokens `MeeshyColors` correspondants, **sans**
toucher au ladder catégoriel arc-en-ciel (différé charte unique) ni aux polices figées (différé
Dynamic Type).

## Périmètre (2 fichiers de production, swap littéral→token uniquement)

### `apps/ios/Meeshy/Features/Main/Views/ReportUserView.swift`
- `"F59E0B"` → `MeeshyColors.warningHex` (section Raison, header + fond — ×2)
- `"3498DB"` → `MeeshyColors.infoHex` (section Détails, header + surfaceGradient + border — ×3)

### `apps/ios/Meeshy/Features/Main/Views/SupportView.swift`
- `accentColor = "27AE60"` → `MeeshyColors.successHex` (aide + chevron retour)
- `"3498DB"` → `MeeshyColors.infoHex` (contact — ×4)
- `"E67E22"` → `MeeshyColors.warningHex` (signalement — ×4)
- `"6B7280"` → `MeeshyColors.neutral500Hex` (informations — ×5)

## Exclus (documentés, ne pas re-flagger)
- `PrivacySettingsView` : ladder catégoriel arc-en-ciel (couleurs par-ligne arbitraires) =
  différé charte unique. Migration = redesign, hors scope.
- `.font(.system(size:))` figés = différé Dynamic Type (lot dédié).

## Mapping de tokens (charte `MeeshyColors`)
| Hex hors-charte | Token | Valeur charte | Intention |
|---|---|---|---|
| `F59E0B` / `E67E22` | `warningHex` | `#FBBF24` | mise en garde / signalement |
| `3498DB` | `infoHex` | `#60A5FA` | information / contact |
| `27AE60` | `successHex` | `#34D399` | aide / accent positif |
| `6B7280` | `neutral500Hex` | `#6B7280` | métadonnées (identique) |

## Tests
Pur swap visuel sans logique → **aucun test neuf** (précédent 69i `gzrxp1`). Aucun test
n'asserte ces hex (vérifié). Gate = compile CI `ios-tests.yml` (Xcode 26.1.x / simu 18.2).
`import MeeshyUI` déjà présent dans les deux fichiers. Pas d'édition `project.pbxproj`
(XcodeGen globe les `.swift`).

## Vérification finale
- [x] Aucun hex `"XXXXXX"` résiduel dans les deux fichiers (`grep` → none)
- [x] 5 tokens `ReportUserView` + 14 tokens `SupportView`
- [x] Helpers `surfaceGradient(tint: String)` / `border(tint: String)` acceptent les String tokens
- [ ] CI `iOS Tests` verte → merge dans main

## Branche
`claude/upbeat-euler-rct0s1` (base `main` HEAD `e4f0aa0`). Après CI verte : merge dans main,
mettre à jour `branch-tracking.md` (pointeur iOS → 71i), supprimer la branche mergée.
