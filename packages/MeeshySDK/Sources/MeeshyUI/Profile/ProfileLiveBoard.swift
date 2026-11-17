import SwiftUI
import MeeshySDK

// MARK: - « En direct · Entre Proches » sur la Vitrine d'un autre (#19416, planches `Autre-Vitrine`, `Etat-HorsLigne`)
//
// Le lieu servi, la batterie et le téléphone joignable, en tuiles. Le bloc n'existe que dès Proche : sous ce cercle,
// rien — ni le titre, ni une tuile vide qui dirait qu'il y aurait quelque chose (loi 4, loi 10). Le SDK ne sait pas
// lire ces états : l'app les lit (cercle, positions, batterie, injoignabilité) et remet des VALEURS.

/// Ce que dit le bloc « En direct » : seulement ce qui est servi, au cercle qui l'ouvre.
public nonisolated struct ProfileLiveBoard: Equatable, Sendable {

    public nonisolated struct Place: Equatable, Sendable {
        public let name: String
        public let detail: String

        public init(name: String, detail: String) {
            self.name = name
            self.detail = detail
        }
    }

    public nonisolated struct Battery: Equatable, Sendable {
        public let level: Int
        public let isCharging: Bool

        public init(level: Int, isCharging: Bool) {
            self.level = min(max(level, 0), 100)
            self.isCharging = isCharging
        }
    }

    public nonisolated enum Phone: Equatable, Sendable {
        case reachable
        case unreachable(since: Date)
    }

    /// Le cercle qui ouvre le bloc : Proche (`device.battery`, `device.unreachable`).
    public static let minimumLevel: RelationLevel = .close

    public let place: Place?
    public let battery: Battery?
    public let phone: Phone?
    /// L'humeur affichée sous son nom, reprise dans « Dernières infos » hors ligne seulement (planche `Etat-HorsLigne`).
    public let mood: String?
    /// L'âge de ce qu'on lit quand la fiche vient du cache faute de réseau ; `nil` en direct.
    public let staleAge: TimeInterval?

    public var isStale: Bool { staleAge != nil }

    public init(place: Place?, battery: Battery?, phone: Phone?, mood: String? = nil, staleAge: TimeInterval?) {
        self.place = place
        self.battery = battery
        self.phone = phone
        self.mood = mood
        self.staleAge = staleAge
    }

    /// `nil` sous Proche, et quand rien n'est servi. « Joignable » ne s'affirme qu'en direct, sur une présence
    /// « en ligne » ; un épisode d'injoignabilité servi se dit toujours, daté. L'humeur ne rejoint le bloc qu'hors
    /// ligne : en direct, elle se lit déjà sous le nom.
    public static func resolve(level: RelationLevel,
                               place: Place?,
                               battery: Battery?,
                               unreachableSince: Date?,
                               isOnline: Bool,
                               staleAge: TimeInterval?,
                               mood: String? = nil) -> ProfileLiveBoard? {
        guard level >= minimumLevel else { return nil }
        let phone: Phone? = unreachableSince.map { Phone.unreachable(since: $0) }
            ?? (isOnline && staleAge == nil ? .reachable : nil)
        let staleMood = staleAge == nil ? nil : mood.flatMap { $0.isEmpty ? nil : $0 }
        guard place != nil || battery != nil || phone != nil || staleMood != nil else { return nil }
        return ProfileLiveBoard(place: place, battery: battery, phone: phone, mood: staleMood,
                                staleAge: staleAge.map { max(0, $0) })
    }
}

/// Ce que la fiche remet à l'app pour lire « En direct » : qui, sa présence servie, l'âge de la fiche hors ligne, la
/// teinte, et l'ouverture de la carte quand la fiche sait l'ouvrir.
public struct ProfileLiveRequest {
    public let userId: String
    public let displayName: String
    public let isOnline: Bool
    public let staleAge: TimeInterval?
    public let tint: Color
    public let openMap: (() -> Void)?
    /// L'humeur que la fiche montre sous son nom ; `nil` sans humeur, ou quand la fiche ne la montre pas.
    public let mood: String?

    public init(userId: String, displayName: String, isOnline: Bool, staleAge: TimeInterval?, tint: Color,
                openMap: (() -> Void)?, mood: String? = nil) {
        self.userId = userId
        self.displayName = displayName
        self.isOnline = isOnline
        self.staleAge = staleAge
        self.tint = tint
        self.openMap = openMap
        self.mood = mood
    }
}

/// L'emplacement « En direct » de la Vitrine d'un autre, fourni par l'app ; `nil` : la Vitrine ne le pose pas.
public struct ProfileLiveSection {
    public let build: (ProfileLiveRequest) -> AnyView

    public init(build: @escaping (ProfileLiveRequest) -> AnyView) {
        self.build = build
    }
}

private struct ProfileLiveSectionKey: EnvironmentKey {
    static let defaultValue: ProfileLiveSection? = nil
}

public extension EnvironmentValues {
    var profileLiveSection: ProfileLiveSection? {
        get { self[ProfileLiveSectionKey.self] }
        set { self[ProfileLiveSectionKey.self] = newValue }
    }
}

/// La place du bloc dans la Vitrine : elle tient l'ouverture de la carte en plein écran, comme « Où il est ».
struct ProfileLiveSlot: View {
    let section: ProfileLiveSection
    let request: ProfileLiveRequest
    let map: ProfileLocationMap?
    let mapRequest: ProfileLocationMapRequest?

    @State private var isMapOpen = false

    var body: some View {
        section.build(ProfileLiveRequest(
            userId: request.userId, displayName: request.displayName, isOnline: request.isOnline,
            staleAge: request.staleAge, tint: request.tint,
            openMap: map != nil && mapRequest != nil ? { isMapOpen = true } : nil,
            mood: request.mood
        ))
        .fullScreenCover(isPresented: $isMapOpen) {
            if let map, let mapRequest { map.destination(mapRequest) }
        }
    }
}
