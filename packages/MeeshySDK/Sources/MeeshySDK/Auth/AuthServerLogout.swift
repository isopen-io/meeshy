import Foundation
import os

/// Fermeture de session côté serveur, au mieux, avec réessais bornés.
enum AuthServerLogout {
    /// D5 — best-effort server logout with bounded retries. Returns once
    /// the server has acked OR after 3 attempts (10s total) have failed.
    /// The local logout state is already gone by the time this runs, so
    /// failures are tolerated — the worst case is the gateway sees the
    /// next request, fails token verification, and lazily kills the
    /// session.
    static func run(token: String, using authService: AuthServiceProviding) async {
        let delays: [TimeInterval] = [0, 1, 5] // total ≈ 6s wall-clock
        for delay in delays {
            if delay > 0 {
                do {
                    try await Task.sleep(for: .seconds(delay))
                } catch {
                    return // Task cancelled
                }
            }
            do {
                try await authService.logoutThrowing(token: token)
                return
            } catch let error as MeeshyError {
                // #10463 — un 401 dit que CE jeton ne vaut plus rien : sa session
                // est déjà close ou invalide. Le réessayer ne fermerait rien.
                if case .auth = error {
                    Logger.auth.info("Server logout refused the token: its session is already closed")
                    return
                }
                Logger.auth.warning("Server logout attempt failed: \(error.localizedDescription)")
            } catch {
                Logger.auth.warning("Server logout attempt failed: \(error.localizedDescription)")
            }
        }
        Logger.auth.error("Server logout exhausted retries — session may linger on gateway")
    }
}
