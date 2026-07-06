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
    /// Composant unifié « Enregistrer » : déclenché par l'action `.saveMedia`
    /// (message à exactement un attachment enregistrable).
    var onSaveMedia: (() -> Void)? = nil
    var onShowThread: (() -> Void)?

    // Full bubble-rendering context — when `messageBubbleFrame != .zero`, the
    // overlay renders a REAL `ThemedMessageBubble` at the source position
    // instead of the custom `messagePreview` (which had drifted from the
    // in-conversation rendering). Defaults stay safe for legacy call sites.
    var isDirect: Bool = false
    var preferredTranslation: MessageTranslation? = nil
    var mentionDisplayNames: [String: String] = [:]
    var currentUserId: String = ""
    var userRegionalLanguage: String? = nil
    var userCustomDestinationLanguage: String? = nil
    /// Callback invoqué quand l'utilisateur tape "Traduire" dans la quick
    /// action bar — ouvre l'écran de détail sur l'onglet Langue côté
    /// ConversationView.
    var onShowTranslate: (() -> Void)? = nil
    /// Ouvre la feuille « Plus… » native (MessageMoreSheet) — action `.more`
    /// de la liste verticale.
    var onShowMore: (() -> Void)? = nil
    /// Ouvre le picker d'emoji complet (bouton `+` de la barre de réactions).
    var onExpandFullPicker: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isDark: Bool { colorScheme == .dark }
    @State private var isVisible = false
    @State private var dragOffset: CGFloat = 0
    @State private var forceTab: DetailTab? = nil
    @State private var isEmojiPickerOpen = false

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

    // MARK: - Quick Action Bar (au-dessus de la bulle)

    /// Capsule horizontale d'actions rapides affichée AU-DESSUS de la
    /// bulle quand le long-press surfaces le menu. Réutilise les facteurs
    /// `ContextAction.copy/edit/translate/delete`. Filtre les actions
    /// selon le contexte (canEdit, canDelete, contenu non vide).
    private var quickActions: [ContextAction] {
        var actions: [ContextAction] = []
        if !message.content.isEmpty {
            actions.append(.copy())
        }
        if canEdit && message.isMe {
            actions.append(.edit())
        }
        actions.append(.translate())
        if canDelete {
            actions.append(.delete())
        }
        return actions
    }

    /// Palette utilisée par la quick action bar — dérivée de `contactColor`
    /// (couleur d'accent de la conversation, règle CLAUDE.md).
    private var quickActionPalette: ConversationColorPalette {
        ConversationColorPalette(
            primary: contactColor,
            secondary: contactColor,
            accent: contactColor,
            saturationBoost: 0
        )
    }

    private func handleQuickAction(_ kind: ContextAction.Kind) {
        switch kind {
        case .copy:
            onCopy?()
        case .edit:
            onEdit?()
        case .translate:
            onShowTranslate?()
        case .delete:
            onDelete?()
        case .reply, .forward, .react, .pin, .star, .thread, .info:
            break
        }
        dismiss()
    }

    // MARK: - Primary Actions (liste verticale native-lean)

    private var menuContext: MessageMenuContext {
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let hasMedia = !message.attachments.isEmpty
        let hasTimebased = message.attachments.contains {
            AttachmentKind(mimeType: $0.mimeType).hasTimebasedTrack
        }
        return MessageMenuContext(
            isMine: message.isMe,
            canEdit: canEdit,
            canDelete: canDelete,
            hasText: hasText,
            hasMedia: hasMedia,
            hasTimebasedMedia: hasTimebased,
            isPinned: message.pinnedAt != nil,
            isStarred: isStarred,
            isEdited: message.isEdited,
            // Inerte ici : `menuContext` n'alimente que `primaryActions`, qui
            // n'utilise PAS `hasEditRevisions`. Ce champ ne pilote que l'item
            // `.history` de la feuille « Plus… », dont le contexte est construit
            // séparément (ConversationView) avec la vraie valeur
            // `!editRevisions(for:).isEmpty`.
            hasEditRevisions: true,
            saveableAttachmentCount: message.attachments.filter { $0.type != .location }.count
        )
    }

    private var primaryActions: [PrimaryAction] {
        MessageActionResolver.primaryActions(menuContext)
    }

    private func handlePrimaryAction(_ action: PrimaryAction) {
        switch action {
        case .edit:
            onEdit?()
        case .translate:
            onShowTranslate?()
        case .copy:
            onCopy?()
        case .saveMedia:
            onSaveMedia?()
        case .pin, .unpin:
            onPin?()
        case .star, .unstar:
            onToggleStar?()
        case .more:
            onShowMore?()
        case .delete:
            onDelete?()
        }
        dismiss()
    }


    var body: some View {
        GeometryReader { geometry in
            let safeTop = geometry.safeAreaInsets.top
            let safeBottom = geometry.safeAreaInsets.bottom
            let screenH = geometry.size.height

            // Cluster vertical au-dessus du `dismissBackground` :
            //   - quick action bar (capsule horizontale d'actions rapides)
            //   - gap 12pt
            //   - bulle (à sa position source, lift si nécessaire)
            //   - gap 12pt
            //   - barre d'emojis rapides
            // Le panneau reste ANCRÉ au bas mais sa hauteur s'auto-étend
            // pour combler l'espace entre le cluster et le bas — pas de
            // grand vide quand le message est court / haut sur l'écran.
            let useSourceFrame = messageBubbleFrame != .zero
            let bubbleRect = messageBubbleFrame

            // Bubble preview scale — proportionnel pour les bulles trop hautes
            // (reply + grid attachement, vidéo, etc.). On cap visuellement à
            // ~320pt de hauteur tout en préservant exactement l'aspect ratio
            // (.scaleEffect uniforme). Scale floor à 0.55 pour rester lisible.
            let maxPreviewHeight: CGFloat = 320
            let bubblePreviewScale: CGFloat = bubbleRect.height > maxPreviewHeight
                ? max(0.55, maxPreviewHeight / bubbleRect.height)
                : 1.0
            let scaledBubbleHeight = bubbleRect.height * bubblePreviewScale

            // Mesures du cluster — gaps tightement contrôlés. Heights basées
            // sur les rendus réels mesurés en simulateur.
            let quickActionsCount = quickActions.count
            // Hauteur réelle = ContextActionMenu.estimatedSize().height
            // (buttonHeight 40 + verticalPadding 5*2 = 50pt). Source unique
            // de vérité : changer la valeur via les statics du menu, jamais
            // dupliquer le calcul ici.
            let quickActionMenuHeight: CGFloat = quickActionsCount > 0
                ? ContextActionMenu.estimatedSize(actionCount: max(1, quickActionsCount)).height
                : 0
            let quickActionToBubbleGap: CGFloat = quickActionsCount > 0 ? 14 : 0
            let bubbleToEmojiGap: CGFloat = 14
            let emojiBarHeight: CGFloat = 44
            let clusterClearance: CGFloat = 12
            let clusterTotalHeight = quickActionMenuHeight + quickActionToBubbleGap
                                   + scaledBubbleHeight
                                   + bubbleToEmojiGap + emojiBarHeight

            // Hauteur naturelle du panel (base avant resize manuel)
            let naturalPanelBaseHeight = gridVisibleHeight + safeBottom + 60
            let naturalPanelTopY = screenH - naturalPanelBaseHeight

            // Position cible du cluster : la bulle reste à sa source. Le
            // cluster top = bubble.minY - (quick action menu + gap). Si la
            // bulle est trop haute pour laisser de la place à la quick
            // action bar au-dessus de safeTop, on pousse le cluster vers le
            // bas (la bulle décale légèrement). Si le cluster dépasse en
            // bas dans la zone du panel, on lifte.
            let minClusterTopY = safeTop + 24
            let maxClusterTopY = naturalPanelTopY - clusterClearance - clusterTotalHeight
            let desiredClusterTopY = bubbleRect.minY - (quickActionMenuHeight + quickActionToBubbleGap)
            let clampedClusterTopY = max(minClusterTopY, min(desiredClusterTopY, maxClusterTopY))
            let clusterBottomY = clampedClusterTopY + clusterTotalHeight

            // Panel auto-expand : si le cluster termine plus haut que le
            // panel naturel, le panel s'agrandit pour combler le gap (le
            // top du panel monte jusqu'à clusterBottom + clearance).
            let expandedPanelTopY = useSourceFrame ? (clusterBottomY + clusterClearance) : naturalPanelTopY
            let panelBaseHeight = max(naturalPanelBaseHeight, screenH - expandedPanelTopY)

            // Drag range : 0 = base, négatif = expansion vers le haut.
            // L'utilisateur peut tirer le drag handle pour agrandir (jusqu'à
            // safeTop + 20pt) ou laisser au repos (panel à sa base auto-
            // étendue).
            let maxExpandUp = -(screenH - panelBaseHeight - safeTop - 20)
            let clampedDrag = min(0, max(maxExpandUp, dragOffset))

            // Fade out de la cluster (action bar + bulle + emoji bar) quand
            // l'utilisateur déplie le panneau via le drag handle. Au-delà de
            // 80pt de drag, la cluster est masquée + non-interactive pour
            // laisser place au panneau en plein écran. Comportement type
            // WhatsApp / iMessage.
            let clusterFadeThreshold: CGFloat = 80
            let clusterFadeOpacity: CGFloat = max(0, 1 - abs(clampedDrag) / clusterFadeThreshold)
            let clusterIsInteractive = clusterFadeOpacity > 0.5

            // ── Géométrie native-lean : barre réactions (haut) + bulle + liste verticale (bas) ──
            let nlEmojiBarHeight: CGFloat = 52
            let nlGap: CGFloat = 12
            let nlSidePadding: CGFloat = 16
            let nlMenuWidth: CGFloat = MessageActionsMenu.menuWidth
            let nlMenuHeight: CGFloat = MessageActionsMenu.estimatedSize(actionCount: primaryActions.count).height
            let nlEmojiWidth: CGFloat = 300
            let nlAvailTop = safeTop + 12
            let nlAvailBottom = screenH - safeBottom - 12
            let nlAvailable = max(160, nlAvailBottom - nlAvailTop)
            let nlChrome = nlEmojiBarHeight + nlGap * 2 + nlMenuHeight
            let nlFitScale: CGFloat = (scaledBubbleHeight + nlChrome > nlAvailable)
                ? max(0.4, min(bubblePreviewScale, max(60, nlAvailable - nlChrome) / max(1, bubbleRect.height)))
                : bubblePreviewScale
            let nlBubbleW = bubbleRect.width * nlFitScale
            let nlBubbleH = bubbleRect.height * nlFitScale
            let nlClusterH = nlEmojiBarHeight + nlGap + nlBubbleH + nlGap + nlMenuHeight
            let nlAnchorX: CGFloat = message.isMe
                ? bubbleRect.maxX - nlBubbleW / 2
                : bubbleRect.minX + nlBubbleW / 2
            let nlDesiredTop = bubbleRect.minY - nlEmojiBarHeight - nlGap
            let nlClusterTop = max(nlAvailTop, min(nlDesiredTop, nlAvailBottom - nlClusterH))
            let nlEmojiY = nlClusterTop + nlEmojiBarHeight / 2
            let nlBubbleTop = nlClusterTop + nlEmojiBarHeight + nlGap
            let nlBubbleMidY = nlBubbleTop + nlBubbleH / 2
            let nlMenuY = nlBubbleTop + nlBubbleH + nlGap + nlMenuHeight / 2
            let nlMenuX = max(nlSidePadding + nlMenuWidth / 2, min(geometry.size.width - nlSidePadding - nlMenuWidth / 2, nlAnchorX))
            let nlEmojiX = max(nlSidePadding + nlEmojiWidth / 2, min(geometry.size.width - nlSidePadding - nlEmojiWidth / 2, nlAnchorX))

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

                    if !useSourceFrame {
                        // Legacy : Apercu centré dans le VStack — animation
                        // composite (zoom-spring depuis le coin natif de la
                        // bulle + leger glissement vertical). Conservé pour
                        // les call sites qui ne fournissent pas encore la
                        // source frame.
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
                    }

                    if !useSourceFrame {
                        // Legacy : la barre d'emojis vit dans le VStack juste
                        // au-dessus du panneau (path conservé pour call sites
                        // sans frame source).
                        HStack(spacing: 0) {
                            if message.isMe { Spacer(minLength: 0) }
                            emojiQuickBar
                            if !message.isMe { Spacer(minLength: 0) }
                        }
                        .padding(.horizontal, 14)
                        .opacity(isVisible ? 1 : 0)
                        .scaleEffect(isVisible ? 1.0 : 0.7, anchor: .center)
                        .offset(y: isVisible ? 0 : 18)
                    }

                    // Panneau grille retiré (native-lean) — les détails
                    // passent désormais par la feuille « Plus… » (MessageMoreSheet).
                }

                if useSourceFrame {
                    // Liste d'actions verticale EN-DESSOUS de la bulle
                    // (native-lean). Icônes monochromes accent, destructif
                    // rouge isolé. Remplace la capsule horizontale + la grille.
                    MessageActionsMenu(
                        actions: primaryActions,
                        accentHex: contactColor,
                        onSelect: { handlePrimaryAction($0) }
                    )
                    .position(
                        x: nlMenuX,
                        y: isVisible ? nlMenuY : (bubbleRect.maxY + 8)
                    )
                    .opacity(isVisible ? 1 : 0)
                    .scaleEffect(isVisible ? 1.0 : 0.85, anchor: .top)

                    // FIDÉLITÉ — vrai `ThemedMessageBubble` avec les mêmes
                    // paramètres que la cellule live de la liste : rendu
                    // (texte, traductions, drapeaux, médias, réactions,
                    // footer) rigoureusement identique. Wrapping HStack +
                    // Spacer reproduit l'alignement isMe (right) / received
                    // (left) de la cellule. Positionnement par .position()
                    // au centre Y final calculé plus haut (clamp safeTop ↔
                    // panel.top).
                    // Bubble preview rendu à la largeur source (proportions
                    // intactes du contenu) PUIS .scaleEffect uniforme pour
                    // réduire visuellement les bulles trop grosses (vidéo,
                    // grilles d'images, reply + grid). L'outer frame avec les
                    // dimensions scaled informe le layout SwiftUI de la taille
                    // visible — la position du cluster (action bar / emoji
                    // bar) reste cohérente.
                    ThemedMessageBubble(
                        message: message,
                        contactColor: contactColor,
                        isDirect: isDirect,
                        isDark: isDark,
                        transcription: transcription,
                        translatedAudios: translatedAudios,
                        textTranslations: textTranslations,
                        preferredTranslation: preferredTranslation,
                        showAvatar: !isDirect,
                        isLastInGroup: true,
                        isLastReceivedMessage: true,
                        isLastSentMessage: true,
                        mentionDisplayNames: mentionDisplayNames,
                        currentUserId: currentUserId,
                        userLanguages: (
                            regional: userRegionalLanguage,
                            custom: userCustomDestinationLanguage
                        )
                    )
                    .frame(width: bubbleRect.width, height: bubbleRect.height, alignment: .leading)
                    .scaleEffect(nlFitScale, anchor: .center)
                    .frame(width: nlBubbleW, height: nlBubbleH)
                    .position(
                        x: nlAnchorX,
                        y: isVisible ? nlBubbleMidY : bubbleRect.midY
                    )
                    .opacity(isVisible ? 1 : 0)
                    .allowsHitTesting(false)

                    // Barre de réactions AU-DESSUS de la bulle (native-lean).
                    emojiQuickBar
                        .position(
                            x: nlEmojiX,
                            y: isVisible ? nlEmojiY : bubbleRect.minY
                        )
                        .opacity(isVisible ? 1 : 0)
                        .scaleEffect(isVisible ? 1.0 : 0.7, anchor: .center)
                        .allowsHitTesting(true)
                }
            }
        }
        .ignoresSafeArea()
        .onAppear {
            HapticFeedback.medium()
            // Entree spring — courbe de reponse de qualite iMessage. Le
            // panneau demarre REPLIE (`dragOffset = 0`) pour laisser le
            // preview de bulle occuper la scene. La cascade d'emojis est
            // jouee par `EmojiReactionPicker` lui-meme via `WaveTileModifier`.
            withAnimation(.spring(response: 0.42, dampingFraction: 0.74)) {
                isVisible = true
                dragOffset = 0
            }
        }
    }

    // MARK: - Emoji Quick Bar (EmojiReactionPicker — shared component)

    private var emojiQuickBar: some View {
        // Shared `EmojiReactionPicker` (MeeshyUI) — meme call-site que le
        // strip inline du long-press (`ConversationView+MessageRow`) pour
        // garder les deux surfaces visuellement identiques. Le composant
        // embarque deja son chrome (capsule glass + shadow), son padding
        // interne et la cascade d'entree gauche→droite (`WaveTileModifier`),
        // donc aucun wrapper supplementaire ici.
        let topEmojis = EmojiUsageTracker.topEmojis(count: 20, defaults: defaultEmojis)
        return EmojiReactionPicker(
            quickEmojis: topEmojis,
            style: isDark ? .dark : .light,
            scrollable: true,
            onReact: { emoji in
                EmojiUsageTracker.recordUsage(emoji: emoji)
                onReact?(emoji)
                dismiss()
            },
            onExpandFullPicker: {
                HapticFeedback.light()
                onExpandFullPicker?()
                dismiss()
            }
        )
        .frame(maxWidth: 280)
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
            maxWidth: DeviceLayout.bubbleMaxWidth(containerWidth: UIScreen.main.bounds.width, sizeClass: horizontalSizeClass),
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
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(Color(hex: color))

            Text("·")
                .font(MeeshyFont.relative(13))
                .foregroundColor(theme.textMuted)

            Text(formatExactDate(message.createdAt))
                .font(MeeshyFont.relative(12))
                .foregroundColor(theme.textMuted)
        }
    }

    private func formatExactDate(_ date: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(date) {
            return date.formatted(.dateTime.hour().minute())
        } else if calendar.isDateInYesterday(date) {
            let time = date.formatted(.dateTime.hour().minute())
            let yesterday = String(localized: "time.long.yesterday", defaultValue: "Hier", bundle: .main)
            return "\(yesterday) \(time)"
        } else {
            return date.formatted(.dateTime.day().month(.abbreviated).year().hour().minute())
        }
    }

    @ViewBuilder
    private var previewContent: some View {
        let hasText = !message.content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        // Family dispatch via `AttachmentKind` — single source of truth.
        let images = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .image }
        let videos = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .video }
        let audios = message.attachments.filter { AttachmentKind(mimeType: $0.mimeType) == .audio }
        let files = message.attachments.filter { !AttachmentKind(mimeType: $0.mimeType).isMedia }

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
                .font(MeeshyFont.relative(15))
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
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous))
        // Liseré subtil a la teinte de la bulle — donne du relief au
        // preview flottant sans alourdir la lecture.
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)
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
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
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
                // Decorative glyph inside a fixed 36×36 badge — kept fixed so
                // it never overflows the badge; filename text carries the label.
                Image(systemName: "doc.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(accent)
                    .accessibilityHidden(true)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(attachment.originalName.isEmpty ? attachment.fileName : attachment.originalName)
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                Text(formatFileSize(attachment.fileSize))
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
            }

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
            label: String(localized: "action.reply", defaultValue: "Répondre", bundle: .main),
            color: MeeshyColors.indigo400,
            handler: { dismissThen { onReply?() } }
        ))

        actions.append(MessageAction(
            id: "thread", icon: "bubble.left.and.bubble.right.fill",
            label: String(localized: "action.thread", defaultValue: "Discussion", bundle: .main),
            color: MeeshyColors.warning,
            handler: { dismissThen { onShowThread?() } }
        ))

        if hasText {
            actions.append(MessageAction(
                id: "copy", icon: "doc.on.doc.fill",
                label: String(localized: "action.copy", defaultValue: "Copier", bundle: .main),
                color: MeeshyColors.indigo500,
                handler: { dismissThen { onCopy?() } }
            ))
        }

        actions.append(MessageAction(
            id: "pin",
            icon: message.pinnedAt != nil ? "pin.slash.fill" : "pin.fill",
            label: message.pinnedAt != nil
                ? String(localized: "action.unpin", defaultValue: "Désépingler", bundle: .main)
                : String(localized: "action.pin", defaultValue: "Épingler", bundle: .main),
            color: MeeshyColors.info,
            handler: { dismissThen { onPin?() } }
        ))

        // Star / bookmark — local-only favourite list (see StarredMessagesView).
        actions.append(MessageAction(
            id: "star",
            icon: isStarred ? "star.slash.fill" : "star.fill",
            label: isStarred
                ? String(localized: "action.unstar", defaultValue: "Retirer des favoris", bundle: .main)
                : String(localized: "action.star", defaultValue: "Ajouter aux favoris", bundle: .main),
            color: MeeshyColors.warning,
            handler: { dismissThen { onToggleStar?() } }
        ))

        if canEdit && hasText {
            actions.append(MessageAction(
                id: "edit", icon: "pencil",
                label: String(localized: "action.edit", defaultValue: "Modifier", bundle: .main),
                color: MeeshyColors.warning,
                handler: { dismissThen { onEdit?() } }
            ))
        }

        if canDelete && !message.attachments.isEmpty, let onDeleteAttachment {
            if message.attachments.count == 1 {
                let attId = message.attachments[0].id
                actions.append(MessageAction(
                    id: "deleteAttachment", icon: "paperclip.badge.ellipsis",
                    label: String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main),
                    color: MeeshyColors.error,
                    handler: { dismissThen { onDeleteAttachment(attId) } }
                ))
            }
        }

        return actions
    }

    // MARK: - Helpers

    private func formatFileSize(_ bytes: Int) -> String {
        AttachmentDownloader.fmt(Int64(bytes))
    }

    // MARK: - Dismiss

    private func dismiss() {
        HapticFeedback.light()
        // Sortie : l'overlay se retracte vers le coin natif de la bulle.
        // La cascade d'entree des emojis n'a pas de symetrique a la sortie
        // (le composant partage gere son propre cycle de vie).
        withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            isPresented = false
        }
    }

    private func dismissThen(_ action: @escaping () -> Void) {
        HapticFeedback.light()
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
                            // Glyph inside a fixed 40×40 circle — kept fixed to
                            // stay centred; the Button carries the a11y label.
                            Image(systemName: player.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(accent)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(player.isPlaying
                    ? String(localized: "media.pauseAudio", defaultValue: "Mettre en pause", bundle: .main)
                    : String(localized: "media.playAudio", defaultValue: "Lire l'audio", bundle: .main))
                .accessibilityHint(String(format: String(localized: "media.audioHint", defaultValue: "Audio de %@", bundle: .main), player.timeLabel(totalDuration: attachment.duration)))

                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.originalName.isEmpty ? "Audio" : attachment.originalName)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)

                    Text(player.timeLabel(totalDuration: attachment.duration))
                        .font(MeeshyFont.relative(11, weight: .medium))
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
                        .font(MeeshyFont.relative(11, weight: .semibold))
                        .foregroundColor(accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(accent.opacity(0.12)))
                }
            }

            HStack(spacing: 8) {
                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipBack5s", defaultValue: "Skip back 5 seconds", bundle: .main))

                Slider(
                    value: Binding(
                        get: { player.progress },
                        set: { player.seek(to: $0) }
                    ),
                    in: 0...1
                )
                .tint(accent)
                .accessibilityLabel(String(localized: "media.playbackPosition", defaultValue: "Playback position", bundle: .main))
                .accessibilityValue("\(player.percentInt) %")

                // Pourcentage d'avancement
                Text("\(player.percentInt)%")
                    .font(MeeshyFont.relative(11, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 36)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)
                    .accessibilityHidden(true)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipForward5s", defaultValue: "Skip forward 5 seconds", bundle: .main))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
                                // Glyph inside a fixed 52×52 play circle — kept
                                // fixed; the Button carries the a11y label.
                                Image(systemName: "play.fill")
                                    .font(.system(size: 20))
                                    .foregroundColor(.white)
                                    .offset(x: 2)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "media.playVideo", defaultValue: "Play video", bundle: .main))
                }
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 14, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 14))

            if !showThumbnail {
                videoControls
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
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
                            .font(MeeshyFont.relative(14, weight: .semibold))
                            .foregroundColor(accent)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(player.isPlaying
                    ? String(localized: "media.pauseVideo", defaultValue: "Mettre la vidéo en pause", bundle: .main)
                    : String(localized: "media.playVideo", defaultValue: "Lire la vidéo", bundle: .main))

                Button { player.skip(seconds: -5) } label: {
                    Image(systemName: "gobackward.5")
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipBack5s", defaultValue: "Skip back 5 seconds", bundle: .main))

                Text("\(player.percentInt)%")
                    .font(MeeshyFont.relative(10, weight: .heavy, design: .monospaced))
                    .foregroundColor(player.percentInt == 0 ? theme.textMuted : accent)
                    .frame(minWidth: 32)
                    .contentTransition(.numericText())
                    .animation(.easeInOut(duration: 0.15), value: player.percentInt)
                    .accessibilityHidden(true)

                Button { player.skip(seconds: 5) } label: {
                    Image(systemName: "goforward.5")
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.skipForward5s", defaultValue: "Skip forward 5 seconds", bundle: .main))

                Spacer()

                Text(player.timeLabel(totalDuration: attachment.duration))
                    .font(MeeshyFont.relative(10, weight: .medium))
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
                .font(MeeshyFont.relative(10, weight: .semibold))
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
    /// Token for the `.AVPlayerItemDidPlayToEndTime` block observer. Held so
    /// `deinit` can remove it: `removeObserver(self)` does NOT remove block-based
    /// observers (their "observer" is this returned token, not `self`), so
    /// without it the observer leaked once per playback / per preview.
    nonisolated(unsafe) private var endObserver: (any NSObjectProtocol)?
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
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
        endObserver = NotificationCenter.default.addObserver(
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
        if let endObserver { NotificationCenter.default.removeObserver(endObserver) }
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
