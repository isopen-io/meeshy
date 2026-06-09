// MARK: - Standard Bubble Layout
//
// Was: the body of `ThemedMessageBubble.messageContent` (Task-14 pivot of the
// bubble-decompose refactor). This view orchestrates rendering for the
// `.standard` kind — every other kind (`.deleted`, `.burned`,
// `.ephemeralExpired`) is dispatched in `ThemedMessageBubble.body` and never
// reaches this view.
//
// State ownership note: most `@State` lives in `ThemedMessageBubble` so
// the public init API of the wrapper stays unchanged. We accept those values
// via `@Binding` here so the orchestrator stays a leaf-friendly composition
// of sub-views (Bubble*Indicator, BubbleQuotedReply, BubbleAttachmentView,
// BubbleExpandableText, BubbleSecondaryContent, BubbleReactionsOverlay,
// BubbleBackground, BubbleEphemeralBadge, BubbleMediaTimestampOverlay…).
//
// Visual fidelity is the strongest constraint of this refactor: this body
// is a structurally identical port of the legacy `messageContent`. Every
// conditional branch matches the legacy bubble — emoji-only path, text +
// non-media path, visual grid + carousel path, audio standalone path,
// edited overlay placement, OG preview, identity bar, reactions overlay,
// fog/blur reveal stack. Do not simplify the conditional structure without
// running the bubble matrix tests + manual smoke on every code path.

import SwiftUI
import MeeshySDK
import MeeshyUI

struct BubbleStandardLayout: View {
    // MARK: - Inputs (data + visual context)

    /// Pre-built rendering value (Task 15 wiring): the orchestrator branches
    /// on `content.kind`, `content.text`, `content.attachments`, `content.reply`,
    /// `content.translation`, `content.reactions`, etc. via clean `if let`/switch
    /// patterns so a simple "Salut" message only instantiates text + meta-row
    /// (no quoted-reply, no attachment, no translation panel sub-views).
    let content: BubbleContent
    let message: Message
    let contactColor: String
    let isDirect: Bool
    let isDark: Bool
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let textTranslations: [MessageTranslation]
    let preferredTranslation: MessageTranslation?
    let showAvatar: Bool
    let presenceState: PresenceState
    let senderMoodEmoji: String?
    let senderStoryRingState: StoryRingState
    let allAudioItems: [ConversationViewModel.AudioItem]
    let activeAudioLanguage: String?
    let isLastInGroup: Bool
    let isLastReceivedMessage: Bool
    let isLastSentMessage: Bool
    let mentionDisplayNames: [String: String]
    let highlightSearchTerm: String?
    let activeVideoURL: String?
    let currentUserId: String
    let userLanguages: (regional: String?, custom: String?)

    // MARK: - Callbacks (passed through from wrapper)

    let onViewStory: (() -> Void)?
    let onAddReaction: ((String) -> Void)?
    let onToggleReaction: ((String) -> Void)?
    let onOpenReactPicker: ((String) -> Void)?
    let onShowReactions: ((String) -> Void)?
    /// Tap sur les coches de livraison -> ouvre le sheet detail a l'onglet
    /// "Vues" (read receipts). Passe `nil` pour rendre les coches inertes.
    let onShowReadStatus: ((String) -> Void)?
    let onReplyTap: ((String) -> Void)?
    let onStoryReplyTap: ((String) -> Void)?
    let onMediaTap: ((MessageAttachment) -> Void)?
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    let onRequestTranslation: ((String, String) -> Void)?
    let onShowTranslationDetail: ((String) -> Void)?
    /// Phase 5 wiring (audio playback persistence): a tap on the play button
    /// of an audio bubble forwards the attachmentId here so the parent VM
    /// can build the queue and ask the shared `ConversationAudioCoordinator`
    /// to start. Optional so non-audio bubbles and preview call sites stay
    /// unchanged.
    let onPlayAudio: ((String) -> Void)?
    let onScrollToMessage: ((String) -> Void)?

    // MARK: - Bindings (state owned by ThemedMessageBubble wrapper)

    @Binding var activeDisplayLangCode: String?
    @Binding var secondaryLangCode: String?
    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var showShareSheet: Bool
    @Binding var shareURL: URL?
    @Binding var fullscreenAttachment: MessageAttachment?
    @Binding var fullscreenLocationAttachment: MessageAttachment?
    @Binding var showCarousel: Bool
    @Binding var carouselIndex: Int
    @Binding var revealedAttachmentIds: Set<String>

    // MARK: - Controllers (lifecycle objects owned by wrapper)

    @ObservedObject var blurController: BubbleBlurRevealController
    @ObservedObject var ephemeralController: BubbleEphemeralController

    // MARK: - Playback tracking
    //
    // `inlineVideoActiveURL` réplique localement la `SharedAVPlayerManager.activeURL`
    // pour qu'on puisse cacher le footer (heure d'envoi + delivery state)
    // pendant qu'une des vidéos de cette bulle est en lecture. On évite
    // `@ObservedObject SharedAVPlayerManager.shared` : ça re-renderait la
    // bulle 10×/sec via le periodic time observer. Ici on s'abonne juste à
    // `$activeURL` qui ne ticke pas (change uniquement sur load/stop).
    @State private var inlineVideoActiveURL: String = ""

    /// Whether an inline AVPlayer is currently mounted on this bubble.
    /// Read by the extension in `ThemedMessageBubble+Media.swift` to hide
    /// the footer and the media-time overlay during playback — defaults
    /// to internal so cross-file extensions on this struct can observe it.
    var hasPlayingInlineVideo: Bool {
        guard !inlineVideoActiveURL.isEmpty else { return false }
        return visualAttachments.contains { $0.type == .video && $0.fileUrl == inlineVideoActiveURL }
    }

    // MARK: - Adaptive sizing (iPad regular size class needs a tighter cap)

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    // MARK: - Layout constants

    let gridMaxWidth: CGFloat = 300
    let gridSpacing: CGFloat = 2

    // MARK: - Theme accessor

    private var theme: ThemeManager { ThemeManager.shared }

    // MARK: - Derived properties (read from BubbleContent where possible)

    /// Visual attachments — derived from `content.attachments`.
    /// `.visualGrid` carries the items directly; `.mixed` carries them
    /// alongside audio/non-media. Other variants have no visual.
    var visualAttachments: [MessageAttachment] {
        switch content.attachments {
        case .visualGrid(let items): return items
        case .mixed(let visual, _, _): return visual
        case .none, .audio, .nonMedia: return []
        }
    }

    private var audioAttachments: [MessageAttachment] {
        switch content.attachments {
        case .audio(let atts): return atts
        case .mixed(_, let audio, _): return audio
        case .none, .visualGrid, .nonMedia: return []
        }
    }

    private var nonMediaAttachments: [MessageAttachment] {
        switch content.attachments {
        case .nonMedia(let items): return items
        case .mixed(_, _, let items): return items
        case .none, .visualGrid, .audio: return []
        }
    }

    private var hasReactions: Bool { !content.reactions.isEmpty }

    /// Indique qu'un overlay de reaction (pills ou bouton +) deborde sous la
    /// bulle. Le strip flotte de 8pt sous le coin et a une hit-area de 40pt
    /// (cf. `BubbleReactionsOverlay.addButton`), donc il faut reserver assez
    /// d'espace pour qu'il n'entre pas en collision avec la cellule suivante.
    private var hasOverflowingOverlay: Bool {
        hasReactions || (!content.isMe && isLastReceivedMessage)
    }

    private var bottomSpacing: CGFloat {
        // Espacement majore x1.6 (22 -> 35pt, 20 -> 32pt) quand un overlay
        // de reaction deborde sous la bulle, pour eviter que le bouton +
        // (face.smiling, hit-area 40pt) ou les pills ne tapent contre le
        // message suivant. Le facteur x1.6 garde une silhouette compacte
        // entre messages sans overlay, et offre une "respiration" claire
        // autour de ceux qui en ont.
        if isLastInGroup {
            return hasOverflowingOverlay ? 35 : 10
        }
        return hasOverflowingOverlay ? 32 : 2
    }

    private var showIdentityBar: Bool {
        !isDirect && isLastInGroup && !content.isMe
    }

    private var hasAnyTranslation: Bool { content.translation != nil }

    private var effectiveContent: String {
        // Driven by `content.text?.raw` (post-translation, post-active-lang
        // resolution by BubbleContentBuilder). Falls back to `message.content`
        // only when the content has no text payload at all (attachment-only
        // bubble); legacy linkPreview/etc. read from this.
        content.text?.raw ?? message.content
    }

    private var secondaryContent: String? {
        content.translation?.secondaryContent
    }

    private var otherBubbleColor: String {
        let senderHex = message.senderColor ?? contactColor
        return DynamicColorGenerator.blendTwo(senderHex, weight1: 0.30, MeeshyColors.brandPrimaryHex, weight2: 0.70)
    }

    private var hasTextOrNonMediaContent: Bool {
        content.hasTextOrNonMediaContent
    }

    private var isEmojiOnly: Bool { content.isEmojiOnly }

    /// True when audio attachments are the message's only content — no text,
    /// no non-media attachment, no reply, not emoji. In that case the bubble
    /// has no text container to host the identity bar, so it is injected into
    /// the audio widget instead (see `contentStack` / `mediaStandaloneView`).
    private var audioIsSoleContent: Bool {
        !isEmojiOnly
            && !content.hasTextOrNonMediaContent
            && content.reply == nil
            && !audioAttachments.isEmpty
    }

    /// True when the bubble carries an audio attachment AND text content
    /// (the message body), without visual attachments competing for layout.
    /// In that case the text is rendered as a CAPTION INSIDE the audio
    /// widget's playerBackground — single unified bubble (caption pattern,
    /// SOTA aligned with WhatsApp/Telegram/MIMI MultiPart processAll +
    /// disposition inline). The legacy path rendered audio + textBubble as
    /// two adjacent bubbles which broke visual atomicity (user feedback
    /// 2026-05-29).
    ///
    /// Excludes :
    /// - `audioHostsReply` : the reply citation already hosts the bottomSlot
    ///   contract differently — caption + reply combo is rare and the existing
    ///   topSlot reply UX takes priority for the moment.
    /// - `visualGrid` slides : when an image/video is also present, the text
    ///   becomes the visual grid caption (existing visualHostsReply path),
    ///   not the audio's caption.
    private var audioHostsCaption: Bool {
        !audioAttachments.isEmpty
            && !content.audioHostsReply
            && !content.visualHostsReply
            && content.hasTextOrNonMediaContent
            && content.reply == nil
            && visualAttachments.isEmpty
    }

    /// Whether the bubble's inner content stack (non-media attachments,
    /// expandable text, link preview, inline translation panel) has anything
    /// to render. Gates the padded VStack so a quote-only bubble never draws
    /// an empty padded strip below its content. Behavior-preserving: every
    /// branch mirrors a child of the stack, so non-empty bubbles render
    /// exactly as before.
    private var hasBubbleBodyContent: Bool {
        if !nonMediaAttachments.isEmpty { return true }
        if !(content.text?.raw.isEmpty ?? true) { return true }
        if content.text?.firstLinkURL != nil { return true }
        if secondaryContent != nil, secondaryLangCode != nil { return true }
        return false
    }

    private var emojiFontSize: CGFloat {
        content.text?.emojiFontSize ?? 15
    }

    private var isEphemeralExpired: Bool {
        if case .expired = ephemeralController.state { return true }
        return false
    }

    private var ephemeralTimerText: String {
        if case .running(let remaining) = ephemeralController.state {
            return BubbleEphemeralLifecycle.format(remaining: remaining)
        }
        return "0s"
    }

    private var timeString: String { content.meta.timeString }

    /// BUG3 — an outgoing message whose send failed (drives the orange retry band).
    private var isFailedOutgoing: Bool {
        content.isMe && content.meta.deliveryStatus == .failed
    }

    private var deliveryStatusAccessibilityLabel: String {
        switch message.deliveryStatus {
        case .sending: return "en cours d'envoi"
        case .invisible: return "en cours d'envoi"
        case .clock: return "en cours d'envoi"
        case .slow: return "envoi lent"
        case .sent: return "envoye"
        case .delivered: return "distribue"
        case .read: return "lu"
        case .failed: return "echec d'envoi"
        }
    }

    private var reactionSummaries: [ReactionSummary] { content.reactions }

    private var messageAccessibilityLabel: String {
        var parts: [String] = []
        if !content.isMe, let senderName = content.senderName {
            parts.append(senderName)
        } else if !content.isMe {
            parts.append("Inconnu")
        }
        if let raw = content.text?.raw, !raw.isEmpty {
            parts.append(raw)
        }
        if !visualAttachments.isEmpty {
            let imageCount = visualAttachments.filter { $0.type == .image }.count
            let videoCount = visualAttachments.filter { $0.type == .video }.count
            if imageCount > 0 { parts.append(imageCount == 1 ? "une image" : "\(imageCount) images") }
            if videoCount > 0 { parts.append(videoCount == 1 ? "une video" : "\(videoCount) videos") }
        }
        if !audioAttachments.isEmpty {
            parts.append(audioAttachments.count == 1 ? "un audio" : "\(audioAttachments.count) audios")
        }
        if !nonMediaAttachments.isEmpty {
            for att in nonMediaAttachments {
                if att.type == .location { parts.append("position partagee") }
                else { parts.append("fichier \(att.originalName)") }
            }
        }
        parts.append(content.meta.timeString)
        if content.isMe {
            parts.append(deliveryStatusAccessibilityLabel)
        }
        if content.editedAt != nil { parts.append("modifie") }
        if content.isPinned { parts.append("epingle") }
        if message.expiresAt != nil { parts.append("ephemere") }
        let summaries = content.reactions
        if !summaries.isEmpty {
            let reactionText = summaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append("reactions: \(reactionText)")
        }
        return parts.joined(separator: ", ")
    }

    // MARK: - Body

    var body: some View {
        let isMe = content.isMe
        HStack(alignment: .bottom, spacing: 0) {
            if isMe { Spacer(minLength: 50) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
                // Pin indicator
                if content.isPinned {
                    BubblePinnedIndicator()
                }

                // Forwarded indicator
                if content.isForwarded {
                    BubbleForwardedIndicator(
                        isMe: isMe,
                        isDark: isDark,
                        senderName: message.forwardedFrom?.senderName,
                        conversationName: message.forwardedFrom?.conversationName
                    )
                }

                // Ephemeral indicator — gated on the raw `message.expiresAt`
                // (not `content.ephemeral`, which is nil for already-past
                // expiry) to preserve legacy badge behavior. The controller
                // emits `.expired` on tick to hide the badge once the timer
                // runs out.
                if message.expiresAt != nil && !isEphemeralExpired {
                    BubbleEphemeralBadge(timerText: ephemeralTimerText, isDark: isDark)
                }

                // Message content (blurred if isBlurred and not revealed)
                let shouldBlur = content.isBlurred && !blurController.isRevealed

                ZStack {
                    contentStack(shouldBlur: shouldBlur)

                    // Fog condensation effect (appears when blur returns)
                    if blurController.fogOpacity > 0 {
                        fogOverlay
                    }

                    // Blur peek: tap to reveal for N seconds, then auto re-blur
                    if content.isBlurred && !blurController.isRevealed {
                        Color.clear
                            .contentShape(Rectangle())
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(String(localized: "bubble.content.hidden", defaultValue: "Hidden content", bundle: .main))
                            .accessibilityHint("Toucher pour reveler le contenu")
                            .onTapGesture { revealBlurredContent() }
                    }
                }
                // Reactions sit at the BOTTOM corner of the bubble, sur le
                // cote OPPOSE au bord d'ecran. Une bulle recue (a gauche)
                // a son strip ancre en bottom-TRAILING (deborde vers la
                // droite, dans la zone vide de la conversation). Une bulle
                // envoyee (a droite) a son strip ancre en bottom-LEADING
                // (deborde vers la gauche, idem). Le strip "echappe" toujours
                // vers le centre de la conversation, jamais vers le bord
                // d'ecran. Le -4pt de padding garde l'effet "sticker a cheval
                // sur le coin" (~50% sous, ~50% dehors).
                .overlay(alignment: isMe ? .bottomLeading : .bottomTrailing) {
                    // Monte l'overlay réactions UNIQUEMENT s'il a quelque chose à
                    // afficher (pills présentes OU bouton + sur le dernier reçu).
                    // Sans ce gate, une bulle sans réaction allouait quand même la
                    // vue + son `onAppear` + `adaptiveOnChange` sur CHAQUE cellule —
                    // pur gâchis au scroll. `hasOverflowingOverlay` est exactement
                    // la même condition que `BubbleReactionsOverlay.hasContent`.
                    if hasOverflowingOverlay {
                        reactionsOverlay
                            .padding(isMe ? .leading : .trailing, -4)
                            .offset(y: 8)
                    }
                }

            }
            // Single source of truth for the bubble's horizontal cap. The
            // alignment parameter positions the (now-compact thanks to
            // identityBar.fixedSize) bubble at the trailing edge for sent
            // messages and the leading edge for received ones, INSIDE the
            // 275pt frame the parent HStack hands us. Without the alignment
            // param the frame defaults to `.center`, which leaves the
            // compact bubble floating awkwardly in the middle of the row.
            //
            // Stretching the bubble to 70% is no longer a concern: identity
            // bar and inner content both report their intrinsic widths
            // (UserIdentityBar's greedy Spacer is collapsed via
            // `.fixedSize(horizontal: true, vertical: false)` on the bar
            // inside `textBubbleContent`).
            .frame(maxWidth: DeviceLayout.bubbleMaxWidth(containerWidth: UIScreen.main.bounds.width, sizeClass: horizontalSizeClass), alignment: isMe ? .trailing : .leading)

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.bottom, bottomSpacing)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(messageAccessibilityLabel)
        .onReceive(SharedAVPlayerManager.shared.$activeURL) { newURL in
            // Local mirror — toggles `hasPlayingInlineVideo` to drive the
            // footer overlay visibility. Doesn't re-render on time ticks.
            inlineVideoActiveURL = newURL
        }
        .sheet(isPresented: $showShareSheet) {
            if let url = shareURL {
                ShareSheet(activityItems: [url])
            }
        }
        .adaptiveOnChange(of: fullscreenAttachment?.id) { _, _ in
            guard let attachment = fullscreenAttachment else { return }
            if let onMediaTap {
                fullscreenAttachment = nil
                onMediaTap(attachment)
            }
            // If onMediaTap is nil, keep fullscreenAttachment set for the local fullScreenCover fallback
        }
        .fullScreenCover(item: Binding(
            get: { onMediaTap == nil ? fullscreenAttachment : nil },
            set: { fullscreenAttachment = $0 }
        )) { attachment in
            switch attachment.type {
            case .image:
                let urlStr = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
                let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                ImageFullscreen(
                    imageUrl: urlStr.isEmpty ? nil : MeeshyConfig.resolveMediaURL(urlStr),
                    accentColor: contactColor,
                    caption: caption,
                    mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames
                )
            case .video:
                if !attachment.fileUrl.isEmpty {
                    let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                    let resolvedShareURL = MeeshyConfig.resolveMediaURL(attachment.fileUrl)
                    VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
                        MeeshyVideoPlayer(
                            attachment: attachment,
                            style: .fullscreen,
                            controls: .fullscreenDefault,
                            accentColor: contactColor,
                            frame: .flat,
                            availability: availability,
                            performance: .fullscreen,
                            author: makeFullscreenVideoAuthor(),
                            caption: caption,
                            fileName: attachment.originalName,
                            mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames,
                            onDownload: onDownload,
                            onShare: resolvedShareURL.map { url in
                                {
                                    shareURL = url
                                    showShareSheet = true
                                }
                            },
                            onClose: { fullscreenAttachment = nil }
                        )
                    }
                } else {
                    Color.black.onAppear { fullscreenAttachment = nil }
                }
            default:
                Color.black.onAppear { fullscreenAttachment = nil }
            }
        }
        .fullScreenCover(item: $fullscreenLocationAttachment) { attachment in
            if let lat = attachment.latitude, let lon = attachment.longitude {
                LocationFullscreenView(
                    latitude: lat,
                    longitude: lon,
                    placeName: attachment.originalName.isEmpty ? nil : attachment.originalName,
                    accentColor: contactColor,
                    senderName: content.senderName
                )
            }
        }
    }

    // MARK: - Content stack (text + media + reply, with blur mask)

    @ViewBuilder
    private func contentStack(shouldBlur: Bool) -> some View {
        let isMe = content.isMe
        VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
            // Grille visuelle (images + videos) ou carrousel inline
            if !visualAttachments.isEmpty {
                if showCarousel {
                    carouselView
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                } else if content.visualHostsReply, let reply = content.reply {
                    // Visual-only reply : conteneur unifié citation + grille,
                    // bordure commune RR16 — aucune chat bubble parasite.
                    mediaWithReplyContainer(reply: reply)
                } else {
                    visualMediaGrid
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(alignment: .bottomTrailing) {
                            // Footer caché pendant la lecture d'une vidéo
                            // inline : on libère le coin droit pour les
                            // contrôles overlay (time current/total) et on
                            // évite que l'heure d'envoi se superpose à la
                            // vidéo en plein flow.
                            if !content.hasTextOrNonMediaContent && !hasPlayingInlineVideo {
                                let (model, fullActions) = resolvedFooter(includesTranslationControls: false)
                                BubbleFooter(
                                    model: model,
                                    actions: BubbleFooterActions(
                                        onRetry: fullActions.onRetry,
                                        onShowReadStatus: fullActions.onShowReadStatus
                                    ),
                                    style: .overlay,
                                    isDark: isDark
                                )
                                .equatable()
                                .padding(8)
                                .transition(.opacity)
                            }
                        }
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                }
            }

            // Audio standalone. Trois cas où le footer + caption sont
            // injectés DANS le widget audio (single unified bubble) :
            //   - `audioIsSoleContent` : audio seul, footer dans widget
            //   - `audioHostsReply` : audio + reply, citation dans topSlot
            //   - `audioHostsCaption` (NEW 2026-05-29) : audio + texte, le
            //     texte devient le caption rendu DANS playerBackground via
            //     `embedsCaptionInWidget` au lieu d'une bulle texte séparée.
            if case .audio(let auds) = content.attachments, auds.count > 1 {
                // Multi-track audio message → horizontal carousel (one page per
                // track) with one shared footer. All tracks belong to the SAME
                // message, so the footer model is constant across pages. The
                // composer always sends multi-audio as a sole-content audio
                // message (text/reply are separate messages, per Plan 1), so
                // the message-level footer is always shown here.
                //
                // Gated to the PURE `.audio` enum case: a `.mixed` message that
                // ever carried multi-audio (rare inbound MIMI) would render the
                // carousel footer AND the visual grid footer → two footers, so
                // it falls back to the stacked `ForEach` path below.
                //
                // Per-page transcription/translatedAudios are keyed by
                // attachmentId from `allAudioItems` — each `AudioItem` already
                // carries ITS OWN transcription (the VM populates
                // `messageTranscriptionsByAttachment`). The single per-message
                // `transcription` slot only holds the LAST track's data, so it
                // can't be used to key the carousel.
                let footer = resolvedFooter(includesTranslationControls: true)
                let trackIDs = Set(auds.map(\.id))
                let perPageTranscriptions = Dictionary(
                    allAudioItems
                        .filter { trackIDs.contains($0.id) }
                        .compactMap { item in item.transcription.map { (item.id, $0) } },
                    uniquingKeysWith: { first, _ in first }
                )
                // Per-page translated audios are keyed by attachmentId from
                // `allAudioItems` — each `AudioItem` already carries ITS OWN
                // translated audios (the VM populates
                // `messageTranslatedAudiosByAttachment`). The single per-message
                // `translatedAudios` array only holds the LAST track's audios,
                // so it can't be used to key the carousel. Falls back to the
                // grouped per-message array for safety (single-audio path).
                let perAttachmentAudios = Dictionary(
                    allAudioItems
                        .filter { trackIDs.contains($0.id) }
                        .map { ($0.id, $0.translatedAudios) },
                    uniquingKeysWith: { first, _ in first }
                )
                let perPageTranslatedAudios = perAttachmentAudios.allSatisfy({ $0.value.isEmpty })
                    ? Dictionary(grouping: translatedAudios, by: { $0.attachmentId })
                    : perAttachmentAudios
                AudioCarouselView(
                    items: auds,
                    message: message,
                    contactColor: content.isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                    isDark: isDark,
                    accentColor: content.isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                    transcriptions: perPageTranscriptions,
                    translatedAudios: perPageTranslatedAudios,
                    textTranslations: textTranslations,
                    allAudioItems: allAudioItems,
                    mentionDisplayNames: mentionDisplayNames,
                    footerModel: footer.0,
                    footerActions: footer.1,
                    activeAudioLanguage: activeAudioLanguage,
                    onScrollToMessage: onScrollToMessage,
                    onShareFile: { url in
                        shareURL = url
                        showShareSheet = true
                    },
                    onShowTranslationDetail: onShowTranslationDetail,
                    onRequestTranslation: onRequestTranslation,
                    onPlayAudio: onPlayAudio
                )
            } else {
                ForEach(audioAttachments) { attachment in
                    let isLastAudio = attachment.id == audioAttachments.last?.id
                    let shouldInjectFooter = (audioIsSoleContent && isLastAudio)
                        || content.audioHostsReply
                        || (audioHostsCaption && isLastAudio)
                    mediaStandaloneView(
                        attachment,
                        injectFooter: shouldInjectFooter,
                        replyReference: content.audioHostsReply ? content.reply?.reference : nil,
                        replyIsStory: content.audioHostsReply ? (content.reply?.isStory ?? false) : false,
                        embedsCaption: audioHostsCaption && isLastAudio
                    )
                }
            }

            // Emoji-only WITHOUT a reply: large emoji free-floating, no bubble.
            // An emoji-only message that quotes another message keeps the
            // bubble so the quoted-reply card renders — `textBubbleContent`
            // hosts it and renders the emoji large & centered above the quote
            // (see `bubbleInnerContent`).
            if isEmojiOnly && content.reply == nil {
                emojiOnlyContent
            } else if (content.hasTextOrNonMediaContent
                || (content.reply != nil && !content.audioHostsReply && !content.visualHostsReply))
                && !audioHostsCaption {
                textBubbleContent
            }
            // Audio-only / visual-only reply / audio caption pattern : la
            // citation et/ou le texte sont hébergés par le widget média
            // lui-même — `textBubbleContent` est intentionnellement
            // suppressed pour eviter la chat bubble parasite.
        }
        // Le blur + mask ne s'appliquent qu'aux bulles RÉELLEMENT floutables.
        // AVANT : appliqués à 100% des bulles (même à radius 0) → une passe de
        // compositing offscreen (`.mask`) par bulle, gaspillée pour la grande
        // majorité non floutée (coût GPU au scroll). `content.isBlurred` est
        // statique par message → branche stable, pas de churn d'identité. Pour
        // une bulle floutable on garde les modifiers pour animer la révélation.
        .modifier(BlurRevealModifier(isBlurrable: content.isBlurred, shouldBlur: shouldBlur))
    }

    /// Gate le blur+mask sur le fait que la bulle soit floutable. Voir l'appel
    /// dans `contentStack` pour le rationale (perf GPU au scroll).
    private struct BlurRevealModifier: ViewModifier {
        let isBlurrable: Bool
        let shouldBlur: Bool
        func body(content: Content) -> some View {
            if isBlurrable {
                content
                    .blur(radius: shouldBlur ? 20 : 0)
                    .mask(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .blur(radius: shouldBlur ? 5 : 0)
                    )
            } else {
                content
            }
        }
    }

    // MARK: - Emoji-only path

    @ViewBuilder
    private var emojiOnlyContent: some View {
        // Layout emoji-only sans reply : l'emoji et la meta-row (timestamp +
        // delivery) forment un BLOC INDISSOCIABLE rendu sur la meme baseline,
        // colle au bord de la conversation cote isMe. `.fixedSize()` garantit
        // que le container epouse le contenu : pas de container invisible
        // qui s'etire sur toute la largeur disponible (ce qui faisait "voler"
        // la date a un endroit excentre). Le VStack exterieur conserve
        // l'alignement isMe pour le secondary content (langue alternative
        // active) qui descend dessous.
        VStack(alignment: content.isMe ? .trailing : .leading, spacing: 2) {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                // Emoji-only intentionally renders the ORIGINAL `message.content`,
                // not the translated text — emoji bubbles are not translated.
                Text(message.content)
                    .font(.system(size: emojiFontSize))
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .topLeading) {
                        if content.editedAt != nil {
                            editedIndicator
                                .offset(y: -14)
                        }
                    }

                compactInlineFooter
            }
            .fixedSize()

            secondaryContentView
        }
    }

    /// Meta-row minimaliste pose a cote d'un emoji free-floating : timestamp
    /// + delivery check (si isMe), sans drapeaux, sans translate, sans capsule.
    /// Re-utilise le builder `resolvedFooter` pour rester aligne sur la meme
    /// source de verite que le `standardFooter`.
    private var compactInlineFooter: some View {
        let (model, actions) = resolvedFooter(includesTranslationControls: false)
        return BubbleFooter(model: model, actions: actions, style: .compact, isDark: isDark)
            .equatable()
    }

    // MARK: - Text bubble path (with non-media attachments + reply preview)
    //
    // Timestamp-visibility gating + delivery resolution now live in the pure
    // `BubbleFooterModel.make(...)` builder — see `resolvedFooter`.

    @ViewBuilder
    private var bubbleInnerContent: some View {
        // Quoted reply preview (inside bubble)
        if let reply = content.reply {
            quotedReplyView(reply.reference)
                .padding(.bottom, 4)
                .onTapGesture {
                    guard !reply.reference.messageId.isEmpty else { return }
                    HapticFeedback.light()
                    if reply.isStory {
                        onStoryReplyTap?(reply.reference.messageId)
                    } else {
                        onReplyTap?(reply.reference.messageId)
                    }
                }
        }

        if hasBubbleBodyContent {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(nonMediaAttachments) { attachment in
                    attachmentView(attachment)
                }

                if let text = content.text, !text.raw.isEmpty {
                    // No `.onLongPressGesture` — see comment in `emojiOnlyContent`.
                    // The container's long-press opens the options overlay; the
                    // translate icon in the identity bar opens translation detail.
                    if text.isEmojiOnly {
                        // Emoji-only reply: emoji hosted inside the bubble, above
                        // the quoted-reply card — large (same 90/60/45pt sizing as
                        // the free-floating path). Pas de `.frame(maxWidth: .infinity)` :
                        // la bulle doit epouser le contenu (emoji + quoted-reply
                        // card), pas s'etirer sur 70% de la largeur d'ecran. Le
                        // VStack parent gere deja l'alignement naturel a gauche.
                        Text(message.content)
                            .font(.system(size: emojiFontSize))
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        expandableTextView
                    }
                }

                // Inline OpenGraph preview for the first URL in the
                // effective (possibly translated) content. Self-loading.
                // URL précalculée dans BubbleContent (plus de NSDataDetector ici).
                if let url = content.text?.firstLinkURL {
                    LinkPreviewCard(
                        urlString: url,
                        accentColor: contactColor,
                        isDark: isDark
                    )
                    .padding(.top, 4)
                }

                secondaryContentView
            }
            .padding(.horizontal, 14)
            .padding(.vertical, content.hasTextOrNonMediaContent ? 10 : 4)
        }
    }

    @ViewBuilder
    private var textBubbleContent: some View {
        let hasEdited = content.editedAt != nil
        // Body + footer are stacked by `BubbleBodyFooterLayout`, not a plain
        // VStack. The footer carries a trailing Spacer — language flags on the
        // leading edge, timestamp + delivery check on the trailing edge. In a
        // plain VStack that Spacer is greedy and stretches the whole bubble to
        // its 70% max width; `.fixedSize` collapses the Spacer instead, which
        // pins the check right after the flags rather than on the bubble edge.
        // The custom Layout measures the body once and hands that exact width
        // to the footer: the text still wraps, the bubble stays sized to its
        // content, and the check lands on the trailing edge — matching the
        // corner-pinned footer of media bubbles. `sizeThatFits` and
        // `placeSubviews` both derive every value from the same resolved
        // width, so the reported height is self-consistent (no
        // UICollectionView cell-height drift).
        BubbleBodyFooterLayout(spacing: 4) {
            // Wrapped in a VStack so the Layout sees the body as ONE opaque
            // subview — a bare @ViewBuilder property would be flattened into
            // its individual conditional branches.
            VStack(alignment: .leading, spacing: 4) {
                bubbleInnerContent
            }
            // `textBubbleContent` n'est plus rendu pour `audioHostsReply` /
            // `visualHostsReply` (voir `contentStack`), donc le footer standard
            // est toujours adapté ici — le widget média qui héberge sa propre
            // citation gère son footer en interne (bottomSlot ou overlay).
            standardFooter
        }
        .padding(.top, hasEdited ? 12 : 0)
        .overlay(alignment: .topLeading) {
            if hasEdited {
                editedIndicator
                    .padding(.leading, 12)
                    .padding(.top, 6 + (content.reply != nil ? 52 : 0))
            }
        }
        .background(bubbleBackground)
        // BUG3 — failed outgoing message: an orange left-edge band attached to
        // the bubble; tapping it re-triggers the send (placed before clipShape so
        // it follows the rounded corners). Gated so non-failed bubbles are
        // untouched.
        .overlay(alignment: .leading) {
            if isFailedOutgoing {
                BubbleFailedRetryBar(onRetry: { performManualRetry() })
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 18))
        // Simplification forte : plus d'ombre portée par bulle. Une `.shadow`
        // teintée par cellule force un rendu offscreen à chaque frame de scroll
        // (classique tueur de FPS). Les bulles sont désormais plates et nettes.
    }

    // MARK: - Identity bar (top of bubble for received last-in-group, otherwise meta row)

    /// Builds the footer model + actions for this bubble.
    /// - Parameter includesTranslationControls: when `false`, language flags
    ///   and the translate button are omitted — the audio widget owns its own
    ///   per-language switcher, so rendering both would compete.
    func resolvedFooter(includesTranslationControls: Bool = true) -> (BubbleFooterModel, BubbleFooterActions) {
        // Le bouton translate s'affiche toujours pour les contenus traductibles
        // — texte ou audio (la transcription est traductible) — même si aucune
        // traduction n'existe encore : l'utilisateur peut alors la demander
        // depuis le MessageDetailSheet. Image / vidéo seules et emoji-only
        // restent exclus tant qu'on n'a pas de pipeline texte associé.
        let isTranslatableContent = !isEmojiOnly
            && (hasTextOrNonMediaContent || !audioAttachments.isEmpty)
        let showTranslation = includesTranslationControls && isTranslatableContent
        // Les drapeaux n'apparaissent que quand au moins une traduction est
        // déjà disponible (sinon il n'y a rien à montrer côté flag strip).
        let showFlags = showTranslation && hasAnyTranslation
        let sender: SenderIdentity? = showIdentityBar ? SenderIdentity(
            name: content.senderName ?? "?",
            username: message.senderUsername.map { "@\($0)" },
            role: nil,
            avatarURL: message.senderAvatarURL,
            accentColor: message.senderColor ?? contactColor,
            moodEmoji: senderMoodEmoji,
            presence: presenceState,
            storyRing: senderStoryRingState
        ) : nil

        let model = BubbleFooterModel.make(
            timeString: content.meta.timeString,
            deliveryStatus: message.deliveryStatus,
            isMe: content.isMe,
            isOnline: networkIsOnline,
            sender: sender,
            flags: showFlags
                ? buildAvailableFlags().map { FooterFlag(code: $0, isActive: $0 == secondaryLangCode) }
                : [],
            showsTranslate: showTranslation
        )

        // Le tap sur les coches n'a de sens que sur les messages envoyes
        // (les seuls qui portent une `delivery` non-nulle dans le footer).
        // Sur un message recu, `model.delivery == nil` donc le bouton n'est
        // jamais rendu meme si un callback etait branche.
        let readStatusCallback: (() -> Void)? = (content.isMe && onShowReadStatus != nil)
            ? { onShowReadStatus?(content.messageId) }
            : nil

        let actions = BubbleFooterActions(
            onFlagTap: showFlags ? { code in handleFlagTap(code) } : nil,
            onTranslate: showTranslation ? { onShowTranslationDetail?(content.messageId) } : nil,
            onRetry: { performManualRetry() },
            onSenderTap: { selectedProfileUser = .from(message: message) },
            onViewStory: onViewStory,
            onShowReadStatus: readStatusCallback
        )
        return (model, actions)
    }

    /// The standard footer row rendered below text and emoji bubbles.
    private var standardFooter: some View {
        let (model, actions) = resolvedFooter()
        return BubbleFooter(model: model, actions: actions, style: .row, isDark: isDark)
            .equatable()
            .padding(.horizontal, showIdentityBar ? 10 : 14)
            .padding(.top, showIdentityBar ? 8 : 0)
            .padding(.bottom, 8)
    }

    /// Live read of the global network monitor. Kept as a computed property
    /// so the bubble doesn't subscribe to its `@Published` and re-render on
    /// every offline/online edge — the parent (`ConversationViewModel`) is
    /// what bumps `message.deliveryStatus` and `updatedAt` to drive the
    /// bubble's Equatable.
    private var networkIsOnline: Bool {
        NetworkMonitor.shared.isOnline
    }

    /// Manual retry path triggered by `BubbleFooter`'s failed-delivery retry
    /// button. Resolves the outbox row from the message's `clientMessageId`
    /// and resets the retry budget so the flusher's next pass picks it up
    /// immediately. Errors are
    /// swallowed (no-op if the row no longer exists — the optimistic message
    /// has already been reconciled or the user manually cleared the queue).
    private func performManualRetry() {
        let cmid = message.clientMessageId ?? message.id
        Task {
            try? await OfflineQueue.shared.retryByClientMessageId(cmid)
        }
    }

    // MARK: - Edited indicator

    private var editedIndicator: some View {
        BubbleEditedIndicator(
            isMe: content.isMe,
            isSaving: content.isEditSaving,
            hasEditHistory: content.hasEditHistory,
            isDark: isDark
        )
    }

    // MARK: - Expandable text

    private var linkTint: Color {
        content.isMe ? .white.opacity(0.9) : Color(hex: contactColor)
    }

    private var mentionTint: Color {
        MeeshyColors.indigo400 // distinct des liens URL
    }

    @ViewBuilder
    private var expandableTextView: some View {
        BubbleExpandableText(
            content: effectiveContent,
            isMe: content.isMe,
            mentionDisplayNames: mentionDisplayNames,
            highlightTerm: highlightSearchTerm,
            mentionTint: mentionTint,
            linkTint: linkTint
        )
    }

    // MARK: - Secondary content (inline translation panel)

    @ViewBuilder
    private var secondaryContentView: some View {
        if let secondary = secondaryContent, let code = secondaryLangCode {
            BubbleSecondaryContent(
                content: secondary,
                langCode: code,
                isMe: content.isMe,
                textPrimary: theme.textPrimary,
                mentionDisplayNames: mentionDisplayNames,
                mentionTint: mentionTint,
                linkTint: linkTint
            )
        }
    }

    // MARK: - Quoted reply

    private func quotedReplyView(_ reply: ReplyReference) -> some View {
        BubbleQuotedReply(
            reply: reply,
            parentIsMe: content.isMe,
            accentHex: contactColor,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames
        )
        .equatable()
    }

    // MARK: - Attachment view (file, location, etc.)

    @ViewBuilder
    private func attachmentView(_ attachment: MessageAttachment) -> some View {
        BubbleAttachmentView(
            attachment: attachment,
            isMe: content.isMe,
            isDark: isDark,
            accentHex: contactColor,
            transcription: transcription,
            translatedAudios: translatedAudios,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            },
            onTapLocation: { att in
                fullscreenLocationAttachment = att
            },
            onPlayAudio: onPlayAudio
        )
    }

    // MARK: - Reactions overlay

    @ViewBuilder
    private var reactionsOverlay: some View {
        // Use the SAME accent as the bubble background under the pill so
        // (a) the add-reaction button reads as "attached" to the bubble it
        // belongs to and (b) reactions the connected user has placed get a
        // border that matches the host bubble's accent — own messages get
        // the brand indigo (matches the bubble fill), received messages
        // get the blended `otherBubbleColor`. Passing `contactColor` (the
        // raw conversation color) made every bubble's pills look like
        // they belonged to the same generic surface.
        let bubbleAccent = content.isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor

        BubbleReactionsOverlay(
            messageId: content.messageId,
            summaries: reactionSummaries,
            isMe: content.isMe,
            isDark: isDark,
            isLastReceivedMessage: isLastReceivedMessage,
            accentHex: bubbleAccent,
            onAddReaction: onAddReaction,
            onToggleReaction: onToggleReaction,
            onOpenReactPicker: onOpenReactPicker,
            onShowReactions: onShowReactions
        )
    }

    // MARK: - Bubble background

    private var bubbleBackground: some View {
        BubbleBackground(
            isMe: content.isMe,
            accentHex: otherBubbleColor,
            isDark: isDark
        )
    }

    // MARK: - Audio standalone

    @ViewBuilder
    private func mediaStandaloneView(
        _ attachment: MessageAttachment,
        injectFooter: Bool = false,
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false,
        embedsCaption: Bool = false
    ) -> some View {
        let isMe = content.isMe
        // Audio-only messages host the bubble footer inside the audio widget;
        // `AudioMediaView` folds the audio-language flags into this model.
        // When `replyReference` is non-nil, the citation is also hosted inside
        // the audio widget (topSlot) — no chat bubble around the player.
        // `includesTranslationControls: true` because audio IS translatable
        // (Whisper transcription + NLLB+TTS audio translation) — without it
        // an audio-only inbound bubble would render without the translate
        // globe and language flags, breaking the Prisme Linguistique UX.
        let footer = injectFooter ? resolvedFooter(includesTranslationControls: true) : nil
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                visualAttachments: visualAttachments,
                isDark: isDark,
                accentColor: isMe ? MeeshyColors.brandPrimaryHex : otherBubbleColor,
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                textTranslations: textTranslations,
                allAudioItems: allAudioItems,
                mentionDisplayNames: mentionDisplayNames,
                onScrollToMessage: onScrollToMessage,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                },
                onShowTranslationDetail: onShowTranslationDetail,
                onRequestTranslation: onRequestTranslation,
                activeAudioLanguageOverride: activeAudioLanguage,
                footerModel: footer?.0,
                footerActions: footer?.1 ?? .none,
                replyReference: replyReference,
                replyIsStory: replyIsStory,
                parentIsMe: isMe,
                onReplyTap: onReplyTap,
                onStoryReplyTap: onStoryReplyTap,
                onPlayAudio: onPlayAudio,
                embedsCaptionInWidget: embedsCaption
            )
            .equatable()

        default:
            EmptyView()
        }
    }

    // MARK: - Fog overlay (blur reveal disappearance)

    @ViewBuilder
    private var fogOverlay: some View {
        ZStack {
            RadialGradient(
                gradient: Gradient(colors: [
                    Color.white.opacity(0.35),
                    Color.white.opacity(0.12),
                    Color.clear
                ]),
                center: .center,
                startRadius: 5,
                endRadius: 120
            )
            .blur(radius: 18)
            .scaleEffect(1.3)

            Circle()
                .fill(Color.white.opacity(0.18))
                .blur(radius: 25)
                .frame(width: 70, height: 70)
                .offset(x: -25, y: -18)

            Circle()
                .fill(Color.white.opacity(0.12))
                .blur(radius: 30)
                .frame(width: 55, height: 55)
                .offset(x: 20, y: 12)
        }
        .opacity(blurController.fogOpacity)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .allowsHitTesting(false)
    }

    // MARK: - Language flag handling

    /// Returns the available language flags for the language strip.
    /// Reads from `content.translation.availableFlags` when BubbleContent
    /// has populated them (live binding to active lang), with a fallback
    /// for the cold-cache cases where Translation is nil. Mirrors legacy
    /// ThemedMessageBubble.buildAvailableFlags exactly.
    private func buildAvailableFlags() -> [String] {
        if let flags = content.translation?.availableFlags {
            return flags
        }
        return []
    }

    private func handleFlagTap(_ code: String) {
        let outcome = BubbleLanguageFlagController.handleTap(
            code: code,
            current: BubbleLanguageFlagController.Context(
                activeDisplayLangCode: activeDisplayLangCode,
                secondaryLangCode: secondaryLangCode
            ),
            messageOriginalLang: message.originalLanguage,
            translations: textTranslations
        )
        HapticFeedback.light()
        switch outcome.action {
        case .switchPrimary:
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = outcome.activeDisplayLangCode
                secondaryLangCode = outcome.secondaryLangCode
            }
        case .openSecondary, .closeSecondary:
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = outcome.secondaryLangCode
            }
        case .requestTranslation(let target):
            onRequestTranslation?(content.messageId, target)
        }
    }

    // MARK: - Blur reveal action (delegated to controller)

    private func revealBlurredContent() {
        HapticFeedback.medium()
        blurController.requestReveal(
            request: BubbleBlurRevealLifecycle.RevealRequest(
                messageId: content.messageId,
                isViewOnce: content.isViewOnce
            ),
            consumeViewOnce: onConsumeViewOnce
        )
    }

    // MARK: - Fullscreen video author chip

    private func makeFullscreenVideoAuthor() -> MeeshyVideoPlayer.VideoAuthor? {
        let name = message.senderName ?? ""
        guard !name.isEmpty else { return nil }
        return MeeshyVideoPlayer.VideoAuthor(
            displayName: name,
            avatarUrl: message.senderAvatarURL,
            userId: message.senderUserId ?? message.senderId
        )
    }
}

// MARK: - Bubble body + footer layout
//
// Stacks the bubble's inner content above its footer. Unlike a plain VStack,
// the footer is handed *exactly* the inner content's resolved width — so the
// footer's trailing meta (timestamp + delivery check) lands on the bubble's
// trailing edge, matching the corner-pinned footer of media bubbles. The
// footer never widens the bubble: its own intrinsic width acts only as a
// floor so the meta is never clipped on very short messages.
//
// `sizeThatFits` and `placeSubviews` compute the body and footer heights at
// the same resolved width, so the reported size is self-consistent and the
// hosting UICollectionView cell never drifts. Accepts one subview (body only,
// when the footer is suppressed for an audio-in-quote bubble) or two.
struct BubbleBodyFooterLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let body = subviews.first else { return .zero }
        let bodyProbe = body.sizeThatFits(proposal)
        guard subviews.count > 1 else { return bodyProbe }

        let footer = subviews[1]
        let footerFloor = footer.sizeThatFits(.unspecified).width
        let width = max(bodyProbe.width, footerFloor)
        let bodyHeight = body.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        let footerHeight = footer.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        return CGSize(width: width, height: bodyHeight + spacing + footerHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let body = subviews.first else { return }
        let width = bounds.width
        let bodyHeight = body.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        body.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: bodyHeight)
        )

        guard subviews.count > 1 else { return }
        let footer = subviews[1]
        let footerHeight = footer.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        footer.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY + bodyHeight + spacing),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: width, height: footerHeight)
        )
    }
}

