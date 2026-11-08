import SwiftUI
import MeeshyUI

/// Vue P17 (#16945) — avant de décrocher : ce que l'autre verra, et mes
/// bascules Micro et Caméra. Les boutons sont ceux de la pilule (disque plat
/// dans le verre, actif = disque blanc plein, loi 1) : le micro s'allume quand
/// il est COUPÉ, la caméra quand elle FILME VRAIMENT — choisie et vivante,
/// comme la phrase (`IncomingPreAnswer.cameraFilms`).
struct IncomingPreAnswerBar: View {
    let peerName: String
    let choice: IncomingPreAnswer
    let exposure: IncomingPreAnswer.Exposure
    let cameraFilms: Bool
    let onToggleMicrophone: () -> Void
    let onToggleCamera: () -> Void

    private static let glyphDiameter: CGFloat = 40

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Text(IncomingPreAnswerCopy.exposure(exposure, peerName: peerName))
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.white)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, alignment: .leading)
            microphoneButton
            cameraButton
        }
        .padding(.leading, MeeshySpacing.lg)
        .padding(.trailing, MeeshySpacing.xs)
        .padding(.vertical, MeeshySpacing.xxs)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private var microphoneButton: some View {
        let isMuted = !choice.microphoneOn
        return CallPillButton(
            symbol: isMuted ? "mic.slash.fill" : "mic.fill",
            kind: isMuted ? .active : .normal,
            label: isMuted
                ? String(localized: "call.control.unmute", defaultValue: "Réactiver le micro", bundle: .main)
                : String(localized: "call.control.mute", defaultValue: "Couper le micro", bundle: .main),
            hint: IncomingPreAnswerCopy.microphoneHint(peerName: peerName),
            toggleState: isMuted,
            diameter: Self.glyphDiameter
        ) {
            HapticFeedback.light()
            onToggleMicrophone()
        }
    }

    private var cameraButton: some View {
        CallPillButton(
            symbol: cameraFilms ? "video.fill" : "video.slash.fill",
            kind: cameraFilms ? .active : .normal,
            label: choice.cameraOn
                ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main)
                : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main),
            hint: IncomingPreAnswerCopy.cameraHint(peerName: peerName),
            toggleState: cameraFilms,
            diameter: Self.glyphDiameter
        ) {
            HapticFeedback.light()
            onToggleCamera()
        }
    }
}

/// Les phrases de la barre d'avant le décroché (vue P17).
enum IncomingPreAnswerCopy {
    static func exposure(_ exposure: IncomingPreAnswer.Exposure, peerName: String) -> String {
        switch exposure {
        case .seenAndHeard:
            return String(format: String(localized: "call.incoming.preAnswer.seenAndHeard", defaultValue: "%@ vous verra en décrochant", bundle: .main), peerName)
        case .heardOnly:
            return String(format: String(localized: "call.incoming.preAnswer.heardOnly", defaultValue: "%@ vous entendra sans vous voir", bundle: .main), peerName)
        case .seenMuted:
            return String(format: String(localized: "call.incoming.preAnswer.seenMuted", defaultValue: "%@ vous verra, micro coupé", bundle: .main), peerName)
        case .neither:
            return String(format: String(localized: "call.incoming.preAnswer.neither", defaultValue: "%@ ne vous verra ni ne vous entendra", bundle: .main), peerName)
        }
    }

    static func microphoneHint(peerName: String) -> String {
        String(format: String(localized: "call.incoming.preAnswer.mic.hint", defaultValue: "Décide si %@ vous entend en décrochant", bundle: .main), peerName)
    }

    static func cameraHint(peerName: String) -> String {
        String(format: String(localized: "call.incoming.preAnswer.camera.hint", defaultValue: "Décide si %@ vous voit en décrochant", bundle: .main), peerName)
    }
}
