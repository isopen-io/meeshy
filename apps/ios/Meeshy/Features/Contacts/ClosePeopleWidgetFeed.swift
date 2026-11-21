import Foundation
import MeeshySDK

/// **Qui entre dans « Mes proches »** (planche `Hors-App`, vue 3, #19524) : les liens au niveau Proche et au-dessus
/// (le Sang d'abord, puis Proche, chacun par nom), nommés par l'annuaire des cercles. Une personne que l'annuaire n'a
/// pas nommée n'entre pas : le widget ne montre jamais « Quelqu'un ». La présence est celle que la passerelle m'a
/// servie — `nil` si elle ne l'a pas servie, et rien n'est fabriqué.
enum ClosePeopleWidgetProjection {
    static let minimumLevel: RelationLevel = .close

    static func people(
        links: [RelationLink],
        people: [String: CirclePerson],
        presence: (String) -> PresenceState?
    ) -> [WidgetClosePerson] {
        let rows = links
            .filter { $0.effectiveLevel >= minimumLevel }
            .compactMap { link in people[link.userId].map { (link, $0) } }
            .sorted { lhs, rhs in
                lhs.0.effectiveLevel != rhs.0.effectiveLevel
                    ? lhs.0.effectiveLevel > rhs.0.effectiveLevel
                    : (lhs.1.name.lowercased(), lhs.0.userId) < (rhs.1.name.lowercased(), rhs.0.userId)
            }
            .prefix(ClosePeopleWidgetKeys.publishedCap)
        return rows.map { link, person in
            WidgetClosePerson(
                id: link.userId,
                name: person.name,
                username: person.username,
                accentHex: DynamicColorGenerator.profileAccentHex(userId: link.userId, name: person.name),
                presence: presence(link.userId)?.rawValue,
                level: link.effectiveLevel.rawValue
            )
        }
    }
}

/// Publie « Mes proches » : au démarrage depuis le cache des liens (aucune requête), et après chaque chargement de
/// l'écran des cercles, depuis ce qu'il vient de servir.
enum ClosePeopleWidgetFeed {
    static func publish(links: [RelationLink], people: [String: CirclePerson],
                        manager: WidgetDataManager = .shared) {
        manager.publishClosePeople(ClosePeopleWidgetProjection.people(
            links: links, people: people, presence: { manager.servedPresence(of: $0) }
        ))
        if #available(iOS 18.0, *) {
            MeeshyAppShortcuts.updateAppShortcutParameters()
        }
    }

    /// Le cache des liens d'abord, l'annuaire ensuite (cache des amis, puis fiche) ; sans cache, rien ne s'écrit.
    static func publishFromCache(
        linksStore: @escaping @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live,
        resolver: CirclePeopleResolving = CirclePeopleDirectory.shared
    ) async {
        let store = await linksStore()
        guard let cached = await store.loadIgnoringExpiry(for: CirclesViewModel.cacheKey) else { return }
        let close = cached.items.filter { $0.effectiveLevel >= ClosePeopleWidgetProjection.minimumLevel }
        guard !close.isEmpty else { return publish(links: [], people: [:]) }
        let people = await resolver.people(for: close.map(\.userId))
        publish(links: close, people: people)
    }
}
