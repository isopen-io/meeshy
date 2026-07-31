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

    /// Joue le son. Rend la main quand la lecture a commencé — ou renonce.
    func play(_ sound: APISound) async

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

    public func play(_ sound: APISound) async {
        stop()
        guard let remote = Self.remoteURL(for: sound) else { return }

        if let local = CacheCoordinator.audioLocalFileURL(for: remote.absoluteString) {
            player.playLocalFile(url: local)
            return
        }

        guard let local = await CacheCoordinator.audioLocalFileURLAwait(for: remote) else { return }
        // L'utilisateur a pu changer d'avis pendant le téléchargement. On ne
        // joue plus, mais le fichier EST en cache : rien n'est perdu.
        guard !Task.isCancelled else { return }
        player.playLocalFile(url: local)
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
