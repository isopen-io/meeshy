import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le détail de la batterie d'une personne pendant un épisode (#14147) : niveau, charge, mode économie, autonomie
/// estimée et l'âge du relevé. Feuille Equatable : l'état servi et l'instant de rendu, rien d'autre.
struct BatteryDetailCard: View, Equatable {
    let state: BatteryReaderState
    let now: Date
    let isDark: Bool

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            BatteryGlyph(state: state, size: 22).equatable()
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(Self.headline(state))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(isDark ? Color.white : Color.primary)
                ForEach(Self.details(state, now: now), id: \.self) { line in
                    Text(line)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MeeshySpacing.md)
        .background(BatteryGlyph.tint(for: state).opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("battery.detail")
    }

    static func headline(_ state: BatteryReaderState) -> String {
        BatteryAnnouncementWording.spoken(state)
    }

    /// Les lignes du détail, dans l'ordre : mode économie, autonomie, appareil, âge du relevé.
    static func details(_ state: BatteryReaderState, now: Date) -> [String] {
        var lines: [String] = []
        if state.lowPower {
            lines.append(String(localized: "battery.detail.lowPower", defaultValue: "Mode économie d'énergie activé", bundle: .main))
        }
        if let minutes = state.estimatedMinutes, !state.charging, state.phase != .off {
            lines.append(BatteryAnnouncementWording.autonomy(minutes: minutes))
        }
        lines.append(measured(state.measuredAt, now: now))
        return lines
    }

    /// « Relevé il y a 4 min » — la source unique du temps relatif (`RelativeTimeFormatter`).
    static func measured(_ at: Date, now: Date) -> String {
        let relative = RelativeTimeFormatter.longString(for: min(at, now), now: now)
        return String(format: String(localized: "battery.detail.measured", defaultValue: "Relevé %@", bundle: .main), relative)
    }
}

/// Le détail vivant d'une personne : rien hors épisode, le cache tout de suite, puis chaque changement. L'âge du
/// relevé se rafraîchit chaque minute.
struct BatteryDetailSection: View {
    let userId: String
    @State private var state: BatteryReaderState?
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if let state {
                TimelineView(.periodic(from: .now, by: 60)) { context in
                    BatteryDetailCard(state: state, now: context.date, isDark: colorScheme == .dark).equatable()
                }
            }
        }
        .task(id: userId) {
            state = nil
            for await next in BatteryLiveState.stream(of: userId).values {
                state = next
            }
        }
    }
}
