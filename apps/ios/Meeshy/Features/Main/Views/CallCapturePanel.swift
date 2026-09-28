import SwiftUI
import UIKit
import MeeshyUI

enum CallCaptureCopy {
    static var control: String {
        String(localized: "call.control.capture", defaultValue: "Capturer l'appel", bundle: .main)
    }

    static var controlCaption: String {
        String(localized: "call.control.capture.caption", defaultValue: "Capture", bundle: .main)
    }

    static var title: String {
        String(localized: "call.capture.title", defaultValue: "Capture", bundle: .main)
    }

    static var montageRow: String {
        String(localized: "call.capture.row.montage", defaultValue: "Montage", bundle: .main)
    }

    static var actionsRow: String {
        String(localized: "call.capture.row.actions", defaultValue: "Actions", bundle: .main)
    }

    static var shoot: String {
        String(localized: "call.capture.shoot", defaultValue: "Capturer", bundle: .main)
    }

    static var shootHint: String {
        String(localized: "call.capture.shoot.hint", defaultValue: "Enregistre le montage choisi dans Photos", bundle: .main)
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

struct CallCapturePanel: View {
    @ObservedObject var capture: CallCaptureController
    let subjects: [CallCaptureSubject]
    let tracks: [String: Any]
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            CallPanelHeader(title: CallCaptureCopy.title, onClose: onClose)
            CallPillRow(title: CallCaptureCopy.montageRow) {
                ForEach(CallMontageStyle.allCases, id: \.self) { style in
                    CallPillChip(
                        art: capture.thumbnails[style].map(CallPillChipArt.image) ?? .symbol(CallCaptureCopy.styleSymbol(style)),
                        caption: CallCaptureCopy.styleName(style),
                        label: CallCaptureCopy.styleName(style),
                        isSelected: capture.style == style
                    ) {
                        HapticFeedback.light()
                        capture.select(style)
                    }
                }
            }
            CallPillRow(title: CallCaptureCopy.actionsRow) {
                preview
                CallPillChip(
                    art: .symbol("camera.fill"),
                    caption: CallCaptureCopy.shoot,
                    label: CallCaptureCopy.shoot,
                    hint: CallCaptureCopy.shootHint
                ) {
                    Task { await capture.capture() }
                }
                .disabled(capture.status == .working)
                CallPillChip(
                    art: .symbol("person.crop.square"),
                    caption: CallCaptureCopy.faces,
                    label: CallCaptureCopy.faces,
                    hint: CallCaptureCopy.facesHint
                ) {
                    Task { await capture.captureFaces() }
                }
                .disabled(capture.status == .working)
            }
        }
        .task(id: CallCaptureSourceKey(subjects: subjects, tracks: tracks)) {
            capture.start(subjects: subjects, tracks: tracks)
        }
        .onDisappear { capture.stop() }
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

    private var preview: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.white.opacity(0.08))
            if let image = capture.preview {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                ProgressView()
                    .tint(.white)
            }
            if capture.status == .working {
                Color.black.opacity(0.35)
                ProgressView()
                    .tint(.white)
            }
        }
        .frame(width: 72, height: 128)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(Color.white.opacity(0.3), lineWidth: 0.5)
        )
        .padding(.horizontal, 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(CallCaptureCopy.preview)
        .accessibilityValue(capture.status == .working ? CallCaptureCopy.working : CallCaptureCopy.styleName(capture.style))
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
