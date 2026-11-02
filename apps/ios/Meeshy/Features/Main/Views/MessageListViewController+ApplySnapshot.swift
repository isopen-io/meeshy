import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// La pose du snapshot du fil (#10758).
extension MessageListViewController {

    // `internal` (pas `private`) depuis `+UnreadSeparator.swift` (#7222), qui rejoue la pose au premier gel de frontière (`bindUnreadSeparator`).
    func applySnapshot(reconfigure: SnapshotReconfigureScope = .changedRecords) {
        // VEILLE (#3947) : on sort AVANT la préparation, qui coûte O(n) ; le réveil réapplique `.allItems`.
        guard rendersThread else { return }
        let _spState = PerfSignpost.signposter.beginInterval("applySnapshot")
        defer { PerfSignpost.signposter.endInterval("applySnapshot", _spState) }
        let _buildState = PerfSignpost.signposter.beginInterval("snapshot.build", id: PerfSignpost.signposter.makeSignpostID())
        var snapshot = NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>()
        snapshot.appendSections([.main])
        let prep = snapshotPrep()
        let messageItems = prep.messageItems
        let showTyping = !(conversationViewModel?.typingParticipants.isEmpty ?? true)
        let items: [MessageListItem] = itemsWithUnreadSeparator(
            showTyping ? [.typingIndicator] + prep.bodyItems : prep.bodyItems
        )
        snapshot.appendItems(items, toSection: .main)
        // Seuls les items DÉJÀ présents se reconfigurent : reconfigurer un identifiant que ce même apply INSÈRE peut faire disparaître la bulle fraîche.
        let previousItems = Set(dataSource.snapshot().itemIdentifiers)
        let rosterFingerprint = typingRosterFingerprint()
        let startFingerprint = (conversationViewModel?.currentConversationName ?? "")
            + "|" + (prep.oldestLocalId ?? "")
        var itemsToReconfigure = reconfigureCandidates(
            scope: reconfigure,
            items: items,
            previousItems: previousItems,
            showTyping: showTyping,
            rosterFingerprint: rosterFingerprint,
            startFingerprint: startFingerprint
        )
        // §4.7ter : aucun reconfigure global pendant le geste, tous modes ; la BASE du diff n'avance pas pendant le report, le flush (`flushDeferredReconfigureAtSettle`) retrouve tout le delta.
        let isDeferringReconfigure = !itemsToReconfigure.isEmpty && (collectionView.isDragging || collectionView.isDecelerating)
        if isDeferringReconfigure {
            hasDeferredGlobalReconfigure = true
            // #4022 : `.allItems` domine toujours ; `.items` s'ACCUMULE (union) au lieu d'être jeté.
            switch reconfigure {
            case .allItems:
                deferredReconfigureScope = .allItems
            case .items(let ids):
                if case .items(let pending) = deferredReconfigureScope {
                    deferredReconfigureScope = .items(pending.union(ids))
                } else if deferredReconfigureScope != .allItems {
                    deferredReconfigureScope = .items(ids)
                }
            case .changedRecords:
                break
            }
            itemsToReconfigure = []
        } else {
            lastReconfigureBaseline = MessageListSnapshotPrep.baseline(of: store.messages)
            lastTypingRosterFingerprint = rosterFingerprint
            lastConversationStartFingerprint = startFingerprint
        }
        reconfigureVisibleItems(itemsToReconfigure, in: &snapshot)
        arrivalMotion.arm(previous: previousSnapshotCount == 0 ? [] : previousItems, newestFirst: messageItems, store: store)
        let shouldAutoScroll = noteArrival(messageItems: messageItems, previousItems: previousItems, showTyping: showTyping)
        PerfSignpost.signposter.endInterval("snapshot.build", _buildState)
        // ROULEAU (2026-08-18) : aucune animation d'insertion ni de suppression ; seule l'entrée du dernier arrivé se joue sur SA cellule (#11223).
        noteDeletionCompensation(removing: previousItems.subtracting(Set(items)))
        let _applyState = PerfSignpost.signposter.beginInterval("snapshot.apply", id: PerfSignpost.signposter.makeSignpostID())
        applyToDataSource(snapshot) { [weak self] in
            PerfSignpost.signposter.endInterval("snapshot.apply", _applyState)
            self?.finishSnapshotApply(shouldAutoScroll: shouldAutoScroll)
        }
    }

    /// Mémoïsation par empreinte (#4944) : la préparation ne dépend que de la composition de la fenêtre, jamais d'un événement de contenu.
    func snapshotPrep() -> MessageListSnapshotPrep {
        let fingerprint = MessageListSnapshotPrep.Fingerprint(records: store.messages)
        if let memo = lastSnapshotPrep, memo.fingerprint == fingerprint { return memo }
        let prep = MessageListSnapshotPrep(
            reversedRecords: Array(store.messages.reversed()),
            fingerprint: fingerprint,
            calendar: .current
        )
        lastSnapshotPrep = prep
        snapshotPrepBuildsForTesting += 1
        return prep
    }

    func reconfigureCandidates(
        scope: SnapshotReconfigureScope,
        items: [MessageListItem],
        previousItems: Set<MessageListItem>,
        showTyping: Bool,
        rosterFingerprint: String,
        startFingerprint: String
    ) -> [MessageListItem] {
        switch scope {
        case .allItems:
            return items.filter { previousItems.contains($0) }
        case .items(let targetLocalIds):
            return targetLocalIds.compactMap { localId in
                let item = MessageListItem.message(localId: localId)
                return previousItems.contains(item) ? item : nil
            }
        case .changedRecords:
            // La version se lit sur les records VIVANTS du store, jamais sur la préparation mémoïsée (#4944).
            var changed = MessageListSnapshotPrep.changedItems(
                records: store.messages,
                baseline: lastReconfigureBaseline,
                presentIn: previousItems
            )
            if showTyping, previousItems.contains(.typingIndicator),
               rosterFingerprint != lastTypingRosterFingerprint {
                changed.append(.typingIndicator)
            }
            if items.last == .conversationStart, previousItems.contains(.conversationStart),
               startFingerprint != lastConversationStartFingerprint {
                changed.append(.conversationStart)
            }
            return changed
        }
    }

    /// Jamais de reconfigure HORS ÉCRAN (2026-08-18) : la hauteur retomberait à l'estimée et le contentSize s'effondrerait ; la prochaine réalisation relit le record frais.
    func reconfigureVisibleItems(
        _ itemsToReconfigure: [MessageListItem],
        in snapshot: inout NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>
    ) {
        guard !itemsToReconfigure.isEmpty else { return }
        let visibleItems = Set(
            collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
        )
        let visibleToReconfigure = itemsToReconfigure.filter { visibleItems.contains($0) }
        if !visibleToReconfigure.isEmpty {
            snapshot.reconfigureItems(visibleToReconfigure)
        }
    }

    /// Un message est NOUVEAU quand le compte des messages (jamais la cellule typing) croît et que le plus récent change ; un item réinséré par un retry n'en est pas un. Rend si le fil doit suivre.
    func noteArrival(
        messageItems: [MessageListItem],
        previousItems: Set<MessageListItem>,
        showTyping: Bool
    ) -> Bool {
        let newCount = messageItems.count
        let delta = newCount - previousSnapshotCount
        let newestItem = messageItems.first
        let hasGenuinelyNewMessages = delta > 0
            && previousSnapshotCount > 0
            && newestItem != previousNewestItem
            && newestItem.map { !previousItems.contains($0) } ?? false
        let typingJustAppeared = showTyping && !previouslyShowedTyping
        let isGestureOrMomentumActive = collectionView.isDragging
            || collectionView.isDecelerating
            || collectionView.isTracking
        // Jamais de `scrollToBottom` pendant un geste ni un momentum : il tuerait la décélération.
        let shouldAutoScroll = (hasGenuinelyNewMessages || typingJustAppeared)
            && isCurrentlyNearBottom
            && !isGestureOrMomentumActive
        let newestIsOwnMessage: Bool = {
            guard case .message(let localId) = newestItem,
                  let record = store.message(for: localId) else { return false }
            return record.senderId == currentUserId
        }()
        if hasGenuinelyNewMessages && !isCurrentlyNearBottom && !newestIsOwnMessage {
            pendingUnreadCount += delta
            onNewMessagesBadge?(pendingUnreadCount)
        }
        previousSnapshotCount = newCount
        previousNewestItem = newestItem
        previouslyShowedTyping = showTyping
        return shouldAutoScroll
    }

    func finishSnapshotApply(shouldAutoScroll: Bool) {
        updateStickyDayLabel()
        applyFocalPerspectiveToVisibleCells()
        if !store.isUserScrolling {
            syncFocalFocusDetails()
            adoptRowHeightEstimateIfWorthwhile()
        }
        if shouldAutoScroll {
            scrollToBottom(animated: false)
        }
    }
}
