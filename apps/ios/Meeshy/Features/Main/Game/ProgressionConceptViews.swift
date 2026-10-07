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
            if let tier = game?.level.tier {
                TierEmblemView(tier: tier, knockout: theme.backgroundPrimary)
            } else {
                signature(.flat, MeeshyColors.brandPrimary)
            }
        case .points:
            signature(.struck, MeeshyColors.warning)
        case .meesh:
            MeeshCoinView(face: .obverse, edition: game?.mint.edition ?? .silver, figures: nil)
        case .glory:
            if let glory = game?.glory {
                RankBlasonView(rank: glory.rank, division: glory.division)
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
            signature(.flat, MeeshyColors.success)
        case .badges:
            GameBadgeView(material: .gold, surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .defis:
            GameMedalView(family: .content, glyph: .text, material: .silver, surface: theme.backgroundPrimary, muted: theme.textMuted)
        case .succes:
            GameMedalView(family: .social, glyph: .social, material: .gold, surface: theme.backgroundPrimary, muted: theme.textMuted)
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

// MARK: - Les pastilles

/// Des pastilles qui ne se coupent JAMAIS : chacune tient sur une ligne (`GameChip`), et la rangée passe à la ligne
/// ENTRE les pastilles (`FlowLayout`), y compris en Dynamic Type agrandi.
struct ProgressionConceptChips: View {
    let items: [String]
    var tint: Color = MeeshyColors.brandPrimary

    var body: some View {
        FlowLayout(spacing: MeeshySpacing.xs) {
            ForEach(items, id: \.self) { item in
                GameChip(text: item, tint: tint)
            }
        }
    }
}

// MARK: - La tête d'un concept

/// La tête : l'emblème, le nom, la valeur sur UNE ligne, et le chevron quand la tête ouvre quelque chose. Aux très
/// grandes tailles de texte, la valeur passe sous le nom plutôt que de se tronquer.
struct ProgressionConceptHead: View {
    let concept: ProgressionConcept
    let name: String
    let value: String
    let game: GameBlock?
    var showsChevron = true

    @Environment(\.dynamicTypeSize) private var typeSize
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            ProgressionConceptEmblem(concept: concept, game: game)
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    nameText
                    valueText
                }
                Spacer(minLength: 0)
            } else {
                nameText
                Spacer(minLength: MeeshySpacing.sm)
                valueText
            }
            if showsChevron {
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .accessibilityHidden(true)
            }
        }
    }

    private var nameText: some View {
        Text(name)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(theme.textPrimary)
            .lineLimit(1)
            .layoutPriority(1)
    }

    private var valueText: some View {
        Text(value)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold, design: .rounded))
            .foregroundColor(theme.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
    }
}

// MARK: - La carte de la première page

/// UNE CARTE PAR CONCEPT, à trois étages : la tête (emblème, nom, valeur, chevron), les données importantes en
/// pastilles (et la jauge fine vers l'étape suivante), puis le pourquoi et le comment. La carte ENTIÈRE ouvre la
/// fiche ; elle ne porte aucun geste du jeu. Un seul élément pour VoiceOver : concept, valeur, pourquoi, bouton.
struct ProgressionConceptCardView: View {
    let card: ProgressionConceptCard
    let game: GameBlock?
    let onOpen: () -> Void

    @Environment(\.dynamicTypeSize) private var typeSize
    private var theme: ThemeManager { ThemeManager.shared }

    /// Deux lignes au plus par phrase ; aux tailles d'accessibilité, la phrase se lit en entier plutôt que coupée.
    private var sentenceLines: Int? { typeSize.isAccessibilitySize ? nil : 2 }

    var body: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                ProgressionConceptHead(concept: card.concept, name: card.name, value: card.value, game: game)
                ProgressionConceptChips(items: card.chips, tint: card.concept.tint)
                if let gauge = card.gauge {
                    ProgressionBar(progress: gauge, tint: card.concept.tint, label: card.name)
                }
                Text(card.why)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(sentenceLines)
                    .fixedSize(horizontal: false, vertical: true)
                Text(card.how)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .lineLimit(sentenceLines)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundSecondary))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
        .accessibilityHint(ConceptText.cardHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("progression.concept.\(card.concept.rawValue)")
    }
}

// MARK: - Une ligne simple

/// Une entrée qui n'est pas un concept — tableau de bord, carnet, règles, réglages, sous-page d'une fiche : un
/// pictogramme, un titre, un chevron. La ligne entière se touche (44 pt au moins).
struct ProgressionConceptRow: View {
    let title: String
    var subtitle: String?
    let symbol: String
    let identifier: String
    let action: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
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
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier(identifier)
    }
}

// MARK: - Où j'en suis

/// Les données d'un concept, en lignes libellé → valeur. Chaque ligne est UN élément pour VoiceOver.
struct ProgressionConceptFacts: View {
    let facts: [ProgressionConceptFact]

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(facts.enumerated()), id: \.offset) { index, fact in
                if index > 0 { Divider().overlay(theme.textMuted.opacity(0.2)) }
                HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.md) {
                    Text(fact.label)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(fact.value)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.trailing)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.vertical, MeeshySpacing.xs)
                .accessibilityElement(children: .combine)
            }
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
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
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
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.copy.short)
        .accessibilityHint(ConceptText.guideHint)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("game.guide.line")
    }
}
