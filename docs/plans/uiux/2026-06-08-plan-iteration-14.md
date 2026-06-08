# UI/UX Plan — Iteration 14 (2026-06-08)

Based on `docs/analyses/uiux/2026-06-08-iteration-14.md`.

## Strategy

Two passes:
1. **i18n**: Fix 13 French `defaultValue` strings in `DetailTab.label` and `ViewsFilter.label` (small, safe)
2. **Dynamic Type**: Migrate 106 `.font(.system(size:))` calls by size group (large systematic change)

## Pass 1 — i18n French defaultValues

### DetailTab.label (lines 31–40)
- L31: `defaultValue: "Langue"` → `"Language"`
- L32: `defaultValue: "Vues"` → `"Views"`
- L34: `defaultValue: "Reagir"` → `"React"`
- L35: `defaultValue: "Signaler"` → `"Report"`
- L36: `defaultValue: "Supprimer"` → `"Delete"`
- L37: `defaultValue: "Transferer"` → `"Forward"`
- L40: `defaultValue: "Historique"` → `"History"`

### ViewsFilter.label (lines 69–75)
- L69: `defaultValue: "Envoye"` → `"Sent"`
- L70: `defaultValue: "Distribue"` → `"Delivered"`
- L71: `defaultValue: "Lu"` → `"Read"`
- L72: `defaultValue: "Pas vu"` → `"Not seen"`
- L73: `defaultValue: "Ecoute"` → `"Listened"`
- L74: `defaultValue: "Vu"` → `"Seen"`

## Pass 2 — Dynamic Type Migration

Size → semantic mapping applied to all 106 instances:

| `.system(size:)` | Replacement |
|------------------|-------------|
| `size: 9` | `.caption2` + `.minimumScaleFactor(0.8)` on the Text |
| `size: 10` | `.caption2` |
| `size: 11` | `.caption2` |
| `size: 12` | `.caption` |
| `size: 13` | `.footnote` |
| `size: 14` | `.subheadline` |
| `size: 15` | `.callout` |
| `size: 16` | `.callout` |
| `size: 18` | `.title3` |
| `size: 28` | **KEEP AS-IS** — large stats numeral |
| `size: 48` | **KEEP AS-IS** — decorative emoji/icon |

Weight modifiers:
- `.weight(.semibold)` → append `.weight(.semibold)` to semantic font
- `.weight(.bold)` → append `.weight(.bold)` or `.bold()`
- `.weight(.medium)` → append `.weight(.medium)`
- `.weight(.light)` → append `.weight(.light)`

Monospaced design:
```swift
// Before
.font(.system(size: X, weight: .Y, design: .monospaced))
// After
.font(.system(.semanticFont, design: .monospaced).weight(.Y))
```

## Checklist

- [ ] I2a — DetailTab 7× French defaultValues → English
- [ ] I2b — ViewsFilter 6× French defaultValues → English
- [ ] I1 — Dynamic Type 106× font migrations in MessageDetailSheet.swift
- [ ] Commit & push on feat/uiux-iter14
- [ ] CI green
- [ ] Merge into main
