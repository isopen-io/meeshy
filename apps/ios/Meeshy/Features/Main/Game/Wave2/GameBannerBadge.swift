import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le niveau et le rang sur la bannière d'une fiche (#10093, #10231)
//
// Deux groupes sur la bannière, aux deux bouts (précision porteur 2026-10-11 : « les détails de points à gauche de la
// bannière et le reste de rang à droite ») :
//  · au DÉBUT (à gauche ; à droite en RTL) : le nom du palier au-dessus du cercle — qui porte le niveau, sa
//    progression et le prestige — et à droite les étincelles en grand, par leur glyphe (« ✦ 18 347 » — porteur
//    2026-10-19, #10951) ; le record ne se lit qu'à VoiceOver ;
//  · à la FIN : la Gloire (« ♛ 18 790 »), puis le blason du rang, son nom et sa division dessous (« Murmure V ») —
//    la Gloire fait le rang, elle se lit à côté de lui.
// Ce que le serveur sert du jeu de ce membre selon SES réglages (`GET /users/:userId/game`, réglage `rank`) — la
// sienne comprise — et rien d'autre : ni trésor, ni vitrine, ni Flamme. Les points ne sont servis qu'à soi et aux
// amis (#9541) : absents, rien ne se dessine à leur place. La Flamme n'a aucun réglage de visibilité : son
// propriétaire ne peut pas choisir de la montrer, donc elle ne se montre sur aucune fiche.

/// Ce que la bannière montre. Le type ne PORTE pas la Flamme : aucune vue ne peut la peindre par mégarde.
struct GameBannerBadgeModel: Equatable {
    let userId: String
    let level: Int
    let tier: LevelTierKey
    let prestige: Int
    let rank: GloryRank
    let division: GloryDivision5?
    let mythic: MythicSeatRef?
    /// La poche d'étincelles (#10846) — `sparks` servi, sinon `points` (même nombre devant un serveur antérieur) ;
    /// `nil` quand le serveur ne les sert pas à ce lecteur (#9541 : soi et les amis).
    let pocket: Int?
    /// La Gloire totale (#10913) — `nil` quand le serveur ne la sert pas à ce lecteur (soi et les amis), ou nulle.
    let glory: Int?
    /// Le record de niveau, qui survit au prestige — jamais sous le niveau montré.
    let levelMax: Int

    /// Les glyphes des deux monnaies du jeu, sans mot : ✦ les étincelles, ♛ la Gloire (◆ et ★ sont pris par le
    /// fragment et la coupe) — les mêmes que le web (`game-profile-banner.tsx`).
    static let sparkGlyph = "✦"
    static let gloryGlyph = "♛"

    var levelName: String { GameCopy.tierName(tier) }
    var rankName: String { GameCopy.rankLabel(rank, division5: division, mythic: mythic) }

    /// Le cercle se remplit de la POCHE, base du niveau (#10892). Quand elle ne porte pas le niveau servi (retenu par une
    /// étape, borné par le rang, ou un serveur antérieur), il reste PLEIN plutôt que de mentir.
    var levelProgress: Double {
        guard let pocket, GameLevels.level(forScore: pocket, cap: nil) == level else { return 1 }
        return GameLevels.progress(forScore: pocket, cap: nil).progress
    }

    var pocketText: String? { pocket.map { Self.glyphAmount(Self.sparkGlyph, $0) } }
    var gloryText: String? { glory.map { Self.glyphAmount(Self.gloryGlyph, $0) } }

    private static func glyphAmount(_ glyph: String, _ amount: Int) -> String {
        "\(glyph)\u{00A0}\(GameCopy.formatCount(amount))"
    }

    /// « Niveau 3, palier Braise, premier palier, Record de niveau 40, 976 étincelles ».
    var levelAccessibilityLabel: String {
        let parts: [String?] = [
            GameCopy.levelRingAccessibility(level: level, tier: tier),
            GameSparksCopy.levelMaxAccessibility(levelMax),
            pocket.map(GameSparksCopy.sparks),
        ]
        return parts.compactMap { $0 }.joined(separator: GameText.bannerSeparator)
    }

    /// « Rang, Murmure V, Gloire 16 000 » — la Gloire se lit avec le rang, à côté duquel elle se pose.
    var rankAccessibilityLabel: String {
        let parts: [String?] = [ConceptText.factRank, rankName, glory.map { GameCopy.gloryAmount(GameCopy.formatCount($0)) }]
        return parts.compactMap { $0 }.joined(separator: GameText.bannerSeparator)
    }

    /// `nil` quand le serveur ne sert pas le niveau et le rang : un refus, un compte inconnu, ou le seul trésor.
    static func of(_ content: GameStandingContent?, userId: String) -> GameBannerBadgeModel? {
        guard let standing = content?.standing else { return nil }
        return GameBannerBadgeModel(
            userId: userId, level: standing.shownLevel, tier: standing.shownTier, prestige: standing.prestige,
            rank: standing.rank, division: standing.shownDivision, mythic: standing.mythic,
            pocket: standing.sparks ?? standing.points, glory: standing.glory.flatMap { $0 > 0 ? $0 : nil },
            levelMax: max(standing.levelMaxLifetime ?? standing.ladder?.levelMaxLifetime ?? standing.shownLevel, standing.shownLevel)
        )
    }
}

/// Lit le niveau et le rang du membre — le cache d'abord, la lecture servie ensuite — et les pose sur la bannière.
struct GameBannerBadge: View {
    let userId: String
    var loader = GameUserGameLoader()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var model: GameBannerBadgeModel?

    var body: some View {
        // Un `ZStack`, jamais un `Group` : un `Group` distribue ses modificateurs à ses enfants, et tant que rien n'est
        // chargé il n'en a aucun — la tâche qui devait charger ne démarrait donc jamais (recette 2026-10-11). L'ancre
        // invisible garantit au `ZStack` un enfant, donc une apparition, cache vide compris.
        ZStack {
            GameLoadAnchor()
            if !prefs.prefs.hidden, let model, model.userId == userId {
                GameBannerBadgeView(model: model)
                    .transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: model)
        .task(id: userId) {
            guard !prefs.prefs.hidden else { return }
            if model?.userId != userId {
                let cached = await loader.cached(userId: userId)
                guard !Task.isCancelled else { return }
                model = GameBannerBadgeModel.of(cached, userId: userId)
            }
            let fresh = await loader.load(userId: userId)
            guard !Task.isCancelled else { return }
            model = GameBannerBadgeModel.of(fresh, userId: userId)
        }
    }
}

/// Les deux groupes, chacun sur son verre, aux deux angles BAS de la bannière (#10601, directive porteur 2026-10-14) : le
/// niveau et ses étincelles à l'angle bas du DÉBUT, le rang à l'angle bas de la FIN. Chaque cadre est collé à son bord de
/// la bannière : il n'a d'arrondi QU'au coin haut tourné vers le milieu — aucun au bord de DÉBUT pour les étincelles, aucun
/// au bord de FIN pour le rang (décision porteur 2026-10-16) ; ses coins bas sont carrés, posés sur le bord bas. Le fond
/// est un voile léger, sans matière floutée — la bannière et ses dessins se voient au travers ; une ombre de texte tient
/// la lecture sur une bannière claire. Un `HStack` suit le sens de lecture et place les GROUPES ; leurs COINS, eux, sont
/// des coins physiques (`UIRectCorner`) que `roundedCorners(for:direction:)` relit selon le sens — le RTL ne les inverse
/// pas tout seul. L'avatar chevauche le MILIEU du bas de la bannière : chaque groupe s'arrête avant lui (`centerClearance`).
struct GameBannerBadgeView: View {
    let model: GameBannerBadgeModel
    /// La largeur réservée au milieu du bas de la bannière : l'avatar (90 pt et son liseré de 4) et 4 pt de jour de
    /// chaque côté.
    var centerClearance: CGFloat = GameBannerBadgeView.avatarClearance

    static let avatarClearance: CGFloat = 106

    /// Les deux cadres ont TOUJOURS la même largeur (#10951) : chacun la moitié de ce que l'avatar laisse.
    static func groupWidth(bannerWidth: CGFloat, centerClearance: CGFloat = avatarClearance) -> CGFloat {
        max(0, (bannerWidth - centerClearance) / 2)
    }
    /// Les coins hauts de chaque cadre ; les coins bas restent carrés, sur le bord de la bannière.
    static let cornerRadius: CGFloat = MeeshyRadius.md
    enum Group { case level, rank }

    /// Le seul coin arrondi d'un groupe : le coin HAUT tourné vers le milieu de la bannière. Les étincelles sont au
    /// DÉBUT (leur coin haut de FIN s'arrondit), le rang à la FIN (son coin haut de DÉBUT) — physique selon le sens.
    static func roundedCorners(for group: Group, direction: LayoutDirection) -> UIRectCorner {
        let towardsTheMiddleIsRight = (group == .level) == (direction == .leftToRight)
        return towardsTheMiddleIsRight ? [.topRight] : [.topLeft]
    }
    /// Le voile : assez pour détacher le groupe, assez peu pour laisser voir la bannière.
    static let veilOpacity: Double = 0.24

    @ScaledMetric(relativeTo: .caption) private var emblemSize: CGFloat = 36
    @Environment(\.layoutDirection) private var layoutDirection

    var body: some View {
        GeometryReader { proxy in
            let side = Self.groupWidth(bannerWidth: proxy.size.width, centerClearance: centerClearance)
            // Les deux cadres ont la même largeur ET la même hauteur, quel que soit leur contenu (#10951) : chacun
            // s'étire à la hauteur du plus haut (`maxHeight: .infinity` sous un `fixedSize` vertical), le voile
            // posé APRÈS le cadre le couvre en entier.
            HStack(alignment: .bottom, spacing: 0) {
                levelGroup
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .glassGroup(corners: Self.roundedCorners(for: .level, direction: layoutDirection))
                    .frame(width: side)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(model.levelAccessibilityLabel)
                    .accessibilityIdentifier("profile.banner.game.level")
                Spacer(minLength: 0)
                rankGroup
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .glassGroup(corners: Self.roundedCorners(for: .rank, direction: layoutDirection))
                    .frame(width: side)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(model.rankAccessibilityLabel)
                    .accessibilityIdentifier("profile.banner.game.rank")
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .bottom)
        }
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }

    /// En colonne : le nom du palier, le cercle, puis les étincelles dessous (porteur 2026-10-19, #10951).
    private var levelGroup: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            small(model.levelName)
            LevelRingView(
                level: model.level, progress: model.levelProgress, tier: model.tier, prestige: model.prestige,
                trackColor: Color.white.opacity(MeeshyOpacity.light), inkColor: .black, accessibilityLabel: nil
            )
            .frame(width: emblemSize, height: model.prestige > 0 ? emblemSize * 66 / 56 : emblemSize)
            if let pocketText = model.pocketText {
                amount(pocketText, size: MeeshyFont.bodySize)
            }
        }
    }

    /// En colonne : la Gloire au-dessus du blason du rang, son nom et sa division dessous (porteur 2026-10-19, #10951).
    private var rankGroup: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            if let gloryText = model.gloryText {
                amount(gloryText, size: MeeshyFont.bodySize)
            }
            RankBlasonView(rank: model.rank, division5: model.division, level: model.level,
                           mythic: model.mythic, title: nil, figures: nil)
                .frame(width: emblemSize * 1.1, height: emblemSize * 1.1 * 0.93)
            caption(model.rankName)
        }
    }

    private func amount(_ text: String, size: CGFloat) -> some View {
        Text(text)
            .font(MeeshyFont.relative(size, weight: .bold))
            .monospacedDigit()
            .foregroundColor(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .bannerTextShadow()
    }

    private func small(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
            .foregroundColor(.white.opacity(0.92))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .bannerTextShadow()
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .bannerTextShadow()
    }
}

private extension View {
    /// Le cadre d'un groupe : seul le coin haut tourné vers le milieu s'arrondit (`corners`), les autres sont carrés,
    /// collés aux bords de la bannière ; voile léger.
    func glassGroup(corners: UIRectCorner) -> some View {
        padding(.horizontal, MeeshySpacing.xs)
            .padding(.top, MeeshySpacing.xs)
            .padding(.bottom, MeeshySpacing.xsPlus)
            .background(
                RoundedCorner(radius: GameBannerBadgeView.cornerRadius, corners: corners)
                    .fill(Color.black.opacity(GameBannerBadgeView.veilOpacity))
            )
    }

    /// Un liseré d'ombre serré autour de chaque lettre, puis une ombre courte : le texte blanc reste lisible sur une
    /// bannière claire, là où un fond épais la cacherait.
    func bannerTextShadow() -> some View {
        shadow(color: .black.opacity(0.9), radius: 0.8)
            .shadow(color: .black.opacity(0.5), radius: 2, x: 0, y: 0.5)
    }
}

/// Un point sans taille ni voix : l'enfant qui garantit qu'une vue dont tout le contenu attend une lecture APPARAÎT —
/// et démarre donc la tâche qui lit (#10093).
struct GameLoadAnchor: View {
    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
    }
}
