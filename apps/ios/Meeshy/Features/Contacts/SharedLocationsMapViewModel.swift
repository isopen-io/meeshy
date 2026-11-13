import Combine
import Foundation
import MeeshySDK

/// Une épingle de la carte des positions partagées : la position TELLE QUE SERVIE (jamais plus fine), le cercle de flou
/// au rayon servi, la personne nommée par l'annuaire des cercles et sa présence servie (`nil` ⇒ aucun anneau).
struct SharedLocationPin: Identifiable, Equatable {
    let id: String
    let latitude: Double
    let longitude: Double
    let radiusMeters: Double
    let precision: SharedLocationPrecision
    let name: String
    let initials: String
    let presence: PresenceState?
    let deadline: Date

    var detail: String {
        let until = deadline.formatted(date: .omitted, time: .shortened)
        let term = String(localized: "circles.locations.pin.until", defaultValue: "jusqu'à \(until)", bundle: .main)
        return "\(Self.precisionLabel(precision)) · \(term)"
    }

    var accessibilityLabel: String { "\(name), \(detail)" }

    static func precisionLabel(_ precision: SharedLocationPrecision) -> String {
        switch precision {
        case .exact:
            return String(localized: "circles.locations.precision.exact", defaultValue: "Position exacte", bundle: .main)
        case .neighborhood:
            return String(localized: "circles.locations.precision.neighborhood", defaultValue: "Au quartier près", bundle: .main)
        case .city:
            return String(localized: "circles.locations.precision.city", defaultValue: "À la ville près", bundle: .main)
        }
    }
}

/// LA CARTE DES POSITIONS QU'ON ME PARTAGE, SUR iOS (#16983 ; iso de la carte web `shared-locations-map.tsx`, #16984).
///
/// - Elle PROJETTE le magasin du SDK (`SharedLocationsLive`) : le serveur a déjà tronqué chaque position à la précision
///   que son émetteur m'a donnée ; ce modèle ne rend rien plus fin, ne garde rien sur le disque et ne rejuge rien.
/// - Cache d'abord : le magasin se peint dès l'ouverture ; le rattrapage du MONDE à l'apparition efface une fin manquée
///   carte fermée, puis seule l'emprise visible est redemandée, après un temps de calme (un glisser ne fait pas une
///   requête par image).
/// - Les noms viennent de l'annuaire des cercles (cache des amis, puis fiche), la présence de la carte servie : une
///   personne inconnue est « Quelqu'un », une présence absente ou hors ligne ne dessine aucun anneau.
@MainActor
final class SharedLocationsMapViewModel: ObservableObject {

    @Published private(set) var pins: [SharedLocationPin] = []

    private let live: SharedLocationsLive
    private let people: CirclePeopleResolving
    private let presence: (String) -> PresenceState?
    private let calm: Duration
    private var known: [String: CirclePerson] = [:]
    private var pending: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(
        live: SharedLocationsLive,
        people: CirclePeopleResolving,
        presence: @escaping (String) -> PresenceState?,
        presenceRefresh: AnyPublisher<Void, Never> = Empty<Void, Never>().eraseToAnyPublisher(),
        calm: Duration = .milliseconds(300)
    ) {
        self.live = live
        self.people = people
        self.presence = presence
        self.calm = calm
        live.$byUser
            .sink { [weak self] byUser in self?.project(byUser) }
            .store(in: &cancellables)
        presenceRefresh
            .sink { [weak self] _ in self?.repaintPresence() }
            .store(in: &cancellables)
    }

    /// À l'apparition : le monde fait foi, une fin survenue carte fermée s'efface partout.
    func appeared() async {
        await live.catchUp(within: nil)
    }

    /// L'emprise visible a bougé : un seul rattrapage, sur la dernière emprise, après le calme.
    func regionChanged(_ bounds: SharedLocationBounds?) {
        pending?.cancel()
        let calm = self.calm
        pending = Task { [weak self] in
            do {
                try await Task.sleep(for: calm)
            } catch {
                return
            }
            await self?.live.catchUp(within: bounds)
        }
    }

    // MARK: - Projection

    private func project(_ byUser: [String: SharedLocationEntry]) {
        pins = byUser
            .map { userId, entry in pin(userId, entry) }
            .sorted { ($0.name, $0.id) < ($1.name, $1.id) }
        let unnamed = byUser.keys.filter { known[$0] == nil }
        guard !unnamed.isEmpty else { return }
        Task { [weak self] in await self?.name(Array(unnamed)) }
    }

    private func repaintPresence() {
        project(live.byUser)
    }

    private func name(_ ids: [String]) async {
        let found = await people.people(for: ids)
        guard !found.isEmpty else { return }
        known.merge(found) { _, new in new }
        project(live.byUser)
    }

    private func pin(_ userId: String, _ entry: SharedLocationEntry) -> SharedLocationPin {
        let name = known[userId]?.name
            ?? String(localized: "circles.locations.someone", defaultValue: "Quelqu'un", bundle: .main)
        let served = presence(userId)
        return SharedLocationPin(
            id: userId,
            latitude: entry.latitude,
            longitude: entry.longitude,
            radiusMeters: entry.radiusMeters,
            precision: entry.precision,
            name: name,
            initials: Self.initials(of: name),
            presence: served == .offline ? nil : served,
            deadline: entry.deadline
        )
    }

    static func initials(of name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace).prefix(2)
        let letters = words.compactMap(\.first).map { String($0).uppercased() }.joined()
        return letters.isEmpty ? "?" : letters
    }
}
