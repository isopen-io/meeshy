# Plan — Iteration 195i — `BrandSignature` VoiceOver label i18n

- **Iteration**: 195i (iOS, suffix `i`) — chosen strictly > highest in-flight (194i, PRs #2174/#2181/#2179/#2177/#2176).
- **Source branch**: `main` HEAD (resync).
- **Working branch**: `claude/laughing-thompson-9isjjs`.
- **Surface**: `apps/ios/Meeshy/Features/Main/Components/BrandSignature.swift` — deferred track since 186i; absent from every open PR (verified via `list_pull_requests` + `search_code` for "Made with love"/"BrandSignature").

## Steps

1. Add localized key `splash.signature.a11yLabel` to `Localizable.xcstrings`
   (de/en/es/fr/pt-BR, `%1$@`/`%2$@` for version/build, credit with the WORD
   "love"), alpha-ordered between `splash.madeWithLove` and `splash.tagline`.
2. Replace the hardcoded English `.accessibilityLabel(Text("Meeshy version …"))`
   with a computed `accessibilityLabelText` reading the key via
   `String(localized:defaultValue:bundle:)`.
3. Remove the orphaned auto-extracted key
   `"Meeshy version %@, build %@. Made with love by Services CEO."`.
4. Validate JSON, commit, push, open PR. Gate = CI `iOS Tests`.

## Constraints

- iOS only. No logic / layout / visual change. No new tests (pure a11y/i18n string).
- Preserve "love" wording (avoid VoiceOver reading ❤️ as "red heart"); do not
  reuse `splash.madeWithLove` for the label.
