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
| `ASC_DEMO_USER`      | App Store reviewer demo username.            |
| `ASC_DEMO_PASSWORD`  | App Store reviewer demo password.            |
| `ASC_REVIEW_NOTES`   | (Optional) Custom notes for App Review.      |

These credentials grant App Review access to a fully functioning account.
**Rotate them after any suspected exposure** (e.g. they previously lived in
the Fastfile and `CLAUDE.md` — both have been purged in this branch but the
secrets remain in git history and must be considered compromised).

## CI configuration

The `iOS Release` workflow (`.github/workflows/ios-release.yml`) injects all of
the above from GitHub Actions secrets of the same name. Update them via the
repository Settings → Secrets and variables → Actions panel.

## Local developer setup

The recommended approach is a `.env` file ignored by git:

```
# apps/ios/.env (gitignored)
export ASC_KEY_ID=...
export ASC_ISSUER_ID=...
export ASC_KEY_FILEPATH="$HOME/.appstoreconnect/AuthKey_XXXX.p8"
export ASC_DEMO_USER=...
export ASC_DEMO_PASSWORD=...
export MATCH_PASSWORD=...
```

Then `source apps/ios/.env` before invoking Fastlane.

Confirm `apps/ios/.env` is listed in `.gitignore` before saving secrets there.
