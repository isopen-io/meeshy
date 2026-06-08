# Plan UI/UX — Iteration 3

**Date**: 2026-06-08  
**Branche**: claude/dazzling-hawking-Gehte  
**Analyse source**: docs/analyses/uiux/2026-06-08-iteration-3.md

## Objectifs

Corriger les 7 problèmes identifiés dans l'analyse iter-3 :
- 4 problèmes Web (W1-W4) : i18n CallControls, i18n+dark PermissionRequest, dark+i18n NotFoundPage, i18n ConnectionQualityBadge
- 3 problèmes iOS (I1-I3) : MeeshyColors UniversalComposerBar (rouge enreg + purple blur), Dynamic Type Text

---

## Tasks

### Web

- [x] W1 — Ajouter clés `controls.*` dans `locales/{en,fr,es,pt}/calls.json` + `useI18n` dans `CallControls.tsx`
- [x] W2 — Ajouter clés `permissions.*` dans `locales/{en,fr,es,pt}/calls.json` + `useI18n` dans `PermissionRequest.tsx`
- [x] W3 — Dark mode classes + clés `notFound.*` dans les 4 locales + `useI18n` dans `not-found-page.tsx`
- [x] W4 — Ajouter clés `quality.*` dans les 4 locales + `useI18n` dans `ConnectionQualityBadge.tsx`

### iOS

- [x] I1 — `UniversalComposerBar.swift` : `Color(hex: "FF6B6B"/"FF2E63")` → `MeeshyColors.error`/`MeeshyColors.errorDark`
- [x] I2 — `UniversalComposerBar.swift` : `Color(hex: "A855F7")` → `MeeshyColors.indigo600`
- [x] I3 — `UniversalComposerBar.swift` : `Text()` 9pt → `.caption2`, 10-12pt → `.caption`

---

## Cohérence cross-platform

Après chaque modification Web : vérifier que le dark mode CSS et les classes Tailwind sont cohérentes avec le thème existant (`globals.css`).

Après modifications iOS : s'assurer que `UniversalComposerBar` s'intègre cohéremment avec `MeeshyColors` dans ConversationView + composer area.

---

## CI Gate

- `pnpm -C apps/web build` doit passer (TypeScript strict, pas de any)
- `./apps/ios/meeshy.sh build` doit passer
- Merger dans main une fois CI vert

---

## Review résultat

Après implémentation, documenter ici ce qui a été corrigé et les effets observés.
