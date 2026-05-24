// MARK: - Extracted from ConversationView.swift
import SwiftUI
import UIKit
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Share Sheet
struct ShareSheet: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

// MARK: - Download Badge View (3 states: idle → downloading → cached)
struct DownloadBadgeView: View {
    let attachment: MessageAttachment
    let accentColor: String
    let messageDeliveryStatus: Message.DeliveryStatus
    /// When `true`, the badge renders as a small bottom-right corner pill
    /// instead of a centred 56pt disc. Used for video cells where the
    /// underlying thumbnail already owns the play affordance — the download
    /// signal must NOT mask it, only sit alongside it. Images keep the
    /// default centred layout: their underlying view has no competing
    /// affordance, so the download icon is the clear primary action when
    /// the bytes haven't arrived yet.
    var compact: Bool = false
    var onShareFile: ((URL) -> Void)? = nil

    @StateObject private var downloader = AttachmentDownloader()
    private var accent: Color { Color(hex: accentColor) }

    /// Local optimistic media (a `file://` URL) and messages still in their
    /// optimistic phase (`.sending` / `.invisible`) are already on disk — a
    /// download badge must never appear for them. See Sprint 3 RC3.2.
    var hidesForLocalOrOptimisticMedia: Bool {
        attachment.fileUrl.hasPrefix("file://")
            || messageDeliveryStatus == .sending
            || messageDeliveryStatus == .invisible
    }

    /// Synchronous probe of the in-memory UIImage cache. For an image whose
    /// bytes are already resident (our own confirmed upload — pre-seeded by
    /// RC3.3 — or a previously decoded remote image) this resolves "cached"
    /// within the first render, so the download affordance never flashes over
    /// media we already hold. The async `checkCache` still covers disk-only
    /// hits and the audio / video stores.
    private var isImageAlreadyResident: Bool {
        guard attachment.type == .image else { return false }
        let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
        return DiskCacheStore.cachedImage(for: resolved) != nil
    }

    private var totalSizeText: String {
        if downloader.totalBytes > 0 { return AttachmentDownloader.fmt(downloader.totalBytes) }
        if attachment.fileSize > 0 { return AttachmentDownloader.fmt(Int64(attachment.fileSize)) }
        return ""
    }

    var body: some View {
        Group {
            if hidesForLocalOrOptimisticMedia || isImageAlreadyResident {
                EmptyView()
            } else if downloader.isCached {
                EmptyView()
            } else if downloader.isDownloading {
                downloadingBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            } else {
                idleBadge
                    .transition(.scale(scale: 0.8).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: downloader.isCached)
        .animation(.easeInOut(duration: 0.15), value: downloader.isDownloading)
    }

    private var idleBadge: some View {
        Button {
            downloader.start(attachment: attachment, onShare: onShareFile)
        } label: {
            if compact {
                compactIdleBadge
            } else {
                centredIdleBadge
            }
        }
        .task {
            await downloader.checkCache(attachment)
        }
        .task {
            guard !attachment.fileUrl.hasPrefix("file://") else { return }
            let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString ?? attachment.fileUrl
            while !Task.isCancelled && !downloader.isCached {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { break }
                let cached: Bool
                switch attachment.type {
                case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
                case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
                case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
                case .file, .location: cached = false
                }
                if cached {
                    downloader.isCached = true
                    break
                }
            }
        }
    }

    private var centredIdleBadge: some View {
        VStack(spacing: 6) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 56, height: 56)
                Circle()
                    .fill(accent.opacity(0.85))
                    .frame(width: 48, height: 48)
                Image(systemName: "arrow.down.to.line")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
            }
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)

            if !totalSizeText.isEmpty {
                Text(totalSizeText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(.black.opacity(0.55)))
            }
        }
    }

    private var compactIdleBadge: some View {
        VStack {
            Spacer()
            HStack {
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "arrow.down.to.line")
                        .font(.system(size: 11, weight: .bold))
                    if !totalSizeText.isEmpty {
                        Text(totalSizeText)
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    }
                }
                .foregroundColor(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    Capsule().fill(.ultraThinMaterial)
                        .overlay(Capsule().fill(accent.opacity(0.55)))
                )
                .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
            }
            .padding(.trailing, 6)
            .padding(.bottom, 6)
        }
    }

    private var downloadingBadge: some View {
        Button { downloader.cancel() } label: {
            VStack(spacing: 2) {
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.15), lineWidth: 2.5)
                    Circle()
                        .trim(from: 0, to: downloader.progress)
                        .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .animation(.linear(duration: 0.2), value: downloader.progress)

                    if downloader.progress > 0 {
                        Text("\(Int(downloader.progress * 100))")
                            .font(.system(size: 7, weight: .bold, design: .monospaced))
                            .foregroundColor(.white)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(Color.white)
                            .frame(width: 7, height: 7)
                    }
                }
                .frame(width: 24, height: 24)

                Text("\(AttachmentDownloader.fmt(downloader.downloadedBytes))/\(totalSizeText)")
                    .font(.system(size: 7, weight: .medium, design: .monospaced))
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(5)
            .background(RoundedRectangle(cornerRadius: 8).fill(.black.opacity(0.6)))
        }
        .padding(4)
    }
}

// MARK: - Cached Play Icon (active when media is locally cached, polls until available)
struct CachedPlayIcon: View {
    let fileUrl: String
    @State private var isCached = false

    var body: some View {
        Group {
            if isCached {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 36))
                    .foregroundStyle(.white, Color.black.opacity(0.4))
                    .shadow(color: .black.opacity(0.4), radius: 4, y: 2)
                    .transition(.scale(scale: 0.5).combined(with: .opacity))
            }
        }
        .animation(.easeInOut(duration: 0.15), value: isCached)
        .task {
            let resolved = MeeshyConfig.resolveMediaURL(fileUrl)?.absoluteString ?? fileUrl
            while !Task.isCancelled && !isCached {
                let cached = await CacheCoordinator.shared.video.isCached(resolved)
                if cached {
                    isCached = true
                    break
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
    }
}

// MARK: - Audio Media View (shows placeholder until cached, then full player)
struct AudioMediaView: View, Equatable {
    let attachment: MessageAttachment
    let message: Message
    let contactColor: String
    let visualAttachments: [MessageAttachment]
    let isDark: Bool
    let accentColor: String
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var textTranslations: [MessageTranslation] = []
    var allAudioItems: [ConversationViewModel.AudioItem] = []
    var mentionDisplayNames: [String: String] = [:]
    var onScrollToMessage: ((String) -> Void)?
    var onShareFile: ((URL) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var activeAudioLanguageOverride: String? = nil
    /// Footer descriptor injected by `BubbleStandardLayout` for audio-only
    /// messages — rendered inside the audio widget. `AudioMediaView` folds the
    /// audio-language flags into it (see `audioFooter`), so the footer is a
    /// single unified `BubbleFooter` and is never duplicated below the bubble.
    var footerModel: BubbleFooterModel? = nil
    var footerActions: BubbleFooterActions = .none

    /// Quand non-nil, la citation est rendue dans le topSlot d'AudioPlayerView
    /// (au-dessus de la ligne lecteur, à l'intérieur du même playerBackground).
    /// Activé par `BubbleStandardLayout.audioHostsReply` — voir spec §4.3.
    var replyReference: ReplyReference? = nil
    var replyIsStory: Bool = false
    var parentIsMe: Bool = false
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil

    static func == (lhs: AudioMediaView, rhs: AudioMediaView) -> Bool {
        lhs.attachment.id == rhs.attachment.id
            && lhs.attachment.fileUrl == rhs.attachment.fileUrl
            && lhs.message.id == rhs.message.id
            && lhs.message.deliveryStatus == rhs.message.deliveryStatus
            && lhs.message.updatedAt == rhs.message.updatedAt
            && lhs.isDark == rhs.isDark
            && lhs.accentColor == rhs.accentColor
            && lhs.contactColor == rhs.contactColor
            && lhs.activeAudioLanguageOverride == rhs.activeAudioLanguageOverride
            && lhs.footerModel == rhs.footerModel
            && lhs.replyReference?.messageId == rhs.replyReference?.messageId
            && lhs.replyReference?.previewText == rhs.replyReference?.previewText
            && lhs.replyReference?.attachmentThumbnailUrl == rhs.replyReference?.attachmentThumbnailUrl
            && lhs.replyIsStory == rhs.replyIsStory
            && lhs.parentIsMe == rhs.parentIsMe
    }

    @State private var resolvedAvailability: AudioAvailability = .needsDownload
    @State private var isAudioPlaying = false
    @State private var showAudioFullscreen = false
    @State private var selectedAudioLangCode: String? = nil
    @StateObject private var downloader = AttachmentDownloader()

    /// Disponibilité effective : un téléchargement actif prime, puis un
    /// téléchargement terminé, sinon la résolution « au repos » du `.task`.
    private var availability: AudioAvailability {
        if downloader.isDownloading {
            return .downloading(progress: downloader.progress)
        }
        if downloader.isCached {
            return .ready
        }
        return resolvedAvailability
    }

    /// URL de la langue actuellement sélectionnée (orig ou traduite).
    /// Drives `resolveAvailability` and the auto-DL trigger. Used as the
    /// `.task(id:)` identifier so switching language re-runs availability
    /// resolution and the policy check.
    private var currentAudioUrl: String {
        if let lang = selectedAudioLangCode,
           let translated = translatedAudios.first(where: {
               $0.targetLanguage.lowercased() == lang.lowercased()
           }) {
            return translated.url
        }
        return attachment.fileUrl
    }

    /// MediaKind for the current URL: original = `.audio`, translated =
    /// `.audioTranslation`. Discrimination based on presence in
    /// `translatedAudios` rather than `message.originalLanguage`, which may
    /// differ from the `nil` sentinel used by `selectedAudioLangCode`.
    private var currentMediaKind: MediaKind {
        guard let lang = selectedAudioLangCode,
              translatedAudios.contains(where: { $0.targetLanguage.lowercased() == lang.lowercased() })
        else { return .audio }
        return .audioTranslation
    }

    /// Résout `resolvedAvailability` depuis l'URL courante (langue active).
    /// Ré-exécuté par `.task(id: currentAudioUrl)` quand l'URL bascule
    /// (file:// -> https:// à la réconciliation, ou changement de langue
    /// via `selectedAudioLangCode`).
    private func resolveAvailability() async {
        let urlString = currentAudioUrl
        if urlString.hasPrefix("file://") {
            let exists = FileManager.default.fileExists(
                atPath: URL(string: urlString)?.path ?? ""
            )
            resolvedAvailability = AudioAvailability.resolve(
                isLocalFile: true, localFileExists: exists, isServerCached: false
            )
            return
        }
        let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
        let cached = await CacheCoordinator.shared.audio.isCached(resolved)
        resolvedAvailability = AudioAvailability.resolve(
            isLocalFile: false, localFileExists: false, isServerCached: cached
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            audioPlayer

            if !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && visualAttachments.isEmpty {
                MessageTextRenderer.render(
                    message.content,
                    fontSize: 13,
                    color: isDark ? Color(hex: "818CF8").opacity(0.5) : Color(hex: "6366F1").opacity(0.4),
                    mentionColor: Color(hex: "818CF8"),
                    accentColor: Color(hex: contactColor),
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 4)
                .padding(.top, 2)
                .tint(Color(hex: contactColor))
            }
        }
        .fullScreenCover(isPresented: $showAudioFullscreen) {
            AudioFullscreenView(
                allAudioItems: allAudioItems,
                startAttachmentId: attachment.id,
                contactColor: contactColor,
                mentionDisplayNames: mentionDisplayNames,
                onDismissToMessage: onScrollToMessage
            )
        }
        .adaptiveOnChange(of: activeAudioLanguageOverride) { _, newLang in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                selectedAudioLangCode = newLang
            }
        }
        .task(id: currentAudioUrl) {
            // Reset stale "cached" flag from a previous URL (e.g. previous
            // language) so resolveAvailability drives the truth for the new URL.
            // We never reset mid-download — a running DL belongs to the URL
            // that initiated it and must complete or be cancelled.
            if !downloader.isDownloading {
                downloader.isCached = false
            }
            await resolveAvailability()

            // Auto-DL when policy permits, the new URL isn't cached and no
            // DL is already running. The network condition + preferences are
            // both `@MainActor` singletons, safe to read from this `.task`
            // which inherits the view's MainActor isolation.
            if case .needsDownload = resolvedAvailability, !downloader.isDownloading {
                let condition = NetworkConditionMonitor.shared.condition
                let prefs = MediaDownloadPreferencesStore.shared.preferences
                if MediaDownloadPolicyEngine.shouldAutoDownload(
                    kind: currentMediaKind, condition: condition, prefs: prefs
                ) {
                    triggerCurrentLanguageDownload()
                }
            }
        }
    }

    /// Triggers the download for the currently selected language's URL.
    /// Routes to `startTranslatedAudio` when the URL points to a translated
    /// audio, otherwise the standard attachment download.
    private func triggerCurrentLanguageDownload() {
        if currentMediaKind == .audioTranslation {
            downloader.startTranslatedAudio(url: currentAudioUrl, fileSize: 0)
        } else {
            downloader.start(attachment: attachment, onShare: nil)
        }
    }

    /// The final footer for the audio widget: the injected base model with
    /// the audio-language flags folded in, and `onFlagTap` wired to the audio
    /// language switch. One unified `BubbleFooter` — no separate flag row.
    ///
    /// **Règle** : le contrôleur translate (🌐) est câblé dès qu'un
    /// `onShowTranslationDetail` callback existe — même si aucune traduction
    /// audio n'est encore chargée. L'utilisateur doit pouvoir DEMANDER une
    /// autre langue à tout moment. Les drapeaux affichés à droite reflètent
    /// les variantes effectivement disponibles : la langue originale est
    /// toujours montrée (info), les langues traduites sont ajoutées au fur et
    /// à mesure qu'elles arrivent. La position du 🌐 ne dépend PAS du nombre
    /// de drapeaux (cf. `BubbleFooter.metaLeading`).
    private var audioFooter: (BubbleFooterModel, BubbleFooterActions)? {
        guard var model = footerModel else { return nil }
        var actions = footerActions

        let origCode = message.originalLanguage.lowercased()
        var codes = [origCode]
        for audio in translatedAudios {
            let code = audio.targetLanguage.lowercased()
            if code != origCode, !codes.contains(code) { codes.append(code) }
        }
        let active = (selectedAudioLangCode ?? origCode).lowercased()
        model.flags = codes.map { FooterFlag(code: $0, isActive: $0 == active) }
        model.showsTranslate = !translatedAudios.isEmpty && onShowTranslationDetail != nil

        if !translatedAudios.isEmpty {
            actions.onFlagTap = { code in
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    selectedAudioLangCode = (code == origCode) ? nil : code
                }
                HapticFeedback.light()
            }
        }
        if let detail = onShowTranslationDetail {
            let messageId = message.id
            actions.onTranslate = { detail(messageId) }
        }

        return (model, actions)
    }

    /// Citation rendue dans le topSlot d'`AudioPlayerView` quand le message
    /// est une réponse hébergée par l'audio (`audioHostsReply`).
    @ViewBuilder
    private var replyTopSlot: some View {
        if let ref = replyReference {
            BubbleQuotedReply(
                style: .inline,
                reply: ref,
                parentIsMe: false,
                accentHex: accentColor,
                isDark: isDark,
                mentionDisplayNames: mentionDisplayNames
            )
            .contentShape(Rectangle())
            .onTapGesture {
                guard !ref.messageId.isEmpty else { return }
                HapticFeedback.light()
                if replyIsStory {
                    onStoryReplyTap?(ref.messageId)
                } else {
                    onReplyTap?(ref.messageId)
                }
            }
        }
    }

    /// The playable audio widget. Trois variantes pour préserver la détection
    /// EmptyView du SDK (qui n'opère que sur le défaut littéral, pas sur un
    /// `_ConditionalContent<..., EmptyView>` issu d'un @ViewBuilder interne) :
    /// - reply présent → top (citation) + bottom (footer toujours injecté pour
    ///   `audioHostsReply`, garanti par la matrice du spec §4.4) ;
    /// - reply absent, footer présent → bottom seul (variant A historique) ;
    /// - reply absent, footer absent → aucun slot (variant B historique).
    @ViewBuilder
    private var audioPlayer: some View {
        if replyReference != nil {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() },
                topContent: { replyTopSlot },
                bottomContent: { playerBottomContent }
            )
        } else if footerModel != nil {
            // ⚠ NE PAS utiliser de trailing closure ici. `AudioPlayerView` a
            // DEUX `@ViewBuilder` closure params (topContent + bottomContent)
            // tous deux avec une default value `{ EmptyView() }`. Avec un
            // trailing closure unique non labellisé, Swift le mappe au PREMIER
            // closure param (topContent), pas au dernier — résultat observé :
            // le `BubbleFooter` rendu via `playerBottomContent` apparaissait
            // EN HAUT du player au lieu d'en bas. Passer `bottomContent:` de
            // façon explicite force le routing correct vers `bottomSlot`.
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() },
                bottomContent: { playerBottomContent }
            )
        } else {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: contactColor,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: { showAudioFullscreen = true },
                onRetranscribe: {
                    Task {
                        try? await AttachmentService.shared.requestTranscription(
                            attachmentId: attachment.id, force: true
                        )
                    }
                },
                onPlayingChange: { playing in
                    withAnimation(.easeInOut(duration: 0.2)) { isAudioPlaying = playing }
                },
                externalLanguage: $selectedAudioLangCode,
                availability: availability,
                onDownload: { triggerCurrentLanguageDownload() }
            )
        }
    }

    /// Footer rendered inside the audio widget (`AudioPlayerView.bottomContent`):
    /// a single unified `BubbleFooter` — audio-language flags + translate on
    /// the leading edge, timestamp + delivery pinned trailing.
    @ViewBuilder
    private var playerBottomContent: some View {
        if let (model, actions) = audioFooter {
            BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
                .equatable()
        }
    }

}

// MARK: - Animated Waveform Bar
struct AnimatedWaveformBar: View {
    let index: Int
    let isRecording: Bool
    @State private var barHeight: CGFloat = 8

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: barHeight)
            .onAppear {
                guard isRecording else { return }
                startAnimating()
            }
            .onDisappear {
                withTransaction(Transaction(animation: nil)) {
                    barHeight = minHeight
                }
            }
            .adaptiveOnChange(of: isRecording) { _, recording in
                if recording {
                    startAnimating()
                } else {
                    withAnimation(.easeOut(duration: 0.3)) {
                        barHeight = minHeight
                    }
                }
            }
    }

    private func startAnimating() {
        let randomDuration = Double.random(in: 0.3...0.6)
        let randomDelay = Double(index) * 0.04
        withAnimation(
            .easeInOut(duration: randomDuration)
                .repeatForever(autoreverses: true)
                .delay(randomDelay)
        ) {
            barHeight = CGFloat.random(in: (minHeight + 4)...maxHeight)
        }
    }
}

// MARK: - Audio Level Bar (real microphone levels)
struct AudioLevelBar: View {
    let level: CGFloat // 0-1 normalized
    let isRecording: Bool

    private let minHeight: CGFloat = 6
    private let maxHeight: CGFloat = 26

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color.white.opacity(0.9), Color.white.opacity(0.5)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: isRecording ? minHeight + (maxHeight - minHeight) * level : minHeight)
            .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
    }
}
