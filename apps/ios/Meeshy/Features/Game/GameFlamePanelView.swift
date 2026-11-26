import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA FLAMME : GELS ET RALLUMAGE (#9383) — ce qu'on fait de ses Meeshes pour la
/// protéger. Un gel couvre un jour manqué (deux en réserve au plus, 1 Meesh
/// chacun) ; une Flamme éteinte se rallume sous 48 h, une fois par mois, pour 3
/// Meeshes. Les prix et les bornes viennent du bloc `game` : cette vue n'en
/// connaît aucun. Miroir de `apps/web/src/components/game-flame-panel.tsx`.
///
/// Un bouton qui ne peut pas servir se TAIT en disant pourquoi (réserve pleine,
/// pas assez de Meeshes, hors ligne) ; il ne reste pas grisé sans explication.
/// Avant chaque achat, la rangée de dépense (#9705) dit les Meeshes en poche, le
/// prix et ce qui restera — ou combien il en manque. Une
/// Flamme trop longtemps éteinte ne propose rien : elle annonce qu'une nouvelle
/// commence au prochain geste.
///
/// Deux rêves complets la rallument aussi, sans payer (#20455) : tant que le bloc sert `effortRelight`, le panneau
/// dit combien en manquent et jusqu'à quand (#20473) — même quand une nouvelle Flamme a repris, puisque c'est en
/// jouant qu'on les réalise — et ne dit plus qu'elle ne peut plus être rallumée.
///
/// Une Flamme vivante se met en VEILLE (#17372, #20510) : deux gestes, la durée (1 à 7 jours, sept choisis d'avance)
/// puis l'annonce. Tant que le bloc sert une veille, le panneau dit jusqu'à quand elle attend, et l'annonce se tait.
///
/// Au premier jour d'une Flamme, elle propose un OBJECTIF (#17379, #20522) : 7, 14 ou 30 jours, en un geste, et ne rien
/// choisir ne coûte rien. En cours, elle dit ce qu'il reste ; atteint, le signe des aïeux et la marche suivante, jusqu'à
/// « Plus tard ». Raté, rien ne se dit : la passerelle cesse de le servir.
struct GameFlamePanelView: View {
    let game: GameBlock
    let online: Bool
    let buyingFreeze: Bool
    let relighting: Bool
    var pausing = false
    let errors: GameErrors
    let onBuyFreeze: () -> Void
    let onRelight: () -> Void
    var onPause: (Int) -> Void = { _ in }
    var choosingGoal = false
    var onChooseGoal: (Int) -> Void = { _ in }
    var onCloseGoalSign: (Int) -> Void = { _ in }
    @State private var openNoteID: String?
    @State private var pauseDays = GameFlamePauseLaw.maxDays

    private var flame: GameBlock.Flame { game.flame }
    private var held: Int { game.treasury.held }
    private var isOut: Bool { flame.status == .out }
    var freezeSpend: SpendPreview { GameSpend.preview(held: held, cost: flame.freezePrice) }
    var relightSpend: SpendPreview { GameSpend.preview(held: held, cost: flame.relightPrice) }
    private var cannotPayRelight: Bool { !relightSpend.affordable }

    /// La phrase du rallumage par l'effort, `nil` quand le bloc ne le sert pas (#20473).
    static func effortRelightLine(_ flame: GameBlock.Flame) -> String? {
        flame.effortRelight.map { GameCopy.effortRelight($0) }
    }

    /// « Ne peut plus être rallumée » se tait tant que l'effort la rallume encore (#20473).
    static func saysRelightClosed(_ flame: GameBlock.Flame, cannotPayRelight: Bool) -> Bool {
        flame.status == .out && !flame.canRelight && !cannotPayRelight && flame.effortRelight == nil
    }

    /// Ce que la carte montre de la veille : sa phrase quand le bloc en sert une, dès quand la prochaine sera possible
    /// quand le trimestre est pris (#20534), le choix de la durée sur une Flamme vivante, rien sur une Flamme absente
    /// ou éteinte. Miroir de `GameFlamePanel` (`apps/web/src/components/game-flame-panel.tsx`).
    enum PauseSection: Equatable {
        case paused(String)
        case next(String)
        case chooser
        case hidden
    }

    static func pauseState(_ flame: GameBlock.Flame, today: String) -> PauseSection {
        if let pause = flame.pause { return .paused(FlamePauseCopy.line(pause, today: today)) }
        guard GameFlamePauseLaw.isBurning(flame.status) else { return .hidden }
        if let nextPauseFrom = flame.nextPauseFrom { return .next(FlamePauseCopy.nextLine(nextPauseFrom)) }
        return .chooser
    }

    /// Ce que la carte montre de l'objectif : les choix du premier jour, ce qu'il reste, ou le signe des aïeux avec la
    /// marche suivante — jusqu'à ce que le joueur le ferme ou que la carte de Mee et Meo le dise (sa clé
    /// `flame-goal-next-<jours>` dans `game.guideSeen`). Ensuite le salut ne se redit pas, mais la marche suivante reste
    /// choisissable. Miroir de `flameGoalView` (`apps/web/src/lib/view/flame-goal-copy.ts`).
    enum GoalSection: Equatable {
        case choose([Int])
        case running(target: Int, remaining: Int)
        case reached(target: Int, next: Int?)
        case next(target: Int, next: Int)
    }

    static func goalState(_ flame: GameBlock.Flame, guideSeen: [String]) -> GoalSection? {
        guard let goal = flame.goal else { return nil }
        guard let current = goal.current else { return goal.offer.isEmpty ? nil : .choose(goal.offer) }
        guard current.reached else { return .running(target: current.target, remaining: current.remaining) }
        let seen = guideSeen.contains(GameFlameGoalLaw.nextSeenKey(reachedTarget: current.target))
        guard seen else { return .reached(target: current.target, next: current.next) }
        return current.next.map { GoalSection.next(target: current.target, next: $0) }
    }

    /// `missing` : ce qu'il manque, dit avec le geste qu'il vise — acheter un gel, rallumer la Flamme (#10540).
    private func spendRow(_ spend: SpendPreview, identifier: String, missing: @MainActor (String) -> String) -> some View {
        GameFactChipRow(concept: .flame, items: GameSpendRows.spend(spend, format: GameCopy.meeshes, missing: missing), identifier: identifier)
    }

    /// La valeur est au repos, nommée par ce qu'elle augmente (« +10 % d'étincelles »), la règle qui la produit derrière un (i) : « Que rapporte ma Flamme ? ».
    private var bonusNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "game.flame_panel.bonus.question", defaultValue: "Que rapporte ma Flamme ?", bundle: .main),
            text: String(
                localized: "game.flame_panel.bonus",
                defaultValue: "Chaque jour de Flamme nourrit tes rêves : +\(GameCopy.formatCount(GameFlame.bonusPercentPerDay)) % d’étincelles par acte, jusqu’à +\(GameCopy.formatCount(GameFlame.bonusPercentMax)) %.",
                bundle: .main
            )
        )
    }

    var body: some View {
        GameCard(anchor: .flamePanel, title: String(localized: "game.flame_panel.title", defaultValue: "Veiller sur ta Flamme", bundle: .main)) {
            MeeshyInfoNoted(note: bonusNote, openNoteID: $openNoteID, tint: ThemeManager.shared.textMuted) {
                Text(String(
                    localized: "game.flame_panel.bonus_chip",
                    defaultValue: "+\(GameCopy.formatCount(min(100, max(0, flame.bonusPercent)))) % d’étincelles",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textPrimary)
                .accessibilityIdentifier("game.flame.bonus")
            }
            goalSection
            GameErrorLine(message: errors.goal, identifier: "game.flame.goal.error")
            Text(String(
                localized: "game.flame_panel.freezes",
                defaultValue: "Veilleuses : \(GameCopy.formatCount(flame.freezes)) / \(GameCopy.formatCount(flame.maxFreezes))",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
            .foregroundColor(ThemeManager.shared.textPrimary)
            freezeSection
            GameErrorLine(message: errors.freeze, identifier: "game.flame.freeze.error")
            pauseSection
            if let effortLine = Self.effortRelightLine(flame) {
                Text(effortLine)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(ThemeManager.shared.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("game.flame.effortRelight")
            }
            relightSection
            if !online {
                GameNote(text: String(
                    localized: "game.flame_panel.offline",
                    defaultValue: "Hors ligne : les Veilleuses et le rallumage reprendront avec la connexion.",
                    bundle: .main
                ))
            }
        }
    }

    @ViewBuilder
    private var freezeSection: some View {
        if flame.freezes >= flame.maxFreezes {
            GameNote(text: String(
                localized: "game.flame_panel.freeze_full",
                defaultValue: "Tes Veilleuses sont au complet.",
                bundle: .main
            ))
        } else {
            spendRow(freezeSpend, identifier: "game.flame.freeze.spend", missing: { ConceptText.spendMissingFreeze(missing: $0) })
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.freeze_buy",
                    defaultValue: "Prendre une Veilleuse · \(GameCopy.meeshes(flame.freezePrice))",
                    bundle: .main
                ),
                busy: buyingFreeze, disabled: !online || !freezeSpend.affordable, identifier: "game.flame.freeze.buy",
                action: onBuyFreeze
            )
        }
    }

    @ViewBuilder
    private var pauseSection: some View {
        switch Self.pauseState(flame, today: game.missions.dayKey) {
        case .paused(let line):
            Text(line)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("game.flame.paused")
        case .next(let line):
            GameNote(text: line)
                .accessibilityIdentifier("game.flame.pause.next")
        case .chooser:
            GameNote(text: FlamePauseCopy.intro)
            pauseDayChooser
            GameActionButton(
                title: FlamePauseCopy.action(days: pauseDays), busy: pausing, disabled: !online,
                identifier: "game.flame.pause", action: { onPause(pauseDays) }
            )
            GameErrorLine(message: errors.pause, identifier: "game.flame.pause.error")
        case .hidden:
            EmptyView()
        }
    }

    @ViewBuilder
    private var goalSection: some View {
        switch Self.goalState(flame, guideSeen: game.guideSeen) {
        case .choose(let offer):
            GameNote(text: FlameGoalCopy.intro)
            FlowLayout(spacing: MeeshySpacing.xs) {
                ForEach(offer, id: \.self) { target in
                    goalChoice(target: target, title: GameCopy.days(target))
                }
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(FlameGoalCopy.choicesGroup)
        case .running(let target, let remaining):
            Text(FlameGoalCopy.running(target: target, remaining: remaining))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundStyle(ThemeManager.shared.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("game.flame.goal.running")
        case .reached(let target, let next):
            goalSign(target: target, next: next)
        case .next(let target, let next):
            FlowLayout(spacing: MeeshySpacing.xs) {
                Text(FlameGoalCopy.nextIntro(target: target))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(ThemeManager.shared.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
                goalChoice(target: next, title: FlameGoalCopy.nextAction(days: next))
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("game.flame.goal.next")
        case nil:
            EmptyView()
        }
    }

    /// Le signe des aïeux : la phrase se lit comme un statut, la marche suivante et « Plus tard » suivent.
    private func goalSign(target: Int, next: Int?) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(FlameGoalCopy.reached(target: target))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("game.flame.goal.sign")
            FlowLayout(spacing: MeeshySpacing.xs) {
                if let next { goalChoice(target: next, title: FlameGoalCopy.nextAction(days: next)) }
                Button { onCloseGoalSign(target) } label: {
                    Text(FlameGoalCopy.later)
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(ThemeManager.shared.textPrimary)
                        .padding(.horizontal, MeeshySpacing.md)
                        .frame(minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("game.flame.goal.later")
            }
        }
        .accessibilityElement(children: .contain)
    }

    /// Un objectif se choisit d'un seul toucher : la puce ENVOIE, il n'y a pas de bouton de confirmation.
    private func goalChoice(target: Int, title: String) -> some View {
        Button { onChooseGoal(target) } label: {
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo950)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minWidth: 44, minHeight: 44)
                .background(Capsule().fill(MeeshyColors.warning))
                .opacity(online && !choosingGoal ? 1 : 0.6)
        }
        .buttonStyle(.plain)
        .disabled(!online || choosingGoal)
        .accessibilityIdentifier("game.flame.goal.\(target)")
    }

    /// Une rangée de durées est un `FlowLayout` : sept cibles de 44 pt ne tiennent pas sur un petit écran.
    private var pauseDayChooser: some View {
        FlowLayout(spacing: MeeshySpacing.xs) {
            ForEach(GameFlamePauseLaw.dayChoices, id: \.self) { count in
                let chosen = count == pauseDays
                Button { pauseDays = count } label: {
                    Text(GameCopy.formatCount(count))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundStyle(chosen ? MeeshyColors.indigo950 : ThemeManager.shared.textPrimary)
                        .frame(minWidth: 44, minHeight: 44)
                        .background(Capsule().fill(chosen ? MeeshyColors.warning : Color.clear))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(GameCopy.days(count))
                .accessibilityAddTraits(chosen ? [.isSelected] : [])
                .accessibilityIdentifier("game.flame.pause.days.\(count)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(FlamePauseCopy.daysGroup)
    }

    @ViewBuilder
    private var relightSection: some View {
        if isOut && flame.canRelight {
            GameNote(text: String(
                localized: "game.flame_panel.relight_intro",
                defaultValue: "Ta Flamme s’est éteinte : rallume-la maintenant, elle repart là où elle s’était arrêtée.",
                bundle: .main
            ))
            spendRow(relightSpend, identifier: "game.flame.relight.spend", missing: { ConceptText.spendMissingRelight(missing: $0) })
            GameActionButton(
                title: String(
                    localized: "game.flame_panel.relight",
                    defaultValue: "Rallumer la Flamme · \(GameCopy.meeshes(flame.relightPrice))",
                    bundle: .main
                ),
                busy: relighting, disabled: !online || cannotPayRelight, identifier: "game.flame.relight", action: onRelight
            )
            GameErrorLine(message: errors.relight, identifier: "game.flame.relight.error")
        } else if isOut && cannotPayRelight {
            GameNote(text: String(
                localized: "game.flame_panel.relight_missing_window",
                defaultValue: "Rallumage possible dans les 48 h qui suivent l’extinction.",
                bundle: .main
            ))
            spendRow(relightSpend, identifier: "game.flame.relight.spend", missing: { ConceptText.spendMissingRelight(missing: $0) })
        } else if Self.saysRelightClosed(flame, cannotPayRelight: cannotPayRelight) {
            GameNote(
                text: String(
                    localized: "game.flame_panel.relight_closed",
                    defaultValue: "Cette Flamme ne peut plus être rallumée. Une nouvelle Flamme commence dès ton prochain geste.",
                    bundle: .main
                ),
                tone: MeeshyColors.brandPrimary
            )
        }
    }
}

/// CE QUE LA FLAMME EN VEILLE DIT (#17372, #20510) — la veille servie, l'annonce et ses refus. Mêmes clés que le web
/// (`apps/web/src/lib/view/flame-pause-copy.ts`).
enum FlamePauseCopy {
    static var intro: String {
        let days = GameCopy.days(GameFlamePauseLaw.maxDays)
        return String(localized: "game.flame_panel.pause_intro",
                      defaultValue: "Une pause\u{00a0}? Ta Flamme t’attend jusqu’à \(days), une fois par trimestre.", bundle: .main)
    }

    static var daysGroup: String {
        String(localized: "game.flame_panel.pause_days", defaultValue: "Durée de la veille", bundle: .main)
    }

    static func action(days count: Int) -> String {
        let days = GameCopy.days(count)
        return String(localized: "game.flame_panel.pause", defaultValue: "Mettre en veille · \(days)", bundle: .main)
    }

    /// En veille : jusqu'à quand ; annoncée, qu'elle commence demain (la veille part toujours du lendemain de l'annonce).
    static func line(_ pause: GameFlamePause, today: String, locale: Locale = .current) -> String {
        let date = dayLabel(pause.until, locale: locale)
        return pause.startsAfter(today)
            ? String(localized: "game.flame_panel.paused_soon", defaultValue: "Ta Flamme se met en veille demain, jusqu’au \(date).", bundle: .main)
            : String(localized: "game.flame_panel.paused", defaultValue: "Ta Flamme est en veille jusqu’au \(date).", bundle: .main)
    }

    /// Le trimestre pris : dès quand la prochaine veille sera possible, sans le jour de la semaine (il est loin).
    static func nextLine(_ dayKey: String, locale: Locale = .current) -> String {
        let date = dayLabel(dayKey, withWeekday: false, locale: locale)
        return String(localized: "game.flame_panel.pause_next", defaultValue: "Ta prochaine veille sera possible dès le \(date).", bundle: .main)
    }

    /// Un jour `AAAA-MM-JJ` dit dans la langue du lecteur, avec son jour de la semaine : une veille dure sept jours au plus.
    static func dayLabel(_ dayKey: String, withWeekday: Bool = true, locale: Locale = .current) -> String {
        guard let number = GameDay.number(of: dayKey) else { return dayKey }
        let date = Date(timeIntervalSince1970: TimeInterval(number) * 86_400)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone).day().month(.wide)
        return date.formatted(withWeekday ? style.weekday(.wide) : style)
    }

    /// Le refus d'une veille dit sa raison ; une raison inconnue garde la phrase générale du refus.
    static func refusal(reason: String?) -> String {
        switch reason.flatMap(FlamePauseRefusal.init(rawValue:)) {
        case .quarterlyLimit:
            String(localized: "game.error.flame_pause.quarterly_limit", defaultValue: "Ta Flamme a déjà eu sa veille ce trimestre.", bundle: .main)
        case .alreadyPaused:
            String(localized: "game.error.flame_pause.already_paused", defaultValue: "Ta Flamme est déjà en veille.", bundle: .main)
        case .noFlame:
            String(localized: "game.error.flame_pause.no_flame", defaultValue: "Il faut une Flamme allumée pour la mettre en veille.", bundle: .main)
        case .invalidDays, nil:
            GameCopy.errorMessage(for: .flamePauseNotAllowed)
        }
    }

    /// Une veille refusée dit sa raison (le trimestre pris, une veille en cours, pas de Flamme) ; tout autre échec, le sien.
    static func errorMessage(for error: Error) -> String {
        guard GameService.refusal(of: error) == .flamePauseNotAllowed,
              case MeeshyError.rejected(let rejection) = error else { return GameCopy.errorMessage(for: error) }
        return refusal(reason: rejection.reason)
    }
}

/// CE QUE L'OBJECTIF DE FLAMME DIT (#17379, #20522) — le choix du premier jour, l'objectif en cours, le signe des
/// aïeux, et les refus. Mêmes clés que le web (`apps/web/src/lib/view/flame-goal-copy.ts`).
enum FlameGoalCopy {
    static var intro: String {
        String(localized: "game.flame_panel.goal_intro",
               defaultValue: "Un objectif pour ta Flamme\u{00a0}? Choisis-le aujourd’hui, ou laisse-la brûler.", bundle: .main)
    }

    static var choicesGroup: String {
        String(localized: "game.flame_panel.goal_choices", defaultValue: "Objectif de Flamme", bundle: .main)
    }

    static func running(target count: Int, remaining left: Int) -> String {
        let goalDays = GameCopy.days(count)
        let daysLeft = GameCopy.days(left)
        return String(localized: "game.flame_panel.goal_running",
                      defaultValue: "Objectif : \(goalDays) de Flamme. Encore \(daysLeft).", bundle: .main)
    }

    static func reached(target count: Int) -> String {
        let days = GameCopy.days(count)
        return String(localized: "game.flame_panel.goal_reached",
                      defaultValue: "Tes aïeux saluent ta Flamme : \(days) tenus\u{00a0}!", bundle: .main)
    }

    static func nextAction(days count: Int) -> String {
        let days = GameCopy.days(count)
        return String(localized: "game.flame_panel.goal_next", defaultValue: "Viser \(days)", bundle: .main)
    }

    static func nextIntro(target count: Int) -> String {
        let goalDays = GameCopy.days(count)
        return String(localized: "game.flame_panel.goal_next_intro",
                      defaultValue: "Objectif de \(goalDays) tenu. La marche suivante\u{00a0}?", bundle: .main)
    }

    static var later: String {
        String(localized: "game.flame_panel.goal_later", defaultValue: "Plus tard", bundle: .main)
    }

    /// Le refus d'un objectif dit sa raison ; une raison inconnue garde la phrase générale du refus.
    static func refusal(reason: String?) -> String {
        switch reason.flatMap(FlameGoalRefusal.init(rawValue:)) {
        case .notOffered:
            String(localized: "game.error.flame_goal.not_offered", defaultValue: "Cet objectif ne se propose pas aujourd’hui.", bundle: .main)
        case .noFlame:
            String(localized: "game.error.flame_goal.no_flame", defaultValue: "Il faut une Flamme allumée pour choisir un objectif.", bundle: .main)
        case nil:
            GameCopy.errorMessage(for: .flameGoalNotAllowed)
        }
    }

    /// Un objectif refusé dit sa raison (il ne se propose pas aujourd'hui, pas de Flamme) ; tout autre échec, le sien.
    static func errorMessage(for error: Error) -> String {
        guard GameService.refusal(of: error) == .flameGoalNotAllowed,
              case MeeshyError.rejected(let rejection) = error else { return GameCopy.errorMessage(for: error) }
        return refusal(reason: rejection.reason)
    }
}
