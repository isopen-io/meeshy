// MARK: - Standard Bubble Layout
//
// Was: the body of `ThemedMessageBubble.messageContent` (Task-14 pivot of the
// bubble-decompose refactor). This view orchestrates rendering for the
// `.standard` kind — every other kind (`.deleted`, `.viewOnceSealed`, `.viewOnceOpened`,
// `.ephemeralExpired`) is dispatched in `ThemedMessageBubble.body` and never
// reaches this view.
//
// State ownership note: most `@State` lives in `ThemedMessageBubble` so
// the public init API of the wrapper stays unchanged. We accept those values
// via `@Binding` here so the orchestrator stays a leaf-friendly composition
// of sub-views (Bubble*Indicator, BubbleQuotedReply, BubbleAttachmentView,
// BubbleExpandableText, BubbleSecondaryContent, BubbleReactionsOverlay,
// BubbleBackground, MessageProtectionChrome, BubbleMediaTimestampOverlay…).
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

/// Enveloppe `Identifiable` d'un `SharedPlace` pour `.fullScreenCover(item:)` —
/// `SharedPlace` (SDK) n'est pas `Identifiable` et n'a pas à l'être : l'identité
/// d'un lieu affiché est sa paire de coordonnées.
struct BubbleFullscreenPlace: Identifiable {
    let place: SharedPlace
    var id: String { "\(place.latitude),\(place.longitude)" }
}

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
    let presenceState: PresenceState?
    let senderIsHere: ConversationHere
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
    /// LOI DES ZONES (2026-08-24) — ZONE 1 de la citation : l'avatar de
    /// l'auteur cite ouvre son profil. Resolution hote
    /// (`MessageListViewController.openQuotedAuthorProfile`), comme
    /// `onMediaTap`. `nil` ⇒ zone non armee, le tap retombe sur la zone 3.
    let onQuotedAuthorTap: ((ReplyReference) -> Void)?
    /// LOI DES ZONES — ZONE 2 : la miniature ou l'icone de lecture ouvre le
    /// media cite en plein ecran (`openQuotedMedia`). Meme regle de nullite.
    let onQuotedMediaTap: ((ReplyReference) -> Void)?
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
    /// Cold-open (F1) : nom de conversation / file "à suivre" — forwardés
    /// tels quels jusqu'à `AudioMediaView.conversationName` /
    /// `.audioQueueTailProvider` (single-track ET carousel), pour que le
    /// plein écran audio ouvert SANS lecture déjà active porte la même
    /// carte Now Playing / avance auto que le chemin `playAudio` existant.
    let conversationName: String?
    let audioQueueTailProvider: ((String) -> [QueuedAudio])?

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
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil
    /// Rendu « standalone » (aperçu du `.contextMenu` natif) : supprime les
    /// `Spacer(minLength: 50)` d'alignement de la row pour que la vue épouse la
    /// bulle. Défaut `false` — la cellule live garde ses spacers d'alignement.
    var standalone: Bool = false

    /// Lieu affiché en plein écran quand il vient de `message.location` (voie
    /// serveur actuelle). Les anciennes pièces jointes `.location` du cache
    /// local passent, elles, par `fullscreenLocationAttachment` (binding du
    /// wrapper) — deux états distincts car les véhicules diffèrent
    /// (`SharedPlace` vs `MessageAttachment`).
    @State private var fullscreenPlace: BubbleFullscreenPlace?

    func presentFullscreen(_ place: SharedPlace) {
        fullscreenPlace = BubbleFullscreenPlace(place: place)
    }

    // MARK: - Adaptive sizing (iPad regular size class needs a tighter cap)

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.bubbleContainerWidth) private var bubbleContainerWidth
    @Environment(\.bubbleSkin) var skin

    // MARK: - Layout constants

    let gridMaxWidth: CGFloat = 300
    let gridSpacing: CGFloat = 2

    // MARK: - Theme accessor

    var theme: ThemeManager { ThemeManager.shared }

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

    var audioAttachments: [MessageAttachment] {
        switch content.attachments {
        case .audio(let atts): return atts
        case .mixed(_, let audio, _): return audio
        case .none, .visualGrid, .nonMedia: return []
        }
    }

    var nonMediaAttachments: [MessageAttachment] {
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
        BubbleReactionsOverlay.isMounted(hasReactions: hasReactions, isMe: content.isMe, isLastReceivedMessage: isLastReceivedMessage)
    }

    private var bottomSpacing: CGFloat {
        // Espacement majore x1.6 (22 -> 35pt, 20 -> 32pt) quand un overlay
        // de reaction deborde sous la bulle, pour eviter que le bouton +
        // (face.smiling, hit-area 40pt) ou les pills ne tapent contre le
        // message suivant. Le facteur x1.6 garde une silhouette compacte
        // entre messages sans overlay, et offre une "respiration" claire
        // autour de ceux qui en ont.
        // Fin de groupe 10 → 6 (overlay 35 → 31) le 2026-08-21 : « réduit
        // l'espace entre les groupes de messages ».
        if isLastInGroup {
            return hasOverflowingOverlay ? 31 : 6
        }
        return hasOverflowingOverlay ? 32 : 2
    }

    var showIdentityBar: Bool {
        !isDirect && isLastInGroup && !content.isMe
    }

    var hasAnyTranslation: Bool { content.translation != nil }

    var effectiveContent: String {
        // Driven by `content.text?.raw` (post-translation, post-active-lang
        // resolution by BubbleContentBuilder). Falls back to `message.content`
        // only when the content has no text payload at all (attachment-only
        // bubble); legacy linkPreview/etc. read from this.
        content.text?.raw ?? message.content
    }

    var secondaryContent: String? {
        content.translation?.secondaryContent
    }

    var isEmojiOnly: Bool { content.isEmojiOnly }

    /// Cache key for `BubbleBodyFooterLayout`. nil (no caching) for expandable
    /// bubbles: their measured height depends on the host's expansion state
    /// (`longMessageExpansion`, #8147), which the content-keyed cache cannot
    /// observe — so a long message always measures live and never risks a stale
    /// collapsed/expanded height. Every other bubble keys on (id, content).
    var heightCacheContext: BubbleHeightCacheContext? {
        if let raw = content.text?.raw, LongMessageExcerpt.isLong(raw) {
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
    var hasBubbleBodyContent: Bool {
        // Lieu porté par `message.location` (voie serveur actuelle) — la bulle
        // a un corps à rendre même sans texte ni pièce jointe.
        if content.location != nil { return true }
        if !nonMediaAttachments.isEmpty { return true }
        if !(content.text?.raw.isEmpty ?? true) { return true }
        if content.text?.firstLinkURL != nil { return true }
        if secondaryContent != nil, secondaryLangCode != nil { return true }
        return false
    }

    var emojiFontSize: CGFloat {
        content.text?.emojiFontSize ?? 15
    }

    var timeString: String { content.meta.timeString }

    /// BUG3 — an outgoing message whose send failed (drives the orange retry band).
    var isFailedOutgoing: Bool {
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

    var reactionSummaries: [ReactionSummary] { content.reactions }

    /// VoiceOver phrasing for the quoted-reply context of this bubble, injected
    /// between the sender name and the body so the reading order is
    /// expediteur -> [reponse a...] -> contenu. Returns nil when the bubble is
    /// not a reply. The combined bubble element flattens the visual quote card's
    /// own sub-views, so this is the only way the reply reaches VoiceOver.
    var replyAccessibilityLabel: String? {
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

    /// **LOI DES ZONES — la moitié VoiceOver.** Site unique des deux rangées :
    /// `QuotedZoneAccessibility` (#8320), qui y ajoute l'écoute d'un audio cité
    /// et le saut au message cité.
    private var quotedZoneAccessibilityActions: some View {
        QuotedZoneAccessibility.actions(
            reference: content.reply?.reference,
            onQuotedAuthorTap: onQuotedAuthorTap,
            onQuotedMediaTap: onQuotedMediaTap,
            onReplyTap: onReplyTap
        )
    }

    /// Mentions d'accessibilité des contenus non média : lieu + fichiers.
    /// Pure et testable. Le lieu se déclenche sur `message.location` (voie
    /// serveur actuelle, `hasSharedPlace`) OU sur une ancienne pièce jointe
    /// `.location` du cache local — jamais les deux à la fois, le builder
    /// exclut la pièce jointe quand `message.location` est présent
    /// (cf. BubbleContentBuilder), donc la mention n'apparaît qu'une fois.
    static func nonMediaAccessibilityParts(
        hasSharedPlace: Bool,
        nonMedia: [MessageAttachment]
    ) -> [String] {
        MessageAccessibilityLabelComposer.nonMediaAccessibilityParts(hasSharedPlace: hasSharedPlace, nonMedia: nonMedia)
    }

    // MARK: - Body

    var body: some View {
        let isMe = content.isMe
        HStack(alignment: .bottom, spacing: 0) {
            if isMe && !standalone { Spacer(minLength: 50) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: MeeshySpacing.xs) {
                // Pin indicator
                if content.isPinned {
                    BubblePinnedIndicator()
                }

                // Forwarded indicator — la vue ne choisit plus qui nommer :
                // ForwardBadgePolicy tranche (groupe au moins public nommé,
                // cercle privé et type inconnu anonymes, tête-à-tête par
                // l'auteur), la bulle ne fait que rendre.
                // #5058 — l'attribution est portée par `BubbleContent`, résolue
                // une fois par `BubbleContentBuilder`. La bulle l'appelait
                // elle-même sur le `Message` ; la rangée plate n'avait pas ce
                // `Message` et retombait sur `.anonymous`. Un seul site résout
                // désormais, et les trois peaux rendent la MÊME chose.
                if let attribution = content.forwardAttribution {
                    BubbleForwardedIndicator(
                        isMe: isMe,
                        isDark: isDark,
                        attribution: attribution
                    )
                }

                // #7452 — LE chrome de protection, celui que les cinq modes
                // consomment. Il porte le décompte d'un éphémère (battu par
                // le système, sans minuteur de cellule), la désignation d'une
                // vue unique et celle d'un flou. Un badge peint ici serait un
                // sixième dialecte.
                MessageProtectionChrome(descriptor: content.protection, isDark: isDark)
                    .equatable()

                // Vue `3h` (#4098) — la story citée est une SCÈNE, et une
                // scène ne tient pas dans une bulle. Elle est posée ICI, au
                // même rang que l'épingle et le badge éphémère : au-dessus du
                // contenu, sur le fond de la conversation, jamais dans le
                // fond coloré de la bulle. C'est la hiérarchie de la planche.
                if let storyCitation = detachedStoryCitation {
                    BubbleStoryCitationCard(
                        reply: storyCitation,
                        isDark: isDark,
                        accentHex: contactColor,
                        onOpen: storyCitationOpenTap
                    )
                    .equatable()
                }

                // Message content — voilé tant que le lecteur n'a pas fait le
                // geste. #7452 : la VUE UNIQUE voile elle aussi (le texte
                // s'affichait en clair auparavant, voir
                // `MessageProtectionDescriptor.requiresVeil`).
                let shouldBlur = content.requiresVeil && !blurController.isRevealed

                ZStack {
                    contentStack(shouldBlur: shouldBlur)

                    if blurController.fogOpacity > 0 {
                        fogOverlay
                    }

                    // Blur peek: tap to reveal for N seconds, then auto re-blur
                    if content.requiresVeil && !blurController.isRevealed {
                        ProtectedVeilAffordance(
                            isViewOnce: content.veilConsumesViewOnce,
                            isDark: isDark,
                            hint: content.protectedTap().accessibilityHint,
                            onReveal: revealBlurredContent
                        )
                    }
                }
                // Les effets se posent sur LA BULLE (largeur intrinsèque du ZStack), avant l'overlay de réactions.
                .modifier(BubbleDragSourceModifier(source: BubbleDragPolicy.source(for: message, servedText: content.text?.raw,
                    isRegularWidth: horizontalSizeClass == .regular, standalone: standalone)))
                .messageEffects(message.effects)
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
                            .offset(y: BubbleReactionsOverlay.restingOffset)
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
            .frame(maxWidth: DeviceLayout.bubbleMaxWidth(sizeClass: horizontalSizeClass, containerWidth: bubbleContainerWidth), alignment: isMe ? .trailing : .leading)
            // Standalone (aperçu) : hug jusqu'au cap. `.fixedSize(horizontal:)`
            // fait remonter la largeur idéale du contenu (clampée au cap par le
            // `.frame(maxWidth:)` ci-dessus) → une bulle courte n'occupe plus
            // toute la largeur du cap, un texte long wrappe toujours au cap.
            .fixedSize(horizontal: standalone, vertical: false)

            if !isMe && !standalone { Spacer(minLength: 50) }
        }
        .padding(.bottom, bottomSpacing)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(messageAccessibilityLabel)
        .accessibilityActions { quotedZoneAccessibilityActions }
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
                let chosen = GalleryImageSource.fullscreenURL(for: attachment)
                let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                // Composant UNIFIÉ « Enregistrer » : le flow vit DANS le cover
                // pour que la sheet de destinations se présente par-dessus.
                SavableMediaFullscreen(attachment: attachment) { requestSave in
                    ImageFullscreen(
                        imageUrl: chosen.isEmpty ? nil : MeeshyConfig.resolveMediaURL(chosen),
                        accentColor: contactColor,
                        caption: caption,
                        mentionDisplayNames: mentionDisplayNames.isEmpty ? nil : mentionDisplayNames,
                        onSaveRequested: requestSave
                    )
                }
            case .video:
                if !attachment.fileUrl.isEmpty {
                    let caption = message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : message.content
                    let resolvedShareURL = MeeshyConfig.resolveMediaURL(attachment.fileUrl)
                    // Composant UNIFIÉ « Enregistrer » : flow DANS le cover
                    // (miroir du case .image ci-dessus).
                    SavableMediaFullscreen(attachment: attachment) { requestSave in
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
                                // Poster NET avant la première frame (feature 3) :
                                // résolu côté app, affiché par le SDK.
                                poster: VideoPosterResolver.poster(for: attachment),
                                onDownload: onDownload,
                                onShare: resolvedShareURL.map { url in
                                    {
                                        shareURL = url
                                        showShareSheet = true
                                    }
                                },
                                onClose: { fullscreenAttachment = nil },
                                onSaveRequested: requestSave
                            )
                        }
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
                ).closesForConversationOpening(.place)
            }
        }
        .fullScreenCover(item: $fullscreenPlace) { item in
            // Plein écran du lieu `message.location` — mêmes primitives que la
            // branche par pièce jointe ci-dessus, mais avec le nom et
            // l'adresse portés par `SharedPlace`.
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: contactColor,
                senderName: content.senderName
            ).closesForConversationOpening(.place)
        }
    }

    // MARK: - Content stack (text + media + reply, with blur mask)

    @ViewBuilder
    /// `AnyView` à la DÉCLARATION (2026-08-19) — voir `visualMediaGrid`.
    /// Ce corps est évalué sur `com.apple.uikit.datasource.diffing`, un thread
    /// à pile de **512 Ko** (moitié du main thread) : le budget d'imbrication
    /// y est deux fois plus serré.
    private func contentStack(shouldBlur: Bool) -> AnyView {
        AnyView(contentStackBody(shouldBlur: shouldBlur))
    }

    @ViewBuilder
    private func contentStackBody(shouldBlur: Bool) -> some View {
        let isMe = content.isMe
        VStack(alignment: isMe ? .trailing : .leading, spacing: MeeshySpacing.xs) {
            // Grille visuelle (images + videos) ou carrousel inline
            if !visualAttachments.isEmpty {
                if showCarousel {
                    carouselView
                        .background(Color.black)
                        .compositingGroup()
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        // Le pager du carrousel possède le glissement
                        // horizontal : le BubbleSwipeContainer parent
                        // désengage reply/forward tant que le carrousel est
                        // ouvert (retour grille → branche démontée →
                        // préférence retombe à false).
                        .preference(key: BubbleInlinePagingPreferenceKey.self, value: true)
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
                            if !content.hasTextOrNonMediaContent {
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
                                .padding(MeeshySpacing.sm)
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
                // UNE passe sur la liste conversation-entière (deux filtres avant).
                let pageItems = allAudioItems.filter { trackIDs.contains($0.id) }
                let perPageTranscriptions = Dictionary(
                    pageItems.compactMap { item in item.transcription.map { (item.id, $0) } },
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
                    pageItems.map { ($0.id, $0.translatedAudios) },
                    uniquingKeysWith: { first, _ in first }
                )
                let perPageTranslatedAudios = perAttachmentAudios.allSatisfy({ $0.value.isEmpty })
                    ? Dictionary(grouping: translatedAudios, by: { $0.attachmentId })
                    : perAttachmentAudios
                AudioStackView(
                    items: auds,
                    message: message,
                    contactColor: skin.accentHex(isMe: content.isMe, received: otherBubbleColor),
                    isDark: isDark,
                    accentColor: skin.accentHex(isMe: content.isMe, received: otherBubbleColor),
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
                    conversationName: conversationName,
                    audioQueueTailProvider: audioQueueTailProvider,
                    parentIsMe: content.isMe,
                    voiceConsentMissing: voiceConsentMissing,
                    onTapConsentNotice: onTapConsentNotice,
                    onOpenFullscreen: onMediaTap
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

            // Emoji-only: large emoji free-floating, no bubble. When it
            // quotes another message, only the small quote card is boxed and
            // the emoji sits below it, bubble-less (#10628).
            if content.emojiReplyFloatsBelowQuote {
                emojiReplyContent
            } else if isEmojiOnly {
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
        .modifier(BlurRevealModifier(isBlurrable: content.requiresVeil, shouldBlur: shouldBlur))
    }
}
