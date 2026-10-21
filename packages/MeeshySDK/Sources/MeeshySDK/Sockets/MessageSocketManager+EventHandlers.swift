import Foundation
import SocketIO

extension MessageSocketManager {

    // MARK: - Event Handlers

    /// Inscrit l'écouteur d'erreur du transport, puis la table du contrat entrant (`MessageSocketRoutes`).
    func setupMessageEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .error) { [weak self] data, _ in
            // Never force a logout from a socket error (#10442: a guest's ended session stops the transport). Loose string
            // matching on error payloads produced false positives that kicked
            // the user out on transient failures. Socket.IO's built-in
            // reconnect loop will retry; the APIClient 401 path (which calls
            // `AuthManager.handleUnauthorized`) is the only place that can
            // trigger a silent token refresh, and even that preserves the
            // session on failure.
            self?.handleSocketError(data)
        }

        registerActivitySignalLifecycle(on: socket)
        socket.install(MessageSocketRoutes.all(for: self, presentedToken: handshakeToken))
    }
}
