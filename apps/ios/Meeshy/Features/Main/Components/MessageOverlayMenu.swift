import SwiftUI
import Combine
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    let messageBubbleFrame: CGRect
    @Binding var isPresented: Bool
    var canDelete: Bool = false
    var canEdit: Bool = false
    var onReply: (() -> Void)?
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    var onPin: (() -> Void)?
    var onToggleStar: (() -> Void)?
    var isStarred: Bool = false
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onReact: ((String) -> Void)?
    var onReport: ((String, String?) -> Void)?
    var onDelete: (() -> Void)?
    var onDeleteAttachment: ((String) -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var isVisible = false
    @State private var dragOffset: CGFloat = 0
    @State private var forceTab: DetailTab? = nil
    @State private var isEmojiPickerOpen = false
    // Pilote la cascade gauche→droite de la barre d'emojis : largeur du
    // masque qui se deroule. 0 = strip masquee, 1 = entierement revelee.
    // Anime apres `isVisible` avec un leger delai pour staggerer l'entree.
    @State private var emojiReveal: CGFloat = 0

    private let previewCharLimit = 500
    // Expanded emoji set — far more than fits in the viewport, so the
    // quick reaction strip becomes horizontally scrollable. The first 6
    // are the iMessage-style "popular" defaults (still visible without
    // any scroll); the tail extends with a curated selection so the
    // user always has something to discover when they swipe.
    private let defaultEmojis = [
        "😂", "❤️", "👍", "😮", "😢", "🔥",
        "🎉", "💯", "🥰", "😎", "🙏", "💀",
        "🤣", "✨", "👏", "🤔", "🥺", "😍",
        "🫶", "💪"
    ]

    // Panel takes ~56% of screen, but grid shows 2.5 rows (scrollable)
    // Bottom sheet height — bumped up so two full action rows are
    // visible at rest (was 143 → 195). The pressed bubble preview is
    // still the visual focal point because the previewer floats above
    // the panel with shadow + scale, but the grid no longer feels
    // hidden / "too low". Pull up via the drag handle to expand to the
    // full MessageDetailSheet (translations, full react picker, every
    // action).
    private let gridVisibleHeight: CGFloat = 195

    // Accent couleur de la conversation — sert de teinte de marque pour
    // les lueurs, contours et ombres du chrome de l'overlay (panneau,
    // barre d'emojis). Distinct de `bubbleAccentHex` qui, lui, teinte
    // la bulle previsualisee selon l'expediteur.
    private var overlayAccent: Color { Color(hex: contactColor) }

    // MARK: - Bubble preview helpers (mirror BubbleStandardLayout)

    /// Same blend recipe as `BubbleStandardLayout.otherBubbleColor` so
    /// received-message bubbles keep their blended sender / brand tone
    /// inside the overlay. Sent messages use the brand primary directly.
    private var bubbleAccentHex: String {
        if message.isMe {
            return MeeshyColors.brandPrimaryHex
        }
        let senderHex = message.senderColor ?? contactColor
        return DynamicColorGenerator.blendTwo(
            senderHex,
            weight1: 0.30,
            MeeshyColors.brandPrimaryHex,
            weight2: 0.70
        )
    }

    /// Language flags for the inline meta row (original + each translated
    /// target language, deduped). Capped at 3 to match the legacy bubble
    /// strip. Returning an empty array suppresses the flag cluster.
    private var previewFlags: [String] {
        var seen: Set<String> = []
        var ordered: [String] = []
        let original = message.originalLanguage.lowercased()
        if !original.isEmpty, seen.insert(original).inserted {
            ordered.append(original)
        }
        for translation in textTranslations {
            let code = translation.targetLanguage.lowercased()
            if !code.isEmpty, seen.insert(code).inserted {
                ordered.append(code)
            }
        }
        return Array(ordered.prefix(3))
    }

    /// Aggregated reaction pills, computed from the message's raw
    /// reactions exactly the way `BubbleContent.summarizeReactions`
    /// does for the in-conversation bubble — same emoji order, same
    /// "includesMe" flag — so the preview shows the identical sticker
    /// row the user just long-pressed.
    /// Note: `summarizeReactions` is declared as a static helper inside
    /// the `extension BubbleContent` of `BubbleContentBuilder.swift`,
    /// so the call site uses the value type name, not the file name.
    private var previewReactionSummaries: [ReactionSummary] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return BubbleContent.summarizeReactions(
            message.reactions,
            currentUserId: currentUserId
        )
    }


    var body: some View {
        GeometryReader { geometry in
            let safeTop = geometry.safeAreaInsets.top
            let safeBottom = geometry.safeAreaInsets.bottom
            let screenH = geometry.size.height
            let panelBaseHeight = gridVisibleHeight + safeBottom + 60

            // Drag range: 0 = collapsed (normal), negative = expanded (pull up)
            let maxExpandUp = -(screenH - panelBaseHeight - safeTop - 20)
            let clampedDrag = min(0, max(maxExpandUp, dragOffset))
            let panelHeight = panelBaseHeight - clampedDrag

            ZStack {
                dismissBackground

                VStack(spacing: 10) {
                    // Zone tappable haute — `maxHeight: .infinity` laisse ce
                    // spacer absorber l'espace au-dessus du cluster
                    // bulle+emojis+panneau. Le cluster reste donc ancre vers
                    // le bas, juste au-dessus du panneau ; le preview se
                    // place plus haut (vers la zone des messages reels) que
                    // l'ancien centrage plein ecran. Un tap ici ferme.
                    Color.clear
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .contentShape(Rectangle())
                        .onTapGesture { dismiss() }

                    // Apercu du message — animation composite : zoom-spring
                    // depuis le coin natif de la bulle (haut-droite pour les
                    // messages envoyes, haut-gauche pour les recus) + leger
                    // glissement vertical. La bulle se detache visuellement
                    // de sa rangee, flotte vers l'avant puis se pose. Le
                    // `Spacer(minLength: 44)` du cote oppose colle la bulle
                    // a son bord natif (cf. cap 0.70 dans `messagePreview`).
                    HStack(spacing: 0) {
                        if message.isMe { Spacer(minLength: 44) }
                        messagePreview
                        if !message.isMe { Spacer(minLength: 44) }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 4)
                    .opacity(isVisible ? 1 : 0)
                    .offset(y: isVisible ? 0 : -28)
                    .scaleEffect(
                        isVisible ? 1.0 : 0.86,
                        anchor: message.isMe ? .topTrailing : .topLeading
                    )

                    // Barre d'emojis rapides — meme alignement horizontal
                    // que la bulle. L'entree est decalee (stagger) : le
                    // conteneur apparait apres le preview, puis la cascade
                    // gauche→droite des emojis se joue via le masque
                    // `emojiReveal` (cf. `emojiQuickBar`).
                    HStack(spacing: 0) {
                        if message.isMe { Spacer(minLength: 0) }
                        emojiQuickBar
                        if !message.isMe { Spacer(minLength: 0) }
                    }
                    .padding(.horizontal, 14)
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1.0 : 0.7, anchor: .center)
                    .offset(y: isVisible ? 0 : 18)

                    // Le panneau de detail monte depuis le bas — meme spring
                    // que les autres elements pour qu'ils convergent en un
                    // bloc visuellement lie au repos.
                    detailPanel(safeBottom: safeBottom)
                        .frame(height: panelHeight)
                        .offset(y: isVisible ? 0 : panelBaseHeight + 40)
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            // Entree spring — courbe de reponse de qualite iMessage. Le
            // panneau demarre REPLIE (`dragOffset = 0`) pour laisser le
            // preview de bulle occuper la scene. La cascade d'emojis est
            // declenchee juste apres via un Task differe.
            withAnimation(.spring(response: 0.42, dampingFraction: 0.74)) {
                isVisible = true
                dragOffset = 0
            }
            // Stagger : la cascade gauche→droite des emojis demarre une
            // fois la bulle posee, pour une entree sequencee et lisible.
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 130_000_000)
                withAnimation(.easeOut(duration: 0.34)) {
                    emojiReveal = 1
                }
            }
        }
    }

    // MARK: - Emoji Quick Bar (EmojiReactionPicker — shared component)

    private var emojiQuickBar: some View {
        // Meme composant `QuickReactionBar` que le picker inline du
        // long-press en conversation — garde les deux surfaces
        // identiques. La cascade gauche→droite est obtenue par un masque
        // a gradient dont la largeur revelee suit `emojiReveal` : la
        // frange douce balaye la strip emoji par emoji sans toucher au
        // composant partage. Le chrome (capsule glass + lueur accent)
        // reste fixe — seuls les emojis se devoilent.
        let topEmojis = EmojiUsageTracker.topEmojis(count: 20, defaults: defaultEmojis)
        return QuickReactionBar(
            isDark: isDark,
            quickEmojis: topEmojis,
            onReact: { emoji in
                EmojiUsageTracker.recordUsage(emoji: emoji)
                onReact?(emoji)
                dismiss()
            },
            onExpandFullPicker: {
                HapticFeedback.light()
                isEmojiPickerOpen.toggle()
                forceTab = isEmojiPickerOpen ? .react : .language
            }
        )
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .background(
            Capsule(style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    Capsule(style: .continuous)
                        .fill(isDark ? Color.black.opacity(0.22) : Color.white.opacity(0.55))
                )
                .overlay(
                    Capsule(style: .continuous)
                        .stroke(overlayAccent.opacity(isDark ? 0.32 : 0.20), lineWidth: 0.75)
                )
        )
        .shadow(color: overlayAccent.opacity(isVisible ? 0.22 : 0), radius: 16, y: 6)
        .shadow(color: .black.opacity(isVisible ? 0.16 : 0), radius: 10, y: 3)
        // Masque-cascade : un gradient horizontal dont le bord nuance
        // balaye la barre. La frange douce de 0.12 donne l'illusion que
        // les emojis se materialisent un a un, gauche→droite.
        .mask(
            GeometryReader { proxy in
                LinearGradient(
                    stops: [
                        .init(color: .black, location: 0),
                        .init(color: .black, location: max(0, emojiReveal - 0.12)),
                        .init(color: .clear, location: min(1, emojiReveal))
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
        )
    }

    // MARK: - Dismiss Background (light blur — silhouettes stay readable)

    private var dismissBackground: some View {
        // Flou doux (`thinMaterial`) double d'une voile sombre retenue +
        // une lueur radiale teintee a l'accent de la conversation. Les
        // silhouettes de bulles restent lisibles derriere, mais le texte
        // sous-jacent se floute pour ne pas concurrencer le preview. La
        // lueur indigo/accent ancre l'overlay dans l'identite Meeshy.
        ZStack {
            Rectangle()
                .fill(.thinMaterial)
                .opacity(isVisible ? 1 : 0)

            Color.black
                .opacity(isVisible ? 0.22 : 0)

            RadialGradient(
                colors: [
                    overlayAccent.opacity(isDark ? 0.30 : 0.20),
                    Color.clear
                ],
                center: .bottom,
                startRadius: 12,
                endRadius: 520
            )
            .opacity(isVisible ? 1 : 0)
            .blendMode(isDark ? .screen : .multiply)
        }
        .animation(.easeOut(duration: 0.26), value: isVisible)
        .onTapGesture { dismiss() }
    }

    // MARK: - Message Preview (aligned left/right)

    private var messagePreview: some View {
        VStack(alignment: message.isMe ? .trailing : .leading, spacing: 6) {
            previewSenderHeader

            previewContent
        }
        // Match the in-conversation bubble cap (BubbleStandardLayout
        // uses 0.70 of the screen) so the preview reads as the SAME
        // bubble the user just long-pressed — not a wider clone. The
        // `alignment` parameter pins the (now-compact) content to the
        // bubble's native edge inside the frame, working in tandem
        // with the parent HStack's Spacer(minLength: 44).
        .frame(
            maxWidth: UIScreen.main.bounds.width * 0.70,
            alignment: message.isMe ? .trailing : .leading
        )
        .padding(.horizontal, 8)
        // Halo lumineux ancre a l'accent de la conversation + ombre
        // profonde : le preview semble decolle de la liste, flottant
        // au-dessus du flou. Les deux ombres ne s'allument qu'une fois
        // l'overlay visible pour une apparition propre.
        .shadow(
            color: overlayAccent.opacity(isVisible ? 0.28 : 0),
            radius: 22, y: 4
        )
        .shadow(
            color: .black.opacity(isVisible ? 0.26 : 0),
            radius: 16, y: 10
        )
    }

    private var previewSenderHeader: some View {
        let isMe = message.isMe
        let name = isMe ? "Moi" : (message.senderName ?? "?")
        let color = isMe ? contactColor : (message.senderColor ?? contactColor)

        return HStack(spacing: 6) {
            if !isMe {
                MeeshyAvatar(
                    name: name,
                    context: .recentParticipant,
                    accentColor: color,
                    avatarURL: message.senderAvatarURL
                )
            }

            Text(name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(Color(hex: color))

            Text("·")
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)

            Text(formatExactDate(message.createdAt))
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
    }

    private func formatExactDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "fr_FR")
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            formatter.dateFormat = "HH:mm"
        } else if calendar.isDateInYesterday(date) {
            formatter.dateFormat = "'Hier' HH:mm"
        } else {
            formatter.dateFormat = "dd MMM yyyy HH:mm"
        }
        return formatter.string(from: date)
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
                ForEach(videos) { video in
                    PreviewVideoPlayer(attachment: video, contactColor: contactColor)
                }
            }

            if hasText {
                previewTextBubble
            }

            if !audios.isEmpty {
                ForEach(audios) { audio in
                    PreviewAudioPlayer(attachment: audio, contactColor: contactColor)
                }
            }

            if !files.isEmpty {
                ForEach(files) { file in
                    previewFileRow(file)
                }
            }
        }
        // Reaction stickers float at the same corner as in the live
        // conversation (BubbleStandardLayout L300-304): bottom-trailing
        // for sent, bottom-leading for received, with an 8pt outward
        // padding and a +8 y-offset so they bleed below the bubble
        // edge. The "+" smiley add-button is intentionally suppressed
        // (`isLastReceivedMessage: false`) per the user's "no add-
        // reaction button on the preview" rule — the React-tab CTA
        // lives in the emojiQuickBar's trailing "+" instead.
        // `.allowsHitTesting(false)` keeps the dismiss handler
        // underneath responsive: tapping anywhere on the preview
        // still closes the overlay.
        .overlay(alignment: message.isMe ? .bottomTrailing : .bottomLeading) {
            if !previewReactionSummaries.isEmpty {
                BubbleReactionsOverlay(
                    messageId: message.id,
                    summaries: previewReactionSummaries,
                    isMe: message.isMe,
                    isDark: isDark,
                    isLastReceivedMessage: false,
                    accentHex: bubbleAccentHex,
                    onAddReaction: nil,
                    onToggleReaction: nil,
                    onOpenReactPicker: nil,
                    onShowReactions: nil
                )
                .padding(message.isMe ? .trailing : .leading, 8)
                .offset(y: 8)
                .allowsHitTesting(false)
            }
        }
    }

    // MARK: - Preview Text Bubble (~500 chars)

    /// Mirrors `BubbleStandardLayout.textBubbleContent`: a text payload
    /// stacked above a non-interactive `UserIdentityBar.metaRow` carrying
    /// the language flag cluster (and delivery status for sent messages),
    /// painted with the same `BubbleBackground` recipe so the preview
    /// reads as the SAME bubble the user just long-pressed.
    /// Read-only by construction — `onFlagTap` / `onTranslateTap` are
    /// nil and the row is wrapped in `.allowsHitTesting(false)` so the
    /// metaRow does not steal taps from the dismiss handler.
    private var previewTextBubble: some View {
        let truncated = message.content.count > previewCharLimit
            ? String(message.content.prefix(previewCharLimit)) + "..."
            : message.content
        let hasFlags = !previewFlags.isEmpty
        let showDelivery = message.isMe
        let shouldRenderMeta = hasFlags || showDelivery

        return VStack(alignment: message.isMe ? .trailing : .leading, spacing: 4) {
            Text(truncated)
                .font(.system(size: 15))
                .foregroundColor(message.isMe ? .white : theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, shouldRenderMeta ? 4 : 10)

            if shouldRenderMeta {
                UserIdentityBar.metaRow(
                    time: "",
                    delivery: showDelivery ? message.deliveryStatus : nil,
                    flags: previewFlags,
                    activeFlag: nil,
                    onFlagTap: nil,
                    onTranslateTap: nil,
                    isMe: message.isMe
                )
                .padding(.horizontal, 14)
                .padding(.bottom, 8)
                .allowsHitTesting(false)
            }
        }
        .background(
            BubbleBackground(
                isMe: message.isMe,
                accentHex: bubbleAccentHex,
                isDark: isDark
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        // Liseré subtil a la teinte de la bulle — donne du relief au
        // preview flottant sans alourdir la lecture.
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(
                    Color(hex: bubbleAccentHex).opacity(message.isMe ? 0.0 : 0.18),
                    lineWidth: 0.75
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
        let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
        let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
        return ProgressiveCachedImage(
            thumbHash: attachment.thumbHash,
            thumbnailUrl: thumbUrl,
            fullUrl: fullUrl ?? thumbUrl
        ) {
            Color(hex: attachment.thumbnailColor).opacity(0.3)
        }
        .aspectRatio(contentMode: .fill)
        .frame(maxWidth: .infinity, minHeight: 80, maxHeight: 200)
        .clipped()
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
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    // MARK: - Detail Panel (scrollable grid, 2.5 rows visible)

    private func detailPanel(safeBottom: CGFloat) -> some View {
        VStack(spacing: 0) {
            panelDragHandle

            // Scrollable grid showing ~2.5 rows
            ScrollView(.vertical, showsIndicators: false) {
                MessageDetailSheet(
                    message: message,
                    contactColor: contactColor,
                    conversationId: conversationId,
                    initialTab: .language,
                    canDelete: canDelete,
                    actions: overlayActions,
                    textTranslations: textTranslations,
                    transcription: transcription,
                    translatedAudios: translatedAudios,
                    onSelectTranslation: onSelectTranslation,
                    onSelectAudioLanguage: onSelectAudioLanguage,
                    onRequestTranslation: onRequestTranslation,
                    onDismissAction: { dismiss() },
                    onReact: { emoji in onReact?(emoji) },
                    onReport: { type, reason in onReport?(type, reason) },
                    onDelete: { onDelete?() },
                    externalTabSelection: $forceTab
                )
            }

            Spacer(minLength: safeBottom)
        }
        .background(panelBackground)
        .clipShape(
            UnevenRoundedRectangle(
                topLeadingRadius: 26,
                bottomLeadingRadius: 0,
                bottomTrailingRadius: 0,
                topTrailingRadius: 26,
                style: .continuous
            )
        )
        .gesture(panelDragGesture)
    }

    private var panelDragHandle: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(overlayAccent.opacity(0.45))
                .frame(width: 40, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 5)
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
    }

    private var panelDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                withAnimation(.interactiveSpring()) {
                    dragOffset = value.translation.height
                }
            }
            .onEnded { value in
                let velocity = value.predictedEndTranslation.height - value.translation.height
                withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                    if value.translation.height < -80 || velocity < -200 {
                        // Expanded: pull up to max
                        dragOffset = -400
                    } else if value.translation.height > 80 || velocity > 200 {
                        // Collapsed: push down to normal
                        dragOffset = 0
                    } else {
                        // Snap back
                        dragOffset = dragOffset < -100 ? -400 : 0
                    }
                }
            }
    }

    private var panelBackground: some View {
        // Chrome verre du panneau : `.ultraThinMaterial` + voile de
        // tonalite, liseré accent en haut et lueur de marque douce. Les
        // coins continus (26pt) et l'ombre montante donnent l'illusion
        // d'une feuille qui monte depuis le bas de l'ecran.
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: 26,
            bottomLeadingRadius: 0,
            bottomTrailingRadius: 0,
            topTrailingRadius: 26,
            style: .continuous
        )
        return shape
            .fill(.ultraThinMaterial)
            .overlay(
                shape.fill(isDark ? Color.black.opacity(0.30) : Color.white.opacity(0.72))
            )
            .overlay(
                shape.fill(
                    LinearGradient(
                        colors: [
                            overlayAccent.opacity(isDark ? 0.16 : 0.10),
                            Color.clear
                        ],
                        startPoint: .top,
                        endPoint: .center
                    )
                )
            )
            .overlay(
                shape.stroke(
                    LinearGradient(
                        colors: [
                            overlayAccent.opacity(isDark ? 0.40 : 0.26),
                            (isDark ? Color.white : Color.black).opacity(isDark ? 0.10 : 0.05)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.75
                )
            )
            .shadow(color: overlayAccent.opacity(0.20), radius: 26, y: -6)
            .shadow(color: .black.opacity(0.22), radius: 20, y: -4)
    }

    // MARK: - Quick Actions for Grid

    private var overlayActions: [MessageAction] {
        var actions: [MessageAction] = []
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty

        actions.append(MessageAction(
            id: "reply", icon: "arrowshape.turn.up.left.fill",
            label: "Repondre", color: "4ECDC4",
            handler: { dismissThen { onReply?() } }
        ))

        if hasText {
            actions.append(MessageAction(
                id: "copy", icon: "doc.on.doc.fill",
                label: "Copier", color: "9B59B6",
                handler: { dismissThen { onCopy?() } }
            ))
        }

        actions.append(MessageAction(
            id: "pin",
            icon: message.pinnedAt != nil ? "pin.slash.fill" : "pin.fill",
            label: message.pinnedAt != nil ? "Desepingler" : "Epingler",
            color: "3498DB",
            handler: { dismissThen { onPin?() } }
        ))

        // Star / bookmark — local-only favourite list (see StarredMessagesView).
        actions.append(MessageAction(
            id: "star",
            icon: isStarred ? "star.slash.fill" : "star.fill",
            label: isStarred ? "Retirer des favoris" : "Ajouter aux favoris",
            color: "FBBF24",
            handler: { dismissThen { onToggleStar?() } }
        ))

        if canEdit && hasText {
            actions.append(MessageAction(
                id: "edit", icon: "pencil",
                label: "Modifier", color: "F8B500",
                handler: { dismissThen { onEdit?() } }
            ))
        }

        if canDelete && !message.attachments.isEmpty, let onDeleteAttachment {
            if message.attachments.count == 1 {
                let attId = message.attachments[0].id
                actions.append(MessageAction(
                    id: "deleteAttachment", icon: "paperclip.badge.ellipsis",
                    label: "Supprimer le media", color: "F87171",
                    handler: { dismissThen { onDeleteAttachment(attId) } }
                ))
            }
        }

        return actions
    }

    // MARK: - Helpers

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
        // Sortie symetrique de l'entree : la cascade emoji se replie
        // d'abord (droite→gauche via le masque), puis tout l'overlay se
        // retracte vers le coin natif de la bulle.
        withAnimation(.easeIn(duration: 0.16)) {
            emojiReveal = 0
        }
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            isPresented = false
        }
    }

    private func dismissThen(_ action: @escaping () -> Void) {
        HapticFeedback.light()
        withAnimation(.easeIn(duration: 0.16)) {
            emojiReveal = 0
        }
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            isPresented = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                action()
            }
        }
    }
}

// MARK: - Preview Audio Player (interactive)

private struct PreviewAudioPlayer: View {
    let attachment: MessageAttachment
    let contactColor: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var player = OverlayAudioPlayer()

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 10) {
                Button { player.toggle(url: attachment.fileUrl) } label: {
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.2))
                            .frame(width: 40, height: 40)
                        if player.isLoading {
                            ProgressView()
                                .tint(accent)
                                .scaleEffect(0.6)
                        } else {
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(accent)
                        }
                    }
                }
                .buttonStyle(.plain)

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.originalName.isEmpty ? "Audio" : attachment.originalName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text(player.timeLabel(totalDuration: attachment.duration))
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()
                }

                Spacer()

                Menu {
                    ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                        Button {
                            player.setRate(Float(rate))
                        } label: {
                            HStack {
                                Text(rate == 1.0 ? "Normal" : "\(String(format: "%.2g", rate))x")
                                if abs(Double(player.playbackRate) - rate) < 0.01 {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Text("\(String(format: "%.2g", player.playbackRate))x")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(accent.opacity(0.12)))
                }
            }

            HStack(spacing: 8) {
                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Slider(
                    value: Binding(
                        get: { player.progress },
                        set: { player.seek(to: $0) }
                    ),
                    in: 0...1
                )
                .tint(accent)

                // Pourcentage d'avancement
                Text("\(player.percentInt)%")
                    .font(.system(size: 11, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 36)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
        .onDisappear { player.stop() }
    }
}

// MARK: - Preview Video Player (interactive)

private struct PreviewVideoPlayer: View {
    let attachment: MessageAttachment
    let contactColor: String

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @StateObject private var player = OverlayAudioPlayer()
    @State private var showThumbnail = true

    private var accent: Color { Color(hex: contactColor) }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
                let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
                ProgressiveCachedImage(
                    thumbHash: attachment.thumbHash,
                    thumbnailUrl: thumbUrl,
                    fullUrl: fullUrl ?? thumbUrl
                ) {
                    Color(hex: contactColor).opacity(0.2)
                }
                .aspectRatio(16/9, contentMode: .fill)
                .frame(maxWidth: .infinity, maxHeight: 200)
                .clipped()

                if showThumbnail {
                    Button {
                        showThumbnail = false
                        player.toggle(url: attachment.fileUrl)
                    } label: {
                        Circle()
                            .fill(.black.opacity(0.5))
                            .frame(width: 52, height: 52)
                            .overlay(
                                Image(systemName: "play.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.white)
                                    .offset(x: 2)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 14))

            if !showThumbnail {
                videoControls
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .onDisappear { player.stop() }
    }

    private var videoControls: some View {
        VStack(spacing: 4) {
            Slider(
                value: Binding(
                    get: { player.progress },
                    set: { player.seek(to: $0) }
                ),
                in: 0...1
            )
            .tint(accent)

            HStack(spacing: 8) {
                Button { player.toggle(url: attachment.fileUrl) } label: {
                    if player.isLoading {
                        ProgressView()
                            .tint(accent)
                            .scaleEffect(0.5)
                            .frame(width: 14, height: 14)
                    } else {
                        Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(accent)
                    }
                }
                .buttonStyle(.plain)

                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Text("\(player.percentInt)%")
                    .font(.system(size: 10, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 32)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)

                Spacer()

                Text(player.timeLabel(totalDuration: attachment.duration))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .monospacedDigit()

                speedMenu
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 0, bottomLeadingRadius: 14, bottomTrailingRadius: 14, topTrailingRadius: 0)
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
        )
    }

    private var speedMenu: some View {
        Menu {
            ForEach([0.5, 0.75, 1.0, 1.25, 1.5, 2.0], id: \.self) { rate in
                Button {
                    player.setRate(Float(rate))
                } label: {
                    HStack {
                        Text(rate == 1.0 ? "Normal" : "\(String(format: "%.2g", rate))x")
                        if abs(Double(player.playbackRate) - rate) < 0.01 {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            Text("\(String(format: "%.2g", player.playbackRate))x")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(accent)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Capsule().fill(accent.opacity(0.12)))
        }
    }
}

// MARK: - Overlay Audio Player (AVPlayer wrapper with PlaybackCoordinator integration)

@MainActor
private class OverlayAudioPlayer: ObservableObject {
    @Published var isPlaying = false
    @Published var progress: Double = 0
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var playbackRate: Float = 1.0
    @Published var isLoading = false

    nonisolated(unsafe) private var avPlayer: AVPlayer?
    nonisolated(unsafe) private var timeObserver: Any?
    nonisolated(unsafe) private var statusObservation: NSKeyValueObservation?
    private var currentURL: String?

    var percentInt: Int { Int(progress * 100) }

    func toggle(url: String) {
        if isPlaying {
            avPlayer?.pause()
            isPlaying = false
            return
        }

        if currentURL != url {
            stop()
            currentURL = url
            guard let resolved = MeeshyConfig.resolveMediaURL(url) else { return }
            isLoading = true
            let item = AVPlayerItem(url: resolved)
            avPlayer = AVPlayer(playerItem: item)

            statusObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if item.status == .readyToPlay {
                        self.isLoading = false
                        self.avPlayer?.rate = self.playbackRate
                        self.isPlaying = true
                    } else if item.status == .failed {
                        self.isLoading = false
                    }
                }
            }

            setupTimeObserver()
            observeEnd(item: item)
            return
        }

        avPlayer?.rate = playbackRate
        isPlaying = true
    }

    func stop() {
        avPlayer?.pause()
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        timeObserver = nil
        statusObservation?.invalidate()
        statusObservation = nil
        avPlayer = nil
        currentURL = nil
        isPlaying = false
        isLoading = false
        progress = 0
        currentTime = 0
        duration = 0
    }

    func seek(to fraction: Double) {
        guard let player = avPlayer, let item = player.currentItem else { return }
        let total = item.duration.seconds
        guard total.isFinite && total > 0 else { return }
        let target = CMTime(seconds: fraction * total, preferredTimescale: 600)
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
        progress = fraction
        currentTime = fraction * total
    }

    func skip(seconds: Double) {
        guard let player = avPlayer else { return }
        let current = player.currentTime().seconds
        let total = player.currentItem?.duration.seconds ?? 0
        guard total.isFinite && total > 0 else { return }
        let newTime = max(0, min(total, current + seconds))
        player.seek(to: CMTime(seconds: newTime, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        currentTime = newTime
        progress = newTime / total
    }

    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            avPlayer?.rate = rate
        }
    }

    func timeLabel(totalDuration: Int?) -> String {
        let current = formatTime(currentTime)
        let total = formatTime(duration > 0 ? duration : Double(totalDuration ?? 0))
        return "\(current) / \(total)"
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserver = avPlayer?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor [weak self] in
                guard let self, let item = self.avPlayer?.currentItem else { return }
                let total = item.duration.seconds
                guard total.isFinite && total > 0 else { return }
                self.duration = total
                self.currentTime = time.seconds
                self.progress = time.seconds / total
            }
        }
    }

    private func observeEnd(item: AVPlayerItem) {
        NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.isPlaying = false
                self?.progress = 0
                self?.currentTime = 0
                self?.avPlayer?.seek(to: .zero)
            }
        }
    }

    deinit {
        if let obs = timeObserver { avPlayer?.removeTimeObserver(obs) }
        NotificationCenter.default.removeObserver(self)
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

    static func topEmojis(count: Int, defaults: [String]) -> [String] {
        let counts = getCounts()

        // Deterministic total ordering. `Dictionary` has no specified
        // iteration order, so `counts.sorted { $0.value > $1.value }` left
        // equal-score emojis to the dictionary's whim — they reshuffled on
        // every recomputation (i.e. every quick-bar re-render). We sort the
        // keys with an explicit tie-break: usage count desc, then the emoji's
        // canonical rank (its index in `defaults`, unknowns last), then the
        // emoji string itself. The result is identical across calls for a
        // given usage table, so the bar's emoji order stays fixed while the
        // user interacts with the screen.
        let canonicalRank: [String: Int] = Dictionary(
            uniqueKeysWithValues: defaults.enumerated().map { ($0.element, $0.offset) }
        )
        func rank(_ emoji: String) -> Int { canonicalRank[emoji] ?? Int.max }

        let trackedSorted = counts.keys.sorted { lhs, rhs in
            let lhsCount = counts[lhs] ?? 0
            let rhsCount = counts[rhs] ?? 0
            if lhsCount != rhsCount { return lhsCount > rhsCount }
            let lhsRank = rank(lhs)
            let rhsRank = rank(rhs)
            if lhsRank != rhsRank { return lhsRank < rhsRank }
            return lhs < rhs
        }

        var result: [String] = []
        var seen = Set<String>()
        for emoji in trackedSorted where result.count < count {
            if seen.insert(emoji).inserted { result.append(emoji) }
        }
        for emoji in defaults where result.count < count {
            if seen.insert(emoji).inserted { result.append(emoji) }
        }
        return result
    }

    private static func getCounts() -> [String: Int] {
        UserDefaults.standard.dictionary(forKey: key) as? [String: Int] ?? [:]
    }
}
