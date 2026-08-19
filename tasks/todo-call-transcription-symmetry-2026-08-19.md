# Transcriptions d'appel — diffusion à tous les participants (2026-08-19)

## Signalement

> « Quand j'appelle, mon interlocuteur reçoit bien mes transcriptions mais je ne
> reçois pas les siennes. »

## Diagnostic — DEUX défauts distincts, pas un

### D1 — Le symptôme rapporté : la capture ne servait que son propre panneau

Un device ne transcrit que **son propre micro** (`startLocalCapture`, jamais
l'audio distant reçu). La capture était liée au seul panneau LOCAL. Donc :
activer les sous-titres faisait de l'utilisateur un pur **ÉMETTEUR** — son
correspondant recevait ses transcriptions, lui ne recevait rien tant que le
correspondant n'activait pas de son côté.

Conforme à la spec 2026-07-10 (« toggle manuel, jamais automatique »), donc
invisible pour les tests : personne ne mentait, la règle était juste fausse
côté produit. `call:transcription-active` n'allumait qu'un indicateur
d'invitation — l'utilisateur devait deviner qu'il fallait attendre un geste
de l'autre.

### D2 — Famine des auditeurs de même langue (appels de groupe)

`CallEventsHandler.translateAndEmitSegment` retirait de `listenersByLanguage`
tout auditeur dont la langue est **celle du locuteur** (rien à traduire), et la
diffusion à la salle ne se déclenchait que si `targetLanguages.length === 0`.
Dès qu'UN auditeur demandait une traduction, tous les auditeurs de même langue
que le locuteur **ne recevaient plus rien**.

Appel fr + fr + en : le francophone était muet côté sous-titres. Test RED
écrit d'abord, échec reproduit, puis corrigé.

## Correctifs

| # | Fichier | Changement |
|---|---|---|
| D2 | `services/gateway/src/socketio/CallEventsHandler.ts` | les auditeurs de même langue sont servis en ORIGINAL, immédiatement, sans aller-retour ZMQ ; `p.participant?.userId` rendu sûr (l'accès nu jetait et tuait le relais pour TOUS) |
| D1 | `apps/ios/.../Models/CaptionsMode.swift` | `TranscriptionCapturePolicy` — loi pure `nonisolated` : ce device capture dès que QUELQU'UN écoute |
| D1 | `apps/ios/.../Services/CallManager.swift` | `toggleTranscription()` consulte la loi ; suivi des auditeurs **par identité** (`Set`, pas un booléen) ; `publishListeningIntentIfChanged()` ; renvoi à `participant-joined` ; **élagage à `participant-left`** — miroir du web (Vague 134), un pair qui disparaît panneau ouvert laissait sinon le micro tapé pour un auditeur inexistant |
| D1 | `apps/ios/.../Services/CallTranscriptionService.swift` | le signal de présence quitte la capture ; les partiels partent même panneau local fermé |
| D1 | `apps/ios/.../Views/CallView.swift` | `CaptionsMode` dérivé du PANNEAU (`isShowingOverlay`), plus de `isTranscribing` |
| R1 | `packages/MeeshySDK/.../DevicePermissions.swift` + `EdgeTranscriptionService.swift` | la demande TCC vocale rejoint la source unique `nonisolated` — même forme qu'un crash device confirmé |

## Le piège évité (et pourquoi il méritait son propre correctif)

Émettre `call:transcription-active` depuis la **capture** aurait créé un
**verrou mutuel** : A ouvre → A capture → A s'annonce actif → B capture → B
s'annonce actif → plus aucun des deux ne peut s'arrêter, micro tapé jusqu'à la
fin de l'appel. Le signal dit « j'ÉCOUTE » (panneau), jamais « je capture ».
Gardé par `CallTranscriptionSymmetrySourceGuardTests`.

## Vérification

- [x] Test RED écrit avant correctif (D2) — échec reproduit, auditeur fr sans aucune émission
- [x] Gateway : 34 suites / 339 tests verts (`CallEventsHandler*`)
- [x] iOS : compilation app propre (0 erreur)
- [x] iOS : bundle de tests compilé
- [x] Suites iOS ciblées vertes

## Reste ouvert (signalé, non traité)

- **Le client web est RÉCEPTEUR SEUL** : `useCallCaptions` consomme
  `call:translated-segment` mais aucune capture locale n'existe côté web. Un
  participant web reste donc muet en émission, quelle que soit l'écoute des
  autres. Implémenter la capture web (Web Speech API) est une feature à part
  entière — hors de ce lot. Le correctif D2 le sert en revanche correctement
  en réception.
- R2/R3/R4/R5/R6/R7 de `docs/crash-audit-ios-2026-08-19.md` — inchangés.
