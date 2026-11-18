import WidgetKit
import SwiftUI
import AppIntents

// ============================================================================
// MARK: - « Mes proches » (planche `Hors-App`, vue 3, #19524)
// ============================================================================
//
// Mes proches en quatre avatars, en 2 × 2. Un appui sur un avatar ouvre sa vitrine. L'app publie la liste dans le groupe
// d'app (`WidgetDataManager.publishClosePeople`) : Proche et au-dessus, présence servie seulement. Sans proche, le widget
// le dit et n'invente personne.

struct ClosePeopleWidget: Widget {
    let kind: String = ClosePeopleWidgetKeys.kind

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ClosePeopleProvider()) { entry in
            ClosePeopleWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.closePeople.title", defaultValue: "My close ones"))
        .description(String(localized: "widget.closePeople.description", defaultValue: "Your close ones in four avatars. A tap opens their profile."))
        .supportedFamilies([.systemSmall])
    }
}

struct ClosePeopleEntry: TimelineEntry {
    let date: Date
    let people: [WidgetClosePerson]

    static let sample: [WidgetClosePerson] = [
        WidgetClosePerson(id: "1", name: "Léo Marchetti", username: nil, accentHex: "6366F1", presence: "online", level: "CLOSE"),
        WidgetClosePerson(id: "2", name: "Mina Okafor", username: nil, accentHex: "EC4899", presence: nil, level: "BLOOD"),
        WidgetClosePerson(id: "3", name: "Kwame Mensah", username: nil, accentHex: "F59E0B", presence: "away", level: "CLOSE"),
        WidgetClosePerson(id: "4", name: "Yuki Tanaka", username: nil, accentHex: "10B981", presence: nil, level: "CLOSE"),
    ]
}

struct ClosePeopleProvider: TimelineProvider {
    func placeholder(in context: Context) -> ClosePeopleEntry {
        ClosePeopleEntry(date: Date(), people: ClosePeopleEntry.sample)
    }

    func getSnapshot(in context: Context, completion: @escaping (ClosePeopleEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : entry())
    }

    /// L'app recharge ce widget à chaque publication : aucune horloge à tenir.
    func getTimeline(in context: Context, completion: @escaping (Timeline<ClosePeopleEntry>) -> Void) {
        completion(Timeline(entries: [entry()], policy: .never))
    }

    /// Pas de repli fabriqué : une lecture morte doit se VOIR (même règle que les favoris).
    private func entry() -> ClosePeopleEntry {
        let data = UserDefaults(suiteName: WidgetSharedKeys.suiteName)?.data(forKey: ClosePeopleWidgetKeys.defaultsKey)
        return ClosePeopleEntry(date: Date(), people: ClosePeopleWidgetKeys.decode(data))
    }
}

struct ClosePeopleWidgetView: View {
    let entry: ClosePeopleEntry

    private let columns = [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(String(localized: "widget.closePeople.title", defaultValue: "My close ones"), systemImage: "person.2.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(WidgetColors.brandPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if entry.people.isEmpty {
                empty
            } else {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(entry.people.prefix(ClosePeopleWidgetKeys.smallCount)) { person in
                        ClosePersonButton(person: person)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.background, for: .widget)
    }

    private var empty: some View {
        Text(String(localized: "widget.closePeople.empty", defaultValue: "Your close ones will appear here"))
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
}

/// Un avatar : un bouton vers sa vitrine quand la personne a un pseudo, sinon l'avatar seul.
private struct ClosePersonButton: View {
    let person: WidgetClosePerson

    var body: some View {
        Group {
            if let username = person.username, !username.isEmpty {
                Button(intent: OpenVitrineIntent(username: username)) { avatar }
                    .buttonStyle(.plain)
            } else {
                avatar
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
    }

    private var presence: WidgetPresence {
        person.presence.flatMap(WidgetPresence.init(rawValue:)) ?? .offline
    }

    private var avatar: some View {
        ZStack(alignment: .bottomTrailing) {
            InitialsAvatar(name: person.name, accentColor: person.accentHex, size: 52)
            if let dotHex = presence.dotHex {
                Circle()
                    .fill(Color(hex: dotHex))
                    .frame(width: 13, height: 13)
                    .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
            }
        }
        .frame(minWidth: 44, minHeight: 44)
    }

    private var label: String {
        person.presence == nil ? person.name : "\(person.name), \(presence.localizedLabel)"
    }
}
