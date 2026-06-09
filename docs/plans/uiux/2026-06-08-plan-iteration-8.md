# Plan UI/UX — Itération 8 (2026-06-08)

✅ **COMPLÉTÉE — PR #XXX mergée dans main**

## Objectifs
1. Corriger le double-prefix i18n dans `language-select.tsx` + localiser 2 placeholders FR hardcodés
2. Finir la migration Dynamic Type dans `PostDetailView.swift` (3 instances restantes)

## Changements effectués

### Web — `apps/web/components/ui/language-select.tsx`
- `t('components.languageSelect.notFound')` → `t('languageSelect.notFound')` (fix double-prefix)
- `placeholder = "Sélectionner une langue"` (prop default) → removed default, fallback to `t('languageSelect.selectPlaceholder')`
- `placeholder="Rechercher une langue..."` (search input) → `placeholder={t('languageSelect.searchPlaceholder')}`

### Web — `apps/web/locales/{en,fr,es,pt}/components.json`
- Added `languageSelect.selectPlaceholder` (en: "Select a language", fr: "Sélectionner une langue", es: "Seleccionar un idioma", pt: "Selecionar um idioma")
- Added `languageSelect.searchPlaceholder` (en: "Search a language...", fr: "Rechercher une langue...", es: "Buscar un idioma...", pt: "Pesquisar um idioma...")

### iOS — `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`
- L690: `.font(.system(size: isActive ? 12 : 10))` → `.font(isActive ? .caption : .caption2)`
- L770: `.font(.system(size: 11))` → `.font(.caption2)`
- L1004: `.font(.system(size: isActive ? 11 : 9))` → `.font(.caption2)`

## Déferré → Itération 9

- iOS Color(hex:) remaining: `UniversalComposerBar` (~47× — all use dynamic `accentColor` param, confirmed no violation), `ConversationDashboardView` remaining occurrences outside sentiment section
- Any new components added post-iter-8 requiring i18n/a11y audit
