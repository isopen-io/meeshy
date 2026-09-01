import AVFoundation
import Combine
import Foundation

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
    private var horloge: Timer?
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

    public func stop() {
        player?.stop()
        isPlaying = false
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

    /// 60 Hz : c'est la cadence à laquelle la bande défile sous le curseur, et
    /// une valeur plus lâche se verrait comme un défilement saccadé — le
    /// contraire de ce que ce composant existe pour offrir.
    private func demarrerHorloge() {
        arreterHorloge()
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.battre() }
        }
        RunLoop.main.add(timer, forMode: .common)
        horloge = timer
    }

    private func arreterHorloge() {
        horloge?.invalidate()
        horloge = nil
    }

    private func battre() {
        guard let player, isPlaying else { return }
        playhead = player.currentTime
        // La borne haute est tenue ICI, faute d'API de lecture par intervalle.
        if player.currentTime >= borneHaute || !player.isPlaying {
            player.pause()
            player.currentTime = borneBasse
            playhead = borneBasse
            isPlaying = false
            arreterHorloge()
        }
    }

    // Pas de `deinit` : le minuteur capture `self` FAIBLEMENT, donc il ne
    // retient rien, et Swift 6 interdit de toucher un `Timer?` isolé au
    // MainActor depuis un `deinit` nonisolated. `stop()` — appelé par
    // `onDisappear` de l'hôte — est le site qui l'éteint.
}
