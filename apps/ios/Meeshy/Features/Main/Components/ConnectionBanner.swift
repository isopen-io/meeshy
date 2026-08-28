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
///   6. Chaque conversation NON ouverte où quelqu'un écrit — `@pseudo` +
///      points animés, tap pour l'ouvrir.
///
/// The pill collapses to `EmptyView` automatically when every signal
/// clears — there is no 3-cycle auto-hide; the rotation runs as long as
/// the entry list is non-empty.
struct ConnectionBanner: View {
    @StateObject private var statusVM = ConnectionStatusViewModel()
    @StateObject private var syncPillVM = SyncPillViewModel()
    /// Source des frappes hors conversation. Injectée EXPLICITEMENT par
    /// l'appelant (point de montage unique par plateforme), JAMAIS via
    /// `@EnvironmentObject` : un `.overlay` posé sur la même chaîne de
    /// modifiers qu'un `.environmentObject(...)` n'hérite pas de façon
    /// fiable de cet objet dans ce codebase — crash `Fatal error: No
    /// ObservableObject of type ConversationListViewModel found` au
    /// lancement, motif documenté 4× (`FloatingCallPillView.swift`,
    /// `StoryViewerView.swift`, `AudioFullscreenView.swift`,
    /// `PanelBackAction.swift`). `nil` (flux invité, sans liste de
    /// conversations) désactive uniquement les entrées de frappe — le
    /// reste (statut connexion, file d'attente hors-ligne) fonctionne
    /// identiquement.
    ///
    /// **Le view-model n'est PAS stocké** (#4049) : il n'est lu qu'à l'`init`,
    /// pour en tirer le publisher ci-dessous. Le garder en propriété invitait
    /// à écrire `conversationListViewModel.typingUsers` dans `entries` — ce
    /// qui n'abonne rien et laissait la frappe sans effet à l'écran. Ne pas
    /// avoir le champ rend ce défaut inécrivable.
    ///
    /// Les frappeurs, OBSERVÉS : la re-render reste confinée à la bannière —
    /// l'hôte (`ConversationListVMOwner`) n'observe toujours rien, et
    /// `RootView.body` ne se ré-évalue pas pour une frappe.
    @StateObject private var typingSource: TypingEntriesSource

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// **L'annonce de frappe, portée par `IslandEmergingBanner`** (#4066).
    ///
    /// La pastille ne grossit plus : c'est une capsule qui naît dans la
    /// Dynamic Island et se pose dessous qui dit « quelqu'un vient de se mettre
    /// à écrire ». L'orchestration vit ICI plutôt que dans `SyncPill` parce que
    /// c'est cette vue qui possède la source de frappe (`typingSource`, #4049)
    /// et qui sait donc reconnaître une entrée NEUVE.
    @State private var announcement: SyncPillEntry?
    /// Les identifiants déjà vus — une frappe qui CONTINUE garde le même
    /// `typing.<conv>` et ne se ré-annonce donc pas.
    @State private var seenTypingIDs: Set<String> = []
    /// Retrait de l'annonce (one-shot, annulable). Borné, jamais
    /// `repeatForever` — cf. audit chauffe #3940.
    @State private var announcementWorkItem: DispatchWorkItem?
    /// `true` quand `StoryViewerView` est présenté en `fullScreenCover` —
    /// cache la pill pour qu'elle ne rende plus par-dessus le header story
    /// (bug 2026-05-27). Injecté explicitement pour la même raison que
    /// `conversationListViewModel` ci-dessus.
    let isStoryViewerPresenting: Bool

    /// Callback invoked when the user taps an entry whose `source` is
    /// non-nil. The mount point (`RootView` / `iPadRootView`) wires this
    /// to its router to push onto the navigation stack.
    private let onItemTap: ((OutboxUIItem.Source) -> Void)?

    /// Identifiant de la conversation actuellement à l'écran, quand le point de
    /// montage en connaît une. Elle est exclue des entrées de frappe : son
    /// propre indicateur est déjà visible, le doubler en haut serait du bruit.
    /// Une closure, pas une valeur : la bannière est reconstruite à chaque
    /// re-rendu du parent, et une valeur figée à la construction se périmerait
    /// dès la navigation suivante.
    private let activeConversationId: (() -> String?)?

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

    /// Grace window before a dropped socket is surfaced as "Reconnexion".
    /// A reconnection that completes within this window — the common case at
    /// cold start and on resume-from-background — never shows the pill; only a
    /// genuinely stalled connection (> `reconnectingGraceDuration`) does. This
    /// is the "ne pas polluer la tuile si non nécessaire" rule.
    private static let reconnectingGraceDuration: Duration = .seconds(3)

    /// `true` once the `.disconnected` state has actually been surfaced as the
    /// "Reconnexion" pill (grace window elapsed while still disconnected).
    /// Gates the pill so a fast reconnect stays invisible.
    @State private var showReconnecting: Bool = false

    /// Cancellable handle for the grace-window task. Stored on `@State` so a
    /// reconnect cancels a pending surface and successive flaps don't pile up.
    @State private var reconnectingGraceTimer: Task<Void, Never>?

    /// `true` once a *visible* down state (offline shown, or "Reconnexion"
    /// surfaced after the grace) has been displayed since the last connected
    /// state. Drives whether the transient "En ligne" confirmation is shown —
    /// it must only acknowledge a problem the user actually saw.
    @State private var downWasSurfaced: Bool = false

    init(
        conversationListViewModel: ConversationListViewModel?,
        isStoryViewerPresenting: Bool = false,
        onItemTap: ((OutboxUIItem.Source) -> Void)? = nil,
        activeConversationId: (() -> String?)? = nil
    ) {
        self.isStoryViewerPresenting = isStoryViewerPresenting
        self.onItemTap = onItemTap
        self.activeConversationId = activeConversationId
        // `@StateObject` : l'abonnement naît UNE fois par identité de vue, et
        // survit aux reconstructions fréquentes de la bannière par ses hôtes.
        // Le view-model, lui, a une identité stable (possédé par un
        // `@StateObject` d'hôte), donc la valeur capturée à la première
        // construction reste la bonne pour toute la durée de vie.
        _typingSource = StateObject(
            wrappedValue: TypingEntriesSource(
                publisher: conversationListViewModel?.$typingUsers.eraseToAnyPublisher()
            )
        )
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
                source: nil,
                showsActivityDots: false
            ))
        } else if showJustReturnedOnline && !isDisconnected {
            result.append(SyncPillEntry(
                id: "status.online",
                label: String(localized: "connection.online", defaultValue: "En ligne"),
                iconName: "wifi",
                dotStyle: .success,
                source: nil,
                showsActivityDots: false
            ))
        } else if isDisconnected && showReconnecting {
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
            let isTerminalFailure = item.status == .failed || item.status == .exhausted
            result.append(SyncPillEntry(
                id: item.id,
                label: SyncPillLabels.operationLabel(for: item),
                iconName: itemIcon(for: item.iconKind),
                dotStyle: isTerminalFailure ? .error : .brand,
                source: item.source,
                // A permanently-failed row is not in flight — no activity dots.
                showsActivityDots: !isTerminalFailure
            ))
        }

        result.append(contentsOf: Self.typingEntries(
            typingUsers: typingSource.typingUsers,
            excluding: activeConversationId?()
        ))

        return result
    }

    /// Une entrée par conversation NON ouverte où quelqu'un écrit.
    ///
    /// Le `@pseudo` plutôt que le nom d'affichage : la pastille est étroite et
    /// le handle est ce qui identifie sans ambiguïté. Triées par identifiant de
    /// conversation — un ordre instable ferait sauter la rotation d'une entrée
    /// à l'autre à chaque frappe.
    static func typingEntries(
        typingUsers: [String: String],
        excluding activeConversationId: String?
    ) -> [SyncPillEntry] {
        typingUsers
            .filter { $0.key != activeConversationId }
            .sorted { $0.key < $1.key }
            .map { conversationId, username in
                SyncPillEntry(
                    id: "typing.\(conversationId)",
                    label: "@\(username)",
                    iconName: nil,
                    dotStyle: .brand,
                    source: .conversation(id: conversationId),
                    showsActivityDots: true
                )
            }
    }

    /// Marge haute d'un point de montage, une fois la remontée appliquée.
    ///
    /// Les quatre hôtes de la pastille lui réservaient chacun leur propre marge
    /// (72 pt sous le header de conversation, 56/72 pt en flux invité, 8 pt sur
    /// le viewer de story, 0 sur iPad). La remontée se retranche de cette marge
    /// plutôt que de s'appliquer en `offset` : bornée à `0`, elle ne peut
    /// jamais pousser la pastille par-dessus la barre d'état ou la Dynamic
    /// Island — un hôte déjà collé en haut reste où il est, un hôte qui a de la
    /// marge la rend.
    ///
    /// Fonction pure `static` : c'est la DÉCISION qui se teste, pas le rendu.
    static func liftedTopPadding(base: CGFloat) -> CGFloat {
        max(0, base - SyncPillMetrics.topLift)
    }

    var body: some View {
        // Skip rendering when StoryViewerView est présenté plein écran —
        // le fullScreenCover du root ne supprime pas les safeAreaInset /
        // overlays du parent et le pill restait visible par-dessus le
        // header story (bug 2026-05-27).
        if isStoryViewerPresenting {
            EmptyView()
        } else {
            ZStack(alignment: .top) {
                SyncPill(entries: entries, onTap: onItemTap)
                    .opacity(announcement == nil ? 1 : 0)

                if let announcement {
                    typingAnnouncementBanner(announcement)
                }
            }
                .adaptiveOnChange(of: typingSource.typingUsers) { _, _ in
                    handleTypingChange()
                }
                .adaptiveOnChange(of: statusVM.status) { oldValue, newValue in
                    handleStatusTransition(from: oldValue, to: newValue)
                }
                .onAppear {
                    lastObservedStatus = statusVM.status
                    handleInitialStatus(statusVM.status)
                }
        }
    }

    /// La capsule qui émerge de l'île — le composant `IslandEmergingBanner`,
    /// écrit et testé de longue date mais monté NULLE PART jusqu'ici.
    ///
    /// `settledSize` est calculée, jamais estimée : le composant en dérive
    /// l'échelle et l'offset de NAISSANCE, et son propre doc-comment nomme le
    /// mode d'échec — « une taille fausse déplace la naissance hors de l'île ».
    /// La mesure passe donc par `UIFont`, déterministe, plutôt que par un
    /// `GeometryReader` dont la valeur n'arriverait qu'APRÈS le premier rendu,
    /// soit trop tard pour la naissance.
    @ViewBuilder
    private func typingAnnouncementBanner(_ entry: SyncPillEntry) -> some View {
        let font = UIFont.preferredFont(forTextStyle: .footnote)
        let width = (entry.label as NSString)
            .size(withAttributes: [.font: font]).width
        let size = TypingAnnouncementLaw.settledSize(
            labelWidth: width,
            lineHeight: font.lineHeight,
            maxWidth: DeviceLayout.windowSize.width - 32
        )

        IslandEmergingBanner(
            tint: MeeshyColors.brandPrimary,
            settledSize: size,
            reduceMotion: reduceMotion
        ) {
            Text(entry.label)
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .padding(.horizontal, TypingAnnouncementLaw.horizontalPadding)
                .padding(.vertical, TypingAnnouncementLaw.verticalPadding)
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(entry.label)
    }

    /// Une entrée de frappe NEUVE fait émerger la capsule ; une frappe qui
    /// continue ne la rejoue pas (même identifiant `typing.<conv>`).
    private func handleTypingChange() {
        let typing = Self.typingEntries(
            typingUsers: typingSource.typingUsers,
            excluding: activeConversationId?()
        )
        let ids = Set(typing.map(\.id))
        let fresh = typing.filter { !seenTypingIDs.contains($0.id) }
        seenTypingIDs = ids

        guard let toAnnounce = TypingAnnouncementLaw.announcement(among: fresh) else { return }

        announcementWorkItem?.cancel()
        withAnimation(.spring(response: 0.34, dampingFraction: 0.8)) {
            announcement = toAnnounce
        }
        let retract = DispatchWorkItem {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                announcement = nil
            }
        }
        announcementWorkItem = retract
        DispatchQueue.main.asyncAfter(
            deadline: .now() + TypingAnnouncementLaw.visibleDuration,
            execute: retract
        )
    }

    /// `true` only when the connection becomes genuinely usable again
    /// (`.connected`/`.syncing`) AND a *visible* down state was actually shown
    /// to the user beforehand (`downWasSurfaced`). Confirming "En ligne" at cold
    /// start or after a fast resume — where the socket blips through
    /// `.disconnected` without the "Reconnexion" pill ever appearing — would be
    /// a parasitic flash acknowledging a problem the user never saw.
    static func shouldConfirmReturnOnline(
        downWasSurfaced: Bool,
        new: ConnectionStatusViewModel.Status
    ) -> Bool {
        let isUp = new == .connected || new == .syncing
        return downWasSurfaced && isUp
    }

    /// `true` when a freshly-dropped socket should open a grace window before
    /// surfacing "Reconnexion". Only a NEW drop (the previous state was not
    /// already `.disconnected`) starts the window; staying disconnected lets the
    /// running window finish without being pushed back.
    static func shouldStartReconnectingGrace(
        previous: ConnectionStatusViewModel.Status?,
        new: ConnectionStatusViewModel.Status
    ) -> Bool {
        new == .disconnected && previous != .disconnected
    }

    /// `true` when, at the end of the grace window, the socket is STILL down so
    /// the "Reconnexion" pill should finally be surfaced. A reconnect that
    /// landed during the window leaves a non-`.disconnected` status → stays
    /// silent.
    static func shouldSurfaceReconnecting(
        statusAtDeadline: ConnectionStatusViewModel.Status
    ) -> Bool {
        statusAtDeadline == .disconnected
    }

    /// Seeds the surfacing state machine from the status observed at mount,
    /// since `adaptiveOnChange` only fires on subsequent changes. A banner that
    /// mounts already `.disconnected` (cold start) still gets its grace window;
    /// one that mounts `.offline` is treated as a surfaced down state.
    private func handleInitialStatus(_ status: ConnectionStatusViewModel.Status) {
        switch status {
        case .offline:
            downWasSurfaced = true
        case .disconnected:
            scheduleReconnectingGrace()
        case .connected, .syncing:
            break
        }
    }

    /// Drives the connection-pill state machine on every status change:
    /// - `.offline`      → surfaced immediately (important), cancels any grace.
    /// - `.disconnected` → opens a grace window; "Reconnexion" only shows after
    ///   it elapses while still down (fast reconnects stay silent).
    /// - `.connected`/`.syncing` → cancels grace, confirms "En ligne" only if a
    ///   down state was actually surfaced, then clears that flag.
    private func handleStatusTransition(
        from oldValue: ConnectionStatusViewModel.Status?,
        to newValue: ConnectionStatusViewModel.Status
    ) {
        let previous = oldValue ?? lastObservedStatus
        lastObservedStatus = newValue

        switch newValue {
        case .offline:
            cancelReconnectingGrace()
            showReconnecting = false
            downWasSurfaced = true

        case .disconnected:
            if Self.shouldStartReconnectingGrace(previous: previous, new: newValue) {
                scheduleReconnectingGrace()
            }

        case .connected, .syncing:
            cancelReconnectingGrace()
            showReconnecting = false
            if Self.shouldConfirmReturnOnline(downWasSurfaced: downWasSurfaced, new: newValue) {
                confirmReturnOnline()
            }
            downWasSurfaced = false
        }
    }

    /// Opens (or restarts) the grace window. When it elapses, "Reconnexion" is
    /// surfaced only if the socket is still down (`shouldSurfaceReconnecting`).
    private func scheduleReconnectingGrace() {
        reconnectingGraceTimer?.cancel()
        reconnectingGraceTimer = Task { @MainActor [graceDuration = Self.reconnectingGraceDuration] in
            try? await Task.sleep(for: graceDuration)
            guard !Task.isCancelled else { return }
            guard Self.shouldSurfaceReconnecting(statusAtDeadline: statusVM.status) else { return }
            showReconnecting = true
            downWasSurfaced = true
        }
    }

    private func cancelReconnectingGrace() {
        reconnectingGraceTimer?.cancel()
        reconnectingGraceTimer = nil
    }

    /// Shows the transient green "En ligne" pill, clearing it after
    /// `onlineAckDuration`. Cancels any pending clear so flap-up / flap-down
    /// cycles don't pile up handlers.
    private func confirmReturnOnline() {
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
