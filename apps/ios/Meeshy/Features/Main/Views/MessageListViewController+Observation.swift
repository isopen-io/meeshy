import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// Observation du store et du modèle de conversation (#10758).
extension MessageListViewController {

    // MARK: - Observation

    func observeStore() {
        store.messagesDidChange
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.applySnapshot()
            }
            .store(in: &cancellables)

        // GRDB-driven changes (insert / state transition / delivery / read)
        // already trigger `messagesDidChange` and re-snapshot. But translation
        // / transcription / audio-translation events arrive via Socket.IO
        // and only update `@Published` dictionaries on the ViewModel — they
        // never touch GRDB so the diffable datasource never sees them. Force
        // a snapshot reconfigure when those publishers fire so the cell
        // registration re-runs and `resolveBubbleData` picks the new payload
        // up. Coalesce by 80ms to absorb multilingual bursts (the SDK
        // already collects translation events on that interval, so two
        // collapsed re-snapshots is the worst case).
        observeConversationViewModel()
    }

    /// Les observations qui EXIGENT un ViewModel. Extraites d'`observeStore()` (#5947) pour être rappelables : le `guard` d'origine n'avait personne pour le rejouer quand la dépendance arrive.
    func observeConversationViewModel() {
        guard !didObserveConversationViewModel else { return }
        guard let vm = conversationViewModel else { return }
        didObserveConversationViewModel = true
        conversationViewModelObservationCount += 1

        observePerMessageDictionary(vm.$messageTranslations, initial: vm.messageTranslations)
        observePerMessageDictionary(vm.$messageTranscriptions, initial: vm.messageTranscriptions)
        observePerMessageDictionary(vm.$messageTranslatedAudios, initial: vm.messageTranslatedAudios)
        observePerMessageDictionary(vm.$activeTranslationOverrides, initial: vm.activeTranslationOverrides)
        // La sélection du bandeau de drapeaux vit dans le ViewModel : un tap reconfigure la cellule touchée avec les entrées fraîches.
        observePerMessageDictionary(vm.$bubbleLanguageSelections, initial: vm.bubbleLanguageSelections)
        observeVisitState(vm)
        observeConversationAppearance(vm)
        bindUnreadSeparator(vm)
        observeSnapshotTriggers(vm)
        observeTypingRoster(vm)
        observeRingsAndPresence()
    }

    /// Langue préférée, consentement vocal et terme de recherche exigent de rejouer la registration de chaque item : reconfigure complet.
    func observeSnapshotTriggers(_ vm: ConversationViewModel) {
        vm.$preferredLanguageRevision
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        vm.$voiceConsentMissing
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        vm.$currentSearchQuery
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)
    }

    /// CHEMIN COURT (#4944) : `typing:start` est réémis toutes les trois secondes par chaque frappeur ; `applyTypingIndicatorFastPath` n'insère ou ne retire que l'item typing, et rend `false` quand il ne peut pas trancher — la voie complète reste alors le repli.
    func observeTypingRoster(_ vm: ConversationViewModel) {
        vm.typingParticipantsPublisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                guard let self else { return }
                if !self.applyTypingIndicatorFastPath() {
                    self.applySnapshot()
                }
            }
            .store(in: &cancellables)
    }

    /// Anneaux story et présence 1/3/5 vivent hors GRDB : aucun chemin existant ne reconfigure les rangées quand ils changent. Seules les cellules visibles se reconfigurent ; les autres re-snappent à leur prochaine configuration.
    func observeRingsAndPresence() {
        storyViewModel.$storyGroups
            .map { groups in
                groups.map { "\($0.id):\($0.hasUnviewed)" }.joined(separator: ",")
            }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.reconfigureVisibleCells()
            }
            .store(in: &cancellables)

        PresenceManager.shared.refreshSignal.$presenceVersion
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] (_: Int) in
                self?.reconfigureVisibleCells()
            }
            .store(in: &cancellables)
    }

    func reconfigureVisibleCells() {
        guard let dataSource else { return }
        // §4.7ter — MÊME report que les reconfigures globaux et ciblés :
        // re-mesurer les cellules visibles EN PLEIN geste déclenche la
        // cascade d'invalidation du solveur self-sizing (récursion
        // `_updateVisibleCellsNow` → SIGTRAP, crash reproduit sur long
        // fling 2026-08-18 — le tick de présence ~30 s tombait au milieu du
        // défilement). À la pose, le flush global re-servira l'état frais.
        if store.isUserScrolling {
            hasDeferredGlobalReconfigure = true
            return
        }
        let visibleItems = collectionView.indexPathsForVisibleItems
            .compactMap { dataSource.itemIdentifier(for: $0) }
        guard !visibleItems.isEmpty else { return }
        var snapshot = dataSource.snapshot()
        let existing = visibleItems.filter { snapshot.indexOfItem($0) != nil }
        guard !existing.isEmpty else { return }
        snapshot.reconfigureItems(existing)
        applyToDataSource(snapshot) { [weak self] in
            // Focal : une reconfiguration remet la cellule à plat et sans
            // carte (registration) — la passe la repose aussitôt, sinon la
            // carte du message en focus disparaît jusqu'au prochain tick
            // (à l'ouverture, avant tout défilement : capture 2026-08-21).
            self?.applyFocalPerspectiveToVisibleCells()
        }
    }

    // `observePerMessageDictionary` vit dans
    // `MessageListViewController+Snapshot.swift` (#4944) — même cluster, et le
    // budget interdit d'ajouter à cet hôte sans en avoir d'abord extrait.

    func queueReconfigure(for messageIds: Set<String>) {
        guard !messageIds.isEmpty else { return }
        pendingReconfigureMessageIds.formUnion(messageIds)

        reconfigureDebounceTimer?.invalidate()
        reconfigureDebounceTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self = self else { return }
                let ids = self.pendingReconfigureMessageIds
                self.pendingReconfigureMessageIds.removeAll()
                self.reconfigureMessages(serverIds: ids)
            }
        }
    }

    func reconfigureMessages(serverIds: Set<String>) {
        guard let dataSource = dataSource, !serverIds.isEmpty else { return }

        // §4.7ter (volet ciblé) : pendant un geste, différer — re-mesurer une
        // cellule visible en plein défilement fait sauter le champ visuel ET
        // la perspective (visualMidY = f(center.y − offset)). Vaut dans TOUS
        // les modes depuis le 2026-08-25 : l'exception `.bubbles` faisait du
        // mode NOMINAL le seul où une traduction tardive sautait sous le
        // doigt. Le flush à la pose (`flushDeferredReconfigureAtSettle`) est
        // mode-agnostique — rien ne peut rester périmé.
        if store.isUserScrolling {
            deferredTargetedReconfigureIds.formUnion(serverIds)
            return
        }

        // Translation/transcription events key by server id; the flag-strip
        // selection keys by `message.id`, which IS the local id for a not-yet
        // acked optimistic row. Fall back to the raw key — non-existent items
        // are filtered against the snapshot below anyway.
        let localIds = serverIds.map { self.serverIdToLocalId[$0] ?? $0 }
        guard !localIds.isEmpty else { return }

        var snapshot = dataSource.snapshot()
        let itemsToReconfigure = localIds.map { MessageListItem.message(localId: $0) }

        // Only reconfigure items that actually exist in the current snapshot
        // — et qui sont VISIBLES (même règle que applySnapshot : re-héberger
        // hors écran effondre le contentSize, la réalisation suivante relit
        // le record frais de toute façon).
        let visibleItems = Set(
            collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
        )
        let existingItems = itemsToReconfigure.filter { snapshot.indexOfItem($0) != nil && visibleItems.contains($0) }
        guard !existingItems.isEmpty else { return }

        snapshot.reconfigureItems(existingItems)
        applyToDataSource(snapshot) { [weak self] in
            // Focal : une reconfiguration remet la cellule à plat et sans
            // carte (registration) — la passe la repose aussitôt, sinon la
            // carte du message en focus disparaît jusqu'au prochain tick
            // (à l'ouverture, avant tout défilement : capture 2026-08-21).
            self?.applyFocalPerspectiveToVisibleCells()
        }
    }
}
