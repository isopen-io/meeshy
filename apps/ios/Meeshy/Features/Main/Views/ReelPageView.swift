import SwiftUI
import AVKit
import MeeshySDK
import MeeshyUI

// MARK: - Reel Page

/// One full-screen reel: media background + bottom gradient + author/description
/// overlay + a right-hand action rail (like / comment / bookmark / share).
struct ReelPageView: View {
    let reel: FeedPost
    /// Élue : la page passe la moitié de l'écran (#9837), peut-être encore
    /// sous le doigt.
    let isActive: Bool
    /// Posée : le défilement s'est arrêté sur elle (#10354).
    var isSettled: Bool = true
    let revealCompleted: Bool
    /// The reels view-model — passed so the action rail can read the live
    /// like/bookmark/comment counters reactively (the rail observes it).
    let viewModel: ReelsViewModel
    /// Shared immersive flag (owned by `ReelsPlayerView`). Long-press hides all
    /// chrome; the next tap restores it (mirrors the Story viewer). Une valeur
    /// et son écrivain plutôt qu'un `Binding` : la page se compare (#10354).
    let chromeHidden: Bool
    var setChromeHidden: (Bool) -> Void
    var onComment: () -> Void
    /// « Envoyer » du rail (#14310) — l'hôte présente la feuille Meeshy.
    var onSend: () -> Void
    var onQuote: (() -> Void)? = nil
    var onImager: (() -> Void)? = nil
    /// Author name tap → profile.
    var onTapAuthorName: () -> Void
    /// Avatar tap → story (if active) else profile.
    var onTapAvatar: () -> Void
    /// La page est dans la fenêtre de préchargement (#9702) : hors d'elle, sa
    /// vidéo ne se télécharge pas d'elle-même (le `TabView` d'iOS 16 monte
    /// toutes les pages d'un coup).
    var isWithinPreloadWindow: Bool = true

    @State var descriptionExpanded = false
    @State private var audioFullscreen: AudioFullscreenSource?
    /// Le plein écran qui FEUILLETTE les médias du réel (#4927) — la même
    /// galerie que la carte du fil, le détail d'un post et un commentaire.
    @State private var showMediaGallery = false
    /// Le média que le carrousel montre EN CE MOMENT. `nil` avant qu'il ne se
    /// prononce — la pastille retombe alors sur le média primaire, jamais sur
    /// un rang inventé.
    @State private var visibleCarouselMediaId: String?
    /// Lieu du réel ouvert plein écran (tap sur le sticker de position).
    @State var reelFullscreenPlace: BubbleFullscreenPlace?
    /// Prisme: the language the viewer explicitly picked via a flag / the
    /// translate toggle. `nil` = the auto-resolved preferred translation.
    @State var selectedLanguage: String?
    /// Réel composé (#6745) — voir `ReelsPlayerView+Scene.swift`.
    @State var scenePaused = false
    @State var sceneSoundMuted = false
    // `@State`, pas `@StateObject` : la page POSSÈDE l'horloge sans s'y
    // abonner. `@StateObject` l'abonnait, et chaque image du player (60–120 Hz)
    // ré-évaluait la page entière ; seule `ReelSceneProgressBar` l'observe.
    @State var sceneClock = ReelSceneClock()
    // Plain reference (NOT @ObservedObject): the page itself doesn't need to
    // re-render on every 0.1s time tick — only `ReelScrubBar` observes the
    // manager. Used here only for the fire-and-forget `togglePlayPause()` tap.
    private let playerManager = SharedAVPlayerManager.shared
    /// Audio-reel playback engine — SHARED between the play/scrub control
    /// (`ReelAudioControl` → `AudioPlayerView(externalPlayer:)`) and the hero
    /// transcript (`ReelAudioView` → `MediaTranscriptionView`) so the karaoke
    /// highlight tracks the SAME position the user scrubs/plays. One engine per
    /// page; only the active audio reel ever plays. Held through a box that
    /// never publishes: `@StateObject` on the engine itself re-rendered the
    /// whole page at its 10 Hz `currentTime` tick — its readers observe it.
    @StateObject private var audioBox = ReelAudioEngineBox()
    var audioPlayer: AudioPlaybackManager { audioBox.player }

    var accentColor: String { reel.authorColor }

    /// Élue ET posée (`ReelSwitchWork`, #10354) : la scène, le son, le chrome
    /// actif et le moteur vidéo complet ne s'engagent qu'une fois le
    /// défilement arrêté ; perdre l'élection désengage tout de suite.
    var isEngaged: Bool { ReelSwitchWork.engages(isElected: isActive, isSettled: isSettled) }

    /// Description text for the currently-explored language (Prisme): preferred
    /// by default, the original when the translate toggle is on, or a specific
    /// available translation when a flag is tapped.
    var displayedDescription: String {
        guard let sel = selectedLanguage?.lowercased() else { return servedDescription }
        if sel == reel.originalLanguage?.lowercased() {
            return ReelCaptionMemo.shared.caption(text: reel.content, captions: reel.media.map(\.caption))
        }
        if let t = reel.translations?.first(where: { $0.key.lowercased() == sel })?.value {
            return t.text
        }
        return servedDescription
    }

    /// Un réel publié sans texte montre sa légende de scène (#9179), calculée
    /// une fois par texte servi (#10354).
    private var servedDescription: String {
        ReelCaptionMemo.shared.caption(text: reel.displayContent, captions: reel.media.map(\.caption))
    }

    /// True when this active reel is a video so the scrub bar shows only where
    /// there is a seekable timeline (images/audio reels have none here).
    private var isVideoReel: Bool {
        !isSceneReel && reel.primaryReelDisplayMedia?.type == .video
    }

    /// The audio media for an audio reel, else `nil`. Drives the immersive
    /// transcript hero + the audio control + audio-language flag strip.
    /// `nil` pour un réel COMPOSÉ (#9737) : le son d'une scène est joué par la
    /// scène — la commande audio posée dessus en peignait le spectre et le
    /// faisait jouer une seconde fois par le moteur de la page.
    var audioMedia: FeedMedia? { reel.reelPrincipalAudioMedia }

    /// Piste « son EMPRUNTÉ à la bibliothèque » d'un réel SANS scène ni média :
    /// la page la joue elle-même. Un réel composé en est exclu — sa scène joue
    /// déjà ce fond (#6745) ; la règle vit dans `ReelSceneRouting`.
    var borrowedSoundTrack: StoryAudioPlayerObject? {
        ReelSceneRouting.borrowedSoundTrack(for: reel)
    }

    /// The "original" language for the meta-row flag strip: the audio
    /// transcription language for an audio reel, else the post's original
    /// language. Listed first in the strip.
    var metaOriginalLanguage: String? {
        if let audioMedia { return audioMedia.transcription?.language ?? reel.originalLanguage }
        return reel.originalLanguage
    }

    /// The translation languages for the meta-row flag strip: the translated
    /// audio (TTS) target languages for an audio reel, else the post-body
    /// translation languages.
    var metaTranslationLanguages: [String] {
        if let audioMedia { return audioMedia.translatedAudios.map(\.targetLanguage) }
        return Array(reel.translations?.keys ?? Dictionary<String, PostTranslation>().keys)
    }

    var body: some View {
        ZStack {
            // Tap + long-press attach DIRECTLY to the media, NOT as a separate
            // full-screen `Color.clear` sibling above it. A hit-testing overlay
            // above the media swallowed the touch-down for an image reel's
            // horizontal carousel (whose `ScrollView` lives INSIDE `mediaLayer`,
            // below the overlay), so the carousel could not be swiped.
            //   • Tap (chrome visible)  → toggle play/pause (video reels only).
            //   • Tap (chrome hidden)   → ONLY restore chrome (Story-reader
            //     resume-tap guard).
            //   • Long-press            → enter immersive mode (hide chrome).
            // `.onTapGesture` / `.onLongPressGesture` stay mutually exclusive
            // (tap does not fire after a successful long-press) and, being
            // `.gesture`-based, yield to the child `ScrollView` pans: a horizontal
            // carousel swipe and the vertical reel pager both win once the drag
            // passes the press threshold. All four gestures coexist.
            mediaLayer
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.black)
                .clipped()
                .contentShape(Rectangle())
                .onTapGesture { handleContentTap() }
                .accessibilityAction(named: Text(String(localized: "a11y.main.reel.playPause", bundle: .main))) { handleContentTap() }
                .onLongPressGesture(minimumDuration: 0.3) { enterImmersive() }

            MediaChromeVeil.reelPlayer.gradient
                .ignoresSafeArea()
                .allowsHitTesting(false)

            // **Le seul chemin vers les AUTRES médias d'un réel mixte** (#4927),
            // en points depuis #16321 : un réel dont le carrousel dessine déjà
            // ses points n'en reçoit pas une seconde rangée, ni de compteur.
            if case let .galleryDots(total, currentIndex) = mediaIndicator {
                VStack {
                    HStack {
                        Spacer()
                        ReelMediaGalleryDots(total: total, currentIndex: currentIndex) {
                            HapticFeedback.light()
                            showMediaGallery = true
                        }
                    }
                    Spacer()
                }
                .padding(.top, MeeshySpacing.sm)
                .padding(.trailing, MeeshySpacing.sm)
                .fullscreenChromeVisibility(!chromeHidden)
            }

            VStack {
                Spacer()

                // Audio reel: the play/scrub control sits in the chrome (on top
                // of the transcript hero) just above the author/flags row, so it
                // is tappable and fades in immersive mode. Driven by
                // `selectedLanguage` so a flag tap plays that language's TTS.
                if let audioMedia, isEngaged {
                    ReelAudioControl(
                        media: audioMedia,
                        selectedLanguage: $selectedLanguage,
                        player: audioPlayer,
                        onFullscreen: {
                            audioFullscreen = .fromFeed(
                                media: audioMedia,
                                author: ProfileSheetUser.from(feedPost: reel),
                                originalLanguage: reel.originalLanguage,
                                caption: reel.content,
                                createdAt: reel.timestamp
                            )
                        }
                    )
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.bottom, MeeshySpacing.smPlus)
                }

                HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
                    infoOverlay
                    Spacer(minLength: MeeshySpacing.sm)
                    actionRail
                }
                .padding(.horizontal, MeeshySpacing.lg)
                // Draggable scrub bar — only for the active video reel. Sits
                // just below the description / action rail. Drag to seek.
                if isVideoReel && isEngaged {
                    ReelScrubBar(manager: playerManager, accentColor: accentColor)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.top, MeeshySpacing.mdPlus)
                } else if isSceneReel && isEngaged {
                    ReelSceneProgressBar(clock: sceneClock, accentColor: accentColor)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.top, MeeshySpacing.mdPlus)
                }
            }
            // Sit the description / action rail / scrub lower, closer to the
            // bottom edge (just clearing the home indicator).
            .padding(.bottom, 44)
            // #6693 — la luminance du réel AFFICHÉ commande la lisibilité de l'auteur ;
            // #6704 — chaque glyphe du rail se lit sur SA part du réel, voile compris.
            .mediaChromeScheme(for: .reel(reel, visibleMediaId: visibleCarouselMediaId))
            .mediaChromeRail(for: .reel(reel, visibleMediaId: visibleCarouselMediaId), stage: .reelPlayer)
            // The whole chrome stack (info + rail + scrub) fades out together in
            // immersive mode and stops taking touches so the restoring tap and
            // long-press reach the content zone underneath.
            .fullscreenChromeVisibility(!chromeHidden)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            autoSelectPreferredAudioLanguage()
            startActiveAudioIfNeeded()
        }
        // Cut the previous reel's audio the moment we page away from it (the
        // video engine is left alone — the incoming video reel drives its own).
        // Becoming active (re)starts this reel's audio through the SAME open-
        // autostart gate `ReelVideoView.drive()` uses for the video engine.
        //
        // **La page quittée n'arrête que SON moteur** (#9837). L'élection tombe
        // désormais pendant le geste, et l'ordre des deux `onChange(isActive)`
        // frères n'est pas garanti : `stopAllAudio()` arrêtait aussi le mixer de
        // la scène qui ARRIVE (un lecteur externe), quand elle avait repris la
        // première — le réel suivant restait muet. La vidéo et la scène quittées
        // se mettent en pause par leur propre `isActive`.
        //
        // Le son ne démarre qu'une fois la page POSÉE (#10354) — au milieu du
        // geste, rien ne se charge ; perdre l'élection l'arrête aussitôt.
        .adaptiveOnChange(of: isEngaged) { _, engaged in
            if engaged { startActiveAudioIfNeeded() }
            else { audioPlayer.stop() }
        }
        .onReceive(audioBox.player.$isPlaying.removeDuplicates()) { playing in
            guard playing, isEngaged else { return }
            ReelSwitchSignpost.mediaStarted(reel.id, kind: "audio")
        }
        // The first reel holds on its poster (audio paused) until the liquid
        // reveal completes; start audio when the disc reaches full screen —
        // mirror of `ReelVideoView.drive`'s `revealCompleted` trigger.
        .adaptiveOnChange(of: revealCompleted) { _, _ in startActiveAudioIfNeeded() }
        // F3 — resume this reel's audio when a call ENDS. The call-start (true)
        // edge is paused by `ReelsPlayerView`'s `$callState` subscription, but the
        // in-process WebRTC teardown posts no system interruption-ended, so a reel
        // opened during a call would stay silent. Re-run the open-autostart gate
        // on the false edge (`startActiveAudioIfNeeded` is gated on
        // `!isCallActive` + idempotent on the loaded url). `.receive(on: .main)`
        // so `MediaSessionCoordinator.isCallActive` is already cleared (set in
        // `callState.didSet`) by the time the gate re-checks it.
        .onReceive(
            CallManagerHost.shared.callStatePublisher
                .map(\.isActive)
                .removeDuplicates()
                .receive(on: DispatchQueue.main)
        ) { callActive in
            if !callActive { startActiveAudioIfNeeded() }
        }
        .audioFullscreenCover($audioFullscreen, accentColor: reel.authorColor)
        .fullScreenCover(item: $reelFullscreenPlace) { item in
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: reel.authorColor,
                senderName: reel.author
            )
        }
        // Site UNIQUE de la composition (`socialMediaGallery`) : la sélection des
        // médias, l'auteur servi à chaque page et la LÉGENDE sont les mêmes que
        // sur les trois autres surfaces sociales, parce qu'elles viennent du même
        // endroit.
        .socialMediaGallery(
            post: reel,
            isPresented: $showMediaGallery,
            startMediaId: galleryStartMediaId,
            accentColor: reel.authorColor
        )
    }

    // MARK: Galerie plein écran

    /// Les médias VISUELS du réel — ceux que la galerie sait feuilleter. Un
    /// audio en est exclu : il a son propre plein écran, avec sa transcription.
    private var galleryMedia: [FeedMedia] {
        reel.reelDisplayMedia.filter { $0.type == .image || $0.type == .video }
    }

    /// L'indicateur élu pour ce réel (#16321) : points du carrousel, points
    /// menant à la galerie, ou rien.
    private var mediaIndicator: ReelMediaIndicator {
        ReelMediaIndicator.resolve(isScene: isSceneReel,
                                   primaryType: reel.primaryReelDisplayMedia?.type,
                                   visualCount: galleryMedia.count,
                                   currentIndex: galleryStartIndex)
    }

    /// Le rang du média AFFICHÉ, pour que les points désignent la pièce qui
    /// est à l'écran plutôt que toujours la première.
    private var galleryStartIndex: Int {
        guard let id = galleryStartMediaId,
              let index = galleryMedia.firstIndex(where: { $0.id == id }) else { return 0 }
        return index
    }

    /// Le média par lequel la galerie s'OUVRE : celui qu'on regarde, sinon le
    /// primaire. Des points qui désignent la première pièce pendant qu'on lit la
    /// deuxième image seraient un contrôle qui ment — plus coûteux qu'un contrôle
    /// absent, parce qu'on le croit.
    private var galleryStartMediaId: String? {
        visibleCarouselMediaId ?? reel.primaryReelDisplayMedia?.id
    }

    // MARK: Audio open-autostart (WS3.1)

    /// Single open-autostart gate shared by this reel's audio and video paths:
    /// an active reel starts its media only once the liquid reveal has completed
    /// and no call owns the audio session. `ReelVideoView.drive` encodes the
    /// identical condition for the video engine, so both media kinds start in
    /// lockstep. Backed by the pure `ReelMediaAutostart.shouldStart` truth table.
    private var shouldStartActiveMedia: Bool {
        ReelMediaAutostart.shouldStart(
            isActive: isEngaged,
            revealCompleted: revealCompleted,
            isCallActive: MediaSessionCoordinator.shared.isCallActive
        )
    }

    /// The audio URL to play for the active audio reel, honoring the explored
    /// language (translated TTS) — mirrors `AudioPlayerView.currentAudioUrl`.
    private func resolvedAudioUrl(for media: FeedMedia) -> String {
        if let sel = selectedLanguage?.lowercased(),
           let translated = media.translatedAudios.first(where: { $0.targetLanguage.lowercased() == sel }) {
            return translated.url
        }
        return media.toMessageAttachment().fileUrl
    }

    /// Starts the per-page audio engine for an audio reel on open — the audio
    /// analogue of `ReelVideoView.drive()` (there was none, so audio reels opened
    /// paused). No-ops for non-audio reels, when the open-autostart gate is not
    /// met (inactive / reveal pending / call active), or when the engine is
    /// already loaded with this URL (so a re-render or reveal flip never restarts
    /// it). Uses the SAME play path `AudioPlayerView` uses: `file://` →
    /// `playLocal`, else `play(urlString:)`. `PlaybackCoordinator` keeps a single
    /// audio reel playing (the inactive page's `stopAllAudio()` cuts the previous
    /// one); the `isCallActive` gate keeps the call's audio session intact.
    private func startActiveAudioIfNeeded() {
        guard shouldStartActiveMedia else { return }
        guard let audioMedia else {
            startBorrowedSoundIfNeeded()
            return
        }
        let attachment = audioMedia.toMessageAttachment()
        let url = resolvedAudioUrl(for: audioMedia)
        // F6 — compare against the value the engine WILL store, not the raw url:
        // `playLocal` stores `URL.absoluteString` (normalized), so a raw `file://`
        // string never matches `currentUrl` and the guard would restart on every
        // re-render. Normalize the local case here so the idempotency holds.
        let localURL: URL? = url.hasPrefix("file://") ? URL(string: url) : nil
        let storedUrl = localURL?.absoluteString ?? url
        guard ReelMediaAutostart.shouldLoadAudio(currentUrl: audioPlayer.currentUrl, url: storedUrl) else { return }
        audioPlayer.attachmentId = attachment.id
        if let localURL {
            audioPlayer.playLocal(url: localURL)
        } else {
            audioPlayer.play(urlString: url)
        }
    }

    /// Analogue de la branche `audioMedia` pour un réel « son emprunté seul » :
    /// même moteur (`AudioPlaybackManager`, cache-first + auth), même garde
    /// d'idempotence. `play(urlString:)` stocke la chaîne TELLE QUE PASSÉE dans
    /// `currentUrl` et résout l'URL relative en interne — la comparaison se
    /// fait donc sur la valeur brute de la piste.
    private func startBorrowedSoundIfNeeded() {
        guard let track = borrowedSoundTrack, let url = track.mediaURL, !url.isEmpty else { return }
        guard ReelMediaAutostart.shouldLoadAudio(currentUrl: audioPlayer.currentUrl, url: url) else { return }
        audioPlayer.attachmentId = track.soundId ?? track.id
        audioPlayer.play(urlString: url)
    }

    /// Prisme — for an audio reel, default to the viewer's preferred language if a
    /// translated audio (TTS) exists for it, so the right transcript/audio is
    /// applied automatically. No-op for text/image reels or when no TTS matches
    /// (the user can still tap a flag). Only sets when the viewer has not already
    /// chosen a language.
    private func autoSelectPreferredAudioLanguage() {
        guard selectedLanguage == nil, let audioMedia else { return }
        selectedLanguage = ReelAudioLanguageResolver.preferredAudioLanguage(
            original: metaOriginalLanguage,
            preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
            availableLanguages: audioMedia.translatedAudios.map(\.targetLanguage)
        )
    }

    // MARK: Immersive mode

    /// Long-press confirmed → hide all chrome for distraction-free viewing.
    private func enterImmersive() {
        guard !chromeHidden else { return }
        HapticFeedback.medium()
        withAnimation(.easeInOut(duration: 0.25)) { setChromeHidden(true) }
    }

    /// A tap on the content zone. The FIRST tap while immersed only restores the
    /// chrome — it must NOT also toggle play/pause (Story-reader resume-tap
    /// semantics). Otherwise it's the normal play/pause toggle (video only).
    private func handleContentTap() {
        if chromeHidden {
            withAnimation(.easeInOut(duration: 0.25)) { setChromeHidden(false) }
            return
        }
        if isSceneReel { scenePaused.toggle() }
        if isVideoReel { playerManager.togglePlayPause() }
    }

    // MARK: Media

    @ViewBuilder
    private var mediaLayer: some View {
        if let document = sceneDocument {
            ReelSceneView(reel: reel, document: document, isActive: isEngaged,
                          revealCompleted: revealCompleted, isMuted: sceneSoundMuted,
                          isPaused: $scenePaused, clock: sceneClock)
        } else if let media = reel.primaryReelDisplayMedia {
            switch media.type {
            case .video:
                ReelVideoView(media: media, isActive: isActive, isSettled: isSettled,
                              revealCompleted: revealCompleted,
                              mayDownload: isActive || isWithinPreloadWindow, reelId: reel.id)
            case .image:
                ReelImageView(reel: reel) { visibleCarouselMediaId = $0 }
            case .audio:
                ReelAudioView(media: media, accentColor: accentColor, selectedLanguage: $selectedLanguage, player: audioPlayer)
            default:
                accentBackground
            }
        } else {
            accentBackground
        }
    }

    private var accentBackground: some View {
        LinearGradient(
            colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.4)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: Info overlay (author + description + timestamp + language flags)

    /// True when the signed-in user authored this reel — gates the private reach
    /// stats (impressions + views) shown only to the author.
    var isAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id else { return false }
        return me == reel.authorId
    }

    /// Username, then (AUTHOR ONLY) impressions then views, middle-dot separated:
    /// "@pseudo · 📊 1.2k · 👁 3.4k". Mirrors the feed reel card.
    @ViewBuilder

    // MARK: Action rail

    private var actionRail: some View {
        ReelActionRail(
            viewModel: viewModel,
            reel: reel,
            onComment: onComment, onSend: onSend, onQuote: onQuote, onImager: onImager
        )
    }
}
