import SwiftUI
import MeeshyUI

// MARK: - Video Filter Control View

struct VideoFilterControlView: View {
    @Binding var config: VideoFilterConfig
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        VStack(spacing: 16) {
            header
            sliders
            resetButton
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Image(systemName: "camera.filters")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(MeeshyColors.brandGradient)

            Text("Filtres video")
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)

            Spacer()

            Toggle("", isOn: $config.isEnabled)
                .labelsHidden()
                .tint(MeeshyColors.indigo500)
        }
    }

    // MARK: - Sliders

    private var sliders: some View {
        VStack(spacing: 12) {
            filterSlider(
                icon: "thermometer.medium",
                label: "Temperature",
                value: temperatureBinding,
                range: 0...1,
                neutral: 0.5
            )

            filterSlider(
                icon: "sun.max",
                label: "Luminosite",
                value: $config.brightness,
                range: -0.5...0.5,
                neutral: 0
            )

            filterSlider(
                icon: "circle.lefthalf.filled",
                label: "Contraste",
                value: $config.contrast,
                range: 0.5...1.5,
                neutral: 1.0
            )

            filterSlider(
                icon: "paintpalette",
                label: "Saturation",
                value: $config.saturation,
                range: 0...2,
                neutral: 1.0
            )

            filterSlider(
                icon: "plusminus.circle",
                label: "Exposition",
                value: $config.exposure,
                range: -1...1,
                neutral: 0
            )
        }
        .opacity(config.isEnabled ? 1 : 0.4)
        .disabled(!config.isEnabled)
    }

    // MARK: - Slider Row

    private func filterSlider(
        icon: String,
        label: String,
        value: Binding<Float>,
        range: ClosedRange<Float>,
        neutral: Float
    ) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .frame(width: 20)

            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
                .frame(width: 80, alignment: .leading)

            Slider(value: value, in: range)
                .tint(MeeshyColors.indigo500)

            Text(formatValue(value.wrappedValue, neutral: neutral))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundColor(.secondary)
                .frame(width: 36, alignment: .trailing)
        }
    }

    // MARK: - Reset

    private var resetButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                config = VideoFilterConfig()
            }
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 12, weight: .semibold))
                Text("Reinitialiser")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(MeeshyColors.indigo500)
        }
        .opacity(isModified ? 1 : 0.3)
        .disabled(!isModified)
    }

    // MARK: - Helpers

    private var temperatureBinding: Binding<Float> {
        Binding(
            get: { (config.temperature - 3000) / 7000 },
            set: { config.temperature = $0 * 7000 + 3000 }
        )
    }

    private var isModified: Bool {
        config != VideoFilterConfig()
    }

    private func formatValue(_ value: Float, neutral: Float) -> String {
        let diff = value - neutral
        if abs(diff) < 0.01 { return "0" }
        let sign = diff > 0 ? "+" : ""
        return "\(sign)\(String(format: "%.1f", diff))"
    }
}
