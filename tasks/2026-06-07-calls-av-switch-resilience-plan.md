# Plan — Appels A/V unifiés + résilience (web + iOS) — 2026-06-07

> Branche: `claude/eloquent-albattani-yOmwE`. Modèle switch A/V: **FaceTime asymétrique**.
> Appels web: **ouverts à tous les utilisateurs authentifiés**.
> Vérif: web/gateway/shared = type-check + jest + build ICI. iOS = CI `ios-tests.yml` via workflow_dispatch + tests à builder sur Mac.
> Optimisation + compatibilité iOS↔web en tête à chaque étape. Itérer jusqu'à vert.

## Objectifs (demande utilisateur)
1. **Chemin d'appel unique configurable** : audio↔vidéo bascule pendant l'appel ET pendant la sonnerie, des 2 côtés (web + iOS).
2. **Stabilité** : plus d'instabilité après quelques minutes (ICE restart réel, reconnexion, anti-churn).
3. **Compression A/V préservant la qualité** : Opus FEC/DTX, H264 HW, adaptive bitrate, degradationPreference.
4. **Gestion buffers** : jamais saturer (jitterBufferTarget, backpressure, NetEq).
5. **Connexion instable** : playbook SOTA (grace timer → ICE restart → dégradation média → fallback audio-only).

## Design unifié : transceivers pré-alloués
- Web ET iOS : à chaque appel, pré-allouer **audio (sendrecv) + vidéo**. Vidéo = `recvonly` si caméra off au départ, `sendrecv` si appel vidéo.
- `type: 'audio'|'video'` ne décide QUE de l'état caméra initial. Le switch = `replaceTrack` + flip `direction` + renégociation (perfect-negotiation). Jamais d'`addTransceiver` mid-call.
- Asymétrique FaceTime : chacun contrôle sa caméra ; `call:toggle-video {enabled}` = hint UI ; la tuile distante s'affiche sur l'event de track entrant, pas sur le signaling.

---
## Phase 0 — Shared (`packages/shared`) [vérif: build + type-check ICI]
- [ ] `WebRTCSignal`/`CallSignalEvent` : confirmer `negotiationId?` présent + non strippé (déjà L250-261). Ajouter si besoin un `mediaState` seq par participant (audio/video/cameraPosition) idempotent.
- [ ] Vérifier `CallMediaToggleEvent` suffisant pour le hint asymétrique (oui).
- [ ] Pas de nouveau gros event : le switch passe par le relais `call:signal` existant (offer/answer) + `call:toggle-video`.

## Phase 1 — Gateway (`services/gateway`) [vérif: build + jest ICI]
- [ ] Confirmer pass-through `negotiationId` (schéma `call-schemas.ts` ne le strippe pas).
- [ ] `updateParticipantMedia` : sur toggle-video, garder `CallParticipant.isVideoEnabled` à jour (déjà). Optionnel: refléter `metadata.type` si les 2 caméras off → audio (cosmétique).
- [ ] Buffer last-offer + replay au (re)join : déjà présent (§4.6). Vérifier couverture renégociation.
- [ ] Tests jest sur le relais signal + toggle.

## Phase 2 — Web (`apps/web`) [vérif: type-check + jest + build ICI] — LE GROS morceau
- [ ] **Role-gate** : `components/conversations/header/use-permissions.ts` → `canUseVideoCalls` = tout user authentifié.
- [ ] **webrtc-service.ts** :
  - Pré-allouer transceivers audio+video (`addTransceiver`), video direction selon type initial.
  - Perfect-negotiation : `makingOffer`/`ignoreOffer`/`isSettingRemoteAnswerPending`, polite/impolite déterministe (userId lexicographique), rollback, garde `signalingState`.
  - `onnegotiationneeded` → vrai chemin d'offre (au lieu de log).
  - **ICE restart réel** : `restartIce()`/`createOffer({iceRestart})` ET **émettre** l'offer via le callback signaling (corrige le no-op actuel).
  - **Adaptive bitrate** : `sender.getParameters/setParameters` (maxBitrate/maxFramerate/scaleResolutionDownBy), `degradationPreference='maintain-framerate'`, piloté par un control loop consommant `use-call-quality`.
  - **Buffers** : `receiver.jitterBufferTarget` (audio ~0, video selon jitter).
  - **contentHint** = 'motion' sur la track vidéo.
  - Switch A/V : `enableVideoSend(on)` → lazy getUserMedia video, `replaceTrack`, flip `direction`, renégocier ; off → `replaceTrack(null)` + stop track.
- [ ] **use-webrtc-p2p.ts** : handler offer entrant avec garde glare/perfect-negotiation ; router ICE-restart offers ; consommer `negotiationId`.
- [ ] **call-store.ts / VideoCallInterface.tsx** : `toggleVideo` déclenche le vrai switch (pas juste `track.enabled`) ; UI bouton "passer en vidéo" visible en appel audio ; affichage tuile sur track entrant.
- [ ] **Reconnexion** : machine d'état grace timer (disconnected 3s → reconnecting UI → ICE restart → audio-only fallback), émettre `call:reconnecting/reconnected`.
- [ ] **Lancement** : s'assurer que la vue d'appel s'affiche (optimistic) sans dépendre uniquement de l'echo serveur.
- [ ] Tests jest : perfect-negotiation (glare), ICE restart envoie l'offer, adaptive bitrate mapping, switch A/V.

## Phase 3 — iOS (`apps/ios` + `packages/MeeshySDK`) [vérif: CI ios-tests + Mac]
Suivre `tasks/2026-06-06-call-system-rebuild-prompt.md` (déjà détaillé) + ajouter switch A/V des 2 côtés :
- [ ] §5.1 Transceiver vidéo TOUJOURS pré-alloué (recvonly pour audio-only).
- [ ] §5.2 Answerer applique l'offer AVANT d'attacher les tracks (corrige média sens-unique).
- [ ] §5.3 Retirer contraintes legacy `OfferToReceiveAudio/Video`.
- [ ] §3.4 Perfect-negotiation complet (makingOffer/ignoreOffer/rollback) — partiellement présent.
- [ ] §5.4 Switch audio↔vidéo bidirectionnel (replaceTrack + direction + renégocier), bouton dans `IncomingCallView` (sonnerie) + `CallView` audio.
- [ ] §5.6 Adaptive bitrate vidéo (présent) + **adapter le bitrate audio** (aujourd'hui set une fois).
- [ ] §5.7 getStats par-kind (inbound audio/video séparés) + résoudre vrai codec.
- [ ] §5.8 Auto-réparation média sens-unique (RTP gate actionnable → ICE restart).
- [ ] Anti-churn : retirer `.forcePolling(true)` (×3) → `["websocket","polling"]`.
- [ ] `RTCRtpReceiver` jitterBufferTarget si exposé par xcframework 146, sinon NetEq defaults.
- [ ] XCTest comportements changés.
- [ ] Déclencher `ios-tests.yml` (workflow_dispatch) → itérer jusqu'à build+tests verts.

## Ordre d'exécution
0 (shared) → 1 (gateway) → 2 (web, commits incrémentaux vérifiés) → 3 (iOS, push + CI loop).
Chaque étape : type-check/jest/build (ou CI iOS) vert avant commit. Commit isolé par sous-étape.

## Review
(à remplir)
</content>
</invoke>
