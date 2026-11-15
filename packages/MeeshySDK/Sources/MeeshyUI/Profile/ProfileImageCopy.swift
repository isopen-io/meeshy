import Foundation

/// Les libellés VoiceOver de la bannière et de la photo d'un profil, partagés par la fiche du SDK et la page de profil
/// de l'app (#10093) : un seul texte par geste, quel que soit l'écran qui l'offre.
public enum ProfileImageCopy {
    public static var bannerLabel: String {
        String(localized: "profile.banner.label", defaultValue: "Bannière de profil", bundle: .module)
    }

    public static var openFullscreenHint: String {
        String(localized: "profile.avatar.viewFullscreen.hint", defaultValue: "Ouvre la photo en plein écran", bundle: .module)
    }
}
