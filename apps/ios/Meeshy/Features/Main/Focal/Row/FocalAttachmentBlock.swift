import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - FocalMediaGridLayout — géométrie pure (WS-3, §3 « Types purs à extraire »)

/// Une cellule de la grille média du Fil : largeur/hauteur en points,
/// `overflowCount` (`> 0` seulement sur la dernière cellule visible d'une
/// grille `> 4` pièces jointes — le badge `+N`).
nonisolated struct FocalMediaSlot: Equatable {
    let width: CGFloat
    let height: CGFloat
    let overflowCount: Int

    init(width: CGFloat, height: CGFloat, overflowCount: Int = 0) {
        self.width = width
        self.height = height
        self.overflowCount = overflowCount
    }
}

/// Géométrie 1/2/3/4+ de la grille média — fonction PURE, extraite d'un
/// `switch` de `body` pour rester testable sans SwiftUI (contrat Focal
/// §WS-3, « Types purs à extraire »).
///
/// **Parité voulue avec `BubbleStandardLayout+Media.swift`** (lu, jamais
/// modifié — §1.3) : `gridMaxWidth`/`gridSpacing` sont les MÊMES littéraux
/// (`300`/`2`, `BubbleStandardLayout.swift:169-170`), donc `halfW`/`leftW`/
/// `rightW` sont arithmétiquement identiques. `FocalMediaGridLayoutTests`
/// vérifie l'égalité pour `n ∈ {1,2,3,4,7}` (critère §WS-3).
///
/// **Hauteur des sous-cellules du cas 3 (droite) et du cas 4+ (les 4
/// cellules)** : le code réel NE POSE aucun `.frame(height:)` littéral sur
/// ces cellules — SwiftUI répartit la hauteur du groupe (`240`) entre les
/// enfants d'un `HStack`/`VStack` à l'exécution (pas une constante Swift
/// qu'un miroir pur peut relire). Plutôt que d'inventer une valeur dérivée
/// (`≈119`, jamais écrite en dur dans la source réelle), ce miroir attribue
/// la hauteur du GROUPE (`240`) à chaque sous-cellule : c'est la hauteur du
/// cadre dans lequel la cellule est posée, la seule valeur qui soit un
/// littéral réel de `BubbleStandardLayout+Media.swift`. Documenté comme
/// choix de modélisation, pas comme fait mesuré.
nonisolated enum FocalMediaGridLayout {

    /// Miroir de `BubbleStandardLayout.gridMaxWidth` (`:169`).
    static let gridMaxWidth: CGFloat = 300
    /// Miroir de `BubbleStandardLayout.gridSpacing` (`:170`).
    static let gridSpacing: CGFloat = 2

    /// Plafond de hauteur d'une vidéo solo, en multiple de la largeur — la
    /// MÊME loi que la bulle (`MeeshyMessageAttachment.videoHeight(forWidth:
    /// maxRatio:)`, 1.6) : une vidéo portrait 9:16 tient en 480 pt de haut sur
    /// 270 de large, sans bandes noires ; une 16:9 reste 300 × 169.
    static let soloVideoMaxHeightRatio: CGFloat = 1.6

    /// Emplacement d'une vidéo SOLO : la largeur se déduit de la hauteur et du
    /// format réel de la vidéo au lieu d'un 300 × 240 fixe qui letterboxait
    /// toute vidéo portrait dans une carte paysage (retour user 2026-08-21,
    /// image 2). Sans métadonnées de taille : 16:9.
    static func soloVideoSlot(aspectRatio: CGFloat?) -> FocalMediaSlot {
        let ratio = (aspectRatio ?? 0) > 0 ? aspectRatio! : 16.0 / 9.0
        let height = min(gridMaxWidth / ratio, gridMaxWidth * soloVideoMaxHeightRatio)
        let width = min(gridMaxWidth, height * ratio)
        return FocalMediaSlot(width: width.rounded(), height: height.rounded())
    }

    static func slots(for count: Int) -> [FocalMediaSlot] {
        guard count > 0 else { return [] }
        let halfW = (gridMaxWidth - gridSpacing) / 2

        switch count {
        case 1:
            // Miroir du cas image `n=1` (`BubbleStandardLayout+Media.swift`
            // case 1, branche non-vidéo : `.frame(width: gridMaxWidth, height: 240)`).
            // Le cas vidéo solo (hauteur intrinsèque, sans cap) est une
            // décision de RENDU, pas de géométrie de slot — hors périmètre
            // de cette fonction pure (le contrat §WS-3 ne teste que la
            // table de slots, pas le rendu vidéo n=1).
            return [FocalMediaSlot(width: gridMaxWidth, height: 240)]

        case 2:
            return [
                FocalMediaSlot(width: halfW, height: 180),
                FocalMediaSlot(width: halfW, height: 180)
            ]

        case 3:
            let leftW = (gridMaxWidth - gridSpacing) * 0.6
            let rightW = (gridMaxWidth - gridSpacing) * 0.4
            return [
                FocalMediaSlot(width: leftW, height: 240),
                FocalMediaSlot(width: rightW, height: 240),
                FocalMediaSlot(width: rightW, height: 240)
            ]

        default:
            let overflow = max(0, count - 4)
            return [
                FocalMediaSlot(width: halfW, height: 240),
                FocalMediaSlot(width: halfW, height: 240),
                FocalMediaSlot(width: halfW, height: 240),
                FocalMediaSlot(width: halfW, height: 240, overflowCount: overflow)
            ]
        }
    }
}

// MARK: - FocalMediaProtection — flou / voir-une-fois, décision pure (F-083bis)

/// État de protection d'UNE pièce jointe, à un instant `isRevealed` donné —
/// fonction PURE, testable sans SwiftUI (même discipline que
/// `FocalMediaGridLayout`/`FocalAudioRouting`).
nonisolated enum FocalMediaProtectionState: Equatable {
    /// Rien à masquer — la case `mediaLayer` se rend normalement.
    case none
    /// Flouté/masqué, PAS révélé — `isViewOnce` distingue le libellé
    /// (« Voir une fois » vs « Contenu masqué »), miroir de la même
    /// distinction côté `AttachmentBlurOverlayView` (`private`, non
    /// réutilisable — RE-PREUVE, cf. doc de `FocalGridCell`).
    case blurred(isViewOnce: Bool)
}

nonisolated enum FocalMediaProtection {
    /// `attachment.isBlurred || attachment.isViewOnce`, ET pas encore
    /// révélé ⇒ `.blurred`. Une fois révélé (`isRevealed == true`), TOUJOURS
    /// `.none` — y compris pour `isViewOnce`, le média redevient net le
    /// temps de la fenêtre de révélation (portée par `BubbleBlurRevealController`,
    /// réutilisé tel quel côté vue, §WS-0-adjacent : lifecycle PUR, non
    /// `fileprivate`).
    static func state(for attachment: MessageAttachment, isRevealed: Bool) -> FocalMediaProtectionState {
        guard !isRevealed, attachment.isBlurred || attachment.isViewOnce else { return .none }
        return .blurred(isViewOnce: attachment.isViewOnce)
    }

    /// Pastille de compte « vue unique » — miroir de `viewCountBadge`
    /// (`BubbleGridCell`, `private`) : affichée seulement si `isViewOnce`
    /// ET qu'un compte existe déjà (`viewOnceCount > 0`), INDÉPENDAMMENT de
    /// `isRevealed` (le compte reste visible même après révélation — même
    /// règle que la source réelle).
    static func showsViewOnceBadge(for attachment: MessageAttachment) -> Bool {
        attachment.isViewOnce && attachment.viewOnceCount > 0
    }
}

// MARK: - FocalGridCell — cellule nominale (évite la crash de démangling, §WS-3)

/// Cellule nominale d'une grille média du Fil — image ou vidéo, RADIUS 16
/// (`FocalMetrics.Media.radius`), aucune bulle, aucun `cornerRadius: 18`.
///
/// **RE-PREUVE (§0 avant écriture, F-082)** : le contrat §WS-3 nomme
/// `BubbleGridCell` (« struct nominale existante ») comme réutilisation.
/// Relecture de `BubbleStandardLayout+Media.swift:264` (`fileprivate struct
/// BubbleGridCell`), `:536` (`fileprivate struct BubbleGridImageView`),
/// `:585` (`fileprivate struct BubbleGridVideoThumbnailView`) : LES TROIS
/// SONT `fileprivate` — inaccessibles hors de ce fichier, y compris depuis
/// `Focal/Row/`. Le contrat cite un composant que le code réel ne permet
/// PAS d'importer. `BubbleStandardLayout+Media.swift` est listé au contrat
/// §1.3 (« lu, jamais modifié ») — élargir son access control (`fileprivate`
/// → `internal`) éditerait un fichier hors propriété WS-3, donc exclu.
///
/// Résolution retenue : `FocalGridCell` REPREND la LEÇON structurelle de
/// `BubbleGridCell` (struct nominale plutôt qu'un `@ViewBuilder` à branches
/// conditionnelles inlinées — la cause du crash `swift_getTypeByMangledNameInContextImpl`
/// documentée sur ce fichier) SANS réutiliser son TYPE. Le rendu réutilise
/// les primitives réellement accessibles : `ProgressiveCachedImage`,
/// `VideoAvailabilityResolver` + `MeeshyVideoPlayer`, `DownloadBadgeView`
/// (`internal`, non `fileprivate` — vérifié).
///
/// **Flou / voir-une-fois (arbitrage F-083bis, planche des 25 cas)** :
/// `AttachmentBlurOverlayView` et `viewCountBadge` (`BubbleGridCell`) sont
/// `private` — non réutilisables (même RE-PREUVE que `BubbleGridCell`
/// lui-même). Reconstruits NATIVEMENT ici (même approche que
/// `Focal/Row/FocalSystemRows.swift`) : mêmes clés i18n
/// (`bubble.media.viewOnce`/`.masked`/`.holdToView`/`.a11y.*`, un seul
/// domicile — jamais dupliquées), même geste (`onLongPressGesture(minimumDuration: 0.3)`),
/// et la VRAIE machine à états de révélation (`BubbleBlurRevealController`,
/// `Bubble/BubbleBlurRevealLifecycle.swift` — `internal`, PAS `fileprivate`,
/// vérifié avant réutilisation) plutôt qu'un booléen local reconstruit à la
/// main. La décision (« flouter ou pas ») est PURE (`FocalMediaProtection`,
/// ci-dessus), testable sans rendu.
///
/// **Toujours HORS périmètre, documenté (accepté par arbitrage)** : les
/// réactions par-image (`AttachmentReactionLongPress`/`reactionsBadge`/
/// `reactionPickerOverlay` de `BubbleGridCell`) — aucun critère d'acceptation
/// §WS-3/planche ne les couvre, et les ajouter sans compilateur local serait
/// un risque non couvert par un test.
struct FocalGridCell: View {
    let attachment: MessageAttachment
    let slot: FocalMediaSlot
    let accentHex: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var onTap: ((MessageAttachment) -> Void)? = nil
    /// Consomme le compteur voir-une-fois AVANT de révéler — miroir exact
    /// de `BubbleGridCell.onConsumeViewOnce` (même signature, même contrat
    /// d'appel : succès → révélation).
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil

    @StateObject private var revealController = BubbleBlurRevealController()

    private var protectionState: FocalMediaProtectionState {
        FocalMediaProtection.state(for: attachment, isRevealed: revealController.isRevealed)
    }

    var body: some View {
        ZStack {
            Color.black
            if case .none = protectionState {
                mediaLayer
            }
            overflowOverlay
        }
        .frame(width: slot.width, height: slot.height)
        .clipShape(RoundedRectangle(cornerRadius: FocalMetrics.Media.radius))
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture {
            guard case .none = protectionState else { return }
            onTap?(attachment)
        }
        .overlay { protectionOverlay }
        .overlay(alignment: .bottomTrailing) {
            if case .none = protectionState {
                DownloadBadgeView(
                    attachment: attachment,
                    accentColor: accentHex,
                    messageDeliveryStatus: messageDeliveryStatus,
                    compact: attachment.type == .video
                )
            }
        }
        .overlay(alignment: .topTrailing) { viewOnceBadge }
    }

    @ViewBuilder
    private var mediaLayer: some View {
        switch attachment.type {
        case .image:
            let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
            let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
            // Une rangée porte UN média : il anime (#4984).
            AnimatedCachedImage(
                urlString: fullUrl,
                pointSize: slot.width,
                contentMode: .scaleAspectFill
            ) {
                ProgressiveCachedImage(
                    thumbHash: attachment.thumbHash,
                    thumbnailUrl: thumbUrl,
                    fullUrl: fullUrl,
                    targetSize: CGSize(width: slot.width, height: slot.height)
                ) {
                    Color(hex: attachment.thumbnailColor).shimmer()
                }
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()

        case .video:
            VideoAvailabilityResolver(attachment: attachment) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: accentHex,
                    frame: .bubble,
                    availability: availability,
                    performance: .inline,
                    playButtonDiameter: 44,
                    onDownload: onDownload,
                    onExpand: { onTap?(attachment) }
                )
            }

        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private var overflowOverlay: some View {
        if slot.overflowCount > 0 {
            Color.black.opacity(0.5)
            Text("+\(slot.overflowCount)")
                .font(MeeshyFont.relative(24, weight: .bold))
                .foregroundColor(.white)
        }
    }

    /// Recouvrement flou/masqué — natif (voir doc de tête). Rendu SEUL
    /// (aucun `mediaLayer` en dessous, garanti par `protectionState` gate
    /// dans `body`) : « la grille floutée ne rend pas l'image nette »,
    /// vérifié par `FocalMediaProtectionTests` (décision pure) +
    /// `FocalRichBlockEquatableTests` (garde source : `mediaLayer` posé
    /// derrière une condition sur `protectionState`).
    @ViewBuilder
    private var protectionOverlay: some View {
        if case .blurred(let isViewOnce) = protectionState {
            ZStack {
                Color.black.opacity(0.5)
                VStack(spacing: 5) {
                    Image(systemName: "eye.slash.fill")
                        .font(MeeshyFont.relative(16, weight: .medium))
                        .foregroundStyle(.white)
                    Text(isViewOnce
                        ? String(localized: "bubble.media.viewOnce", defaultValue: "Voir une fois", bundle: .main)
                        : String(localized: "bubble.media.masked", defaultValue: "Contenu masqué", bundle: .main))
                        .font(MeeshyFont.relative(10, weight: .semibold))
                        .foregroundStyle(.white)
                    Text(String(localized: "bubble.media.holdToView", defaultValue: "Maintenir pour voir", bundle: .main))
                        .font(MeeshyFont.relative(9))
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .contentShape(Rectangle())
            .accessibilityElement(children: .combine)
            .accessibilityLabel(isViewOnce
                ? String(localized: "bubble.media.a11y.viewOnce", defaultValue: "Média à voir une fois", bundle: .main)
                : String(localized: "bubble.media.a11y.masked", defaultValue: "Média masqué", bundle: .main))
            .accessibilityHint(String(localized: "bubble.media.a11y.holdToReveal", defaultValue: "Maintenir pour révéler le contenu", bundle: .main))
            .onLongPressGesture(minimumDuration: 0.3) {
                HapticFeedback.medium()
                revealController.requestReveal(
                    request: BubbleBlurRevealLifecycle.RevealRequest(messageId: attachment.id, isViewOnce: isViewOnce),
                    consumeViewOnce: onConsumeViewOnce
                )
            }
        }
    }

    /// Pastille de compte « vue unique » — voir
    /// `FocalMediaProtection.showsViewOnceBadge`.
    @ViewBuilder
    private var viewOnceBadge: some View {
        if FocalMediaProtection.showsViewOnceBadge(for: attachment) {
            Text("\(attachment.viewOnceCount)")
                .font(MeeshyFont.relative(9, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
                .frame(width: 18, height: 18)
                .background(Circle().fill(MeeshyColors.error.opacity(0.85)))
                .padding(6)
                .accessibilityLabel(Text(String(localized: "bubble.media.a11y.viewCount", defaultValue: "\(attachment.viewOnceCount) vues", bundle: .main)))
        }
    }
}

// MARK: - FocalAttachmentBlock (WS-3)

/// Bloc média NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), grille 1/2/3/4+ via `FocalMediaGridLayout`,
/// radius `16` (`FocalMetrics.Media.radius`). Aucune bulle, aucun fond.
///
/// Vue PURE : entrées primitives uniquement, aucun `@State`, `Equatable`
/// (les `MessageAttachment` sont comparés par id + les champs mutables
/// d'usage, même patron que `BubbleContent.Attachments.==`).
struct FocalAttachmentBlock: View, Equatable {
    let items: [MessageAttachment]
    let accentHex: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var onMediaTap: ((MessageAttachment) -> Void)? = nil
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil

    static func == (lhs: FocalAttachmentBlock, rhs: FocalAttachmentBlock) -> Bool {
        lhs.items.map(\.id) == rhs.items.map(\.id)
            && lhs.items.map(\.thumbnailUrl) == rhs.items.map(\.thumbnailUrl)
            && lhs.items.map(\.fileUrl) == rhs.items.map(\.fileUrl)
            // F-083bis : le flou/voir-une-fois affecte le rendu — mêmes
            // champs que `BubbleContent.Attachments.attachmentsHaveSameState`
            // (`isBlurred`/`viewOnceCount`), lu jamais modifié.
            && lhs.items.map(\.isBlurred) == rhs.items.map(\.isBlurred)
            && lhs.items.map(\.isViewOnce) == rhs.items.map(\.isViewOnce)
            && lhs.items.map(\.viewOnceCount) == rhs.items.map(\.viewOnceCount)
            && lhs.accentHex == rhs.accentHex
            && lhs.messageDeliveryStatus == rhs.messageDeliveryStatus
    }

    private var slots: [FocalMediaSlot] { FocalMediaGridLayout.slots(for: items.count) }

    var body: some View {
        let visibleItems = Array(items.prefix(slots.count))
        gridBody(visibleItems: visibleItems)
            .padding(.leading, FocalMetrics.Text.indent)
    }

    /// Dispatch par arité — reprend la structure HStack/VStack réelle
    /// (`BubbleStandardLayout+Media.swift`, lue jamais modifiée) pour que la
    /// DISPOSITION (pas seulement les tailles) reste fidèle : 1 = solo ;
    /// 2 = HStack ; 3 = HStack(gauche, VStack(droite×2)) ; 4+ = VStack(HStack×2).
    @ViewBuilder
    private func gridBody(visibleItems: [MessageAttachment]) -> some View {
        switch visibleItems.count {
        case 1:
            if visibleItems[0].type == .video {
                cell(visibleItems[0], FocalMediaGridLayout.soloVideoSlot(aspectRatio: visibleItems[0].videoAspectRatio))
            } else {
                cell(visibleItems[0], slots[0])
            }
        case 2:
            HStack(spacing: FocalMediaGridLayout.gridSpacing) {
                cell(visibleItems[0], slots[0])
                cell(visibleItems[1], slots[1])
            }
        case 3:
            HStack(spacing: FocalMediaGridLayout.gridSpacing) {
                cell(visibleItems[0], slots[0])
                VStack(spacing: FocalMediaGridLayout.gridSpacing) {
                    cell(visibleItems[1], slots[1])
                    cell(visibleItems[2], slots[2])
                }
            }
        default:
            VStack(spacing: FocalMediaGridLayout.gridSpacing) {
                HStack(spacing: FocalMediaGridLayout.gridSpacing) {
                    cell(visibleItems[0], slots[0])
                    cell(visibleItems[1], slots[1])
                }
                HStack(spacing: FocalMediaGridLayout.gridSpacing) {
                    cell(visibleItems[2], slots[2])
                    cell(visibleItems[3], slots[3])
                }
            }
        }
    }

    private func cell(_ attachment: MessageAttachment, _ slot: FocalMediaSlot) -> FocalGridCell {
        FocalGridCell(
            attachment: attachment,
            slot: slot,
            accentHex: accentHex,
            messageDeliveryStatus: messageDeliveryStatus,
            onTap: onMediaTap,
            onConsumeViewOnce: onConsumeViewOnce
        )
    }
}
