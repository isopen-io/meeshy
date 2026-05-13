import SwiftUI
import MeeshySDK

struct ComposerTextFormatBand: View {
    let elementId: String
    @Bindable var viewModel: StoryComposerViewModel
    let onDone: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: { onDone() }) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(MeeshyColors.success)
            }
            .accessibilityLabel("Done")

            Divider().frame(height: 24)

            // Font picker (sheet trigger — wired in Phase 4)
            Button(action: {}) {
                HStack(spacing: 4) {
                    Image(systemName: "textformat").font(.system(size: 14))
                    Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
                }
                .foregroundColor(.white)
            }
            .accessibilityLabel("Font")

            // Bold / Italic / Underline (toggles — wired in Phase 4)
            ForEach(["bold", "italic", "underline"], id: \.self) { sym in
                Button(action: {}) {
                    Image(systemName: sym).font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                }
                .accessibilityLabel(sym.capitalized)
            }

            Divider().frame(height: 24)

            // Color swatches (8 swatches + system picker — wired in Phase 4)
            ForEach([
                MeeshyColors.indigo400, MeeshyColors.coral, MeeshyColors.success,
                MeeshyColors.warning, MeeshyColors.info, .white, .black, .gray
            ], id: \.self) { color in
                Circle().fill(color).frame(width: 18, height: 18)
                    .overlay(Circle().stroke(.white.opacity(0.3), lineWidth: 0.5))
            }

            Divider().frame(height: 24)

            // Alignment (left / center / right / justify — wired in Phase 4)
            ForEach(["text.alignleft", "text.aligncenter", "text.alignright", "text.justify"], id: \.self) { sym in
                Image(systemName: sym).font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.white)
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .frame(height: 50)
        .background(.ultraThinMaterial)
    }
}
