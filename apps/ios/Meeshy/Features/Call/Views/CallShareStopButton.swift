import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Arrêter » de la capsule de partage : un seul bouton, posé sur le verre
/// rouge de la bannière ET sur celui du point de retour au-dessus d'un plein
/// écran. Blanc sur le verre, encre rouge (planche S1).
struct CallShareStopButton: View {
    let stop: () -> Void

    var body: some View {
        Button {
            stop()
            HapticFeedback.light()
        } label: {
            Label(CallScreenShareCopy.stopCaption, systemImage: "rectangle.on.rectangle.slash")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.errorInk)
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.md)
                .frame(minHeight: 44)
                .background(Capsule().fill(Color.white))
        }
        .pressable()
        .accessibilityLabel(CallScreenShareCopy.label(isSharing: true))
    }
}
