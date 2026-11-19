import SwiftUI

// MARK: - « Sa Légende » sur la Vitrine d'un autre (#19416, planche `Autre-Vitrine`)
//
// Le niveau dans son médaillon (K45), le rang, les étincelles, la progression du niveau (K42), puis la rangée de
// trophées (K45 en rangée) : « 3 trophées sur 5 ». Le SDK ne sait rien du jeu : l'app lit ce que la visibilité du
// membre lui sert et remet des VALEURS déjà écrites. Rien de servi, rien de posé.

/// Ce que « Sa Légende » montre : ce que le serveur a servi à ce lecteur, et rien d'autre.
public nonisolated struct ProfileGameBoard: Equatable, Sendable {

    public nonisolated struct Trophy: Equatable, Sendable, Identifiable {
        public let id: String
        public let systemImage: String
        public let kind: MeeshyMedallionKind
        public let title: String

        public init(id: String, systemImage: String, kind: MeeshyMedallionKind, title: String) {
            self.id = id
            self.systemImage = systemImage
            self.kind = kind
            self.title = title
        }
    }

    /// Les places de la rangée : les trophées gagnés d'abord, des médaillons verrouillés ensuite.
    public static let trophySlots = 5

    public let level: Int
    public let rankName: String
    public let levelProgress: Double
    /// Les étincelles, déjà écrites (« 2 410 ») ; `nil` quand le serveur ne les sert pas à ce lecteur.
    public let sparks: String?
    public let trophies: [Trophy]

    public init(level: Int, rankName: String, levelProgress: Double, sparks: String?, trophies: [Trophy]) {
        self.level = max(0, level)
        self.rankName = rankName
        self.levelProgress = min(max(levelProgress, 0), 1)
        self.sparks = sparks
        self.trophies = trophies
    }

    public var shownTrophies: [Trophy] { Array(trophies.prefix(Self.trophySlots)) }

    /// Les places verrouillées qui complètent la rangée ; aucune quand il n'y a aucun trophée (la rangée ne se pose pas).
    public var lockedSlots: Int {
        trophies.isEmpty ? 0 : max(0, Self.trophySlots - shownTrophies.count)
    }

    public var trophyTotal: Int { max(Self.trophySlots, trophies.count) }
}

/// L'emplacement de « Sa Légende » : la carte que l'app pose dans la Vitrine (`ProfileGameSection.card`).
public struct ProfileGameBoardView: View {
    private let board: ProfileGameBoard
    private let tint: Color

    public init(board: ProfileGameBoard, tint: Color) {
        self.board = board
        self.tint = tint
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileVitrineCopy.gameTitle)
            MeeshyGroupCard(tint: tint) {
                VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                    standing
                    MeeshyMeter(value: board.levelProgress, label: ProfileVitrineCopy.level(board.level), tint: tint)
                    if !board.trophies.isEmpty { trophyRow }
                }
                .padding(MeeshySpacing.lg)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.vitrine.game")
    }

    private var standing: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyMedallion(value: String(board.level), kind: .accent, tint: tint, shape: .blob, fill: .solid,
                            size: .s64, label: ProfileVitrineCopy.level(board.level))
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(ProfileVitrineCopy.levelAndRank(board.level))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(board.rankName)
                    .font(MeeshyFont.relative(22, weight: .heavy, design: .rounded))
                if let sparks = board.sparks {
                    Label(ProfileVitrineCopy.sparks(sparks), systemImage: "sparkles")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(tint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    private var trophyRow: some View {
        let caption = ProfileVitrineCopy.trophies(earned: board.trophies.count, total: board.trophyTotal)
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshyMedallionRow(earned: board.trophies.count, total: board.trophyTotal, caption: caption) {
                ForEach(board.shownTrophies) { trophy in
                    MeeshyMedallion(systemImage: trophy.systemImage, kind: trophy.kind, shape: .blob, size: .s52)
                }
                ForEach(0..<board.lockedSlots, id: \.self) { _ in
                    MeeshyMedallion(kind: .neutral, shape: .blob, size: .s36, state: .locked, isAnimated: false)
                }
            }
            Text(caption)
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityHidden(true)
        }
    }
}
