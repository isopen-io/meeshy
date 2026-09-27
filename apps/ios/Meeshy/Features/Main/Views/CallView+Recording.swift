import SwiftUI
import MeeshySDK
import MeeshyUI

// #8437 — le bouton Enregistrer : au repos, il demande CE QU'ON enregistre
// (« Audio seulement » ou « Audio et vidéo ») avant de solliciter l'accord de
// tous ; pendant une demande ou un enregistrement, il l'arrête d'un toucher.

extension CallView {
    @ViewBuilder
    func recordingActionButton(captioned: Bool, diameter: CGFloat) -> some View {
        if callManager.recording.phase.isActive {
            CallPillButton(
                symbol: "stop.circle.fill",
                kind: .destructive,
                label: CallRecordingCopy.label(isActive: true),
                caption: captioned ? CallRecordingCopy.caption : nil,
                hint: CallRecordingCopy.hint,
                toggleState: true,
                diameter: diameter
            ) {
                _ = callManager.recording.stop()
            }
        } else {
            Menu {
                ForEach([CallRecordingKind.audio, .video], id: \.self) { kind in
                    Button {
                        HapticFeedback.light()
                        _ = callManager.recording.request(kind: kind)
                    } label: {
                        Label(CallRecordingCopy.kindLabel(kind), systemImage: kind == .video ? "video.circle" : "waveform.circle")
                    }
                }
            } label: {
                CallPillButtonLabel(
                    symbol: "record.circle",
                    kind: .normal,
                    caption: captioned ? CallRecordingCopy.caption : nil,
                    diameter: diameter
                )
            }
            .menuIndicator(.hidden)
            .accessibilityLabel(CallRecordingCopy.label(isActive: false))
            .accessibilityHint(CallRecordingCopy.kindHint)
        }
    }
}
