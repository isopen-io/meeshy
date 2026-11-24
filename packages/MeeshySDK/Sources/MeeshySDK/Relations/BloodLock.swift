import Foundation

/// LE VERROU DU SANG, tel que le serveur le SERT (#20359, #20361) : « de Sang à Sang rien ne se cache, sauf descendre ».
///
/// Les réglages par personne servent `lockedByLevel` : vrai, l'interrupteur de coupure n'existe plus (l'interface le
/// RETIRE, elle ne le grise pas) et la baisse à Proche est la seule façon de restreindre. `ritualSharesLocked` dit si la
/// position et le titre d'écoute le sont aussi : faux pour un mineur déclaré (#20408, C7), qui garde leur retrait.
/// Tout champ absent (serveur d'avant) vaut « ouvert » : le client garde son comportement d'avant.
public struct RelationBloodLock: Equatable, Sendable {
    /// Rien ne se coupe : ni batterie, ni disponibilité, ni talkie, ni Bring, ni écoute, ni activité.
    public let isLocked: Bool
    /// La position (continue, historique, proximité) et le titre d'écoute sont partagés d'office : ni demande, ni coupure.
    public let locksPositionAndTitle: Bool

    public static let open = RelationBloodLock(lockedByLevel: nil, ritualSharesLocked: nil)

    public init(lockedByLevel: Bool?, ritualSharesLocked: Bool?) {
        let locked = lockedByLevel == true
        isLocked = locked
        locksPositionAndTitle = locked && ritualSharesLocked != false
    }
}
