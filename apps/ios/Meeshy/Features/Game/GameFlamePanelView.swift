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

    /// Ce que la carte montre de la veille : sa phrase quand le bloc en sert une, le choix de la durée sur une Flamme
    /// vivante, rien sur une Flamme absente ou éteinte.
    enum PauseSection: Equatable {
        case paused(String)
        case chooser
        case hidden
    }

    static func pauseState(_ flame: GameBlock.Flame, today: String) -> PauseSection {
        if let pause = flame.pause { return .paused(FlamePauseCopy.line(pause, today: today)) }
        return GameFlamePauseLaw.isBurning(flame.status) ? .chooser : .hidden
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

    /// Un jour `AAAA-MM-JJ` dit dans la langue du lecteur, avec son jour de la semaine : une veille dure sept jours au plus.
    static func dayLabel(_ dayKey: String, locale: Locale = .current) -> String {
        guard let number = GameDay.number(of: dayKey) else { return dayKey }
        let date = Date(timeIntervalSince1970: TimeInterval(number) * 86_400)
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let style = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
            .weekday(.wide).day().month(.wide)
        return date.formatted(style)
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
