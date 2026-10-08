import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les badges d'accumulation sur Progression (#9380)
//
// `BadgeStage` (la matière qui remonte du bas en 0,7 s, avec sa tape légère) n'avait
// AUCUN hôte : l'écran n'affichait les badges que sous forme de pastilles. Cette étagère
// les montre — ceux que l'utilisateur a GAGNÉS, allumés ; ceux qu'une frappe a éteints,
// en empreinte qui dit ce qu'il manque pour les rallumer (« −37 »). Un badge jamais
// gagné ne s'y montre pas : la page « Badges » dit déjà ce qui reste à atteindre.
//
// Depuis #9640, l'étagère est RANGÉE PAR FAMILLE, un badge par axe (son plus haut palier),
// chacun avec ses étoiles sur sept et la SUITE de ses paliers à venir, et elle mène à la
// section badges du carnet des règles (« Comprendre les badges »).
//
// Les badges d'accumulation sont des MÉDAILLES (#9466, `GameMedalView`) : lunette de métal,
// émail à la couleur de la famille, pictogramme d'axe, perles de palier, ruban à partir de
// l'Or, et l'arc de progression vers le palier suivant. Les hexagones ont disparu d'ici.

/// UN badge d'accumulation tel que l'étagère le dessine.
nonisolated struct GameBadgeItem: Identifiable, Equatable, Sendable {
    let axis: EngagementAxisKey
    let threshold: Int
    let material: GameMaterial
    /// Le compteur tient le palier. Faux ⇒ l'empreinte d'un badge gagné puis éteint par une frappe.
    let lit: Bool
    /// Ce qu'il manque pour le rallumer ; 0 quand il est allumé.
    let missing: Int
    /// Le compteur courant de l'axe.
    let value: Int
    /// Le seuil du palier suivant ; `nil` au sommet de l'échelle.
    let nextThreshold: Int?

    var id: String { "\(axis.rawValue):\(threshold)" }

    var family: GameMedalFamily { GameMedalFamily(axis.family) }
    var glyph: GameMedalGlyph { GameMedalGlyph(axis: axis) }

    /// La part parcourue vers le palier suivant, de 0 à 1 ; 1 au sommet, 0 pour une empreinte.
    var progress: Double {
        guard lit else { return 0 }
        guard let nextThreshold, nextThreshold > threshold else { return 1 }
        return min(1, max(0, Double(value - threshold) / Double(nextThreshold - threshold)))
    }

    /// Un palier à viser encore : le compteur n'a pas atteint le suivant.
    var aimsAtNext: Bool {
        guard lit, let nextThreshold else { return false }
        return value < nextThreshold
    }
}

nonisolated enum GameBadges {

    /// La matière dit la HAUTEUR du palier (conception, § II.7) : Cuivre 1 · Bronze 10 ·
    /// Argent 50 · Or 100 · Platine 500 · Obsidienne 1 000 · Prisme 5 000.
    private static let materials: [Int: GameMaterial] = [
        1: .copper, 10: .bronze, 50: .silver, 100: .gold, 500: .platinum, 1_000: .obsidian, 5_000: .prism,
    ]

    /// Un palier que le jeu ne connaît pas encore reçoit la matière la plus haute : un badge de
    /// plus haut niveau que les connus ne se dessine jamais en cuivre.
    static func material(forThreshold threshold: Int) -> GameMaterial {
        materials[threshold] ?? .prism
    }

    /// Les badges gagnés, axe après axe. Un palier gravé ne se reprend jamais (le résolveur le
    /// tient pour atteint même quand le compteur est retombé) : c'est le compteur courant qui
    /// dit s'il est ALLUMÉ ou réduit à son empreinte.
    static func items(for progress: EngagementProgress) -> [GameBadgeItem] {
        progress.axes.flatMap { axis in
            let thresholds = axis.scale.tiers.map(\.threshold)
            return axis.scale.tiers.filter(\.reached).map { tier in
                GameBadgeItem(
                    axis: axis.axis,
                    threshold: tier.threshold,
                    material: material(forThreshold: tier.threshold),
                    lit: axis.scale.value >= tier.threshold,
                    missing: max(0, tier.threshold - axis.scale.value),
                    value: axis.scale.value,
                    nextThreshold: thresholds.filter { $0 > tier.threshold }.min()
                )
            }
        }
    }

    /// L'étagère : les badges GAGNÉS, un par axe, rangés par famille dans l'ordre déclaré (`BadgeGuideResolver.byFamily`).
    /// Un axe jamais gagné n'y paraît pas, une famille vide non plus.
    static func shelf(for progress: EngagementProgress) -> [GameBadgeShelfGroup] {
        let top = Dictionary(items(for: progress).map { ($0.axis, $0) }, uniquingKeysWith: { lower, higher in
            higher.threshold > lower.threshold ? higher : lower
        })
        return BadgeGuideResolver.byFamily(progress.axes.map { BadgeGuideResolver.resolve($0) }).compactMap { group in
            let entries = group.guides.compactMap { guide in top[guide.axis].map { GameBadgeShelfEntry(item: $0, guide: guide) } }
            return entries.isEmpty ? nil : GameBadgeShelfGroup(family: group.family, entries: entries)
        }
    }
}

// MARK: - L'étagère rangée par famille (#9640)

/// UN badge de l'étagère : la médaille de SON axe (son plus haut palier, allumée ou en empreinte) et son guide — ce
/// que la loi partagée dit de lui (`BadgeGuideResolver`, #9639), dont la SUITE de ses paliers à venir.
nonisolated struct GameBadgeShelfEntry: Identifiable, Equatable, Sendable {
    let item: GameBadgeItem
    let guide: BadgeGuide

    var axis: EngagementAxisKey { item.axis }
    var id: EngagementAxisKey { item.axis }
}

/// Une famille de l'étagère, ses badges dans l'ordre du catalogue.
nonisolated struct GameBadgeShelfGroup: Identifiable, Equatable, Sendable {
    let family: EngagementAxisFamily
    let entries: [GameBadgeShelfEntry]

    var id: EngagementAxisFamily { family }
}

extension GameMaterial {
    /// La matière d'un palier de la loi partagée (`GameBadgeTiers`), du cuivre au prisme.
    init(badge key: BadgeMaterialKey) {
        switch key {
        case .cuivre: self = .copper
        case .bronze: self = .bronze
        case .argent: self = .silver
        case .or: self = .gold
        case .platine: self = .platinum
        case .obsidienne: self = .obsidian
        case .prisme: self = .prism
        }
    }
}

// MARK: - Ce qu'un badge dit de lui-même (#9640)

enum GameBadgeRungState: Equatable {
    case reached
    /// La prochaine étoile : ce qu'il manque se dit.
    case next
    case upcoming
}

/// Un palier de l'échelle, mis en mots : sa matière, son seuil, son état — et la phrase que VoiceOver en lit.
struct GameBadgeRungModel: Identifiable, Equatable {
    let threshold: Int
    let thresholdLabel: String
    let material: GameMaterial
    let materialName: String
    let ribbon: Bool
    let state: GameBadgeRungState
    /// « Obtenu le 3 octobre 2026 », « Prochaine étoile · encore 13 », « À 100 ».
    let line: String
    let accessibilityLabel: String

    var id: Int { threshold }
}

/// LA LOI PARTAGÉE MISE EN MOTS (miroir de `badgeGuideView`, `apps/web/src/lib/view/badge-guide-view.ts`) : ce qui
/// compte pour CE badge (la phrase de l'AXE, jamais celle de la famille), sa matière et pourquoi, ses étoiles sur
/// sept, ses sept paliers (atteints datés, à venir avec leur seuil), ce qu'il manque pour la prochaine étoile. La
/// fiche, l'étagère et la page des badges le lisent : un badge dit la même chose partout.
struct GameBadgeGuideModel: Equatable {
    let axis: EngagementAxisKey
    let counts: String
    /// La matière atteinte ; `nil` avant le premier palier.
    let material: GameMaterial?
    /// Pourquoi cette matière : le seuil franchi (ou la trace gravée), ou ce qui allumera la première étoile.
    let reason: String
    let stars: Int
    let starsMax: Int
    let ladder: [GameBadgeRungModel]
    /// Ce qu'il manque pour la prochaine étoile, ou l'échelle complète.
    let next: String

    /// La suite du badge : les paliers à venir, dans l'ordre.
    var upcoming: [GameBadgeRungModel] { ladder.filter { $0.state != .reached } }

    var starsLine: String { GameBadgeGuideText.starsA11y(lit: GameCopy.formatCount(stars), max: GameCopy.formatCount(starsMax)) }

    /// Le badge en UNE phrase : l'axe, sa matière, ses étoiles, puis la prochaine étape.
    func accessibilityLabel(axisTitle: String) -> String {
        [axisTitle, material.map { GameCopy.materialName($0) }, starsLine].compactMap { $0 }.joined(separator: ", ") + ". " + next
    }

    static func make(_ guide: BadgeGuide) -> GameBadgeGuideModel {
        let ladder = guide.rungs.map { rung -> GameBadgeRungModel in
            let state: GameBadgeRungState = rung.reached ? .reached : (guide.next?.threshold == rung.threshold ? .next : .upcoming)
            let material = GameMaterial(badge: rung.material)
            let name = GameCopy.materialName(material)
            let threshold = GameCopy.formatCount(rung.threshold)
            let date = EngagementProgressResolver.reachedDate(rung.reachedAt)?.formatted(date: .long, time: .omitted)
            let missing = GameCopy.formatCount(guide.next?.missing ?? 0)
            let line: String
            let spoken: String
            switch state {
            case .reached:
                line = date.map { GameDetailText.earnedOn($0) } ?? GameDetailText.earned
                spoken = date.map { GameBadgeGuideText.rungReachedOnA11y(material: name, threshold: threshold, date: $0) }
                    ?? GameBadgeGuideText.rungReachedA11y(material: name, threshold: threshold)
            case .next:
                line = GameBadgeGuideText.rungNext(missing: missing)
                spoken = GameBadgeGuideText.rungNextA11y(material: name, threshold: threshold, missing: missing)
            case .upcoming:
                line = GameBadgeGuideText.rungUpcoming(threshold: threshold)
                spoken = GameBadgeGuideText.rungUpcomingA11y(material: name, threshold: threshold)
            }
            return GameBadgeRungModel(threshold: rung.threshold, thresholdLabel: threshold, material: material, materialName: name,
                                      ribbon: rung.ribbon, state: state, line: line, accessibilityLabel: spoken)
        }
        return GameBadgeGuideModel(
            axis: guide.axis,
            counts: ProgressionCopy.whatCounts(for: guide.axis),
            material: guide.reached.map { GameMaterial(badge: $0.material) },
            reason: reason(of: guide),
            stars: guide.stars,
            starsMax: BadgeGuideResolver.starsMax,
            ladder: ladder,
            next: next(of: guide)
        )
    }

    private static func reason(of guide: BadgeGuide) -> String {
        guard let reached = guide.reached else { return GameBadgeGuideText.reasonNone }
        let material = GameCopy.materialName(GameMaterial(badge: reached.material))
        let threshold = GameCopy.formatCount(reached.threshold)
        switch reached.reason {
        case .thresholdCrossed:
            return GameBadgeGuideText.reasonCrossed(material: material, threshold: threshold, count: GameCopy.formatCount(guide.count))
        case .served:
            return GameBadgeGuideText.reasonServed(material: material, threshold: threshold)
        }
    }

    private static func next(of guide: BadgeGuide) -> String {
        guard let next = guide.next else { return GameBadgeGuideText.complete }
        return GameBadgeGuideText.next(
            missing: GameCopy.formatCount(next.missing),
            material: GameCopy.materialName(GameMaterial(badge: next.material)),
            threshold: GameCopy.formatCount(next.threshold)
        )
    }
}

// MARK: - « Comprendre les badges »

private struct GameOpenBadgesGuideKey: EnvironmentKey {
    static let defaultValue: (() -> Void)? = nil
}

extension EnvironmentValues {
    /// Ouvre LA section badges du carnet des règles (`GameNavigationMap.badgesGuide`). Posée par les pages qui tiennent
    /// le routeur ; `nil` ailleurs : le lien ne se montre pas plutôt que de ne mener nulle part.
    var gameOpenBadgesGuide: (() -> Void)? {
        get { self[GameOpenBadgesGuideKey.self] }
        set { self[GameOpenBadgesGuideKey.self] = newValue }
    }
}

/// Le lien « Comprendre les badges » — le même partout (fiche d'un badge, étagère, page des badges).
struct GameBadgeGuideLink: View {
    let action: () -> Void

    var body: some View {
        ProgressionConceptRow(title: GameBadgeGuideText.guideLink, symbol: "questionmark.circle", identifier: "game.badge.guide", action: action)
    }
}

// MARK: - Les vues d'un guide

/// La pastille de métal d'un palier : la matière, éteinte quand le palier est à venir. Décorative.
struct GameBadgeSwatch: View {
    let material: GameMaterial
    let lit: Bool
    var size: CGFloat = 18

    var body: some View {
        Circle()
            .fill(material.gradient)
            .opacity(lit ? 1 : 0.35)
            .overlay(Circle().strokeBorder(ThemeManager.shared.textMuted, lineWidth: lit ? 0 : 1.5))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

/// Les étoiles allumées sur sept — dites à VoiceOver en toutes lettres.
struct GameBadgeStarsView: View {
    let model: GameBadgeGuideModel
    @ScaledMetric(relativeTo: .title3) private var star: CGFloat = 20

    var body: some View {
        HStack(spacing: MeeshySpacing.xxs) {
            ForEach(0..<model.starsMax, id: \.self) { index in
                Image(systemName: "star.fill")
                    .font(.system(size: star, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary.opacity(index < model.stars ? 1 : 0.25))
            }
            Text(ConceptText.ratio(GameCopy.formatCount(model.stars), GameCopy.formatCount(model.starsMax)))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(ThemeManager.shared.textMuted)
                .padding(.leading, MeeshySpacing.xxs)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(model.starsLine)
        .accessibilityIdentifier("game.badge.stars")
    }
}

/// L'échelle entière d'un badge : ses sept paliers, chacun lu en UNE phrase.
struct GameBadgeLadderView: View {
    let model: GameBadgeGuideModel

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            ProgressionConceptSectionTitle(text: GameBadgeGuideText.ladderTitle)
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ForEach(model.ladder) { rung in
                    HStack(alignment: .center, spacing: MeeshySpacing.md) {
                        GameBadgeSwatch(material: rung.material, lit: rung.state == .reached)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(rung.materialName + " · " + rung.thresholdLabel)
                                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                                .foregroundColor(rung.state == .reached ? theme.textPrimary : theme.textMuted)
                            Text(rung.line)
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: rung.state == .next ? .semibold : .regular))
                                .foregroundColor(rung.state == .next ? MeeshyColors.brandPrimary : theme.textMuted)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(rung.accessibilityLabel)
                    .accessibilityIdentifier("game.badge.rung.\(rung.threshold)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.badge.ladder")
    }
}

/// La SUITE compacte d'un badge : ses paliers à venir, leur matière et leur seuil ; l'échelle complète au Prisme.
struct GameBadgeUpcomingView: View {
    let model: GameBadgeGuideModel

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Group {
            if model.upcoming.isEmpty {
                Text(model.next)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                FlowLayout(spacing: MeeshySpacing.xs) {
                    Text(GameBadgeGuideText.upcomingTitle)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(GameChip.minimumScale)
                    ForEach(model.upcoming) { rung in
                        HStack(spacing: MeeshySpacing.xxs) {
                            GameBadgeSwatch(material: rung.material, lit: false, size: 10)
                            Text(rung.materialName + " " + rung.thresholdLabel)
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: rung.state == .next ? .semibold : .regular))
                                .foregroundColor(rung.state == .next ? MeeshyColors.brandPrimary : theme.textMuted)
                                .lineLimit(1)
                                .minimumScaleFactor(GameChip.minimumScale)
                        }
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(GameBadgeGuideText.upcomingTitle + " : " + model.upcoming.map(\.accessibilityLabel).joined(separator: " ; "))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - L'étagère

/// L'ÉTAGÈRE (#9640) : les badges gagnés rangés PAR FAMILLE — la médaille de chaque axe à son plus haut palier, ses
/// étoiles, et la suite de ses paliers à venir — puis « Comprendre les badges ». Avant le premier badge, seul le lien.
struct GameBadgeShelfView: View {
    let progress: EngagementProgress
    var haptics: GameHapticsProviding = GameHaptics.shared

    @Environment(\.gameOpenBadgesGuide) private var openGuide
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let groups = GameBadges.shelf(for: progress)
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            ForEach(groups) { group in
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(ProgressionCopy.title(for: group.family))
                        .font(.caption2.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(theme.textMuted)
                        .accessibilityAddTraits(.isHeader)
                    ProgressionCard(tint: MeeshyColors.brandPrimary) {
                        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                            ForEach(Array(group.entries.enumerated()), id: \.element.id) { index, entry in
                                if index > 0 { Divider().overlay(theme.textMuted.opacity(0.2)) }
                                GameBadgeShelfRow(entry: entry, progress: progress, haptics: haptics)
                            }
                        }
                    }
                }
            }
            if let openGuide {
                GameBadgeGuideLink(action: openGuide)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Une ligne de l'étagère : la médaille (elle SE TOUCHE et ouvre les précisions du badge), son axe, ses étoiles, sa suite.
private struct GameBadgeShelfRow: View {
    let entry: GameBadgeShelfEntry
    let progress: EngagementProgress
    let haptics: GameHapticsProviding

    private var theme: ThemeManager { ThemeManager.shared }
    private var item: GameBadgeItem { entry.item }

    var body: some View {
        let model = GameBadgeGuideModel.make(entry.guide)
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                GameBadgeCell(item: item, haptics: haptics)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(ProgressionCopy.title(for: entry.axis))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    GameBadgeStarsView(model: model)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(model.accessibilityLabel(axisTitle: ProgressionCopy.title(for: entry.axis)))
            // Un badge SE TOUCHE (#9564) : il rebondit et ouvre ses précisions.
            .gameElement(GameElementDetails.badge(item, progress: progress), identifier: "game.badge.shelf.\(entry.axis.rawValue)")
            GameBadgeUpcomingView(model: model)
        }
    }
}

/// Un badge. Rien ne se joue au premier rendu : seul un CHANGEMENT d'état — allumé par une
/// mission, éteint par une frappe — rejoue la chorégraphie (la matière remonte, ou se retire),
/// et la tape légère n'accompagne que l'allumage.
private struct GameBadgeCell: View {
    let item: GameBadgeItem
    let haptics: GameHapticsProviding

    @State private var play = 0

    private var label: String {
        item.lit
            ? GameCopy.formatCount(item.threshold)
            : "−" + GameCopy.formatCount(item.missing)
    }

    /// « Messages texte, Or, 100 sur 500 vers Platine » : l'axe, la matière, où l'on en est et ce qu'on vise.
    private var accessibilityText: String {
        let axis = ProgressionCopy.title(for: item.axis)
        guard item.lit else {
            return axis + ", " + String(
                localized: "game.badge.a11y.imprint",
                defaultValue: "Éteint, encore \(GameCopy.formatCount(item.missing)) pour le rallumer",
                bundle: .main
            )
        }
        let material = GameCopy.materialName(item.material)
        guard item.aimsAtNext, let next = item.nextThreshold else {
            return axis + ", " + material + ", " + ProgressionCopy.tierAccessibilityLabel(
                EngagementTier(threshold: item.threshold, reached: true, reachedAt: nil)
            )
        }
        return String(
            localized: "game.medal.a11y.toward",
            defaultValue: "\(axis), \(material), \(GameCopy.formatCount(item.value)) sur \(GameCopy.formatCount(next)) vers \(GameCopy.materialName(GameBadges.material(forThreshold: next)))",
            bundle: .main
        )
    }

    var body: some View {
        BadgeStage(
            shape: .accumulation, material: item.material, label: label,
            lit: item.lit, play: play, accessibilityLabel: accessibilityText,
            medal: BadgeMedal(family: item.family, glyph: item.glyph, progress: item.progress)
        )
        .frame(width: 64, height: 72)
        .adaptiveOnChange(of: item.lit) { _, lit in
            play += 1
            if lit { haptics.play(GameHapticPattern.badgeLit) }
        }
    }
}
