import CoreGraphics
import Foundation

/// #8737 — le coin du haut où se range le bloc des autres participants en mode
/// Effets. Jamais un coin du bas : le carrousel, ses catégories et la barre
/// d'actions y vivent.
enum CallEffectsCompanionCorner: Equatable, Sendable {
    case topLeading
    case topTrailing

    var other: CallEffectsCompanionCorner {
        self == .topLeading ? .topTrailing : .topLeading
    }
}

/// Une personne d'un appel à deux, telle que le bloc des participants la dessine.
struct CallEffectsDuoPeer: Equatable, Sendable {
    let userId: String?
    let name: String
    let avatarURL: String?
    let isVideoOn: Bool
    let isMicMuted: Bool
}

/// Ce qui accompagne la scène : qui est dessus, qui l'accompagne en vignette, et
/// combien le « +N » compte encore.
struct CallEffectsCompanionLayout: Equatable, Sendable {
    let stageTileId: String
    let companions: [GroupCallStageTile]
    let overflow: Int
}

/// #8737 — en mode Effets la scène montre MON image filtrée ; les autres restent
/// visibles dans un bloc posé en haut. Le duo est le cas du groupe à un seul
/// accompagnant : une règle, une vue, la tuile de la grille réutilisée.
enum CallEffectsCompanionRule {
    static let maxCompanions = 3
    static let groupTileSize = CGSize(width: 84, height: 112)
    static let duoTileSize = CallSelfTileScale.standard.size
    static let compactTileSize = CallSelfTileScale.x1.size
    static let minimumTileHeight: CGFloat = 44
    static let duoRemoteTileId = "duo-remote"

    /// La scène est à moi, sauf une vignette distante mise à la une qui est
    /// encore là ; dans ce cas mon image devient le premier accompagnant. Les
    /// autres suivent l'ordre d'arrivée — le bloc ne se réagence pas quand
    /// quelqu'un parle, sauf pour qu'un orateur hors cadre prenne la DERNIÈRE
    /// place quand aucun accompagnant visible ne parle.
    static func layout(tiles: [GroupCallStageTile], featuredId: String?, capacity: Int) -> CallEffectsCompanionLayout {
        let localId = tiles.first { $0.isLocal }?.id ?? GroupCallStage.localTileId
        let stageId = featuredId.flatMap { id in tiles.first { $0.id == id }?.id } ?? localId
        let me = stageId == localId ? [] : tiles.filter { $0.isLocal }
        let candidates = me + tiles.filter { !$0.isLocal && $0.id != stageId }
        let slots = max(0, min(capacity, maxCompanions))
        let visible = promotingHiddenSpeaker(Array(candidates.prefix(slots)), from: candidates)
        return CallEffectsCompanionLayout(stageTileId: stageId, companions: visible, overflow: candidates.count - visible.count)
    }

    private static func promotingHiddenSpeaker(_ visible: [GroupCallStageTile], from candidates: [GroupCallStageTile]) -> [GroupCallStageTile] {
        guard !visible.isEmpty,
              !visible.contains(where: { $0.isSpeaking }),
              let speaker = candidates.dropFirst(visible.count).first(where: { $0.isSpeaking }) else {
            return visible
        }
        return Array(visible.dropLast()) + [speaker]
    }

    /// Combien de vignettes tiennent sur la largeur, réservant la place du
    /// « +N » dès que tout le monde ne tient pas.
    static func capacity(availableWidth: CGFloat, tileWidth: CGFloat, spacing: CGFloat, chipWidth: CGFloat, count: Int) -> Int {
        let bounded = max(0, min(count, maxCompanions))
        let rowWidth: (Int) -> CGFloat = { n in
            n == 0 ? 0 : CGFloat(n) * tileWidth + CGFloat(n - 1) * spacing
        }
        if bounded == count, rowWidth(count) <= availableWidth { return count }
        return (0...bounded).reversed().first { n in
            rowWidth(n) + (n == 0 ? 0 : spacing) + chipWidth <= availableWidth
        } ?? 0
    }

    /// La taille d'une vignette : celle de la vignette perso pour un seul
    /// accompagnant, celle de la bande de la grille au-delà ; plus petite quand
    /// la bande libre est courte (paysage) ; aucune sous une cible tactile.
    static func tileSize(companionCount: Int, freeHeight: CGFloat) -> CGSize? {
        let preferred = companionCount <= 1 ? duoTileSize : groupTileSize
        if preferred.height <= freeHeight { return preferred }
        if compactTileSize.height <= freeHeight { return compactTileSize }
        guard freeHeight >= minimumTileHeight else { return nil }
        return CGSize(width: freeHeight / CallSelfTileScale.aspectRatio, height: freeHeight)
    }

    /// Le coin le plus proche du point de dépose, en coordonnées physiques :
    /// en écriture de droite à gauche, le coin de tête est à droite.
    static func corner(dropX: CGFloat, containerWidth: CGFloat, isRightToLeft: Bool = false) -> CallEffectsCompanionCorner {
        let dropsLeft = dropX < containerWidth / 2
        return dropsLeft != isRightToLeft ? .topLeading : .topTrailing
    }

    /// Le centre horizontal, en coordonnées physiques, du bloc au repos.
    static func restingCenterX(_ corner: CallEffectsCompanionCorner, blockWidth: CGFloat, containerWidth: CGFloat, margin: CGFloat, isRightToLeft: Bool) -> CGFloat {
        let sitsLeft = (corner == .topLeading) != isRightToLeft
        return sitsLeft ? margin + blockWidth / 2 : containerWidth - margin - blockWidth / 2
    }

    /// Un appel à deux dit en tuiles de grille : moi, puis l'autre.
    static func duoTiles(local: CallEffectsDuoPeer, remote: CallEffectsDuoPeer) -> [GroupCallStageTile] {
        [
            tile(for: local, id: GroupCallStage.localTileId, isLocal: true),
            tile(for: remote, id: remote.userId ?? duoRemoteTileId, isLocal: false)
        ]
    }

    private static func tile(for peer: CallEffectsDuoPeer, id: String, isLocal: Bool) -> GroupCallStageTile {
        GroupCallStageTile(
            id: id,
            colorKey: peer.userId ?? id,
            displayName: peer.name,
            avatarURL: peer.avatarURL,
            isLocal: isLocal,
            isSpeaking: false,
            isMicMuted: peer.isMicMuted,
            showsVideo: peer.isVideoOn,
            isScreenSharing: false,
            isReconnecting: false
        )
    }
}
