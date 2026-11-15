import UIKit

/// Identifiant d'une tâche d'arrière-plan, détaché d'`UIBackgroundTaskIdentifier`
/// pour franchir les frontières d'isolation sans dépendre de son annotation
/// `Sendable` dans le SDK UIKit. `0` est `UIBackgroundTaskInvalid`.
public struct BackgroundTaskToken: Sendable, Hashable {
    public let rawValue: Int

    public init(rawValue: Int) {
        self.rawValue = rawValue
    }

    public static let invalid = BackgroundTaskToken(rawValue: 0)
}

/// Couture de `UIApplication.beginBackgroundTask(withName:expirationHandler:)`
/// pour `TusUploadManager` (#9875) : le témoin déclenche l'expiration sans
/// application hôte. Tout est sur le fil principal, comme UIKit l'exige — et
/// c'est ce qui rend la fin unique sans verrou (`BackgroundTaskLease`).
public protocol BackgroundTaskProviding: Sendable {
    @MainActor
    func beginBackgroundTask(
        withName name: String,
        expirationHandler: @escaping @MainActor @Sendable () -> Void
    ) -> BackgroundTaskToken

    @MainActor
    func endBackgroundTask(_ token: BackgroundTaskToken)
}

public struct UIApplicationBackgroundTaskProvider: BackgroundTaskProviding {
    public init() {}

    @MainActor
    public func beginBackgroundTask(
        withName name: String,
        expirationHandler: @escaping @MainActor @Sendable () -> Void
    ) -> BackgroundTaskToken {
        let identifier = UIApplication.shared.beginBackgroundTask(withName: name) {
            MainActor.assumeIsolated { expirationHandler() }
        }
        return BackgroundTaskToken(rawValue: identifier.rawValue)
    }

    @MainActor
    public func endBackgroundTask(_ token: BackgroundTaskToken) {
        guard token != .invalid else { return }
        UIApplication.shared.endBackgroundTask(UIBackgroundTaskIdentifier(rawValue: token.rawValue))
    }
}

/// Une tâche d'arrière-plan qui se termine UNE fois, quel que soit le chemin :
/// succès, échec, annulation ou expiration. Le gestionnaire d'expiration est
/// appelé par UIKit sur le fil principal et doit terminer la tâche AVANT de
/// rendre la main, faute de quoi le système tue l'application : il le fait ici
/// de façon synchrone, sans attendre aucun acteur.
///
/// Le point de reprise TUS n'a pas à être écrit à ce moment-là : il l'est déjà
/// après chaque tronçon accepté par le serveur (`updateOffset`). Écrire en base
/// APRÈS la fin de la tâche exposerait au contraire à une suspension pendant
/// une écriture SQLite (terminaison `0xdead10cc`).
@MainActor
final class BackgroundTaskLease {
    private let provider: any BackgroundTaskProviding
    private var token: BackgroundTaskToken = .invalid
    private var ended = false
    private var cancelWork: (@Sendable () -> Void)?
    private(set) var expired = false

    init(provider: any BackgroundTaskProviding) {
        self.provider = provider
    }

    nonisolated deinit {}

    /// Prise AVANT que le travail démarre : aucun octet ne part hors tâche.
    func begin(named name: String) {
        token = provider.beginBackgroundTask(withName: name) { [weak self] in
            guard let self else { return }
            self.expired = true
            self.cancelWork?()
            self.cancelWork = nil
            self.end()
        }
        if expired { end() }
    }

    /// Le travail à annuler à l'expiration. Déjà expirée : annulé sur-le-champ.
    func cancelOnExpiration(_ cancel: @escaping @Sendable () -> Void) {
        guard !expired else {
            cancel()
            return
        }
        cancelWork = cancel
    }

    /// Rend `true` si la tâche a expiré avant cette fin.
    @discardableResult
    func end() -> Bool {
        cancelWork = nil
        guard !ended, token != .invalid else { return expired }
        ended = true
        provider.endBackgroundTask(token)
        return expired
    }
}
