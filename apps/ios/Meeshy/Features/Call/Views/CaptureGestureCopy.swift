import Foundation

/// APP-4 / CAM-5 — UNE formulation du geste de capture, partagée par le viseur
/// et le mode capture de l'appel : même geste, même phrase, même clé. La clé
/// commune est celle du viseur (`ComposerSceneCameraCopy.hint`, mode photo).
enum CaptureGestureCopy {
    static var photoOrVideo: String {
        String(localized: "composer.camera.hint.photo",
               defaultValue: "toucher deux fois pour une photo · maintenir pour filmer",
               bundle: .main)
    }
}
