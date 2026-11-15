import WidgetKit
import SwiftUI
import AppIntents

// ============================================================================
// MARK: - 4. Favorite Contacts Widget
// ============================================================================

struct FavoriteContactsWidget: Widget {
    let kind: String = "FavoriteContacts"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FavoriteContactsProvider()) { entry in
            FavoriteContactsWidgetView(entry: entry)
        }
        .configurationDisplayName(String(localized: "widget.favoriteContacts.title", defaultValue: "Favorite Contacts"))
        .description(String(localized: "widget.favoriteContacts.description", defaultValue: "Quick access to your favorite contacts"))
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct FavoriteContactsProvider: TimelineProvider {
    func placeholder(in context: Context) -> FavoriteContactsEntry {
        FavoriteContactsEntry(date: Date(), contacts: FavoriteContactsEntry.sampleContacts)
    }

    func getSnapshot(in context: Context, completion: @escaping (FavoriteContactsEntry) -> ()) {
        // appgroup-05 — samples réservés à la galerie (context.isPreview).
        if context.isPreview {
            completion(FavoriteContactsEntry(date: Date(), contacts: FavoriteContactsEntry.sampleContacts))
            return
        }
        let entry = FavoriteContactsEntry(date: Date(), contacts: loadFavorites())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FavoriteContactsEntry>) -> ()) {
        let now = Date()
        let entry = FavoriteContactsEntry(date: now, contacts: loadFavorites())
        completion(WidgetRefreshSchedule.timeline(
            single: entry,
            now: now,
            interval: WidgetRefreshSchedule.favoritesInterval
        ))
    }

    private func loadFavorites() -> [FavoriteContact] {
        // appgroup-05 — même règle que loadConversations : pas de repli
        // fabriqué, une lecture morte doit se VOIR.
        guard let sharedDefaults = UserDefaults(suiteName: WidgetSharedKeys.suiteName),
              let data = sharedDefaults.data(forKey: "favorite_contacts") else {
            return []
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        if let contacts = try? decoder.decode([FavoriteContact].self, from: data) {
            return contacts
        }
        return []
    }
}

struct FavoriteContactsEntry: TimelineEntry {
    let date: Date
    let contacts: [FavoriteContact]

    static let sampleContacts: [FavoriteContact] = [
        FavoriteContact(id: "1", name: "Mom", avatar: "person.circle.fill", presence: "online", accentColor: "34D399"),
        FavoriteContact(id: "2", name: "John", avatar: "person.circle.fill", presence: "away", accentColor: "6366F1"),
        FavoriteContact(id: "3", name: "Sarah", avatar: "person.circle.fill", presence: "idle", accentColor: "F39C12"),
        FavoriteContact(id: "4", name: "Team", avatar: "person.3.fill", presence: "offline", accentColor: WidgetColors.brandDeepHex)
    ]
}

struct FavoriteContactsWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: FavoriteContactsEntry

    var contactsToShow: Int {
        family == .systemMedium ? 4 : 8
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label(String(localized: "widget.favorites", defaultValue: "Favorites"), systemImage: "star.fill")
                    .font(.headline)
                    .foregroundStyle(.orange)
                Spacer()
            }

            if entry.contacts.isEmpty {
                WidgetEmptyState()
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 65))], spacing: 12) {
                ForEach(entry.contacts.prefix(contactsToShow)) { contact in
                    WidgetLink(url: WidgetDeepLink.contact(contact.id)) {
                        VStack(spacing: 4) {
                            ZStack(alignment: .bottomTrailing) {
                                InitialsAvatar(name: contact.name, accentColor: contact.accentColor, size: 50)

                                if let dotHex = contact.presenceState.dotHex {
                                    Circle()
                                        .fill(Color(hex: dotHex))
                                        .frame(width: 12, height: 12)
                                        .overlay(
                                            Circle()
                                                .stroke(Color(.systemBackground), lineWidth: 2)
                                        )
                                }
                            }

                            Text(contact.name)
                                .font(.caption)
                                .lineLimit(1)
                                .foregroundStyle(.primary)
                        }
                        // La pastille est une forme sans texte : sans cette
                        // fusion, VoiceOver ne lit que le nom et l'état de
                        // présence n'existe pas pour un lecteur d'écran.
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(contact.name), \(contact.presenceState.localizedLabel)")
                    }
                }
            }

            Spacer()
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}
