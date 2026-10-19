@preconcurrency import UserNotifications

// MARK: - Delivered banners (couture système)

/// Une bannière DÉJÀ LIVRÉE, réduite à ce dont le retrait a besoin : son
/// identifiant de requête et le `userInfo` que le prédicat interroge.
nonisolated struct DeliveredBanner: @unchecked Sendable {
    let identifier: String
    let userInfo: [AnyHashable: Any]

    /// Le FIL sous lequel iOS a rangé la bannière — ce que la NSE pose dans
    /// `applyThreading(to:)` (#6999).
    ///
    /// Le `userInfo` ne suffit pas : c'est le `threadIdentifier` qui dit ce
    /// qu'iOS a REGROUPÉ, et une bannière peut y être rangée sans que la
    /// charge ait porté la clé que le prédicat interroge. Interroger les deux
    /// est strictement plus large, jamais moins.
    let threadIdentifier: String

    init(identifier: String, userInfo: [AnyHashable: Any], threadIdentifier: String = "") {
        self.identifier = identifier
        self.userInfo = userInfo
        self.threadIdentifier = threadIdentifier
    }
}

/// #3896 — seam over `UNUserNotificationCenter`'s two delivered-banner
/// operations, abstracted at the `DeliveredBanner` boundary rather than raw
/// `UNNotification` : `UNNotification` has no public initializer, so a test
/// spy could never construct one to stand in for a delivered banner.
/// `UNUserNotificationCenter` conforms via the extension below (its native
/// `getDeliveredNotifications`/`removeDeliveredNotifications` do the real
/// work) ; `MockUNUserNotificationCenter` (tests) is the spy that lets a test
/// exercise `DeliveredBannerCenter.system()` — the DEFAULT closures, not just
/// an injected substitute — without touching the real system center.
/// `nonisolated` on every requirement AND on the conformance below — this
/// app target compiles under `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`
/// (`apps/ios/CLAUDE.md`, App Extensions §), so an unmarked declaration here
/// would silently become `@MainActor`-isolated and fail to compile from the
/// genuinely `@Sendable`, actor-agnostic closures of `DeliveredBannerCenter`
/// below (some of which run inside `Task.detached`).
protocol UNUserNotificationCenterProviding {
    nonisolated func getDeliveredBanners(completionHandler: @escaping @Sendable ([DeliveredBanner]) -> Void)
    nonisolated func removeDeliveredNotifications(withIdentifiers identifiers: [String])
}

extension UNUserNotificationCenter: UNUserNotificationCenterProviding {
    nonisolated func getDeliveredBanners(completionHandler: @escaping @Sendable ([DeliveredBanner]) -> Void) {
        getDeliveredNotifications { notifications in
            completionHandler(notifications.map {
                DeliveredBanner(
                    identifier: $0.request.identifier,
                    userInfo: $0.request.content.userInfo,
                    threadIdentifier: $0.request.content.threadIdentifier
                )
            })
        }
    }
}

/// Les trois gestes que le retrait de bannières fait sur `UNUserNotificationCenter` :
/// LIRE les livrées, en RETIRER — et RELIRE pour prouver que le retrait a pris.
///
/// Couture explicite (mêmes clôtures injectables que le reste du handler) parce
/// que la troisième capacité est ce qui distingue une émission d'un effet, et
/// qu'aucun test ne peut l'observer sur le centre réel.
nonisolated struct DeliveredBannerCenter: Sendable {
    let delivered: @Sendable (@escaping @Sendable ([DeliveredBanner]) -> Void) -> Void
    let remove: @Sendable ([String]) -> Void

    /// `notificationCenter` is a FACTORY, not a stored value — called fresh
    /// inside each closure, exactly like the previous `UNUserNotificationCenter
    /// .current()` call it replaces. Preserving that shape (rather than taking
    /// an instance parameter and capturing it) is what keeps `delivered`/
    /// `remove` genuinely `@Sendable`: the factory closure's own capture list
    /// is empty for the default (`UNUserNotificationCenter.current` is a type
    /// reference, not a captured value), and a test's `{ mock }` only needs
    /// its `MockUNUserNotificationCenter` to itself be `@unchecked Sendable`
    /// (same pattern as `SpyBannerCenter` below) — never `UNUserNotificationCenter`
    /// (non-Sendable) crossing the boundary.
    ///
    /// A function (not a stored `static let`) so a test can pass a
    /// `MockUNUserNotificationCenter` and exercise these exact closures — the
    /// DEFAULT wiring, not a hand-rolled substitute that could silently drift
    /// from what production actually calls.
    static func system(
        notificationCenter: @escaping @Sendable () -> UNUserNotificationCenterProviding = { UNUserNotificationCenter.current() }
    ) -> DeliveredBannerCenter {
        DeliveredBannerCenter(
            delivered: { completion in
                notificationCenter().getDeliveredBanners(completionHandler: completion)
            },
            remove: { identifiers in
                notificationCenter().removeDeliveredNotifications(withIdentifiers: identifiers)
            }
        )
    }

    func deliveredIdentifiers() async -> Set<String> {
        await withCheckedContinuation { (continuation: CheckedContinuation<Set<String>, Never>) in
            delivered { continuation.resume(returning: Set($0.map(\.identifier))) }
        }
    }
}
