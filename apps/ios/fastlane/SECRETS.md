# Fastlane secrets

This document lists every environment variable the iOS Fastfile requires.
None of these values are committed to the repository. The `release` lane
intentionally fails fast (via `require_env`) when any required value is missing.

## Required for every signing operation

| Variable           | Where it comes from                   | Notes                                          |
|--------------------|---------------------------------------|------------------------------------------------|
| `ASC_KEY_ID`       | App Store Connect → Users & Access → Keys | Public-ish, but treat as ENV anyway.       |
| `ASC_ISSUER_ID`    | App Store Connect → Users & Access → Keys | Public-ish, but treat as ENV anyway.       |
| `ASC_KEY_CONTENT`  | Base64 of the `.p8` private key       | CI uses this.                                  |
| `ASC_KEY_FILEPATH` | Local path to the `.p8` private key   | Local dev uses this. Never commit the `.p8`. |
| `MATCH_GIT_URL`    | Match certificates Git repo URL       | SSH preferred.                                 |
| `MATCH_PASSWORD`   | Match encryption password             | Used to decrypt certificate repo.              |

Provide either `ASC_KEY_CONTENT` (CI) or `ASC_KEY_FILEPATH` (local) — not both.

## Required for `release` lane (App Store submission)

| Variable             | Purpose                                      |
|----------------------|----------------------------------------------|
| `DEMO_USER`          | App Store reviewer demo username.            |
| `DEMO_PASSWORD`      | App Store reviewer demo password.            |
| `DEMO_REVIEW_NOTES`  | (Optional) Custom notes for App Review.      |

These credentials grant App Review access to a fully functioning account.
**Rotate them after any suspected exposure** (e.g. they previously lived in
the Fastfile and `CLAUDE.md` — both have been purged but the leaked values
remain in git history and must be considered compromised).

Locally, populate them in `apps/ios/fastlane/.env` (gitignored). The dotenv
gem bundled with fastlane auto-loads that file when fastlane runs from this
directory.

## CI configuration

The `iOS Release` workflow (`.github/workflows/ios-release.yml`) injects all of
the above from GitHub Actions secrets of the same name. Update them via the
repository Settings → Secrets and variables → Actions panel.

## Local developer setup

The recommended approach is a `.env` file ignored by git:

```
# apps/ios/fastlane/.env (gitignored — auto-loaded by fastlane's dotenv gem)
ASC_KEY_ID=...
ASC_ISSUER_ID=...
ASC_KEY_FILEPATH=/Users/<you>/.appstoreconnect/AuthKey_XXXX.p8
DEMO_USER=...
DEMO_PASSWORD=...
MATCH_PASSWORD=...
```

The dotenv format does NOT use `export`. Confirm `apps/ios/fastlane/.env`
is covered by `.gitignore` before saving secrets there (the root `.env*`
glob already covers it).
