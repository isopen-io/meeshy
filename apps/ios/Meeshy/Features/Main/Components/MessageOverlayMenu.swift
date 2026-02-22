import SwiftUI
import MeeshySDK
import NaturalLanguage

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    let messageBubbleFrame: CGRect
    @Binding var isPresented: Bool
    var onReply: (() -> Void)?
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    var onForward: (() -> Void)?
    var onDelete: (() -> Void)?
    var onReport: (() -> Void)?
    var onPin: (() -> Void)?
    var onReact: ((String) -> Void)?
    var onShowInfo: (() -> Void)?
    var onAddReaction: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isVisible = false
    @State private var menuDragOffset: CGFloat = 0
    @State private var menuDragStartOffset: CGFloat = 0
    @State private var menuExpanded = false
    @State private var selectedInfoTab: InfoTab = .views

    private let compactMenuHeight: CGFloat = 180
    private let expandedMenuHeight: CGFloat = 280

    private let allQuickEmojis = [
        "\u{1F44D}", "\u{2764}\u{FE0F}", "\u{1F602}", "\u{1F525}",
        "\u{1F62E}", "\u{1F622}", "\u{1F64F}", "\u{1F389}",
        "\u{1F60D}", "\u{1F921}", "\u{1F4AF}", "\u{1F44F}",
        "\u{1F62D}", "\u{1F913}", "\u{1F60E}", "\u{1F973}"
    ]

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                dismissBackground

                VStack(spacing: 0) {
                    quickViewArea(in: geometry)
                        .opacity(isVisible ? 1 : 0)
                        .offset(y: isVisible ? 0 : -100)

                    infoTabsSection(in: geometry)
                        .opacity(isVisible ? 1 : 0)
                        .offset(y: isVisible ? 0 : -50)

                    Spacer(minLength: 12)

                    messagePreview
                        .opacity(isVisible ? 1 : 0)
                        .scaleEffect(isVisible ? 0.95 : 0.5)

                    Spacer(minLength: 12)

                    compactActionMenu(in: geometry)
                        .offset(y: isVisible ? 0 : 300)
                }
                .padding(.top, geometry.safeAreaInsets.top + 8)
                .padding(.bottom, geometry.safeAreaInsets.bottom)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                isVisible = true
            }
        }
    }

    // MARK: - Dismiss Background

    private var dismissBackground: some View {
        Color.black
            .opacity(isVisible ? 0.5 : 0)
            .background(.ultraThinMaterial.opacity(isVisible ? 1 : 0))
            .animation(.easeOut(duration: 0.25), value: isVisible)
            .onTapGesture { dismiss() }
    }

    // MARK: - Quick View Area (Compact Emoji Bar)

    @ViewBuilder
    private func quickViewArea(in geometry: GeometryProxy) -> some View {
        let sorted = EmojiUsageTracker.sortedEmojis(from: allQuickEmojis)

        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(sorted, id: \.self) { emoji in
                        Button {
                            EmojiUsageTracker.recordUsage(emoji: emoji)
                            dismissThen { onReact?(emoji) }
                        } label: {
                            Text(emoji)
                                .font(.system(size: 28))
                                .frame(width: 42, height: 42)
                        }
                        .buttonStyle(EmojiButtonStyle())
                    }
                }
                .padding(.horizontal, 12)
            }

            Divider()
                .frame(height: 28)
                .padding(.horizontal, 4)

            Button {
                dismissThen { onAddReaction?() }
            } label: {
                ZStack {
                    Circle()
                        .fill(theme.mode.isDark ? Color.white.opacity(0.15) : Color.gray.opacity(0.15))
                        .frame(width: 34, height: 34)
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(theme.mode.isDark ? .white.opacity(0.7) : .gray)
                }
            }
            .buttonStyle(EmojiButtonStyle())
            .padding(.trailing, 12)
        }
        .frame(height: 52)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.6))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            theme.mode.isDark ? Color.white.opacity(0.15) : Color.black.opacity(0.06),
                            lineWidth: 0.5
                        )
                )
                .shadow(color: .black.opacity(0.2), radius: 12, y: 4)
        )
        .padding(.horizontal, 12)
    }

    // MARK: - Info Tabs Section

    private var availableInfoTabs: [InfoTab] {
        var tabs: [InfoTab] = [.views]
        let hasAudioVideo = message.attachments.contains {
            $0.mimeType.hasPrefix("audio/") || $0.mimeType.hasPrefix("video/")
        }
        if hasAudioVideo {
            tabs.append(.transcription)
        }
        tabs.append(.language)
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        if hasText {
            tabs.append(.sentiment)
        }
        tabs.append(.meta)
        return tabs
    }

    @ViewBuilder
    private func infoTabsSection(in geometry: GeometryProxy) -> some View {
        let visibleTabs = availableInfoTabs

        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(visibleTabs) { tab in
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                selectedInfoTab = tab
                            }
                            HapticFeedback.light()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: tab.icon)
                                    .font(.system(size: 12, weight: .medium))
                                Text(tab.label)
                                    .font(.system(size: 12, weight: .medium))
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(selectedInfoTab == tab
                                          ? Color.accentColor.opacity(0.15)
                                          : Color.clear)
                            )
                            .foregroundColor(selectedInfoTab == tab
                                             ? .accentColor
                                             : theme.textMuted)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }

            ScrollView(showsIndicators: false) {
                Group {
                    switch selectedInfoTab {
                    case .views:
                        viewsTabContent
                    case .transcription:
                        transcriptionTabContent
                    case .language:
                        languageTabContent
                    case .sentiment:
                        sentimentTabContent
                    case .meta:
                        metaTabContent
                    }
                }
                .id(selectedInfoTab)
                .transition(.opacity)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
            }
            .frame(height: 250)
            .animation(.easeInOut(duration: 0.2), value: selectedInfoTab)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.mode.isDark ? Color.black.opacity(0.2) : Color.white.opacity(0.5))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(
                            theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.04),
                            lineWidth: 0.5
                        )
                )
        )
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    // MARK: - Views Tab Content

    private var viewsTabContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 10) {
                let initials = senderInitials(message.senderName)
                let color = Color(hex: message.senderColor ?? contactColor)

                ZStack {
                    Circle()
                        .fill(color.opacity(0.2))
                        .frame(width: 36, height: 36)
                    Text(initials)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(color)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(message.senderName ?? "Inconnu")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text(formatDateFR(message.createdAt))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 12) {
                Text("Statut de livraison")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(theme.textPrimary)

                deliveryStatusRow(
                    icon: "checkmark",
                    label: "Envoyé",
                    timestamp: formatTimeFR(message.createdAt),
                    isReached: deliveryStatusLevel >= 1
                )

                deliveryStatusRow(
                    icon: "checkmark.circle",
                    label: "Distribué",
                    timestamp: nil,
                    isReached: deliveryStatusLevel >= 2
                )

                deliveryStatusRow(
                    icon: "eye",
                    label: "Lu",
                    timestamp: nil,
                    isReached: deliveryStatusLevel >= 3
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func deliveryStatusRow(icon: String, label: String, timestamp: String?, isReached: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(isReached ? .accentColor : theme.textMuted.opacity(0.5))
                .frame(width: 20)

            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isReached ? theme.textPrimary : theme.textMuted.opacity(0.5))

            if let timestamp {
                Spacer()
                Text(timestamp)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
    }

    private var deliveryStatusLevel: Int {
        switch message.deliveryStatus {
        case .failed: return -1
        case .sending: return 0
        case .sent: return 1
        case .delivered: return 2
        case .read: return 3
        }
    }

    // MARK: - Transcription Tab Content

    private var transcriptionTabContent: some View {
        let mediaAttachments = message.attachments.filter {
            $0.mimeType.hasPrefix("audio/") || $0.mimeType.hasPrefix("video/")
        }

        return VStack(alignment: .leading, spacing: 12) {
            ForEach(mediaAttachments) { attachment in
                HStack(spacing: 10) {
                    Image(systemName: attachment.mimeType.hasPrefix("audio/") ? "waveform" : "video")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.accentColor)
                        .frame(width: 20)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)

                        if let duration = attachment.duration {
                            Text(formatDuration(duration))
                                .font(.system(size: 11))
                                .foregroundColor(theme.textMuted)
                        }
                    }

                    Spacer()
                }
                .padding(10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                )
            }

            HStack {
                Spacer()
                VStack(spacing: 6) {
                    Image(systemName: "text.below.photo")
                        .font(.system(size: 24))
                        .foregroundColor(theme.textMuted.opacity(0.5))
                    Text("Transcription non disponible")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.vertical, 20)
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Language Tab Content

    private var languageTabContent: some View {
        let originalLang = message.originalLanguage
        let languages: [(code: String, flag: String, name: String)] = [
            ("fr", "\u{1F1EB}\u{1F1F7}", "Français"),
            ("en", "\u{1F1EC}\u{1F1E7}", "English"),
            ("es", "\u{1F1EA}\u{1F1F8}", "Español"),
            ("de", "\u{1F1E9}\u{1F1EA}", "Deutsch"),
            ("ar", "\u{1F1F8}\u{1F1E6}", "العربية"),
            ("zh", "\u{1F1E8}\u{1F1F3}", "中文"),
            ("pt", "\u{1F1F5}\u{1F1F9}", "Português"),
            ("it", "\u{1F1EE}\u{1F1F9}", "Italiano"),
            ("ja", "\u{1F1EF}\u{1F1F5}", "日本語"),
            ("ko", "\u{1F1F0}\u{1F1F7}", "한국어")
        ]

        let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "globe")
                    .font(.system(size: 12, weight: .medium))
                Text("Langue originale : \(originalLang.uppercased())")
                    .font(.system(size: 13, weight: .semibold))
            }
            .foregroundColor(.accentColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(Color.accentColor.opacity(0.12)))

            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(0..<languages.count, id: \.self) { index in
                    let lang = languages[index]
                    let isOriginal = lang.code == originalLang

                    Button {
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 6) {
                            Text(lang.flag)
                                .font(.system(size: 18))
                            Text(lang.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(theme.mode.isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                        )
                        .opacity(isOriginal ? 0.4 : 1.0)
                    }
                    .disabled(isOriginal)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Sentiment Tab Content

    private var sentimentTabContent: some View {
        let score = analyzeSentiment(message.content)

        return VStack(spacing: 16) {
            Text(sentimentEmoji(score))
                .font(.system(size: 56))

            Text(sentimentLabel(score))
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(
                            LinearGradient(
                                colors: [.red, .orange, .yellow, .green],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(height: 12)

                    let normalized = (score + 1) / 2
                    let position = normalized * geo.size.width

                    Circle()
                        .fill(.white)
                        .frame(width: 18, height: 18)
                        .shadow(color: .black.opacity(0.3), radius: 2, y: 1)
                        .offset(x: max(0, min(position - 9, geo.size.width - 18)))
                }
            }
            .frame(height: 18)
            .padding(.horizontal, 20)

            Text(String(format: "Score : %.2f", score))
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private func analyzeSentiment(_ text: String) -> Double {
        let tagger = NLTagger(tagSchemes: [.sentimentScore])
        tagger.string = text
        let (tag, _) = tagger.tag(at: text.startIndex, unit: .paragraph, scheme: .sentimentScore)
        return Double(tag?.rawValue ?? "0") ?? 0
    }

    private func sentimentEmoji(_ score: Double) -> String {
        if score < -0.6 { return "\u{1F621}" }
        if score < -0.2 { return "\u{1F614}" }
        if score < 0.2 { return "\u{1F610}" }
        if score < 0.6 { return "\u{1F642}" }
        return "\u{1F604}"
    }

    private func sentimentLabel(_ score: Double) -> String {
        if score < -0.6 { return "Très négatif" }
        if score < -0.2 { return "Négatif" }
        if score < 0.2 { return "Neutre" }
        if score < 0.6 { return "Positif" }
        return "Très positif"
    }

    // MARK: - Meta Tab Content

    private var metaTabContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            metaRow(key: "ID", value: String(message.id.prefix(12)))
            metaRow(key: "Type", value: message.messageType.rawValue)
            metaRow(key: "Source", value: message.messageSource.rawValue)
            metaRow(key: "Langue", value: message.originalLanguage.uppercased())
            metaRow(key: "Créé le", value: formatDateTimeFR(message.createdAt))
            metaRow(key: "Modifié le", value: formatDateTimeFR(message.updatedAt))

            metaRow(
                key: "Chiffrement",
                value: message.isEncrypted
                    ? "Oui" + (message.encryptionMode.map { " (\($0))" } ?? "")
                    : "Non"
            )

            if message.isEdited {
                metaRow(key: "État", value: "Modifié", valueColor: .yellow)
            }
            if message.isDeleted {
                metaRow(key: "État", value: "Supprimé", valueColor: .red)
            }

            if !message.attachments.isEmpty {
                let types = Set(message.attachments.map {
                    $0.mimeType.components(separatedBy: "/").first ?? "file"
                })
                metaRow(
                    key: "Pièces jointes",
                    value: "\(message.attachments.count) (\(types.sorted().joined(separator: ", ")))"
                )
            }

            if let forward = message.forwardedFrom {
                Divider()
                Text("Transféré de")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                metaRow(key: "Auteur", value: forward.senderName)
                if let convo = forward.conversationName {
                    metaRow(key: "Conversation", value: convo)
                }
            }

            if let reply = message.replyTo {
                Divider()
                Text("Réponse à")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .textCase(.uppercase)
                metaRow(key: "Auteur", value: reply.authorName)
                metaRow(key: "Aperçu", value: reply.previewText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metaRow(key: String, value: String, valueColor: Color? = nil) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(key)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textMuted)
                .frame(width: 100, alignment: .trailing)

            Text(value)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(valueColor ?? theme.textPrimary)
                .lineLimit(2)

            Spacer()
        }
    }

    // MARK: - Message Preview (CENTER)

    private var messagePreview: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
            if !message.isMe, let name = message.senderName {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Color(hex: message.senderColor ?? contactColor))
            }

            previewContent
        }
        .frame(maxWidth: UIScreen.main.bounds.width * 0.85)
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }

    @ViewBuilder
    private var previewContent: some View {
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let images = message.attachments.filter { $0.mimeType.hasPrefix("image/") }
        let videos = message.attachments.filter { $0.mimeType.hasPrefix("video/") }
        let audios = message.attachments.filter { $0.mimeType.hasPrefix("audio/") }
        let files = message.attachments.filter {
            !$0.mimeType.hasPrefix("image/") &&
            !$0.mimeType.hasPrefix("video/") &&
            !$0.mimeType.hasPrefix("audio/")
        }

        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 8) {
            if !images.isEmpty {
                previewImageGrid(images)
            }

            if !videos.isEmpty {
                previewVideoThumbnails(videos)
            }

            if hasText {
                previewTextBubble
            }

            if !audios.isEmpty {
                ForEach(audios) { audio in
                    previewAudioRow(audio)
                }
            }

            if !files.isEmpty {
                ForEach(files) { file in
                    previewFileRow(file)
                }
            }
        }
    }

    // MARK: - Preview Text Bubble

    private var previewTextBubble: some View {
        let accent = Color(hex: contactColor)
        let isDark = theme.mode.isDark

        return Text(message.content)
            .font(.system(size: 15))
            .foregroundColor(message.isMe ? .white : theme.textPrimary)
            .lineLimit(8)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(
                        message.isMe ?
                        LinearGradient(
                            colors: [accent, accent.opacity(0.8)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ) :
                        LinearGradient(
                            colors: [
                                accent.opacity(isDark ? 0.35 : 0.25),
                                accent.opacity(isDark ? 0.2 : 0.15)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            )
    }

    // MARK: - Preview Image Grid

    @ViewBuilder
    private func previewImageGrid(_ images: [MessageAttachment]) -> some View {
        let maxPreview = Array(images.prefix(4))
        let count = maxPreview.count

        Group {
            if count == 1 {
                previewSingleImage(maxPreview[0])
            } else if count == 2 {
                HStack(spacing: 3) {
                    previewSingleImage(maxPreview[0])
                    previewSingleImage(maxPreview[1])
                }
            } else if count == 3 {
                HStack(spacing: 3) {
                    previewSingleImage(maxPreview[0])
                        .frame(maxHeight: 160)
                    VStack(spacing: 3) {
                        previewSingleImage(maxPreview[1])
                        previewSingleImage(maxPreview[2])
                    }
                }
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 3), GridItem(.flexible(), spacing: 3)], spacing: 3) {
                    ForEach(maxPreview) { img in
                        previewSingleImage(img)
                            .frame(height: 100)
                    }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private func previewSingleImage(_ attachment: MessageAttachment) -> some View {
        let url = attachment.thumbnailUrl ?? attachment.fileUrl
        return CachedAsyncImage(url: url) {
            Color(hex: attachment.thumbnailColor).opacity(0.3)
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 80, maxHeight: 200)
        .clipped()
    }

    // MARK: - Preview Video Thumbnails

    @ViewBuilder
    private func previewVideoThumbnails(_ videos: [MessageAttachment]) -> some View {
        ForEach(videos) { video in
            let thumbUrl = video.thumbnailUrl ?? video.fileUrl
            ZStack {
                CachedAsyncImage(url: thumbUrl) {
                    Color(hex: contactColor).opacity(0.2)
                }
                .aspectRatio(16/9, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: 180)
                .clipped()

                Circle()
                    .fill(.black.opacity(0.5))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "play.fill")
                            .font(.system(size: 18))
                            .foregroundColor(.white)
                            .offset(x: 2)
                    )
            }
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    // MARK: - Preview Audio Row

    private func previewAudioRow(_ attachment: MessageAttachment) -> some View {
        let accent = Color(hex: contactColor)
        let duration = attachment.duration.map { formatDuration($0) } ?? "--:--"

        return HStack(spacing: 10) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.2))
                    .frame(width: 36, height: 36)
                Image(systemName: "waveform")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName.isEmpty ? "Audio" : attachment.originalName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(duration)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Preview File Row

    private func previewFileRow(_ attachment: MessageAttachment) -> some View {
        let accent = Color(hex: contactColor)

        return HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(accent.opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: "doc.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(formatFileSize(attachment.fileSize))
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Compact Action Menu (BOTTOM)

    @ViewBuilder
    private func compactActionMenu(in geometry: GeometryProxy) -> some View {
        let actions = availableActions
        let currentHeight = menuExpanded ? expandedMenuHeight : compactMenuHeight

        VStack(spacing: 0) {
            dragHandle
                .gesture(menuDragGesture)

            ScrollView(showsIndicators: false) {
                actionGrid(actions: actions)
                    .padding(.horizontal, 16)
            }
            .frame(maxHeight: currentHeight - 44)

            cancelButton

            Spacer(minLength: 0)
        }
        .frame(height: currentHeight + 56)
        .background(menuBackground)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
        )
        .padding(.horizontal, 0)
    }

    private var dragHandle: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(theme.textMuted.opacity(0.4))
                .frame(width: 36, height: 4)
                .padding(.vertical, 10)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .onTapGesture {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                menuExpanded.toggle()
            }
            HapticFeedback.light()
        }
    }

    private func actionGrid(actions: [OverlayAction]) -> some View {
        let columns = [
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10),
            GridItem(.flexible(), spacing: 10)
        ]

        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(actions) { action in
                actionButton(action)
            }
        }
        .padding(.bottom, 8)
    }

    private func actionButton(_ action: OverlayAction) -> some View {
        Button {
            dismissThen { action.handler() }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(Color(hex: action.color).opacity(theme.mode.isDark ? 0.2 : 0.12))
                        .frame(width: 44, height: 44)
                    Image(systemName: action.icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: action.color))
                }
                Text(action.label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .contentShape(Rectangle())
        }
        .buttonStyle(ActionButtonStyle())
    }

    private var cancelButton: some View {
        VStack(spacing: 0) {
            Divider()
                .padding(.horizontal, 16)

            Button { dismiss() } label: {
                Text("Annuler")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
        }
    }

    private var menuBackground: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: 20,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: 20
        )
        .fill(.ultraThinMaterial)
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
            .fill(theme.mode.isDark ? Color.black.opacity(0.3) : Color.white.opacity(0.7))
        )
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 20,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 20
            )
            .stroke(
                theme.mode.isDark
                    ? Color.white.opacity(0.12)
                    : Color.black.opacity(0.06),
                lineWidth: 0.5
            )
        )
        .shadow(color: .black.opacity(0.2), radius: 20, y: -4)
    }

    // MARK: - Drag Gesture

    private var menuDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                let translation = value.translation.height
                if translation < -30 && !menuExpanded {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        menuExpanded = true
                    }
                    HapticFeedback.light()
                } else if translation > 30 && menuExpanded {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
                        menuExpanded = false
                    }
                    HapticFeedback.light()
                } else if translation > 60 && !menuExpanded {
                    dismiss()
                }
            }
    }

    // MARK: - Available Actions

    private var availableActions: [OverlayAction] {
        var actions: [OverlayAction] = []

        actions.append(OverlayAction(
            id: "reply",
            icon: "arrowshape.turn.up.left.fill",
            label: "Repondre",
            color: "4ECDC4",
            handler: { onReply?() }
        ))

        let hasTextContent = !message.content.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines).isEmpty
        if hasTextContent {
            actions.append(OverlayAction(
                id: "copy",
                icon: "doc.on.doc.fill",
                label: "Copier",
                color: "9B59B6",
                handler: { onCopy?() }
            ))
        }

        actions.append(OverlayAction(
            id: "forward",
            icon: "arrowshape.turn.up.forward.fill",
            label: "Transferer",
            color: "F8B500",
            handler: { onForward?() }
        ))

        actions.append(OverlayAction(
            id: "pin",
            icon: message.pinnedAt != nil ? "pin.slash.fill" : "pin.fill",
            label: message.pinnedAt != nil ? "Desepingler" : "Epingler",
            color: "3498DB",
            handler: { onPin?() }
        ))

        actions.append(OverlayAction(
            id: "info",
            icon: "info.circle.fill",
            label: "Infos",
            color: "45B7D1",
            handler: { onShowInfo?() }
        ))

        if message.isMe {
            if hasTextContent {
                actions.append(OverlayAction(
                    id: "edit",
                    icon: "pencil",
                    label: "Modifier",
                    color: "F8B500",
                    handler: { onEdit?() }
                ))
            }

            actions.append(OverlayAction(
                id: "delete",
                icon: "trash.fill",
                label: "Supprimer",
                color: "FF6B6B",
                handler: { onDelete?() }
            ))
        } else {
            actions.append(OverlayAction(
                id: "report",
                icon: "exclamationmark.triangle.fill",
                label: "Signaler",
                color: "E74C3C",
                handler: { onReport?() }
            ))
        }

        return actions
    }

    // MARK: - Helpers

    private func senderInitials(_ name: String?) -> String {
        guard let name = name, !name.isEmpty else { return "?" }
        let words = name.components(separatedBy: " ")
        if words.count >= 2 {
            return String(words[0].prefix(1) + words[1].prefix(1)).uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }

    private func formatDateFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    private func formatTimeFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    private func formatDateTimeFR(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        formatter.dateFormat = "dd/MM/yyyy HH:mm"
        return formatter.string(from: date)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let mins = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func formatFileSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        let kb = Double(bytes) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        let mb = kb / 1024
        return String(format: "%.1f MB", mb)
    }

    // MARK: - Dismiss

    private func dismiss() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
        }
    }

    private func dismissThen(_ action: @escaping () -> Void) {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
            isPresented = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                action()
            }
        }
    }
}

// MARK: - InfoTab

private enum InfoTab: String, CaseIterable, Identifiable {
    case views, transcription, language, sentiment, meta

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .views: return "eye.fill"
        case .transcription: return "waveform"
        case .language: return "globe"
        case .sentiment: return "brain.head.profile"
        case .meta: return "info.circle"
        }
    }

    var label: String {
        switch self {
        case .views: return "Vues"
        case .transcription: return "Transcription"
        case .language: return "Langue"
        case .sentiment: return "Sentiment"
        case .meta: return "Meta"
        }
    }
}

// MARK: - Emoji Usage Tracker

struct EmojiUsageTracker {
    private static let key = "com.meeshy.emojiUsageCount"

    static func recordUsage(emoji: String) {
        var counts = getCounts()
        counts[emoji, default: 0] += 1
        UserDefaults.standard.set(counts, forKey: key)
    }

    static func sortedEmojis(from emojis: [String]) -> [String] {
        let counts = getCounts()
        if counts.isEmpty { return emojis }
        return emojis.sorted { (counts[$0] ?? 0) > (counts[$1] ?? 0) }
    }

    private static func getCounts() -> [String: Int] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Int] ?? [:]
    }
}

// MARK: - Overlay Action Model

private struct OverlayAction: Identifiable {
    let id: String
    let icon: String
    let label: String
    let color: String
    let handler: () -> Void
}

// MARK: - Emoji Button Style

private struct EmojiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.35 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.5), value: configuration.isPressed)
    }
}

// MARK: - Action Button Style

private struct ActionButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .opacity(configuration.isPressed ? 0.7 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
