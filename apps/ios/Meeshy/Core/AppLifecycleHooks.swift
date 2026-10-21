import UIKit
import Combine

/// **Les crochets de cycle de vie de l'APPLICATION vivent hors de toute fenêtre.**
///
/// Ils vivaient dans la fenêtre principale (`MainWindowGate`, `MeeshyApp.swift`) :
/// `adaptiveOnChange(of: scenePhase)` et `adaptiveOnChange(of: isAuthenticated)`.
/// Sur iPad, fermer la fenêtre principale en gardant une conversation détachée
/// démontait ces deux crochets avec elle :
/// - passer en arrière-plan ne suspendait plus la base ni les sockets — la
///   base écrite par un socket encore vivant dans un processus gelé, c'est le
///   `0xDEAD10CC` de #7059 — et le retour ne réarmait rien ;
/// - une session expirée dans la fenêtre détachée ne démontait rien : les clés
///   E2EE du compte sorti restaient, et le compte suivant publiait un bundle
///   tiré de SON IdentityKey.
///
/// Ici, les signaux sont ceux de l'application (`UIApplication`), une seule
/// fois par transition quelle que soit la fenêtre ouverte, et la session est
/// lue sur `AuthManager`, pas sur une vue.
@MainActor
final class AppLifecycleHooks {
    // iOS 26.1 : deinit synthétisée isolée → double-free au démontage hors tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = AppLifecycleHooks()

    struct Handlers {
        /// L'application revient au premier plan. `returnsFromBackground` est
        /// vrai seulement après un VRAI passage en arrière-plan : un aller-retour
        /// `.inactive` (centre de contrôle, bannière, Face ID) ne suspend rien,
        /// donc ne réarme rien (#11).
        var becameActive: @MainActor (_ returnsFromBackground: Bool) -> Void
        var enteredBackground: @MainActor () -> Void
        /// La session s'ouvre (`true`) ou se ferme (`false`).
        var authenticationChanged: @MainActor (_ isAuthenticated: Bool) -> Void
    }

    private var handlers: Handlers?
    private var observers: [NSObjectProtocol] = []
    private var authenticationSubscription: AnyCancellable?
    private var didEnterBackground = false
    private var deliveredAuthentication = false

    var isInstalled: Bool { handlers != nil }

    init() {}

    /// Une seule installation par processus : une seconde serait un second jeu
    /// de crochets, donc chaque transition jouée deux fois.
    ///
    /// La session est relue AU TOUR SUIVANT de la file principale, comme le
    /// faisait `onChange` : un `false` puis `true` posés dans le même tour ne
    /// sont pas une transition (le changement de compte l'espace exprès, voir
    /// `AuthManager.switchAccount`), et `@Published` émet avant d'écrire.
    func install(
        center: NotificationCenter = .default,
        authentication: AnyPublisher<Bool, Never>,
        isAuthenticated: @escaping @MainActor () -> Bool,
        handlers: Handlers
    ) {
        guard self.handlers == nil else { return }
        self.handlers = handlers
        deliveredAuthentication = isAuthenticated()
        observers = [
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: nil) { [weak self] _ in
                MainActor.assumeIsolated { self?.applicationBecameActive() }
            },
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil) { [weak self] _ in
                MainActor.assumeIsolated { self?.applicationEnteredBackground() }
            },
        ]
        authenticationSubscription = authentication
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                MainActor.assumeIsolated { self?.authenticationMayHaveChanged(to: isAuthenticated()) }
            }
    }

    private func applicationBecameActive() {
        let returns = didEnterBackground
        didEnterBackground = false
        handlers?.becameActive(returns)
    }

    private func applicationEnteredBackground() {
        didEnterBackground = true
        handlers?.enteredBackground()
    }

    private func authenticationMayHaveChanged(to value: Bool) {
        guard value != deliveredAuthentication else { return }
        deliveredAuthentication = value
        handlers?.authenticationChanged(value)
    }
}
