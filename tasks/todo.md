# Journal de transcription d'appel — displayName (heure) + tag langue + transport WebRTC/serveur

## Objectif
Chaque segment de transcription à la volée doit transiter avec les métadonnées de
journalisation (`id` stable, `speakerDisplayName`, `capturedAtMs` horloge murale,
`language` de transcription) et s'afficher des deux côtés sous forme journalisée
`displayName (heure): message` avec badge de langue. Transport : data channel WebRTC
`"transcription"` quand il est ouvert (P2P instantané), relais serveur systématique en
fallback et pour la traduction (pipeline ZMQ existant). Fusion par `id` côté récepteur.
Prépare l'étape suivante : traduction live + resynthèse TTS (les champs `language`,
`text`/`translatedText` séparés alimentent ce futur pipeline sans retravail du modèle).

## Plan
- [x] Explorer l'existant (iOS, web, gateway, shared) — 2 agents
- [ ] `packages/shared` : étendre `CallTranscriptionSegmentEvent`/`CallTranslatedSegmentEvent`
      (`id`, `speakerDisplayName`, `capturedAtMs`), nouveau `CallTranscriptEntryPayload` +
      message data channel `transcript-entry`, util `formatCallTranscriptLine` (+ tests vitest)
- [ ] `services/gateway` (TDD jest/bun) : schéma zod (id/capturedAtMs optionnels),
      estampillage serveur de `speakerDisplayName` (via getCallSession, anti-usurpation,
      même principe que speakerId), passthrough id/capturedAtMs dans les 6 branches
      d'émission (factorisées)
- [ ] `apps/web` : hook journal `useCallTranscriptJournal` (fusion par id, ordre capturedAt),
      panneau `CallTranscriptPanel` (`displayName (HH:MM): message` + badge langue),
      réception data channel (`ondatachannel`) dans webrtc-service, toggle UI
- [ ] `packages/MeeshySDK` : payloads socket enrichis (émission + décodage)
- [ ] `apps/ios` : envoi data channel (P2PWebRTCClient/WebRTCService), décodage
      `DataChannelInbound.transcriptEntry`, émission enrichie (id/capturedAtMs),
      fusion par id dans CallTranscriptionService, rendu `displayName (heure)` + badge
      langue dans CallView, persistance `language` dans CallTranscriptSegment
- [ ] Docs : spec `docs/superpowers/specs/2026-08-13-call-transcript-journal-design.md`
- [ ] Tests : shared (vitest), gateway (bun jest), build shared ; iOS non exécutable ici
      (Linux) — tests écrits, à valider par `./apps/ios/meeshy.sh test` sur macOS
- [ ] Commit + push sur `claude/transcription-metadata-language-d6bawp`

## Revue
(à compléter en fin de chantier)
