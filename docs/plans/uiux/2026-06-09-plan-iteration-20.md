# UI/UX Plan — Iteration 20 (2026-06-09)

## Objective
Internationalize the settings components that had zero or partial i18n coverage.

## Actions

1. Add `settings.video.*` keys to all 4 locale files (en/fr/es/pt)
2. Add `settings.voiceQuality.*` keys to all 4 locale files
3. Add `settings.audio.translation.formatMp3/Ogg/Wav` keys
4. Add `settings.message.draftDays7/30/60/90` keys
5. Fix `video-settings.tsx` — import useI18n, wire all 38 strings
6. Fix `voice/VoiceQualityConfig.tsx` — import useI18n, refactor quality level helper, wire all 60+ strings, add `recommendedRangeText` prop to QualityMetric
7. Fix `audio-settings.tsx` — wire 3 format strings
8. Fix `message-settings.tsx` — wire 4 draft day strings
