#if os(iOS)
import Foundation

/// **Ce qu'une interruption a mis en pause, et quand le reprendre** (#11040).
///
/// Un appel qui arrive, une autre app qui lance un son : ce que joue Meeshy
/// se met en pause. Quand l'interruption se termine, Meeshy reprend là où il
/// s'était arrêté — mais seulement ce qui JOUAIT au moment où elle a
/// commencé, et jamais ce que l'utilisateur a mis en pause lui-même entre
/// temps.
///
/// Une seule machine d'état pour tous les lecteurs (vidéo partagée, PiP
/// compris, audio, aperçus) : chacun la réécrivait, et chacun en oubliait un
/// cas. Le lecteur traduit ses événements en `Signal`, applique l'`Action`
/// rendue, et ne décide de rien d'autre.
public struct InterruptionResumeLedger: Sendable, Equatable {

    public enum Signal: Sendable, Equatable {
        /// L'interruption commence ; `isPlaying` dit si le lecteur jouait.
        case interruptionBegan(isPlaying: Bool)
        /// L'interruption s'achève. `shouldResume` vient du système, ou d'un
        /// appel Meeshy raccroché (que WebRTC ne signale pas au système).
        case interruptionEnded(shouldResume: Bool)
        /// La sortie a disparu (casque débranché) : convention iOS, pause
        /// sans reprise.
        case outputLost
        /// L'utilisateur a mis en pause : sa décision l'emporte sur toute
        /// reprise automatique.
        case userPaused
        /// L'utilisateur a relancé lui-même : il n'y a plus rien à reprendre.
        case userStartedPlayback
        /// Le contenu a quitté le lecteur (arrêt, autre média chargé).
        case contentReleased
        /// Retour au premier plan, sans signal de fin d'interruption — la
        /// vidéo d'une autre app (YouTube, Instagram) n'en envoie presque
        /// jamais.
        case returnedToForeground(otherAudioPlaying: Bool, contentStillOnScreen: Bool)
    }

    public enum Action: Sendable, Equatable {
        case pause
        case resume
        case none
    }

    /// `true` entre une interruption survenue EN LECTURE et sa résolution.
    public private(set) var holdsInterruptedPlayback = false

    public init() {}

    public mutating func handle(_ signal: Signal) -> Action {
        switch signal {
        case .interruptionBegan(let isPlaying):
            guard isPlaying else { return .none }
            holdsInterruptedPlayback = true
            return .pause
        case .interruptionEnded(let shouldResume):
            return consume(resuming: shouldResume)
        case .outputLost:
            holdsInterruptedPlayback = false
            return .pause
        case .userPaused, .userStartedPlayback, .contentReleased:
            holdsInterruptedPlayback = false
            return .none
        case .returnedToForeground(let otherAudioPlaying, let contentStillOnScreen):
            guard contentStillOnScreen else { return consume(resuming: false) }
            guard !otherAudioPlaying else { return .none }
            return consume(resuming: true)
        }
    }

    private mutating func consume(resuming: Bool) -> Action {
        guard holdsInterruptedPlayback else { return .none }
        holdsInterruptedPlayback = false
        return resuming ? .resume : .none
    }

    /// Traduit un événement du `MediaSessionCoordinator`. `nil` : rien à en
    /// tirer pour un lecteur.
    public static func signal(
        for event: MediaSessionCoordinator.Event, isPlaying: Bool
    ) -> Signal? {
        switch event {
        case .interruptionBegan:
            return .interruptionBegan(isPlaying: isPlaying)
        case .interruptionEndedShouldResume, .callEndedShouldResume:
            return .interruptionEnded(shouldResume: true)
        case .interruptionEndedShouldNotResume:
            return .interruptionEnded(shouldResume: false)
        case .routeChangedOldDeviceUnavailable:
            return .outputLost
        case .routeChangedOther:
            return nil
        }
    }
}
#endif
