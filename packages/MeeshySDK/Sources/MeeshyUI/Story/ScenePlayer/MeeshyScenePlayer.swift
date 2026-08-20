import Foundation
import SwiftUI
import AVFoundation
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
    private let playbackTimeHandler: ((Double) -> Void)?
    @Binding private var sceneIndex: Int
    @Binding private var isPlaying: Bool
    /// `startsPaused` réalisé : la commande de lecture n'est honorée qu'À PARTIR
    /// de l'apparition. Monter le player avec `isPlaying` déjà levé donne quand
    /// même un canvas en pause à la naissance — la lecture reste une commande.
    @State private var hasAppeared = false
    /// `loops` réalisé : chaque fin de scène change l'identité servie à l'hôte,
    /// que `updateUIView` relit comme une nouvelle slide et rejoue depuis zéro.
    @State private var loopPass = 0

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
                  languages: [],
                  playbackTimeHandler: nil)
    }

    private init(document: CanvasV3,
                 mode: ScenePlayerMode,
                 sceneIndex: Binding<Int>,
                 isPlaying: Binding<Bool>,
                 accentColorHex: String,
                 languages: [String],
                 playbackTimeHandler: ((Double) -> Void)?) {
        self.document = document
        self.mode = mode
        self._sceneIndex = sceneIndex
        self._isPlaying = isPlaying
        self.accentColorHex = accentColorHex
        self.languages = languages
        self.playbackTimeHandler = playbackTimeHandler
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
                          languages: languages,
                          playbackTimeHandler: playbackTimeHandler)
    }

    /// Le fil de position (≈60 Hz) qu'une chrome de lecture consomme — barre de
    /// progression, auto-advance. Armé pour le SEUL mode qui porte une chrome
    /// (`config.showsChrome`) : l'aperçu et la carte ne paient pas ce rappel.
    public func onPlaybackTime(_ handler: @escaping (Double) -> Void) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: document,
                          mode: mode,
                          sceneIndex: $sceneIndex,
                          isPlaying: $isPlaying,
                          accentColorHex: accentColorHex,
                          languages: languages,
                          playbackTimeHandler: handler)
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

    /// La naissance est en pause dans les trois modes ; la commande du viewer ne
    /// gouverne qu'ensuite.
    nonisolated static func hostIsPaused(config: ScenePlayerConfig,
                                         hasAppeared: Bool,
                                         isPlaying: Bool) -> Bool {
        guard hasAppeared || !config.startsPaused else { return true }
        return !isPlaying
    }

    /// L'identité servie à l'hôte : la scène, et le tour de boucle qui la
    /// relance. Le premier tour garde l'identité nue.
    nonisolated static func hostIdentity(sceneId: String, loopPass: Int) -> String {
        loopPass == 0 ? sceneId : "\(sceneId)#\(loopPass)"
    }

    public var body: some View {
        host.onAppear { hasAppeared = true }
    }

    var host: StoryReaderRepresentable {
        StoryReaderRepresentable(story: storyItem,
                                 preferredLanguages: languages,
                                 playerProvider: playerProvider,
                                 mute: config.isMuted,
                                 isPaused: Self.hostIsPaused(config: config,
                                                             hasAppeared: hasAppeared,
                                                             isPlaying: isPlaying),
                                 onCompletion: loopHandler,
                                 onPlaybackTime: config.showsChrome ? playbackTimeHandler : nil)
    }

    private var playerProvider: SharedCarrierPlayerProvider {
        SharedCarrierPlayerProvider(
            carrierIdentity: Self.carrierMediaIdentity(in: document, sceneIndex: sceneIndex))
    }

    private var loopHandler: (@Sendable () -> Void)? {
        guard config.loops else { return nil }
        return { MainActor.assumeIsolated { loopPass += 1 } }
    }

    private var storyItem: StoryItem {
        StoryItem(id: Self.hostIdentity(sceneId: document.scenes[safe: sceneIndex]?.id
                                                 ?? "\(sceneIndex)",
                                        loopPass: loopPass),
                  storyEffects: StoryEffects(rendering: document, sceneIndex: sceneIndex),
                  createdAt: Date(timeIntervalSince1970: 0))
    }
}

/// Le fournisseur du chemin de LECTURE (O16) : le média PORTEUR de la scène
/// joue le player du gestionnaire partagé — continuité de position, télémétrie
/// `WatchSample`, arbitrage `PlaybackCoordinator`. Tout autre média est décliné,
/// et la couche ouvre alors le sien.
public struct SharedCarrierPlayerProvider: StoryCarrierPlayerProviding {
    public let carrierIdentity: String?

    public init(carrierIdentity: String?) {
        self.carrierIdentity = carrierIdentity
    }

    public func player(for mediaIdentity: String) -> AVPlayer? {
        guard let carrierIdentity, mediaIdentity == carrierIdentity else { return nil }
        return SharedAVPlayerManager.shared.loadedPlayer(matching: mediaIdentity)
    }
}
