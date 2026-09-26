# Appels audio et vidéo — parité iOS / legacy web → web et coque Android

Relevé du 2026-09-26 sur `dev` (`38e1eca5`) et sur le tag `legacy-web-final`. Compte rendu daté : l'état des tâches vit dans les issues GitHub, qui ont raison en cas d'écart.

**Périmètre.** « Web » = `apps/web` (Vite + Preact). « Coque Android » = `apps/web/android` (Capacitor), qui est le chemin Android du produit. L'application Kotlin native `apps/android` est gelée (directive 2026-09-16) : elle figure en annexe comme référence de conception, jamais comme cible.

**Légende.** ✅ présente · 🟡 partielle · ❌ absente · — sans objet (la plateforme ne l'a pas non plus).

## Ce qu'il faut retenir

1. **Le web actuel n'a aucun appel.** Zéro `RTCPeerConnection`, zéro `getDisplayMedia` ; le seul `getUserMedia` est l'enregistreur de vocaux (`src/lib/view/use-recorder.ts:76`). Le socket (`src/lib/api/socket.ts`) n'écoute aucun évènement `call:*`. Le bouton « Appeler » du fil (`src/components/thread-header.tsx:240-249`) n'a pas d'`onClick` : c'est un contrôle inerte.
2. **Ce qui existe déjà côté web est en lecture seule :** le journal `/calls` sur l'API réelle, la bulle système d'appel, l'aperçu « appel en cours » dans la liste, la catégorie « Appels » de la cloche.
3. **Le serveur est prêt pour un client web 1:1 et maillé**, avec trois manques qui bloquent la parité : aucune poussée d'appel entrant vers Android (FCM) ni vers le navigateur (seul iOS sonne app fermée) ; les poussées « arrêter la sonnerie » excluent le web ; `POST /calls` ne fait sonner personne (seul le socket `call:initiate` le fait).
4. **Le legacy web est la meilleure base de portage** pour le moteur (maillage, négociation parfaite interopérable iOS, paliers de qualité par pair, sonnerie, appel en attente) — 11,8 k lignes et ~60 tests, restaurables par `git checkout legacy-web-final -- apps/web`. **iOS est la référence de l'interface** (bandeau « la v2.0 suit l'interface iOS »).
5. **Ni iOS ni le legacy n'ont** : partage d'écran, enregistrement, simulcast, chiffrement par trame, SFU. Les appels de groupe existent au legacy (maillage) mais pas sur iOS. Ces points sont des décisions produit, pas de la parité.

## Tableau de parité

### A. Lancer un appel

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| A1 | Appel audio 1:1 depuis l'en-tête du fil | ✅ | ✅ | 🟡 bouton inerte | 🟡 idem | 2 | iOS `ConversationView+Header.swift:360` · legacy `header/HeaderToolbar.tsx` · web `thread-header.tsx:240` |
| A2 | Appel vidéo 1:1 depuis l'en-tête (menu audio / vidéo) | ✅ | ✅ | ❌ | ❌ | 2 | idem |
| A3 | Appeler depuis la liste des conversations (menu contextuel) | ✅ | ❌ | ❌ | ❌ | 3 | iOS `ConversationListView+Overlays.swift:118` |
| A4 | Rappeler depuis le journal (audio ou vidéo) | ✅ | — | ❌ (#6382) | ❌ | 3 | iOS `CallsTab.swift:192` · web `routes/calls-parts.tsx` |
| A5 | Rappeler depuis la bulle d'appel terminé | 🟡 via fiche | ✅ | ❌ | ❌ | 3 | legacy `CallSystemMessage.tsx` |
| A6 | Rappeler depuis la notification d'appel manqué | 🟡 ouvre le fil | ❌ | ❌ | ❌ | 3 | iOS `NotificationActionHandler.swift:362` |
| A7 | Appeler un contact sans conversation connue (`CallStarter`) | ✅ | ❌ | ❌ | ❌ | 3 | iOS `Contacts/CallStarter.swift` |
| A8 | Pavé : trouver par numéro puis appeler | ✅ | ❌ | ❌ (#6454) | ❌ | 3 | iOS `KeypadTab.swift` |
| A9 | Garde « déjà en appel » | ✅ | ✅ | ❌ | ❌ | 1 | iOS `CallManager.swift:1110` · legacy `use-video-call.ts` |
| A10 | Permissions micro / caméra avant l'appel (caméra refusée ⇒ audio) | ✅ | ✅ | ❌ | ❌ | 2 | iOS `MediaPermissionCoordinator.swift` · legacy `use-video-call.ts` |
| A11 | Réessayer après un échec transitoire | ✅ | ✅ | ❌ | ❌ | 2 | iOS `CallView.swift:1602` · legacy `call-retry-policy.ts` |
| A12 | Lien profond `/call/:callId` | — | 🟡 | ❌ | ❌ | 3 | legacy `app/call/[callId]/page.tsx` |
| A13 | Siri / Récents iOS / raccourcis | 🟡 stub | — | — | — | — | iOS `MeeshyAppIntents.swift` (#7735) |

### B. Signalisation et moteur WebRTC

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| B1 | `call:initiate` / `call:join` avec ack et serveurs ICE | ✅ | ✅ | ❌ | ❌ | 1 | iOS SDK `MessageSocketManager.swift` · legacy `CallManager.tsx` · serveur `CallEventsHandler.ts` |
| B2 | Négociation parfaite (poli / impoli) + garde d'epoch `negotiationId` | ✅ | ✅ | ❌ | ❌ | 1 | iOS `CallManager.swift:5164` · legacy `webrtc-service.ts`, `use-webrtc-p2p.ts` |
| B3 | Candidats ICE précoces mis en tampon | ✅ | ✅ | ❌ | ❌ | 1 | idem |
| B4 | Identifiants TURN du serveur + rafraîchissement à 80 % du TTL | ✅ | ✅ | ❌ | ❌ | 1 | serveur `TURNCredentialService.ts` |
| B5 | Réglages SDP : Opus FEC/DTX + RED, transport-cc, débits vidéo | ✅ | ✅ | ❌ | ❌ | 1 | iOS `P2PWebRTCClient.swift:383` · legacy `webrtc-service.ts` |
| B6 | Filtrage des évènements d'un autre `callId` | ✅ | ✅ | ❌ | ❌ | 1 | legacy `CallManager.tsx` |
| B7 | `call:check-active` à chaque connexion (reprise) | ✅ | ✅ | ❌ | ❌ | 1 | |
| B8 | `presence:app-state` (sonnerie socket ou poussée) | ✅ | ❌ | ❌ | ❌ | 0 | serveur `CallEventsHandler.ts` |
| B9 | `call:end` / `call:leave` avec ack et fin en attente | ✅ | 🟡 sans ack | ❌ | ❌ | 1 | iOS `CallManager.swift:5328` |
| B10 | Canal de données (sous-titres, ping, « bye ») | ✅ | 🟡 réception | ❌ | ❌ | 6 | iOS `P2PWebRTCClient.swift:1133` · legacy `call-transcript-channel.ts` |
| B11 | Simulcast | ❌ | 🟡 jamais appelé | ❌ | ❌ | — | |

### C. Appel entrant

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| C1 | Carte d'appel entrant dans l'application | ✅ | ✅ | ❌ | ❌ | 2 | iOS `IncomingCallView.swift` · legacy `CallNotification.tsx` |
| C2 | Sonnerie + vibration | ✅ CallKit | ✅ | ❌ | ❌ | 2 | legacy `utils/ringtone.ts`, `public/sounds/ringtone.opus` |
| C3 | Tonalité de retour d'appel côté appelant, signaux « connecté » / « fin » | ✅ | ❌ | ❌ | ❌ | 2 | iOS `RingbackTonePlayer.swift` |
| C4 | Refuser | ✅ | ✅ | ❌ | ❌ | 2 | `call:end {reason:'rejected'}` |
| C5 | Décroché sur un autre appareil (arrêt de la sonnerie) | ✅ | ✅ | ❌ | ❌ | 2 | `call:already-answered` + poussée `call_answered_elsewhere` |
| C6 | Appelant raccroche pendant la sonnerie | ✅ | ✅ | ❌ | ❌ | 2 | `call:ended` / `call:missed` + poussée `call_cancel` |
| C7 | Appel en attente (terminer et répondre / refuser) | ✅ | ✅ | ❌ | ❌ | 2 | iOS `CallWaitingBannerView.swift` · legacy `CallWaitingBanner.tsx` |
| C8 | Double appel entrant, rejeu dupliqué ignoré | ✅ | ✅ | ❌ | ❌ | 2 | legacy tests `CallManager.doubleIncomingCall`, `duplicateIncomingReplay` |
| C9 | Délais : sonnerie 45 s, offre 30 s, attente 45 s | ✅ | ✅ | ❌ | ❌ | 1 | iOS `WebRTCTypes.swift:1236` · serveur 60 s / nettoyage 120 s |
| C10 | **Sonnerie application fermée** (poussée d'appel entrant) | ✅ PushKit + CallKit | ❌ | ❌ | ❌ | 0 + 7 | serveur n'envoie `call` qu'en `voip`/`apns` (`CallEventsHandler.ts:~2206`) |
| C11 | Notification d'appel plein écran avec Répondre / Refuser | ✅ CallKit | ❌ | ❌ service worker | ❌ | 0 + 7 | web `public/sw-push.js` sans type `call` · coque sans `USE_FULL_SCREEN_INTENT` |
| C12 | Notification d'appel manqué | ✅ | 🟡 cloche | 🟡 cloche seulement | 🟡 | 3 | web `lib/notifications/categories.ts:109` |
| C13 | Refuser avec un message | ❌ | ❌ | ❌ | ❌ | — | |

### D. Pendant l'appel

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| D1 | Écran d'appel plein écran (états : sonne, connexion, reconnexion, fin + motif) | ✅ | ✅ | ❌ | ❌ | 2 | iOS `CallView.swift` · legacy `VideoCallInterface.tsx` |
| D2 | Couper le micro (+ `call:toggle-audio`, « le pair a coupé ») | ✅ | ✅ | ❌ | ❌ | 2 | |
| D3 | Caméra on/off, passage audio → vidéo en cours d'appel | ✅ | ✅ | ❌ | ❌ | 2 | iOS `CallManager.swift:2635` · legacy `use-webrtc-p2p.ts` |
| D4 | Caméra avant / arrière | ✅ | ✅ | ❌ | ❌ | 2 | |
| D5 | Choix d'une caméra, d'un micro, d'une sortie audio | 🟡 caméra | ❌ | ❌ | ❌ | 4 | web : `enumerateDevices` + `setSinkId` |
| D6 | Haut-parleur / écouteur / Bluetooth | ✅ | 🟡 faux (coupe la vidéo) | ❌ | ❌ | 4 + 7 | coque : plugin natif de routage audio |
| D7 | Durée, nom, compteur de participants | ✅ | ✅ | ❌ | ❌ | 2 | legacy `CallInfoOverlay.tsx` |
| D8 | Inverser vignette locale / distante, vignette déplaçable | ✅ | ✅ | ❌ | ❌ | 2 | legacy `LocalVideoTile.tsx`, `use-draggable.ts` |
| D9 | **Réduire l'appel et continuer à discuter** (pastille, bulle déplaçable) | ✅ | ❌ | ❌ | ❌ | 4 | iOS `FloatingCallPillView.swift`, `CallBubbleView.swift` |
| D10 | Image dans l'image système | ✅ | ❌ | ❌ | ❌ | 4 | iOS `PiPCallController.swift` · web : `requestPictureInPicture` / Document PiP |
| D11 | Mise en attente | ✅ CallKit | — | — | — | — | |
| D12 | Filtres vidéo (5 préréglages, flou d'arrière-plan, lissage, basse lumière) | ✅ | 🟡 réglages jamais lus | ❌ | ❌ | 8 | iOS `VideoFilterPipeline.swift` |
| D13 | Effets de voix | ❌ retirés | ✅ | ❌ | ❌ | 8 | legacy `use-audio-effects.ts` — décision produit |
| D14 | Partage d'écran | ❌ | 🟡 drapeau seul | ❌ | ❌ | 8 | décision produit |
| D15 | Capteur de proximité, écran maintenu allumé | ✅ | ❌ | ❌ | ❌ | 7 | coque : plugin natif ; web : Wake Lock |
| D16 | Audio en arrière-plan, `call:backgrounded` / `foregrounded` | ✅ | ❌ | ❌ | ❌ | 1 + 7 | coque : service au premier plan micro / caméra |
| D17 | Détection de capture d'écran (émise / alerte reçue) | ✅ / ✅ | ❌ / ✅ | ❌ | ❌ | 5 | coque : `DETECT_SCREEN_RECORDING` |
| D18 | Libellés d'accessibilité, VoiceOver / lecteur d'écran | ✅ | 🟡 | ❌ | ❌ | 2 | |
| D19 | Haptique aux transitions | ✅ | 🟡 vibration | ❌ | ❌ | 7 | |

### E. Résilience

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| E1 | Redémarrage ICE avec repli exponentiel | ✅ | ✅ | ❌ | ❌ | 1 | iOS `CallManager.swift:5804` · legacy `webrtc-service.ts` |
| E2 | Réaction au changement de réseau | ✅ | 🟡 via état ICE | ❌ | ❌ | 1 | web : évènement `online` / `connection.change` |
| E3 | Reconnexion socket ⇒ `call:join` à nouveau (`CALL_ENDED` ⇒ fin) | ✅ | ✅ | ❌ | ❌ | 1 | legacy test `CallManager.reconnect` |
| E4 | Battement `call:heartbeat` (10 s iOS, 15 s legacy) | ✅ | ✅ | ❌ | ❌ | 1 | |
| E5 | `call:reconnecting` / `call:reconnected` | ✅ | ✅ | ❌ | ❌ | 1 | |
| E6 | Chien de garde de connexion (45 s) | ✅ | ✅ | ❌ | ❌ | 1 | legacy `VideoCallInterface.tsx` |
| E7 | Reprise après rechargement / plantage (`GET /calls/active`) | ✅ | ✅ | ❌ | ❌ | 3 | |
| E8 | Survie vidéo (gel à 2 fps sur mauvais lien, audio prioritaire) | ✅ | ✅ | ❌ | ❌ | 5 | iOS `VideoSurvivalController.swift` · legacy `adaptive-degradation.ts` |
| E9 | Adaptation thermique | ✅ | — | — | ❌ | — | |
| E10 | Survie au redémarrage du gateway | 🟡 (#3578) | 🟡 | ❌ | ❌ | 9 | |
| E11 | Frontière d'erreur de l'écran d'appel | — | ✅ | ❌ | ❌ | 2 | legacy `CallErrorBoundary.tsx` |

### F. Qualité et mesure

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| F1 | Boucle `getStats` et niveau de qualité | ✅ 5 s | ✅ 2 s | ❌ | ❌ | 5 | legacy `use-call-quality.ts` |
| F2 | Paliers d'encodage vidéo par pair | ✅ | ✅ | ❌ | ❌ | 5 | legacy `use-per-peer-video-tier.ts` |
| F3 | Indicateur de signal + détail (perte, latence, gigue, débits) | 🟡 glyphe | ✅ | ❌ | ❌ | 5 | iOS `CallSignalGlyph.swift` · legacy `CallQualityOverlay.tsx` |
| F4 | `call:quality-report` émis, `call:quality-alert` affiché | ✅ | ✅ | ❌ | ❌ | 5 | |
| F5 | `call:analytics` en fin d'appel (codec, effets, sous-titres réels) | ✅ | 🟡 champs codés en dur | ❌ | ❌ | 5 | |
| F6 | Note post-appel | ❌ | ❌ | ❌ | ❌ | — | |

### G. Sous-titres, transcription, traduction

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| G1 | Sous-titres traduits en direct (`call:translated-segment`) | ✅ | ✅ | ❌ | ❌ | 6 | iOS `CallTranscriptionService.swift` · legacy `use-call-captions.ts` |
| G2 | Modes off / original / traduit | ✅ | 🟡 traduit seul | ❌ | ❌ | 6 | iOS `CaptionsMode.swift` |
| G3 | **Le web transcrit son propre micro** (`call:transcription-segment`) | ✅ sur l'appareil | ❌ | ❌ | ❌ | 6 | web : Web Speech API ; coque : reconnaissance Android |
| G4 | Journal de transcription en direct | ✅ | ✅ | ❌ | ❌ | 6 | legacy `CallTranscriptPanel.tsx` |
| G5 | `call:transcription-active` (invitation à écouter) | ✅ | ✅ | ❌ | ❌ | 6 | |
| G6 | Transcription après l'appel (`GET /calls/:id/transcript`) | ✅ | ❌ | ❌ | ❌ | 6 | iOS `BubbleCallNoticeView.swift:400` |

### H. Appels dans le fil, la liste et le journal

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| H1 | Bulle système de fin d'appel (issue, durée, données) | ✅ | ✅ | 🟡 texte + glyphe | 🟡 | 3 | web `system-notice.tsx:90`, `message-badges.ts:74` |
| H2 | Bulle « appel en cours » avec Rejoindre | ✅ | ✅ | 🟡 sans bouton | 🟡 | 3 | iOS `LiveCallJoiner.swift` |
| H3 | Bandeau / pastille « Rejoindre » dans l'en-tête du fil | ✅ | ✅ sondage 15 s | ❌ | ❌ | 3 | legacy `use-call-banner.ts`, `OngoingCallBanner.tsx` |
| H4 | Ligne de liste « appel en cours » + Rejoindre | ✅ (#7616) | ❌ | 🟡 sans bouton | 🟡 | 3 | web `lens-preview-line.tsx:23` |
| H5 | Journal des appels (Tous / Manqués, cache d'abord, pages) | 🟡 1re page seule | ❌ | ✅ | ✅ | — | web `routes/calls.tsx` |
| H6 | Fiche détail d'un appel | ✅ | ❌ | ❌ (#6383) | ❌ | 3 | iOS `CallDetailSheet.swift` |
| H7 | Supprimer / vider le journal | ❌ | ❌ | ❌ | ❌ | — | aucune route serveur |

### I. Appels de groupe

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| I1 | Appel à 3+ en maillage | ❌ 1 pair | ✅ | ❌ (#3721) | ❌ | 9 | legacy `use-webrtc-p2p.ts` · `tasks/2026-08-13-group-calls-gap-analysis.md` |
| I2 | Grille de vignettes, mise en avant d'un participant | ❌ | ✅ | ❌ | ❌ | 9 | legacy `DraggableParticipantOverlay.tsx`, `overlay-grid-layout.ts` |
| I3 | Exclure un participant (modérateur) | ❌ | ✅ | ❌ | ❌ | 9 | `DELETE /calls/:id/participants/:pid` |
| I4 | Carte entrante de groupe (titre, N participants) | ❌ | ✅ | ❌ | ❌ | 9 | legacy `CallNotification.tsx` |
| I5 | SFU au-delà de 3 (ADR-001/002 acceptés, jamais implémentés) | ❌ | ❌ | ❌ | ❌ | — | `docs/video-calls/adr/` — décision produit |

### J. Plateforme

| # | Fonction | iOS | Legacy | Web | Coque | Lot | Sources |
|---|---|---|---|---|---|---|---|
| J1 | Permissions déclarées (micro, caméra) | ✅ | — | 🟡 micro seul | 🟡 `RECORD_AUDIO` sans `CAMERA` | 7 | coque `AndroidManifest.xml` |
| J2 | Service au premier plan pendant l'appel | ✅ modes `voip`/`audio` | — | — | ❌ | 7 | |
| J3 | Intégration système d'appel (CallKit / ConnectionService) | ✅ | — | — | ❌ | 7 | |
| J4 | Moteur d'appel chargé à la demande (aucun octet WebRTC au premier rendu) | ✅ (#7955) | ❌ | — | — | 1 | web : budget du chunk `realtime` |
| J5 | Textes dans les 7 langues | ✅ | 🟡 4 langues | 🟡 journal seul | 🟡 | 2 | web `interface-catalogs/catalog-*.ts` |

## Plan de livraison par lots

Chaque lot est testable seul et se déploie sur dev puis en production. L'ordre suit les dépendances : rien ne sonne sans le lot 1, rien ne sonne app fermée sans le lot 0.

| Lot | Résultat visible | Contenu | Couvre | Issues existantes |
|---|---|---|---|---|
| **0** | Un appel sonne sur le web et Android même application fermée | Gateway : poussée `call` en FCM haute priorité vers `android` et `web` ; `call_cancel` et `call_answered_elsewhere` étendus au web ; texte de poussée localisé ; service worker : type `call` avec `requireInteraction` et actions Répondre / Refuser ; le client émet `presence:app-state` | B8, C10, C11 (web) | #8043, #7282 |
| **1** | Deux navigateurs se parlent en 1:1 (moteur, sans habillage) | `src/lib/calls/` : module de signalisation branché au `SocketClient` de `realtime.ts` (et non dans `socket.ts`, déjà hors budget), magasin zustand d'appel, moteur WebRTC porté du legacy (négociation parfaite, `negotiationId`, TURN et rafraîchissement, ICE restart, battement, reprise), chargé en `import()` à la demande | A9, B1–B7, B9, C9, D16 (web), E1–E6, J4 | #8044, #3572, #3573 |
| **2** | On appelle et on répond depuis le web comme sur iOS | Bouton de l'en-tête branché (menu audio / vidéo), permissions, carte entrante, sonnerie, retour d'appel, refus, décroché ailleurs, appel en attente, écran d'appel iOS (états, contrôles, bascule caméra, audio → vidéo, durée, réessayer), accessibilité, 7 langues | A1, A2, A10, A11, C1–C8, D1–D4, D7, D8, D18, E11, J5 | #8045, #6382, #3579 |
| **3** | On rejoint et on rappelle de partout | Rejoindre depuis la bulle, la ligne de liste et l'en-tête ; Rappeler depuis le journal, la bulle et la notification manquée ; fiche détail ; appel depuis un contact ; pavé ; `/call/:callId` ; reprise après rechargement | A3–A8, A12, C12, E7, H1–H4, H6 | #6382, #6383, #6454 |
| **4** | On continue de discuter pendant un appel | Couche d'appel au-dessus du routeur : pastille puis bulle déplaçable, image dans l'image, choix des périphériques et de la sortie audio | D5, D6 (web), D9, D10 | #8046 |
| **5** | La qualité s'adapte et se voit | `getStats`, paliers par pair, survie vidéo, indicateur et détail de qualité, rapports et alertes, analytics complètes, alerte de capture d'écran | D17, E8, F1–F5 | #8047 |
| **6** | Les sous-titres traduits marchent dans les deux sens | Réception `call:translated-segment`, modes, journal, canal de données ; le web transcrit son micro (Web Speech API) ; transcription après l'appel | B10, G1–G6 | #8048 |
| **7** | L'appel est natif dans la coque Android | Manifeste (`CAMERA`, `FOREGROUND_SERVICE_*`, `USE_FULL_SCREEN_INTENT`, `BLUETOOTH_CONNECT`), plugin Capacitor : notification d'appel plein écran depuis la poussée FCM, service au premier plan, routage audio, proximité, écran allumé ; le code Kotlin gelé sert de modèle (`IncomingCallPushRouter`, `CallAudioRoute`) | C10, C11 (coque), D6, D15, D16, D19, J1–J3 | #8049 |
| **8** | Au-delà de la parité, sur décision | Filtres vidéo et flou d'arrière-plan (parité iOS), effets de voix (legacy seul, retirés d'iOS), partage d'écran (ni l'un ni l'autre) | D12–D14 | #8050 (`décision-produit`) |
| **9** | Recette et déploiement | E2E web↔web, iOS↔web, coque↔iOS ; survie au redémarrage du gateway ; appels de groupe en maillage (le serveur l'accepte déjà, `MAX_CALL_PARTICIPANTS = 9999`) ; déploiement dev puis production | E10, I1–I4 | #3572, #3573, #3578, #3721 |

## Écarts relevés en chemin

- **Délais de sonnerie incohérents** : 45 s côté clients, 60 s serveur, 120 s nettoyage (`CallService.ts`, `CallCleanupService.ts`).
- **Plafond de groupe irréaliste** : `MAX_CALL_PARTICIPANTS = 9999` (`CallService.ts:86`) alors que le maillage se dégrade au-delà de 4 à 6 pairs, et qu'iOS ne sait gérer qu'un pair.
- **Contrat mort** : `call:mode-changed`, `call:transcription`, `call:translation`, `call:audio-chunk` et une dizaine d'autres sont déclarés dans `packages/shared` sans jamais être émis.
- **Budgets dépassés** : `CallEventsHandler.ts` (4 392 lignes), `CallService.ts` (3 064), iOS `CallManager.swift` (6 440). Le client web ne doit pas reproduire ce motif.
- **La coque porte deux plugins Java écrits à la main** (`MeeshySharePlugin`, `MeeshyLinksPlugin`) : le « 0 code natif » du bandeau Android de `CLAUDE.md` est à relire.

## Annexe — Android Kotlin gelé (référence seulement)

`apps/android` avait un moteur 1:1 complet (`io.getstream:stream-webrtc-android` 1.3.10, `WebRtcEngine.kt`, `CallSignalManager.kt`, ~40 politiques pures sous `core/model/.../call/`), la notification d'appel plein écran FCM (`MeeshyFcmService.kt`, `IncomingCallPushRouter`), le routage audio (`CallAudioRoute`) et le journal en cache Room. Le `ConnectionService` n'était qu'un journal (`LogTelecomCallReporter`) et aucun service au premier plan n'était démarré. Rien n'y est porté ; ces fichiers servent de modèle au lot 7.
