import Foundation
import SwiftUI
import MeeshySDK

/// Lecteur d'un document `CanvasV3`, dans l'un des trois modes du chantier.
///
/// Le rendu n'est pas réécrit : le player enveloppe l'hôte canvas du reader
/// (`StoryReaderRepresentable`, qui monte `StoryCanvasUIView`) et lui donne la
/// scène demandée, reconstruite dans les familles runtime par le pont v3.
///
/// Paramètres opaques uniquement — l'accent arrive en hex, la chaîne du Prisme
/// arrive par `preferredContentLanguages(_:)` : aucun singleton produit ici.
public struct MeeshyScenePlayer: View {

    public let accentColorHex: String

    private let document: CanvasV3
    private let mode: ScenePlayerMode
    private let languages: [String]
    @Binding private var sceneIndex: Int
    @Binding private var isPlaying: Bool

    public init(document: CanvasV3,
                mode: ScenePlayerMode,
                sceneIndex: Binding<Int>,
                isPlaying: Binding<Bool>,
                accentColorHex: String) {
        self.init(document: document,
                  mode: mode,
                  sceneIndex: sceneIndex,
                  isPlaying: isPlaying,
                  accentColorHex: accentColorHex,
                  languages: [])
    }

    private init(document: CanvasV3,
                 mode: ScenePlayerMode,
                 sceneIndex: Binding<Int>,
                 isPlaying: Binding<Bool>,
                 accentColorHex: String,
                 languages: [String]) {
        self.document = document
        self.mode = mode
        self._sceneIndex = sceneIndex
        self._isPlaying = isPlaying
        self.accentColorHex = accentColorHex
        self.languages = languages
    }

    public var config: ScenePlayerConfig { ScenePlayerConfig(mode: mode) }

    /// Le Prisme du LECTEUR — l'ordre dans lequel l'hôte résout les traductions
    /// d'un texte (`StoryTextObject.resolvedText(preferredLanguages:)`), qui
    /// retombe sur l'original quand aucune langue ne sert.
    public func preferredContentLanguages(_ languages: [String]) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: document,
                          mode: mode,
                          sceneIndex: $sceneIndex,
                          isPlaying: $isPlaying,
                          accentColorHex: accentColorHex,
                          languages: languages)
    }

    /// Identité du média PORTEUR de la scène — la clé de continuité de lecture
    /// (O16) que la surface hôte donne à `SharedAVPlayerManager`. Le player n'a
    /// pas de player privé : il ne fabrique jamais ce temps-là lui-même.
    public nonisolated static func carrierMediaIdentity(in document: CanvasV3,
                                                        sceneIndex: Int) -> String? {
        guard document.scenes.indices.contains(sceneIndex) else { return nil }
        guard let carrier = document.scenes[sceneIndex].objects
                .filter({ $0.kind == .media && $0.plane == .content })
                .min(by: { $0.z < $1.z }) else { return nil }
        guard case .string(let identity)? = carrier.payload["postMediaId"],
              !identity.isEmpty else { return nil }
        return identity
    }

    public var body: some View {
        host
    }

    var host: StoryReaderRepresentable {
        StoryReaderRepresentable(story: storyItem,
                                 preferredLanguages: languages,
                                 mute: config.isMuted,
                                 isPaused: !isPlaying)
    }

    private var storyItem: StoryItem {
        StoryItem(id: document.scenes[safe: sceneIndex]?.id ?? "\(sceneIndex)",
                  storyEffects: StoryEffects(rendering: document, sceneIndex: sceneIndex),
                  createdAt: Date(timeIntervalSince1970: 0))
    }
}
