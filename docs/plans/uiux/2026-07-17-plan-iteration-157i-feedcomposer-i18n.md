# Plan — Iteration 157i — `FeedView+Attachments` localization

**Date:** 2026-07-17 · **Branch:** `claude/laughing-thompson-5h7uia` · **Base:** `main` HEAD `cc3132d`

## Goal
Make the feed post-composer's user-facing strings localization-ready and unify attachment
labels onto the app-wide SSOT — without touching Dynamic Type (saturated by swarm 140i→156i).

## Steps
1. [x] Sync branch to latest `main` (`cc3132d`); confirm prior branch commit merged as #2005.
2. [x] Confirm swarm contention: 17 open iOS a11y PRs (140i→156i) → number this **157i**.
3. [x] Audit `FeedView+Attachments.swift` — residual `.system(size:)` all frozen (skip);
       identify hardcoded French toasts (×10 sites) + duplicated label helpers.
4. [x] Confirm SSOT: `attachment.label.*` keys used by `ConversationView+Composer` / `FeedCommentsSheet`.
5. [x] Replace 10 toast literals → `feed.post.toast.*` (5 new keys, accents fixed).
6. [x] Replace 2 label helpers → shared `attachment.label.*` keys (0 new keys, SSOT reuse).
7. [x] Verify: 0 remaining hardcoded literals; diff = +23/−20, 1 file, 0 logic/0 test change.
8. [ ] Commit + push; open PR; CI `iOS Tests` is the gate.

## Non-goals
- No Dynamic Type / VoiceOver sweep (already done + swarm-saturated).
- No `Localizable.xcstrings` edit (keys are code-only via `defaultValue`, `sourceLanguage: fr`).
- No rekeying of already-translatable toolbar accessibility labels.

## Risk
Minimal — pure string swap using a pattern already pervasive in the file; reused keys/defaults
copied verbatim from the sibling composer. Gate: CI `iOS Tests`.
