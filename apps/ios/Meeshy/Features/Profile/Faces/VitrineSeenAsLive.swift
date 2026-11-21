import Foundation
import MeeshySDK

extension VitrineSeenAsViewModel {
    /// Le service de production : un ViewModel ne nomme pas `.shared` dans son init principal.
    convenience init(handle: String, ownerRole: PlatformRole?, initial: RelationLevel = .public) {
        self.init(handle: handle, ownerRole: ownerRole, initial: initial, service: ProfileSeenAsService.shared)
    }
}
