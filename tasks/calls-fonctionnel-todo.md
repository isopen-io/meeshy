# Appels Audio/Vidéo — rendre fonctionnel iOS↔iOS, iOS↔web, web↔web

> Branche: `main` (prod = `:latest`). Backend cible: **production** (`gate.meeshy.me`).
> Personne sur la prod. Instrumentation temporaire → **rollback complet à la fin**.
> Déploiement: edit gateway/web → commit+push `main` → CI build `:latest` → `ssh root@meeshy.me` `cd /opt/meeshy/production && docker compose pull && docker compose up -d` → ~30s healthcheck → test.

## Matrice de test (matériel réel disponible)
- **Endpoint Mac**  : `./apps/ios/meeshy.sh run --mac` (Mac Catalyst) — compte `atabeth`
- **Endpoint iPhone**: `Services CEO i16pm` (iPhone 16 Pro Max, iOS 26.3.1) — compte `jcharlesnm`
- **Endpoint Web**  : navigateur sur le Mac (prod web) — compte alterné

| Paire | Endpoints réels | Risque (diagnostic) |
|-------|-----------------|---------------------|
| iOS↔iOS | Mac-app ↔ iPhone | Session audio (RC-2), CallKit lifecycle |
| iOS↔web | iPhone ↔ navigateur | **Le + à risque** : SDP RED asymétrie (RC-3), TURN tardif (RC-1) |
| web↔web | 2 navigateurs | TURN tardif (RC-1), glare, qualité jamais mesurée |

## Causes racines candidates (du diagnostic)
- [x] **RC-1 serveur**: TURN config — VÉRIFIÉ SAIN (`turn.meeshy.me:3478`, coturn healthy). Reste le bug **client web** (TURN tardif non appliqué au PC déjà créé — `use-webrtc-p2p.ts:165-179`).
- [ ] **RC-2**: désync session audio iOS (`didActivate` vs `[AUDIO_FALLBACK]` dans `CallManager.transitionToConnected`) → connecté mais muet.
- [ ] **RC-3**: asymétrie munging SDP iOS↔web (web force RED PT63 / iOS désactive RED) — invisible serveur (pas de log SDP).
- [ ] **RC-4**: 2× `new CallService` (`MeeshySocketIOManager.ts:153` + `CallEventsHandler.ts:80`) + `CallCleanupService` sans callService (`server.ts:373`) + double cleanup disconnect (`AuthHandler.ts:298` + `CallEventsHandler.ts:1585`).
- [ ] **RC-5**: fenêtre zombie pré-ACK iOS (`endCall` n'émet `call:end` que si `currentCallId != nil`).

## Phase 0 — Instrumentation (les logs)
Gateway (déployé prod commit b541ba270, image :latest, gateway healthy):
- [x] I1 — log SDP m-lines/codecs/PT + détection RED (`a=fmtp:63`) sur `call:signal` (`CallEventsHandler.ts`) ✅ LIVE PROD
- [x] I7 — corrélation cleanup disconnect (`CallEventsHandler.disconnect` + `AuthHandler.handleDisconnection`) ✅ LIVE PROD
- [x] log émission credentials TURN — DÉJÀ existant (`TURNCredentialService.ts:158` logge turnServers count)

iOS/Mac (build local meeshy.sh) — compilent (build Mac OK 84s, build device en cours):
- [x] I2 — candidats ICE sortants + `typ` host/srflx/relay (`P2PWebRTCClient.didGenerate`)
- [x] I5 — DÉJÀ couvert (`[AUDIO_FALLBACK]` logge didActivate-fired vs manual à `CallManager.swift:1226/1242`)
- [x] I6 — RTP entrant réel promu `.debug`→`.info` (`startRTPGatePolling`)
- [~] I8 — callId ajouté sur les lignes [CALL-DIAG] ; retrofit global non fait (gateway I1 corrèle déjà par callId)

Web (DevTools + `chrome://webrtc-internals` ; code only si besoin):
- [ ] vérifier candidats `relay` présents, état ICE, SDP local par PC

## Setup test (établi)
- Comptes: atabeth (68f2a814…dfc1) + jcharlesnm (69d72d41…815d, "Compte De Test Store")
- Conversation directe partagée: `69e229dd021ac982c7356850`
- Web prod: https://meeshy.me | Device physique: Services CEO UDID 00008140-000C615A3C33001C
- Logs: gateway streamé (bg), device via idevicesyslog (installé)

## Phase 1 — Vérification des 3 paires (ordre: + observable d'abord)
- [ ] web↔web : connexion, relay candidates, audio/vidéo 2 sens, raccroché propre
- [ ] iOS↔web : SDP offre(iOS)/answer(web) via I1, ICE I2, audio 2 sens, autoplay distant
- [ ] Mac↔iPhone : audio session (I5/I6), CallKit start/answer/end

## Phase 2 — Lifecycle / zombies
- [ ] raccroché très rapide (pré-ACK, RC-5) → `call:end` émis ?
- [ ] coupure réseau brutale en appel → double `call:ended`/`participant-left` (RC-4) ?
- [ ] sonnerie 60s sans réponse → `call:missed` + `call:ended` une seule fois
- [ ] post-appel : `CallSession` en DB bien `ended`, aucun zombie

## Phase 3 — Fixes des causes racines confirmées (loop)
- [ ] (selon confirmations) RC-1 web, RC-2 audio, RC-3 SDP, RC-4 gateway, RC-5 pré-ACK
- [ ] redeploy + re-vérif après chaque fix

## Phase 4 — Rollback instrumentation
- [ ] revert tous les commits d'instrumentation, redeploy prod propre, smoke final

## Causes racines TROUVÉES (test live iPhone jcnm → web atabeth, 2026-06-05 10:06)
- **C1 — Web role-gate** : `apps/web/components/conversations/header/use-permissions.ts:10-19` — `canUseVideoCalls` réservé à BIGBOSS/ADMIN/MODERATOR/AUDIT/ANALYST. Un USER ne peut PAS initier d'appel web. **Bug probable**. (atabeth=USER, jcharlesnm=USER, jcnm=ADMIN)
- **C2 — Web v2 bouton mort** : `/v2/chats` header phone button = placeholder sans `onClick`.
- **C3 — Web v2 chats crash** : `ReferenceError: repliedMessage is not defined` (ErrorBoundary) à l'ouverture d'une conversation v2.
- **C4 — Web ne rend PAS l'appel entrant** : gateway a bien émis `call:initiated` à atabeth (ICE générés `:21.878`, socket dans la room) mais aucune notif affichée côté web. À confirmer livraison vs rendu (batch 2 promeut le log livraison).
- **C5 — Churn socket iOS** : jcnm (iPhone) se déconnecte ~5s après `call:initiate` (PAS un ping timeout serveur = 10/25s). Cause en cours d'instrumentation (batch 2 = raison disconnect). iOS NE gate PAS les appels par rôle.
- **OK** : l'iPhone PEUT initier (`call:initiate` arrive au serveur), TURN servi (turnServers:1), session se termine proprement `missed`/`ended` côté serveur (pas de zombie serveur — fantôme = CallKit local iPhone, force-quit pour purger).

## Instrumentation déployée
- Batch 1 (commit b541ba270) : I1 SDP/codecs/RED/ICE + I7 cleanup. LIVE.
- Batch 2 (commit a5911897c, CI 27009097983) : raison disconnect (`disconnecting` handler) + livraison call:initiated info. EN DÉPLOIEMENT.

## Review
(à remplir en fin de loop)
