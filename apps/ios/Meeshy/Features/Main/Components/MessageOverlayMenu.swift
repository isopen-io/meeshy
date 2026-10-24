import SwiftUI
import Combine
import AVFoundation
import MeeshySDK
import MeeshyUI

// MARK: - MessageOverlayMenu

struct MessageOverlayMenu: View {
    let message: Message
    let contactColor: String
    /// Le cadre de la cellule pressée, en coordonnées de FENÊTRE (#11208) :
    /// l'aperçu s'ouvre À SA PLACE. `.zero` quand la cellule n'est pas
    /// matérialisée — l'aperçu se pose alors au centre, même loi de placement.
    /// Le corps ne le lit jamais tel quel : il le ramène d'abord dans son
    /// propre repère (`sourceFrame(windowFrame:containerOrigin:)`) — sur iPad,
    /// la conversation vit à droite de la colonne de gauche.
    let messageBubbleFrame: CGRect
    // `focalPreviewImage` a vécu ici : en mode Focal, l'aperçu élevé rendait
    // les PIXELS de la cellule vivante, capturés au geste. La capture, bornée
    // aux `bounds` de la cellule, tranchait l'identité et la barre de méta que
    // la rangée Focal pose À CHEVAL sur son cadre (directive 2026-08-23).
    // L'aperçu rendit ensuite une bulle générique, quel que soit le mode.
    // Depuis #11208 (décision #11204), il rend la cellule elle-même — la
    // rangée plate en Script et en Focal, la bulle ailleurs — entière, sans
    // capture (`MessageOverlayCellPreview`).
    @Binding var isPresented: Bool
    /// Le contexte du menu, posé par la fabrique UNIQUE (`MessageMenuContext.make`,
    /// #11214) : l'overlay ne recompose aucun verdict. `.closed` hors hôte.
    var menuContext: MessageMenuContext = .closed
    var onCopy: (() -> Void)?
    var onEdit: (() -> Void)?
    /// Répondre (#11214) — l'hôte compose la citation, comme la feuille « Plus… ».
    var onReply: (() -> Void)? = nil
    /// Réessayer un envoi raté.
    var onRetry: (() -> Void)? = nil
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    /// Ce que le fil sert pour CE message — drapeau, pistes, mode de lecture
    /// (#9010, #9259, #11208).
    var threadLanguage = ThreadLanguage()
    var onReact: ((String) -> Void)?
    /// Composant unifié « Enregistrer » : déclenché par l'action `.saveMedia`
    /// (message à exactement un attachment enregistrable).
    var onSaveMedia: (() -> Void)? = nil
    /// « Composer » — ouvre l'atelier sur le média reçu (lot 5, O13).
    /// L'overlay ne monte RIEN lui-même : il rend la main à son hôte, qui pose
    /// le même état de présentation que le second déclencheur (la feuille de
    /// transfert). Un montage ici en ferait un second contrat d'envoi.
    var onCompose: (() -> Void)? = nil
    /// **Sélectionner** (#4005, primaire depuis le 2026-08-27) — entre en mode
    /// sélection multiple, sème le message qui a déclenché le longpress.
    var onSelect: (() -> Void)? = nil
    /// **Supprimer le message** (`.deleteMessage`) — l'hôte ouvre la confirmation
    /// qui offre « pour tous », « retirer » ou « pour moi » selon les verdicts
    /// de la loi. Sans rappel, l'entrée n'est pas offerte (un contrôle existe
    /// s'il a un effet).
    var onDelete: (() -> Void)? = nil
    /// **Traduire sur l'appareil** (E2EE, verdict `.device`) — l'hôte passe par
    /// `DeviceTranslationCoordinator`. Sans rappel, « Traduire » n'est pas offert
    /// dans une conversation où le serveur ne lit pas le clair : la vue Langue
    /// ne sait demander qu'au serveur, qui refuse.
    var onTranslateOnDevice: (() -> Void)? = nil

    // Le contexte de rendu de la cellule : l'aperçu rend la MÊME bulle ou la
    // MÊME rangée que le fil, avec les mêmes entrées.
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
    /// Ouvre la feuille de détail d'un appel — action `.callDetail`, présente
    /// uniquement pour un message qui porte un `callSummary`. Cette
    /// destination vivait sur l'appui long de la carte d'appel ; l'appui long
    /// étant rendu au menu du message (directive 2026-08-24), elle entre dans
    /// le menu plutôt que de disparaître.
    var onShowCallDetail: (() -> Void)? = nil
    /// Ouvre la carte d'export — `true` pour l'« Export rapide » (format par défaut).
    var onExportImage: ((Bool) -> Void)? = nil
    /// Ouvre le picker d'emoji complet (bouton `+` de la barre de réactions).
    var onExpandFullPicker: (() -> Void)? = nil
    /// Arrivé EN CLAIR dans l'ère chiffrée de la conversation (#11380) :
    /// l'aperçu porte le marqueur que la cellule montre dans le fil.
    var isUnencrypted: Bool = false

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOverEnabled
    /// « Réduire les animations » (#11208) : l'entrée et la sortie deviennent un
    /// fondu bref, sans déplacement ni ressort.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var isDark: Bool { colorScheme == .dark }
    @State private var isVisible = false
    /// La hauteur NATURELLE de l'aperçu, mesurée à sa largeur (#11208). La
    /// rangée plate se pose plus étroite que sa cellule (16 pt de chaque bord) :
    /// son retour à la ligne, donc sa hauteur, n'est pas celle du fil. `nil`
    /// avant la première mesure — la hauteur de la cellule en tient lieu.
    @State private var measuredPreviewHeight: CGFloat?
    /// Classement des emojis rapides figé pour la durée de la présentation —
    /// cf. `emojiQuickBar`.
    @State private var cachedTopEmojis: [String]?
    /// Parcours vertical BRUT du doigt pendant le drag. Il se partage entre la
    /// réduction de l'aperçu (`MessageOverlayRevealLaw`, #9043) et l'offset du
    /// cluster (`MessageOverlayDragLaw.displayOffset`). `@GestureState` : reset
    /// automatique au release ET à l'annulation système du geste (appel
    /// entrant, background) — le cluster ne reste jamais figé hors position ;
    /// sans ressort sous Reduce Motion.
    @GestureState(reset: { _, transaction in
        transaction.animation = MainActor.assumeIsolated { UIAccessibility.isReduceMotionEnabled }
            ? nil
            : .spring(response: 0.35, dampingFraction: 0.75)
    })
    private var liveDragTranslation: CGFloat = 0
    /// Le facteur de réduction de l'aperçu GARDÉ au relâchement (#9043).
    /// `nil` tant qu'aucun geste n'a conclu : l'ouverture vaut alors
    /// `MessageOverlayRevealLaw.restingFactor` (réduit d'office sous VoiceOver).
    @State private var committedReveal: CGFloat?
    /// Haptic d'armement émis une seule fois par geste ; réarmé au release.
    @State private var dragHapticArmed = false
    /// La rangée plate de l'aperçu, construite une fois par jeu d'entrées : le
    /// corps se réévalue à chaque image du glissement (#11208).
    @State private var flatRowMemo = MessageOverlayFlatRowMemo()

    /// La durée du fondu qui remplace le ressort sous « Réduire les animations ».
    static let reducedMotionFadeDuration: TimeInterval = 0.18

    /// **Le cadre de la cellule, ramené de la fenêtre au repère de l'overlay**
    /// (#11208). La cellule le donne en coordonnées de fenêtre
    /// (`cellFrameInWindow`) ; l'overlay pose son aperçu en `.position` dans
    /// SON repère. Sur iPad, la conversation vit à droite de la colonne de
    /// gauche : sans la conversion, la bulle s'ouvrait décalée de la largeur de
    /// cette colonne, coupée au bord. Le cadre de la cellule commence au haut
    /// de sa bulle (la cellule n'a aucune marge verticale) : aucun retrait.
    /// `.zero` (aucune cellule) reste `.zero`.
    static func sourceFrame(windowFrame: CGRect, containerOrigin: CGPoint) -> CGRect {
        guard windowFrame != .zero else { return .zero }
        return windowFrame.offsetBy(dx: -containerOrigin.x, dy: -containerOrigin.y)
    }

    // Expanded emoji set — far more than fits in the viewport, so the
    // quick reaction strip becomes horizontally scrollable. The first 6
    // are the iMessage-style "popular" defaults (still visible without
    // any scroll); the tail extends with a curated selection so the
    // user always has something to discover when they swipe.
    static let defaultEmojis = [
        "😂", "❤️", "👍", "😮", "😢", "🔥",
        "🎉", "💯", "🥰", "😎", "🙏", "💀",
        "🤣", "✨", "👏", "🤔", "🥺", "😍",
        "🫶", "💪"
    ]

    // Accent couleur de la conversation — sert de teinte de marque pour
    // les lueurs, contours et ombres du chrome de l'overlay (panneau,
    // barre d'emojis). Distinct de `bubbleAccentHex` qui, lui, teinte
    // la bulle previsualisee selon l'expediteur.
    private var overlayAccent: Color { Color(hex: contactColor) }
    /// La peau de la bulle présentée, celle que le fil a résolue (#10753).
    private var previewSkin: BubbleSkin { BubbleSkinLedger.skin(for: message.conversationId, isDark: isDark) }

    /// Same blend recipe as `BubbleStandardLayout.otherBubbleColor` so the
    /// protected form of a received message keeps its blended sender / brand
    /// tone inside the overlay. Sent messages use the skin fill directly.
    private var bubbleAccentHex: String {
        if message.isMe {
            return previewSkin.sentFillHex
        }
        let senderHex = message.senderColor ?? contactColor
        return DynamicColorGenerator.blendTwo(
            senderHex,
            weight1: 0.30,
            MeeshyColors.brandPrimaryHex,
            weight2: 0.70
        )
    }

    // MARK: - Primary Actions (liste verticale native-lean)

    private var primaryActions: [PrimaryAction] {
        Self.reachable(
            MessageActionResolver.primaryActions(menuContext), context: menuContext,
            hasDeleteHandler: onDelete != nil, hasDeviceTranslationHandler: onTranslateOnDevice != nil)
    }

    /// **Un contrôle existe s'il a un effet** : on retire de la liste ce que
    /// l'hôte n'a pas câblé, au lieu de montrer une ligne qui ne fait rien.
    static func reachable(
        _ actions: [PrimaryAction],
        context: MessageMenuContext,
        hasDeleteHandler: Bool,
        hasDeviceTranslationHandler: Bool
    ) -> [PrimaryAction] {
        let translatesOnlyOnDevice = context.translatesOnDevice && !context.canTranslate
        return actions.filter { action in
            switch action {
            case .deleteMessage: return hasDeleteHandler
            case .translate: return !translatesOnlyOnDevice || hasDeviceTranslationHandler
            default: return true
            }
        }
    }

    /// **La barre d'emojis suit le verdict `canReact` de la loi** : message
    /// disparu, conversation fermée, lecteur non membre ou avis système n'ont
    /// pas de réaction à offrir. Une barre montée pour rien serait un contrôle
    /// que la passerelle refuse ensuite.
    static func showsEmojiQuickBar(for context: MessageMenuContext) -> Bool {
        context.canReact
    }

    private func handlePrimaryAction(_ action: PrimaryAction) {
        switch action {
        case .reply:
            onReply?()
        case .retry:
            onRetry?()
        case .openLink, .copyLink, .openInMaps, .copyAddress:
            performKindAction(action)
        case .edit:
            onEdit?()
        case .translate:
            if menuContext.translatesOnDevice && !menuContext.canTranslate {
                onTranslateOnDevice?()
            } else {
                onShowTranslate?()
            }
        case .copy:
            onCopy?()
        case .saveMedia:
            onSaveMedia?()
        case .compose:
            onCompose?()
        case .select:
            onSelect?()
        case .more:
            onShowMore?()
        case .deleteMessage:
            onDelete?()
        case .callDetail:
            onShowCallDetail?()
        case .addSticker:
            ReceivedStickerLedger.shared.addSticker(of: message)
        case .favoriteSticker, .unfavoriteSticker:
            HapticFeedback.light()
            MessageStickerFavorite.toggle(for: message.sticker)
        case .exportImage, .exportQuick:
            onExportImage?(action == .exportQuick)
        case .wholeMessage, .replyToPiece, .deletePiece, .forwardPiece:
            return
        }
        dismiss()
    }

    /// Les actions du TYPE (#11214) : la cible se relit sur le message, et la
    /// copie passe par la loi de sortie, comme « Copier ».
    private func performKindAction(_ action: PrimaryAction) {
        let place = message.location
        switch action {
        case .openLink:
            if let link = MessageKindTarget.openableLink(of: message) { openURL(link) }
        case .copyLink:
            if let link = MessageKindTarget.firstRawLink(in: message.content),
               MessageExitTransport.copy(link, of: message) { HapticFeedback.success() }
        case .openInMaps:
            if let url = place.flatMap({ MessageKindTarget.mapsURL(for: $0) }) { openURL(url) }
        case .copyAddress:
            if let place, MessageExitTransport.copy(MessageKindTarget.address(of: place), of: message) { HapticFeedback.success() }
        default:
            return
        }
    }

    var body: some View {
        GeometryReader { geometry in
            let safeTop = geometry.safeAreaInsets.top
            let safeBottom = geometry.safeAreaInsets.bottom
            let screenH = geometry.size.height
            let containerW = geometry.size.width

            // ── La face de l'aperçu : la cellule du fil, dans son mode (#11208) ──
            let kind = MessageOverlayPreviewKind.resolve(readingMode: threadLanguage.readingMode)
            let cellFrame = Self.sourceFrame(windowFrame: messageBubbleFrame, containerOrigin: geometry.frame(in: .global).origin)
            let hasSourceFrame = cellFrame != .zero
            // La rangée plate se pose sur toute la largeur (ses 16 pt de marge
            // sont dans l'aperçu) ; la bulle, sur la largeur de sa cellule.
            let previewW: CGFloat = kind == .bubble && cellFrame.width > 0 ? cellFrame.width : containerW
            let previewH: CGFloat = max(1, measuredPreviewHeight ?? cellFrame.height)
            let sourceRect = hasSourceFrame
                ? cellFrame
                : CGRect(x: (containerW - previewW) / 2, y: (screenH - previewH) / 2, width: previewW, height: previewH)

            // ── Géométrie native-lean : barre réactions (haut) + aperçu + liste verticale (bas) ──
            let showsEmojiBar = Self.showsEmojiQuickBar(for: menuContext)
            let nlEmojiBarHeight: CGFloat = showsEmojiBar ? 52 : 0
            let nlGap: CGFloat = showsEmojiBar ? 12 : 0
            // Écart aperçu → liste d'actions RÉDUIT (iMessage-like) : le menu colle
            // presque à l'aperçu, distinct du gap barre-réactions → aperçu.
            let nlMenuGap: CGFloat = 6
            let nlSidePadding: CGFloat = 16
            let nlMenuWidth: CGFloat = MessageActionsMenu.menuWidth
            let nlMenuHeight: CGFloat = MessageActionsMenu.estimatedSize(actionCount: primaryActions.count).height
            let nlEmojiWidth: CGFloat = Self.emojiBandWidth(available: containerW - 2 * nlSidePadding)
            let nlAvailTop = safeTop + 12
            let nlAvailBottom = screenH - safeBottom - 12
            let nlAvailable = max(160, nlAvailBottom - nlAvailTop)
            let nlChrome = nlEmojiBarHeight + nlGap + nlMenuGap + nlMenuHeight
            // L'aperçu se rend à l'échelle 1 ; il ne se réduit que s'il ne tient
            // pas, avec son chrome, dans la fenêtre — jamais sous 60 %
            // (`MessageOverlayPreviewFit`) : au-delà, il défile dans son cadre.
            let fit = MessageOverlayPreviewFit.resolve(naturalHeight: previewH, chromeHeight: nlChrome, available: nlAvailable)
            let nlFitScale: CGFloat = fit.scale
            let nlBubbleW = previewW * nlFitScale
            let nlBubbleH = fit.visibleHeight
            let nlClusterH = nlEmojiBarHeight + nlGap + nlBubbleH + nlMenuGap + nlMenuHeight
            let nlAnchorX: CGFloat = kind == .flatRow
                ? containerW / 2
                : (message.isMe ? sourceRect.maxX - nlBubbleW / 2 : sourceRect.minX + nlBubbleW / 2)
            // Le cluster part de la cellule et remonte quand elle est trop
            // basse : c'est lui qui bouge, jamais la liste (#11208).
            let nlDesiredTop = sourceRect.minY - nlEmojiBarHeight - nlGap
            let nlClusterTop = max(nlAvailTop, min(nlDesiredTop, nlAvailBottom - nlClusterH))
            let nlEmojiY = nlClusterTop + nlEmojiBarHeight / 2
            let nlBubbleTop = nlClusterTop + nlEmojiBarHeight + nlGap
            let nlBubbleMidY = nlBubbleTop + nlBubbleH / 2
            let nlSourceMidY = sourceRect.minY + nlBubbleH / 2
            let nlMenuY = nlBubbleTop + nlBubbleH + nlMenuGap + nlMenuHeight / 2
            let nlMenuX = max(nlSidePadding + nlMenuWidth / 2, min(containerW - nlSidePadding - nlMenuWidth / 2, nlAnchorX))
            let nlEmojiX = max(nlSidePadding + nlEmojiWidth / 2, min(containerW - nlSidePadding - nlEmojiWidth / 2, nlAnchorX))
            // Sous « Réduire les animations », tout est déjà à sa place : seule
            // l'opacité s'anime (#11208).
            let settled = isVisible || reduceMotion
            // #9043 — glisser vers le haut réduit l'aperçu (ancré en haut) et
            // remonte le menu coupé d'autant ; le reste du parcours va au geste
            // existant. `shrinkable` = la hauteur de l'aperçu au repos.
            let shrinkable = nlBubbleH
            let revealFloor = MessageOverlayRevealLaw.floor(
                hiddenHeight: nlMenuY + nlMenuHeight / 2 - nlAvailBottom, shrinkableHeight: shrinkable)
            let reveal = RevealContext(
                floor: revealFloor, shrinkable: shrinkable,
                committed: committedReveal
                    ?? MessageOverlayRevealLaw.restingFactor(floor: revealFloor, assistiveReveal: voiceOverEnabled))
            let revealSplit = reveal.split(liveDragTranslation)
            let clusterDragOffset = MessageOverlayDragLaw.displayOffset(for: revealSplit.residual)
            let menuRise = MessageOverlayRevealLaw.rise(factor: revealSplit.factor, shrinkableHeight: shrinkable)

            ZStack {
                dismissBackground

                // Liste d'actions verticale EN-DESSOUS de l'aperçu
                // (native-lean). Icônes monochromes accent, destructif
                // rouge isolé.
                MessageActionsMenu(
                    actions: primaryActions,
                    accentHex: contactColor,
                    onSelect: { handlePrimaryAction($0) }
                )
                .position(
                    x: nlMenuX,
                    y: settled ? nlMenuY : (sourceRect.maxY + 8)
                )
                .offset(y: clusterDragOffset - menuRise)
                .opacity(isVisible ? 1 : 0)
                .scaleEffect(settled ? 1.0 : 0.85, anchor: .top)
                // highPriorityGesture : en `.gesture` simple, les Button
                // des rows gagnent les drags lents (vérifié simulateur —
                // un swipe faible amorcé sur « Pin » épinglait au lieu de
                // snap back). Le seuil minimumDistance 12 laisse les taps
                // simples aux rows.
                .highPriorityGesture(clusterDragGesture(reveal))

                // FIDÉLITÉ (#11208) — la cellule du fil elle-même, dans son
                // mode de lecture, avec la peau et la largeur de colonne que
                // la liste remet à la cellule. Mesurée à sa largeur, puis
                // réduite d'un `.scaleEffect` uniforme seulement si elle ne
                // tient pas dans la fenêtre. Gate Equatable (H3) + mémoire de
                // la rangée plate : le drag 60 fps ne reconstruit rien. Une
                // image de la cellule, pas un lecteur — rien ne s'y lit (#11339).
                previewViewport(
                    kind: kind, containerSize: geometry.size, previewSize: CGSize(width: previewW, height: previewH),
                    fit: fit)
                // #9043 — transformation de RENDU seule (aucune passe de
                // layout par image) : le haut et le bord natif restent fixes.
                .scaleEffect(revealSplit.factor, anchor: message.isMe ? .topTrailing : .topLeading)
                .position(
                    x: nlAnchorX,
                    y: settled ? nlBubbleMidY : nlSourceMidY
                )
                .offset(y: clusterDragOffset)
                .opacity(isVisible ? 1 : 0)
                .allowsHitTesting(fit.scrollsInternally)

                // Barre de réactions AU-DESSUS de l'aperçu (native-lean) — montée
                // seulement si la loi ouvre la réaction (`canReact`).
                if showsEmojiBar {
                    emojiQuickBar(width: nlEmojiWidth)
                        .position(
                            x: nlEmojiX,
                            y: settled ? nlEmojiY : sourceRect.minY
                        )
                        .offset(y: clusterDragOffset)
                        .opacity(isVisible ? 1 : 0)
                        .scaleEffect(settled ? 1.0 : 0.7, anchor: .center)
                        .allowsHitTesting(true)
                }
            }
            // #9043 — le glissement vaut sur TOUTE la vue (le voile, l'aperçu,
            // dont les touches traversent), pas seulement sur le menu : c'est
            // l'aperçu qu'on pousse vers le haut. Un tap reste un tap (seuil
            // 12 pt) ; le menu garde sa propre instance prioritaire.
            .gesture(clusterDragGesture(reveal), including: .all)
        }
        .ignoresSafeArea()
        // A11y (C2) : l'overlay est MODAL — VoiceOver piège le focus dedans
        // (ignore la conversation derrière) ; le geste d'échappement (scrub
        // 2 doigts) le ferme, comme un `.contextMenu` natif.
        .accessibilityAddTraits(.isModal)
        .dismissOnEscape { dismiss() }
        .onAppear { enter() }
    }

    /// **L'entrée de l'overlay** (#11208). Aucune haptique : le geste
    /// (`ConditionalBubbleLongPress`) a déjà vibré, et une seconde secousse
    /// dans la même demi-seconde se lisait comme deux événements. Le ressort
    /// d'entrée (courbe de réponse iMessage) devient un fondu sous « Réduire
    /// les animations ». La cascade d'emojis est jouée par
    /// `EmojiReactionPicker` lui-même via `WaveTileModifier`.
    private func enter() {
        withAnimation(reduceMotion
                      ? .easeOut(duration: Self.reducedMotionFadeDuration)
                      : .spring(response: 0.42, dampingFraction: 0.74)) {
            isVisible = true
        }
    }

    // MARK: - Le cadre de l'aperçu (#11208)

    /// L'aperçu dans son cadre réduit : la cellule du fil, mesurée à sa largeur,
    /// posée à son bord natif, bornée à la place qui reste (`MessageOverlayPreviewFit`).
    private func previewViewport(
        kind: MessageOverlayPreviewKind,
        containerSize: CGSize,
        previewSize: CGSize,
        fit: MessageOverlayPreviewFit.Result
    ) -> some View {
        MessageOverlayPreviewViewport(
            scale: fit.scale,
            naturalSize: previewSize,
            visibleHeight: fit.visibleHeight,
            scrolls: fit.scrollsInternally,
            isTrailing: message.isMe
        ) {
            MessageOverlayCellPreview(
                face: previewFace(kind: kind, containerWidth: containerSize.width),
                message: message,
                isDark: isDark,
                accentHex: bubbleAccentHex
            )
            .equatable()
            .modifier(UnencryptedMessageMarking(isUnencrypted: isUnencrypted, isDark: isDark))
            .environment(\.bubbleSkin, previewSkin)
            .environment(\.bubbleContainerWidth, containerSize.width > 0 ? containerSize.width : nil)
            .frame(width: previewSize.width, alignment: message.isMe ? .trailing : .leading)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { measuredPreviewHeight = $0 }
        }
    }

    // MARK: - La face de l'aperçu (#11208)

    private func previewFace(kind: MessageOverlayPreviewKind, containerWidth: CGFloat) -> MessageOverlayCellPreview.Face {
        switch kind {
        case .bubble:
            return .bubble(previewBubble)
        case .flatRow:
            let width = max(0, containerWidth - 2 * MessageOverlayCellPreview.flatRowMargin)
            return .flatRow(flatRowMemo.row(for: flatRowKey(availableWidth: width)) { previewRow(availableWidth: width) })
        }
    }

    /// Ce que la rangée plate MONTRE — sa construction ne se rejoue que si
    /// l'une de ces valeurs a changé, jamais parce que le doigt a bougé.
    private func flatRowKey(availableWidth: CGFloat) -> MessageOverlayFlatRowMemo.Key {
        MessageOverlayFlatRowMemo.Key(
            messageId: message.id, updatedAt: message.updatedAt, content: message.content,
            effects: message.effects.flags, reactionCount: message.reactions.count,
            translations: textTranslations, served: preferredTranslation, selection: threadLanguage.selection,
            transcription: transcription, translatedAudios: translatedAudios, readingMode: threadLanguage.readingMode,
            senderStoryRing: threadLanguage.senderStoryRing, senderMoodEmoji: threadLanguage.senderMoodEmoji,
            isDark: isDark, isRightToLeft: layoutDirection == .rightToLeft, availableWidth: availableWidth)
    }

    /// La rangée plate que le fil montre pour ce message, avec les entrées de
    /// sa cellule : la traduction que le fil sert (override compris), le
    /// drapeau basculé, la piste audio du Prisme, l'anneau et l'humeur de
    /// l'auteur.
    private func previewRow(availableWidth: CGFloat) -> FocalRowInput {
        FocalRowInput.preview(
            message: message,
            translations: textTranslations,
            servedTranslation: preferredTranslation,
            accentHex: contactColor,
            density: MessageOverlayPreviewKind.density(for: threadLanguage.readingMode),
            context: FocalRowInput.PreviewContext(
                selection: threadLanguage.selection,
                translatedAudios: translatedAudios,
                preferredAudioLangCode: AudioTrackLanguageResolver.resolve(
                    manualOverride: nil, originalLanguage: message.originalLanguage,
                    preferredLanguages: ConversationLanguagePreferences(user: AuthManager.shared.currentUser).resolved,
                    translatedAudios: translatedAudios),
                transcription: transcription?.text,
                userLanguages: (regional: userRegionalLanguage, custom: userCustomDestinationLanguage),
                mentionDisplayNames: mentionDisplayNames,
                currentUserId: currentUserId,
                senderPresence: PresenceManager.shared.presenceState(forSenderOf: message),
                senderStoryRing: threadLanguage.senderStoryRing,
                senderMoodEmoji: threadLanguage.senderMoodEmoji,
                recipientCount: threadLanguage.recipientCount,
                isDark: isDark,
                isDirect: isDirect,
                isRightToLeft: layoutDirection == .rightToLeft,
                availableWidth: availableWidth
            )
        )
    }

    // MARK: - Emoji Quick Bar (EmojiReactionPicker — shared component)

    /// La largeur de la bande AVANT l'allongement.
    static let emojiBandReferenceWidth: CGFloat = 280
    /// **La bande d'emojis s'allonge de ×1,4** (directive porteur 2026-10-01,
    /// #9043) — la bande, pas les emojis : leur taille ne change pas, la
    /// bande en montre davantage. Bornée à la largeur disponible. Miroir web :
    /// `RAIL_LENGTH_FACTOR`.
    static let emojiBandLengthFactor: CGFloat = 1.4

    static func emojiBandWidth(available: CGFloat) -> CGFloat {
        min(emojiBandReferenceWidth * emojiBandLengthFactor, max(0, available))
    }

    private func emojiQuickBar(width: CGFloat) -> some View {
        // Shared `EmojiReactionPicker` (MeeshyUI) — meme call-site que le
        // strip inline du long-press (`ConversationView+MessageRow`) pour
        // garder les deux surfaces visuellement identiques (padding interne,
        // cascade d'entree gauche→droite `WaveTileModifier`).
        //
        // **Sans capsule** (directive porteur 2026-10-01, #9043 — « enlever le
        // cadre comme pour les story ») : la story pose cette MÊME rangée nue
        // sur sa scène (`FullscreenReactionStrip`, `chrome: .none`). Ici le
        // voile est la scène. Seule la bande perd son cadre : le menu du bas
        // garde son Liquid Glass. Le voile étant toujours sombre, le style est
        // `.dark` quel que soit le schéma.
        //
        // Le classement (lecture UserDefaults + tri) est calculé UNE fois par
        // présentation via le cache @State — le body de l'overlay se
        // ré-évalue à chaque frame du spring d'entrée, et la table d'usage ne
        // change pas pendant que le menu est ouvert (recordUsage ⇒ dismiss).
        let topEmojis = cachedTopEmojis
            ?? EmojiUsageTracker.topEmojis(count: 20, defaults: Self.defaultEmojis)
        return EmojiReactionPicker(
            quickEmojis: topEmojis,
            style: .dark,
            scrollable: true,
            chrome: .none,
            onReact: { reagirDepuisLaBande($0) },
            onExpandFullPicker: {
                HapticFeedback.light()
                onExpandFullPicker?()
                dismiss()
            }
        )
        .frame(maxWidth: width)
        .onAppear {
            if cachedTopEmojis == nil {
                cachedTopEmojis = EmojiUsageTracker.topEmojis(count: 20, defaults: Self.defaultEmojis)
            }
            #if DEBUG
            VitrineRendu.shared.menuDeReactionsAffiche { reagirDepuisLaBande($0) }
            #endif
        }
    }

    private func reagirDepuisLaBande(_ emoji: String) {
        EmojiUsageTracker.recordUsage(emoji: emoji)
        onReact?(emoji)
        dismiss()
    }

    // MARK: - Dismiss Background (le voile commun de l'appui long, #11222)

    private var dismissBackground: some View {
        // Le voile est le MATÉRIAU SYSTÈME (`LongPressVeil`, décision porteur
        // #11222) : la même loi que l'aperçu d'une conversation, l'aperçu d'une
        // pièce et le web. La lueur radiale de l'accent se pose au-dessus,
        // sans capter le toucher — elle n'est pas le voile, elle teinte la scène.
        ZStack {
            LongPressVeil(visibility: isVisible ? 1 : 0, onDismiss: dismiss)

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
            .allowsHitTesting(false)
        }
        .animation(.easeOut(duration: 0.26), value: isVisible)
    }

    // MARK: - Cluster Drag (réduction de l'aperçu, puis swipe-up → Menu 2, swipe-down → fermeture)

    /// La géométrie de la réduction (#9043), résolue dans le `GeometryReader`
    /// et remise au geste — il partage le MÊME parcours que le rendu.
    struct RevealContext {
        let floor: CGFloat
        let shrinkable: CGFloat
        let committed: CGFloat

        func split(_ translation: CGFloat) -> MessageOverlayRevealLaw.Split {
            MessageOverlayRevealLaw.split(translation: translation, committed: committed,
                                          floor: floor, shrinkableHeight: shrinkable)
        }
    }

    private func clusterDragGesture(_ reveal: RevealContext) -> some Gesture {
        DragGesture(minimumDistance: 12)
            .updating($liveDragTranslation) { value, state, _ in
                guard isVisible else { return }
                state = value.translation.height
            }
            .onChanged { value in
                guard isVisible else { return }
                if MessageOverlayDragLaw.isArmed(translation: reveal.split(value.translation.height).residual),
                   !dragHapticArmed {
                    dragHapticArmed = true
                    HapticFeedback.medium()
                }
            }
            .onEnded { value in
                defer { dragHapticArmed = false }
                guard isVisible else { return }
                let reached = reveal.split(value.translation.height)
                // L'état atteint est GARDÉ, sans aimant (cf. `MessageOverlayRevealLaw`).
                committedReveal = reached.factor
                switch MessageOverlayDragLaw.outcome(
                    translation: reached.residual,
                    predicted: reveal.split(value.predictedEndTranslation.height).residual
                ) {
                case .openMore:
                    handlePrimaryAction(.more)
                case .dismiss:
                    dismiss()
                case .snapBack:
                    break // reset auto du @GestureState (spring resetTransaction)
                }
            }
    }

    // MARK: - Dismiss

    private func dismiss() {
        HapticFeedback.light()
        // Sortie : l'overlay se retracte vers le coin natif de la bulle ;
        // un fondu sous « Réduire les animations ». La cascade d'entree des
        // emojis n'a pas de symetrique a la sortie (le composant partage gere
        // son propre cycle de vie).
        withAnimation(reduceMotion
                      ? .easeOut(duration: Self.reducedMotionFadeDuration)
                      : .spring(response: 0.32, dampingFraction: 0.86)) {
            isVisible = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) {
            isPresented = false
        }
    }

}

// MARK: - Ce que le fil sert pour ce message

extension MessageOverlayMenu {
    /// #9010 — l'aperçu joue la piste que la bulle sert ; l'original seulement
    /// quand l'hôte n'en a élu aucune.
    static func previewAudioTrack(for attachment: MessageAttachment, served: [String: ServedAudioTrack]) -> ServedAudioTrack {
        served[attachment.id] ?? .original(of: attachment)
    }

    /// **Ce que le fil sert pour CE message** (#9259) : la sélection du
    /// drapeau (`ConversationViewModel.bubbleLanguageSelections`), ses
    /// écrivains, les pistes qu'elle élit et le mode de lecture du fil — lus
    /// dans le VM par l'hôte, jamais recopiés dans un état de l'overlay.
    struct ThreadLanguage {
        var selection: ConversationViewModel.BubbleLanguageSelection? = nil
        /// Le mode de lecture du fil (#11208) : il choisit la face de l'aperçu
        /// (`MessageOverlayPreviewKind`). Sans mode transmis, une bulle.
        var readingMode: ConversationReadingMode = .bubbles
        var servedAudioTracks: [String: ServedAudioTrack] = [:]
        var onSetActiveDisplayLanguage: ((String?) -> Void)? = nil
        var onSetSecondaryLanguage: ((String?) -> Void)? = nil
        /// Ce que la cellule pose AUTOUR du message (#11208) — l'anneau de story
        /// et l'humeur de l'auteur, le dénominateur des accusés : mêmes
        /// sources que `MessageCellInputs`, pour que l'aperçu ne les perde pas.
        var senderStoryRing: StoryRingState = .none
        var senderMoodEmoji: String? = nil
        var recipientCount: Int = 1

        /// Le fil se lit en rangées plates (Focal, Script) : sa bande de drapeaux
        /// porte aussi la langue affichée (`FocalRow.focusFlagCodes`, #9838).
        var usesFlatRow: Bool { readingMode.usesFlatRow }
    }

    /// La bulle de l'aperçu, branchée sur le drapeau du fil comme la cellule
    /// (`MessageListViewController`) : la face affichée ET la piste jouée
    /// suivent une bascule faite dans le fil, pas le seul Prisme (#9259).
    var previewBubble: ThemedMessageBubble {
        var bubble = ThemedMessageBubble(
            message: message,
            contactColor: contactColor,
            isDirect: isDirect,
            isDark: isDark,
            transcription: transcription,
            translatedAudios: translatedAudios,
            textTranslations: textTranslations,
            preferredTranslation: preferredTranslation,
            showAvatar: !isDirect,
            activeAudioLanguage: threadLanguage.selection?.activeDisplayLangCode,
            isLastInGroup: true,
            isLastReceivedMessage: true,
            isLastSentMessage: true,
            mentionDisplayNames: mentionDisplayNames,
            currentUserId: currentUserId,
            userLanguages: (
                regional: userRegionalLanguage,
                custom: userCustomDestinationLanguage
            ),
            activeDisplayLangCode: threadLanguage.selection?.activeDisplayLangCode,
            secondaryLangCode: threadLanguage.selection?.secondaryLangCode,
            onSetActiveDisplayLanguage: threadLanguage.onSetActiveDisplayLanguage,
            onSetSecondaryLanguage: threadLanguage.onSetSecondaryLanguage
        )
        bubble.recipientCount = threadLanguage.recipientCount
        bubble.senderMoodEmoji = threadLanguage.senderMoodEmoji
        bubble.senderStoryRingState = threadLanguage.senderStoryRing
        return bubble
    }
}

// `OverlayAudioPlayer` vit chez lui depuis #7005 :
// `Meeshy/Features/Main/Components/OverlayAudioPlayer.swift`. Un lecteur média
// n'a rien à faire dans le fichier d'un menu contextuel, et cet hôte était déjà
// hors budget — il fallait extraire avant d'ajouter la garde d'idempotence.
