#if os(iOS)
import Foundation

/// **Meeshy rend la main** (#11039, #11040 — décision porteur j du 2026-10-20).
///
/// Quand Meeshy a mis en pause la musique d'une autre app (Spotify, Music,
/// Netflix…), il lui rend la session avec `.notifyOthersOnDeactivation` :
/// - à la FIN de sa lecture (chaque lecteur, à son arrêt) ;
/// - après une PAUSE de l'utilisateur, au bout de
///   `ContentPlaybackSessionLaw.userPauseReleaseDelay` ;
/// - après une INTERRUPTION qui ne débouche pas sur une reprise — fin sans
///   `shouldResume`, ou utilisateur qui a mis en pause pendant l'appel.
///
/// La libération est CENTRALE (`MediaSessionCoordinator`) : à la fin d'une
/// interruption, le coordinateur laisse aux lecteurs qui reprennent le temps
/// de `interruptionResumeGrace`, puis rend la session si aucun n'a repris.
/// Un lecteur Meeshy qui joue encore ailleurs l'empêche, comme toute prise de
/// session survenue depuis la demande.
public enum ContentSessionReleaseLaw {

    /// Le temps laissé aux lecteurs qui reprennent après une interruption :
    /// une reprise réactive la session et annule la libération.
    public static let interruptionResumeGrace: TimeInterval = 1

    /// Le temps que le dernier détenteur attend avant de désactiver la session
    /// (#9879) : au balayage, le canvas qui arrive prend la session dans les
    /// images qui suivent celui qui part — la désactivation s'efface, la
    /// musique des autres apps ne baisse pas puis ne remonte pas.
    public static let swipeHandoverGrace: TimeInterval = 0.4

    /// Cet événement clôt-il une interruption — après laquelle Meeshy rend la
    /// main si rien ne reprend ? L'appel Meeshy raccroché en est une
    /// (`callEndedShouldResume`) ; un casque débranché n'en est pas une.
    public static func endsAnInterruption(_ event: MediaSessionCoordinator.Event) -> Bool {
        switch event {
        case .interruptionEndedShouldResume, .interruptionEndedShouldNotResume, .callEndedShouldResume:
            return true
        case .interruptionBegan, .routeChangedOldDeviceUnavailable, .routeChangedOther:
            return false
        }
    }

    /// Une libération demandée s'exécute-t-elle ? Non si une lecture a repris
    /// la session depuis la demande, ni si un lecteur Meeshy joue encore.
    public static func mayRelease(activatedSinceRequest: Bool, meeshyStillPlays: Bool) -> Bool {
        !activatedSinceRequest && !meeshyStillPlays
    }
}
#endif
