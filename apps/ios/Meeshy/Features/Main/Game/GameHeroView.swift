import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE HÉRO DE PROGRESSION (#5841) — pleine largeur, en deuxième position (conception, partie
/// XII.1). Il répond à deux questions, dans l'ordre : OÙ J'EN SUIS (l'anneau de niveau, le
/// niveau en grand, le blason et la division), COMMENT JE GAGNE (une puce par famille, DÉRIVÉE
/// du barème — `GameHero.earnItems`). Court (#9537) : un titre, un chiffre, une ligne — aucun
/// paragraphe ; « Comment je frappe » n'est PLUS ici, c'est le héro de frappe, le seul de l'écran
/// (`GameMintPreviewView`). Mee se pose en haut et dit la ligne courte du guide du moment ; un toucher
/// ouvre la version complète. Miroir de `apps/web/src/routes/progression-hero.tsx`.
///
/// Le fond est teinté par la couleur du palier (12 %) et porte la Signature en filigrane.
/// **Cache-first** : la vue ne lit que le bloc `game` que `ProgressionViewModel` sert depuis le
/// cache d'abord — jamais de squelette sur un cache non vide.
///
/// Ce qui jouait sur les tuiles « Niveau » et « Rang » joue ici, à l'identique : l'anneau se remplit
/// et le chiffre roule (0,6 s), il se vide calmement à la frappe (0,8 s), la tape légère ne
/// couronne qu'une montée CONFIRMÉE, l'écu monte quand la marche est GAGNÉE. **Rien ne se joue au
/// premier rendu** : un écran qu'on ouvre ne rejoue pas ce qui est déjà arrivé.
struct GameHeroView: View {
    let game: GameBlock
    /// Le film de Mee dans le coin, et la ligne courte qu'il dit ; `nil` ⇒ pas de coin.
    var cornerFigure: String?
    var cornerLine: String?
    var haptics: GameHapticsProviding = GameHaptics.shared
    /// Aucun geste du jeu n'est en vol : seule une montée lue ALORS est « gagnée ».
    var settled = true
    /// L'élan servi : les puces « Comment gagner » disent quelles familles sont actives ; `nil` devant un ancien serveur.
    var elan: EngagementElanProgress?
    let onOpenGuide: () -> Void

    @State private var shownLevel: Int
    @State private var shownProgress: Double
    @State private var confirmation: GameLevelConfirmation
    @State private var playRank = 0
    @State private var seenOrder: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(game: GameBlock, cornerFigure: String? = nil, cornerLine: String? = nil,
         haptics: GameHapticsProviding = GameHaptics.shared, settled: Bool = true,
         elan: EngagementElanProgress? = nil, onOpenGuide: @escaping () -> Void) {
        self.game = game
        self.cornerFigure = cornerFigure
        self.cornerLine = cornerLine
        self.haptics = haptics
        self.settled = settled
        self.elan = elan
        self.onOpenGuide = onOpenGuide
        _shownLevel = State(initialValue: game.level.level)
        _shownProgress = State(initialValue: game.level.progress)
        _confirmation = State(initialValue: GameLevelConfirmation(confirmed: game.level.level))
        _seenOrder = State(initialValue: GameGuideEvents.standingOrder(game))
    }

    private var theme: ThemeManager { ThemeManager.shared }
    private var level: GameBlock.Level { game.level }
    private var glory: GameBlock.Glory { game.glory }
    private var tint: Color { LevelTierPalette.color(for: level.tier) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            if let cornerLine { corner(cornerLine) }
            levelRow
            rankRow
            GameHeroEarn(elan: elan)
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(background)
        // Un conteneur QUI PORTE un identifiant doit se déclarer conteneur : sans cela, SwiftUI recopie
        // « game.hero » sur chaque descendant et efface les identifiants des puces, de la frappe et du « ? ».
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("game.hero")
        .adaptiveOnChange(of: level.level) { old, new in
            animateLevel(from: old, to: new)
            playTapIfConfirmedGain()
        }
        .adaptiveOnChange(of: settled) { _, _ in playTapIfConfirmedGain() }
        .adaptiveOnChange(of: level.progress) { _, new in
            if level.level == shownLevel { settle(progress: new) }
        }
        .adaptiveOnChange(of: GameGuideEvents.standingOrder(game)) { _, now in
            // Seule une marche GAGNÉE joue l'écu : la division retrouvée quand un geste
            // refusé restaure la Gloire d'avant n'est pas une promotion.
            let climbed = now > seenOrder
            seenOrder = now
            guard climbed else { return }
            playRank += 1
            haptics.play(GameHapticPattern.rank)
        }
    }

    // MARK: - Le fond

    /// La teinte du palier à 12 %, un trait à 28 %, et la Signature en grand filigrane à droite.
    private var background: some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
        return ZStack(alignment: .topTrailing) {
            shape.fill(theme.backgroundSecondary)
            shape.fill(tint.opacity(0.12))
            SignatureMark(style: .flat, color: theme.textPrimary.opacity(0.07), strokeWidth: 92)
                .frame(width: 240, height: 240)
                .offset(x: 70, y: -60)
            shape.stroke(tint.opacity(0.28), lineWidth: 1)
        }
        .clipShape(shape)
        .accessibilityHidden(true)
    }

    // MARK: - Mee, dans le coin

    private func corner(_ line: String) -> some View {
        Button {
            HapticFeedback.light()
            onOpenGuide()
        } label: {
            HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                Spacer(minLength: 0)
                Text(line)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                if let cornerFigure {
                    GameCornerFigure(filmID: cornerFigure)
                }
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(line)
        .accessibilityHint(String(localized: "game.guide.more", defaultValue: "Voir l’explication complète", bundle: .main))
        .accessibilityIdentifier("game.hero.guide")
    }

    // MARK: - Où j'en suis

    private var levelRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.lg) {
            LevelRingView(
                level: shownLevel, progress: shownProgress, tier: level.tier, prestige: level.prestige,
                // Redescendu : le repère du record reste au bout de la barre.
                recordMarker: level.record > level.level ? 1 : nil,
                trackColor: theme.textMuted.opacity(0.22),
                inkColor: theme.textPrimary,
                mutedColor: theme.textMuted,
                discColor: theme.backgroundPrimary,
                accessibilityLabel: GameCopy.levelRingAccessibility(level: shownLevel, tier: level.tier)
            )
            .frame(width: 88, height: 88)
            // L'anneau SE TOUCHE (#9564) : il rebondit et ouvre les précisions du niveau.
            .gameElement(GameElementDetails.levelRing(level), identifier: "game.hero.level")
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(GameCopy.tierName(level.tier))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
                Text(String(localized: "game.hero.level", defaultValue: "Niveau \(GameCopy.formatCount(shownLevel))", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .modifier(HeroNumericRoll())
                Text(toNextText)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
                bar
                if level.record > level.level {
                    // DEUX pastilles, jamais une longue (#9564) : « Record : niveau 100 · Vent arrière ×1,25 » tenait
                    // sur deux lignes, puis — une fois interdite de passer à la ligne — poussait le héro hors de l'écran.
                    FlowLayout(spacing: MeeshySpacing.xs) {
                        GameChip(text: recordText, tint: MeeshyColors.warning)
                        if let tailwindText { GameChip(text: tailwindText, tint: MeeshyColors.warning) }
                    }
                }
            }
        }
        .id(GameAnchor.level)
        .accessibilityElement(children: .contain)
    }

    /// La barre du niveau, et — quand on a redescendu — le repère FANTÔME du record à son bout.
    private var bar: some View {
        ProgressionBar(
            progress: shownProgress, tint: tint,
            label: String(localized: "progression.a11y.bar.level", defaultValue: "Progression vers le niveau suivant", bundle: .main)
        )
        .overlay(alignment: .trailing) {
            if level.record > level.level {
                Capsule()
                    .stroke(theme.textPrimary.opacity(0.55), style: StrokeStyle(lineWidth: 1.5, dash: [2, 2]))
                    .frame(width: 8, height: 12)
                    .accessibilityHidden(true)
            }
        }
    }

    private var toNextText: String {
        level.nextThreshold == nil
            ? String(localized: "game.level.top", defaultValue: "Tu es au sommet.", bundle: .main)
            : String(
                localized: "game.level.to_next",
                defaultValue: "Encore \(GameCopy.points(level.pointsToNext)) avant le niveau \(GameCopy.formatCount(level.level + 1))",
                bundle: .main
            )
    }

    private var recordText: String {
        String(
            localized: "game.level.record",
            defaultValue: "Record : niveau \(GameCopy.formatCount(level.record))",
            bundle: .main
        )
    }

    /// Le Vent arrière, quand il souffle : il a sa propre pastille.
    private var tailwindText: String? {
        guard game.boosts.tailwind > 1 else { return nil }
        return ConceptText.chipTailwind(GameCopy.factor(game.boosts.tailwind))
    }

    // MARK: - Le blason et la division

    private var rankRow: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            RankBlasonStage(
                rank: glory.rank, division: glory.division, title: GameCopy.rankName(glory.rank),
                play: playRank, accessibilityLabel: nil
            )
            .frame(width: 64, height: 59)
            VStack(alignment: .leading, spacing: 2) {
                Text(GameCopy.rankLabel(glory.rank, division: glory.division))
                    .font(MeeshyFont.relative(MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                Text(String(localized: "game.rank.glory", defaultValue: "Gloire \(GameCopy.formatCount(glory.glory))", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .id(GameAnchor.rank)
        .accessibilityElement(children: .combine)
        // Le blason SE TOUCHE : il rebondit et ouvre les précisions du rang.
        .gameElement(GameElementDetails.rank(glory), identifier: "game.hero.rank")
    }

    // MARK: - Les animations

    private func playTapIfConfirmedGain() {
        if confirmation.observe(level: level.level, settled: settled) {
            haptics.play(GameHapticPattern.levelGain)
        }
    }

    private func settle(progress: Double) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: GameTimeline.levelGainDuration)) { shownProgress = progress }
    }

    /// Gagné : l'anneau se remplit, le chiffre roule (0,6 s). Perdu à la frappe : il se vide
    /// calmement (0,8 s), le repère du record reste. La tape légère n'est PAS jouée ici : un
    /// niveau qui remonte parce qu'une frappe refusée l'a rendu n'est pas gagné.
    private func animateLevel(from old: Int, to new: Int) {
        let gained = new > old
        let duration = gained ? GameTimeline.levelGainDuration : GameTimeline.levelLossDuration
        withAnimation(reduceMotion ? nil : .easeInOut(duration: duration)) {
            shownLevel = new
            shownProgress = level.progress
        }
    }
}

/// Mee dans le coin : le film du pack de stickers, jamais recopié, en image fixe sous « réduire
/// les animations ».
private struct GameCornerFigure: View {
    let filmID: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        MeeStickerFilmView(filmID: filmID, animated: true, side: 48, animates: !reduceMotion, pixelCap: 240)
            .frame(width: 48, height: 48)
            .accessibilityHidden(true)
    }
}

/// Le chiffre « roule » quand le niveau change (iOS 17+) ; sur iOS 16 il change net.
private struct HeroNumericRoll: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.contentTransition(.numericText())
        } else {
            content
        }
    }
}
