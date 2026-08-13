# Journal de transcription d'appel — displayName (heure) + tag de langue + double transport — Design

**Date**: 2026-08-13
**Statut**: Implémenté (branche `claude/transcription-metadata-language-d6bawp`)

## Contexte

L'arc « live call captions » (specs 2026-07-10 / 2026-07-11) a livré la
transcription à la volée on-device (iOS, `SFSpeechRecognizer` local-mic-only)
relayée par le gateway (`call:transcription-segment` → traduction ZMQ par
auditeur → `call:translated-segment`), consommée par iOS (panneau) et web
(overlay 4 lignes). Mais le wire ne transportait AUCUNE métadonnée de
journalisation :

- pas d'identifiant stable de segment — impossible de dédupliquer/fusionner
  deux arrivées du même segment ;
- pas de nom d'affichage — chaque récepteur devinait le locuteur depuis son
  roster local (fragile au-delà du 1:1, et le web affichait des lignes
  anonymes quand le roster n'avait pas la réponse) ;
- pas d'horodatage mural — le récepteur estampillait `Date()` à réception,
  donc l'heure affichée dépendait de la latence réseau, pas de la capture ;
- le tag de langue existait à l'émission (`language`) mais iOS le remplaçait
  à la réception par la langue CIBLE (`targetLanguage`), perdant la langue de
  transcription.

Le data channel WebRTC `"transcription"` (créé côté offreur avant l'offre,
label historique) ne transportait que `ping`/`bye`.

## Objectif

1. **Journalisation** : chaque panneau de transcription (iOS + web) affiche
   des lignes `displayName (heure): message`, ordonnées par l'horloge murale
   de CAPTURE, des deux côtés de l'appel.
2. **Tag de langue automatique** : chaque entrée porte la langue dans
   laquelle elle a été transcrite (badge discret, Prisme) — prérequis de
   l'étape suivante (traduction live de la transcription puis resynthèse
   vocale TTS : le pipeline aura besoin de `language` + `text` original,
   jamais du texte déjà traduit).
3. **Transport** : canal WebRTC quand il est possible, serveur sinon — sans
   régresser la traduction (qui est serveur par construction, pipeline ZMQ).

## Architecture — double transport, fusion par id

```
Locuteur (device A)
  SFSpeechRecognizer (on-device, langue = Prisme du locuteur)
  → segment final : mint wireId (UUID) + capturedAtMs (horloge murale)
  ├─► Data channel WebRTC "transcription" (si ouvert)     — P2P direct
  │     {type:"transcript-entry", entry:{id, callId, speakerId,
  │      speakerDisplayName, text, language, capturedAtMs, isFinal, confidence}}
  └─► Socket "call:transcription-segment" (TOUJOURS)      — serveur
        {id, text, speakerId, startMs, endMs, isFinal, confidence,
         language, capturedAtMs}
              Gateway : authentifie, ESTAMPILLE speakerId + speakerDisplayName
              (anti-usurpation), normalise capturedAtMs (fallback réception),
              traduit par langue d'auditeur (ZMQ, inchangé)
        ◄─ "call:translated-segment" {id, text, translatedText?, speakerId,
            speakerDisplayName?, sourceLanguage, targetLanguage, capturedAtMs, …}

Auditeur (device B)
  Fusion par id (wireId ; clé synthétique speakerId#startMs#endMs pour les
  anciens clients) : la première arrivée CRÉE la ligne de journal, la seconde
  l'ENRICHIT (traduction, nom manquant, capturedAt le plus ancien).
  → rendu `displayName (heure): message` + badge langue
```

### Pourquoi les deux transports simultanément (et pas un fallback exclusif)

- La **traduction est serveur** (NLLB via ZMQ) : couper le chemin socket quand
  le data channel est ouvert reviendrait à perdre les sous-titres traduits —
  régression du Prisme. Le socket part donc toujours.
- Le **data channel** apporte ce que le serveur ne peut pas : latence P2P
  minimale (l'original s'affiche instantanément, la traduction arrive en
  enrichissement) et fonctionnement même si le gateway est lent/indisponible.
- Le coût du doublon est nul : fusion par `id`, jamais deux lignes.
- Quand le channel n'existe pas (pair web offreur — le web ne crée pas de
  channel ; channel pas encore ouvert ; échec SCTP), le chemin serveur est
  self-suffisant : c'est le fallback demandé.

### Anti-usurpation (prolonge le fix speakerId 2026-08-13)

- **Chemin socket** : `speakerDisplayName` est résolu CÔTÉ GATEWAY depuis le
  participant authentifié (`resolveActiveCallSpeaker`, displayName ??
  username, via le `getCallSession` déjà chargé — zéro requête ajoutée). Un
  `speakerDisplayName` fourni par le client est STRIPPÉ par le schéma zod.
- **Chemin data channel** : pas de serveur pour estampiller — le champ est
  déclaratif. Les récepteurs préfèrent donc TOUJOURS le nom résolu depuis
  leur roster local par `speakerId`, le champ wire n'étant qu'un fallback
  d'affichage (règle appliquée iOS `transcriptSegmentRow` et web
  `CallTranscriptPanel`).

### Compatibilité ascendante

Tous les nouveaux champs wire sont OPTIONNELS. Ancien client → gateway neuf :
`capturedAtMs` estampillé à réception, pas d'id (pas de fusion, comportement
d'aujourd'hui), pas de nom (roster local). Nouveau client → ancien gateway :
champs inconnus ignorés par zod (strip), l'événement relayé reste l'ancien
format et le client retombe sur `Date()`/roster.

## Composants modifiés

| Couche | Fichier | Changement |
|---|---|---|
| shared | `types/video-call.ts` | `CallTranscriptionSegmentEvent` + `id?`/`capturedAtMs?` ; `CallTranslatedSegmentEvent` + `id?`/`speakerDisplayName?`/`capturedAtMs?` ; nouveaux `CallTranscriptEntryPayload`/`CallTranscriptDataChannelMessage` |
| shared | `utils/call-transcript.ts` (nouveau) | `formatCallTranscriptLine` (`displayName (HH:MM): message`), `callTranscriptEntryKey` (id ?? clé synthétique), `upsertCallTranscriptEntry` (fusion pure, ordre capturedAtMs) |
| gateway | `validation/call-schemas.ts` | `id` (≤64) + `capturedAtMs` optionnels ; `speakerDisplayName` client strippé |
| gateway | `socketio/CallEventsHandler.ts` | `resolveActiveCallSpeaker` (participantId + displayName en une résolution), `buildTranslatedSegment` (builder unique des 6 branches d'émission), normalisation `capturedAtMs` une seule fois par segment |
| SDK iOS | `MessageSocketManager.swift` | `CallTranscriptionSegmentPayload` + id/capturedAtMs ; `CallTranslatedSegmentData.Segment` + id/speakerDisplayName/capturedAtMs |
| SDK iOS | `Models/CallTranscript.swift` | `CallTranscriptSegment.language` (tag de langue persisté, optionnel décodage rétro-compatible) |
| app iOS | `WebRTC/WebRTCTypes.swift` | `DataChannelTranscriptEntry`/`DataChannelTranscriptMessage` ; `DataChannelInbound.transcriptEntry` |
| app iOS | `WebRTCService.swift` | `sendTranscriptEntry` (no-op silencieux channel fermé) |
| app iOS | `CallTranscriptionService.swift` | `TranscriptionSegment.wireId`/`speakerDisplayName` ; mint wireId au final ; émission double transport ; `receivePeerEntry` + `upsertRemoteSegment` (fusion) ; persistance nom wire + langue |
| app iOS | `CallManager.swift` | mapping wire→segment (capturedAtMs, sourceLanguage comme tag), routage `.transcriptEntry`, injection `sendPeerEntry`, `localDisplayName` |
| app iOS | `CallView.swift` | ligne `displayName (heure)` (horloge murale, plus l'écoulé) + badge langue |
| web | `services/call-transcript-channel.ts` (nouveau) | pub/sub data channel → hook |
| web | `services/webrtc-service.ts` | `ondatachannel` : décode `transcript-entry`, publie |
| web | `hooks/use-call-transcript-journal.ts` (nouveau) | fusion deux transports via réducteur partagé, rétention 200 |
| web | `components/video-calls/CallTranscriptPanel.tsx` (nouveau) | panneau journalisé + badge langue, roster-first |
| web | `CallControls.tsx` / `VideoCallInterface.tsx` | toggle transcript (icône Captions) + intégration |

## Décisions

1. **Le socket part toujours, le data channel est opportuniste** — le
   fallback serveur demandé est structurel, pas un mode dégradé à détecter.
2. **`language` d'un segment = langue de TRANSCRIPTION** (sourceLanguage),
   sur toutes les plateformes ; la langue de traduction vit exclusivement
   dans `translatedLanguage`/`targetLanguage`. (iOS affichait la langue cible
   dans `language` — corrigé, test mis à jour.)
3. **`capturedAtMs` est la clé d'ordre du journal** — estampillée à la
   capture par le locuteur, normalisée une seule fois par le gateway
   (fallback réception pour les anciens clients), jamais ré-estampillée en
   aval (le timeout de traduction 10 s n'altère pas l'heure).
4. **Nom d'affichage : serveur > roster local > wire > placeholder** sur le
   chemin socket ; roster local > wire > placeholder sur le chemin P2P.
5. **Web reste consommateur** (pas de STT web dans ce chantier) et ne crée
   pas de data channel — follow-up potentiel : producteur Web Speech API et
   channel côté offreur web.
6. **Pas de persistance serveur** — le modèle Prisma `Transcription` reste
   inutilisé, le transcript demeure local-only (GRDB chiffré iOS), décision
   privacy du spec 2026-07-11 inchangée.

## Préparation du palier suivant (traduction live + TTS)

Le pipeline visé (« l'interlocuteur parle dans ma langue avec sa voix ») a
besoin de : texte original (`text`), langue source fiable (`language`),
identité stable du segment (`id`, pour synchroniser sous-titre et audio
synthétisé), horodatage de capture (`capturedAtMs`, pour l'alignement), et
d'un canal temps réel P2P (le data channel maintenant actif). Tout est en
place ; le chantier TTS (Chatterbox streaming, mixage AVAudioEngine/WebRTC)
reste à designer séparément (vision Palier 3 du spec 2026-07-11).

## Tests

- shared : `__tests__/call-transcript.test.ts` (vitest) — format, clé, fusion.
- gateway : `call-schemas.test.ts` (id/capturedAtMs/strip displayName),
  `CallEventsHandler-transcription.test.ts` (estampillage nom, passthrough
  id/capturedAtMs, fallback réception),
  `CallEventsHandler-transcription-translation.test.ts` (métadonnées sur le
  chemin traduit).
- web : `use-call-transcript-journal.test.tsx` (fusion, ordre, gâchage callId).
- iOS : `CallTranscriptionServiceTests` (fusion wireId),
  `CallManagerTests` (mappings wire/data channel),
  `CallSignalIndicatorTests` (décodage data channel + round-trip),
  `MessageSocketEventTests` (décodage SDK) — à exécuter sur macOS
  (`./apps/ios/meeshy.sh test`), non exécutables dans cet environnement Linux.
