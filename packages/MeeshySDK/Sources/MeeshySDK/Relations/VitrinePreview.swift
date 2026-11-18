import Foundation

/// L'aperçu de « Voir comme » (#18869) : ma Vitrine au cercle `level`.
///
/// Il se peint TOUT DE SUITE depuis la loi (`ProfileCircleView.seenAs`) — jamais de spinner, la règle
/// est toujours là — puis se corrige quand le serveur sert la vue de CE cercle (`viewAs == level`).
/// Une charge sans `viewAs`, ou celle d'un autre cran arrivée en retard, n'est jamais montrée : un
/// serveur qui ignore `as` rend ma fiche ENTIÈRE, qui passerait pour la vue d'un cercle.
public struct VitrinePreview: Sendable {

    public enum Source: String, Sendable, Equatable {
        case projected
        case served
    }

    public let level: RelationLevel
    public let source: Source
    public let seen: VitrineSeenAs
    /// La fiche que CE cercle reçoit — seulement quand le serveur l'a servie pour ce cercle.
    public let profile: PublicProfile?

    /// « En ligne » ne se montre que si le cercle ouvre la présence ET que le serveur l'a servie pour
    /// ce lecteur (préférences du propriétaire comprises) : la projection n'invente aucune présence.
    public var isOnline: Bool {
        seen.showsPresence && source == .served && profile?.user.isOnline == true
    }

    public static func make(
        level: RelationLevel,
        served: PublicProfile?,
        ownerMinor: RelationAgeClass = .unknown,
        ownerRole: PlatformRole? = nil
    ) -> VitrinePreview {
        let projected = ProfileCircleView.seenAs(level, ownerMinor: ownerMinor, ownerRole: ownerRole)
        guard let served, served.viewAs == level else {
            return VitrinePreview(level: level, source: .projected, seen: VitrineSeenAs.make(view: projected), profile: nil)
        }
        let view = served.circle ?? projected
        return VitrinePreview(level: level, source: .served, seen: VitrineSeenAs.make(view: view), profile: served)
    }
}
