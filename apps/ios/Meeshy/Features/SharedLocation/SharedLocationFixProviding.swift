import Combine
import Foundation
import MeeshySDK

/// Ce que l'appareil rend quand on lui demande où il est.
enum SharedLocationFixResult: Equatable {
    case fix(SharedLocationFix)
    case denied
    case unavailable
}

/// La source des relevés de l'appareil. L'app la tient de CoreLocation (`SharedLocationFixSource`) ; un témoin la simule.
@MainActor
protocol SharedLocationFixProviding: AnyObject {
    var fixes: AnyPublisher<SharedLocationFix, Never> { get }
    /// Un relevé, demandant la permission « pendant l'utilisation » si elle n'a pas encore été donnée.
    func currentFix() async -> SharedLocationFixResult
    /// Un relevé SANS jamais demander la permission (#18714) : un retrait ou une échéance ne la fait pas surgir. `nil`
    /// tant que la localisation « pendant l'utilisation » n'est pas déjà accordée, ou sans relevé.
    func silentFix() async -> SharedLocationFix?
    func follow()
    func stopFollowing()
}
