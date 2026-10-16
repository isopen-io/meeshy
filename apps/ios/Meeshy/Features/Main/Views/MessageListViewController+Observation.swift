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

    /// Les observations qui EXIGENT un ViewModel. Extraites d'`observeStore()`
    /// (#5947) pour être rappelables : la seule chose qui manquait au `guard`
    /// d'origine était quelqu'un pour le rejouer quand la dépendance arrive.
    func observeConversationViewModel() {
        guard !didObserveConversationViewModel else { return }
        guard let vm = conversationViewModel else { return }
        didObserveConversationViewModel = true
        conversationViewModelObservationCount += 1

        observePerMessageDictionary(vm.$messageTranslations, initial: vm.messageTranslations)
        observePerMessageDictionary(vm.$messageTranscriptions, initial: vm.messageTranscriptions)
        observePerMessageDictionary(vm.$messageTranslatedAudios, initial: vm.messageTranslatedAudios)
        observePerMessageDictionary(vm.$activeTranslationOverrides, initial: vm.activeTranslationOverrides)
        // Flag-strip selection lifted out of the bubble's @State — a tap
        // writes to the VM; reconfigure the touched cell so the bubble
        // re-renders with the fresh snapped inputs (the Equatable gate sees
        // them change and lets the body re-run).
        observePerMessageDictionary(vm.$bubbleLanguageSelections, initial: vm.bubbleLanguageSelections)
        observeVisitState(vm)

        // Séparateur de premier non-lu (D-L1..3, #7222) — voir
        // `MessageListViewController+UnreadSeparator.swift`.
        bindUnreadSeparator(vm)

        vm.$preferredLanguageRevision
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                // Preferred language revision change requires full reconfigure of all items
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

        // In-conversation search term changes (enter / exit / refine the
        // filtered-conversation search) require re-running the cell registration
        // so each bubble shows or clears the highlight. `applySnapshot`
        // reconfigures every existing item in place — same full-reconfigure
        // pattern as preferredLanguageRevision. The set change on enter/exit
        // already triggers this; the explicit sink also covers a refinement
        // that keeps the same match set but a different term.
        vm.$currentSearchQuery
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] _ in
                self?.applySnapshot(reconfigure: .allItems)
            }
            .store(in: &cancellables)

        // Typing roster — la cellule typing entre/sort du flux comme toute
        // rangée du rouleau, sans animation. Uses stateStore publisher so
        // typing doesn't trigger full ConversationViewModel re-render.
        //
        // CHEMIN COURT (#4944) : `typing:start` est réémis toutes les trois
        // secondes par chaque frappeur, et repasser par la pose complète payait
        // la préparation de TOUTE la fenêtre pour un item qui entre ou sort du
        // bas du flux. `applyTypingIndicatorFastPath` insère ou retire ce seul
        // item dans le snapshot courant ; il rend `false` quand il ne peut pas
        // trancher, et la voie complète reste alors le repli — jamais un
        // silence.
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

        // Anneaux story des avatars expéditeurs — l'état vu/non-vu vit dans
        // StoryViewModel (jamais dans GRDB), donc aucun chemin existant ne
        // reconfigure les cellules quand il change. Fingerprint id:hasUnviewed
        // pour ignorer les mutations sans effet sur l'anneau (compteurs de
        // vues, réactions…) ; la reconfiguration ne touche que les cellules
        // visibles — les autres re-snappent l'état à leur prochaine config.
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

        // Présence 1/3/5 sur la pastille d'identité (matrice §5) — l'état
        // vit dans PresenceManager, hors GRDB : aucun chemin existant ne
        // reconfigurait les rangées quand il change, la pastille restait
        // FIGÉE à l'état de sa dernière configuration (audit 2026-08-18).
        // Même canal que les anneaux story : `refreshSignal.presenceVersion`
        // est publié pour ça (débouncé, un tick par rafale d'événements),
        // reconfiguration des seules cellules visibles — les autres
        // re-snappent à leur prochaine config.
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
