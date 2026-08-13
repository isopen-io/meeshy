---
"@meeshy/shared": patch
---

Journal de transcription d'appel — `displayName (heure): message` + tag de langue + double transport.

**Shared.** `CallTranscriptionSegmentEvent` transporte `id` (clé de fusion inter-transports) et `capturedAtMs` (horloge murale de capture) ; `CallTranslatedSegmentEvent` les relaie et ajoute `speakerDisplayName` estampillé côté gateway (anti-usurpation, même principe que `speakerId`). Nouveaux `CallTranscriptEntryPayload`/`CallTranscriptDataChannelMessage` (enveloppe `transcript-entry` du data channel WebRTC) et util `call-transcript.ts` (`formatCallTranscriptLine`, `callTranscriptEntryKey`, `upsertCallTranscriptEntry` — fusion pure ordonnée par capture).

**Gateway.** `resolveActiveCallSpeaker` résout participantId + displayName en une seule passe (le `getCallSession` d'autorisation porte déjà l'utilisateur) ; les six branches d'émission de `call:translated-segment` passent par un builder unique qui relaie id/capturedAtMs/nom ; `capturedAtMs` normalisé une fois par segment (fallback réception pour les anciens clients) ; le schéma zod strippe tout `speakerDisplayName` client.

**iOS.** Chaque segment final minte un `wireId` et part sur les DEUX transports : data channel WebRTC `"transcription"` quand il est ouvert (`transcript-entry`, P2P direct) et socket systématiquement (traduction + fallback). Réception : fusion par `wireId` (`upsertRemoteSegment`) — la traduction serveur enrichit la ligne arrivée en P2P, jamais de doublon. Panneau : lignes `displayName (heure)` (horloge murale de capture) + badge de la langue affichée ; `language` d'un segment redevient la langue de TRANSCRIPTION (sourceLanguage), la langue cible vivant dans `translatedLanguage`. Transcript persisté : nom wire en fallback + tag de langue.

**Web.** Nouveau panneau journalisé `CallTranscriptPanel` (toggle dans les contrôles) alimenté par `useCallTranscriptJournal` — fusion des deux transports via le réducteur partagé ; `webrtc-service` écoute enfin `ondatachannel` et publie les entrées `transcript-entry` du pair iOS.

**Cycle de vie du panneau (itération 2).** La réception des transcriptions du pair est liée à la visibilité du panneau : caché ⇒ désabonnement des canaux de réception et d'émission (gardes `isShowingOverlay` iOS, option `active` du hook web) ; le journal accumulé est conservé et se réaffiche à la réouverture — la purge n'a plus qu'un seul site, `resetForCallEnd`. Échec du moteur local ⇒ panneau en réception seule, fermable au tap suivant.

**Stream de corrections (itération 2).** Les révisions partielles du moteur de l'auteur sont transmises en P2P (data channel uniquement — jamais le socket : rate limit + traduction réservée aux finals) avec un `wireId` d'énoncé partagé : chaque correction remplace la ligne en place, le final la clôt avec la dernière valeur dite, la traduction serveur l'enrichit. Fusion à trois régimes (partiel remplacé / partiel périmé ignoré / final enrichi), miroir exact shared ↔ iOS ; un énoncé finalisé par fusion entre dans l'accumulateur de persistance.

**Signal de présence (itération 3).** Nouvel événement `call:transcription-active` (estampillé gateway, émetteur exclu, silent-drop) : quand un participant active sa transcription, les autres voient un badge d'invitation sur leur icône sous-titres — iOS (`CallManager.remoteTranscriptionActive`, dot statique sur le bouton captions) et web (`useRemoteTranscriptionActive`, Set par speakerId correct en groupe, dot pulsant). L'activation ne donne l'historique que depuis ce moment — aucun replay n'existe, l'abonnement lié au panneau le garantit.

**Persistance serveur + replay (itération 4).** Les segments finaux sont persistés par le gateway (modèle Prisma `Transcription`, enfin câblé : `segmentId` wire, texte, langue, horloge de capture ; traductions ZMQ accrochées via `TranslationCall`) — le journal survit à la suppression de l'app et de ses caches locaux. Nouveau `GET /api/v1/calls/:callId/transcript`, accès restreint aux participants effectifs de l'appel (plus strict que les autres routes calls). iOS : `CallTranscriptRemoteService` (SDK) + fallback app-side dans la vue post-appel (cache local chiffré d'abord, distant sinon, ré-ensemencement, traduction résolue au Prisme). Les partiels ne sont jamais persistés ; aucun texte de transcription dans les logs.

Prépare le palier « traduction live + resynthèse TTS » : id stable, langue source fiable, horloge de capture et canal P2P actif.
