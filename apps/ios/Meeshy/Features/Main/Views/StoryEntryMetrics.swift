import SwiftUI
import MeeshyUI

/// **Les mesures d'un point d'entrée de story, en GRAND (#10925).**
///
/// Retour porteur 2026-10-18 : « la taille des points d'entrée de story dans la
/// vue de conversations avant le scrolling doit être de la même taille que dans
/// la vue de Feed de posts ». Le fil montait `StoryTrayView` (avatar 88, anneau
/// 94, libellé 96) ; la liste montait `StoriesVivantsRail` sur les cotes du rail
/// des DIRECTS de la Lentille (pastille 48) — deux valeurs pour un même objet.
///
/// Une seule source : le plateau du fil ET le rail de tête de liste lisent ces
/// mesures, jamais une cote à eux. La bande COMPACTE épinglée au défilement
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
}
