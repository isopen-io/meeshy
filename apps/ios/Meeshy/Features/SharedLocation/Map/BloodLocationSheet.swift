import SwiftUI
import MeeshySDK
import MeeshyUI

/// La feuille basse de la position d'un Sang : trente jours en barres, la fenêtre, la lecture, puis ce qui me concerne.
struct BloodLocationSheet: View {
    @ObservedObject var model: BloodLocationModel
    let displayName: String
    let tint: Color
    @Binding var isPlaying: Bool
    let onShareMine: () -> Void
    /// Ma position part-elle vers ce Sang, et combien de personnes la voient ?
    var ownShare: LocationMapOwnShare = .notShared
    var seenByCount = 0

    @Environment(\.locale) private var locale

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
            mine
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.xl)
    }

    // MARK: - L'historique

    @ViewBuilder
    private var history: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(BloodLocationCopy.lastDays).font(.caption.weight(.bold)).foregroundStyle(.secondary)
            Text(BloodLocationCopy.summary(range: model.range, distance: LocationMapCopy.distance(model.shownDistanceMeters, locale: locale)))
                .font(.title2.weight(.bold))
                .accessibilityAddTraits(.isHeader)
            Text(BloodLocationCopy.stops(model.stops.count)).font(.footnote).foregroundStyle(.secondary)
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

    private var player: some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyGlassButton(systemImage: isPlaying ? "pause.fill" : "play.fill",
                              label: isPlaying ? BloodLocationCopy.pause : BloodLocationCopy.play,
                              kind: .active, size: .s44, tint: tint, action: { isPlaying.toggle() })
            MeeshyLabeledSlider(BloodLocationCopy.playhead, value: $model.progress, in: 0...1,
                                valueText: playheadTime, showsValue: true, tint: tint,
                                onEditingChanged: { editing in if editing { isPlaying = false } })
        }
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
                                accessory: .none, kind: journal.excessive ? .destructive : .normal, tint: tint, action: {})
            }
        }
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
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

    static func consultations(_ count: Int, excessive: Bool) -> String {
        excessive
            ? String(format: String(localized: "bloodLocation.consultations.excessive", defaultValue: "%lld lecture(s) — quelqu'un regarde souvent", bundle: .main), count)
            : String(format: String(localized: "bloodLocation.consultations.count", defaultValue: "%lld lecture(s) ces trente jours", bundle: .main), count)
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
