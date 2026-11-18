import Foundation
import MeeshySDK
import MeeshyUI

/// L'échantillon de ma voix sur la Vitrine (planche `Main`, « Ma voix ») : ce que la section montre et ce que le disque
/// du lecteur K35 fait. Des VALEURS, sans lecteur : la vue tient le moteur, ce type décide.
nonisolated struct ProfileVoiceSample: Equatable, Sendable {

    /// Ce que le toucher du disque déclenche.
    enum Toggle: Equatable, Sendable {
        /// Le son n'est pas chargé (jamais lu, ou allé au bout) : le charger et le lire depuis le début.
        case start(String)
        /// Le son est chargé : le mettre en pause, ou le reprendre là où il s'était arrêté.
        case pauseOrResume
    }

    let url: String
    let isPublic: Bool
    /// La durée servie, en secondes ; `0` quand le serveur ne la sert pas (le lecteur la lit au chargement).
    let servedDuration: Double

    /// `nil` sans échantillon : la section n'existe pas plutôt que de montrer un lecteur muet.
    static func make(user: MeeshyUser?) -> ProfileVoiceSample? {
        guard let url = user?.voiceSampleUrl?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty else {
            return nil
        }
        let milliseconds = max(user?.voiceSampleDurationMs ?? 0, 0)
        return ProfileVoiceSample(url: url, isPublic: user?.voicePublic == true,
                                  servedDuration: Double(milliseconds) / 1000)
    }

    /// Le même son chargé se met en pause ou reprend ; tout autre état relance la lecture de cet échantillon.
    func toggle(loadedURL: String?) -> Toggle {
        loadedURL == url ? .pauseOrResume : .start(url)
    }

    /// La durée montrée : celle du fichier lu dès qu'elle est connue, sinon celle que le serveur a servie.
    func shownDuration(playerDuration: Double) -> Double {
        playerDuration.isFinite && playerDuration > 0 ? playerDuration : servedDuration
    }

    /// Le glissement ne s'offre qu'au son chargé : avant, il n'y a rien à déplacer.
    func acceptsScrub(loadedURL: String?) -> Bool {
        loadedURL == url
    }

    static func phase(isLoading: Bool) -> MeeshyWavePlayerPhase {
        isLoading ? .buffering : .ready
    }
}

/// Ce que « Ma voix » montre sur ma vitrine (#19512) : au repos, le lecteur d'un échantillon servi ; en édition, ce
/// lecteur avec son interrupteur public et « Réenregistrer » (planche `Moi-Edition`), ou, sans échantillon, de quoi en
/// enregistrer un.
nonisolated enum ProfileVoiceBlock: Equatable, Sendable {
    case none
    case listen
    case edit
    case record

    static func resolve(sample: ProfileVoiceSample?, isEditing: Bool) -> ProfileVoiceBlock {
        switch (sample != nil, isEditing) {
        case (true, false): return .listen
        case (true, true): return .edit
        case (false, true): return .record
        case (false, false): return .none
        }
    }
}
