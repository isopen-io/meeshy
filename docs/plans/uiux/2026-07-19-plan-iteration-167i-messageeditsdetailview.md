# Plan — Iteration-167i — MessageEditsDetailView VoiceOver a11y

**Date:** 2026-07-19 · **Scope:** iOS only · **Branch:** `claude/laughing-thompson-o5glka`

## Goal
Bring `MessageEditsDetailView` (the "Edits" tab of `MessageDetailSheet`) to
VoiceOver parity with its MessageDetail siblings (144i/153i/155i/160i/166i),
without touching logic, layout, or i18n.

## Steps
1. Resync branch onto latest `main` (was 10812 commits behind). ✅
2. Confirm no open PR already claims `MessageEditsDetailView` (highest in flight
   = 166i `MessageTranscriptionDetailView`; number 167i > all in flight). ✅
3. Annotate (annotation-only, 0 logic):
   - `.accessibilityHidden(true)` → banner icon, count badge, empty-state glyph.
   - `.accessibilityElement(children: .combine)` → banner, revision row, empty state.
4. Write analysis + plan + tracking entry.
5. Commit + push to designated branch.

## Non-goals
- No i18n of the residual hardcoded FR strings (separate lot).
- No Dynamic Type change (already semantic; empty-state glyph frozen by doctrine).
- No new tests (annotation-only, parity with the series).

## Gate
CI `iOS Tests` (no local macOS toolchain).
