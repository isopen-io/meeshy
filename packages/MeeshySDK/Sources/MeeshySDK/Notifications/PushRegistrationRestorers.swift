import Foundation

/// Ce qui rend ses jetons push à la session OUVERTE quand le retrait différé
/// d'une session précédente du MÊME compte a pu les effacer côté passerelle
/// (#18911) : `DELETE /users/register-device-token` vise `{ userId, deviceId }`,
/// sans lien à la session. Le jeton APNs vit dans le SDK ; le jeton VoIP, côté
/// application, s'inscrit ici.
@MainActor
public final class PushRegistrationRestorers {
    public typealias Restorer = @MainActor @Sendable () async -> Void

    public static let shared = PushRegistrationRestorers()

    private var restorers: [Restorer] = []

    nonisolated deinit {}

    public init() {}

    public var isEmpty: Bool { restorers.isEmpty }

    public func add(_ restorer: @escaping Restorer) {
        restorers.append(restorer)
    }

    func restoreAll() async {
        for restorer in restorers {
            await restorer()
        }
    }
}
