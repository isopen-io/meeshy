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
- [x] `packages/shared` : étendre `CallTranscriptionSegmentEvent`/`CallTranslatedSegmentEvent`
      (`id`, `speakerDisplayName`, `capturedAtMs`), nouveau `CallTranscriptEntryPayload` +
      message data channel `transcript-entry`, util `formatCallTranscriptLine` (+ tests vitest)
- [x] `services/gateway` (TDD jest/bun) : schéma zod (id/capturedAtMs optionnels),
      estampillage serveur de `speakerDisplayName` (via getCallSession, anti-usurpation,
      même principe que speakerId), passthrough id/capturedAtMs dans les 6 branches
      d'émission (factorisées)
- [x] `apps/web` : hook journal `useCallTranscriptJournal` (fusion par id, ordre capturedAt),
      panneau `CallTranscriptPanel` (`displayName (HH:MM): message` + badge langue),
      réception data channel (`ondatachannel`) dans webrtc-service, toggle UI
- [x] `packages/MeeshySDK` : payloads socket enrichis (émission + décodage)
- [x] `apps/ios` : envoi data channel (P2PWebRTCClient/WebRTCService), décodage
      `DataChannelInbound.transcriptEntry`, émission enrichie (id/capturedAtMs),
      fusion par id dans CallTranscriptionService, rendu `displayName (heure)` + badge
      langue dans CallView, persistance `language` dans CallTranscriptSegment
- [x] Docs : spec `docs/superpowers/specs/2026-08-13-call-transcript-journal-design.md`
- [x] Tests : shared (vitest), gateway (bun jest), build shared ; iOS non exécutable ici
      (Linux) — tests écrits, à valider par `./apps/ios/meeshy.sh test` sur macOS
- [x] Commit + push sur `claude/transcription-metadata-language-d6bawp`

## Itération 2 (exigences produit reçues en cours de chantier)
- [x] Réception liée au panneau : caché ⇒ désabonnement réception + émission
      (gardes isShowingOverlay iOS, option `active` du hook web)
- [x] Journal conservé panneau fermé, revisitable à la réouverture ; purge
      uniquement dans resetForCallEnd
- [x] Stream de corrections : partiels transmis en P2P (data channel seul),
      wireId d'énoncé partagé, remplacement en place, final = dernière valeur
      dite, fusion à trois régimes (miroir shared ↔ iOS)
- [x] Panneau en réception seule sur échec moteur local, fermable au tap
      suivant ; retrait de l'auto-révélation (caduque)

## Revue
- shared : 1523 tests vitest verts (53 fichiers), build tsc OK
- gateway : 534 tests verts sur les 28 suites CallEventsHandler + schémas ;
  tsc --noEmit propre
- web : 113 tests verts (13 suites video-calls + hooks) ; les nouveaux
  fichiers sont sans erreur tsc (les ~1760 erreurs --noEmit du package web
  sont un existant hors périmètre)
- iOS : tests écrits/mis à jour (service, manager, décodage data channel,
  SDK) — à exécuter sur macOS via ./apps/ios/meeshy.sh test (non exécutable
  dans cet environnement Linux)

## Itération 3 (signal de présence + règle donnée sensible)
- [x] `call:transcription-active` : signal estampillé gateway (silent-drop,
      émetteur exclu) quand un participant active/ferme sa transcription
- [x] Badge d'invitation sur l'icône sous-titres : iOS (dot statique,
      remoteTranscriptionActive, reset teardown) + web
      (useRemoteTranscriptionActive, Set par speaker, dot pulsant, aria-label)
- [x] Émission du signal : iOS au start/stop effectif du moteur ; web à
      l'ouverture/fermeture du panneau (transitions réelles uniquement)
- [x] Historique depuis l'activation uniquement : garanti par l'absence de
      replay réseau (gateway relaie sans stocker) + abonnement lié au panneau
- [x] Règle donnée sensible gravée dans la spec : replay UNIQUEMENT depuis la
      sauvegarde locale (GRDB chiffré iOS ; rien au repos côté web), aucun
      texte de transcription dans les logs (audité)
