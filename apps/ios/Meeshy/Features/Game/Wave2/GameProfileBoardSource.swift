import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Sa Légende » dans la Vitrine d'un autre (#19416, planche `Autre-Vitrine`)
//
// Le jeu d'un membre n'était qu'un badge sur sa bannière (#10093) ; la Vitrine le dit désormais en entier : son niveau
// dans un médaillon (K45), son rang, ses étincelles quand elles me sont servies, la progression du niveau (K42) et sa
// rangée de trophées. La lecture est celle de la carte de contact (`GameVisitorLoading`) : cache d'abord, puis la
// lecture servie, qui l'efface quand le membre a fermé son réglage. Rien de servi, rien de posé.

enum GameProfileBoardRules {

    /// `nil` sous « Jeu masqué », pour un autre membre que celui qu'on lit, ou sans niveau servi.
    static func board(_ read: GameVisitorRead?, for userId: String, hidden: Bool) -> ProfileGameBoard? {
        guard let shown = GameVisitorRead.shown(read, for: userId, hidden: hidden),
              let model = GameBannerBadgeModel.of(shown.standing, userId: userId) else { return nil }
        return ProfileGameBoard(
            level: model.level,
            rankName: model.rankName,
            levelProgress: model.levelProgress,
            sparks: model.pocket.map { GameCopy.formatCount($0) },
            trophies: shown.entries.map { trophy($0) }
        )
    }

    /// La coupe d'un trophée, en médaillon : sa matière dit son glyphe et son ton ; son titre se lit dans la rangée.
    static func trophy(_ entry: GameVisitorShowcase.Entry) -> ProfileGameBoard.Trophy {
        let face = medallion(entry.presentation.kind)
        return ProfileGameBoard.Trophy(id: entry.key, systemImage: face.systemImage, kind: face.kind,
                                       title: entry.presentation.title)
    }

    static func medallion(_ kind: GameTrophyPresentation.Kind) -> (systemImage: String, kind: MeeshyMedallionKind) {
        switch kind {
        case .league(let cup):
            switch cup {
            case .gold: return ("trophy.fill", .warn)
            case .silver: return ("medal.fill", .neutral)
            case .bronze: return ("medal.fill", .accent)
            }
        case .season: return ("crown.fill", .accent)
        case .prestige: return ("sparkles", .accent)
        case .flame: return ("flame.fill", .err)
        }
    }
}

/// La carte « Sa Légende » qu'injecte l'app dans la Vitrine (`ProfileGameSection.card`).
struct GameProfileBoardSource: View {
    let userId: String
    let tint: Color
    var loader = GameShowcaseLoader()
    var standingLoader = GameUserGameLoader()

    @ObservedObject private var prefs = GameDevicePrefsStore.current()
    @State private var read: GameVisitorRead?

    var body: some View {
        // Un `ZStack` et son ancre, jamais un `Group` vide : sans enfant, la tâche qui lit ne démarrerait pas (#10093).
        ZStack(alignment: .leading) {
            GameLoadAnchor()
            if let board = GameProfileBoardRules.board(read, for: userId, hidden: prefs.prefs.hidden) {
                ProfileGameBoardView(board: board, tint: tint)
                    .transition(.opacity)
            }
        }
        .task(id: userId) {
            guard !prefs.prefs.hidden else { return }
            if let fresh = await GameVisitorLoading.read(userId: userId, kept: read, showcase: loader,
                                                         standing: standingLoader, paintCached: { read = $0 }) {
                read = fresh
            }
        }
    }
}
