import SwiftUI
import UIKit
import MeeshyUI

enum CallCaptureCopy {
    static var control: String {
        String(localized: "call.control.capture", defaultValue: "Capturer l'appel", bundle: .main)
    }

    static var controlHint: String {
        String(localized: "call.control.capture.hint", defaultValue: "Libère l'écran pour choisir un montage et capturer l'appel", bundle: .main)
    }

    static var controlCaption: String {
        String(localized: "call.control.capture.caption", defaultValue: "Capture", bundle: .main)
    }

    static var faces: String {
        String(localized: "call.capture.faces", defaultValue: "Chaque visage", bundle: .main)
    }

    static var facesHint: String {
        String(localized: "call.capture.faces.hint", defaultValue: "Enregistre un portrait carré de chaque participant dans Photos", bundle: .main)
    }

    static var preview: String {
        String(localized: "call.capture.preview", defaultValue: "Aperçu du montage", bundle: .main)
    }

    static var working: String {
        String(localized: "call.capture.working", defaultValue: "Enregistrement…", bundle: .main)
    }

    static func styleName(_ style: CallMontageStyle) -> String {
        switch style {
        case .screen: return String(localized: "call.capture.style.screen", defaultValue: "Écran", bundle: .main)
        case .cover: return String(localized: "call.capture.style.cover", defaultValue: "Couverture", bundle: .main)
        case .gold: return String(localized: "call.capture.style.gold", defaultValue: "Or", bundle: .main)
        case .redcarpet: return String(localized: "call.capture.style.redcarpet", defaultValue: "Tapis rouge", bundle: .main)
        case .film: return String(localized: "call.capture.style.film", defaultValue: "Pellicule", bundle: .main)
        case .neon: return String(localized: "call.capture.style.neon", defaultValue: "Néon", bundle: .main)
        case .noir: return String(localized: "call.capture.style.noir", defaultValue: "Noir et blanc", bundle: .main)
        case .grid: return String(localized: "call.capture.style.grid", defaultValue: "Mosaïque", bundle: .main)
        case .strip: return String(localized: "call.capture.style.strip", defaultValue: "Photomaton", bundle: .main)
        case .polaroid: return String(localized: "call.capture.style.polaroid", defaultValue: "Polaroïd", bundle: .main)
        case .magazine: return String(localized: "call.capture.style.magazine", defaultValue: "Magazine", bundle: .main)
        case .comic: return String(localized: "call.capture.style.comic", defaultValue: "BD", bundle: .main)
        case .heart: return String(localized: "call.capture.style.heart", defaultValue: "Cœur", bundle: .main)
        }
    }

    static func styleSymbol(_ style: CallMontageStyle) -> String {
        switch style {
        case .screen: return "rectangle.inset.filled"
        case .cover: return "newspaper"
        case .gold: return "crown"
        case .redcarpet: return "star"
        case .film: return "film"
        case .neon: return "lightbulb"
        case .noir: return "camera.aperture"
        case .grid: return "square.grid.2x2"
        case .strip: return "rectangle.split.1x2"
        case .polaroid: return "photo"
        case .magazine: return "book.closed"
        case .comic: return "text.bubble"
        case .heart: return "heart"
        }
    }

    static func outcome(_ status: CallCaptureStatus) -> (message: String, isError: Bool)? {
        switch status {
        case .idle, .working:
            return nil
        case .saved:
            return (String(localized: "call.capture.saved", defaultValue: "Capture enregistrée", bundle: .main), false)
        case .videoSaved:
            return (String(localized: "call.capture.video.saved", defaultValue: "Vidéo enregistrée", bundle: .main), false)
        case .facesSaved(let count):
            return (String(format: String(localized: "call.capture.faces.saved", defaultValue: "%d visages enregistrés", bundle: .main), count), false)
        case .denied:
            return (String(localized: "call.capture.denied", defaultValue: "Autorisez Meeshy à ajouter des photos dans Réglages pour enregistrer vos captures.", bundle: .main), true)
        case .noVideo:
            return (String(localized: "call.capture.noVideo", defaultValue: "Aucune image à capturer pour le moment", bundle: .main), true)
        case .failed:
            return (String(localized: "call.capture.failed", defaultValue: "La capture n'a pas pu être enregistrée", bundle: .main), true)
        }
    }
}

struct CallCaptureSourceKey: Equatable {
    let subjects: [CallCaptureSubject]
    let trackIdentities: [String: ObjectIdentifier]

    init(subjects: [CallCaptureSubject], tracks: [String: Any]) {
        self.subjects = subjects
        self.trackIdentities = tracks.mapValues { ObjectIdentifier($0 as AnyObject) }
    }
}

struct CallCaptureFlash: View {
    let trigger: Int
    let reduceMotion: Bool

    @State private var opacity: Double = 0

    var body: some View {
        Color.white
            .opacity(opacity)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .task(id: trigger) {
                guard trigger > 0 else { return }
                opacity = reduceMotion ? 0.35 : 0.85
                try? await Task.sleep(nanoseconds: 30_000_000)
                withAnimation(.easeOut(duration: reduceMotion ? 0.3 : 0.45)) { opacity = 0 }
            }
    }
}

struct CallCaptureOutcomeAnnouncer: View {
    @ObservedObject var capture: CallCaptureController

    var body: some View {
        Color.clear
            .frame(width: 0, height: 0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .adaptiveOnChange(of: capture.status) { _, status in
                guard let outcome = CallCaptureCopy.outcome(status) else { return }
                if outcome.isError {
                    FeedbackToastManager.shared.showError(outcome.message)
                } else {
                    FeedbackToastManager.shared.showSuccess(outcome.message)
                }
                UIAccessibility.post(notification: .announcement, argument: outcome.message)
            }
    }
}
