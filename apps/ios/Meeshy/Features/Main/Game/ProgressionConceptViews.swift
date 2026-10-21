import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les pièces des concepts de Progression (#9564)
//
// L'emblème d'un concept, sa carte sur la première page, ses pastilles, ses lignes « libellé → valeur », et la
// ligne simple des entrées qui ne sont pas un concept (tableau de bord, carnet, règles, réglages). Des vues
// FEUILLES : aucune n'observe de singleton, le thème se lit par une propriété calculée.

// MARK: - L'emblème

/// L'emblème d'un concept, dessiné par les briques du jeu (anneau de palier, pièce, blason, Flamme, gemme, coupe,
/// tampon…) et, à défaut, par la Signature Meeshy — jamais une bulle. DÉCORATIF : le nom voisin dit tout.
struct ProgressionConceptEmblem: View {
    let concept: ProgressionConcept
    let game: GameBlock?
    var size: CGFloat = 40

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        drawing
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var drawing: some View {
        switch concept {
        case .level:
            // L'anneau PORTE le niveau (#11180) : la carte nomme l'état de la lumière, l'anneau dit son niveau.
            if let level = game?.level.shown {
                LevelRingView(
                    level: level.level, progress: level.progress, tier: level.tier,
                    trackColor: theme.textMuted.opacity(MeeshyOpacity.light), inkColor: theme.textPrimary,
                    discColor: theme.backgroundPrimary, accessibilityLabel: nil
                )
            } else {
                signature(.flat, MeeshyColors.brandPrimary)
            }
        case .points:
            ConceptMarkView(kind: .points)
        case .meesh:
            MeeshCoinView(face: .obverse, edition: game?.mint.edition ?? .silver, figures: nil)
        case .glory:
            if let glory = game?.glory {
                RankBlasonView(rank: glory.rank, division5: glory.shownDivision, level: game?.level.shown.level, mythic: glory.mythicSeat)
            } else {
                signature(.engraved, MeeshyColors.brandPrimary)
            }
        case .flame:
            FlameView(form: game?.flame.form ?? .braise, flickers: false)
        case .missions:
            ChestView(isOpen: game?.chest.status == .claimed)
        case .league:
            LeagueGemView(league: game?.league?.current?.league ?? .quartz)
        case .season:
            TrophyView(material: .platinum, label: "")
        case .prestige:
            TrophyView(material: .prism, label: "")
        case .elans:
            ConceptMarkView(kind: .elans)
        case .badges:
            GameBadgeView(material: .gold, surface: theme.backgroundPrimary, muted: theme.textMuted)
        // La FORME dit le type (#9640, comme le web) : un défi est un losange de record, un succès un médaillon à réunir.
        case .defis:
            GameBadgeView(shape: .record, material: .silver, surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .succes:
            GameBadgeView(shape: .collection(filled: 4, total: 6), material: .gold, surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .showcase:
            TrophyView(material: .gold, label: "")
        case .atlas:
            AtlasStampView(
                code: game?.atlas?.stamps.first?.language.uppercased() ?? "", tint: MeeshyColors.brandPrimary,
                state: (game?.atlas?.stamps.isEmpty ?? true) ? .undiscovered : .stamped, muted: theme.textMuted
            )
        }
    }

    private func signature(_ style: SignatureStyle, _ color: Color) -> some View {
        SignatureMark(style: style, color: color)
    }
}

extension ProgressionConcept {
    /// La teinte du concept : celle de sa carte, de sa jauge et de ses pastilles.
    var tint: Color {
        switch self {
        case .level, .glory, .league, .season, .badges, .atlas: MeeshyColors.brandPrimary
        case .points, .meesh, .flame, .missions, .prestige, .showcase: MeeshyColors.warning
        case .elans, .defis, .succes: MeeshyColors.success
        }
    }
}

/// Une valeur qui CHANGE roule chiffre par chiffre (un geste fait dans une fiche se relit ici au retour) ; rien ne
/// joue au premier rendu, et rien sous « réduire les animations ».
struct GameValueRoll: ViewModifier {
    let value: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .contentTransition(reduceMotion ? .identity : .numericText())
            .animation(reduceMotion ? nil : .easeOut(duration: 0.35), value: value)
    }
}

// MARK: - La carte de la première page

/// LA CARTE D'UN CONCEPT sur la première page (#11180, épopée § 5) — trois étages, et la carte entière ouvre la fiche :
/// le NOM en petit, la VALEUR en grand, UNE ligne en petit. Ni pastilles, ni jauge, ni paragraphe : la fiche dit le
/// reste. Ce qui demande un geste (Offrande prête, Flamme en danger, frappe possible…) PREND la ligne, marquée d'un
/// point d'attention. L'emblème qui montre un fait (l'anneau porte le niveau) le dit au lecteur d'écran.
///
/// Rien ne glisse de côté : le nom passe à la ligne, la valeur se réduit dans la carte, la ligne passe à la ligne.
/// Chaque chiffre déclare son identité (`GameFactsTag`). Un seul élément pour VoiceOver.
struct ProgressionConceptCardView: View {
    let card: ProgressionConceptCard
    let game: GameBlock?
    /// Conservé pour l'hôte : la carte n'a plus de jauge, l'entrée en scène est portée par `GameStaggeredEntrance`.
    var entered = true
    let onOpen: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        // La carte ENTIÈRE rebondit et ouvre la fiche.
        GameBounceButton(action: onOpen) {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                ProgressionConceptEmblem(concept: card.concept, game: game)
                    .modifier(GameFactsTag(card.emblem?.fact))
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(card.name)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(card.value)
                        .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .modifier(GameValueRoll(value: card.value))
                        .modifier(GameFactsTag(card.valueFact))
                    if let line = card.line {
                        lineView(line)
                    }
                }
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
        .accessibilityHint(ConceptText.cardHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("progression.concept.\(card.concept.rawValue)")
    }

    private func lineView(_ line: ProgressionFactText) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
            if card.urgent {
                Circle()
                    .fill(MeeshyColors.warning)
                    .frame(width: 8, height: 8)
                    .accessibilityHidden(true)
            }
            Text(line.text)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                .foregroundColor(card.urgent ? theme.textPrimary : theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .modifier(GameFactsTag(line.facts))
    }
}

/// L'ENTRÉE EN SCÈNE d'une carte de la première page : elle monte de quelques points et s'éclaircit, l'une après
/// l'autre. Sobre, et UNE fois — l'hôte garde `entered` tant que la page vit, donc rien ne rejoue au retour d'une
/// fiche. Sous « réduire les animations », la carte est simplement là.
struct GameStaggeredEntrance: ViewModifier {
    let index: Int
    let entered: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Le décalage entre deux cartes, plafonné : la quinzième n'attend pas une seconde.
    static func delay(for index: Int) -> Double { min(Double(index) * 0.04, 0.4) }

    func body(content: Content) -> some View {
        content
            .opacity(entered || reduceMotion ? 1 : 0.35)
            .offset(y: entered || reduceMotion ? 0 : 14)
            .animation(reduceMotion ? nil : GameMotion.release.delay(Self.delay(for: index)), value: entered)
    }
}

// MARK: - Une ligne simple

/// Une entrée qui n'est pas un concept — carnet, règles, réglages, sous-page d'une fiche : un
/// pictogramme, un titre, un chevron. La ligne entière se touche (44 pt au moins).
struct ProgressionConceptRow: View {
    let title: String
    var subtitle: String?
    /// Le pictogramme système de la ligne.
    let symbol: String
    let identifier: String
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        GameBounceButton(action: action) {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: symbol)
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .frame(width: 40)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let subtitle {
                        Text(subtitle)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - Où j'en suis

/// Les données d'un concept, en lignes libellé → valeur. Chaque ligne est UN élément pour VoiceOver. Avec un
/// `concept`, chaque ligne REBONDIT au toucher et ouvre les précisions de CETTE donnée ; sans, elle se lit seulement
/// (c'est la forme que la feuille de précisions emploie pour ses propres lignes).
struct ProgressionConceptFacts: View {
    let facts: [ProgressionConceptFact]
    var concept: ProgressionConcept?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                if index > 0 { Divider().overlay(theme.textMuted.opacity(0.2)) }
                if let concept {
                    row(fact)
                        .frame(minHeight: MeeshyControlSize.tapTarget)
                        .accessibilityElement(children: .combine)
                        .gameElement(GameElementDetails.fact(fact, of: concept))
                        .modifier(GameFactsTag(fact.identity))
                } else {
                    row(fact)
                        .padding(.vertical, MeeshySpacing.xs)
                        .accessibilityElement(children: .combine)
                        .modifier(GameFactsTag(fact.identity))
                }
            }
        }
    }

    private func row(_ fact: ProgressionConceptFact) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.md) {
            Text(fact.label)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: MeeshySpacing.sm)
            Text(fact.value)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(GameValueRoll(value: fact.value))
        }
    }
}

/// Le titre d'une section de fiche (« C'est quoi ? », « Où j'en suis »…).
struct ProgressionConceptSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            .textCase(.uppercase)
            .foregroundColor(ThemeManager.shared.textMuted)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: - La ligne de Mee

/// LA LIGNE COURTE DE MEE sur la première page : le guide du moment, en une phrase. Le toucher ouvre le message
/// entier (et ses boutons) ; la ligne elle-même ne porte aucun geste du jeu.
struct ProgressionGuideLine: View {
    let card: GuideCard
    let onOpen: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    private var filmID: String {
        GameGuideCard.figures(speaker: card.speaker, mood: card.mood).meeFilmID ?? "mee-sourire"
    }

    var body: some View {
        GameBounceButton(action: onOpen) {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                MeeStickerFilmView(filmID: filmID, animated: false, side: 40, animates: false, pixelCap: 160)
                    .frame(width: 40, height: 40)
                    .accessibilityHidden(true)
                Text(card.copy.short)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(MeeshyColors.brandPrimary.opacity(0.12)))
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.copy.short)
        .accessibilityHint(ConceptText.guideHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("game.guide.line")
    }
}
