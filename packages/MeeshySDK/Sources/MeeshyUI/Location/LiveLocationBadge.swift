import SwiftUI
import MeeshySDK

public struct LiveLocationBadge: View {
    let username: String
    let remainingTime: TimeInterval
    let accentColor: String
    let onStop: (() -> Void)?

    @State private var isPulsing = false

    public init(username: String, remainingTime: TimeInterval, accentColor: String = "08D9D6", onStop: (() -> Void)? = nil) {
        self.username = username; self.remainingTime = remainingTime
        self.accentColor = accentColor; self.onStop = onStop
    }

    public var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Color(hex: "2ECC71"))
                .frame(width: 8, height: 8)
                .scaleEffect(isPulsing ? 1.3 : 1.0)
                .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: isPulsing)

            Image(systemName: "location.fill")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))

            VStack(alignment: .leading, spacing: 1) {
                Text("\(username) partage sa position")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)

                Text(formattedRemaining)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.secondary)
            }

            Spacer()

            if let onStop {
                Button {
                    onStop()
                } label: {
                    Text("Arreter")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(Color(hex: "FF6B6B"))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(Color(hex: "FF6B6B").opacity(0.12))
                        )
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 0.5)
                )
        )
        .onAppear { isPulsing = true }
    }

    private var formattedRemaining: String {
        let minutes = Int(remainingTime) / 60
        let seconds = Int(remainingTime) % 60
        if minutes >= 60 {
            let hours = minutes / 60
            let mins = minutes % 60
            return "\(hours)h\(String(format: "%02d", mins)) restantes"
        }
        if minutes > 0 {
            return "\(minutes)min\(String(format: "%02d", seconds)) restantes"
        }
        return "\(seconds)s restantes"
    }
}

// MARK: - Live Location Duration Picker

public struct LiveLocationDurationPicker: View {
    @Binding var selectedDuration: LiveLocationDuration
    let accentColor: String

    public init(selectedDuration: Binding<LiveLocationDuration>, accentColor: String = "08D9D6") {
        self._selectedDuration = selectedDuration
        self.accentColor = accentColor
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "timer")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text("Duree du partage")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.primary)
            }

            HStack(spacing: 6) {
                ForEach(LiveLocationDuration.allCases) { duration in
                    Button {
                        selectedDuration = duration
                    } label: {
                        Text(duration.displayText)
                            .font(.system(size: 11, weight: selectedDuration == duration ? .bold : .medium))
                            .foregroundColor(selectedDuration == duration ? .white : Color(hex: accentColor))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(selectedDuration == duration ? Color(hex: accentColor) : Color(hex: accentColor).opacity(0.12))
                            )
                    }
                }
            }
        }
    }
}
