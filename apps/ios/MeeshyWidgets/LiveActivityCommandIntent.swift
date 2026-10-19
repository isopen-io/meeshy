import Foundation
import AppIntents

/// **Ce qu'un bouton d'une Live Activity demande à l'app** (#9782, #9783,
/// #9784) — couper le micro, raccrocher, mettre en pause, sauter, arrêter ou
/// jeter un enregistrement.
///
/// Compilé dans les DEUX cibles (`project.yml`). Une `LiveActivityIntent`
/// s'exécute dans le processus de l'APP, même quand le bouton est touché dans
/// l'îlot ou sur l'écran verrouillé : l'extension ne fait que la déclarer, et
/// l'app branche `LiveActivityCommandRouter.handler` au démarrage. Sans
/// handler (extension, app pas encore prête), la commande est sans effet —
/// jamais une action devinée.
nonisolated enum LiveActivityCommand: String, Codable, Hashable, Sendable, CaseIterable {
    case callToggleMute
    case callHangUp
    case playbackToggle
    case playbackBack
    case playbackForward
    case recordingStop
    case recordingCancel
}

@MainActor
enum LiveActivityCommandRouter {
    static var handler: ((LiveActivityCommand) -> Void)?

    @discardableResult
    static func dispatch(_ command: LiveActivityCommand) -> Bool {
        guard let handler else { return false }
        handler(command)
        return true
    }
}

@available(iOS 17.0, *)
struct LiveActivityCommandIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Meeshy"
    static let isDiscoverable = false

    @Parameter(title: "Command")
    var command: String

    init() {
        command = ""
    }

    init(_ command: LiveActivityCommand) {
        self.command = command.rawValue
    }

    @MainActor
    func perform() async throws -> some IntentResult {
        if let command = LiveActivityCommand(rawValue: command) {
            LiveActivityCommandRouter.dispatch(command)
        }
        return .result()
    }
}
