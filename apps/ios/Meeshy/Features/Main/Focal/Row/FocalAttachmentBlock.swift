import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - FocalMediaGridLayout — géométrie pure (WS-3, §3 « Types purs à extraire »)

/// Une cellule de la grille média du Fil : largeur/hauteur en points,
/// `overflowCount` (`> 0` seulement sur la dernière cellule visible d'une
/// grille `> 4` pièces jointes — le badge `+N`).
nonisolated public struct FocalMediaSlot: Equatable {
    public let width: CGFloat
    public let height: CGFloat
    public let overflowCount: Int

    public init(width: CGFloat, height: CGFloat, overflowCount: Int = 0) {
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
nonisolated public enum FocalMediaGridLayout {

    /// Miroir de `BubbleStandardLayout.gridMaxWidth` (`:169`).
    public static let gridMaxWidth: CGFloat = 300
    /// Miroir de `BubbleStandardLayout.gridSpacing` (`:170`).
    public static let gridSpacing: CGFloat = 2

    public static func slots(for count: Int) -> [FocalMediaSlot] {
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

// MARK: - FocalGridCell — cellule nominale (évite la crash de démangling, §WS-3)

/// Cellule nominale d'une grille média du Fil — image ou vidéo, RADIUS 16
/// (`FocalMetrics.Media.radius`), aucune bulle, aucun `cornerRadius: 18`.
///
/// **RE-PREUVE (§0 avant écriture)** : le contrat §WS-3 nomme
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
/// (`internal`, non `fileprivate` — vérifié). Volontairement DÉPOUILLÉ vs
/// `BubbleGridCell` : pas de réaction par-image, pas de flou/voir-une-fois
/// — ni l'un ni l'autre n'est couvert par les critères d'acceptation §WS-3
/// (matrice §5 : grilles + absence de bulle + routage audio), et les
/// ajouter sans compilateur local serait un risque non couvert par un test.
/// Écart signalé pour arbitrage — extension possible en widening d'accès
/// `BubbleStandardLayout+Media.swift` (hors périmètre WS-3).
struct FocalGridCell: View {
    let attachment: MessageAttachment
    let slot: FocalMediaSlot
    let accentHex: String
    let messageDeliveryStatus: Message.DeliveryStatus
    var onTap: ((MessageAttachment) -> Void)? = nil

    var body: some View {
        ZStack {
            Color.black
            mediaLayer
            overflowOverlay
        }
        .frame(width: slot.width, height: slot.height)
        .clipShape(RoundedRectangle(cornerRadius: FocalMetrics.Media.radius))
        .clipped()
        .contentShape(Rectangle())
        .onTapGesture { onTap?(attachment) }
        .overlay(alignment: .bottomTrailing) {
            DownloadBadgeView(
                attachment: attachment,
                accentColor: accentHex,
                messageDeliveryStatus: messageDeliveryStatus,
                compact: attachment.type == .video
            )
        }
    }

    @ViewBuilder
    private var mediaLayer: some View {
        switch attachment.type {
        case .image:
            let thumbUrl = attachment.thumbnailUrl?.isEmpty == false ? attachment.thumbnailUrl : nil
            let fullUrl = attachment.fileUrl.isEmpty ? nil : attachment.fileUrl
            ProgressiveCachedImage(
                thumbHash: attachment.thumbHash,
                thumbnailUrl: thumbUrl,
                fullUrl: fullUrl,
                targetSize: CGSize(width: slot.width, height: slot.height)
            ) {
                Color(hex: attachment.thumbnailColor).shimmer()
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

    static func == (lhs: FocalAttachmentBlock, rhs: FocalAttachmentBlock) -> Bool {
        lhs.items.map(\.id) == rhs.items.map(\.id)
            && lhs.items.map(\.thumbnailUrl) == rhs.items.map(\.thumbnailUrl)
            && lhs.items.map(\.fileUrl) == rhs.items.map(\.fileUrl)
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
            cell(visibleItems[0], slots[0])
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
            onTap: onMediaTap
        )
    }
}
