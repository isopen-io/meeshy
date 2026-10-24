import UIKit
@preconcurrency import AVFoundation
import MeeshySDK

// MARK: - Le RENDU du fond, repeint en place (#9496)

extension StoryBackgroundLayer {

    /// **Repeint le fond quand SEUL son rendu change** — filtre de slide,
    /// intensité, réglages du média de fond. Rend `false` quand la couche n'a
    /// rien à repeindre en place (aucun bitmap final retenu, aucun player) :
    /// `configure` reprend alors son chemin complet.
    ///
    /// C'est ce qui rend un curseur de réglage fluide sur le fond : une image
    /// repart du bitmap BRUT que le dernier stamp a retenu — ni ThumbHash, ni
    /// rechargement —, une vidéo garde son player et reçoit la composition de
    /// ses réglages, sans que la lecture ne saute. Dans le canvas interactif
    /// (`bakesLookOffMainThread`), l'image se cuit HORS du fil principal (#9873).
    @MainActor
    func restyleInPlace(filter: StoryFilter?, filterIntensity: Float, adjustments: ImageAdjustments?) -> Bool {
        switch kind {
        case .image:
            guard let source = stampedSource, let img = contentLayer else { return false }
            setLook(filter: filter, filterIntensity: filterIntensity, adjustments: adjustments)
            guard bakesLookOffMainThread else {
                stampFinalImage(source.image, imageId: source.imageId, on: img)
                return true
            }
            repaintLookOffMainThread(source, on: img)
            return true
        case .video:
            guard avPlayer != nil else { return false }
            setLook(filter: filter, filterIntensity: filterIntensity, adjustments: adjustments)
            applyBackgroundVideoLook()
            return true
        case .solidColor, .gradient:
            return false
        }
    }

    /// **Le repeint d'un curseur, hors du fil principal** (#9873).
    ///
    /// Un look déjà cuit (ou l'absence de look) se pose sur place ; sinon le
    /// bitmap affiché reste à l'écran et la cuisson part hors du MainActor —
    /// un rendu en vol, le dernier cran gagne —, posée dès qu'elle est prête
    /// si la couche montre encore la même source. Aucun `createCGImage` ne
    /// tombe dans l'image où le doigt bouge.
    @MainActor
    func repaintLookOffMainThread(_ source: (image: UIImage, imageId: String?), on img: CALayer) {
        let request = StoryLookBakeRequest(image: source.image, filter: activeFilter, intensity: activeFilterIntensity,
                                           adjustments: activeAdjustments, imageId: source.imageId)
        if let pret = StoryLookBake.ready(request) {
            liveLookStorage?.supersede()
            stampDisplay(pret, on: img)
            return
        }
        liveLook.bake(request) { [weak self, weak img] cuit in
            guard let self, let img, self.contentLayer === img,
                  self.stampedSource?.image === request.image else { return }
            self.stampDisplay(cuit, on: img)
        }
    }

    /// L'outil de cuisson hors du fil principal — monté au premier glissé.
    @MainActor
    var liveLook: StoryLiveLook {
        if let existant = liveLookStorage { return existant }
        let monte = StoryLiveLook()
        liveLookStorage = monte
        return monte
    }

    /// **Pose sur les items du player de fond la composition de ses réglages.**
    ///
    /// Appelé à chaque attache et à chaque changement de réglage. Un fond
    /// BOUCLÉ joue des répliques de son item (`AVPlayerLooper`) : chacune
    /// reçoit la même composition, sinon le premier tour serait réglé et les
    /// suivants non. Un fond sans réglage ne reçoit AUCUNE composition (le
    /// compositeur natif, zéro coût par trame) ; celle que cette couche a posée
    /// est retirée quand les réglages reviennent au neutre.
    @MainActor
    func applyBackgroundVideoLook() {
        guard let player = avPlayer else { return }
        let reglages = StoryBackgroundLook.painted(activeAdjustments, for: .video)
        let signature = reglages.map(StoryMediaAdjustmentsProcessor.signature) ?? ""
        let identite = ObjectIdentifier(player)
        let precedent = appliedBackgroundVideoLook
        guard precedent?.player != identite || precedent?.signature != signature else { return }

        backgroundVideoLookTask?.cancel()
        backgroundVideoLookTask = nil
        appliedBackgroundVideoLook = (identite, signature)

        guard let reglages else {
            if precedent?.player == identite, precedent?.signature.isEmpty == false {
                backgroundPlaybackItems(of: player).forEach { $0.videoComposition = nil }
            }
            return
        }
        // L'asset de l'item joué ; à défaut — une boucle dont les répliques ne
        // sont pas encore en file —, celui que l'attache a ouvert sur la même URL.
        guard let asset = backgroundPlaybackItems(of: player).first?.asset ?? attachedVideoAsset else { return }
        let looper = avPlayerLooper
        backgroundVideoLookTask = Task { @MainActor [weak self, weak player] in
            guard let composition = try? await StoryVideoAdjustmentsProcessor.composition(for: asset,
                                                                                          adjustments: reglages)
            else { return }
            // Une boucle pose ses répliques quand SON asset est chargé — le même
            // que la composition lit (#9881) : on attend qu'elles existent.
            if let looper { await LoopReplicasReady.wait(for: looper) }
            guard !Task.isCancelled, let self, let player,
                  self.appliedBackgroundVideoLook?.player == ObjectIdentifier(player),
                  self.appliedBackgroundVideoLook?.signature == signature else { return }
            self.backgroundPlaybackItems(of: player).forEach { $0.videoComposition = composition }
        }
    }

    /// Les items que ce player JOUE : l'item courant et, pour un fond bouclé,
    /// toutes les répliques de la boucle — chacun une fois.
    @MainActor
    private func backgroundPlaybackItems(of player: AVPlayer) -> [AVPlayerItem] {
        let candidats = (avPlayerLooper?.loopingPlayerItems ?? []) + [player.currentItem].compactMap { $0 }
        var vus = Set<ObjectIdentifier>()
        return candidats.filter { vus.insert(ObjectIdentifier($0)).inserted }
    }
}

/// **Les répliques d'une boucle existent (#9881)** : l'`AVPlayerLooper` ne les
/// pose qu'une fois l'asset de son modèle chargé. Une composition prête AVANT
/// elles ne réglerait aucun tour de la boucle ; elle attend donc que le looper
/// quitte `.unknown` (prêt ou en échec), ou que l'attente soit annulée.
nonisolated enum LoopReplicasReady {
    @MainActor
    static func wait(for looper: AVPlayerLooper) async {
        guard looper.status == .unknown else { return }
        let signal = LooperStatusSignal()
        await withTaskCancellationHandler {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                signal.arm(looper, continuation: continuation)
            }
        } onCancel: {
            signal.fire()
        }
    }
}

// unchecked: l'observation et la reprise vivent sous `state` (Locked) ; elles ne sont pas Sendable.
private nonisolated final class LooperStatusSignal: @unchecked Sendable {
    private struct State {
        var observation: NSKeyValueObservation?
        var continuation: CheckedContinuation<Void, Never>?
        var fired = false
    }

    private let state = Locked(uncheckedState: State())

    func arm(_ looper: AVPlayerLooper, continuation: CheckedContinuation<Void, Never>) {
        let alreadyFired = state.mutateUnchecked { state -> Bool in
            state.continuation = continuation
            return state.fired
        }
        guard !alreadyFired else { return fire() }
        let observation = looper.observe(\.status, options: [.initial, .new]) { [weak self] observed, _ in
            guard observed.status != .unknown else { return }
            self?.fire()
        }
        let keep = state.mutateUnchecked { state -> Bool in
            guard !state.fired else { return false }
            state.observation = observation
            return true
        }
        if !keep { observation.invalidate() }
    }

    /// Une seule reprise, quel que soit le premier signal.
    func fire() {
        let (observation, continuation) = state.mutateUnchecked { state -> (NSKeyValueObservation?, CheckedContinuation<Void, Never>?) in
            state.fired = true
            defer {
                state.observation = nil
                state.continuation = nil
            }
            return (state.observation, state.continuation)
        }
        observation?.invalidate()
        continuation?.resume()
    }
}
