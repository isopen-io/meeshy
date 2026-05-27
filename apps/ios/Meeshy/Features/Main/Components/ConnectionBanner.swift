import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Single inline pill at the top of every NavigationStack content view
/// (mounted via `.safeAreaInset(edge: .top, spacing: 0)` on `RootView` /
/// `iPadRootView`). Acts as the **orchestrator** for the unified
/// `SyncPill` chip: it collects every signal worth surfacing
/// (`ConnectionStatus`, offline outbox items) and emits a single list of
/// `SyncPillEntry` to rotate through.
///
/// Display order in the rotation (priority high to low):
///   1. `.offline`        — device has no network (red dot + wifi.slash)
///   2. `.disconnected`   — socket dropped, awaiting reconnect (amber dot)
///   3. `.syncing` (when no specific item) — generic background sync
///   4. Each pending outbox item — one entry per item, label = the
///      concrete French operation (`Envoi d'audio`, `Envoi d'image`, …),
///      carries `source` so taps route to the conversation / post / story.
struct ConnectionBanner: View {
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()

    /// Callback invoked when the user taps an entry whose `source` is
    /// non-nil. The mount point (`RootView` / `iPadRootView`) wires this
    /// to its router to push onto the navigation stack.
    private let onItemTap: ((OutboxUIItem.Source) -> Void)?

    init(onItemTap: ((OutboxUIItem.Source) -> Void)? = nil) {
        self.onItemTap = onItemTap
    }

    private var isDisconnected: Bool { statusVM.status == .disconnected }
    private var isOffline: Bool { statusVM.status == .offline }
    private var isSyncing: Bool { statusVM.status == .syncing }

    /// Items currently held in the offline outbox queue, derived from
    /// `SyncPillViewModel.state`.
    private var pendingItems: [OutboxUIItem] {
        syncPillVM.state.items
    }

    /// Compose the unified rotation list. Empty when there is nothing to
    /// surface — the pill collapses to `EmptyView` automatically.
    private var entries: [SyncPillEntry] {
        var result: [SyncPillEntry] = []

        if isOffline {
            result.append(SyncPillEntry(
                id: "status.offline",
                label: String(localized: "connection.offline", defaultValue: "Hors ligne"),
                iconName: "wifi.slash",
                dotStyle: .error,
                source: nil
            ))
        } else if isDisconnected {
            result.append(SyncPillEntry(
                id: "status.disconnected",
                label: String(localized: "connection.reconnecting", defaultValue: "Reconnexion"),
                iconName: nil,
                dotStyle: .warning,
                source: nil
            ))
        } else if isSyncing && pendingItems.isEmpty {
            // Connection-level sync without per-item detail (e.g. socket
            // catch-up read receipts, presence). When pendingItems are
            // present we let those drive the label instead.
            result.append(SyncPillEntry(
                id: "status.syncing",
                label: String(localized: "connection.syncing", defaultValue: "Synchronisation"),
                iconName: nil,
                dotStyle: .brand,
                source: nil
            ))
        }

        for item in pendingItems {
            result.append(SyncPillEntry(
                id: item.id,
                label: SyncPillLabels.operationLabel(for: item),
                iconName: itemIcon(for: item.iconKind),
                dotStyle: item.status == .failed ? .error : .brand,
                source: item.source
            ))
        }

        return result
    }

    var body: some View {
        SyncPill(entries: entries, onTap: onItemTap)
    }

    /// Maps an `OutboxUIItem.IconKind` to the SFSymbol used as the
    /// leading icon for an entry. Returns `nil` for the generic `.text`
    /// case so the pulsing dot is used instead — keeps the bandeau
    /// visually quiet for the most common case (plain text messages).
    private func itemIcon(for kind: OutboxUIItem.IconKind) -> String? {
        switch kind {
        case .text:     return nil
        case .audio:    return "mic.fill"
        case .image:    return "photo.fill"
        case .video:    return "play.rectangle.fill"
        case .file:     return "paperclip"
        case .reaction: return "face.smiling.fill"
        case .sticker:  return "face.dashed.fill"
        case .none:     return nil
        }
    }
}
