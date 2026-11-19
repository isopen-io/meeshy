import Foundation

/// « VOIR COMME » (#18869, planche `Moi-Apercu`) : ce que ma Vitrine montre à un lecteur d'un cercle,
/// ce qu'elle lui ferme et le cercle qui l'ouvrirait.
///
/// Règle pure, lue dans la fiche par cercle (servie, ou projetée par `ProfileCircleView.seenAs`) : elle
/// ne compare aucun niveau elle-même. Une capacité ABSENTE de la fiche se lit fermée — la rangée
/// verrouillée dit alors le plancher de la loi —, jamais ouverte. Une rangée verrouillée ne porte
/// que son nom et le cercle qui l'ouvre : aucune valeur, aucun champ voisin.
public struct VitrineSeenAs: Sendable, Equatable {

    /// Les rangées gardées de la Vitrine, dans l'ordre où « Masqué à ce niveau » les liste.
    public enum Row: String, CaseIterable, Sendable {
        case presence
        case game
        case sparks
        case device
        case liveLocation

        public var capability: ProfileCapability {
            switch self {
            case .presence: return .presence
            case .game: return .game
            case .sparks: return .gameSparks
            case .device: return .battery
            case .liveLocation: return .locationLive
            }
        }
    }

    public struct LockedRow: Sendable, Equatable, Identifiable {
        public let row: Row
        public let opensAt: RelationLevel
        public var id: Row { row }

        public init(row: Row, opensAt: RelationLevel) {
            self.row = row
            self.opensAt = opensAt
        }
    }

    /// Le geste que la Vitrine offre à ce lecteur pour me joindre.
    public enum Contact: String, Sendable, Equatable {
        case write
        case requestToWrite
        case unavailable
    }

    public let level: RelationLevel
    public let contact: Contact
    public let showsPresence: Bool
    public let showsGame: Bool
    public let lockedRows: [LockedRow]

    public static func make(view: ProfileCircleView) -> VitrineSeenAs {
        let isOpen: (ProfileCapability) -> Bool = { view.state(of: $0)?.isOpen == true }
        let locked = Row.allCases.compactMap { row -> LockedRow? in
            guard !isOpen(row.capability) else { return nil }
            let opensAt = view.state(of: row.capability)?.circle ?? row.capability.feature.minimumLevel
            return LockedRow(row: row, opensAt: opensAt)
        }
        return VitrineSeenAs(
            level: view.level,
            contact: isOpen(.directMessage) ? .write : (isOpen(.messageRequest) ? .requestToWrite : .unavailable),
            showsPresence: isOpen(.presence),
            showsGame: isOpen(.game),
            lockedRows: locked
        )
    }
}

/// « Ce que chaque cercle ajoute » : de Public à Sang, les features que la loi ouvre à CE niveau
/// (`RelationFeature.minimumLevel`) — l'échelle se lit dans la loi, jamais dans une liste à la main.
public enum VitrineLadder {

    public struct Step: Sendable, Equatable, Identifiable {
        public let level: RelationLevel
        public let features: [RelationFeature]
        public var id: RelationLevel { level }
    }

    /// Ce qui ne s'annonce pas sur l'échelle : la mécanique (Connaissance automatique, relais, avis de
    /// nouveauté, audiences), ce qu'une autre ligne dit déjà (sonner suit la demande, tirer la batterie
    /// suit la batterie) et ce qui ne se voit pas (ne pas déranger).
    public static let unannounced: Set<RelationFeature> = [
        .acquaintanceAuto, .relayCommentersOnMyPosts, .relayMyCommentsElsewhere, .notifyNewContent,
        .presenceDnd, .audienceClose, .audienceBlood, .deviceBatteryPull, .callRing,
        .safetyInactivity,
        .deviceCall,
    ]

    public static let steps: [Step] = RelationLevel.allCases.map { level in
        Step(level: level, features: RelationFeature.allCases.filter {
            $0.minimumLevel == level && !unannounced.contains($0)
        })
    }

    /// Le cran est atteint par le cercle vu : il s'allume sur l'échelle.
    public static func isReached(_ level: RelationLevel, seenAs seen: RelationLevel) -> Bool {
        level <= seen
    }
}

extension VitrineSeenAs {

    /// Mes adresses telles qu'un lecteur du cercle `level` les lit sur ma Vitrine (#19555, planche `Mes-Adresses`) :
    /// celles que j'affiche et dont le cercle s'ouvre à ce niveau, dans l'ordre de ma liste. Un cercle illisible ne
    /// s'ouvre à personne — jamais Public.
    public static func addresses(_ addresses: [ProfileAddress], by level: RelationLevel) -> [ProfileAddress] {
        addresses.filter { address in
            guard address.isShown, let floor = address.circle else { return false }
            return level >= floor
        }
    }
}
