import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Single inline pill at the top of every NavigationStack content view
/// (mounted via `.safeAreaInset(edge: .top, spacing: 0)` on `RootView` /
/// `iPadRootView`). Acts as the **orchestrator** for the unified
/// `SyncPill` chip: it collects every signal worth surfacing
/// (`ConnectionStatus`, offline outbox items, transient online return)
/// and emits a single list of `SyncPillEntry` to rotate through.
///
/// Display order in the rotation (priority high to low):
///   1. `.offline`            — device has no network (amber dot + wifi.slash)
///   2. `.justReturnedOnline` — transient ~4 s entry that confirms network
///                              has come back (green dot + wifi)
///   3. `.disconnected`       — socket dropped, awaiting reconnect (amber)
///   4. `.syncing` (no items) — generic background sync (indigo)
///   5. Each pending outbox item — one entry per item, label = the concrete
///      French operation (`Envoi d'audio`, `Envoi d'image`, …), carries
///      `source` so taps route to the conversation / post / story.
///
/// The pill collapses to `EmptyView` automatically when every signal
/// clears — there is no 3-cycle auto-hide; the rotation runs as long as
/// the entry list is non-empty.
struct ConnectionBanner: View {
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()
    /// Flag d'environnement injecté par `RootView` / `iPadRootView` quand
    /// `StoryViewerView` est présenté en `fullScreenCover`. Cache la pill
    /// pour qu'elle ne rende plus par-dessus le header story (le cover ne
    /// supprime pas les `.safeAreaInset`/overlays du parent). Bug
    /// 2026-05-27. Par défaut `false` via `IsStoryViewerPresentingKey` —
    /// safe quand ConnectionBanner est monté hors d'un container qui
    /// l'injecte (previews, tests, futurs callers).
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting

    /// Callback invoked when the user taps an entry whose `source` is
    /// non-nil. The mount point (`RootView` / `iPadRootView`) wires this
    /// to its router to push onto the navigation stack.
    private let onItemTap: ((OutboxUIItem.Source) -> Void)?

    /// Set to `true` for ~4 seconds after the device transitions from
    /// `.offline` to any non-offline state. Drives the transient green
    /// "En ligne" entry — gives the user explicit acknowledgement that
    /// connectivity has been restored before the pill collapses.
    @State private var showJustReturnedOnline: Bool = false

    /// Tracks the previously observed status so we can detect the
    /// offline → online transition exactly once per occurrence.
    @State private var lastObservedStatus: ConnectionStatusViewModel.Status?

    /// Cancellable handle for the timer that clears
    /// `showJustReturnedOnline`. Stored on `@State` so successive
    /// transitions don't pile up handlers.
    @State private var justReturnedOnlineTimer: Task<Void, Never>?

    /// Duration of the "En ligne" acknowledgement (seconds).
    private static let onlineAckDuration: Duration = .seconds(4)

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
                dotStyle: .warning,
                source: nil
            ))
        } else if showJustReturnedOnline && !isDisconnected {
            result.append(SyncPillEntry(
                id: "status.online",
                label: String(localized: "connection.online", defaultValue: "En ligne"),
                iconName: "wifi",
                dotStyle: .success,
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
                dotStyle: (item.status == .failed || item.status == .exhausted) ? .error : .brand,
                source: item.source
            ))
        }

        return result
    }

    var body: some View {
        // Skip rendering when StoryViewerView est présenté plein écran —
        // le fullScreenCover du root ne supprime pas les safeAreaInset /
        // overlays du parent et le pill restait visible par-dessus le
        // header story (bug 2026-05-27).
        if isStoryViewerPresenting {
            EmptyView()
        } else {
            SyncPill(entries: entries, onTap: onItemTap)
                .adaptiveOnChange(of: statusVM.status) { oldValue, newValue in
                    handleStatusTransition(from: oldValue, to: newValue)
                }
                .onAppear {
                    lastObservedStatus = statusVM.status
                }
        }
    }

    /// `true` only when the connection becomes genuinely usable again — the
    /// SOCKET (re)connects (`.connected`/`.syncing`) after having been `.offline`
    /// or `.disconnected`. Confirming "En ligne" on a mere `.offline → .disconnected`
    /// (device network back but the socket still reconnecting) would falsely tell
    /// the user they are online while no socket exists yet.
    static func shouldConfirmReturnOnline(
        previous: ConnectionStatusViewModel.Status?,
        new: ConnectionStatusViewModel.Status
    ) -> Bool {
        let wasDown = previous == .offline || previous == .disconnected
        let isUp = new == .connected || new == .syncing
        return wasDown && isUp
    }

    /// Detects the transition back to a genuinely-connected state and schedules a
    /// task that clears the "En ligne" acknowledgement after `onlineAckDuration`.
    /// Cancels any pending task so successive flap-up / flap-down cycles don't
    /// pile up handlers.
    private func handleStatusTransition(
        from oldValue: ConnectionStatusViewModel.Status?,
        to newValue: ConnectionStatusViewModel.Status
    ) {
        let previous = oldValue ?? lastObservedStatus
        lastObservedStatus = newValue
        guard Self.shouldConfirmReturnOnline(previous: previous, new: newValue) else { return }

        justReturnedOnlineTimer?.cancel()
        showJustReturnedOnline = true
        justReturnedOnlineTimer = Task { @MainActor [showDuration = Self.onlineAckDuration] in
            try? await Task.sleep(for: showDuration)
            guard !Task.isCancelled else { return }
            showJustReturnedOnline = false
        }
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

// MARK: - Environment Value

/// Flag transitoire propagé par les root views quand `StoryViewerView` est
/// présenté en `fullScreenCover`. Lu par `ConnectionBanner` (et tout autre
/// chrome global susceptible de baver derrière le cover) pour skip son
/// rendu. Default `false` — safe quand non injecté (previews, tests).
private struct IsStoryViewerPresentingKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var isStoryViewerPresenting: Bool {
        get { self[IsStoryViewerPresentingKey.self] }
        set { self[IsStoryViewerPresentingKey.self] = newValue }
    }
}
