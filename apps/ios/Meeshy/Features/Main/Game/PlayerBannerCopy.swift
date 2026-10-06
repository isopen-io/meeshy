import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - La bannière du joueur : ce qu'elle dit, de quelle couleur, et où elle a sa place (#9494, XIII.1)
//
// MIROIR de `apps/web/src/lib/view/player-banner.ts` (`playerBannerLabel`) et de `top-band.ts`
// (`showsPlayerBanner`, `topBandSlots`). La brique (`PlayerBannerView`, MeeshyUI) dessine et ne parle aucune langue :
// ce fichier lui donne ses phrases courtes, la phrase du lecteur d'écran, ses couleurs — et la règle qui décide
// quand le bandeau du haut est à elle.

/// Les phrases de la bannière, dans la langue de l'appareil, depuis les clés `game2.banner.*` (sept langues).
enum PlayerBannerCopy {

    /// Les phrases courtes que la brique pose : les points, ce qu'il manque, les Meeshes, la place, les jours de Flamme.
    static func texts(for banner: GamePlayerBanner) -> PlayerBannerView.Texts {
        PlayerBannerView.Texts(
            points: GameText.bannerPoints(points: GameCopy.formatCount(banner.score)),
            missing: banner.pointsToNext.map { GameText.bannerMissing(points: GameCopy.formatCount($0)) },
            meeshes: banner.meeshes.map { GameCopy.formatCount($0) },
            place: banner.league.map { GameText.bannerPlace(count: $0.place) },
            flameDays: banner.flame.map { GameCopy.formatCount($0.days) }
        )
    }

    /// Ce que lit VoiceOver, en UNE phrase et dans l'ordre de la bannière : « Niveau 34, Éclat, 78 % vers le 35,
    /// 12 Meeshes, Conteur III, ligue Jade 4e, Flamme 23 jours ». Ce qui n'existe pas ne se dit pas.
    static func accessibilityLabel(for banner: GamePlayerBanner) -> String {
        let toNext = banner.nextLevel.map {
            GameText.bannerToNext(percent: GameCopy.formatCount(banner.percent), level: GameCopy.formatCount($0))
        } ?? GameText.bannerTop
        let parts: [String?] = [
            GameText.bannerLevel(level: GameCopy.formatCount(banner.level)),
            GameCopy.tierName(banner.tier),
            toNext,
            banner.meeshes.map { GameCopy.meeshes($0) },
            banner.rank.map { GameCopy.rankLabel($0.rank, division: $0.division) },
            banner.league.map {
                GameText.bannerLeague(league: GameText.leagueName($0.league), place: GameText.bannerPlace(count: $0.place))
            },
            banner.flame.map { GameText.bannerFlame(days: GameCopy.days($0.days)) },
        ]
        return parts.compactMap { $0 }.joined(separator: GameText.bannerSeparator)
    }
}

/// OÙ et QUAND le bandeau du haut est celui du joueur — la loi de `topBandSlots` du web : l'appel prime, puis
/// l'audio ; la bannière n'a la place que quand ni l'un ni l'autre ne la prend, et revient à la même place quand
/// ils partent. Elle ne se montre que sur les écrans PRINCIPAUX (les hubs) : le fil a besoin de toute sa hauteur,
/// une visionneuse est plein cadre. « Jeu masqué » : rien. Seulement ce qui existe : sans bloc `game`, rien.
nonisolated enum PlayerBannerPlacement {

    /// L'écran courant porte la bannière : ni un écran profond (un fil, un détail, Progression elle-même — son
    /// héros dit déjà tout), ni le lecteur de réels immersif.
    static func hosts(routeIsDeep: Bool, reelsAreOpen: Bool) -> Bool {
        !routeIsDeep && !reelsAreOpen
    }

    /// iPad : la colonne des conversations reste là, le fil ouvert dans l'autre prend toute sa hauteur.
    static func hostsOnTablet(conversationIsOpen: Bool, reelsAreOpen: Bool) -> Bool {
        !conversationIsOpen && !reelsAreOpen
    }

    static func shows(hosted: Bool, free: Bool, hidden: Bool) -> Bool {
        hosted && free && !hidden
    }
}

/// Les couleurs de la bannière. UN SEUL producteur de l'aplat : la bannière le peint, la bande du haut (la zone
/// de la barre d'état) le reprend (`TopChromeTint`) — la couture est continue par construction.
nonisolated enum PlayerBannerStyle {

    /// La part de la couleur du palier dans l'aplat : assez pour teinter le haut de l'app, jamais pour disputer le texte.
    private static func tintShare(isDark: Bool) -> CGFloat { isDark ? 0.26 : 0.16 }

    /// L'aplat : le fond de l'app, teinté par la couleur du palier.
    @MainActor
    static func surface(tier: LevelTierKey, isDark: Bool) -> Color {
        let base = UIColor(MeeshyColors.backgroundPrimary(isDark: isDark))
        let tint = UIColor(LevelTierPalette.color(for: tier))
        return Color(uiColor: blend(base, tint, share: tintShare(isDark: isDark)))
    }

    @MainActor
    static func palette(tier: LevelTierKey, isDark: Bool) -> PlayerBannerView.Palette {
        PlayerBannerView.Palette(
            surface: surface(tier: tier, isDark: isDark),
            ink: MeeshyColors.textPrimary(isDark: isDark),
            muted: MeeshyColors.textSecondary(isDark: isDark),
            disc: isDark ? MeeshyColors.backgroundSecondary(isDark: true) : .white
        )
    }

    /// Le mélange de deux couleurs en sRGB : `share` de `tint` sur `base`, OPAQUE.
    static func blend(_ base: UIColor, _ tint: UIColor, share: CGFloat) -> UIColor {
        func components(_ color: UIColor) -> (CGFloat, CGFloat, CGFloat) {
            var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
            color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
            return (red, green, blue)
        }
        let share = min(max(share, 0), 1)
        let (br, bg, bb) = components(base)
        let (tr, tg, tb) = components(tint)
        return UIColor(red: br + (tr - br) * share, green: bg + (tg - bg) * share, blue: bb + (tb - bb) * share, alpha: 1)
    }
}
