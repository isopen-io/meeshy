import SwiftUI
import MeeshySDK
import MeeshyUI

struct SyncPill: View {
    let state: PillState
    @StateObject private var rotator = SyncPillRotator()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    let onSingleTap: () -> Void
    let onDoubleTap: (OutboxUIItem?) -> Void

    init(
        state: PillState,
        onSingleTap: @escaping () -> Void = {},
        onDoubleTap: @escaping (OutboxUIItem?) -> Void = { _ in }
    ) {
        self.state = state
        self.onSingleTap = onSingleTap
        self.onDoubleTap = onDoubleTap
    }

    private var currentVisibleItem: OutboxUIItem? {
        guard !state.items.isEmpty else { return nil }
        let i = min(rotator.currentIndex, state.items.count - 1)
        return state.items[i]
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
                if let visible = currentVisibleItem {
                    SyncPillItemView(item: visible, index: rotator.currentIndex)
                        .equatable()
                        .transition(
                            .asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .top)),
                                removal: .opacity.combined(with: .move(edge: .bottom))
                            )
                        )
                        .id(visible.id)
                        .accessibilityRespondsToUserInteraction(false)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(chromeBackground))
            .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
            .adaptiveOnChange(of: state.items.count) { _, newCount in
                rotator.setItemCount(newCount)
            }
            .adaptiveOnChange(of: reduceMotion) { _, newValue in
                rotator.setAutoRotation(!newValue)
            }
            .onAppear {
                rotator.setAutoRotation(!reduceMotion)
                rotator.setItemCount(state.items.count)
            }
            .gesture(
                SpatialTapGesture(count: 2)
                    .onEnded { _ in onDoubleTap(currentVisibleItem) }
                    .exclusively(before:
                        SpatialTapGesture(count: 1)
                            .onEnded { _ in
                                rotator.advance()
                                onSingleTap()
                            }
                    )
            )
            .simultaneousGesture(
                DragGesture(minimumDistance: 30)
                    .onEnded { value in
                        guard reduceMotion else { return }
                        if value.translation.width < -30 {
                            rotator.advance()
                        } else if value.translation.width > 30 {
                            rotator.rewind()
                        }
                    }
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
