import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Une page du plein écran audio (#10383)

/// **Une page du plein écran audio — un vocal, à la manière des autres
/// visionneuses plein écran.**
///
/// Extraite d'`AudioFullscreenView.swift` (1 191 lignes sur un plafond dur de
/// 1 200) avant la refonte du 2026-10-12 : la règle du dépôt impose d'extraire
/// AVANT d'ajouter. La transcription, les langues et la sauvegarde vivent dans
/// `AudioFullscreenPage+Transcription.swift`.
///
/// Ce qui a changé, et pourquoi :
/// - **le fond suit le thème** (clair, sombre, système) : le noir figé peignait
///   la transcription — qui, elle, suit le thème — en noir sur noir en clair ;
/// - **le chrome est celui des autres visionneuses** — `FullscreenTopBar`, rail
///   d'actions `FullscreenActionRail` à disques `.disc(.adaptive)`, au même
///   rang que la galerie de pièces jointes ;
/// - **il s'efface** quand on écoute et revient au toucher
///   (`FullscreenChromeState`, piloté par le conteneur) : seul reste ce qu'on
///   écoute — l'auteur, l'onde, la transcription.
struct AudioFullscreenPage: View, Equatable {
    let item: AudioFullscreenSource
    let contactColor: String
    var mentionDisplayNames: [String: String] = [:]
    let isActive: Bool
    let pageIndex: Int
    let totalPages: Int
    /// Le chrome est-il à l'écran (le conteneur tient la loi).
    let chromeVisible: Bool
    /// Ce que la page offre de faire de sa pièce (#8916) — `.none` sans hôte.
    let offer: AudioFullscreenOffer
    let isReactionOpen: Bool
    let isReplyOpen: Bool
    /// La suite que le lecteur partagé joue après cette page, dans l'ordre de
    /// réception (`AudioFullscreenSequence.upcoming`).
    let upcomingQueue: () -> [QueuedAudio]
    var moodEmojiProvider: ((String) -> String?)?
    var moodTapProvider: ((String) -> ((CGPoint) -> Void)?)?
    var onDismiss: () -> Void
    var onToggleChrome: () -> Void = {}
    var onChromeInteraction: () -> Void = {}
    var onReact: () -> Void = {}
    var onReply: () -> Void = {}
    var onCompose: () -> Void = {}
    /// Les vocaux voisins dans l'ordre de réception — `nil` aux bords. Offerts
    /// à VoiceOver en actions, en plus du balayage à trois doigts du pager.
    var onNext: (() -> Void)?
    var onPrevious: (() -> Void)?
    /// La page annonce au conteneur la piste qu'ELLE lance : l'écran ne suit
    /// que les pistes que le lecteur choisit seul (#10568).
    var onPlaybackRequested: (String) -> Void = { _ in }

    /// Moteur du coordinator — le plein écran n'a PLUS de moteur propre :
    /// la lecture continue à la fermeture (mini-player) et la carte système
    /// suit. Le repli ne sert qu'aux previews sans coordinator actif.
    ///
    /// **Jamais observé par la page** (#10568) : ce qui bouge avec la lecture
    /// le lit par `playback { }`, et seulement sur la page qu'on regarde.
    let player: AudioPlaybackManager
    @StateObject var waveformAnalyzer = AudioWaveformAnalyzer()

    @StateObject var saveCoordinator = MediaSaveCoordinator()
    @Environment(\.contentExitGate) var exitGate
    @Environment(\.isCaptureShielded) private var isCaptureShielded // #9574 : un son protégé ne part pas sur AirPlay
    @Environment(\.colorScheme) private var colorScheme

    init(item: AudioFullscreenSource,
         contactColor: String,
         mentionDisplayNames: [String: String] = [:],
         isActive: Bool,
         pageIndex: Int,
         totalPages: Int,
         chromeVisible: Bool = true,
         offer: AudioFullscreenOffer = .none,
         isReactionOpen: Bool = false,
         isReplyOpen: Bool = false,
         upcomingQueue: @escaping () -> [QueuedAudio] = { [] },
         moodEmojiProvider: ((String) -> String?)? = nil,
         moodTapProvider: ((String) -> ((CGPoint) -> Void)?)? = nil,
         onDismiss: @escaping () -> Void,
         onToggleChrome: @escaping () -> Void = {},
         onChromeInteraction: @escaping () -> Void = {},
         onReact: @escaping () -> Void = {},
         onReply: @escaping () -> Void = {},
         onCompose: @escaping () -> Void = {},
         onNext: (() -> Void)? = nil,
         onPrevious: (() -> Void)? = nil,
         onPlaybackRequested: @escaping (String) -> Void = { _ in }) {
        self.item = item
        self.contactColor = contactColor
        self.mentionDisplayNames = mentionDisplayNames
        self.isActive = isActive
        self.pageIndex = pageIndex
        self.totalPages = totalPages
        self.chromeVisible = chromeVisible
        self.offer = offer
        self.isReactionOpen = isReactionOpen
        self.isReplyOpen = isReplyOpen
        self.upcomingQueue = upcomingQueue
        self.moodEmojiProvider = moodEmojiProvider
        self.moodTapProvider = moodTapProvider
        self.onDismiss = onDismiss
        self.onToggleChrome = onToggleChrome
        self.onChromeInteraction = onChromeInteraction
        self.onReact = onReact
        self.onReply = onReply
        self.onCompose = onCompose
        self.onNext = onNext
        self.onPrevious = onPrevious
        self.onPlaybackRequested = onPlaybackRequested
        self.player = ConversationAudioCoordinator.sharedForTesting.engineForBubble
            ?? AudioPlaybackManager(registerWithCoordinator: false)
        // Prisme AUDIO (#4926) — la raison de chaque terme est portée par
        // `SocialAudioTrack.fullscreenSelection`, qui est la règle ; ici, le
        // site d'appel n'en garde que l'appel.
        self._selectedLanguage = State(initialValue: SocialAudioTrack.openingSelection(for: item))
    }

    /// La langue de piste servie. Initialisée par le Prisme dans `init` (#4926).
    @State var selectedLanguage: String
    @State var showTranslationSheet = false
    @State var selectedProfileUser: ProfileSheetUser?
    @State var isRequestingTranscription = false
    /// Transcription produite localement (on-device) quand le serveur n'en a
    /// pas fourni. Fusionnée dans `transcription`.
    @State var localTranscription: MessageTranscription?
    /// Audios traduits arrivant en direct par socket (demandés depuis la
    /// feuille de traduction). Fusionnés dans `translatedAudios`.
    @State var extraTranslatedAudios: [MessageTranslatedAudio] = []
    /// La page a déjà été une voisine : elle a été REJOINTE, pas ouverte.
    @State private var wasNeighbour = false
    /// Ce que l'en-tête et le pied recouvrent des paroles, mesuré.
    @State private var headerHeight: CGFloat = 0
    @State private var footerHeight: CGFloat = 0

    /// **Les entrées qui se voient, et rien d'autre.** Les fermetures sont
    /// recréées à chaque évaluation du conteneur ; les comparer ferait refaire
    /// chaque page réalisée à chaque écriture d'état de la racine (leçon 292).
    static func == (lhs: AudioFullscreenPage, rhs: AudioFullscreenPage) -> Bool {
        lhs.item.id == rhs.item.id
            && lhs.item.caption == rhs.item.caption
            && lhs.item.transcription == rhs.item.transcription
            && lhs.item.translatedAudios == rhs.item.translatedAudios
            && lhs.contactColor == rhs.contactColor
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
            && lhs.isActive == rhs.isActive
            && lhs.pageIndex == rhs.pageIndex
            && lhs.totalPages == rhs.totalPages
            && lhs.chromeVisible == rhs.chromeVisible
            && lhs.offer == rhs.offer
            && lhs.isReactionOpen == rhs.isReactionOpen
            && lhs.isReplyOpen == rhs.isReplyOpen
    }

    var attachment: MessageAttachment { item.attachment }
    var isDark: Bool { colorScheme == .dark }
    var accent: Color { Color(hex: contactColor) }

    /// Ce qui bouge avec la lecture se peint ici — et n'observe le moteur que
    /// sur la page active (`AudioFullscreenPlaybackScope`).
    func playback<Content: View>(
        @ViewBuilder _ content: @escaping (AudioFullscreenPlaybackSnapshot, PlaybackSpeed) -> Content
    ) -> some View {
        AudioFullscreenPlaybackScope(player: player, attachmentId: attachment.id, restingDuration: metadataDuration,
                                     isLive: isActive, content: content)
    }

    private var metadataDuration: TimeInterval { Double(attachment.duration ?? 0) / 1000.0 }

    /// Lue au moment d'un geste, jamais pendant un rendu.
    var estimatedDuration: TimeInterval {
        metadataDuration > 0 ? metadataDuration : player.duration
    }

    // MARK: - Body

    var body: some View {
        GeometryReader { proxy in
            let layout = AudioFullscreenLayout.resolve(for: proxy.size)
            ZStack {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture(perform: onToggleChrome)
                    .accessibilityHidden(true)

                Group {
                    switch layout.arrangement {
                    case .stacked:
                        stackedContent(layout, height: proxy.size.height,
                                       bottomInset: AudioFullscreenLayout.bottomInset(safeArea: proxy.safeAreaInsets.bottom))
                    case .sideBySide:
                        VStack(spacing: 0) {
                            topBar
                                .fullscreenChromeVisibility(chromeVisible)
                            sideBySideContent(layout)
                        }
                    }
                }
                .frame(maxWidth: layout.contentMaxWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
        }
        // **La piste part une fois la page POSÉE** (`AudioFullscreenPaging`) :
        // le pager annonce la page à la mi-course du geste, et feuilleter vite
        // annule les pages qu'on ne fait que traverser. Aucun arrêt explicite :
        // le coordinator est partagé, la nouvelle page le re-file.
        .task(id: isActive) {
            guard isActive else {
                wasNeighbour = true
                return
            }
            let delay = AudioFullscreenPaging.playbackDelay(turnedTo: wasNeighbour)
            if delay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                guard !Task.isCancelled else { return }
            }
            startPlayback()
        }
        // Pas de `.onDisappear` : fermer le plein écran laisse la lecture
        // continuer (mini-player + carte système) — le moteur est
        // coordinator-owned, plus cette page (ni stop, ni unregister ici).
        .sheet(isPresented: $showTranslationSheet) { translationSheet }
        .sheet(item: $selectedProfileUser) { user in profileSheet(user) }
        // Transcription serveur (long-press) : le résultat revient par socket.
        .onReceive(
            MessageSocketManager.shared.transcriptionReady
                .filter { $0.attachmentId == attachment.id }
                .receive(on: DispatchQueue.main)
        ) { event in applyServerTranscription(event) }
        // Audios traduits demandés depuis la feuille : arrivent en direct.
        .onReceive(
            MessageSocketManager.shared.audioTranslationReady
                .filter { $0.attachmentId == attachment.id }
                .receive(on: DispatchQueue.main)
        ) { event in appendTranslatedAudio(from: event) }
        .onReceive(
            MessageSocketManager.shared.audioTranslationCompleted
                .filter { $0.attachmentId == attachment.id }
                .receive(on: DispatchQueue.main)
        ) { event in appendTranslatedAudio(from: event) }
    }

    // MARK: - Dispositions

    /// **Les paroles défilent SOUS le reste, en flou, jusqu'à sortir de l'écran**
    /// (directives porteur du 2026-10-13). Elles occupent toute la page ; le
    /// cadran, l'identité et le transport sont posés par-dessus en haut, les
    /// langues en bas, chacun sur un verre qui floute ce qui passe dessous et
    /// se fond dans le texte. Le texte COMMENCE sous le transport (marge du
    /// contenu = hauteur mesurée de l'en-tête), puis remonte derrière lui.
    private func stackedContent(_ layout: AudioFullscreenLayout, height: CGFloat, bottomInset: CGFloat) -> some View {
        let anchor = AudioFullscreenLayout.lyricAnchor(header: headerHeight, footer: footerHeight, height: height)
        return ZStack {
            transcriptBlock(maxHeight: .infinity, fontSize: layout.lyricSize, asLyrics: true,
                            insets: EdgeInsets(top: headerHeight, leading: 0, bottom: footerHeight, trailing: 0),
                            anchor: UnitPoint(x: 0.5, y: anchor))
                // Les paroles s'arrêtent au bord du rail : aucun mot ne passe dessous.
                .padding(.trailing, offer.isEmpty ? 0 : FullscreenChromeMetrics.tapTarget)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            VStack(spacing: 0) {
                VStack(spacing: AudioFullscreenLayout.stackSpacing) {
                    topBar
                        .fullscreenChromeVisibility(chromeVisible)
                    hero(diameter: layout.heroDiameter)
                    identity
                    transport
                        .fullscreenChromeVisibility(chromeVisible)
                }
                .padding(.bottom, MeeshySpacing.xl)
                .frame(maxWidth: .infinity)
                .background { frost(fadingToward: .bottom) }
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { headerHeight = $0 }
                Spacer(minLength: 0)
                captionAndLanguages
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.xl)
                    .padding(.bottom, bottomInset)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { footerHeight = $0 }
            }
            if !offer.isEmpty {
                actionRail
                    .padding(.trailing, MeeshySpacing.lg)
                    .padding(.bottom, footerHeight)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
            }
        }
    }

    /// Le verre qui floute les paroles passant dessous, fondu vers elles ; il
    /// ne capte aucun toucher — on fait défiler le texte à travers lui.
    private func frost(fadingToward edge: VerticalEdge) -> some View {
        Rectangle()
            .fill(.thinMaterial)
            .mask(LinearGradient(
                stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.9), .init(color: .clear, location: 1)],
                startPoint: edge == .bottom ? .top : .bottom,
                endPoint: edge == .bottom ? .bottom : .top
            ))
            .ignoresSafeArea(edges: edge == .bottom ? .top : .bottom)
            .allowsHitTesting(false)
    }

    private func sideBySideContent(_ layout: AudioFullscreenLayout) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.xl) {
            VStack(spacing: MeeshySpacing.sm) {
                hero(diameter: layout.heroDiameter)
                identity
                transport
                    .fullscreenChromeVisibility(chromeVisible)
            }
            .frame(maxWidth: .infinity)
            VStack(spacing: MeeshySpacing.md) {
                transcriptBlock(maxHeight: layout.transcriptMaxHeight, fontSize: layout.lyricSize, asLyrics: false)
                bottomBar
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Top Bar

    private var topBar: some View {
        FullscreenTopBar(tone: .adaptive, onClose: { onDismiss() }) {
            if totalPages > 1 {
                Text("\(pageIndex + 1) / \(totalPages)")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .monospaced))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                    .adaptiveGlass(in: Capsule())
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3), value: pageIndex)
            }
        } trailing: {
            ContentExitGated(contentId: attachment.id) { downloadButton }
        }
    }

    // MARK: - Hero : l'auteur, au centre du cadran

    /// **Le portrait de l'auteur, au centre du spectre de sa voix.** Un vocal
    /// n'a pas d'image : la voix, c'est quelqu'un. Le cadran (`AudioFullscreenDial`)
    /// porte le spectre, la progression et le curseur ; le portrait, dessous,
    /// ouvre le profil.
    private func hero(diameter: CGFloat) -> some View {
        let authorColor = item.author.accentColor.isEmpty ? contactColor : item.author.accentColor
        return ZStack {
            Button {
                selectedProfileUser = item.author
                HapticFeedback.light()
            } label: {
                MeeshyAvatar(
                    name: item.authorName,
                    context: .custom(diameter),
                    accentColor: authorColor,
                    avatarURL: item.authorAvatarURL,
                    moodEmoji: item.authorUserId.isEmpty ? nil : moodEmojiProvider?(item.authorUserId),
                    isDark: isDark,
                    onMoodTap: item.authorUserId.isEmpty ? nil : moodTapProvider.flatMap { $0(item.authorUserId) }
                )
            }
            .buttonStyle(.plain)
            .accessibilityLabel(item.authorName)
            .accessibilityAction(named: Text(String(localized: "feed.carousel.next", defaultValue: "Média suivant", bundle: .main))) {
                onNext?()
            }
            .accessibilityAction(named: Text(String(localized: "feed.carousel.previous", defaultValue: "Média précédent", bundle: .main))) {
                onPrevious?()
            }
            playback { snapshot, _ in
                // Là où part le curseur : la durée totale à gauche de midi, le
                // temps écoulé à droite (directive porteur du 2026-10-13).
                let total = metadataDuration > 0 ? metadataDuration : snapshot.duration
                HStack {
                    Text(formatMediaDuration(total))
                    Spacer(minLength: MeeshySpacing.xxl)
                    Text(formatMediaDuration(snapshot.progress * total))
                }
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .monospaced))
                .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                .frame(width: diameter + AudioFullscreenDialRule.band * 2,
                       height: diameter + AudioFullscreenDialRule.band * 2, alignment: .top)
                .accessibilityElement(children: .combine)
                .allowsHitTesting(false)
            }
            playback { snapshot, _ in
                AudioFullscreenDial(
                    samples: WaveformScale.peakNormalized(waveformAnalyzer.samples),
                    progress: snapshot.progress,
                    isPlaying: snapshot.isPlaying,
                    portraitDiameter: diameter,
                    accent: accent,
                    trackColor: MeeshyColors.textPrimary(isDark: isDark).opacity(isDark ? 0.22 : 0.18),
                    cursorColor: MeeshyColors.textPrimary(isDark: isDark),
                    onSeek: { fraction in
                        onChromeInteraction()
                        player.seek(to: fraction)
                    }
                )
            }
        }
    }

    /// Le nom et la date ; les durées vivent en haut du cadran.
    private var identity: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            Button {
                selectedProfileUser = item.author
                HapticFeedback.light()
            } label: {
                VStack(spacing: MeeshySpacing.xxs) {
                    Text(item.authorName)
                        .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .lineLimit(1)
                    Text(item.createdAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Transport

    private var transport: some View {
        // Glyphes dimensionnés par leur CADRE (`resizable` + `frame`), jamais
        // par une police figée : le cercle de lecture ne grandit pas avec
        // Dynamic Type, son glyphe non plus — les libellés VoiceOver portent
        // le sens des boutons icône-seule.
        HStack(spacing: MeeshySpacing.sm) {
            playback { _, speed in speedChip(speed) }
            transportButton(systemImage: "gobackward.10",
                            label: String(localized: "media.skipBack10s", defaultValue: "Reculer de 10 secondes", bundle: .main)) {
                player.skip(seconds: -10)
            }
            playback { snapshot, _ in playButton(snapshot) }
            transportButton(systemImage: "goforward.10",
                            label: String(localized: "media.skipForward10s", defaultValue: "Avancer de 10 secondes", bundle: .main)) {
                player.skip(seconds: 10)
            }
            airPlay
        }
    }

    private func playButton(_ playback: AudioFullscreenPlaybackSnapshot) -> some View {
        Button {
            onChromeInteraction()
            if player.attachmentId == attachment.id, player.isPlaying || player.progress > 0 {
                player.togglePlayPause()
            } else {
                playThroughCoordinator(urlString: currentAudioUrl)
            }
            HapticFeedback.light()
        } label: {
            ZStack {
                if playback.isLoading {
                    ProgressView().tint(MeeshyColors.textPrimary(isDark: isDark))
                } else {
                    Image(systemName: playback.isPlaying ? "pause.fill" : "play.fill")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 24, height: 24)
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .offset(x: playback.isPlaying ? 0 : 2)
                }
            }
            .frame(width: 56, height: 56)
            .adaptiveGlass(in: Circle(), tint: accent.opacity(0.45), interactive: true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(playback.isPlaying
            ? String(localized: "media.pauseAudio", defaultValue: "Mettre en pause", bundle: .main)
            : String(localized: "media.playAudio", defaultValue: "Lire l'audio", bundle: .main))
    }

    private func transportButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            onChromeInteraction()
            action()
            HapticFeedback.light()
        } label: {
            // Le disque de verre du chrome, celui de la croix et du
            // téléchargement (directive porteur du 2026-10-13).
            FullscreenChromeDisc(systemImage: systemImage, tone: .adaptive)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// Une pastille, un palier par toucher (`AudioFullscreenSpeed`) ; VoiceOver
    /// l'ajuste au balayage vertical.
    private func speedChip(_ speed: PlaybackSpeed) -> some View {
        Button {
            onChromeInteraction()
            player.setSpeed(AudioFullscreenSpeed.next(after: player.speed))
            HapticFeedback.light()
        } label: {
            Text(speed.label)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .padding(.horizontal, MeeshySpacing.sm)
                .frame(minWidth: FullscreenChromeMetrics.discDiameter, minHeight: FullscreenChromeMetrics.discDiameter)
                .adaptiveGlass(in: Capsule(), tint: speed == .x1_0 ? nil : accent.opacity(0.6), interactive: true)
                .frame(minWidth: FullscreenChromeMetrics.tapTarget, minHeight: FullscreenChromeMetrics.tapTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(speed.label)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: player.setSpeed(AudioFullscreenSpeed.next(after: player.speed))
            case .decrement: player.setSpeed(AudioFullscreenSpeed.previous(before: player.speed))
            @unknown default: break
            }
        }
    }

    @ViewBuilder
    private var airPlay: some View {
        if !isCaptureShielded {
            AirPlayRoutePicker(tintColor: UIColor(MeeshyColors.textPrimary(isDark: isDark)),
                               prioritizesVideoDevices: false)
                .frame(width: FullscreenChromeMetrics.discDiameter, height: FullscreenChromeMetrics.discDiameter)
                .adaptiveGlass(in: Circle(), interactive: true)
                .frame(width: FullscreenChromeMetrics.tapTarget, height: FullscreenChromeMetrics.tapTarget)
                .accessibilityLabel(String(localized: "audio.fullscreen.airplay",
                    defaultValue: "Diffuser sur un appareil", bundle: .main))
        } else {
            Color.clear.frame(width: FullscreenChromeMetrics.tapTarget, height: FullscreenChromeMetrics.tapTarget)
        }
    }

    // MARK: - Bas : la légende, les langues, et le rail d'actions

    /// **La géographie de la galerie** : ce qui DIT la pièce à gauche (légende,
    /// langues), ce qu'on en FAIT dans la colonne de droite — Réagir, Répondre,
    /// Créer avec ce média, dans l'ordre de la charte § 6.
    private var bottomBar: some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
            captionAndLanguages
                .frame(maxWidth: .infinity, alignment: .leading)
            if !offer.isEmpty { actionRail }
        }
    }

    /// **Le rail et les langues restent à l'écran** (porteur, 2026-10-13) :
    /// seuls la barre du haut et le transport s'effacent pendant l'écoute. Les
    /// boutons sont NUS — leurs disques de verre, sans plaque derrière.
    private var actionRail: some View {
        FullscreenActionRail { actionButtons }
    }

    private var captionAndLanguages: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            caption
            inlineLanguageFlags
        }
    }

    @ViewBuilder
    private var caption: some View {
        let captionText = item.caption.trimmingCharacters(in: .whitespacesAndNewlines)
        if !captionText.isEmpty {
            MessageTextRenderer.render(
                captionText,
                fontSize: 14,
                color: MeeshyColors.textSecondary(isDark: isDark),
                mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                accentColor: accent,
                mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
            )
            .multilineTextAlignment(.leading)
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
            .tint(accent)
        }
    }

    @ViewBuilder
    private var actionButtons: some View {
        if offer.react {
            FullscreenActionButton.react(
                label: String(localized: "media.react.title", defaultValue: "Réagir", bundle: .main),
                hint: String(localized: "media.react.hint",
                             defaultValue: "Affiche la rangée d'émojis pour réagir à ce média.", bundle: .main),
                style: .disc(.adaptive),
                isOpen: isReactionOpen
            ) {
                HapticFeedback.light()
                onReact()
            }
        }
        if offer.reply {
            FullscreenActionButton.reply(
                label: String(localized: "media.reply.title", defaultValue: "Répondre", bundle: .main),
                hint: String(localized: "media.reply.hint.inPlace",
                             defaultValue: "Ouvre la zone de saisie au-dessus de ce média, en le citant.", bundle: .main),
                style: .disc(.adaptive),
                isOpen: isReplyOpen
            ) {
                HapticFeedback.light()
                onReply()
            }
        }
        if offer.compose {
            FullscreenActionButton(
                systemImage: FullscreenChromeSymbol.compose,
                label: String(localized: "media.compose.title", defaultValue: "Créer avec ce média", bundle: .main),
                hint: String(localized: "media.compose.hint",
                             defaultValue: "Ouvre le composer avec ce média posé.", bundle: .main),
                style: .disc(.adaptive)
            ) {
                HapticFeedback.light()
                onCompose()
            }
        }
    }

    // MARK: - Lecture

    func startPlayback() {
        onPlaybackRequested(attachment.id)
        playThroughCoordinator(urlString: currentAudioUrl)
        loadWaveform()
    }

    /// Route toute lecture démarrée depuis le plein écran vers le coordinator
    /// partagé : si l'attachment est déjà la piste active, seule l'URL change
    /// (variante de langue) — contexte et file survivent. Si une AUTRE page
    /// de la MÊME conversation est déjà en session (swipe entre pages du
    /// pager), `playKeepingQueue` bascule la tête sans rouvrir de session.
    /// Sinon, démarre une nouvelle session.
    ///
    /// **Dans les trois cas, la suite est celle du plein écran** (#10383) :
    /// tous les vocaux reçus après celui-ci, dans l'ordre de réception — la fin
    /// d'un vocal enchaîne donc sur la page voisine. Le conteneur rend la file
    /// de la conversation (les non écoutés) en se refermant.
    func playThroughCoordinator(urlString: String) {
        let coordinator = ConversationAudioCoordinator.sharedForTesting
        let upcoming = upcomingQueue()
        if coordinator.isActive(attachmentId: attachment.id) {
            let translated = urlString != attachment.fileUrl
            if urlString != player.currentUrl {
                coordinator.playVariant(urlString: urlString, language: translated ? selectedLanguage : item.originalLanguage, isTranslated: translated)
            }
            coordinator.replaceUpcoming(upcoming)
            return
        }
        let queued = item.queuedAudio(urlString: urlString)
        if let activeConv = coordinator.activeContext?.conversationId,
           !queued.conversationId.isEmpty, activeConv == queued.conversationId {
            coordinator.playKeepingQueue(queued)
            coordinator.replaceUpcoming(upcoming)
            return
        }
        coordinator.play(
            current: queued,
            tail: upcoming,
            conversationName: item.nowPlayingContextName,
            conversationArtworkURL: item.authorAvatarURL
        )
    }

    func loadWaveform() {
        let url = currentAudioUrl
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        Task {
            if let data = try? await CacheCoordinator.shared.audio.data(for: resolved) {
                waveformAnalyzer.analyze(data: data)
            }
        }
    }
}

// MARK: - Le fond du plein écran audio

/// **Le sol d'un vocal : la surface du thème, éclairée par l'accent de la
/// conversation.** Clair en clair, sombre en sombre — le mode « système » est
/// déjà résolu par l'environnement. Fixe sous le pager : il ne glisse pas avec
/// les pages, comme le sol noir de la galerie.
struct AudioFullscreenBackdrop: View {
    let accentHex: String
    let isDark: Bool

    var body: some View {
        let accent = Color(hex: accentHex)
        GeometryReader { proxy in
            let extent = max(proxy.size.width, proxy.size.height)
            ZStack {
                MeeshyColors.backgroundPrimary(isDark: isDark)
                RadialGradient(colors: [accent.opacity(isDark ? 0.42 : 0.22), .clear],
                               center: UnitPoint(x: 0.5, y: 0.22),
                               startRadius: 0, endRadius: extent * 0.62)
                RadialGradient(colors: [MeeshyColors.indigo500.opacity(isDark ? 0.18 : 0.08), .clear],
                               center: UnitPoint(x: 0.1, y: 1),
                               startRadius: 0, endRadius: extent * 0.55)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
