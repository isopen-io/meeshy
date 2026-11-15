import AVFoundation
import Combine
import Foundation
import QuartzCore

/// **La lecture d'un SEGMENT, pour le rognage** (#4657).
///
/// Elle ne connaît que trois choses : un fichier, un intervalle, et une tête de
/// lecture. Aucun singleton Meeshy, aucune règle produit — c'est un atome, et
/// c'est ce qui lui permet de vivre dans le SDK.
///
/// ## Ce qu'elle garantit, et pourquoi
///
/// - **Elle s'arrête à la borne HAUTE.** `AVAudioPlayer` ne sait pas jouer un
///   intervalle : il joue jusqu'au bout. La borne est donc tenue par l'horloge
///   d'affichage, la seule qui observe déjà la position — ajouter un minuteur
///   séparé ferait deux horloges pour une position, et elles dériveraient.
/// - **Elle reprend TOUJOURS au début du segment.** La directive le demande au
///   relâchement d'une poignée, et c'est aussi le bon comportement après une
///   fin naturelle : reprendre là où on s'était arrêté n'a pas de sens quand
///   l'endroit où l'on s'arrête est précisément la borne qu'on vient de poser.
/// - **Elle ne tient aucune session audio.** La feuille qui l'héberge la
///   configure déjà pour l'enregistrement ; une seconde configuration ici
///   entrerait en conflit avec elle, au hasard de l'ordre d'apparition.
@MainActor
public final class AudioTrimPreviewPlayer: ObservableObject {

    /// La tête de lecture, en secondes depuis le début du FICHIER.
    @Published public private(set) var playhead: TimeInterval = 0
    @Published public private(set) var isPlaying = false

    private var player: AVAudioPlayer?
    private var horloge: CADisplayLink?
    private var borneHaute: TimeInterval = .infinity
    private var borneBasse: TimeInterval = 0

    public init() {}

    /// Charge un fichier sans le jouer. Rend la durée réelle, `nil` si le
    /// fichier n'est pas lisible — un appelant qui reçoit `nil` doit renoncer
    /// au rognage plutôt que d'afficher une bande vide qui a l'air de marcher.
    @discardableResult
    public func load(url: URL) -> TimeInterval? {
        stop()
        guard let joueur = try? AVAudioPlayer(contentsOf: url) else {
            player = nil
            return nil
        }
        joueur.prepareToPlay()
        player = joueur
        playhead = 0
        return joueur.duration
    }

    /// Joue `from...to`. Toujours DEPUIS `from` — jamais depuis la position
    /// courante.
    public func play(from debut: TimeInterval, to fin: TimeInterval) {
        guard let player else { return }
        borneBasse = max(0, debut)
        borneHaute = min(player.duration, fin)
        guard borneHaute > borneBasse else { return }

        player.currentTime = borneBasse
        player.play()
        isPlaying = true
        playhead = borneBasse
        demarrerHorloge()
    }

    /// Suspend sans oublier les bornes — un déplacement de poignée passe par
    /// ici, et le relâchement rappelle `play(from:to:)`.
    public func pause() {
        player?.pause()
        isPlaying = false
        arreterHorloge()
    }

    /// `isPlaying` n'est ré-assigné QUE s'il change : `@Published` publie sur
    /// `willSet`, valeur changée ou non, et un aperçu déjà arrêté publiait pour
    /// rien à chaque `onDisappear` (#7005, même forme que #6977).
    public func stop() {
        player?.stop()
        if isPlaying { isPlaying = false }
        arreterHorloge()
    }

    /// Pose la tête de lecture sans jouer — le défilement au doigt s'en sert.
    public func seek(to time: TimeInterval) {
        guard let player else { return }
        let borne = min(max(0, time), player.duration)
        player.currentTime = borne
        playhead = borne
    }

    // MARK: - L'horloge

    /// Un `CADisplayLink` sur la plage 30…60 Hz (`CAFrameRateRange.clock`),
    /// pas un `Timer` : la bande défile sous le curseur au rythme de l'ÉCRAN, et
    /// l'horloge d'affichage est déjà sur le fil principal — plus de `Task` par
    /// tic. Le proxy `WeakDisplayLinkTarget` ne retient pas `self` : un joueur
    /// abandonné ne reste pas vivant par sa propre horloge.
    private func demarrerHorloge() {
        arreterHorloge()
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .clock) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.battre()
        }
        link.add(to: .main, forMode: .common)
        horloge = link
    }

    private func arreterHorloge() {
        horloge?.invalidate()
        horloge = nil
    }

    private func battre() {
        guard let player, isPlaying else { return }
        // La borne haute est tenue ICI, faute d'API de lecture par intervalle.
        switch AudioTrimPlaybackStep.next(
            currentTime: player.currentTime,
            playerIsPlaying: player.isPlaying,
            lowerBound: borneBasse,
            upperBound: borneHaute
        ) {
        case .playing(let position):
            playhead = position
        case .finished(let repos):
            player.pause()
            player.currentTime = repos
            playhead = repos
            isPlaying = false
            arreterHorloge()
        }
    }

    // **Un `deinit` VIDE, et nonisolated.** Le raisonnement d'origine — « le
    // minuteur capture `self` faiblement, donc il n'y a rien à défaire, et
    // Swift 6 interdit de toucher un `Timer?` isolé au MainActor depuis un
    // `deinit` nonisolated » — est juste sur le NETTOYAGE et rate la raison
    // pour laquelle la garde existe.
    //
    // Ce n'est pas ce que le `deinit` FAIT qui compte, c'est le fait qu'il
    // soit ÉCRIT : sans lui, Swift synthétise un `deinit` ISOLÉ au MainActor
    // (SE-0466, isolation par défaut du module), qui double-libère sur
    // iOS 26.1 — `pointer being freed was not allocated`, abrt. En l'écrivant
    // vide et nonisolated, on ne touche à rien ET on n'hérite pas de la
    // version synthétisée.
    //
    // `stop()` — appelé par `onDisappear` de l'hôte — reste le site qui éteint
    // le minuteur ; rien ne change de ce côté.
    nonisolated deinit {}
}

/// **Le pas de la lecture d'un segment, en loi pure** : tenir la borne haute,
/// revenir à la borne basse. Séparé de l'horloge pour qu'elle reste
/// remplaçable sans que la règle ne bouge.
nonisolated enum AudioTrimPlaybackStep: Equatable {
    case playing(at: TimeInterval)
    case finished(restingAt: TimeInterval)

    static func next(currentTime: TimeInterval,
                                 playerIsPlaying: Bool,
                                 lowerBound: TimeInterval,
                                 upperBound: TimeInterval) -> AudioTrimPlaybackStep {
        guard currentTime < upperBound, playerIsPlaying else { return .finished(restingAt: lowerBound) }
        return .playing(at: currentTime)
    }
}
