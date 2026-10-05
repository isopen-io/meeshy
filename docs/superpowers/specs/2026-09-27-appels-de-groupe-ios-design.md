# Appels de groupe iOS — spécification et plan (#3585)

> Milestone « Appels de groupe et appels traduits ». Critère de fin de l'issue :
> spécification + plan AVANT le code (chantier architectural). Ce document est
> ce préalable ; il est daté du 2026-09-27 et l'issue a raison en cas d'écart.

## 1. Ce qui existe déjà (mesuré sur `dev`, 2026-09-27)

| couche | état | preuve |
|---|---|---|
| Passerelle | appel de groupe = MAILLAGE p2p relayé, pas de SFU ; tout membre actif d'une conversation `group` peut appeler ; plafond **6 participants simultanés** (`CALL_MAX_PARTICIPANTS`, borne dure `CALL_MESH_CEILING = 8` tant qu'il n'y a pas de SFU) | `packages/shared/types/call-rules.ts`, `CallService.initiateCall` / `joinCall` (`MAX_PARTICIPANTS_REACHED`) |
| Passerelle | `call:participant-joined` diffusé aux AUTRES membres avec des identifiants TURN propres à chaque destinataire ; `call:participant-left` porte `userId` ; `call:signal` relayé par `to` ; `call:media-toggled` porte `userId` + `mediaType` (`audio`/`video`/`screen`) | `CallEventsHandler.ts:2407-2453`, `call-media-toggle.ts:127-140` |
| Passerelle | raccrocher dans un groupe = QUITTER (l'appel continue tant qu'il reste des membres) ; refus pré-décroché d'un groupe = no-op pour les autres invités | `CallService.endCall` § « Group hang-up » |
| Web | une `RTCPeerConnection` par membre (`peer-link.ts`), grille `call-grid.tsx` ; **qui offre à qui** : le membre DÉJÀ dans l'appel offre au nouveau venu à réception de `call:participant-joined` ; négociation parfaite (plus petit id = poli), époque `negotiationId` | `apps/web/src/lib/calls/engine.ts` (`onJoined`, `onSignal`, `onLeft`) |
| iOS | UN seul pair : `CallManager` (6 367 lignes) tient un `WebRTCService` / `P2PWebRTCClient` et `remoteUserId` ; l'en-tête n'offre l'appel qu'aux conversations DIRECTES ; `listenForParticipantJoined` se désabonne après le premier arrivant | `CallManager.swift:5022`, `ConversationView+Header.swift:67` |
| SDK iOS | `CallParticipantData` décode `userId`/`participantId` À PLAT alors que `call:participant-joined` les porte SOUS `participant` : l'identité de l'arrivant est perdue (nil) ; `CallMediaToggleData` ignore `userId` | `MessageSocketManager.swift:1118-1131` |

**Défaut présent aujourd'hui, avant toute feature** : un iPhone qui décroche un
appel de groupe lancé depuis le web reçoit les offres de CHAQUE membre déjà
présent ; `CallManager` ne filtre pas `signal.from` et les injecte toutes dans
son unique `RTCPeerConnection` — la négociation du pair principal est écrasée
par celle d'un tiers. Le lot 1 corrige ce routage avant d'ajouter quoi que ce
soit.

## 2. Décisions

### 2.1 Architecture : un pair PRINCIPAL + un maillage ADDITIONNEL

Réécrire `CallManager` en N pairs est hors de portée d'un lot (fichier 5× hors
budget, CallKit, PiP, survie vidéo, transcription, qualité reposent sur le pair
unique). On garde donc :

- **le pair principal** — celui que `CallManager` connaît déjà (`remoteUserId`) :
  l'initiateur pour un appelé, le PREMIER arrivant pour l'appelant d'un groupe.
  Toute la machinerie existante (CallKit, audio, PiP, qualité, transcription)
  continue de le servir sans changement ;
- **le maillage additionnel** — `GroupCallMeshCoordinator` (nouveau, app-side) :
  une `RTCPeerConnection` par AUTRE membre distant, créée sur la fabrique
  partagée (`WebRTCSharedFactory`), avec sa propre piste audio (l'ADM partage le
  micro) et la piste vidéo locale du pair principal (une `RTCVideoTrack` peut
  alimenter plusieurs connexions).

Le **routage des signaux** est la charnière : un `call:signal` dont `from` est
présent et différent de `remoteUserId` appartient au maillage ; les autres (ou
un `from` absent — passerelle ancienne) restent au pair principal. Une fonction
pure `GroupSignalRouting.destination(...)` le décide ; `CallManager` l'appelle
dans ses trois abonnements `offer`/`answer`/`ice-candidate`.

### 2.2 Qui offre à qui — même loi que le web

À `call:participant-joined` d'un membre X (X ≠ moi, X ≠ principal), si je suis
déjà dans l'appel (`connecting`/`connected`/`reconnecting`), **j'offre à X**.
Le nouveau venu ne fait que répondre. Chaque paire a un seul offrant, sans
collision au départ ; la négociation parfaite (plus petit userId poli) et
l'époque `negotiationId` couvrent les renégociations (bascule vidéo, reprise
ICE). Politesse : `CallManager.isPolitePeer`, la même règle que le pair
principal et que `peer-link.ts`.

### 2.3 Qui peut appeler, taille du maillage

- Tout membre actif d'une conversation `group` (règle passerelle, inchangée).
- Plafond : **`CallRules.maxParticipants` = 6** (miroir Swift de la règle TS),
  moi compris ⇒ 5 connexions distantes au plus (1 principale + 4 maillage).
  Au-delà, la passerelle refuse le `call:join` (`MAX_PARTICIPANTS_REACHED`) ;
  le coordinateur ignore aussi tout arrivant au-delà du plafond (défense).
- Pas de SFU : au-delà de 6, suivi « SFU » (§ 6).

### 2.4 Arrivées et départs

- `call:participant-joined` → la liste des membres (`GroupCallRoster`) s'enrichit
  (nom, avatar, micro, caméra décodés depuis `participant`) ; offre selon § 2.2.
- `call:participant-left` → la connexion du membre est fermée et sa tuile retirée.
  Si c'était le pair PRINCIPAL, `CallManager` garde son comportement actuel
  (suivi « promotion du principal », § 6 — dans un groupe, la fin du principal
  ne doit pas couper les autres).
- Échec d'une connexion de maillage (`failed` après reprises) → le membre est
  retiré localement ; l'appel continue (même loi que `engine.ts` `onLinkState`).
- Fin d'appel (`callState` → `ended`/`idle`) → toutes les connexions ferment.

### 2.5 Grille vidéo

`GroupCallGridLayout` (pur) : 1 tuile plein écran ; 2 tuiles empilées ;
3-4 tuiles en 2×2 ; 5-6 tuiles en 2×3 (portrait) / 3×2 (paysage). Tuiles de
même taille, la tuile locale incluse ; ordre stable = ordre d'arrivée.
Caméra coupée ⇒ avatar + nom (même vocabulaire que `CallParticipantVisual`).

### 2.6 Qui parle

`ActiveSpeakerDetector` (pur) : niveaux `audioLevel` (0…1) lus dans les
statistiques `inbound-rtp` audio de chaque connexion toutes les 400 ms ; seuil
d'entrée 0,06, seuil de sortie 0,03, maintien 800 ms (hystérésis : pas de
clignotement entre deux syllabes). Rendu : liseré `MeeshyColors.success` sur la
tuile, et `accessibilityValue` « parle ». Le pair principal fournit son niveau
par le même champ (`CallStats.inboundAudioLevel`, ajouté).

### 2.7 Micro / caméra / partage d'écran par pair

- Reçus : `call:media-toggled` (`userId` décodé) → icône micro barré, avatar à
  la place de la vidéo, badge « partage d'écran » sur la tuile.
- Émis : le basculement local existant (`CallManager.isMuted`,
  `isVideoEnabled`) s'applique aussi aux pistes du maillage (le coordinateur
  observe ces deux publications — aucun nouvel événement réseau : la passerelle
  diffuse déjà `call:media-toggled` à toute la salle).
- Partage d'écran REÇU : la piste vidéo d'un membre qui partage est rendue
  comme sa vidéo (le partage remplace la caméra côté émetteur) ; le badge dit
  pourquoi. Le partage d'écran ÉMIS par iOS vers le maillage : suivi (§ 6).

### 2.8 Bascule audio ↔ vidéo

La bascule locale (`toggleVideo`) active la piste partagée ; chaque connexion
du maillage renégocie si sa ligne vidéo ne sortait pas (transceiver
`sendRecv`, `onnegotiationneeded` → offre, époque +1). Un appel de groupe lancé
en audio peut donc passer en vidéo pour tous.

### 2.9 CallKit pour un groupe

Un seul `CXCall` par appel de groupe (pas un par pair).
`supportsGrouping`/`maximumCallsPerCallGroup` restent à 1 : le groupe est un
appel, pas une conférence CallKit de plusieurs appels. Mise en attente / fin
CallKit = quitter le groupe (la passerelle traite `end` comme un départ tant
qu'il reste des membres).

**Livré au lot 1, côté APPELANT seulement** : `startGroupCall` passe
`userId = conversationId` et `displayName = titre du groupe` au moteur
existant — la poignée CallKit et les Récents du téléphone rappellent donc le
groupe. **Côté APPELÉ**, la carte CallKit garde le nom de l'initiateur :
réécrire `localizedCallerName` en « Alice — Équipe design » demande de toucher
le chemin de sonnerie de `CallManager.swift` (hors budget, 6 367 lignes) — suivi
(§ 6).

### 2.10 Entrée

En-tête d'une conversation de groupe : le même bouton « Appeler » (menu vocal /
vidéo) que la conversation directe, cible 44 pt, libellé et indice VoiceOver.
L'appelant démarre sans pair principal ; le premier `participant-joined`
le désigne (`CallManager` assigne `remoteUserId`, applique la politesse, offre).

La pastille « Rejoindre » (appel de groupe déjà en cours, réconcilié par
`ActiveCallService`) rejoint aussi un groupe : l'arrivant n'a pas de principal,
les membres présents lui offrent, et le PREMIER qui offre est désigné principal
(`routesToGroupMesh`) ; les suivants passent par le maillage.

### 2.11 Accessibilité et langues

- Chaque tuile : `accessibilityElement(children: .ignore)`, libellé = nom,
  valeur = « parle », « micro coupé », « caméra coupée », « partage son écran »,
  « reconnexion… ».
- Grille : conteneur `accessibilityLabel` « Participants à l'appel ».
- Cibles ≥ 44 pt ; Dynamic Type sur les noms ; RTL natif (HStack/LazyVGrid).
- Textes dans `apps/ios/Meeshy/Localizable.xcstrings` en fr (source), en, es,
  de, it, pt, ar — les langues du catalogue.

## 3. Matrice cas × plateforme (lot 1)

| cas | iOS lot 1 | web |
|---|---|---|
| appeler un groupe depuis l'en-tête | oui | oui |
| rejoindre un appel de groupe entrant | oui (principal = initiateur) | oui |
| 3e…6e membre : connexion propre | oui (maillage) | oui |
| grille adaptative 1…6 | oui | oui |
| qui parle | oui | à mesurer |
| micro/caméra par pair | oui | oui |
| partage d'écran reçu | badge + vidéo | oui |
| rejoindre un appel de groupe déjà en cours | oui (1er offrant = principal) | oui |
| partage d'écran émis vers le maillage | suivi | oui |
| départ du principal sans couper les autres | suivi | oui |
| nom du groupe sur la carte CallKit de l'appelé | suivi | — |

## 4. Plan (TDD, lot 1)

1. **SDK** — extraire `CallParticipantData` et `CallMediaToggleData` de
   `MessageSocketManager.swift` (hors budget) vers
   `Sockets/CallParticipantEvents.swift` ; décoder `participant.{userId,
   displayName, username, avatar, isAudioEnabled, isVideoEnabled}` en plus de la
   forme plate ; `userId` sur la bascule média. Témoins Swift Testing.
2. **Domaine pur (app)** — `GroupCallRoster`, `GroupSignalRouting`,
   `GroupCallGridLayout`, `ActiveSpeakerDetector` ; XCTest.
3. **Coordinateur** — `GroupCallMeshProviding` + `GroupCallMeshCoordinator`
   (@MainActor, injection par init avec défauts `.shared`), qui parle à
   `GroupPeerLinkProviding` (une connexion) et `GroupCallSignalingProviding`
   (l'émission `call:signal`) ; XCTest avec mocks.
4. **Adaptateur WebRTC** — `WebRTCGroupPeerLink` (RTCPeerConnection réelle,
   non testable hors appareil ; relu, et couvert par le mock en 3).
5. **Branchements minimaux dans `CallManager`** — À LIGNES CONSTANTES
   (6 367 avant, 6 367 après) : l'extraction envisagée était interdite par les
   gardes de source qui épinglent `isPolitePeer`, `isStaleNegotiation`,
   `emitOfferWithRetry` dans `CallManager.swift`. Sept lignes modifiées sur
   place (trois gardes de signal, la bascule média, la désignation du
   principal, la cible de l'offre, la visibilité du setter de `remoteUserId`) ;
   la logique vit dans `CallManager+GroupMesh.swift`, avec la liaison socket →
   coordinateur (`GroupCallMeshBinding`, branchée par `CallManagerHost.adopt`
   sur la pile de production seulement).
6. **UI** — `GroupCallStageView` (tuiles, qui parle, badges, VoiceOver) posé
   par `CallPresentationLayer` en surimpression de `CallView` (hors budget),
   entre son chrome du haut et ses contrôles du bas, à partir de DEUX membres
   distants ; bouton d'appel de l'en-tête de groupe (`HeaderCallButtonsView`,
   `isGroup`).
7. **Catalogue** — 7 langues ; gardes du dépôt.

## 5. Dimensions visées

Sécurité (routage par `from`, jamais d'offre d'un inconnu hors appel courant),
performance (pas de connexion ouverte avant l'annonce de l'arrivant), mémoire
(fermeture de chaque connexion au départ / à la fin), fluidité (grille sans
réagencement quand un membre parle — seul le liseré change), accessibilité
(§ 2.11), cohérence (même bouton, même loi d'offre que le web), complétude
(matrice § 3 ; les « suivi » deviennent des issues).

## 6. Suivis (une issue chacun)

- Promotion du pair principal quand il quitte un groupe (aujourd'hui : fin
  locale côté iOS).
- Partage d'écran ÉMIS vers les membres du maillage.
- Transcription / sous-titres pour les membres du maillage (canal
  `transcription` par connexion).
- Qualité / rapport `call:quality-report` agrégé sur toutes les connexions.
- SFU au-delà de 6 participants.
- Validation sur appareils réels à 3, 4 et 6 participants (profil mémoire,
  thermique, voie montante 4G).
- Nom du groupe sur la carte CallKit de l'APPELÉ (« Alice — Équipe design »).
- Appel de groupe réveillé à froid par PushKit : la charge VoIP ne dit pas
  `conversationType` ; la nature « groupe » n'est inférée qu'à l'arrivée d'un
  tiers.
- État caméra d'un membre découvert par son offre (arrivant tardif) : supposé
  égal à la nature de l'appel jusqu'à son premier `call:media-toggled`.
- Intégrer la grille DANS `CallView` (au lieu d'une surimpression) une fois
  `CallView.swift` redescendu sous le budget.
