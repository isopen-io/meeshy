import AVFoundation
import Foundation

/// **Le vocabulaire du flash — un seul, pour la feuille ET le viseur en scène**
/// (#4080, vue `2b` : « ◐ FLASH AUTO »).
///
/// Ces trois règles vivaient en privé dans `CameraView`. La barre du viseur en
/// scène a besoin des mêmes ; les recopier aurait fait diverger le CYCLE au
/// premier réglage — et un cycle qui diffère entre deux écrans du même appareil
/// est le genre d'écart que personne ne remarque avant de le subir.
///
/// L'ordre du cycle est celui d'origine, et il n'est pas arbitraire : `off` est
/// le repos, `on` la contrainte explicite, `auto` la délégation. Passer de
/// « jamais » à « toujours » puis à « quand il faut » fait parcourir les trois
/// intentions dans l'ordre où on les envisage.
nonisolated enum ComposerCameraFlash {

    static func next(after mode: AVCaptureDevice.FlashMode) -> AVCaptureDevice.FlashMode {
        switch mode {
        case .off: return .on
        case .on:  return .auto
        default:   return .off
        }
    }

    static func symbol(for mode: AVCaptureDevice.FlashMode) -> String {
        switch mode {
        case .on:   return "bolt.fill"
        case .auto: return "bolt.badge.automatic.fill"
        default:    return "bolt.slash.fill"
        }
    }

    /// **Le libellé dit l'ÉTAT, pas l'action** — contrairement au chevron de la
    /// description, et pour une raison qui tient : un flash a trois positions,
    /// donc « activer » ne dirait pas laquelle vient ensuite. C'est l'état
    /// courant qui renseigne, et le trait `.isButton` dit déjà qu'un appui
    /// change quelque chose.
    @MainActor
    static func label(for mode: AVCaptureDevice.FlashMode) -> String {
        switch mode {
        case .on:
            return String(localized: "camera.flash.on",
                          defaultValue: "Flash activé", bundle: .main)
        case .auto:
            return String(localized: "camera.flash.auto",
                          defaultValue: "Flash automatique", bundle: .main)
        default:
            return String(localized: "camera.flash.off",
                          defaultValue: "Flash désactivé", bundle: .main)
        }
    }
}
