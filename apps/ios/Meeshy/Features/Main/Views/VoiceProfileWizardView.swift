import SwiftUI
import MeeshySDK

struct VoiceProfileWizardView: View {
    let accentColor: String

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 24) {
                HStack {
                    Spacer()
                    Button {
                        HapticFeedback.light()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 28))
                            .foregroundStyle(theme.textMuted)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)

                Spacer()

                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 72))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                Text("Voice Profile")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)

                Text("Coming soon — record your voice to enable personalized voice cloning for translated audio messages.")
                    .font(.system(size: 15, weight: .regular))
                    .multilineTextAlignment(.center)
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, 32)

                Spacer()
            }
        }
    }
}
