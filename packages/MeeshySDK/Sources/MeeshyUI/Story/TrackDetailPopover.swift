import SwiftUI
import MeeshySDK

struct TrackDetailPopover: View {
    @Binding var track: TimelineTrack
    let totalDuration: Float
    var onChanged: (TimelineTrack) -> Void
    var onDelete: () -> Void
    var onDismiss: () -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        VStack(spacing: 12) {
            header
            Divider().overlay(MeeshyColors.indigo900.opacity(0.3))
            timingSection
            if track.type != .text {
                Divider().overlay(MeeshyColors.indigo900.opacity(0.3))
                audioSection
            }
            Divider().overlay(MeeshyColors.indigo900.opacity(0.3))
            deleteButton
        }
        .padding(14)
        .frame(width: 280)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(theme.backgroundSecondary.opacity(0.85))
                )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.4), radius: 20, y: 8)
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Image(systemName: track.type.icon)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(track.type.color)
            Text(track.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
            Spacer()
            Button { onDismiss() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Timing

    private var timingSection: some View {
        VStack(spacing: 8) {
            sectionLabel("TIMING")

            HStack(spacing: 12) {
                timingReadout(label: "Start", value: track.startTime)
                timingReadout(label: "Duration", value: track.duration ?? (totalDuration - track.startTime))
            }

            compactSlider(
                label: "Fade In",
                value: Binding(
                    get: { track.fadeIn ?? 0 },
                    set: { track.fadeIn = $0 > 0.05 ? $0 : nil; onChanged(track) }
                ),
                range: 0...3, unit: "s"
            )
            compactSlider(
                label: "Fade Out",
                value: Binding(
                    get: { track.fadeOut ?? 0 },
                    set: { track.fadeOut = $0 > 0.05 ? $0 : nil; onChanged(track) }
                ),
                range: 0...3, unit: "s"
            )
        }
    }

    private func timingReadout(label: String, value: Float) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 9, weight: .medium))
                .foregroundStyle(theme.textMuted)
                .textCase(.uppercase)
            Text(formatTimePrecise(value))
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(MeeshyColors.indigo300)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(MeeshyColors.indigo900.opacity(0.3))
        )
    }

    // MARK: - Audio

    private var audioSection: some View {
        VStack(spacing: 8) {
            sectionLabel("AUDIO")

            compactSlider(
                label: "Volume",
                value: Binding(
                    get: { track.volume ?? 1 },
                    set: { track.volume = $0; onChanged(track) }
                ),
                range: 0...1, unit: "%", displayMultiplier: 100
            )
            HStack {
                Text(String(localized: "story.trackDetail.loop", defaultValue: "Boucle", bundle: .module))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                Spacer()
                Toggle("", isOn: Binding(
                    get: { track.loop },
                    set: { track.loop = $0; onChanged(track) }
                ))
                .toggleStyle(SwitchToggleStyle(tint: track.type.color))
                .labelsHidden()
                .scaleEffect(0.8)
            }
        }
    }

    // MARK: - Delete Button

    private var deleteButton: some View {
        Button(role: .destructive) {
            onDelete()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "trash")
                    .font(.system(size: 11, weight: .medium))
                Text(String(localized: "story.trackDetail.delete", defaultValue: "Supprimer", bundle: .module))
                    .font(.system(size: 12, weight: .medium))
            }
            .foregroundStyle(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(MeeshyColors.error.opacity(0.1))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .strokeBorder(MeeshyColors.error.opacity(0.2), lineWidth: 0.5)
            )
        }
    }

    // MARK: - Section Label

    private func sectionLabel(_ text: String) -> some View {
        HStack {
            Text(text)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(MeeshyColors.indigo400.opacity(0.6))
                .tracking(1)
            Spacer()
        }
    }

    // MARK: - Compact Slider

    private func compactSlider(
        label: String,
        value: Binding<Float>,
        range: ClosedRange<Float>,
        unit: String,
        displayMultiplier: Float = 1
    ) -> some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .leading)
            ZStack {
                GeometryReader { geo in
                    let pct = CGFloat(
                        (value.wrappedValue - range.lowerBound) /
                        (range.upperBound - range.lowerBound)
                    )
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(
                            LinearGradient(
                                colors: [track.type.color.opacity(0.3), track.type.color.opacity(0.1)],
                                startPoint: .leading, endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * pct)
                }
                .frame(height: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))

                Slider(
                    value: Binding(
                        get: { Double(value.wrappedValue) },
                        set: { value.wrappedValue = Float($0) }
                    ),
                    in: Double(range.lowerBound)...Double(range.upperBound)
                )
                .tint(track.type.color)
            }
            Text(formattedValue(value.wrappedValue, unit: unit, multiplier: displayMultiplier))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 36, alignment: .trailing)
        }
    }

    // MARK: - Formatting

    private func formattedValue(_ value: Float, unit: String, multiplier: Float) -> String {
        if unit == "%" {
            return "\(Int(value * multiplier))%"
        }
        return String(format: "%.1f%@", value, unit)
    }

    private func formatTimePrecise(_ sec: Float) -> String {
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        let ms = Int((sec - Float(Int(sec))) * 100)
        return String(format: "%d:%02d.%02d", m, s, ms)
    }
}
