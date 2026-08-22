import Foundation
import SwiftUI
import UIKit
import AVFoundation
import MeeshySDK

/// Lecteur d'un document `CanvasV3`, dans l'un des trois modes du chantier.
///
/// Le rendu n'est pas réécrit : le player enveloppe l'hôte canvas du reader
/// (`StoryReaderRepresentable`, qui monte `StoryCanvasUIView`) et lui donne la
/// scène demandée, reconstruite dans les familles runtime par le pont v3.
///
/// Paramètres opaques uniquement — l'accent arrive en hex, la chaîne du Prisme
/// arrive du lecteur : aucun singleton produit ici.
///
/// **Le porteur (`carrier`).** Le document dit ce qu'il faut PEINDRE ; il ne dit
/// pas où vivent les pixels. L'adresse des médias vit dans le `StoryItem` qui
/// porte la scène, et `StoryItem.toRenderableSlide` s'en sert pour hydrater au
/// READ ce que le composer n'a pas stampé : `aspectRatio` (source de
/// dimensionnement PRIMAIRE — le composer pose toujours la sentinelle 1.0),
/// `duration`, l'adresse d'un clip audio, et le backdrop legacy. Le résolveur de
/// `makeUIView` y puise en plus son repli distant par `postMediaId`. Sans
/// porteur, le player sert une coquille : c'est licite (une scène purement
/// textuelle se peint sans lui) mais un viewer story doit toujours le donner.
public struct MeeshyScenePlayer: View {

    public let accentColorHex: String

    private let document: CanvasV3
    private let mode: ScenePlayerMode
    /// Le `StoryItem` qui PORTE la scène — son identité et son index de médias.
    private let carrier: StoryItem?
    private var languages: [String]
    /// Le muet DEMANDÉ par l'hôte. `nil` = aucune demande, le mode décide.
    private let requestedMute: Bool?
    private let isOutgoing: Bool
    private let preloadedImages: [String: UIImage]
    private let preloadedVideoURLs: [String: URL]
    private let preloadedAudioURLs: [String: URL]
    private let contentReadyHandler: (() -> Void)?
    private let contentProgressHandler: ((Double) -> Void)?
    private let playbackProgressingHandler: ((Bool) -> Void)?
    private var playbackTimeHandler: ((Double) -> Void)?
    @Binding private var sceneIndex: Int
    @Binding private var isPlaying: Bool
    /// `startsPaused` réalisé : la commande de lecture n'est honorée qu'À PARTIR
    /// de l'apparition. Monter le player avec `isPlaying` déjà levé donne quand
    /// même un canvas en pause à la naissance — la lecture reste une commande.
    @State private var hasAppeared = false
    /// `loops` réalisé : chaque fin de scène change l'identité servie à l'hôte,
    /// que `updateUIView` relit comme une nouvelle slide et rejoue depuis zéro.
    @State private var loopPass = 0

    /// Tout ce qui suit `accentColorHex` a un défaut : les appelants du contrat
    /// B4 d'origine (`FeedPostCard`, mode `.card`) compilent inchangés.
    ///
    /// Ces fils voyagent par l'INIT et non par des modificateurs chaînés parce
    /// qu'un montage se relit à la fenêtre ÉQUILIBRÉE de son appel : ce qui est
    /// chaîné après la parenthèse fermante sort de cette fenêtre, donc sort de
    /// ce qu'une garde de couture peut voir (E4).
    public init(document: CanvasV3,
                mode: ScenePlayerMode,
                sceneIndex: Binding<Int>,
                isPlaying: Binding<Bool>,
                accentColorHex: String,
                carrier: StoryItem? = nil,
                preferredContentLanguages: [String] = [],
                isMuted: Bool? = nil,
                isOutgoing: Bool = false,
                preloadedImages: [String: UIImage] = [:],
                preloadedVideoURLs: [String: URL] = [:],
                preloadedAudioURLs: [String: URL] = [:],
                onContentReady: (() -> Void)? = nil,
                onContentProgress: ((Double) -> Void)? = nil,
                onPlaybackProgressing: ((Bool) -> Void)? = nil) {
        self.document = document
        self.mode = mode
        self._sceneIndex = sceneIndex
        self._isPlaying = isPlaying
        self.accentColorHex = accentColorHex
        self.carrier = carrier
        self.languages = preferredContentLanguages
        self.requestedMute = isMuted
        self.isOutgoing = isOutgoing
        self.preloadedImages = preloadedImages
        self.preloadedVideoURLs = preloadedVideoURLs
        self.preloadedAudioURLs = preloadedAudioURLs
        self.contentReadyHandler = onContentReady
        self.contentProgressHandler = onContentProgress
        self.playbackProgressingHandler = onPlaybackProgressing
        self.playbackTimeHandler = nil
    }

    public var config: ScenePlayerConfig { ScenePlayerConfig(mode: mode) }

    /// Le Prisme du LECTEUR — l'ordre dans lequel l'hôte résout les traductions
    /// d'un texte (`StoryTextObject.resolvedText(preferredLanguages:)`), qui
    /// retombe sur l'original quand aucune langue ne sert. Même chaîne que le
    /// paramètre d'init `preferredContentLanguages:` ; ce chaînage sert les
    /// appelants qui le portaient déjà.
    public func preferredContentLanguages(_ languages: [String]) -> MeeshyScenePlayer {
        var copy = self
        copy.languages = languages
        return copy
    }

    /// Le fil de position (≈60 Hz) qu'une chrome de lecture consomme — barre de
    /// progression, auto-advance. Armé pour le SEUL mode qui porte une chrome
    /// (`config.showsChrome`) : l'aperçu et la carte ne paient pas ce rappel.
    public func onPlaybackTime(_ handler: @escaping (Double) -> Void) -> MeeshyScenePlayer {
        var copy = self
        copy.playbackTimeHandler = handler
        return copy
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

    /// Le muet servi à l'hôte. Le mode POSE un défaut ; il ne VERROUILLE que
    /// pour la carte de fil, qui est muette par construction. Partout ailleurs
    /// la demande de l'hôte gouverne — un viewer story tient un muet persistant
    /// qui survit aux avances et que seul l'utilisateur relève.
    nonisolated static func hostMute(config: ScenePlayerConfig,
                                     requestedMute: Bool?) -> Bool {
        guard !config.locksMute else { return true }
        return requestedMute ?? config.isMuted
    }

    /// L'identité servie à l'hôte : sa RACINE (cf. `identityRoot`), affinée par
    /// la scène, puis par le tour de boucle qui la relance.
    ///
    /// La scène ne s'identifie pas seule : `CanvasV3(migrating:)` fabrique
    /// `SceneV3(id: "s1")` EN DUR, si bien que deux stories legacy porteraient
    /// la même identité et qu'`updateUIView` ne verrait jamais son
    /// `identityChanged`. La scène reste DANS l'identité pour qu'un document à
    /// plusieurs scènes rejoue bien à chaque avance.
    nonisolated static func hostIdentity(carrierId: String? = nil,
                                         sceneId: String,
                                         loopPass: Int) -> String {
        let base = carrierId.map { "\($0)@\(sceneId)" } ?? sceneId
        return loopPass == 0 ? base : "\(base)#\(loopPass)"
    }

    /// La RACINE de l'identité : ce que le montage PEINT, jamais la place du
    /// cadre dans le document.
    ///
    /// Le porteur d'abord — c'est l'identité RÉELLE de ce qui est monté, et
    /// deux montages du MÊME document (un repost et son original) doivent
    /// rester distincts. À défaut — `FeedPostCard` monte `.card` sans porteur —
    /// ce que la scène ADRESSE. Le littéral `"s1"` de la migration ne peut pas
    /// servir : son jumeau gateway (`storyEffectsV3.ts`) émet le même et le
    /// golden partagé (`v1-legacy-full.v3.json`) le grave des deux côtés, si
    /// bien que toute story legacy le porte.
    nonisolated static func identityRoot(carrierId: String?,
                                         document: CanvasV3,
                                         sceneIndex: Int) -> String? {
        guard let carrierId, !carrierId.isEmpty else {
            return sceneDiscriminant(in: document, sceneIndex: sceneIndex)
        }
        return carrierId
    }

    /// Ce qu'une scène porte de distinctif : le `postMediaId` le plus BAS en z
    /// — seule chose d'un document migré qui désigne un ENREGISTREMENT —, sinon
    /// son empreinte (`thumbHash`, calculée par la file hors-ligne après le
    /// persist), qui empreinte exactement ce qui est peint.
    ///
    /// `nil` est un résultat ASSUMÉ : un document qui n'adresse rien ne porte
    /// aucun discriminant, et l'identité retombe alors sur la place de la scène.
    /// C'est au montage de donner un porteur — le viewer story en a toujours un.
    nonisolated static func sceneDiscriminant(in document: CanvasV3,
                                              sceneIndex: Int) -> String? {
        guard document.scenes.indices.contains(sceneIndex) else { return nil }
        let scene = document.scenes[sceneIndex]
        let addressed = scene.objects
            .compactMap { object -> (z: Int, identity: String)? in
                guard case .string(let identity)? = object.payload["postMediaId"],
                      !identity.isEmpty else { return nil }
                return (object.z, identity)
            }
            .min { $0.z < $1.z }?.identity
        return addressed ?? scene.thumbHash
    }

    public var body: some View {
        host.onAppear { hasAppeared = true }
    }

    var host: StoryReaderRepresentable {
        StoryReaderRepresentable(story: storyItem,
                                 preferredLanguages: languages,
                                 preloadedImages: preloadedImages,
                                 preloadedVideoURLs: preloadedVideoURLs,
                                 preloadedAudioURLs: preloadedAudioURLs,
                                 playerProvider: playerProvider,
                                 mute: Self.hostMute(config: config,
                                                     requestedMute: requestedMute),
                                 isPaused: Self.hostIsPaused(config: config,
                                                             hasAppeared: hasAppeared,
                                                             isPlaying: isPlaying),
                                 isOutgoing: isOutgoing,
                                 onCompletion: loopHandler,
                                 onContentReady: contentReadyHandler,
                                 onContentProgress: contentProgressHandler,
                                 onPlaybackTime: config.showsChrome ? playbackTimeHandler : nil,
                                 onPlaybackProgressing: playbackProgressingHandler)
    }

    private var playerProvider: SharedCarrierPlayerProvider {
        SharedCarrierPlayerProvider(
            carrierIdentity: Self.carrierMediaIdentity(in: document, sceneIndex: sceneIndex))
    }

    private var loopHandler: (@Sendable () -> Void)? {
        guard config.loops else { return nil }
        return { MainActor.assumeIsolated { loopPass += 1 } }
    }

    /// Les cinq champs repris du porteur sont EXACTEMENT ceux que l'hôte
    /// consomme : `id` et `storyEffects` fondent la slide, `media` l'hydrate au
    /// read et adresse les assets, `content` + `translations` portent la légende
    /// dans le Prisme du lecteur. Le reste du `StoryItem` (compteurs, visibilité,
    /// vues) ne descend jamais jusqu'au canvas — le recopier serait un leurre.
    private var storyItem: StoryItem {
        StoryItem(id: Self.hostIdentity(carrierId: Self.identityRoot(carrierId: carrier?.id,
                                                                     document: document,
                                                                     sceneIndex: sceneIndex),
                                        sceneId: document.scenes[safe: sceneIndex]?.id
                                                 ?? "\(sceneIndex)",
                                        loopPass: loopPass),
                  content: carrier?.content,
                  media: carrier?.media ?? [],
                  storyEffects: StoryEffects(rendering: document, sceneIndex: sceneIndex),
                  createdAt: carrier?.createdAt ?? Date(timeIntervalSince1970: 0),
                  translations: carrier?.translations)
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
