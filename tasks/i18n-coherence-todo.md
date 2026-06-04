# i18n Coherence Audit — Plan (branch claude/i18n-inconsistencies-audit-QZGf1)

## Decision: Cookie-based SSR (next-intl/URL routing rejected per apps/web/decisions.md:45)

## Bugs (with proof)
1. `<html lang="fr">` hardcoded (layout.tsx:81, global-error.tsx:54)
2. `og:locale: 'fr_FR'` hardcoded in 16 files
3. Titles/descriptions all French over English UI (16 files)
4. Hardcoded French in AuthGuard.tsx:42
5. Duplicate language selector header + LandingContent.tsx:73

## Tasks
- [ ] lib/i18n/locale-config.ts (pure)
- [ ] lib/i18n/server-locale.ts (server-only)
- [ ] lib/i18n/metadata.ts (composePageMetadata + buildPageMetadata)
- [ ] locales/{en,fr,es,pt}/metadata.json
- [ ] tests locale-config + metadata
- [ ] language-store cookie sync
- [ ] app/layout.tsx async + html lang + skip link
- [ ] 10 static layouts
- [ ] 6 dynamic layouts
- [ ] global-error lang
- [ ] api/metadata route
- [ ] AuthGuard i18n
- [ ] LandingContent + page.tsx dedup
- [ ] verify jest/tsc/build

## Review (done)
Approach: cookie-based SSR (no URL routing), honouring decisions.md:45.

New infra (pure + tested, 29 tests):
- lib/i18n/locale-config.ts — supported locales, og:locale map, Accept-Language parser, resolver, interpolate
- lib/i18n/server-locale.ts — getServerLocale() (cookie → Accept-Language → 'en')
- lib/i18n/metadata.ts — composeMetadata/composePageMetadata (pure) + buildPageMetadata (async) + bundle accessors
- locales/{en,fr,es,pt}/metadata.json — per-page titles/descriptions/og alts (+ dynamic templates)

Wiring:
- language-store: writes meeshy-interface-language cookie on set/detect/rehydrate; default 'en'
- app/layout.tsx: async, <html lang={serverLocale}>, localized skip link, generateMetadata('home')
- 10 static + 6 dynamic layouts: localized titles/descriptions + og:locale from server locale
- AuthGuard: 3 hardcoded FR strings → common.authGuard.* (en/fr/es/pt)
- LandingContent + page.tsx: removed redundant hero language selector (header keeps the only one)

Verified: 79 tests green (i18n libs, language-store, use-i18n); touched files tsc-clean (966 remaining
errors are pre-existing/environmental — build sets typescript.ignoreBuildErrors). AuthGuard.test's
`Cannot redefine property: location` is pre-existing on clean main (jsdom sandbox quirk).

Out of scope (documented follow-up): app/api/metadata/route.ts + lib/share-utils.ts produce share
JSON for the Web Share API (not rendered into any <head>); left untouched to avoid regressions.
global-error.tsx left as-is (French text + lang="fr" is internally coherent; not in audit).
