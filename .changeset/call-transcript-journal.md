---
"@meeshy/shared": patch
---

Journal de transcription d'appel — `displayName (heure): message` + tag de langue + double transport.

**Shared.** `CallTranscriptionSegmentEvent` transporte `id` (clé de fusion inter-transports) et `capturedAtMs` (horloge murale de capture) ; `CallTranslatedSegmentEvent` les relaie et ajoute `speakerDisplayName` estampillé côté gateway (anti-usurpation, même principe que `speakerId`). Nouveaux `CallTranscriptEntryPayload`/`CallTranscriptDataChannelMessage` (enveloppe `transcript-entry` du data channel WebRTC) et util `call-transcript.ts` (`formatCallTranscriptLine`, `callTranscriptEntryKey`, `upsertCallTranscriptEntry` — fusion pure ordonnée par capture).

**Gateway.** `resolveActiveCallSpeaker` résout participantId + displayName en une seule passe (le `getCallSession` d'autorisation porte déjà l'utilisateur) ; les six branches d'émission de `call:translated-segment` passent par un builder unique qui relaie id/capturedAtMs/nom ; `capturedAtMs` normalisé une fois par segment (fallback réception pour les anciens clients) ; le schéma zod strippe tout `speakerDisplayName` client.

**iOS.** Chaque segment final minte un `wireId` et part sur les DEUX transports : data channel WebRTC `"transcription"` quand il est ouvert (`transcript-entry`, P2P direct) et socket systématiquement (traduction + fallback). Réception : fusion par `wireId` (`upsertRemoteSegment`) — la traduction serveur enrichit la ligne arrivée en P2P, jamais de doublon. Panneau : lignes `displayName (heure)` (horloge murale de capture) + badge de la langue affichée ; `language` d'un segment redevient la langue de TRANSCRIPTION (sourceLanguage), la langue cible vivant dans `translatedLanguage`. Transcript persisté : nom wire en fallback + tag de langue.

**Web.** Nouveau panneau journalisé `CallTranscriptPanel` (toggle dans les contrôles) alimenté par `useCallTranscriptJournal` — fusion des deux transports via le réducteur partagé ; `webrtc-service` écoute enfin `ondatachannel` et publie les entrées `transcript-entry` du pair iOS.

Prépare le palier « traduction live + resynthèse TTS » : id stable, langue source fiable, horloge de capture et canal P2P actif.
