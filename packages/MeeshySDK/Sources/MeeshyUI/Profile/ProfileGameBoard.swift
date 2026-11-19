import SwiftUI
import MeeshySDK

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

    /// Le blason du rang de Gloire, posé devant son nom (#19854).
    public nonisolated struct Crest: Equatable, Sendable {
        public let rank: GloryRank
        public let division5: GloryDivision5?
        public let mythic: MythicSeatRef?

        public init(rank: GloryRank, division5: GloryDivision5?, mythic: MythicSeatRef?) {
            self.rank = rank
            self.division5 = division5
            self.mythic = mythic
        }
    }

    public let level: Int
    public let rankName: String
    public let levelProgress: Double
    /// Le TOTAL des étincelles, déjà écrit (« 2 410 ») ; `nil` quand le serveur ne les sert pas à ce lecteur.
    public let sparks: String?
    public let trophies: [Trophy]
    /// Le palier du niveau : son dessin remplace le médaillon (#19854) ; `nil` ⇒ le chiffre seul.
    public let tier: LevelTierKey?
    public let crest: Crest?
    /// La Gloire, déjà écrite (« ♛ 18 790 »), et ce que VoiceOver en dit ; `nil` quand elle n'est pas servie.
    public let glory: String?
    public let gloryLabel: String?

    public init(level: Int, rankName: String, levelProgress: Double, sparks: String?, trophies: [Trophy],
                tier: LevelTierKey? = nil, crest: Crest? = nil, glory: String? = nil, gloryLabel: String? = nil) {
        self.level = max(0, level)
        self.rankName = rankName
        self.levelProgress = min(max(levelProgress, 0), 1)
        self.sparks = sparks
        self.trophies = trophies
        self.tier = tier
        self.crest = crest
        self.glory = glory
        self.gloryLabel = gloryLabel
    }

    /// « Niveau 6 · 3 748 étincelles », ou « Niveau 6 » quand les étincelles ne sont pas servies.
    @MainActor public var caption: String {
        sparks.map { ProfileVitrineCopy.levelAndSparks(level, sparks: $0) } ?? ProfileVitrineCopy.level(level)
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
            levelEmblem
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(board.caption)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(spacing: MeeshySpacing.xs) {
                    if let crest = board.crest {
                        RankBlasonView(rank: crest.rank, division5: crest.division5, mythic: crest.mythic, figures: nil)
                            .frame(height: 24)
                            .accessibilityHidden(true)
                    }
                    Text(board.rankName)
                        .font(MeeshyFont.relative(22, weight: .heavy, design: .rounded))
                }
                if let glory = board.glory {
                    Text(glory)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(tint)
                        .accessibilityLabel(board.gloryLabel ?? glory)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }

    /// Le dessin du palier, le niveau gravé dessous ; sans palier servi, le chiffre seul — jamais un médaillon (#19854).
    private var levelEmblem: some View {
        VStack(spacing: MeeshySpacing.xxs) {
            if let tier = board.tier {
                TierEmblemView(tier: tier)
                    .frame(width: 48, height: 48)
            }
            Text(String(board.level))
                .font(MeeshyFont.relative(board.tier == nil ? 32 : 15, weight: .heavy, design: .rounded))
                .foregroundStyle(tint)
        }
        .frame(minWidth: 64)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileVitrineCopy.level(board.level))
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
