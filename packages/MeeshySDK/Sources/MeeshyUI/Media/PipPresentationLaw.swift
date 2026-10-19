import Foundation

/// Où une vidéo est montrée : dans un fil, une bulle, une page (`inline`), ou
/// seule à l'écran (`fullscreen`).
public nonisolated enum VideoPresentation: Sendable, Equatable {
    case inline
    case fullscreen

    public nonisolated static func of(_ style: MeeshyVideoPlayer.Style) -> VideoPresentation {
        switch style {
        case .fullscreen: return .fullscreen
        case .flat, .inline, .mini: return .inline
        }
    }
}

/// **PiP = plein écran** (#11041, décision porteur e du 2026-10-20).
///
/// Une vidéo qui n'est pas en plein écran — bulle de message, post du fil,
/// page d'un post, profil visité, commentaire inline — ne configure JAMAIS de
/// fenêtre PiP, quelle que soit son origine : `configurePip` arme
/// `canStartPictureInPictureAutomaticallyFromInline`, donc une surface inline
/// configurée ouvrirait une fenêtre à la sortie de l'app. Une vidéo en plein
/// écran (réel, galerie, plein écran d'un message, d'un post ou d'un
/// commentaire) la configure si elle la demande.
///
/// La protection d'une vidéo (`ProtectedPlaybackPolicy`) reste une condition à
/// part, appliquée par la surface.
public nonisolated enum PipPresentationLaw {

    public nonisolated static func mayConfigurePip(presentation: VideoPresentation, requestsPip: Bool) -> Bool {
        presentation == .fullscreen && requestsPip
    }
}

extension MeeshyVideoPlayer {

    /// La surface de ce lecteur configure-t-elle une fenêtre PiP ? Source
    /// UNIQUE pour les renderers : le style dit la présentation, le jeu de
    /// contrôles dit la demande.
    nonisolated static func surfaceEnablesPip(style: Style, controls: ControlSet) -> Bool {
        PipPresentationLaw.mayConfigurePip(presentation: .of(style), requestsPip: controls.contains(.pip))
    }
}
