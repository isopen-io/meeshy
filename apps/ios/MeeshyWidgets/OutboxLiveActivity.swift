import ActivityKit
import WidgetKit
import SwiftUI

/// **L'envoi long, dans la Dynamic Island et sur l'écran verrouillé** (#9680).
///
/// Sobre : le glyphe de l'envoi, son libellé court, le compte restant. Tout le
/// texte arrive localisé par l'app (`OutboxActivitySnapshot`), avec les mots
/// de la pastille de synchronisation.
struct OutboxLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: OutboxActivityAttributes.self) { context in
            OutboxActivityLockScreenView(state: context.state)
                .activityBackgroundTint(Color.black.opacity(0.55))
                .activitySystemActionForegroundColor(OutboxActivityStyle.brand)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    OutboxActivityGlyph(state: context.state, size: 36)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    OutboxActivityCount(state: context.state)
                        .font(.title3.weight(.semibold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.label)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: OutboxActivityStyle.symbol(for: context.state))
                    .foregroundStyle(OutboxActivityStyle.tint(for: context.state.phase))
                    .accessibilityLabel(context.state.label)
            } compactTrailing: {
                OutboxActivityCount(state: context.state)
                    .font(.caption.weight(.semibold))
            } minimal: {
                Image(systemName: OutboxActivityStyle.symbol(for: context.state))
                    .foregroundStyle(OutboxActivityStyle.tint(for: context.state.phase))
                    .accessibilityLabel(context.state.label)
            }
            .keylineTint(OutboxActivityStyle.brand)
        }
    }
}

private enum OutboxActivityStyle {
    static let brand = Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)
    static let warning = Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)
    static let success = Color(red: 0x34 / 255, green: 0xD3 / 255, blue: 0x99 / 255)
    static let error = Color(red: 0xF8 / 255, green: 0x71 / 255, blue: 0x71 / 255)

    static func tint(for phase: OutboxActivitySnapshot.Phase) -> Color {
        switch phase {
        case .sending: return brand
        case .waitingForNetwork: return warning
        case .sent: return success
        case .failed: return error
        }
    }

    static func symbol(for state: OutboxActivitySnapshot) -> String {
        state.phase == .waitingForNetwork ? "wifi.slash" : state.symbol
    }
}

private struct OutboxActivityGlyph: View {
    let state: OutboxActivitySnapshot
    let size: CGFloat

    var body: some View {
        ZStack {
            Circle().fill(OutboxActivityStyle.tint(for: state.phase).opacity(0.22))
            Image(systemName: OutboxActivityStyle.symbol(for: state))
                .font(.system(size: size * 0.45, weight: .semibold))
                .foregroundStyle(OutboxActivityStyle.tint(for: state.phase))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Le compte des envois restants — rien quand il n'y en a qu'un ou aucun : un
/// « 1 » n'apprend rien que le libellé ne dise déjà.
private struct OutboxActivityCount: View {
    let state: OutboxActivitySnapshot

    var body: some View {
        if state.remaining > 1 {
            Text("\(state.remaining)")
                .monospacedDigit()
                .foregroundStyle(OutboxActivityStyle.tint(for: state.phase))
        } else {
            Image(systemName: state.phase == .sent ? "checkmark" : "ellipsis")
                .foregroundStyle(OutboxActivityStyle.tint(for: state.phase))
                .accessibilityHidden(true)
        }
    }
}

private struct OutboxActivityLockScreenView: View {
    let state: OutboxActivitySnapshot

    var body: some View {
        HStack(spacing: 12) {
            OutboxActivityGlyph(state: state, size: 40)
            Text(state.label)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
            Spacer(minLength: 8)
            OutboxActivityCount(state: state)
                .font(.title3.weight(.semibold))
        }
        .padding(16)
        .accessibilityElement(children: .combine)
    }
}
