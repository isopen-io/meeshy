import Foundation
import os

/// Fermeture de session côté serveur, au mieux, avec réessais bornés.
enum AuthServerLogout {
    /// Délais avant chaque tentative : total ≈ 6 s d'horloge.
    static let defaultDelays: [TimeInterval] = [0, 1, 5]

    private enum Outcome {
        case done
        /// 401 : CE jeton ne vaut plus rien, sa session est déjà close.
        case refused
        case exhausted
        case cancelled
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
        unregisteringPushDevice deviceId: String? = nil,
        delays: [TimeInterval] = defaultDelays
    ) async {
        if let deviceId {
            let unregistration = await attempt("Push device unregistration", delays: delays) {
                try await authService.unregisterPushDevice(deviceId: deviceId, token: token)
            }
            switch unregistration {
            case .refused, .cancelled: return
            case .done, .exhausted: break
            }
        }
        let closure = await attempt("Server logout", delays: delays) {
            try await authService.logoutThrowing(token: token)
        }
        if case .exhausted = closure {
            Logger.auth.error("Server logout exhausted retries — session may linger on gateway")
        }
    }

    private static func attempt(
        _ label: String,
        delays: [TimeInterval],
        _ operation: () async throws -> Void
    ) async -> Outcome {
        for delay in delays {
            if delay > 0 {
                do {
                    try await Task.sleep(for: .seconds(delay))
                } catch {
                    return .cancelled
                }
            }
            do {
                try await operation()
                return .done
            } catch let error as MeeshyError {
                // #10463 — un 401 dit que CE jeton ne vaut plus rien : sa session
                // est déjà close ou invalide. Le réessayer ne fermerait rien.
                if case .auth = error {
                    Logger.auth.info("\(label, privacy: .public) refused the token: its session is already closed")
                    return .refused
                }
                Logger.auth.warning("\(label, privacy: .public) attempt failed: \(error.localizedDescription)")
            } catch {
                Logger.auth.warning("\(label, privacy: .public) attempt failed: \(error.localizedDescription)")
            }
        }
        return .exhausted
    }
}
