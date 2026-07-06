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
    /// Blended bubble accent for received bubbles (sender colour 30% over brand
    /// 70%), pre-computed ONCE by the orchestrator. Was a computed `var` that
    /// re-ran `blendTwo` (hex→RGB→HSB→hex) on each of its ~6 read sites per body
    /// evaluation; the inputs (`message.senderColor`, `contactColor`) are stable
    /// for the bubble's lifetime, so the blend belongs upstream of the body.
    let otherBubbleColor: String
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
    /// Manual resend of a FAILED outgoing message (id). Routed to
    /// `ConversationViewModel.retryMessage`, which deletes the failed row and
    /// re-sends with the SAME clientMessageId (gateway dedup) AND kicks the
    /// outbox flusher — unlike the old local `OfflineQueue.retryByClientMessageId`
    /// that reset the row but never triggered a flush, so the resend never fired.
    let onRetry: ((String) -> Void)?
    let onReplyTap: ((String) -> Void)?
    let onStoryReplyTap: ((String) -> Void)?
    let onMediaTap: ((MessageAttachment) -> Void)?
    let onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, emoji). Threadé jusqu'à BubbleGridCell.
    let onReactToAttachment: ((String, String) -> Void)?
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
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil

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

    private var hasTextOrNonMediaContent: Bool {
        content.hasTextOrNonMediaContent
    }

    private var isEmojiOnly: Bool { content.isEmojiOnly }

    /// Cache key for `BubbleBodyFooterLayout`. nil (no caching) for expandable
    /// bubbles: their measured height depends on the per-cell `isExpanded`
    /// @State of `BubbleExpandableText`, which the content-keyed cache cannot
    /// observe — so a long message always measures live and never risks a stale
    /// collapsed/expanded height. Every other bubble keys on (id, content).
    private var heightCacheContext: BubbleHeightCacheContext? {
        if let raw = content.text?.raw, raw.count > BubbleExpandableText.truncateLimit {
            return nil
        }
        // Link-preview bubbles host a self-loading OG card whose height changes
        // when metadata lands (skeleton → populated card with a 2-line title +
        // description + thumbnail) WITHOUT any `BubbleContent` change —
        // `firstLinkURL` is identical before and after the fetch, so the
        // content-keyed cache would return the stale skeleton-era height and the
        // populated card would overflow the bubble frame (the misalignment seen
        // on device). Measure live, like expandable bubbles above.
        if content.text?.firstLinkURL != nil {
            return nil
        }
        return BubbleHeightCacheContext(messageId: content.messageId, content: content)
    }

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

    /// Width of the integrated trailing retry band (and the trailing inset the
    /// bubble content reserves for it) on a failed outgoing message.
    static let retryBandWidth: CGFloat = 34

    /// BUG3 — single retry affordance. When the failed-outgoing orange
    /// `BubbleFailedRetryBar` is shown, it owns the resend action, so the footer
    /// must suppress its own `arrow.clockwise` retry button (otherwise the bubble
    /// exposes two competing affordances and the footer tap collides with the
    /// status sheet). The footer keeps its retry handler in every other case.
    static func footerShowsRetry(isFailedOutgoing: Bool) -> Bool { !isFailedOutgoing }

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

    /// VoiceOver phrasing for the quoted-reply context of this bubble, injected
    /// between the sender name and the body so the reading order is
    /// expediteur -> [reponse a...] -> contenu. Returns nil when the bubble is
    /// not a reply. The combined bubble element flattens the visual quote card's
    /// own sub-views, so this is the only way the reply reaches VoiceOver.
    private var replyAccessibilityLabel: String? {
        guard let reply = content.reply?.reference else { return nil }
        let author: String = reply.isMe
            ? String(localized: "a11y.bubble.replyTo.you", bundle: .main)
            : (reply.authorName.isEmpty
                ? String(localized: "a11y.bubble.replyTo.unknown", bundle: .main)
                : reply.authorName)
        let excerpt = reply.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
        if excerpt.isEmpty {
            return String(format: String(localized: "a11y.bubble.replyTo", bundle: .main), author)
        }
        return String(format: String(localized: "a11y.bubble.replyTo.excerpt", bundle: .main), author, excerpt)
    }

    private var messageAccessibilityLabel: String {
        var parts: [String] = []
        if !content.isMe, let senderName = content.senderName {
            parts.append(senderName)
        } else if !content.isMe {
            parts.append(String(localized: "a11y.message.unknown_sender", bundle: .main))
        }
        if let replyLabel = replyAccessibilityLabel {
            parts.append(replyLabel)
        }
        if let raw = content.text?.raw, !raw.isEmpty {
            parts.append(raw)
        }
        if !visualAttachments.isEmpty {
            let imageCount = visualAttachments.filter { $0.type == .image }.count
            let videoCount = visualAttachments.filter { $0.type == .video }.count
            if imageCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.images", bundle: .main), imageCount))
            }
            if videoCount > 0 {
                parts.append(String(format: String(localized: "a11y.message.videos", bundle: .main), videoCount))
            }
        }
        if !audioAttachments.isEmpty {
            parts.append(String(format: String(localized: "a11y.message.audios", bundle: .main), audioAttachments.count))
        }
        if !nonMediaAttachments.isEmpty {
            for att in nonMediaAttachments {
                if att.type == .location {
                    parts.append(String(localized: "a11y.message.location", bundle: .main))
                } else {
                    parts.append(String(format: String(localized: "a11y.message.file", bundle: .main), att.originalName))
                }
            }
        }
        parts.append(content.meta.timeString)
        if content.isMe {
            parts.append(deliveryStatusAccessibilityLabel)
        }
        if content.editedAt != nil {
            parts.append(String(localized: "a11y.message.edited", bundle: .main))
        }
        if content.isPinned {
            parts.append(String(localized: "a11y.message.pinned", bundle: .main))
        }
        if message.expiresAt != nil {
            parts.append(String(localized: "a11y.message.ephemeral", bundle: .main))
        }
        let summaries = content.reactions
        if !summaries.isEmpty {
            let reactionText = summaries.map { "\($0.emoji) \($0.count)" }.joined(separator: ", ")
            parts.append(String(format: String(localized: "a11y.message.reactions", bundle: .main), reactionText))
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
            //
            // Every visible bubble (text bubbles included) is subscribed, but
            // only a bubble that actually owns a video has any reason to mirror
            // this. Gating the @State write on video presence (and deduping the
            // value) means a text bubble's body is never invalidated when the
            // active inline video changes elsewhere in the list.
            guard visualAttachments.contains(where: { $0.type == .video }),
                  newURL != inlineVideoActiveURL else { return }
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
                let original = attachment.fileUrl.isEmpty ? (attachment.thumbnailUrl ?? "") : attachment.fileUrl
                // 5.2 — cible plein écran = largeur écran × scale. La variante la
                // plus petite `>=` cette cible évite de charger l'original 4000px
                // quand une 1920 suffit ; sans variante → original.
                let targetPx = Int((UIScreen.main.bounds.width * UIScreen.main.scale).rounded())
                let chosen = original.isEmpty ? "" : ImageVariantSelector.bestImageURL(
                    variants: attachment.imageVariants ?? [],
                    originalURL: original,
                    originalWidth: attachment.width,
                    targetWidthPx: targetPx
                )
                let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                ImageFullscreen(
                    imageUrl: chosen.isEmpty ? nil : MeeshyConfig.resolveMediaURL(chosen),
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
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                } else if content.visualHostsReply, let reply = content.reply {
                    // Visual-only reply : conteneur unifié citation + grille,
                    // bordure commune RR16 — aucune chat bubble parasite.
                    mediaWithReplyContainer(reply: reply)
                } else {
                    visualMediaGrid
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
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
                    onPlayAudio: onPlayAudio,
                    parentIsMe: content.isMe,
                    voiceConsentMissing: voiceConsentMissing,
                    onTapConsentNotice: onTapConsentNotice
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
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg + 2, style: .continuous)
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

        // Edited badge — inline, directly BELOW the quoted reply (when present)
        // and above the body. Was a `.topLeading` overlay offset by a hardcoded
        // `reply ? 52` value that mis-fired whenever the quote was taller than
        // 52pt (sender name + 2 preview lines), overlapping the quote. Inline
        // placement tracks the real reply height with no magic numbers.
        if content.editedAt != nil {
            editedIndicator
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
                if let video = content.text?.embeddedVideo {
                    VideoEmbedContainer(video: video, accent: Color(hex: contactColor), trackedURL: content.text?.embedTrackedURL)
                        .padding(.top, 4)
                } else if let url = content.text?.firstLinkURL {
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
        BubbleBodyFooterLayout(spacing: 4, cacheContext: heightCacheContext) {
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
        // FAILED outgoing send — reserve a trailing strip and glue the retry
        // band INTO it as an integrated edge tab (clipped to the bubble's rounded
        // corner, no gap). The content + footer are inset by the band width so
        // the bubble's own timestamp + delivery state stay visible to its LEFT;
        // and because the band lives INSIDE the bubble's frame, a failed bubble
        // right-aligns exactly like every other bubble (no left-shift).
        .padding(.trailing, isFailedOutgoing ? Self.retryBandWidth : 0)
        .background(bubbleBackground)
        .overlay(alignment: .trailing) {
            if isFailedOutgoing {
                BubbleFailedRetryBar(onRetry: { performManualRetry() })
                    .frame(width: Self.retryBandWidth)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg + 2))
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
            // BUG3 — suppress the footer's own retry button for failed outgoing
            // messages: the orange `BubbleFailedRetryBar` owns the resend so the
            // bubble never shows two competing retry affordances.
            onRetry: Self.footerShowsRetry(isFailedOutgoing: isFailedOutgoing) ? { performManualRetry() } : nil,
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

    /// Manual resend triggered by the orange retry band (or the footer's retry).
    /// Delegates to the ViewModel via `onRetry` → `retryMessage(messageId:)`,
    /// which re-inserts a fresh optimistic `.sending` row (immediate feedback,
    /// the band swaps to the normal sending indicator), re-enqueues, AND kicks
    /// the outbox flusher. The previous local path
    /// (`OfflineQueue.retryByClientMessageId`) only reset the outbox row to
    /// `.pending` without ever flushing it, so on a foregrounded/online device
    /// the resend silently never fired.
    private func performManualRetry() {
        onRetry?(message.id)
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
            linkTint: linkTint,
            trackedLinks: content.text?.trackedLinks ?? [:]
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
                linkTint: linkTint,
                trackedLinks: content.text?.trackedLinks ?? [:]
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
                embedsCaptionInWidget: embedsCaption,
                voiceConsentMissing: voiceConsentMissing,
                onTapConsentNotice: onTapConsentNotice
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
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg + 2))
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
/// Identifies a bubble for the height cache: the message id plus the exact
/// `BubbleContent` value it renders. nil at the call site = no caching (e.g.
/// expandable bubbles whose height depends on per-cell `isExpanded` state).
struct BubbleHeightCacheContext {
    let messageId: String
    let content: BubbleContent
}

struct BubbleBodyFooterLayout: Layout {
    var spacing: CGFloat = 4
    var cacheContext: BubbleHeightCacheContext? = nil

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        // Cache lookup only for a concrete finite proposal width — the
        // ideal/unspecified passes must not poison the width-keyed cache, and a
        // hit returns the previously measured size without descending into the
        // body subtree (the #1 CPU self-time at scroll). On a miss we measure
        // and store; `placeSubviews` always re-measures the live content, so the
        // cache only affects the *reported* size, never placement.
        guard let ctx = cacheContext,
              let proposedWidth = proposal.width,
              Self.cacheUsable(proposedWidth: proposedWidth, isMainThread: Thread.isMainThread) else {
            return measuredSize(proposal: proposal, subviews: subviews)
        }
        // `Layout.sizeThatFits` is a nonisolated protocol requirement and iOS 26
        // can invoke it on com.apple.SwiftUI.AsyncRenderer, NOT only on the main
        // thread (5 device crashes 2026-06-10..12: dispatch_assert_queue_fail in
        // this exact `assumeIsolated`). The cache is therefore a main-thread-only
        // fast path: off-main passes fall through to a direct measure above, and
        // `assumeIsolated` below is only reached when the main thread is proven.
        return MainActor.assumeIsolated {
            let cache = BubbleHeightCache.shared
            if let cached = cache.size(messageId: ctx.messageId, content: ctx.content, width: proposedWidth) {
                return cached
            }
            let size = measuredSize(proposal: proposal, subviews: subviews)
            cache.store(messageId: ctx.messageId, content: ctx.content, width: proposedWidth, size: size)
            return size
        }
    }

    /// Whether the height cache may be consulted for this layout pass. Pure +
    /// testable. The main-thread requirement is a hard correctness gate, not an
    /// optimization: `BubbleHeightCache` (and `BubbleContent ==`) are @MainActor,
    /// bridged via `assumeIsolated`, which traps on any other thread.
    static func cacheUsable(proposedWidth: CGFloat, isMainThread: Bool) -> Bool {
        proposedWidth.isFinite && isMainThread
    }

    private func measuredSize(proposal: ProposedViewSize, subviews: Subviews) -> CGSize {
        guard let body = subviews.first else { return .zero }
        // Probe the body's INTRINSIC height (`height: nil`), never the proposed
        // height. A link-preview body hosts a `LinkPreviewCard` whose
        // `.frame(minHeight: 64)` has no maximum, so when handed the incoming
        // proposal's height it grows to FILL it — and since this measured size
        // becomes the parent's next proposal, the height runs away in a feedback
        // loop (observed: a 213→383 inflation, leaving ~170pt of empty bubble
        // that the next message overlapped into). `placeSubviews` already probes
        // with `height: nil`; measuring the same way here keeps the reported
        // height equal to the placed height (no cell-height drift).
        let bodyProbe = body.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
        guard subviews.count > 1 else { return bodyProbe }

        let footer = subviews[1]
        let footerFloor = footer.sizeThatFits(.unspecified).width
        let width = max(bodyProbe.width, footerFloor)
        // Re-measure the body subtree only when the footer floor widened the
        // bubble past the body's natural width. When `width == bodyProbe.width`
        // (the common case: a multi-word message already wider than its meta
        // row), `bodyProbe.height` is already the height at this width — the
        // second measure was a redundant full-subtree pass, and that pass is the
        // #1 CPU self-time during scroll. The placement pass (`placeSubviews`)
        // still re-measures unconditionally, so alignment is unaffected.
        let bodyHeight = Self.bodyHeight(bodyProbe: bodyProbe, resolvedWidth: width) {
            body.sizeThatFits(ProposedViewSize(width: $0, height: nil)).height
        }
        let footerHeight = footer.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        return CGSize(width: width, height: bodyHeight + spacing + footerHeight)
    }

    /// Body height to report for a resolved width, reusing the probe height when
    /// the resolved width equals the probed width (i.e. the footer floor did not
    /// widen the bubble). Pure + testable: the layout supplies the re-measure
    /// closure, which is invoked *only* when a re-measure is genuinely required.
    /// The `==` comparison is exact-safe: `resolvedWidth` is `max(bodyProbe.width,
    /// footerFloor)`, so when the footer does not widen it is literally the same
    /// `bodyProbe.width` value (no float drift).
    static func bodyHeight(
        bodyProbe: CGSize,
        resolvedWidth: CGFloat,
        remeasure: (CGFloat) -> CGFloat
    ) -> CGFloat {
        resolvedWidth == bodyProbe.width ? bodyProbe.height : remeasure(resolvedWidth)
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

// MARK: - Bubble height cache

/// Content-keyed height cache that short-circuits the (expensive) full
/// body-subtree measurement in `BubbleBodyFooterLayout.sizeThatFits` — the #1
/// CPU self-time during scroll. A hit requires the SAME message rendering the
/// SAME `BubbleContent` at the SAME (rounded) width.
///
/// Correctness boundary = `BubbleContent ==`: any height-affecting content
/// change (edit, arriving translation, secondary panel toggle, reactions,
/// attachment enrichment) produces a different value → a miss → a fresh
/// measure. This is the exact invariant the bubble's own equatable gate already
/// relies on, so the cache cannot be more stale than the rendered tree itself.
/// A recycled cell reused for a different message keys on a different id, never
/// reading another message's entry (the failure mode of the reverted
/// width-only `Layout.Cache`, d6ba7f958).
///
/// `placeSubviews` is NEVER cached — it always re-measures the live content — so
/// the cache only affects the *reported* size, not placement. The cache is
/// flushed on Dynamic Type change and on memory warning; width buckets quantize
/// to the nearest point so sub-pixel proposal jitter still hits, and a rotation
/// (different proposed width) naturally misses. Expandable bubbles (text beyond
/// the truncation limit, whose height depends on per-cell `isExpanded` @State)
/// opt out at the call site rather than caching a state this key cannot see.
///
/// `@MainActor`: `BubbleContent`'s equality is main-actor isolated, so the
/// cache shares that isolation and needs no lock. The layout pass is NOT
/// guaranteed to run on the main thread (iOS 26 measures cells on
/// com.apple.SwiftUI.AsyncRenderer) — `sizeThatFits` therefore only consults
/// this cache after proving `Thread.isMainThread` (see `cacheUsable`); off-main
/// passes measure directly without touching it. The system observers fire on
/// the main queue; the flush closure re-enters via `assumeIsolated`.
@MainActor
final class BubbleHeightCache {
    static let shared = BubbleHeightCache(observeSystemEvents: true)

    private struct Entry {
        let content: BubbleContent
        let widthBucket: CGFloat
        let size: CGSize
    }

    private var entries: [String: Entry] = [:]
    private let capacity: Int

    init(capacity: Int = 3000, observeSystemEvents: Bool = false) {
        self.capacity = capacity
        guard observeSystemEvents else { return }
        let center = NotificationCenter.default
        let flush: @Sendable (Notification) -> Void = { _ in
            MainActor.assumeIsolated { BubbleHeightCache.shared.removeAll() }
        }
        center.addObserver(forName: UIContentSizeCategory.didChangeNotification, object: nil, queue: .main, using: flush)
        center.addObserver(forName: UIApplication.didReceiveMemoryWarningNotification, object: nil, queue: .main, using: flush)
    }

    private static func bucket(_ width: CGFloat) -> CGFloat { width.rounded() }

    func size(messageId: String, content: BubbleContent, width: CGFloat) -> CGSize? {
        guard let entry = entries[messageId],
              entry.widthBucket == Self.bucket(width),
              entry.content == content else { return nil }
        return entry.size
    }

    func store(messageId: String, content: BubbleContent, width: CGFloat, size: CGSize) {
        // Bound growth: one entry per message id, reset wholesale on overflow
        // (a cold re-measure is cheap next to a scroll's worth of hits).
        if entries[messageId] == nil, entries.count >= capacity {
            entries.removeAll(keepingCapacity: true)
        }
        entries[messageId] = Entry(content: content, widthBucket: Self.bucket(width), size: size)
    }

    func removeAll() {
        entries.removeAll(keepingCapacity: true)
    }

    var count: Int { entries.count }
}

