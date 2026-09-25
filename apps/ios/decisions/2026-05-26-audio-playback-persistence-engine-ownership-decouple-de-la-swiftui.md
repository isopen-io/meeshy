## 2026-05-26 : Audio playback persistence — engine ownership decouple de la SwiftUI cell

**Statut**: Accepte
**Contexte**: AudioPlayerView (SDK MeeshyUI) possedait son engine via `@StateObject private var player = AudioPlaybackManager()`. Quand la cellule sortait du viewport (scroll, navigation, app en background), SwiftUI detruisait la View et desallouait l'engine, coupant l'audio. Aucun moyen d'ecouter un message audio long en continuant a naviguer.

**Decision**: Architecture en trois couches.

- **ConversationAudioCoordinator** (app singleton @MainActor) possede l'engine via le protocol AudioPlaybackEngineDriving, la queue d'audios non ecoutes, l'ActiveAudioContext, et les hooks lifecycle (logout via AuthManager.$isAuthenticated, conversation supprimee via le nouveau SocialSocketManager.conversationDeleted, message supprime via MessageSocketManager.messageDeleted). Guard contre CallManager.callState.isActive.

- **AudioPlayerView SDK** : deux modifications backward-compat. (1) parametre `externalPlayer: AudioPlaybackManager? = nil` — si fourni, utilise via @ObservedObject au lieu du @StateObject interne. Strategie dummy + register-opt-out via nouvelle `AudioPlaybackManager.init(registerWithCoordinator: Bool)`. (2) parametre `onPlayRequest: (() -> Void)? = nil` — quand fourni ET `player.attachmentId != attachment.id`, le tap play route vers le parent au lieu de `player.togglePlayPause()` interne.

- **AudioBubbleRouter** (app wrapper de bulle conv) observe `coordinator.activeContext`. Si actif (`attachmentId` matche self), rend AudioPlayerView avec `externalPlayer = coordinator.engineForBubble` (tous les controls play/pause/seek touchent l'engine partage). Sinon, rend AudioPlayerView normal + `onPlayRequest` qui appelle `vm.playAudio()` (set le contexte coordinator + demarre la lecture via l'engine partage).

- **Background persistence** : `MediaLifecycleBridge.prepareForBackground` + `MeeshyApp.adaptiveOnChange(scenePhase)` gardent contre `coordinator.isPlaying`. Si true, l'AVAudioSession reste active et `UIBackgroundModes:audio` autorise l'OS a continuer la lecture.

- **MiniAudioPlayerBar** (`AdaptiveRootView` overlay) flottant au-dessus du tab bar, visible quand `coordinator.activeContext` non nil. Avatar + sender + nom conv + progress + play/pause/next/close. Auto-fade 5s apres queue vide via graceContext.

- **NowPlaying bridge** (`ConversationAudioCoordinator+NowPlaying`) MPNowPlayingInfoCenter + MPRemoteCommandCenter. Throttle 0.25s sur currentTime, removeDuplicates sur isPlaying/activeContext, artwork best-effort via `CacheCoordinator.shared.images.image(for:)`. Race protection : re-verifie `activeContext.attachmentId` apres await artwork.

**Reuse maximise** : aucun composant visuel nouveau (waveform, play button, time row, speed chip). AudioPlayerView SDK existant entierement preserve avec ses features (transcription, translatedAudios, BubbleFooter slots, fullscreen, langue Prisme Linguistique).

**Sites concernes** : 4 sites de bulle conv migres vers `AudioBubbleRouter` (3x ConversationMediaViews + 1x BubbleAttachmentView). Les sites hors-conv (composer preview, fullscreen, story, PostDetailView, FeedPostCard) gardent AudioPlayerView direct (engine local).

**Hooks lifecycle exhaustifs** : 5 cas qui ferment la lecture (close) — logout, conversation supprimee, message du active context supprime, queue vide, user tap close mini-player. Le 6e cas (message d'un autre element de la queue supprime) supprime juste cet element de la queue.

**Consequence majeure** : l'audio joue via une bulle de conv survit aux changements de view (scroll, navigation, background app, lock screen). L'audio joue via composer / fullscreen / story garde l'ancien comportement (@StateObject local).

**Alternatives rejetees**:
- **Plan original "ZERO modification SDK"** : aurait remplace AudioPlayerView par un AudioBubbleRouter qui rend des Active/Inactive bubbles minimaux. Aurait perdu transcription, translation, BubbleFooter, fullscreen. Rejete car regresse le Prisme Linguistique et la UX existante.
- **Extraction AudioPlayerCore** (separer rendering de ownership engine) : trop invasif sur les 1155 lignes de AudioPlayerView.swift, risque cassure non maitrise.
- **Owned engine au niveau du parent (VM)** : SwiftUI @StateObject reste lie au View lifecycle, ne survit pas au demontage.

**Tests** : 42 tests automatises (10 builder + 12 coordinator + 4 VM + 4 router + 3 lifecycle bridge + 2 scene phase + 7 mini-player). Smoke manual requis pour Now Playing lock screen, AirPods, CarPlay, interruptions CallKit/telephone/Siri, et background continu sur device reel.

**Source**: `docs/superpowers/specs/2026-05-25-audio-continuous-playback-design.md` + `docs/superpowers/plans/2026-05-25-ios-audio-playback-persistence-plan.md`
