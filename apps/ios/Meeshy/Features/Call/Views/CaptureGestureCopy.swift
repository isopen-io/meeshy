import Foundation

/// APP-4 / CAM-5 — UNE formulation du geste de capture, partagée par le viseur
/// et le mode capture de l'appel : même geste, même phrase. Elle reprend mot
/// pour mot celle du viseur (`ComposerSceneCameraCopy.hint`, mode photo), qui
/// basculera sur cette clé avec CAM-5.
enum CaptureGestureCopy {
    static var photoOrVideo: String {
        String(localized: "capture.gesture.photoOrVideo",
               defaultValue: "toucher deux fois pour une photo · maintenir pour filmer",
               bundle: .main)
    }
}
