import SwiftUI
import MeeshySDK

// MARK: - Le portillon de sortie, posé par l'hôte et lu par les visionneuses

/// `ContentExitGate` voyage par l'environnement (#9573) : l'hôte qui présente
/// une visionneuse le pose une fois, et chaque visionneuse — image, vidéo,
/// document, code, galerie — y lit si elle rend ses boutons d'enregistrement,
/// de partage et de copie. Un bouton que le portillon refuse n'est pas rendu.
private struct ContentExitGateKey: EnvironmentKey {
    static let defaultValue = ContentExitGate.open
}

public extension EnvironmentValues {
    var contentExitGate: ContentExitGate {
        get { self[ContentExitGateKey.self] }
        set { self[ContentExitGateKey.self] = newValue }
    }
}

public extension View {
    /// Pose le portillon de sortie des visionneuses présentées sous cette vue.
    /// Une présentation plein écran ne reçoit pas toujours l'environnement de
    /// son hôte : le poser sur le CONTENU présenté.
    func contentExitGate(_ gate: ContentExitGate) -> some View {
        environment(\.contentExitGate, gate)
    }
}

/// Monte son contenu seulement si le portillon laisse sortir `contentId`.
public struct ContentExitGated<Content: View>: View {
    private let contentId: String?
    private let content: Content
    @Environment(\.contentExitGate) private var gate

    public init(contentId: String? = nil, @ViewBuilder content: () -> Content) {
        self.contentId = contentId
        self.content = content()
    }

    public var body: some View {
        if gate.mayLeave(contentId) {
            content
        }
    }
}
