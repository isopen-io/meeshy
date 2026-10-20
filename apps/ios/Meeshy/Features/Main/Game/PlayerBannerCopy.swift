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
            missing: banner.pointsToNext.map {
                GameText.bannerMissing(points: GameCopy.compactCount($0), level: GameCopy.formatCount(banner.nextLevel ?? banner.level + 1))
            },
            meeshes: banner.meeshes.map { GameCopy.formatCount($0) },
            place: banner.league.map { GameText.bannerPlace(count: $0.place) },
            flameDays: banner.flame.map { GameCopy.formatCount($0.days) },
            trophies: banner.trophies.map { GameCopy.formatCount($0) },
            mission: banner.dailyMission.map { "\(GameCopy.formatCount($0.done))/\(GameCopy.formatCount($0.total))" },
            season: banner.season.map { seasonShort($0.number) },
            rank: banner.rank.map { GameCopy.rankLabel($0.rank, division5: $0.division, mythic: $0.mythic) },
            gloryMissing: banner.rank.map(gloryMissing),
            pieceLabels: Dictionary(uniqueKeysWithValues: banner.pieces.map { ($0, pieceLabel($0, banner)) })
        )
    }

    /// « 5 543 vers Passeur II », ou « Gloire 990 k » quand il n'y a plus de marche.
    static func gloryMissing(_ rank: GamePlayerBanner.Rank) -> String {
        guard let next = rank.next, let missing = rank.gloryMissing else {
            return GameText.bannerGloryTotal(points: GameCopy.compactCount(rank.glory))
        }
        return GameText.bannerGloryMissing(points: GameCopy.compactCount(missing),
                                           rank: GameCopy.rankLabel(next.rank, division5: next.shownDivision))
    }

    /// « S1 ».
    static func seasonShort(_ number: Int) -> String {
        String(localized: "game2.banner.season.short", defaultValue: "S\(GameCopy.formatCount(number))", bundle: .main)
    }

    /// Ce que dit VoiceOver de CHAQUE pièce-bouton (#10846) — elle ouvre sa fiche.
    static func pieceLabel(_ piece: GamePlayerBanner.Piece, _ banner: GamePlayerBanner) -> String {
        switch piece {
        case .level:
            let toNext = banner.nextLevel.map {
                GameText.bannerToNext(percent: GameCopy.formatCount(banner.percent), level: GameCopy.formatCount($0))
            } ?? GameCopy.levelTopShort(cap: banner.levelCap)
            return [GameText.bannerLevel(level: GameCopy.formatCount(banner.level)), GameCopy.tierName(banner.tier), toNext]
                .joined(separator: GameText.bannerSeparator)
        case .sparks:
            return GameSparksCopy.sparks(banner.score)
        case .meesh:
            return GameCopy.meeshes(banner.meeshes ?? 0)
        case .rank:
            return banner.rank.map {
                [GameCopy.rankLabel($0.rank, division5: $0.division, mythic: $0.mythic), gloryMissing($0)].joined(separator: GameText.bannerSeparator)
            } ?? ""
        case .league:
            return banner.league.map {
                GameText.bannerLeague(league: GameText.leagueName($0.league), place: GameText.bannerPlace(count: $0.place))
            } ?? ""
        case .flame:
            return banner.flame.map { GameText.bannerFlame(days: GameCopy.days($0.days)) } ?? ""
        case .trophies:
            let count = banner.trophies ?? 0
            return String(localized: "game2.banner.trophies.a11y", defaultValue: "Trophées : \(GameCopy.formatCount(count))", bundle: .main)
        case .mission:
            let mission = banner.dailyMission ?? .init(done: 0, total: 0)
            return String(localized: "game2.banner.mission.a11y",
                          defaultValue: "Missions du jour : \(GameCopy.formatCount(mission.done)) sur \(GameCopy.formatCount(mission.total))",
                          bundle: .main)
        case .season:
            return String(localized: "game2.banner.season.a11y",
                          defaultValue: "Saison \(GameCopy.formatCount(banner.season?.number ?? 0))", bundle: .main)
        }
    }

    /// Ce que lit VoiceOver, en UNE phrase et dans l'ordre de la bannière : « Niveau 34, Éclat, 78 % vers le 35,
    /// 12 Meeshes, Conteur III, ligue Jade 4e, Flamme 23 jours ». Ce qui n'existe pas ne se dit pas.
    static func accessibilityLabel(for banner: GamePlayerBanner) -> String {
        let toNext = banner.nextLevel.map {
            GameText.bannerToNext(percent: GameCopy.formatCount(banner.percent), level: GameCopy.formatCount($0))
        } ?? GameCopy.levelTopShort(cap: banner.levelCap)
        // Le détail du niveau ne se dit qu'au-delà du niveau 1 (#9536) ; au niveau 1, ce sont les points gagnés qui parlent.
        let levelParts: [String?] = banner.showsLevel
            ? [GameText.bannerLevel(level: GameCopy.formatCount(banner.level)), GameCopy.tierName(banner.tier), toNext]
            : [banner.showsScore ? GameText.bannerPoints(points: GameCopy.formatCount(banner.score)) : nil]
        let parts: [String?] = levelParts + [
            banner.meeshes.map { GameCopy.meeshes($0) },
            banner.rank.map { GameCopy.rankLabel($0.rank, division5: $0.division, mythic: $0.mythic) },
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

    /// iPad : la colonne des conversations reste là, le fil ouvert dans l'autre prend toute sa hauteur. Les routes
    /// s'y ouvrent dans le PANNEAU de droite, jamais dans la pile du routeur (`isDeepRoute` y reste faux) : la loi de
    /// l'iPhone se lit donc sur la route du panneau — un écran principal (un hub) porte la bannière, un écran
    /// profond (Progression, une page du jeu, un détail) non.
    @MainActor
    static func hostsOnTablet(conversationIsOpen: Bool, panelRoute: Route?, reelsAreOpen: Bool) -> Bool {
        let panelIsDeep = panelRoute.map { !$0.isHub } ?? false
        return hosts(routeIsDeep: conversationIsOpen || panelIsDeep, reelsAreOpen: reelsAreOpen)
    }

    /// `lingering` : l'ouverture de l'app tient encore le bandeau (#9536) — au-delà de trente secondes il ne paraît plus.
    static func shows(hosted: Bool, free: Bool, hidden: Bool, lingering: Bool = true) -> Bool {
        hosted && free && !hidden && lingering
    }
}

/// Comment le bandeau du jeu s'en va (#9536) : LENTEMENT, en remontant vers le haut, quand son ouverture se termine ;
/// sous « Réduire les animations », par un fondu simple. Tout autre départ (un appel arrive, l'écran porte un fil) garde le
/// ressort des barres du haut — il n'y a rien à ralentir, le bandeau s'efface devant un besoin.
nonisolated enum PlayerBannerMotion {

    /// La durée de la sortie lente.
    static let exitDuration: TimeInterval = GamePlayerBannerOpening.exitDuration
    /// Le fondu simple, sous « Réduire les animations ».
    static let reducedFade: TimeInterval = 0.6

    /// `leaving` : la cible est vide (la bannière s'en va) ; `opening` : l'ouverture tient encore le bandeau — faux
    /// signifie que c'est la FIN de l'ouverture qui le retire.
    @MainActor
    static func animation(leaving: Bool, opening: Bool, reduceMotion: Bool) -> Animation? {
        guard leaving, !opening else { return TopChromeBarMotion.animation(reduceMotion: reduceMotion) }
        return .easeInOut(duration: reduceMotion ? reducedFade : exitDuration)
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
