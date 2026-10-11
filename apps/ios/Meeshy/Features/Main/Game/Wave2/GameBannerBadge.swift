import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le niveau et le rang sur la bannière d'une fiche (#10093, #10231)
//
// Deux groupes sur la bannière, aux deux bouts (précision porteur 2026-10-11 : « les détails de points à gauche de la
// bannière et le reste de rang à droite ») :
//  · au DÉBUT (à gauche ; à droite en RTL) : le NOM du niveau au-dessus de son cercle, et à côté les points acquis
//    et ce qu'il reste vers le niveau suivant — les mots de la bannière du joueur (« 976 pts », « encore 624 ») ;
//  · à la FIN : le blason du rang, son nom et sa division dessous (« Murmure V »).
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
    /// Les points acquis — `nil` quand le serveur ne les sert pas à ce lecteur.
    let points: Int?

    var levelName: String { GameCopy.tierName(tier) }
    var rankName: String { GameCopy.rankLabel(rank, division5: division, mythic: mythic) }

    /// Ce qu'il reste vers le niveau suivant (seuil 100 × N²) — `nil` sans points, ou quand le rang ou une étape
    /// retient le niveau : ses points ouvrent déjà la suite, et « encore 0 » ne dirait rien de juste.
    var pointsToNext: Int? {
        guard let points else { return nil }
        let remaining = GameLevels.threshold(of: level + 1) - points
        return remaining > 0 ? remaining : nil
    }

    /// La part du niveau suivant déjà gagnée ; le cercle reste plein quand rien ne la mesure.
    var levelProgress: Double {
        guard let points, pointsToNext != nil else { return 1 }
        let floor = level <= GameLevels.minLevel ? 0 : GameLevels.threshold(of: level)
        let span = GameLevels.threshold(of: level + 1) - floor
        guard span > 0 else { return 1 }
        return min(1, max(0, Double(points - floor) / Double(span)))
    }

    var pointsText: String? { points.map { GameText.bannerPoints(points: GameCopy.formatCount($0)) } }
    var missingText: String? { pointsToNext.map { GameText.bannerMissing(points: GameCopy.formatCount($0)) } }

    /// « Niveau 3, palier Étincelle, premier palier, 976 points, Encore 624 points avant le niveau 4 ».
    var levelAccessibilityLabel: String {
        let parts: [String?] = [
            GameCopy.levelRingAccessibility(level: level, tier: tier),
            points.map { GameCopy.points($0) },
            pointsToNext.map { GameCopy.levelToNext(remaining: $0, nextLevel: level + 1) },
        ]
        return parts.compactMap { $0 }.joined(separator: GameText.bannerSeparator)
    }

    /// « Rang, Murmure V ».
    var rankAccessibilityLabel: String {
        ConceptText.factRank + GameText.bannerSeparator + rankName
    }

    /// `nil` quand le serveur ne sert pas le niveau et le rang : un refus, un compte inconnu, ou le seul trésor.
    static func of(_ content: GameStandingContent?, userId: String) -> GameBannerBadgeModel? {
        guard let standing = content?.standing else { return nil }
        return GameBannerBadgeModel(
            userId: userId, level: standing.shownLevel, tier: standing.shownTier, prestige: standing.prestige,
            rank: standing.rank, division: standing.shownDivision, mythic: standing.mythic, points: standing.points
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

/// Les deux groupes, chacun sur son verre, aux deux bouts de la bannière : le niveau et ses points au DÉBUT, le rang à
/// la FIN. La vue occupe toute la largeur que l'hôte lui donne ; un `HStack` suit le sens de lecture, le RTL inverse
/// donc les deux bouts sans rien de plus.
struct GameBannerBadgeView: View {
    let model: GameBannerBadgeModel

    @ScaledMetric(relativeTo: .caption) private var emblemSize: CGFloat = 36

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.sm) {
            levelGroup
            Spacer(minLength: MeeshySpacing.sm)
            rankGroup
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }

    /// Le nom du niveau au-dessus de son cercle, et à côté les points acquis puis ce qu'il reste.
    private var levelGroup: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            caption(model.levelName)
            HStack(alignment: .center, spacing: MeeshySpacing.xs) {
                LevelRingView(
                    level: model.level, progress: model.levelProgress, tier: model.tier, prestige: model.prestige,
                    trackColor: Color.white.opacity(MeeshyOpacity.light), inkColor: .black, accessibilityLabel: nil
                )
                .frame(width: emblemSize, height: model.prestige > 0 ? emblemSize * 66 / 56 : emblemSize)
                if let pointsText = model.pointsText {
                    VStack(alignment: .leading, spacing: 0) {
                        Text(pointsText)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                            .foregroundColor(.white)
                        if let missingText = model.missingText {
                            Text(missingText)
                                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                                .foregroundColor(.white.opacity(0.85))
                        }
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: true, vertical: false)
                }
            }
        }
        .glassGroup()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.levelAccessibilityLabel)
        .accessibilityIdentifier("profile.banner.game.level")
    }

    /// Le blason du rang, son nom et sa division dessous.
    private var rankGroup: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            RankBlasonView(rank: model.rank, division5: model.division, level: model.level,
                           mythic: model.mythic, title: nil, figures: nil)
                .frame(width: emblemSize * 1.1, height: emblemSize * 1.1 * 0.93)
            caption(model.rankName)
        }
        .glassGroup()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.rankAccessibilityLabel)
        .accessibilityIdentifier("profile.banner.game.rank")
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }
}

private extension View {
    /// Le verre qui détache un groupe de n'importe quelle image : matière fine, voile sombre, filet clair.
    func glassGroup() -> some View {
        padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(.ultraThinMaterial)
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.black.opacity(0.28)))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(Color.white.opacity(0.18), lineWidth: 0.5))
            )
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
