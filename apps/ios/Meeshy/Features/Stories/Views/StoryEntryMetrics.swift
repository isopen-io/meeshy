import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les mesures d'un point d'entrée de story, en GRAND (#10925).**
///
/// Retour porteur 2026-10-18 : « la taille des points d'entrée de story dans la
/// vue de conversations avant le scrolling doit être de la même taille que dans
/// la vue de Feed de posts ». Le fil montait `StoryTrayView` (avatar 88, anneau
/// 94, libellé 96) ; la liste montait `StoriesVivantsRail` sur les cotes du rail
/// des DIRECTS de la Lentille (pastille 48) — deux valeurs pour un même objet.
///
/// Une seule source, et depuis #11033 un seul composant : le fil ET la tête de
/// liste montent `StoryTrayView`, qui lit ces mesures. La bande COMPACTE épinglée au défilement
/// (`PinnedStoryTrailBand`, `.storyTrayCompact`) n'en dépend pas.
/// Le web tient la même loi par un seul composant (`RAIL_TILE_GRANDE`,
/// `apps/web/src/components/rail-tile.tsx`).
enum StoryEntryMetrics {
    static let avatarContext: AvatarContext = .storyTray
    static var avatar: CGFloat { avatarContext.size }
    static var ring: CGFloat { avatarContext.ringSize }
    static var ringWidthAccented: CGFloat { avatarContext.ringWidth * 2 }
    static var ringWidthQuiet: CGFloat { avatarContext.ringWidth }
    static var badge: CGFloat { avatarContext.badgeSize }
    static let badgeGlyph: CGFloat = MeeshyFont.title3Size
    static let createGlyph: CGFloat = MeeshyIconSize.lg
    static let labelWidth: CGFloat = 96
    static let labelFontSize: CGFloat = 10
    static let labelSpacing: CGFloat = 5
    static let itemSpacing: CGFloat = MeeshySpacing.md
    static let paddingHorizontal: CGFloat = MeeshySpacing.lg
    static let paddingVertical: CGFloat = MeeshySpacing.sm
    static let height: CGFloat = 120

    /// #15157 — la place que l'entrée « Moi » réserve pour que son cadre illustré se montre à sa
    /// taille, l'avatar intact : le débordement latéral tient dans l'espacement entre entrées (sans
    /// toucher l'anneau du voisin), le débordement vertical écarte le libellé et grandit la bande.
    struct DecorReserve: Equatable {
        let room: CGFloat
        let top: CGFloat
        let bottom: CGFloat
        let side: CGFloat
        static let none = DecorReserve(room: 0, top: 0, bottom: 0, side: 0)
    }

    static func decorReserve(_ design: AvatarRingDesign?) -> DecorReserve {
        let room = AvatarRingLayout.fullSpill(design, box: avatar)
        guard room > 0 else { return .none }
        let halo = (ring - avatar) / 2
        let lateral = (labelWidth - avatar) / 2 + itemSpacing + (labelWidth - ring) / 2
        return DecorReserve(
            room: room,
            top: max(0, room - halo - paddingVertical),
            bottom: max(0, room - halo - labelSpacing),
            side: max(0, room - lateral)
        )
    }
}
