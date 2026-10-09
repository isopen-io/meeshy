import SwiftUI
import MeeshySDK
import MeeshyUI

/// « COMMENT ÇA MARCHE » (#9379) — le carnet des règles. Le texte que Mee et Meo
/// disent à l'intégration (conception, partie I : « les règles en une page ») et
/// que le joueur retrouve ici quand il veut, avec les sept cartes de l'intégration
/// en entier : chacune peut se passer, le carnet les garde toutes. Miroir de
/// `apps/web/src/routes/progression-rules.tsx`.
///
/// Entre les règles et les étapes, l'atlas illustré (`GameRulesAtlasView`, #9538) : le détail de la conception — les
/// dix paliers, la Meesh avers et revers, les paliers du trésor, les onze blasons, les cinq Flammes, les huit ligues,
/// les médailles, les trophées, les raretés — avec les mêmes dessins que partout dans l'app.
///
/// Une page qui EXPLIQUE, sans geste : aucun bouton n'y agit, rien n'y est promis
/// qui ne soit dit ailleurs. Pas de lecture réseau : elle s'ouvre instantanément,
/// hors ligne comme en ligne.
///
/// `focusedRule` (#5841) : la page s'ouvre À LA BONNE LIGNE — « Comment gagner » du héro mène à
/// « Chaque geste rapporte », « Comment frapper » à « On frappe des Meeshes ». La règle visée
/// défile en haut et se teinte un instant ; sans règle visée, la page s'ouvre en haut.
///
/// `focusedSection` (#9640) : la page s'ouvre À UNE SECTION — « Comprendre les badges », de la fiche d'un badge, de
/// l'étagère ou de la page des badges, mène à la section badges (`GameNavigationMap.badgesGuide`).
struct GameRulesPage: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var theme: ThemeManager { ThemeManager.shared }

    var focusedRule: Int?
    var focusedSection: GameRulesSection?

    @State private var highlighted: Int?

    var body: some View {
        // Le lecteur de défilement ENVELOPPE le gabarit : la règle visée se trouve dans SON défilement.
        ScrollViewReader { proxy in
            GamePageScaffold(
                title: String(localized: "game.rules.page_title", defaultValue: "Comment ça marche", bundle: .main),
                identifier: "game.rules.page"
            ) {
                VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                    intro
                    rules
                    // Les badges, dits UN par UN (#9640) : matières et seuils, ruban, empreinte, les vingt par famille.
                    GameRulesBadgesSection()
                        .id(Self.sectionID(.badges))
                    // Les éléments du jeu, DESSINÉS (#9538) : paliers, pièces, trésor, blasons, Flammes, ligues,
                    // médailles, trophées, raretés — Mee et Meo y parlent.
                    GameRulesAtlasView()
                    steps
                }
            }
            .task { await focus(on: proxy) }
        }
    }

    /// Fait défiler la règle visée en haut, la teinte un instant, puis la relâche. Un tick d'attente :
    /// la mise en page doit exister avant qu'on y défile.
    private func focus(on proxy: ScrollViewProxy) async {
        if let focusedSection {
            try? await Task.sleep(nanoseconds: 250_000_000)
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) {
                proxy.scrollTo(Self.sectionID(focusedSection), anchor: Self.focusAnchor)
            }
            return
        }
        guard let focusedRule else { return }
        try? await Task.sleep(nanoseconds: 250_000_000)
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.35)) {
            proxy.scrollTo(Self.rowID(focusedRule), anchor: Self.focusAnchor)
            highlighted = focusedRule
        }
        try? await Task.sleep(nanoseconds: 1_600_000_000)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.4)) { highlighted = nil }
    }

    static func rowID(_ index: Int) -> String { "game-rule-\(index)" }

    /// L'identifiant d'une section du carnet — celui où l'on défile, et celui que les témoins lisent.
    static func sectionID(_ section: GameRulesSection) -> String { "game.rules.section." + section.rawValue }

    /// Où la règle visée se pose : SOUS la barre compacte de l'en-tête, qui recouvre le haut du défilement.
    static let focusAnchor = UnitPoint(x: 0.5, y: 0.18)

    private var intro: some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            MeeStickerFilmView(filmID: "mee-bonjour", animated: true, side: 84, animates: !reduceMotion, pixelCap: 240)
                .frame(width: 84, height: 84)
                .accessibilityHidden(true)
            Text(String(
                localized: "game.rules.intro",
                defaultValue: "Huit règles, et tout le jeu tient dedans. Meo les explique, Mee te montre le geste.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundColor(theme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
            MeeStickerFilmView(filmID: "meo-salut", animated: true, side: 84, animates: !reduceMotion, pixelCap: 240)
                .scaleEffect(x: -1, y: 1)
                .frame(width: 84, height: 84)
                .accessibilityHidden(true)
        }
    }

    private var rules: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.rules.section_rules", defaultValue: "Les règles en une page", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(GameGuideCopy.rules) { rule in
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    Text(GameCopy.formatCount(rule.index))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(MeeshyColors.brandPrimary.opacity(0.16)))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rule.title)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                        Text(rule.body)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                            .foregroundColor(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(MeeshySpacing.xs)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                        .fill(MeeshyColors.brandPrimary.opacity(highlighted == rule.index ? 0.14 : 0))
                )
                .id(Self.rowID(rule.index))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.rules.section_steps", defaultValue: "Les sept étapes", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(GameGuide.onboardingSteps, id: \.key) { step in
                let card = GameGuideCard.ofStep(step)
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    stepFigures(card)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(
                            localized: "game.guide.step_of",
                            defaultValue: "Étape \(GameCopy.formatCount(step.index)) sur \(GameCopy.formatCount(GameGuide.onboardingSteps.count))",
                            bundle: .main
                        ))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundColor(theme.textMuted)
                        Text(card.copy.what).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold)).foregroundColor(theme.textPrimary)
                        Text(card.copy.means).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular)).foregroundColor(theme.textPrimary)
                        Text(card.copy.next).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold)).foregroundColor(theme.textPrimary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func stepFigures(_ card: GuideCard) -> some View {
        let films = GameGuideCard.figures(speaker: card.speaker, mood: card.mood)
        let side: CGFloat = card.speaker == .duo ? 40 : 52
        return HStack(spacing: -6) {
            if let mee = films.meeFilmID {
                MeeStickerFilmView(filmID: mee, animated: false, side: side, animates: false, pixelCap: 160).frame(width: side, height: side)
            }
            if let meo = films.meoFilmID {
                MeeStickerFilmView(filmID: meo, animated: false, side: side, animates: false, pixelCap: 160)
                    .scaleEffect(x: -1, y: 1).frame(width: side, height: side)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - La section badges du carnet (#9640)

/// Les sections du carnet des règles qu'une entrée peut viser (miroir de `BADGES_SECTION_ID`, web).
enum GameRulesSection: String, Hashable, CaseIterable {
    case badges
}

/// Ce que la section badges du carnet dit — tiré de la loi partagée, jamais recopié : les sept matières dans l'ordre
/// (`GameBadgeTiers`) et les vingt badges rangés par famille (`BadgeGuideResolver.byFamily`).
enum GameRulesBadges {
    static var materials: [BadgeMaterial] { GameBadgeTiers.materials }

    static var families: [BadgeGuideFamilyGroup] {
        BadgeGuideResolver.byFamily(EngagementAxisKey.allCases.map { BadgeGuideResolver.resolve(axis: $0, count: 0, served: []) })
    }
}

/// LA SECTION BADGES DU CARNET (#9640, miroir de `RulesBadges`, `apps/web/src/routes/progression-rules-badges.tsx`) —
/// l'endroit unique que tous les liens « Comprendre les badges » atteignent. Ce qu'est un badge (UN geste compté),
/// pourquoi cuivre, pourquoi bronze (les sept matières et leurs seuils), le ruban dès l'Or, l'empreinte d'un badge
/// éteint, et les vingt badges par famille, chacun avec SON glyphe et ce qui compte pour lui. Une page qui explique :
/// les dessins sont décoratifs, le nom et la phrase les disent.
struct GameRulesBadgesSection: View {
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(GameBadgeGuideText.rulesTitle)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            paragraph(GameBadgeGuideText.rulesIntro, muted: false)
            paragraph(GameBadgeGuideText.rulesLadder, muted: false)
            materials
            paragraph(GameBadgeGuideText.rulesRibbon, muted: true)
            paragraph(GameBadgeGuideText.rulesImprint, muted: true)
            Text(GameBadgeGuideText.rulesFamilies)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
                .padding(.top, MeeshySpacing.xs)
            ForEach(GameRulesBadges.families) { group in
                family(group)
            }
            paragraph(GameBadgeGuideText.rulesSheet, muted: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(GameRulesPage.sectionID(.badges))
    }

    private func paragraph(_ text: String, muted: Bool) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
            .foregroundColor(muted ? theme.textMuted : theme.textPrimary)
            .fixedSize(horizontal: false, vertical: true)
    }

    /// Les sept matières, du cuivre au prisme : le nom, autant d'étoiles que le rang, le seuil.
    private var materials: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            ForEach(Array(GameRulesBadges.materials.enumerated()), id: \.element.threshold) { index, entry in
                let material = GameMaterial(badge: entry.key)
                let name = GameCopy.materialName(material)
                let threshold = GameCopy.formatCount(entry.threshold)
                HStack(spacing: MeeshySpacing.md) {
                    GameBadgeSwatch(material: material, lit: true, size: 20)
                    Text(name)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Spacer(minLength: MeeshySpacing.xs)
                    Text(String(repeating: "★", count: index + 1))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .accessibilityHidden(true)
                    Text(threshold)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .ignore)
                // « Bronze, À 10, Étoiles : 2 sur 7 » — la matière, son seuil, ses étoiles, en une phrase.
                .accessibilityLabel([
                    name, GameBadgeGuideText.rungUpcoming(threshold: threshold),
                    GameBadgeGuideText.starsA11y(lit: GameCopy.formatCount(index + 1), max: GameCopy.formatCount(GameRulesBadges.materials.count)),
                ].joined(separator: ", "))
            }
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
    }

    private func family(_ group: BadgeGuideFamilyGroup) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(ProgressionCopy.title(for: group.family))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ForEach(group.guides) { guide in
                    HStack(alignment: .center, spacing: MeeshySpacing.md) {
                        GameMedalView(family: GameMedalFamily(guide.family), glyph: GameMedalGlyph(axis: guide.axis), material: .copper,
                                      progress: 0, surface: theme.backgroundSecondary, muted: theme.textMuted)
                            .frame(width: 36, height: 40)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ProgressionCopy.title(for: guide.axis))
                                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                                .foregroundColor(theme.textPrimary)
                            Text(ProgressionCopy.whatCounts(for: guide.axis))
                                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                                .foregroundColor(theme.textMuted)
                        }
                        .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("game.rules.badges.axis.\(guide.axis.rawValue)")
                }
            }
            .padding(MeeshySpacing.md)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
        }
    }
}
