# UI/UX Plan — Iteration 22 (2026-06-09)

## Objective
Internationalize remaining hardcoded placeholder strings in user-settings and wire last 13 strings in AudioEffectsPanel.

## Actions
1. Add `profile.phone.newPhonePlaceholder` + `profile.verification.codePlaceholder` to all 4 settings locale files
2. Add `closePanel` + `voiceCoder.key.notes.*` (12 note keys) to all 4 audioEffects locale files
3. Fix `user-settings.tsx` — wire 5 placeholder strings using existing and new keys
4. Fix `AudioEffectsPanel.tsx` — wire aria-label + 12 musical note SelectItems
