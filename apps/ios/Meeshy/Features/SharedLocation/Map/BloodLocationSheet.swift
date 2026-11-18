import SwiftUI
import MeeshySDK
import MeeshyUI

/// La feuille basse de la position d'un Sang : trente jours en barres, la fenêtre, la lecture, sa batterie, ce qui me
/// concerne, puis la sortie « Ne plus recevoir sa position continue » quand la passerelle la sert.
struct BloodLocationSheet: View {
    @ObservedObject var model: BloodLocationModel
    let displayName: String
    let tint: Color
    @Binding var isPlaying: Bool
    let onShareMine: () -> Void
    /// Ma position part-elle vers ce Sang, et combien de personnes la voient ?
    var ownShare: LocationMapOwnShare = .notShared
    var seenByCount = 0
    /// La réception est coupée : l'écran se ferme.
    var onStoppedReceiving: () -> Void = {}

    @Environment(\.locale) private var locale
    @State private var confirmsStop = false

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            switch model.state {
            case .loading:
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    MeeshySkeleton(shape: .line(widthRatio: 0.4))
                    MeeshySkeleton(shape: .line(widthRatio: 0.7))
                    MeeshySkeleton(shape: .card(aspect: 6, radius: Double(MeeshyRadius.md)))
                }
            case .failed(let offline):
                MeeshyStateBlock(kind: offline ? .offline : .error,
                                 title: offline ? BloodLocationCopy.offline : BloodLocationCopy.failed,
                                 primary: MeeshyStateBlockAction(title: BloodLocationCopy.retry, systemImage: "arrow.clockwise") {
                                     Task { await model.load() }
                                 },
                                 art: .glyph, size: .compact) { Image(systemName: "wifi.slash") }
            case .loaded:
                history
            }
            BloodBatteryRow(userId: model.userId, displayName: displayName, tint: tint)
            mine
            if model.canStopReceiving {
                stopReceiving
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xl)
        .adaptiveOnChange(of: model.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            model.notice = nil
        }
    }

    // MARK: - Ne plus recevoir sa position continue

    private var stopReceiving: some View {
        MeeshyButton(BloodLocationCopy.stopReceiving, systemImage: "location.slash", kind: .danger, width: .fill,
                     isDestructive: true, isPending: model.isStoppingReception, action: { confirmsStop = true })
            .accessibilityHint(BloodLocationCopy.stopReceivingHint(name: displayName))
            .accessibilityIdentifier("bloodLocation.stopReceiving")
            .confirmationDialog(BloodLocationCopy.stopReceivingTitle(name: displayName), isPresented: $confirmsStop,
                                titleVisibility: .visible) {
                Button(BloodLocationCopy.stopReceivingConfirm, role: .destructive) {
                    Task {
                        if await model.stopReceiving() { onStoppedReceiving() }
                    }
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            } message: {
                Text(BloodLocationCopy.stopReceivingBody(name: displayName))
            }
    }

    // MARK: - L'historique

    @ViewBuilder
    private var history: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            MeeshySectionHeader(title: BloodLocationCopy.lastDays, form: .overline, size: .sheet)
            MeeshySectionHeader(title: BloodLocationCopy.summary(range: model.range,
                                                                 distance: LocationMapCopy.distance(model.shownDistanceMeters, locale: locale)),
                                size: .sheet, detail: BloodLocationCopy.stops(model.stops.count), level: 2,
                                lead: { EmptyView() }, accessory: { EmptyView() })
        }
        MeeshyChart(kind: .strip, points: dayPoints, summary: BloodLocationCopy.lastDays, tint: tint, size: .compact,
                    markers: [.today], emptyText: BloodLocationCopy.empty)
        MeeshyChipRow(
            BloodHistoryRange.allCases.map { MeeshyChip(id: $0.rawValue, title: BloodLocationCopy.range($0)) },
            selection: [model.range.rawValue],
            label: BloodLocationCopy.rangeLabel,
            mode: .single,
            surface: .theme,
            onChange: { _, id in model.range = BloodHistoryRange(rawValue: id) ?? .today }
        )
        if model.shown.isEmpty {
            MeeshyNote(BloodLocationCopy.emptyRange(name: displayName), lead: .systemImage("location.slash"))
        } else {
            player
        }
    }

    private var dayPoints: [MeeshyChartPoint] {
        model.dailyDistances.enumerated().map { index, meters in
            let distance = LocationMapCopy.distance(meters, locale: locale)
            return MeeshyChartPoint(id: "\(index)", value: meters, label: "", spoken: distance)
        }
    }

    /// La relecture du trajet (K35 `transport`) : lecture / pause, les arrêts en repères, l'heure du point montré.
    private var player: some View {
        MeeshyWaveTransport(BloodLocationCopy.playhead, position: $model.progress, isPlaying: isPlaying,
                            playLabel: BloodLocationCopy.play, pauseLabel: BloodLocationCopy.pause,
                            timeText: playheadTime, markers: stopMarkers, tint: tint, tone: .theme,
                            onToggle: { isPlaying.toggle() },
                            onEditingChanged: { editing in if editing { isPlaying = false } })
    }

    private var stopMarkers: [Double] {
        let shown = model.shown
        return model.stops.compactMap { BloodHistoryRules.progress(ofIndex: $0, in: shown) }
    }

    private var playheadTime: String {
        guard let index = model.playheadIndex, model.shown.indices.contains(index) else { return "" }
        return model.shown[index].recordedAt.formatted(date: .omitted, time: .shortened)
    }

    // MARK: - Ce qui me concerne

    private var mine: some View {
        VStack(spacing: 0) {
            MeeshyToggleRow(LocationMapCopy.myPosition(ownShare, name: displayName), systemImage: "mappin.and.ellipse",
                            subtitle: seenByCount == 0 ? LocationMapCopy.nobodySeesMe : LocationMapCopy.seenBy(seenByCount), accessory: .chevron, showsDivider: true, tint: tint,
                            action: onShareMine)
            MeeshyToggleRow(BloodLocationCopy.ghostTitle, systemImage: "theatermasks",
                            subtitle: BloodLocationCopy.ghostSubtitle(name: displayName),
                            accessory: .toggle(isOn: model.isGhost), showsDivider: model.consultations != nil, tint: tint,
                            action: { Task { await model.setGhost(!model.isGhost) } })
            if let journal = model.consultations {
                MeeshyToggleRow(BloodLocationCopy.consultationsTitle, systemImage: "eye",
                                subtitle: BloodLocationCopy.consultations(journal.items.count, excessive: journal.excessive),
                                accessory: .none, kind: journal.excessive ? .destructive : .normal,
                                showsDivider: !journal.byObserver.isEmpty, tint: tint, action: {})
                observerRows(journal.byObserver)
            }
        }
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
    }

    /// Une rangée par personne qui a lu ma position : combien de fois, quand ; « souvent » en avertissement.
    private func observerRows(_ rows: [BloodLocationObserverSummary]) -> some View {
        ForEach(rows) { row in
            let name = model.observers[row.observerId]?.name ?? LocationMapCopy.someone
            MeeshyPersonRow(
                title: name,
                subtitle: BloodLocationCopy.observerReads(row.count, lastAt: row.lastAt, locale: locale),
                size: .compact,
                showsDivider: row.id != rows.last?.id,
                avatar: {
                    MeeshyAvatar(name: name, context: .custom(32), accentColor: DynamicColorGenerator.colorForName(name),
                                 avatarURL: model.observers[row.observerId]?.avatarURL)
                },
                trailing: {
                    if row.isExcessive {
                        MeeshyBadge(.label(BloodLocationCopy.often), leading: .systemImage("exclamationmark.triangle.fill"),
                                    kind: .warn)
                    }
                }
            )
        }
    }
}

/// Les mots de la position du Sang (sept langues dans `Localizable.xcstrings`).
enum BloodLocationCopy {
    static func title(name: String) -> String {
        String(format: String(localized: "bloodLocation.title", defaultValue: "%@ · Sang", bundle: .main), name)
    }

    static func traceLabel(name: String) -> String {
        String(format: String(localized: "bloodLocation.trace", defaultValue: "Le chemin de %@", bundle: .main), name)
    }

    static func isNear(name: String, distance: String) -> String {
        String(format: String(localized: "bloodLocation.near", defaultValue: "%1$@ est à %2$@ de toi", bundle: .main), name, distance)
    }

    static var stop: String { String(localized: "bloodLocation.stop", defaultValue: "Arrêt", bundle: .main) }
    static var lastDays: String { String(localized: "bloodLocation.lastDays", defaultValue: "30 derniers jours", bundle: .main) }
    static var empty: String { String(localized: "bloodLocation.empty", defaultValue: "Rien sur ces trente jours", bundle: .main) }
    static var rangeLabel: String { String(localized: "bloodLocation.rangeLabel", defaultValue: "Période", bundle: .main) }
    static var play: String { String(localized: "bloodLocation.play", defaultValue: "Rejouer le chemin", bundle: .main) }
    static var pause: String { String(localized: "bloodLocation.pause", defaultValue: "Mettre en pause", bundle: .main) }
    static var playhead: String { String(localized: "bloodLocation.playhead", defaultValue: "Moment du chemin", bundle: .main) }
    static var ghostTitle: String { String(localized: "bloodLocation.ghost", defaultValue: "Mode fantôme", bundle: .main) }
    static var on: String { String(localized: "bloodLocation.on", defaultValue: "Activé", bundle: .main) }
    static var off: String { String(localized: "bloodLocation.off", defaultValue: "Désactivé", bundle: .main) }
    static var offline: String { String(localized: "bloodLocation.offline", defaultValue: "Hors ligne — l'historique reviendra avec le réseau", bundle: .main) }
    static var failed: String { String(localized: "bloodLocation.failed", defaultValue: "L'historique n'a pas pu se charger", bundle: .main) }
    static var retry: String { String(localized: "bloodLocation.retry", defaultValue: "Réessayer", bundle: .main) }
    static var consultationsTitle: String { String(localized: "bloodLocation.consultations", defaultValue: "Qui a regardé ma position", bundle: .main) }

    static func ghostSubtitle(name: String) -> String {
        String(format: String(localized: "bloodLocation.ghost.subtitle", defaultValue: "Quand tu partages : %@ voit un fantôme, pas où tu es", bundle: .main), name)
    }

    static func emptyRange(name: String) -> String {
        String(format: String(localized: "bloodLocation.emptyRange", defaultValue: "Aucun chemin de %@ sur cette période", bundle: .main), name)
    }

    static func stops(_ count: Int) -> String {
        String(format: String(localized: "bloodLocation.stops", defaultValue: "%lld arrêt(s)", bundle: .main), count)
    }

    static var often: String { String(localized: "bloodLocation.consultations.often", defaultValue: "Souvent", bundle: .main) }

    static func observerReads(_ count: Int, lastAt: Date, locale: Locale) -> String {
        let style = Date.RelativeFormatStyle(presentation: .numeric, unitsStyle: .wide, locale: locale,
                                             capitalizationContext: .middleOfSentence)
        return String(format: String(localized: "bloodLocation.consultations.reads", defaultValue: "%1$lld fois · %2$@", bundle: .main),
                      count, lastAt.formatted(style))
    }

    static func consultations(_ count: Int, excessive: Bool) -> String {
        excessive
            ? String(format: String(localized: "bloodLocation.consultations.excessive", defaultValue: "%lld lecture(s) — quelqu'un regarde souvent", bundle: .main), count)
            : String(format: String(localized: "bloodLocation.consultations.count", defaultValue: "%lld lecture(s) ces trente jours", bundle: .main), count)
    }

    static func battery(level: Int) -> String {
        String(format: String(localized: "bloodLocation.battery", defaultValue: "Sa batterie : %lld %%", bundle: .main), level)
    }

    static var batteryUnknown: String { String(localized: "bloodLocation.battery.unknown", defaultValue: "Sa batterie", bundle: .main) }
    static var batteryNoReading: String { String(localized: "bloodLocation.battery.none", defaultValue: "Aucun relevé récent", bundle: .main) }
    static var batteryPulled: String { String(localized: "bloodLocation.battery.pulled", defaultValue: "Demandé", bundle: .main) }
    static var stopReceiving: String { String(localized: "bloodLocation.stopReceiving", defaultValue: "Ne plus recevoir sa position continue", bundle: .main) }
    static var stopReceivingConfirm: String { String(localized: "bloodLocation.stopReceiving.confirm", defaultValue: "Ne plus recevoir", bundle: .main) }
    static var stopReceivingFailed: String { String(localized: "bloodLocation.stopReceiving.failed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main) }

    static func stopReceivingTitle(name: String) -> String {
        String(format: String(localized: "bloodLocation.stopReceiving.title", defaultValue: "Ne plus recevoir la position de %@ ?", bundle: .main), name)
    }

    static func stopReceivingBody(name: String) -> String {
        String(format: String(localized: "bloodLocation.stopReceiving.body", defaultValue: "Sa position continue et ses alertes de proximité ne t'arriveront plus. %@ n'en est pas prévenu·e.", bundle: .main), name)
    }

    static func stopReceivingHint(name: String) -> String {
        String(format: String(localized: "bloodLocation.stopReceiving.hint", defaultValue: "Demande une confirmation avant de couper la position de %@", bundle: .main), name)
    }

    static func range(_ range: BloodHistoryRange) -> String {
        switch range {
        case .today: return String(localized: "bloodLocation.range.today", defaultValue: "Aujourd'hui", bundle: .main)
        case .yesterday: return String(localized: "bloodLocation.range.yesterday", defaultValue: "Hier", bundle: .main)
        case .week: return String(localized: "bloodLocation.range.week", defaultValue: "7 j", bundle: .main)
        case .month: return String(localized: "bloodLocation.range.month", defaultValue: "30 j", bundle: .main)
        }
    }

    static func summary(range: BloodHistoryRange, distance: String) -> String {
        String(format: String(localized: "bloodLocation.summary", defaultValue: "%1$@, %2$@", bundle: .main), Self.range(range), distance)
    }
}

/// La ligne « Sa batterie : 71 % · il y a 12 min » : un relevé frais dit son niveau et son âge ; sans relevé (hors
/// épisode, ou expiré), aucun niveau n'est inventé.
struct BloodBatteryLine: Equatable {
    let title: String
    let subtitle: String
    let systemImage: String

    static func resolve(_ state: BatteryReaderState?, now: Date) -> BloodBatteryLine {
        guard let state, !state.isExpired(at: now) else {
            return BloodBatteryLine(title: BloodLocationCopy.batteryUnknown, subtitle: BloodLocationCopy.batteryNoReading,
                                    systemImage: "battery.50percent")
        }
        return BloodBatteryLine(title: BloodLocationCopy.battery(level: state.level),
                                subtitle: RelativeTimeFormatter.longString(for: min(state.measuredAt, now), now: now),
                                systemImage: BatteryAnnouncementWording.iconName(for: state))
    }
}

/// Sa batterie sur la carte d'un Sang (planche Carte-Sang) : le relevé servi (cache d'abord, rien d'inventé), puis
/// « Demander un relevé » — la même demande que sa fiche, limitée par la passerelle.
struct BloodBatteryRow: View {
    @StateObject private var viewModel: ProfileBatteryViewModel
    let displayName: String
    let tint: Color
    @State private var state: BatteryReaderState?

    init(userId: String, displayName: String, tint: Color) {
        _viewModel = StateObject(wrappedValue: ProfileBatteryViewModel(
            userId: userId,
            service: BatteryService.shared,
            consent: UserDefaultsBatteryConsentMemory.shared,
            viewerId: { AuthManager.shared.currentUser?.id }
        ))
        self.displayName = displayName
        self.tint = tint
    }

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let line = BloodBatteryLine.resolve(state, now: context.date)
            HStack(spacing: 0) {
                MeeshyToggleRowFace(content: MeeshyToggleRowContent(title: line.title, subtitle: line.subtitle, tint: tint),
                                    leading: { MeeshyToggleRowSymbol(line.systemImage) },
                                    titleAccessory: { MeeshyToggleRowNoSlot() },
                                    trailing: { MeeshyToggleRowNoSlot() })
                    .accessibilityElement(children: .combine)
                pullButton
                    .padding(.trailing, MeeshySpacing.lg)
            }
        }
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        .task(id: viewModel.userId) {
            state = nil
            for await next in BatteryLiveState.stream(of: viewModel.userId).values {
                state = next
            }
        }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
        .accessibilityIdentifier("bloodLocation.battery")
    }

    private var pullButton: some View {
        let requested = viewModel.pullState == .requested
        return MeeshyButton(requested ? BloodLocationCopy.batteryPulled : BatteryProfileWording.pullAction,
                            systemImage: requested ? "checkmark" : "arrow.clockwise", kind: .glass, size: .s44,
                            tint: tint, isPending: viewModel.pullState == .sending,
                            action: { Task { await viewModel.requestReading() } })
            .disabled(viewModel.pullState != .idle)
            .accessibilityHint(BatteryProfileWording.pullHint(name: displayName))
            .accessibilityIdentifier("battery.pull")
    }
}
