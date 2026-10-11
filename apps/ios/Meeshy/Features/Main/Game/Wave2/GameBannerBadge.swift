import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le niveau et le rang sur la bannière d'une fiche (#10093)
//
// Un seul composant sur la bannière : le cercle de niveau surmonté du NOM du niveau (son palier), et à sa droite le
// blason du rang avec le NOM du rang en dessous. Ce que le serveur sert du jeu de ce membre selon SES réglages
// (`GET /users/:userId/game`, réglage `rank`) — la sienne comprise — et rien d'autre : ni trésor, ni vitrine, ni
// Flamme. La Flamme n'a aucun réglage de visibilité : son propriétaire ne peut pas choisir de la montrer, donc elle ne
// se montre sur aucune fiche.

/// Ce que la bannière montre. Le type ne PORTE pas la Flamme : aucune vue ne peut la peindre par mégarde.
struct GameBannerBadgeModel: Equatable {
    let userId: String
    let level: Int
    let tier: LevelTierKey
    let prestige: Int
    let rank: GloryRank
    let division: GloryDivision5?
    let mythic: MythicSeatRef?

    var levelName: String { GameCopy.tierName(tier) }
    var rankName: String { GameCopy.rankLabel(rank, division5: division, mythic: mythic) }

    /// « Niveau 42, palier Éclat, quatrième palier, Voix II ».
    var accessibilityLabel: String {
        GameCopy.levelRingAccessibility(level: level, tier: tier) + ", " + rankName
    }

    /// `nil` quand le serveur ne sert pas le niveau et le rang : un refus, un compte inconnu, ou le seul trésor.
    static func of(_ content: GameStandingContent?, userId: String) -> GameBannerBadgeModel? {
        guard let standing = content?.standing else { return nil }
        return GameBannerBadgeModel(
            userId: userId, level: standing.shownLevel, tier: standing.shownTier, prestige: standing.prestige,
            rank: standing.rank, division: standing.shownDivision, mythic: standing.mythic
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

/// La pastille elle-même : deux colonnes, chacune un nom et son emblème, sur un verre qui la détache de l'image.
struct GameBannerBadgeView: View {
    let model: GameBannerBadgeModel

    @ScaledMetric(relativeTo: .caption) private var emblemSize: CGFloat = 40

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            VStack(spacing: MeeshySpacing.xxs) {
                caption(model.levelName)
                LevelRingView(
                    level: model.level, progress: 1, tier: model.tier, prestige: model.prestige,
                    trackColor: Color.white.opacity(MeeshyOpacity.light), inkColor: .black, accessibilityLabel: nil
                )
                .frame(width: emblemSize, height: model.prestige > 0 ? emblemSize * 66 / 56 : emblemSize)
            }
            VStack(spacing: MeeshySpacing.xxs) {
                RankBlasonView(rank: model.rank, division5: model.division, level: model.level,
                               mythic: model.mythic, title: nil, figures: nil)
                    .frame(width: emblemSize, height: emblemSize * 0.93)
                caption(model.rankName)
            }
        }
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xs)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.md))
        .environment(\.colorScheme, .dark)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.accessibilityLabel)
        .accessibilityIdentifier("profile.banner.game")
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
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
