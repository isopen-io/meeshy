import SwiftUI
import MeeshyUI

struct SyncPill: View {
    let state: PillState
    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    let onSingleTap: () -> Void
    let onDoubleTap: () -> Void

    init(
        state: PillState,
        onSingleTap: @escaping () -> Void = {},
        onDoubleTap: @escaping () -> Void = {}
    ) {
        self.state = state
        self.onSingleTap = onSingleTap
        self.onDoubleTap = onDoubleTap
    }

    var body: some View {
        if case .hidden = state {
            EmptyView()
        } else {
            HStack(spacing: 8) {
                Image(systemName: chromeIcon)
                    .font(.system(size: 12, weight: .semibold))
                Text(chromeTitle)
                    .font(.system(size: 12, weight: .semibold))
                if state.items.count > 1 {
                    Text("\(rotator.currentIndex + 1)/\(state.items.count)")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundColor(.secondary)
                }
                if !state.items.isEmpty {
                    let visible = state.items[min(rotator.currentIndex, state.items.count - 1)]
                    SyncPillItemView(item: visible, index: rotator.currentIndex)
                        .transition(.opacity)
                        .id(visible.id)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(chromeBackground))
            .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
            .onChange(of: state.items.count) { newCount in
                rotator.setItemCount(newCount)
            }
            .onAppear { rotator.setItemCount(state.items.count) }
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { _ in onDoubleTap() }
                    .exclusively(before:
                        SpatialTapGesture(count: 1)
                            .onEnded { _ in
                                if reduceMotion { return }
                                rotator.advance(); onSingleTap()
                            }
                    )
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
        }
    }

    private var chromeIcon: String {
        switch state {
        case .syncing: return "arrow.triangle.2.circlepath"
        case .offline: return "wifi.slash"
        case .failed:  return "exclamationmark.triangle.fill"
        case .hidden:  return ""
        }
    }

    private var chromeTitle: String {
        switch state {
        case .syncing: return "Synchronisation"
        case .offline(let items): return "Hors ligne — \(items.count) en attente"
        case .failed(let items):  return "Échec — \(items.count) à réessayer"
        case .hidden:             return ""
        }
    }

    private var chromeBackground: Color {
        switch state {
        case .syncing:
            return MeeshyColors.SyncPillPalette.cycled(index: rotator.currentIndex).background(scheme: colorScheme)
        case .offline:
            return MeeshyColors.syncPillOfflineBackground(colorScheme)
        case .failed:
            return MeeshyColors.syncPillFailedBackground(colorScheme)
        case .hidden:
            return Color.clear
        }
    }

    private var accessibilityText: String {
        switch state {
        case .syncing(let items):
            let preview = items.first?.titlePreview ?? ""
            return "\(items.count) messages en cours d'envoi. Premier : \(preview)"
        case .offline(let items): return "Hors ligne. \(items.count) en attente."
        case .failed(let items):  return "Échec. \(items.count) à réessayer."
        case .hidden:             return ""
        }
    }
}
