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

## Team ID (optional override, not a secret)

| Variable               | Default      | Notes                                              |
|------------------------|--------------|----------------------------------------------------|
| `FASTLANE_TEAM_ID`     | `D72UK7R5RE` | Apple Developer Portal team. Override only to build under a different team. |
| `FASTLANE_ITC_TEAM_ID` | `FASTLANE_TEAM_ID`, then `D72UK7R5RE` | App Store Connect team. |

**Changed 2026-07-28**: `D72UK7R5RE` is the single Team ID of the publishing
pipeline; the previous team is retired. The Appfile/Matchfile treat an *empty*
value as absent, so an unset `APPLE_TEAM_ID` GitHub secret falls back to the
default rather than signing with a blank team. The header block in
`apps/ios/fastlane/Appfile` lists every file carrying the hardcoded value.

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

## ANDP credentials (`meeshy.sh build-number` / `device`)

`./meeshy.sh device` aligns `CURRENT_PROJECT_VERSION` on the latest App Store
Connect build before compiling, so an app installed on a real device carries the
same build number as TestFlight (see `sync_build_number` in `meeshy.sh`). It
does so through `andp`, which reads its own credentials file — **not** fastlane's
`.env`. Without it the command degrades gracefully (it keeps the committed
number and says so), but it can no longer self-heal.

ANDP resolves, first match wins:

1. `$ANDP_CONFIG_DIR/secrets.yml`
2. `<project>/.andp/secrets.yml` — covered by `.gitignore` (`.andp/`)
3. `~/.andp/secrets.yml` — **recommended**: outside every repo, one file for all
   projects, so it can never be committed by accident

```yaml
# ~/.andp/secrets.yml   (chmod 600, directory chmod 700)
accounts:
  primary:
    asc_api:
      key_id: <App Store Connect key id>       # same key as ASC_KEY_ID
      issuer_id: <issuer uuid>                 # same as ASC_ISSUER_ID
      key_content: |                           # contents of the AuthKey_*.p8
        -----BEGIN PRIVATE KEY-----
        ...
        -----END PRIVATE KEY-----
```

Check the wiring with `andp build-number me.meeshy.app --strategy max-build --json`:
`source.latest_asc` is the latest build on ASC, `build_number` the next one.
