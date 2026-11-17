import Foundation
import os

/// L'appareil dont la sortie de session retire les jetons push (#18911).
///
/// Le retrait vise `{ userId, deviceId }`, sans lien à la session : parti sous le
/// jeton sortant après que le MÊME compte s'est reconnecté, il effacerait les
/// jetons de la nouvelle session. D'où les trois questions que la sortie pose
/// autour de lui.
struct PushDeviceRelease: Sendable {
    let deviceId: String
    /// Rend la main quand les POST d'enregistrement en vol ont abouti (borné) :
    /// une passerelle antérieure à #18910 en validerait un APRÈS le retrait.
    var settleRegistrations: @MainActor @Sendable () async -> Void = {}
    /// Vrai dès qu'une NOUVELLE session du compte quitté est ouverte sur l'appareil.
    var sessionReopened: @MainActor @Sendable () -> Bool = { false }
    /// Reposte les jetons de cette session, sans cooldown.
    var restoreRegistrations: @MainActor @Sendable () async -> Void = {}
}

/// Fermeture de session côté serveur, au mieux, avec réessais bornés.
enum AuthServerLogout {
    /// Délais avant chaque tentative : total ≈ 6 s d'horloge.
    static let defaultDelays: [TimeInterval] = [0, 1, 5]

    /// L'attente maximale des POST d'enregistrement en vol avant le retrait :
    /// au démarrage à froid, un POST en prend 9 à 14.
    static let registrationsSettleLimit: Duration = .seconds(15)

    private enum Outcome {
        case done
        /// 401 : CE jeton ne vaut plus rien, sa session est déjà close.
        case refused
        case exhausted
        case cancelled
        /// Une session du même compte s'est rouverte : le retrait s'arrête.
        case abandoned
    }

    private struct Attempts {
        let outcome: Outcome
        let sent: Int
    }

    /// D5 — best-effort server logout with bounded retries. Returns once
    /// the server has acked OR after 3 attempts (10s total) have failed.
    /// The local logout state is already gone by the time this runs, so
    /// failures are tolerated — the worst case is the gateway sees the
    /// next request, fails token verification, and lazily kills the
    /// session.
    ///
    /// #18911 (ios-systeme-1) — avec `unregisteringPushDevice`, les jetons push
    /// de l'installation (APNs et VoIP) sont retirés D'ABORD, sous le jeton
    /// encore valide, dans la même tâche et avec les mêmes reprises : une fois
    /// la session close, son JWT serait refusé. Un échec définitif du retrait
    /// ne retient pas la fermeture. Sans `unregisteringPushDevice` (une session
    /// refusée n'a jamais enregistré l'appareil), seule la session se ferme.
    static func run(
        token: String,
        using authService: AuthServiceProviding,
        unregisteringPushDevice device: PushDeviceRelease? = nil,
        delays: [TimeInterval] = defaultDelays
    ) async {
        if let device {
            guard await release(device, token: token, using: authService, delays: delays) else { return }
        }
        let closure = await attempt("Server logout", delays: delays, abandoningWhen: { false }) {
            try await authService.logoutThrowing(token: token)
        }
        if case .exhausted = closure.outcome {
            Logger.auth.error("Server logout exhausted retries — session may linger on gateway")
        }
    }

    /// Retire les jetons de l'appareil. `false` : la session est déjà close (401)
    /// ou la sortie annulée — il n'y a plus rien à fermer.
    ///
    /// Avant chaque tentative, le retrait s'abandonne si le compte quitté a rouvert
    /// une session. Si une tentative est partie et qu'une session est rouverte au
    /// bout du compte, la passerelle a pu effacer ses jetons : on les lui rend.
    private static func release(
        _ device: PushDeviceRelease,
        token: String,
        using authService: AuthServiceProviding,
        delays: [TimeInterval]
    ) async -> Bool {
        await device.settleRegistrations()
        let unregistration = await attempt(
            "Push device unregistration", delays: delays, abandoningWhen: device.sessionReopened
        ) {
            try await authService.unregisterPushDevice(deviceId: device.deviceId, token: token)
        }
        if unregistration.sent > 0, await device.sessionReopened() {
            Logger.auth.info("The leaving account reopened a session during the push device release — restoring its registrations")
            await device.restoreRegistrations()
        }
        switch unregistration.outcome {
        case .refused, .cancelled: return false
        case .done, .exhausted, .abandoned: return true
        }
    }

    /// Une NOUVELLE session du compte quitté est ouverte : le retrait sous l'ancien
    /// jeton effacerait les siens. Un AUTRE compte ne l'arrête pas — le retrait ne
    /// touche que les lignes du compte quitté.
    static func isSessionReopened(
        activeUserId: String?,
        authToken: String?,
        leavingUserId: String,
        leavingToken: String
    ) -> Bool {
        guard let authToken, activeUserId == leavingUserId else { return false }
        return authToken != leavingToken
    }

    /// #18911 (ios-systeme-1) — la sortie de session d'un compte qu'on QUITTE :
    /// les jetons push de l'installation partent d'abord, la session se ferme
    /// ensuite. Distincte de `run(token:using:)` seul, qui referme une session que
    /// l'appareil n'a jamais adoptée (preuve par lien refusée) : sans jeton à
    /// retirer, voire retirant ceux du compte ouvert si c'était le même.
    ///
    /// Une tâche d'arrière-plan la tient jusqu'au bout : sans elle, une app mise
    /// en arrière-plan sur une route lente était suspendue avant `POST
    /// /auth/logout`, et la session serveur restait ouverte jusqu'à la reprise.
    @MainActor
    static func endSession(
        token: String,
        using authService: AuthServiceProviding,
        keychain: any KeychainStoring,
        sessionReopened: @escaping @MainActor @Sendable () -> Bool,
        backgroundTasks: any BackgroundTaskProviding = UIApplicationBackgroundTaskProvider(),
        delays: [TimeInterval] = defaultDelays
    ) async {
        let lease = BackgroundTaskLease(provider: backgroundTasks)
        lease.begin(named: "meeshy.session-end")
        defer { lease.end() }
        let settleLimit = registrationsSettleLimit
        let device = PushDeviceIdentity.current(keychain: keychain).deviceId.map { deviceId in
            PushDeviceRelease(
                deviceId: deviceId,
                settleRegistrations: { await PushRegistrationsInFlight.shared.settle(within: settleLimit) },
                sessionReopened: sessionReopened,
                restoreRegistrations: {
                    await PushNotificationManager.shared.restoreRegistration()
                    await PushRegistrationRestorers.shared.restoreAll()
                }
            )
        }
        await run(token: token, using: authService, unregisteringPushDevice: device, delays: delays)
    }

    /// La sortie de session de `manager`, qui sait si le compte quitté a rouvert
    /// une session pendant le retrait de ses jetons.
    @MainActor
    static func endSession(of manager: AuthManager, leavingUserId: String, token: String) async {
        await endSession(
            token: token,
            using: manager.authService,
            keychain: manager.keychain,
            sessionReopened: { [weak manager] in
                isSessionReopened(
                    activeUserId: manager?.activeUserId,
                    authToken: APIClient.shared.authToken,
                    leavingUserId: leavingUserId,
                    leavingToken: token
                )
            }
        )
    }

    private static func attempt(
        _ label: String,
        delays: [TimeInterval],
        abandoningWhen shouldAbandon: @MainActor @Sendable () -> Bool,
        _ operation: () async throws -> Void
    ) async -> Attempts {
        var sent = 0
        for delay in delays {
            if delay > 0 {
                do {
                    try await Task.sleep(for: .seconds(delay))
                } catch {
                    return Attempts(outcome: .cancelled, sent: sent)
                }
            }
            if await shouldAbandon() {
                Logger.auth.info("\(label, privacy: .public) abandoned: the leaving account reopened a session")
                return Attempts(outcome: .abandoned, sent: sent)
            }
            sent += 1
            do {
                try await operation()
                return Attempts(outcome: .done, sent: sent)
            } catch let error as MeeshyError {
                // #10463 — un 401 dit que CE jeton ne vaut plus rien : sa session
                // est déjà close ou invalide. Le réessayer ne fermerait rien.
                if case .auth = error {
                    Logger.auth.info("\(label, privacy: .public) refused the token: its session is already closed")
                    return Attempts(outcome: .refused, sent: sent)
                }
                Logger.auth.warning("\(label, privacy: .public) attempt failed: \(error.localizedDescription)")
            } catch {
                Logger.auth.warning("\(label, privacy: .public) attempt failed: \(error.localizedDescription)")
            }
        }
        return Attempts(outcome: .exhausted, sent: sent)
    }
}
