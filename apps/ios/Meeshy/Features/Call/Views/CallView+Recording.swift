import SwiftUI
import MeeshySDK
import MeeshyUI

// #8437 — le bouton Enregistrer : au repos, il ouvre DANS la pilule le choix
// de CE QU'ON enregistre (Audio ou Vidéo) avant de
// solliciter l'accord de tous (#8550) ; pendant une demande ou un
// enregistrement, il l'arrête d'un toucher.

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
            CallPillButton(
                symbol: "record.circle",
                kind: layer.openPanel == .record ? .active : .normal,
                label: CallRecordingCopy.label(isActive: false),
                caption: captioned ? CallRecordingCopy.caption : nil,
                hint: CallRecordingCopy.kindHint,
                toggleState: layer.openPanel == .record,
                diameter: diameter
            ) {
                togglePanel(.record)
            }
        }
    }

    /// G3.2 — l'option Enregistrer, candidate du `ViewThatFits` de la pilule.
    var recordingPanelRows: some View {
        CallRecordingPanel(onBack: backToMenu, onClose: closePanel) { kind in
            HapticFeedback.light()
            _ = callManager.recording.request(kind: kind)
            closePanel()
        }
    }
}
