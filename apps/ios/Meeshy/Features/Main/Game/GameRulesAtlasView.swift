import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le carnet des règles, illustré (#9538)
//
// La planche des éléments du jeu, DESSINÉE : neuf familles, chacune ouverte par Mee ou Meo qui disent UNE ligne, puis
// la grille de ses objets — les mêmes briques que partout dans l'app (`LevelRingView`, `MeeshCoinView`, `RankBlasonView`,
// `FlameView`, `LeagueGemView`, `GameBadgeView`, `TrophyView`, `gameRarityRim`). Aucune image bitmap : une brique
// retouchée change ici en même temps que là où le joueur la gagne.
//
// Une page qui EXPLIQUE : rien ne s'y touche, tout s'y lit. Le modèle (`GameRulesAtlas`) dit quoi montrer et dans quel
// ordre ; cette vue le pose dans une grille adaptative (Dynamic Type : les légendes passent à la ligne, la grille perd
// une colonne).

struct GameRulesAtlasView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            ForEach(GameRulesAtlas.Family.allCases) { family in
                section(family)
            }
        }
        .accessibilityIdentifier("game.rules.atlas")
    }

    // MARK: - Une famille : qui parle, puis ses objets

    private func section(_ family: GameRulesAtlas.Family) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            speaker(family)
            grid(family)
            if family == .tiers { levelRules }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous).fill(theme.backgroundSecondary))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.rules.atlas.\(family.rawValue)")
    }

    /// Mee ou Meo — le colibri, puis le titre et UNE ligne.
    private func speaker(_ family: GameRulesAtlas.Family) -> some View {
        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
            MeeStickerFilmView(
                filmID: family.speaker == .meo ? "meo-salut" : "mee-sourire", animated: true, side: 48,
                animates: !reduceMotion, pixelCap: 160
            )
            .scaleEffect(x: family.speaker == .meo ? -1 : 1, y: 1)
            .frame(width: 48, height: 48)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(GameAtlasCopy.title(family))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(GameAtlasCopy.line(family))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private static let columns = [GridItem(.adaptive(minimum: 84), spacing: MeeshySpacing.md, alignment: .top)]

    @ViewBuilder
    private func grid(_ family: GameRulesAtlas.Family) -> some View {
        switch family {
        case .tiers: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { tiers }
        case .coin: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { coin }
        case .treasury: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { treasury }
        case .ranks: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { ranks }
        case .flames: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { flames }
        case .leagues: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { leagues }
        case .medals: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { medals }
        case .trophies: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { trophies }
        case .rarities: LazyVGrid(columns: Self.columns, spacing: MeeshySpacing.md) { rarities }
        }
    }

    /// Un objet : son dessin, son nom, une ligne discrète — UN seul élément pour VoiceOver.
    private func cell<Art: View>(_ name: String, _ detail: String? = nil, @ViewBuilder art: () -> Art) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            art()
                .accessibilityHidden(true)
            Text(name)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            if let detail {
                Text(detail)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Les paliers : l'anneau et l'emblème de chacun

    @ViewBuilder
    private var tiers: some View {
        ForEach(GameRulesAtlas.tiers, id: \.self) { tier in
            let level = GameRulesAtlas.firstLevel(of: tier)
            cell(GameCopy.tierName(tier), String(localized: "game.hero.level", defaultValue: "Niveau \(GameCopy.formatCount(level))", bundle: .main)) {
                LevelRingView(
                    level: level, progress: 1, tier: tier,
                    trackColor: theme.textMuted.opacity(0.22), inkColor: theme.textPrimary, mutedColor: theme.textMuted,
                    discColor: isDark ? theme.backgroundSecondary : .white
                )
                .frame(width: 64, height: 64)
            }
        }
    }

    /// Jusqu'où chaque rang ouvre les niveaux, le Prestige facultatif, la Gloire du premier passage (#9688).
    private var levelRules: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            ForEach(GameAtlasCopy.levelRules, id: \.self) { rule in
                Text(rule)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("game.rules.atlas.tiers.rules")
    }

    // MARK: - La Meesh : avers, revers, éditions

    @ViewBuilder
    private var coin: some View {
        ForEach(GameRulesAtlas.CoinPlate.allCases) { plate in
            cell(GameAtlasCopy.coin(plate)) {
                MeeshCoinView(
                    face: plate.isReverse ? .reverse(number: plate.number, year: Calendar.current.component(.year, from: Date())) : .obverse,
                    edition: plate.edition
                )
                .frame(width: 84, height: 84)
            }
        }
    }

    // MARK: - Le trésor : une pile de plus à chaque palier

    @ViewBuilder
    private var treasury: some View {
        ForEach(GameRulesAtlas.treasury, id: \.self) { tier in
            cell(GameCopy.treasuryName(tier), GameCopy.formatCount(tier.minHeld) + "+") {
                TreasuryPile(count: GameRulesAtlas.pile(of: tier))
                    .frame(width: 66, height: 66)
            }
        }
    }

    // MARK: - Les blasons

    @ViewBuilder
    private var ranks: some View {
        ForEach(GameRulesAtlas.ranks, id: \.self) { rank in
            cell(
                GameCopy.rankName(rank),
                rank.minGlory.map { String(localized: "game.rank.glory", defaultValue: "Gloire \(GameCopy.formatCount($0))", bundle: .main) }
                    ?? GameAtlasCopy.mythRank
            ) {
                RankBlasonView(rank: rank, division5: GameRulesAtlas.division(of: rank), title: GameCopy.rankName(rank), figures: .standard)
                    .frame(width: 84, height: 77)
            }
        }
    }

    // MARK: - Les Flammes

    @ViewBuilder
    private var flames: some View {
        ForEach(GameRulesAtlas.flames, id: \.self) { form in
            cell(GameCopy.flameFormName(form), GameCopy.days(form.minDays) + (form == .braise ? "" : "+")) {
                FlameView(form: form, flickers: false)
                    .frame(width: 64, height: 64)
            }
        }
    }

    // MARK: - Les ligues

    @ViewBuilder
    private var leagues: some View {
        ForEach(GameRulesAtlas.leagues, id: \.self) { league in
            cell(GameText.leagueName(league)) {
                LeagueGemView(league: league)
                    .frame(width: 58, height: 58)
            }
        }
    }

    // MARK: - Les médailles : trois formes, sept matières, l'empreinte

    @ViewBuilder
    private var medals: some View {
        ForEach(GameRulesAtlas.MedalShape.allCases) { shape in
            cell(GameAtlasCopy.shape(shape)) {
                GameBadgeView(
                    shape: badgeShape(shape), material: shape == .record ? .platinum : (shape == .collection ? .prism : .gold),
                    label: shape == .collection ? nil : "100", surface: theme.backgroundSecondary, muted: theme.textMuted
                )
                .frame(width: 64, height: 64)
            }
        }
        ForEach(GameRulesAtlas.medalMaterials) { entry in
            cell(GameCopy.materialName(entry.material), GameCopy.actions(entry.threshold)) {
                GameBadgeView(
                    shape: .accumulation, material: entry.material, label: GameCopy.formatCount(entry.threshold),
                    surface: theme.backgroundSecondary, muted: theme.textMuted
                )
                .frame(width: 64, height: 64)
            }
        }
        cell(GameAtlasCopy.imprint) {
            GameBadgeView(
                shape: .accumulation, material: .gold, state: .imprint, label: "−37",
                surface: theme.backgroundSecondary, muted: theme.textMuted
            )
            .frame(width: 64, height: 64)
        }
    }

    private func badgeShape(_ shape: GameRulesAtlas.MedalShape) -> GameBadgeView.Shape {
        switch shape {
        case .accumulation: .accumulation
        case .record: .record
        case .collection: .collection(filled: 4, total: 6)
        }
    }

    // MARK: - Les trophées

    @ViewBuilder
    private var trophies: some View {
        ForEach(GameRulesAtlas.TrophyPlate.allCases) { plate in
            cell(GameAtlasCopy.trophy(plate), isLeagueCup(plate) ? GameCopy.materialName(plate.material) : nil) {
                TrophyView(material: plate.material, label: "", figures: plate == .prestige ? GameFigures.standard : nil)
                    .frame(width: plate == .prestige ? 92 : 64, height: 64)
            }
        }
    }

    private func isLeagueCup(_ plate: GameRulesAtlas.TrophyPlate) -> Bool {
        plate == .leagueGold || plate == .leagueSilver || plate == .leagueBronze
    }

    // MARK: - Les raretés : le liseré, la part des comptes, la Gloire

    @ViewBuilder
    private var rarities: some View {
        ForEach(GameRulesAtlas.rarities, id: \.self) { rarity in
            cell(
                GameText.rarityName(rarity),
                GameAtlasCopy.share(rarity) + " · "
                    + String(localized: "game.mint.chip.glory", defaultValue: "+\(GameCopy.formatCount(GameRulesAtlas.glory(of: rarity))) Gloire", bundle: .main)
            ) {
                SignatureMark(style: .flat, color: theme.textMuted, strokeWidth: 100)
                    .padding(14)
                    .frame(width: 56, height: 56)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundPrimary))
                    .gameRarityRim(GameRulesAtlas.border(of: rarity), cornerRadius: MeeshyRadius.md)
            }
        }
    }
}

// MARK: - La pile de pièces d'un palier du trésor

/// Une pile de pièces d'argent : une de plus à chaque palier, posées comme la planche (3 par rangée, en escalier).
private struct TreasuryPile: View {
    let count: Int

    /// La planche dessine dans 76 × 76 ; la pièce y mesure 120 × 0,27 ≈ 32.
    private static let box: CGFloat = 76
    private static let coin: CGFloat = 32.4

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(0..<count, id: \.self) { index in
                MeeshCoinView(face: .obverse, edition: .silver)
                    .frame(width: Self.coin, height: Self.coin)
                    .offset(
                        x: 4 + CGFloat(index % 3) * 17,
                        y: 42 - CGFloat(index / 3) * 18 - CGFloat(index % 3) * 4
                    )
            }
        }
        .frame(width: Self.box, height: Self.box, alignment: .topLeading)
        .scaleEffect(66 / Self.box)
        .frame(width: 66, height: 66)
    }
}
