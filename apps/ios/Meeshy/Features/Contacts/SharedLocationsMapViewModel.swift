import Combine
import Foundation
import MeeshySDK

/// Une épingle de la carte des positions partagées : la position TELLE QUE SERVIE (jamais plus fine), le cercle de flou
/// au rayon servi, la personne nommée par l'annuaire des cercles et sa présence servie (`nil` ⇒ aucun anneau), et le
/// cercle d'où elle vient, tel que le SERVEUR l'a jugé pour moi (#17013) — `nil` ⇒ marqueur neutre, rien de deviné.
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
    var avatarURL: String? = nil
    /// Le cercle servi avec la position (#17966) ; `nil` : non servi, la carte dessine un marqueur neutre.
    var circle: RelationLevel? = nil
    var updatedAt: Date = .distantPast

    var detail: String {
        let until = deadline.formatted(date: .omitted, time: .shortened)
        let term = String(localized: "circles.locations.pin.until", defaultValue: "jusqu'à \(until)", bundle: .main)
        return "\(Self.precisionLabel(precision)) · \(term)"
    }

    /// « Alice, Proche, Au quartier près · jusqu'à 11:30 » : le cercle s'entend comme il se voit.
    var accessibilityLabel: String {
        guard let circle else { return "\(name), \(detail)" }
        return "\(name), \(CircleLevelNames.title(of: circle)), \(detail)"
    }

    /// L'icône du cercle (🤝, 🔥, 🩸) que le marqueur porte à la place des initiales ; `nil` ⇒ initiales.
    var circleIcon: String? { circle.map(CircleLevelNames.icon(of:)) }

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

/// Un partage qui vient de s'arrêter : qui, de quel cercle, depuis quand. Jamais une position.
struct SharedLocationEndedPin: Identifiable, Equatable {
    let id: String
    let name: String
    let initials: String
    let avatarURL: String?
    let circle: RelationLevel?
    let endedAt: Date
}

/// Une personne dont la position est en pause par son mode fantôme (#19562) : qui, de quel cercle. Ni coordonnée, ni
/// heure, ni précision : la rangée « En mode fantôme · position en pause » n'a rien d'autre à dire.
struct SharedLocationGhostPin: Identifiable, Equatable {
    let id: String
    let name: String
    let circle: RelationLevel?
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
    /// Les partages qui viennent de s'arrêter, « pas sur la carte » (#18872), du plus récent au plus ancien.
    @Published private(set) var ended: [SharedLocationEndedPin] = []
    /// Ceux dont la position est en pause par fantôme, servis par la passerelle (#19562), dans l'ordre des noms.
    @Published private(set) var ghosts: [SharedLocationGhostPin] = []

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
        endings: AnyPublisher<SharedLocationEndings, Never> = Empty<SharedLocationEndings, Never>().eraseToAnyPublisher(),
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
        endings
            .sink { [weak self] endings in self?.projectEnded(endings) }
            .store(in: &cancellables)
        live.$ghosts
            .sink { [weak self] ghosts in self?.projectGhosts(ghosts) }
            .store(in: &cancellables)
    }

    /// Cette personne est-elle en pause par fantôme ?
    func ghost(for userId: String) -> SharedLocationGhostPin? {
        ghosts.first { $0.id == userId }
    }

    /// La position servie d'une personne, si elle me la partage en ce moment.
    func pin(for userId: String) -> SharedLocationPin? {
        pins.first { $0.id == userId }
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

    private var lastEndings = SharedLocationEndings()

    private func projectEnded(_ endings: SharedLocationEndings) {
        lastEndings = endings
        ended = endings.ordered.map { item in
            let person = known[item.id]
            let name = person?.name ?? String(localized: "circles.locations.someone", defaultValue: "Quelqu'un", bundle: .main)
            return SharedLocationEndedPin(id: item.id, name: name, initials: Self.initials(of: name),
                                          avatarURL: person?.avatarURL, circle: endings.circles[item.id], endedAt: item.endedAt)
        }
        let unnamed = endings.endedAt.keys.filter { known[$0] == nil }
        guard !unnamed.isEmpty else { return }
        Task { [weak self] in await self?.name(Array(unnamed)) }
    }

    private func projectGhosts(_ served: [String: SharedLocationGhost]) {
        ghosts = served.values
            .map { ghost in
                SharedLocationGhostPin(id: ghost.userId, name: known[ghost.userId]?.name ?? Self.someone, circle: ghost.circle)
            }
            .sorted { ($0.name, $0.id) < ($1.name, $1.id) }
        let unnamed = served.keys.filter { known[$0] == nil }
        guard !unnamed.isEmpty else { return }
        Task { [weak self] in await self?.name(Array(unnamed)) }
    }

    private static var someone: String {
        String(localized: "circles.locations.someone", defaultValue: "Quelqu'un", bundle: .main)
    }

    private func name(_ ids: [String]) async {
        let found = await people.people(for: ids)
        guard !found.isEmpty else { return }
        known.merge(found) { _, new in new }
        project(live.byUser)
        projectEnded(lastEndings)
        projectGhosts(live.ghosts)
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
            deadline: entry.deadline,
            avatarURL: known[userId]?.avatarURL,
            circle: entry.circle,
            updatedAt: entry.updatedAt
        )
    }

    static func initials(of name: String) -> String {
        let words = name.split(whereSeparator: \.isWhitespace).prefix(2)
        let letters = words.compactMap(\.first).map { String($0).uppercased() }.joined()
        return letters.isEmpty ? "?" : letters
    }
}
