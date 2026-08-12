# Plan — Iteration 208i — Legal screens language default

**Working branch**: `claude/laughing-thompson-qqnyzd` (restarted from `origin/main` @ `22465a5`)
**Base**: `main` HEAD
**Iteration**: 208i (strictly > 207i (CallJournalRow, merged) — highest number claimed)

## Goal

Make `TermsOfServiceView` and `PrivacyPolicyView` open in the user's preferred content
language instead of a hardcoded `"fr"`, honoring the Prisme Linguistique.

## Steps

1. [x] Restart branch from latest `main` (was 67 behind, 0 ahead).
2. [x] Confirm both files are collision-free (no open PR modifies them).
3. [x] Replace `@State private var selectedLanguage = "fr"` with an `init()`-resolved default.
4. [x] Add pure `resolveInitialLanguage(preferred:deviceLocale:)` (constrained to `fr`/`en`,
       fallback `fr`).
5. [x] Mark `init()` `@MainActor` (reads `@MainActor` `AuthManager.shared`; sheets are main-actor).
6. [x] Verify `AuthManager`/`preferredContentLanguages` public + already imported (`MeeshySDK`).
7. [x] Write analysis + plan + tracking pointer.
8. [ ] Commit, push, open PR. Gate = CI `iOS Tests`.

## Risks

- **Swift 6 concurrency**: mitigated by `@MainActor init()` (both call sites are `.sheet`
  closures = main-actor).
- **Behavior regression**: none for `fr`/unsupported-locale users (fallback preserved); only
  `en`-resolving users see the improvement.
