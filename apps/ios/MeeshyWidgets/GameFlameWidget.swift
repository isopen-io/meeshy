import WidgetKit
import SwiftUI

// ============================================================================
// MARK: - « Ma Flamme » (#20562, tranche iOS de #17369)
// ============================================================================
//
// La Flamme et les actes du jour, hors de l'app, sans notification de plus. L'app publie l'état servi dans le groupe
// d'app à chaque écriture du cache du Jeu (`WidgetDataManager.publishGameFlame`) : le widget ne fait ni requête ni
// calcul, et ne tient aucune horloge. « Jeu masqué » le vide. Un appui ouvre Ma Légende.

struct GameFlameWidget: Widget {
    let kind: String = GameFlameWidgetKeys.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: GameFlameProvider()) { entry in
            GameFlameWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.gameFlame.title", defaultValue: "My Flame"))
        .description(String(localized: "widget.gameFlame.description",
                            defaultValue: "Your Flame and today’s acts. A tap opens My Legend."))
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

struct GameFlameEntry: TimelineEntry {
    let date: Date
    /// `nil` : rien n'a encore été publié — le widget invite au premier geste.
    let state: WidgetGameFlameState?

    static let sample = WidgetGameFlameState.shown(WidgetGameFlame(days: 23, status: "lit", actsDone: 2, actsTotal: 3))
}

struct GameFlameProvider: TimelineProvider {
    func placeholder(in context: Context) -> GameFlameEntry {
        GameFlameEntry(date: Date(), state: GameFlameEntry.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (GameFlameEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry())
    }

    /// L'app recharge ce widget à chaque publication qui change : aucune horloge à tenir.
    func getTimeline(in context: Context, completion: @escaping (Timeline<GameFlameEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }

    private func entry() -> GameFlameEntry {
        let data = UserDefaults(suiteName: WidgetSharedKeys.suiteName)?.data(forKey: GameFlameWidgetKeys.defaultsKey)
        return GameFlameEntry(date: Date(), state: GameFlameWidgetKeys.decode(data))
    }
}

/// Ce que l'état servi de la Flamme montre : le glyphe, sa teinte, et la phrase d'état quand il y en a une.
enum GameFlameLook {
    case lit, atRisk, covered, out, unlit

    init(status: String) {
        switch status {
        case "lit": self = .lit
        case "at-risk": self = .atRisk
        case "covered": self = .covered
        case "out": self = .out
        default: self = .unlit
        }
    }

    var symbol: String {
        switch self {
        case .lit, .atRisk, .covered: "flame.fill"
        case .out, .unlit: "flame"
        }
    }

    /// Couleurs système : elles suivent le clair, le sombre et la teinte de l'écran verrouillé.
    var tint: Color {
        switch self {
        case .lit: .orange
        case .atRisk: .yellow
        case .covered: .cyan
        case .out, .unlit: .secondary
        }
    }

    var statusLine: String? {
        switch self {
        case .lit: nil
        case .atRisk: String(localized: "widget.gameFlame.atRisk", defaultValue: "Do something before midnight")
        case .covered: String(localized: "widget.gameFlame.covered", defaultValue: "A Vigil guards it")
        case .out: String(localized: "widget.gameFlame.out", defaultValue: "Out")
        case .unlit: String(localized: "widget.gameFlame.empty", defaultValue: "An action today lights your Flame")
        }
    }
}

struct GameFlameWidgetView: View {
    let entry: GameFlameEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        content
            .widgetURL(isHidden ? nil : GameFlameWidgetKeys.link)
            .containerBackground(.background, for: .widget)
    }

    private var isHidden: Bool { entry.state == .hidden }

    @ViewBuilder
    private var content: some View {
        switch entry.state {
        case .hidden:
            Color.clear.accessibilityHidden(true)
        case .shown(let flame):
            GameFlameFace(flame: flame, family: family)
        case nil:
            GameFlameFace(flame: WidgetGameFlame(days: 0, status: "none", actsDone: 0, actsTotal: 0), family: family)
        }
    }
}

private struct GameFlameFace: View {
    let flame: WidgetGameFlame
    let family: WidgetFamily

    private var look: GameFlameLook { GameFlameLook(status: flame.status) }
    private var showsDays: Bool { flame.days > 0 && look != .out && look != .unlit }

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular: circular
            case .accessoryRectangular: rectangular
            default: small
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var small: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(String(localized: "widget.gameFlame.title", defaultValue: "My Flame"), systemImage: "flame.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(WidgetColors.brandPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 0)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: look.symbol)
                    .font(.title2)
                    .foregroundStyle(look.tint)
                if showsDays {
                    Text(daysText)
                        .font(.title3.weight(.bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
            if let line = look.statusLine {
                Text(line)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let acts = actsText {
                Text(acts)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var circular: some View {
        if flame.actsTotal > 0 {
            Gauge(value: Double(min(flame.actsDone, flame.actsTotal)), in: 0...Double(flame.actsTotal)) {
                Image(systemName: look.symbol)
            } currentValueLabel: {
                circularCenter
            }
            .gaugeStyle(.accessoryCircularCapacity)
        } else {
            ZStack {
                AccessoryWidgetBackground()
                circularCenter
            }
        }
    }

    private var circularCenter: some View {
        VStack(spacing: 0) {
            Image(systemName: look.symbol).font(.caption)
            if showsDays {
                Text(verbatim: "\(flame.days)").font(.headline.weight(.bold)).minimumScaleFactor(0.5)
            }
        }
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Image(systemName: look.symbol)
                Text(showsDays ? daysText : (look.statusLine ?? ""))
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            if showsDays, let line = look.statusLine {
                Text(line).font(.caption).lineLimit(1).minimumScaleFactor(0.7)
            }
            if let acts = actsText {
                Text(acts).font(.caption).lineLimit(1).minimumScaleFactor(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var daysText: String {
        String(localized: "widget.gameFlame.days", defaultValue: "\(flame.days) days")
    }

    private var actsText: String? {
        guard flame.actsTotal > 0 else { return nil }
        return String(localized: "widget.gameFlame.acts",
                      defaultValue: "Today’s acts: \(min(flame.actsDone, flame.actsTotal)) of \(flame.actsTotal)")
    }

    private var accessibilityText: String {
        let title = String(localized: "widget.gameFlame.title", defaultValue: "My Flame")
        return [title, showsDays ? daysText : nil, look.statusLine, actsText].compactMap { $0 }.joined(separator: ", ")
    }
}
