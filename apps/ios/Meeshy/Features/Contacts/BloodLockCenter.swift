import Combine
import Foundation
import MeeshySDK

/// Qui sait si le verrou du Sang tient pour une personne (#20359, #20361).
@MainActor
protocol BloodLockProviding: AnyObject {
    /// Le verrou connu ; `.open` tant que le serveur n'a rien servi (un serveur d'avant, ou pas encore lu).
    func lock(for userId: String) -> RelationBloodLock
    /// Relit le verrou (`GET /relations/:userId/settings`) ; un échec garde ce qui était connu.
    @discardableResult func refresh(_ userId: String) async -> RelationBloodLock
    func record(_ lock: RelationBloodLock, for userId: String)
}

/// Le verrou du Sang par personne, tel que la passerelle le SERT : les surfaces qui proposent ou demandent un partage
/// (position, batterie, disponibilité…) le lisent ici pour être ABSENTES d'un Sang verrouillé — jamais grisées.
/// Rien n'est déduit du niveau : sans `lockedByLevel` servi, le comportement d'avant tient.
@MainActor
final class BloodLockCenter: ObservableObject, BloodLockProviding {

    @Published private(set) var locks: [String: RelationBloodLock] = [:]
    private let service: BringProviding

    nonisolated deinit {}

    init(service: BringProviding = BringService.shared) {
        self.service = service
    }

    func lock(for userId: String) -> RelationBloodLock {
        locks[userId.lowercased()] ?? .open
    }

    @discardableResult
    func refresh(_ userId: String) async -> RelationBloodLock {
        guard let served = try? await service.personSettings(userId: userId) else { return lock(for: userId) }
        record(served.bloodLock, for: userId)
        return served.bloodLock
    }

    func record(_ lock: RelationBloodLock, for userId: String) {
        let id = userId.lowercased()
        guard locks[id] != lock else { return }
        locks[id] = lock
    }
}

/// Le centre du compte connecté : un autre compte repart sans verrou connu.
enum BloodLockHolder {
    private static var current: (userId: String, center: BloodLockCenter)?

    @MainActor
    static func center() -> BloodLockCenter {
        let userId = AuthManager.shared.currentUser?.id ?? ""
        if let current, current.userId == userId { return current.center }
        let center = BloodLockCenter()
        current = (userId, center)
        return center
    }
}

/// Les mots du Sang verrouillé (sept langues dans `Localizable.xcstrings`).
enum BloodLockWording {
    static var restrictAction: String {
        String(localized: "circles.bloodLocked.restrict.action", defaultValue: "Redescendre à Proche", bundle: .main)
    }
    static var lockedNotice: String {
        String(localized: "circles.bloodLocked.notice", defaultValue: "Entre Sangs, tout se partage. Pour restreindre, redescends-la à Proche.", bundle: .main)
    }
}
