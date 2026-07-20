import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Audio Fullscreen Source (surface-agnostic)

/// Ce dont la vue plein écran audio a besoin, DÉCOUPLÉ de `Message` : les
/// conversations, commentaires, posts et réels fournissent tous un audio avec
/// une transcription, des versions traduites (Prisme) et un auteur. Chaque
/// surface construit une `AudioFullscreenSource` depuis son propre modèle
/// (message ou média de feed) — l'expérience plein écran (transcription +
/// bandeau de langues + sauvegarde) est ainsi la même partout.
struct AudioFullscreenSource: Identifiable {
    let id: String                       // attachment.id
    let attachment: MessageAttachment
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let originalLanguage: String
    let caption: String
    let author: ProfileSheetUser
    let createdAt: Date
    /// Renseigné uniquement en conversation — permet de scroller vers le
    /// message d'origine à la fermeture. `nil` pour feed/commentaire/réel/post.
    let messageId: String?

    var authorName: String { author.displayName ?? author.username }
    var authorAvatarURL: String? { author.avatarURL }
    var authorUserId: String { author.userId ?? "" }

    init(id: String,
         attachment: MessageAttachment,
         transcription: MessageTranscription?,
         translatedAudios: [MessageTranslatedAudio],
         originalLanguage: String,
         caption: String,
         author: ProfileSheetUser,
         createdAt: Date,
         messageId: String? = nil) {
        self.id = id
        self.attachment = attachment
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.originalLanguage = originalLanguage
        self.caption = caption
        self.author = author
        self.createdAt = createdAt
        self.messageId = messageId
    }

    /// Chemin conversation : dérive l'auteur et les métadonnées du `Message`.
    init(from item: ConversationViewModel.AudioItem) {
        self.init(
            id: item.id,
            attachment: item.attachment,
            transcription: item.transcription,
            translatedAudios: item.translatedAudios,
            originalLanguage: item.message.originalLanguage,
            caption: item.message.content,
            author: ProfileSheetUser.from(message: item.message),
            createdAt: item.message.createdAt,
            messageId: item.message.id
        )
    }
}

// MARK: - Audio Fullscreen Container (swipe navigation + dismiss)

struct AudioFullscreenView: View {
    let allAudioItems: [AudioFullscreenSource]
    let startAttachmentId: String
    let contactColor: String
    var mentionDisplayNames: [String: String] = [:]
    var onDismissToMessage: ((String) -> Void)?
    /// Fournit l'emoji d'humeur d'un userId (décoration avatar). Optionnel :
    /// la conversation le branche sur son `StatusViewModel` ; le feed passe
    /// `nil`. Permet de présenter cette vue depuis N'IMPORTE quelle surface
    /// sans dépendre d'un `@EnvironmentObject StatusViewModel` (qui crashe à
    /// travers une barrière `fullScreenCover`, cf. lessons).
    var moodEmojiProvider: ((String) -> String?)?
    var moodTapProvider: ((String) -> ((CGPoint) -> Void)?)?

    @Environment(\.dismiss) private var dismiss
    @State private var currentPageID: String?
    @State private var currentIndex: Int = 0
    @State private var dragOffset: CGFloat = 0
    @State private var isDismissing = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if !allAudioItems.isEmpty {
                AdaptiveHorizontalPager(
                    items: allAudioItems,
                    currentPageID: $currentPageID,
                    fillVertical: true
                ) { index, item in
                    AudioFullscreenPage(
                        item: item,
                        contactColor: contactColor,
                        mentionDisplayNames: mentionDisplayNames,
                        isActive: index == currentIndex,
                        pageIndex: index,
                        totalPages: allAudioItems.count,
                        moodEmojiProvider: moodEmojiProvider,
                        moodTapProvider: moodTapProvider,
                        onDismiss: { dismissView() },
                        onDismissToMessage: { messageId in
                            onDismissToMessage?(messageId)
                            dismiss()
                        }
                    )
                }
                .offset(y: dragOffset)
                .gesture(verticalDismissGesture)
                .opacity(isDismissing ? 0 : 1)
                .adaptiveOnChange(of: currentPageID) { _, newID in
                    guard let newID,
                          let newIdx = allAudioItems.firstIndex(where: { $0.id == newID })
                    else { return }
                    if currentIndex != newIdx {
                        currentIndex = newIdx
                        HapticFeedback.light()
                    }
                }
            }
        }
        .statusBarHidden(true)
        .onAppear {
            if let idx = allAudioItems.firstIndex(where: { $0.attachment.id == startAttachmentId }) {
                currentIndex = idx
                currentPageID = allAudioItems[idx].id
            }
        }
        .withStatusBubble()
    }

    // MARK: - Vertical Dismiss Gesture

    private var verticalDismissGesture: some Gesture {
        DragGesture(minimumDistance: 40)
            .onChanged { value in
                let vertical = value.translation.height
                if vertical > 0 {
                    dragOffset = vertical * 0.6
                }
            }
            .onEnded { value in
                if value.translation.height > 120 || value.predictedEndTranslation.height > 300 {
                    dismissDownward()
                } else {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        dragOffset = 0
                    }
                }
            }
    }

    private func dismissDownward() {
        let currentItem = allAudioItems.indices.contains(currentIndex) ? allAudioItems[currentIndex] : nil
        withAnimation(.easeOut(duration: 0.25)) {
            dragOffset = UIScreen.main.bounds.height
            isDismissing = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            if let messageId = currentItem?.messageId {
                onDismissToMessage?(messageId)
            }
            dismiss()
        }
    }

    private func dismissView() {
        dismiss()
    }

}

// MARK: - Audio Fullscreen Page (single audio item)

private struct AudioFullscreenPage: View {
    let item: AudioFullscreenSource
    let contactColor: String
    var mentionDisplayNames: [String: String] = [:]
    let isActive: Bool
    let pageIndex: Int
    let totalPages: Int
    var moodEmojiProvider: ((String) -> String?)?
    var moodTapProvider: ((String) -> ((CGPoint) -> Void)?)?
    var onDismiss: () -> Void
    var onDismissToMessage: ((String) -> Void)?

    @StateObject private var player = AudioPlaybackManager()
    @StateObject private var waveformAnalyzer = AudioWaveformAnalyzer()

    @StateObject private var saveCoordinator = MediaSaveCoordinator()
    @State private var isSeeking = false
    @State private var seekValue: Double = 0
    @State private var selectedLanguage: String = "orig"
    @State private var showTranslationSheet = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var isRequestingTranscription = false
    /// Transcription produite localement (on-device, Apple Speech) quand le
    /// serveur n'en a pas fourni. Fusionnée dans `transcription`.
    @State private var localTranscription: MessageTranscription?
    /// Audios traduits arrivant en direct par socket (demandés depuis la
    /// feuille de traduction). Fusionnés dans `translatedAudios`.
    @State private var extraTranslatedAudios: [MessageTranslatedAudio] = []

    private var attachment: MessageAttachment { item.attachment }

    /// Transcription serveur (item) sinon transcription locale on-device.
    private var transcription: MessageTranscription? { item.transcription ?? localTranscription }

    /// Versions traduites du snapshot + celles arrivées en direct (dédupliquées
    /// par langue cible, le snapshot ayant priorité).
    private var translatedAudios: [MessageTranslatedAudio] {
        guard !extraTranslatedAudios.isEmpty else { return item.translatedAudios }
        var seen = Set(item.translatedAudios.map { $0.targetLanguage.lowercased() })
        var result = item.translatedAudios
        for audio in extraTranslatedAudios where !seen.contains(audio.targetLanguage.lowercased()) {
            result.append(audio)
            seen.insert(audio.targetLanguage.lowercased())
        }
        return result
    }

    /// Message synthétique (contenu vide → chemin audio de la feuille de
    /// traduction) : la feuille de traduction des messages est couplée à
    /// `Message`, mais pour l'audio elle n'a besoin que de l'attachment (id
    /// pour `AttachmentService.translate`), de la langue d'origine et de
    /// l'auteur. Fonctionne pour toutes les surfaces (conv/commentaire/post/réel).
    private var translationMessage: Message {
        Message(
            id: item.messageId ?? item.attachment.id,
            conversationId: "",
            content: "",
            originalLanguage: item.originalLanguage,
            messageType: .audio,
            createdAt: item.createdAt,
            attachments: [item.attachment],
            senderName: item.authorName,
            senderColor: item.author.accentColor,
            senderAvatarURL: item.authorAvatarURL,
            senderUserId: item.authorUserId
        )
    }

    private var accent: Color { Color(hex: contactColor) }
    private let fullscreenSpeeds: [PlaybackSpeed] = [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0]

    private var progress: Double {
        guard player.duration > 0 else { return 0 }
        return isSeeking ? seekValue : player.progress
    }

    private var currentLangColorHex: String {
        if selectedLanguage == "orig" {
            return LanguageDisplay.colorHex(for: item.originalLanguage)
        }
        return LanguageDisplay.colorHex(for: selectedLanguage)
    }

    private var currentLangColor: Color {
        Color(hex: currentLangColorHex)
    }

    private var originalFlag: String {
        LanguageDisplay.from(code: item.originalLanguage)?.flag ?? "\u{1F3B5}"
    }

    private var displaySegments: [TranscriptionDisplaySegment] {
        if selectedLanguage != "orig",
           let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selectedLanguage.lowercased() }),
           !audio.segments.isEmpty {
            return TranscriptionDisplaySegment.buildFrom(segments: audio.segments)
        }
        guard let t = transcription else { return [] }
        let built = TranscriptionDisplaySegment.buildFrom(t)
        if built.isEmpty, !t.text.isEmpty {
            return [TranscriptionDisplaySegment(
                text: t.text,
                startTime: 0,
                endTime: Double(t.durationMs ?? 0) / 1000.0,
                speakerId: nil,
                speakerColor: TranscriptionDisplaySegment.speakerPalette[0]
            )]
        }
        return built
    }

    private var estimatedDuration: TimeInterval {
        let metadata = Double(attachment.duration ?? 0) / 1000.0
        if metadata > 0 { return metadata }
        return player.duration
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            topBar
                .padding(.top, 50)
                .padding(.horizontal, 16)

            Spacer()

            VStack(spacing: 16) {
                waveformSection
                    .padding(.horizontal, 24)

                centerControls

                VStack(spacing: 8) {
                    seekBar.padding(.horizontal, 24)
                    timeRow.padding(.horizontal, 24)
                    speedRow.padding(.horizontal, 24)
                }
            }

            // Caption (texte du message contenant cet audio)
            let captionText = item.caption.trimmingCharacters(in: .whitespacesAndNewlines)
            if !captionText.isEmpty {
                MessageTextRenderer.render(
                    captionText,
                    fontSize: 13,
                    color: .white.opacity(0.8),
                    mentionColor: MeeshyColors.indigo400,
                    accentColor: accent,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .multilineTextAlignment(.leading)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 20)
                .padding(.top, 14)
                .tint(accent)
            }

            // Transcription (capped height)
            if !displaySegments.isEmpty {
                transcriptionSection
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .frame(maxHeight: 120)
            } else {
                transcriptionEmptyState
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .frame(maxHeight: 120)
            }

            // Language strip right below transcription — CHOISIR quelle version
            // écouter (original + versions traduites, Prisme).
            inlineLanguageFlags
                .padding(.horizontal, 16)
                .padding(.top, 10)

            // Author info EN BAS, sous la ligne des langues (l'utilisateur choisit
            // d'abord la version à écouter, l'auteur est une méta secondaire).
            authorInfoRow
                .padding(.horizontal, 20)
                .padding(.top, 14)

            Spacer(minLength: 0)
        }
        .onAppear { if isActive { startPlayback() } }
        .adaptiveOnChange(of: isActive) { _, active in
            if active {
                startPlayback()
            } else {
                player.stop()
            }
        }
        .onDisappear {
            player.stop()
            player.unregisterFromCoordinator()
        }
        .sheet(isPresented: $showTranslationSheet) {
            // LA feuille de traduction des messages (couleurs par langue +
            // boutons Traduire / retraduire), réutilisée pour l'audio :
            // traduit la transcription et génère les voix (Prisme).
            NavigationStack {
                MessageLanguageDetailView(
                    message: translationMessage,
                    contactColor: contactColor,
                    conversationId: "",
                    transcription: transcription,
                    translatedAudios: translatedAudios,
                    onSelectAudioLanguage: { lang in
                        selectLanguage(lang ?? "orig")
                        showTranslationSheet = false
                    }
                )
                .navigationTitle(String(localized: "audio.fullscreen.languages.title", defaultValue: "Langues", bundle: .main))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { showTranslationSheet = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        // Transcription serveur (long-press) : le résultat revient par socket.
        .onReceive(
            MessageSocketManager.shared.transcriptionReady
                .filter { $0.attachmentId == attachment.id }
                .receive(on: DispatchQueue.main)
        ) { event in
            let segments = (event.transcription.segments ?? []).map {
                MessageTranscriptionSegment(text: $0.text, startTime: $0.startTime, endTime: $0.endTime, speakerId: $0.speakerId)
            }
            localTranscription = MessageTranscription(
                attachmentId: event.attachmentId,
                text: event.transcription.text,
                language: event.transcription.language,
                confidence: event.transcription.confidence,
                durationMs: event.transcription.durationMs,
                segments: segments,
                speakerCount: event.transcription.speakerCount
            )
            isRequestingTranscription = false
            HapticFeedback.success()
        }
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
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: moodEmojiProvider?(user.userId ?? ""),
                onMoodTap: moodTapProvider.flatMap { $0(user.userId ?? "") },
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
    }

    private func startPlayback() {
        player.attachmentId = attachment.id
        player.play(urlString: currentAudioUrl)
        loadWaveform()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack(spacing: 12) {
            Button {
                onDismiss()
                HapticFeedback.light()
            } label: {
                // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le libellé porte le sens
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white.opacity(0.2)))
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))

            Spacer()

            HStack(spacing: 6) {
                if totalPages > 1 {
                    Text("\(pageIndex + 1) / \(totalPages)")
                        .font(MeeshyFont.relative(13, weight: .bold, design: .monospaced))
                        .foregroundColor(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Capsule().fill(.ultraThinMaterial.opacity(0.7)))
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.3), value: pageIndex)
                }
                if let dur = attachment.durationFormatted {
                    Text(dur)
                        .font(MeeshyFont.relative(11, weight: .medium, design: .monospaced))
                }
                if let codec = attachment.codec {
                    Text(codec.uppercased())
                        .font(MeeshyFont.relative(10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(Color.white.opacity(0.1)))
                }
            }
            .foregroundColor(.white.opacity(0.5))

            Spacer()

            downloadButton
        }
    }

    // MARK: - Author Info

    private var authorInfoRow: some View {
        let authorColor = item.author.accentColor.isEmpty ? contactColor : item.author.accentColor
        return HStack(spacing: 10) {
            Button {
                selectedProfileUser = item.author
                HapticFeedback.light()
            } label: {
                MeeshyAvatar(
                    name: item.authorName,
                    context: .messageBubble,
                    accentColor: authorColor,
                    avatarURL: item.authorAvatarURL,
                    moodEmoji: item.authorUserId.isEmpty ? nil : moodEmojiProvider?(item.authorUserId),
                    onMoodTap: item.authorUserId.isEmpty ? nil : moodTapProvider.flatMap { $0(item.authorUserId) }
                )
            }

            Button {
                selectedProfileUser = item.author
                HapticFeedback.light()
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.authorName)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)

                    Text(item.createdAt, format: .dateTime.day().month(.abbreviated).hour().minute())
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                }
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: "waveform")
                    .font(MeeshyFont.relative(10))
                    .foregroundColor(.white.opacity(0.4))
                if attachment.fileSize > 0 {
                    Text(attachment.fileSizeFormatted)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(.white.opacity(0.35))
                }
            }
        }
    }

    // MARK: - Download Button

    private var downloadButton: some View {
        Button { requestSave() } label: {
            Group {
                if saveCoordinator.isProcessing {
                    ProgressView().tint(.white)
                } else {
                    Image(systemName: "arrow.down.to.line")
                }
            }
            // Glyphe chrome dans un cadre de tap fixe 36×36 : figé (doctrine 82i) ; le libellé porte le sens
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
            .frame(width: 36, height: 36)
            .background(Circle().fill(Color.white.opacity(0.2)))
        }
        .disabled(saveCoordinator.isProcessing)
        .accessibilityLabel(String(localized: "media.download", defaultValue: "Télécharger", bundle: .main))
        // Composant UNIFIÉ « Enregistrer » : même sheet de destinations que
        // les images, vidéos et documents (issue via toast + haptics).
        .mediaSaveFlow(saveCoordinator)
    }

    private func requestSave() {
        HapticFeedback.light()
        saveCoordinator.requestSave(MediaSaveRequest(
            kind: .audio,
            remoteURLString: currentAudioUrl,
            suggestedFileName: attachment.originalName.isEmpty ? nil : attachment.originalName,
            attachmentId: attachment.id.isEmpty ? nil : attachment.id
        ))
    }

    // MARK: - Waveform Section

    private var waveformSection: some View {
        GeometryReader { geo in
            let barCount = waveformAnalyzer.samples.isEmpty ? 80 : waveformAnalyzer.samples.count
            let barWidth: CGFloat = 3
            let spacing: CGFloat = 2
            let totalWidth = CGFloat(barCount) * (barWidth + spacing) - spacing
            let needsScroll = totalWidth > geo.size.width
            let playheadBarIndex = max(0, min(barCount - 1, Int(progress * Double(barCount))))

            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    ZStack(alignment: .leading) {
                        HStack(spacing: spacing) {
                            ForEach(0..<barCount, id: \.self) { i in
                                let fraction = Double(i) / Double(barCount)
                                let isPlayed = fraction <= progress
                                let sample = waveformAnalyzer.samples.isEmpty
                                    ? fallbackHeight(index: i)
                                    : CGFloat(waveformAnalyzer.samples[i])
                                let height = max(3, sample * geo.size.height * 0.9)
                                let computedWidth = needsScroll
                                    ? barWidth
                                    : max(2, (geo.size.width - spacing * CGFloat(barCount - 1)) / CGFloat(barCount))

                                RoundedRectangle(cornerRadius: 1.5)
                                    .fill(isPlayed ? accent : Color.white.opacity(0.15))
                                    .frame(width: computedWidth, height: height)
                                    .overlay(
                                        needsScroll && i == playheadBarIndex
                                            ? RoundedRectangle(cornerRadius: 1.5)
                                                .fill(Color.white)
                                                .frame(width: 2, height: geo.size.height * 0.95)
                                            : nil
                                    )
                                    .id("bar-\(i)")
                            }
                        }
                        .frame(height: geo.size.height, alignment: .center)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture { location in
                        let contentWidth = needsScroll ? totalWidth : geo.size.width
                        let fraction = max(0, min(1, location.x / contentWidth))
                        player.seek(to: fraction)
                        HapticFeedback.light()
                    }
                }
                .adaptiveOnChange(of: playheadBarIndex) { _, newIdx in
                    guard needsScroll else { return }
                    withAnimation(.linear(duration: 0.2)) {
                        proxy.scrollTo("bar-\(newIdx)", anchor: .center)
                    }
                }
            }
        }
        .frame(height: 80)
        // Decorative visualization + duplicate tap-to-seek affordance: the
        // accessible slider is `seekBar`. Exposing two adjustable scrubbers for
        // the same position would give VoiceOver conflicting controls, so the
        // waveform is hidden from the accessibility tree.
        .accessibilityHidden(true)
    }

    private func fallbackHeight(index: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        return CGFloat(min(1.0, value))
    }

    // MARK: - Center Controls

    private var centerControls: some View {
        // Contrôles de transport média : tailles de glyphes figées pour préserver
        // la cohérence du rang (bouton lecture ancré dans un cercle fixe 64×64) —
        // les libellés VoiceOver portent le sens des boutons icône-seule.
        HStack(spacing: 48) {
            Button {
                player.skip(seconds: -10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "gobackward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }
            .accessibilityLabel(String(localized: "media.skipBack10s", defaultValue: "Reculer de 10 secondes", bundle: .main))

            Button {
                if player.isPlaying || player.progress > 0 {
                    player.togglePlayPause()
                } else {
                    player.play(urlString: currentAudioUrl)
                }
                HapticFeedback.light()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.2))
                        .frame(width: 64, height: 64)

                    if player.isLoading {
                        ProgressView().tint(.white).scaleEffect(0.8)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: player.isPlaying ? 0 : 3)
                    }
                }
            }
            .accessibilityLabel(player.isPlaying
                ? String(localized: "media.pauseAudio", defaultValue: "Mettre en pause", bundle: .main)
                : String(localized: "media.playAudio", defaultValue: "Lire l'audio", bundle: .main))

            Button {
                player.skip(seconds: 10)
                HapticFeedback.light()
            } label: {
                Image(systemName: "goforward.10")
                    .font(.system(size: 28, weight: .semibold))
                    .foregroundColor(.white)
            }
            .accessibilityLabel(String(localized: "media.skipForward10s", defaultValue: "Avancer de 10 secondes", bundle: .main))
        }
    }

    // MARK: - Seek Bar

    private var seekBar: some View {
        GeometryReader { geo in
            let trackHeight: CGFloat = 5
            let thumbSize: CGFloat = 16
            let filledWidth = geo.size.width * progress

            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: trackHeight)

                Capsule()
                    .fill(accent)
                    .frame(width: max(0, filledWidth), height: trackHeight)

                Circle()
                    .fill(Color.white)
                    .frame(width: thumbSize, height: thumbSize)
                    .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                    .offset(x: max(0, min(filledWidth - thumbSize / 2, geo.size.width - thumbSize)))
            }
            .frame(height: max(trackHeight, thumbSize))
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        isSeeking = true
                        seekValue = max(0, min(1, value.location.x / geo.size.width))
                    }
                    .onEnded { value in
                        let fraction = max(0, min(1, value.location.x / geo.size.width))
                        player.seek(to: fraction)
                        isSeeking = false
                        seekValue = 0
                    }
            )
        }
        .frame(height: 16)
        // Custom drag scrubber → expose as a native VoiceOver slider. Without this
        // the playback position lived only in the fill width + thumb offset (a
        // geometry/color channel), and there was no way to seek without sight.
        .accessibilityElement()
        .accessibilityLabel(String(localized: "audio.fullscreen.seek.a11y-label", defaultValue: "Position de lecture", bundle: .main))
        .accessibilityValue(seekPositionAccessibilityValue)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: player.skip(seconds: 10)
            case .decrement: player.skip(seconds: -10)
            @unknown default: break
            }
            HapticFeedback.light()
        }
    }

    /// Spoken position for the scrubber ("0:42 sur 3:15") — mirrors the visible
    /// `timeRow`, following the seek preview while a drag is in flight.
    private var seekPositionAccessibilityValue: String {
        let current = formatMediaDuration(isSeeking ? seekValue * estimatedDuration : player.currentTime)
        let total = formatMediaDuration(estimatedDuration)
        return String(
            localized: "audio.fullscreen.seek.a11y-value",
            defaultValue: "\(current) sur \(total)",
            bundle: .main
        )
    }

    // MARK: - Time Row

    private var timeRow: some View {
        HStack {
            Text(formatMediaDuration(isSeeking ? seekValue * estimatedDuration : player.currentTime))
                .font(MeeshyFont.relative(12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))

            Spacer()

            Text(formatMediaDuration(estimatedDuration))
                .font(MeeshyFont.relative(12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))
        }
    }

    // MARK: - Speed Row

    private var speedRow: some View {
        HStack(spacing: 8) {
            ForEach(fullscreenSpeeds, id: \.rawValue) { speed in
                Button {
                    player.setSpeed(speed)
                } label: {
                    Text(speed.label)
                        .font(MeeshyFont.relative(12, weight: .bold, design: .monospaced))
                        .foregroundColor(player.speed == speed ? .black : .white.opacity(0.7))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(
                            Capsule().fill(
                                player.speed == speed
                                    ? accent
                                    : Color.white.opacity(0.15)
                            )
                        )
                }
                // Selected speed was signalled only by the accent fill + black
                // text (a color-only cue). Name the control and carry the
                // active state via the `.isSelected` trait for VoiceOver.
                .accessibilityLabel(String(
                    localized: "audio.fullscreen.speed.a11y-label",
                    defaultValue: "Vitesse \(speed.label)",
                    bundle: .main
                ))
                .accessibilityAddTraits(player.speed == speed ? .isSelected : [])
            }
        }
    }

    // MARK: - Transcription Section (flexible height, scrollable)

    private var transcriptionSection: some View {
        MediaTranscriptionView(
            segments: displaySegments,
            currentTime: player.currentTime,
            accentColor: currentLangColorHex,
            isPlaying: player.isPlaying,
            progress: player.progress,
            onSeek: { time in
                player.seekToTime(time)
            }
        )
    }

    // MARK: - Transcription Empty State

    private var transcriptionEmptyState: some View {
        VStack(spacing: 14) {
            Spacer(minLength: 0)

            Image(systemName: "text.word.spacing")
                .font(MeeshyFont.relative(28, weight: .light))
                .foregroundColor(.white.opacity(0.25))
                .accessibilityHidden(true)

            Text(String(localized: "audio.fullscreen.transcription.empty", defaultValue: "Aucune transcription", bundle: .main))
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(.white.opacity(0.4))

            // Tap = transcription LOCALE (on-device, instantané, sans réseau).
            // Long-press = menu natif pour transcrire via le SERVEUR (segments
            // horodatés + diarisation + lecture synchronisée).
            Button {
                runLocalTranscription()
            } label: {
                HStack(spacing: 6) {
                    if isRequestingTranscription {
                        ProgressView()
                            .tint(.white)
                            .scaleEffect(0.7)
                    } else {
                        Image(systemName: "waveform.and.mic")
                            .font(MeeshyFont.relative(13, weight: .semibold))
                    }
                    Text(String(localized: "audio.fullscreen.transcription.action", defaultValue: "Transcrire", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .bold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 18)
                .padding(.vertical, 10)
                .background(Capsule().fill(accent.opacity(0.7)))
            }
            .disabled(isRequestingTranscription)
            .contextMenu {
                Button {
                    runLocalTranscription()
                } label: {
                    Label(String(localized: "audio.fullscreen.transcription.local", defaultValue: "Transcrire sur l'appareil", bundle: .main), systemImage: "iphone")
                }
                Button {
                    requestServerTranscription()
                } label: {
                    Label(String(localized: "audio.fullscreen.transcription.server", defaultValue: "Transcrire via le serveur", bundle: .main), systemImage: "cloud")
                }
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
    }

    /// Transcription on-device (Apple Speech via `EdgeTranscriptionService`) —
    /// quand aucune transcription serveur n'est disponible. Instantanée, hors
    /// ligne. Produit des segments horodatés → lecture synchronisée.
    private func runLocalTranscription() {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()
        Task {
            do {
                guard await EdgeTranscriptionService.shared.requestAuthorization() else {
                    await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
                    return
                }
                let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
                guard let localURL = try? await CacheCoordinator.shared.audio.localFileURLOrThrow(for: resolved) else {
                    await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
                    return
                }
                let locale = EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: item.originalLanguage))
                let result = try await EdgeTranscriptionService.shared.transcribe(audioURL: localURL, locale: locale)
                await MainActor.run {
                    let segments = result.segments.map {
                        MessageTranscriptionSegment(
                            text: $0.text,
                            startTime: $0.timestamp,
                            endTime: $0.timestamp + $0.duration,
                            speakerId: nil
                        )
                    }
                    localTranscription = MessageTranscription(
                        attachmentId: attachment.id,
                        text: result.text,
                        language: result.language,
                        confidence: result.confidence,
                        durationMs: Int(estimatedDuration * 1000),
                        segments: segments,
                        speakerCount: nil
                    )
                    isRequestingTranscription = false
                    HapticFeedback.success()
                }
            } catch {
                await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
            }
        }
    }

    /// Transcription SERVEUR (Whisper + diarisation) : produit les segments
    /// horodatés persistés. Le résultat revient par socket (`transcriptionReady`).
    private func requestServerTranscription() {
        guard !isRequestingTranscription else { return }
        isRequestingTranscription = true
        HapticFeedback.light()
        Task {
            do {
                try await AttachmentService.shared.requestTranscription(attachmentId: attachment.id)
                // Le résultat arrive via l'abonnement socket ; garde le spinner
                // le temps du traitement serveur, avec un plafond de sécurité.
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                await MainActor.run { if localTranscription == nil { isRequestingTranscription = false } }
            } catch {
                await MainActor.run { isRequestingTranscription = false; HapticFeedback.error() }
            }
        }
    }

    /// Convertit un événement socket de traduction audio en modèle domaine et
    /// l'ajoute aux versions disponibles (nouveau pill de langue + jouable).
    private func appendTranslatedAudio(from event: AudioTranslationEvent) {
        let info = event.translatedAudio
        let segments = (info.segments ?? []).map {
            MessageTranscriptionSegment(text: $0.text, startTime: $0.startTime, endTime: $0.endTime, speakerId: $0.speakerId)
        }
        let audio = MessageTranslatedAudio(
            id: info.id,
            attachmentId: event.attachmentId,
            targetLanguage: info.targetLanguage,
            url: info.url,
            transcription: info.transcription,
            durationMs: info.durationMs,
            format: info.format,
            cloned: info.cloned,
            quality: info.quality,
            voiceModelId: info.voiceModelId,
            ttsModel: info.ttsModel,
            segments: segments
        )
        if !extraTranslatedAudios.contains(where: { $0.targetLanguage.lowercased() == audio.targetLanguage.lowercased() }) {
            extraTranslatedAudios.append(audio)
            HapticFeedback.light()
        }
    }

    /// Bascule la langue écoutée et lance sa lecture (original ou version TTS).
    private func selectLanguage(_ code: String) {
        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
            selectedLanguage = code
        }
        if code == "orig" {
            player.play(urlString: attachment.fileUrl)
        } else if let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == code.lowercased() }) {
            player.play(urlString: audio.url)
        }
        loadWaveform()
        HapticFeedback.light()
    }

    // MARK: - Inline Language Flags

    private var inlineLanguageFlags: some View {
        // Strip horizontalement scrollable des langues disponibles + bouton
        // "ajouter une langue" ancré à droite (hors du scroll, toujours
        // accessible). Sans ScrollView, les pills wrappaient en 2 lignes
        // ("Fran/çais", "Deu/tsch"…) dès qu'on dépassait 3 langues.
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    languagePill(flag: originalFlag, code: "orig",
                                 label: LanguageDisplay.from(code: item.originalLanguage)?.name ?? String(localized: "audio.fullscreen.language.original", defaultValue: "Original", bundle: .main),
                                 isSelected: selectedLanguage == "orig")

                    ForEach(translatedAudios, id: \.id) { audio in
                        let display = LanguageDisplay.from(code: audio.targetLanguage)
                        languagePill(
                            flag: display?.flag ?? "\u{1F310}",
                            code: audio.targetLanguage,
                            label: display?.name ?? audio.targetLanguage,
                            isSelected: selectedLanguage.lowercased() == audio.targetLanguage.lowercased()
                        )
                    }
                }
                .padding(.horizontal, 2)
            }

            Button {
                showTranslationSheet = true
                HapticFeedback.light()
            } label: {
                // Glyphe dans un cercle de dimension fixe 26×26 : figé (déborderait s'il scalait, doctrine 86i) ; le libellé porte le sens
                Image(systemName: "translate")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(Color.white.opacity(0.08)))
            }
            .accessibilityLabel(String(localized: "audio.fullscreen.language.choose", defaultValue: "Traduire l'audio", bundle: .main))
        }
        .padding(.horizontal, 8)
    }

    private func languagePill(flag: String, code: String, label: String, isSelected: Bool) -> some View {
        let langColor = code == "orig"
            ? Color(hex: LanguageDisplay.colorHex(for: item.originalLanguage))
            : Color(hex: LanguageDisplay.colorHex(for: code))

        return Button {
            selectLanguage(code)
        } label: {
            HStack(spacing: 3) {
                Text(flag).font(MeeshyFont.relative(12))
                Text(label)
                    .font(MeeshyFont.relative(10, weight: isSelected ? .bold : .medium))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .foregroundColor(isSelected ? .white : .white.opacity(0.55))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(isSelected ? langColor.opacity(0.6) : Color.white.opacity(0.07)))
        }
    }

    // MARK: - Helpers

    private var currentAudioUrl: String {
        if selectedLanguage != "orig",
           let audio = translatedAudios.first(where: { $0.targetLanguage.lowercased() == selectedLanguage.lowercased() }) {
            return audio.url
        }
        return attachment.fileUrl
    }

    private func loadWaveform() {
        let url = currentAudioUrl
        let resolved = MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
        Task {
            if let data = try? await CacheCoordinator.shared.audio.data(for: resolved) {
                waveformAnalyzer.analyze(data: data)
            }
        }
    }

}

// MARK: - Feed / Comment / Reel / Post wiring

extension AudioFullscreenSource {
    /// Construit une source plein écran depuis un média audio de feed
    /// (commentaire, post, réel). La transcription et les versions traduites
    /// (Prisme) proviennent du `FeedMedia` ; l'auteur et les métadonnées du
    /// post/commentaire porteur.
    static func fromFeed(media: FeedMedia,
                         author: ProfileSheetUser,
                         originalLanguage: String?,
                         caption: String,
                         createdAt: Date) -> AudioFullscreenSource {
        AudioFullscreenSource(
            id: media.id,
            attachment: media.toMessageAttachment(),
            transcription: media.transcription,
            translatedAudios: media.translatedAudios,
            originalLanguage: originalLanguage ?? "",
            caption: caption,
            author: author,
            createdAt: createdAt,
            messageId: nil
        )
    }
}

extension View {
    /// Présente la vue plein écran audio (transcription + langues Prisme +
    /// sauvegarde) pour une source unique. À attacher sur la surface porteuse
    /// (commentaire, post, réel, feed) ; déclencher en assignant la source via
    /// le callback `onFullscreen` de `AudioPlayerView`.
    func audioFullscreenCover(_ source: Binding<AudioFullscreenSource?>,
                              accentColor: String) -> some View {
        fullScreenCover(item: source) { src in
            AudioFullscreenView(
                allAudioItems: [src],
                startAttachmentId: src.attachment.id,
                contactColor: accentColor
            )
        }
    }
}
