import Foundation
import MeeshySDK

// MARK: - La carte des visiteurs et « Modifier » (planche `Lien-Detail`, #19499)

extension TrackingDetailViewModel {

    /// La carte des trente derniers jours. Un serveur qui ne sert pas `clicksByPlace` (antérieur à #19412), ou qui
    /// échoue, laisse la carte absente : la section ne s'affiche pas. Les zones se situent ensuite sur l'appareil.
    func loadVisitorMap(now: Date = Date()) async {
        let since = now.addingTimeInterval(-Double(TrackingVisitorMapLayout.windowDays) * 86_400)
        guard let stats = try? await placesRemote(token, since), let places = stats.clicksByPlace else { return }
        let shown = TrackingVisitorMapLayout.shown(places)
        let countries = TrackingVisitorMapLayout.countryCount(stats, places: places)
        visitorMap = TrackingVisitorMapState(countryCount: countries, zones: [], isLocating: !shown.isEmpty)
        var zones: [TrackingVisitorZone] = []
        for place in shown {
            if let zone = await locate(place) { zones.append(zone) }
        }
        visitorMap = TrackingVisitorMapState(countryCount: countries, zones: zones, isLocating: false)
    }

    /// Optimiste : l'écran prend les changements tout de suite, puis adopte le lien que le serveur a retenu. Un refus
    /// remet l'écran comme avant. L'issue dit aussi un nom ou un UTM que le serveur n'a pas retenu (antérieur à #19412),
    /// pour que l'écran le dise au lieu de le laisser disparaître en silence.
    @discardableResult
    func save(_ changes: TrackingLinkChanges, from current: TrackingLink) async -> TrackingLinkSaveOutcome {
        let previous = (edited: edited, isActive: isActive)
        edited = current.applying(changes)
        if let active = changes.isActive { isActive = active }
        do {
            let served = try await updateRemote(token, changes)
            edited = served
            isActive = served.isActive
            return changes.isUnretained(by: served) ? .partlyRetained : .saved
        } catch {
            edited = previous.edited
            isActive = previous.isActive
            return .refused
        }
    }
}

/// L'issue d'une modification : retenue, retenue en partie par un serveur antérieur à #19412, ou refusée.
nonisolated enum TrackingLinkSaveOutcome: Equatable, Sendable {
    case saved
    case partlyRetained
    case refused
}

/// Le brouillon de la feuille « Modifier » : ce que la personne tape, et les seuls changements qui en découlent.
nonisolated struct TrackingLinkDraft: Equatable, Sendable {
    var name: String
    var campaign: String
    var source: String
    var medium: String
    var expiresAt: Date?
    var isActive: Bool

    init(link: TrackingLink) {
        name = link.name ?? ""
        campaign = link.campaign ?? ""
        source = link.source ?? ""
        medium = link.medium ?? ""
        expiresAt = link.expiresAt
        isActive = link.isActive
    }

    /// Seul ce qui a changé part ; un champ vidé part à `null` et s'efface.
    func changes(from link: TrackingLink) -> TrackingLinkChanges {
        TrackingLinkChanges(name: Self.change(name, was: link.name),
                            campaign: Self.change(campaign, was: link.campaign),
                            source: Self.change(source, was: link.source),
                            medium: Self.change(medium, was: link.medium),
                            expiresAt: expiresAt == link.expiresAt ? nil : .some(expiresAt),
                            isActive: isActive == link.isActive ? nil : isActive)
    }

    func hasChanges(from link: TrackingLink) -> Bool {
        changes(from: link) != TrackingLinkChanges()
    }

    private static func change(_ typed: String, was served: String?) -> String?? {
        let trimmed = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        let value: String? = trimmed.isEmpty ? nil : trimmed
        return value == served ? nil : .some(value)
    }
}
