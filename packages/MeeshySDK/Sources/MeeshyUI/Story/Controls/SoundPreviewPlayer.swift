import Foundation
import Combine
import MeeshySDK

/// Ce que le sélecteur de sons attend d'un lecteur d'aperçu. Abstrait pour que
/// le modèle reste testable sans audio ni réseau.
@MainActor
public protocol SoundPreviewing: AnyObject {
    /// Émis quand la lecture s'arrête D'ELLE-MÊME (fin de piste). Jamais sur un
    /// arrêt demandé : sans cette distinction, couper une piste pour en lancer
    /// une autre effacerait la sélection qu'on vient de poser.
    var finished: AnyPublisher<Void, Never> { get }

    /// Le son est-il déjà sur le disque ? Décide si la ligne montre un état
    /// « préparation » ou passe directement en lecture.
    func isReadyToPlayInstantly(_ sound: APISound) -> Bool

    /// Joue le son. Rend `true` seulement si la lecture a RÉELLEMENT démarré.
    /// Sans ce retour, un téléchargement échoué laissait la ligne afficher
    /// « stop » pour un son muet, sans aucun moyen d'en sortir.
    @discardableResult
    func play(_ sound: APISound) async -> Bool

    func stop()
}

/// Lecteur d'aperçu du sélecteur : **cache d'abord, réseau une seule fois**.
///
/// Le fichier est TOUJOURS résolu en `file://` avant lecture, jamais diffusé en
/// direct. Diffuser puis mettre en cache en tâche de fond, comme le fait le
/// chemin générique, coûte DEUX passages réseau au premier écoute ; ici on en
/// paie un seul, et la ligne affiche un état de préparation pendant ce temps.
///
/// Un aperçu abandonné ne perd pas son téléchargement : `DiskCacheStore` porte
/// la requête dans une tâche NON STRUCTURÉE, donc annuler l'attente n'annule
/// pas le transfert — le fichier atterrit quand même en cache et la prochaine
/// écoute est gratuite. C'est ce qui rend l'appui répétitif sur play/stop sans
/// conséquence sur la consommation de données.
@MainActor
public final class SoundPreviewPlayer: SoundPreviewing {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private let player = AudioPlayerManager()
    private let finishedSubject = PassthroughSubject<Void, Never>()
    private var cancellables = Set<AnyCancellable>()

    /// Vrai le temps d'un arrêt DEMANDÉ. `AudioPlayerManager.stop()` bascule
    /// `isPlaying` de façon synchrone, donc sans ce drapeau l'arrêt de la piste
    /// précédente serait indiscernable d'une fin naturelle.
    private var isStoppingOnPurpose = false

    public var finished: AnyPublisher<Void, Never> { finishedSubject.eraseToAnyPublisher() }

    public init() {
        player.$isPlaying
            .dropFirst()
            // `@Published` émet à CHAQUE affectation, même à valeur égale, et
            // `AudioPlayerManager.playLocalFile` commence par un `stop()`
            // interne : sans dédoublonnage, démarrer une piste émettait un faux
            // « terminé » juste avant de jouer. L'état final restait correct par
            // accident d'ordonnancement — c'est exactement ce qu'on ne veut pas
            // laisser reposer sur la chance.
            .removeDuplicates()
            .sink { [weak self] isPlaying in
                guard let self, !isPlaying, !self.isStoppingOnPurpose else { return }
                self.finishedSubject.send()
            }
            .store(in: &cancellables)
    }

    public func isReadyToPlayInstantly(_ sound: APISound) -> Bool {
        guard let remote = Self.remoteURL(for: sound) else { return false }
        return CacheCoordinator.audioLocalFileURL(for: remote.absoluteString) != nil
    }

    @discardableResult
    public func play(_ sound: APISound) async -> Bool {
        stop()
        guard let remote = Self.remoteURL(for: sound) else { return false }

        if let local = CacheCoordinator.audioLocalFileURL(for: remote.absoluteString) {
            return started(from: local)
        }

        guard let local = await CacheCoordinator.audioLocalFileURLAwait(for: remote) else { return false }
        // L'utilisateur a pu changer d'avis pendant le téléchargement. On ne
        // joue plus, mais le fichier EST en cache : rien n'est perdu.
        guard !Task.isCancelled else { return false }
        return started(from: local)
    }

    /// `AudioPlayerManager` échoue en posant `lastError` sans lever : un fichier
    /// tronqué ou d'un format que `AVAudioPlayer` refuse ressort ici, et c'est
    /// la seule façon de ne pas l'annoncer comme une lecture en cours.
    private func started(from local: URL) -> Bool {
        player.playLocalFile(url: local)
        return player.isPlaying
    }

    public func stop() {
        isStoppingOnPurpose = true
        player.stop()
        isStoppingOnPurpose = false
    }

    /// Un son déjà local (brouillon, capture en cours) se joue tel quel ; sinon
    /// on résout l'URL relative servie par la gateway.
    static func remoteURL(for sound: APISound) -> URL? {
        guard !sound.fileUrl.isEmpty else { return nil }
        if let direct = URL(string: sound.fileUrl), direct.isFileURL { return direct }
        return MeeshyConfig.resolveMediaURL(sound.fileUrl)
    }
}
