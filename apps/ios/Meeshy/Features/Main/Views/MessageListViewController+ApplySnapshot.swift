import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// La pose du snapshot du fil (#10758).
extension MessageListViewController {

    // `internal` (pas `private`) depuis `+UnreadSeparator.swift` (#7222), qui
    // rejoue la pose au premier gel de frontière (`bindUnreadSeparator`) —
    // même raison que `isDark`/`cancellables` plus haut : `private` est de
    // portée FICHIER.
    func applySnapshot(reconfigure: SnapshotReconfigureScope = .changedRecords) {
        // VEILLE (#3947) — on sort AVANT la construction, pas seulement
        // avant l'application : c'est la PRÉPA qui coûte (O(n) reversed +
        // map + groupByDay + reconstruction de la carte serverId), et elle
        // précède l'entonnoir. Le réveil réapplique `.allItems` depuis
        // `store.messages`, jamais suspendu — il subsume cette passe.
        guard rendersThread else { return }
        let _spState = PerfSignpost.signposter.beginInterval("applySnapshot")
        defer { PerfSignpost.signposter.endInterval("applySnapshot", _spState) }
        // Sous-segments pour pinpointer le coût des 75ms mesurés sur device :
        // `snapshot.build` (prépa O(n) : reversed+map+groupByDay+serverId+
        // reconfigure-scan) vs `snapshot.apply` (dataSource.apply = diff +
        // animation + réalisation des cellules). IDs uniques car imbriqués.
        let _buildState = PerfSignpost.signposter.beginInterval("snapshot.build", id: PerfSignpost.signposter.makeSignpostID())
        var snapshot = NSDiffableDataSourceSnapshot<MessageListSection, MessageListItem>()
        snapshot.appendSections([.main])

        // MÉMOÏSATION PAR EMPREINTE (#4944) — la préparation (liste inversée,
        // items, regroupement par jour, carte `serverId → localId`) ne dépend
        // QUE de la composition de la fenêtre. L'empreinte répond à « faut-il
        // tout refaire ? » en O(n) sans allouer ; un événement de CONTENU
        // (accusé de lecture, réaction, traduction, transcription) rend la
        // même empreinte et réutilise la préparation, là où la reconstruction
        // coûtait les ~75 ms mesurées sur device À CHAQUE écriture GRDB.
        let fingerprint = MessageListSnapshotPrep.Fingerprint(records: store.messages)
        let prep: MessageListSnapshotPrep
        if let memo = lastSnapshotPrep, memo.fingerprint == fingerprint {
            prep = memo
        } else {
            // Liste inversée : index 0 = visuel bas (message le plus récent).
            prep = MessageListSnapshotPrep(
                reversedRecords: Array(store.messages.reversed()),
                fingerprint: fingerprint,
                calendar: .current
            )
            lastSnapshotPrep = prep
            snapshotPrepBuildsForTesting += 1
        }
        // `messageItems` reste SANS les séparateurs ni la cellule typing :
        // c'est sur lui que se compte le delta du badge non-lus plus bas.
        let messageItems = prep.messageItems
        let bodyItems = prep.bodyItems

        // The typing indicator is a real cell at index 0 — the visual bottom of
        // the inverted layout, just below the newest message. A live message
        // then inserts at index 1 and pushes the conversation up naturally.
        let showTyping = !(conversationViewModel?.typingParticipants.isEmpty ?? true)
        // Séparateur de premier non-lu (#7222) — inséré APRÈS le typing/day
        // composé, voir `itemsWithUnreadSeparator` (+UnreadSeparator.swift).
        let items: [MessageListItem] = itemsWithUnreadSeparator(
            showTyping ? [.typingIndicator] + bodyItems : bodyItems
        )
        // RETRAIT FOCAL iOS (2026-08-18) : `.conversationStart` vivait dans
        // l'espace réservé par l'inset de tête du mode Focal — plus jamais
        // appendé (registration conservée, inerte).
        snapshot.appendItems(items, toSection: .main)
        // The diffable datasource only re-runs the cell registration closure
        // when an item's IDENTIFIER changes — we key items by `localId` which
        // stays stable across `.sending → .sent → .delivered`, so without
        // explicitly reconfiguring the rows the bubble would render with its
        // first state forever and only flip after the user leaves and re-opens
        // the conversation (which throws the cells away). `reconfigureItems`
        // forces the registration to re-run for every visible row, picking up
        // GRDB-driven state / content / delivery / reaction changes in place
        // without triggering the costly insert/move/delete diff animation.
        //
        // CRITICAL: only reconfigure items that ALREADY exist in the applied
        // snapshot. Reconfiguring an identifier that this same apply is also
        // INSERTING is unsupported — UIKit resolves the insert against the new
        // snapshot and the reconfigure against the old one, and the conflicting
        // instructions can drop a freshly-inserted bubble (the new message
        // flashes in then vanishes when the next message triggers the next
        // apply). Inserted items are configured fresh anyway, so excluding them
        // here is both correct and sufficient.
        let previousItems = Set(dataSource.snapshot().itemIdentifiers)
        // Empreinte du roster — site UNIQUE, partagé avec le chemin court de
        // la frappe (`MessageListViewController+Snapshot.swift`).
        let rosterFingerprint = typingRosterFingerprint()
        let startFingerprint = (conversationViewModel?.currentConversationName ?? "")
            + "|" + (prep.oldestLocalId ?? "")
        var itemsToReconfigure: [MessageListItem]
        switch reconfigure {
        case .allItems:
            itemsToReconfigure = items.filter { previousItems.contains($0) }
        case .items(let targetLocalIds):
            itemsToReconfigure = targetLocalIds.compactMap { localId in
                let item = MessageListItem.message(localId: localId)
                return previousItems.contains(item) ? item : nil
            }
        case .changedRecords:
            // Seuls les records dont la VERSION a bougé depuis la base — les
            // séparateurs de jour ne se reconfigurent jamais ici (leur libellé
            // ne dépend que de la date ; le passage de minuit est rattrapé par
            // les poses `.allItems`), la cellule typing suit son roster, la
            // rangée « Début de la conversation » son empreinte nom + plus
            // ancien message.
            //
            // La version se lit sur les records VIVANTS du store, jamais sur
            // une préparation mémoïsée (#4944) : celle-ci ne décrit que la
            // COMPOSITION, et ses records seraient périmés par construction —
            // le diff manquerait exactement les lignes qui viennent de bouger.
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
            itemsToReconfigure = changed
        }
        // §4.7ter — AUCUN reconfigure global pendant le geste, TOUS MODES.
        //
        // L'exclusion de `.bubbles` est tombée le 2026-08-25 : le report est
        // une règle de FLUIDITÉ, pas une règle de mode — `reconfigureVisibleCells`
        // ne l'a d'ailleurs jamais faite. En bulles aussi, une coche, une
        // réaction ou une traduction arrivée sous le doigt attend donc la
        // pose ; les INSERTIONS, elles, restent immédiates.
        //
        // Reconfigurer une cellule VISIBLE en plein défilement la fait
        // re-mesurer (UIHostingConfiguration neuve) : un texte traduit qui
        // change de nombre de lignes, une image qui vient de charger, et
        // toutes les cellules d'index supérieur se décalent d'un coup —
        // c'est l'un des « sauts d'échelle » mesurés (chasse Fable
        // 2026-08-16, cause n°2 confirmée). Les INSERTIONS restent
        // appliquées immédiatement (la pagination doit matérialiser ses
        // cellules avant que le doigt n'atteigne le bord) — elles
        // n'affectent que le bout non visible du fil. Le reconfigure, lui,
        // attend la pose : `flushDeferredReconfigureAtSettle`. La BASE du
        // diff n'est PAS avancée pendant le report — le flush retrouve tout
        // le delta — et la portée demandée est retenue (`.allItems` domine).
        let isDeferringReconfigure = !itemsToReconfigure.isEmpty
            && (collectionView.isDragging || collectionView.isDecelerating)
        if isDeferringReconfigure {
            hasDeferredGlobalReconfigure = true
            // #4022 — `.allItems` domine toujours ; `.items` s'ACCUMULE (union)
            // au lieu d'être jeté avec `itemsToReconfigure` ci-dessous. Avant ce
            // correctif, seul `.allItems` était retenu ici : un `.items` (coche
            // de sélection, #515) arrivé pendant une décélération perdait
            // silencieusement son id à reconfigurer — le compteur de sélection
            // changeait, la coche visuelle non.
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
        if !itemsToReconfigure.isEmpty {
            // JAMAIS de reconfigure HORS ÉCRAN (rouleau, user 2026-08-18) :
            // re-héberger une cellule invisible fait transitoirement
            // retomber sa hauteur à l'ESTIMÉE par le chemin self-resizing
            // (qui ne passe par AUCUNE compensation — même canal que le
            // SIGTRAP), le contentSize s'effondre et l'offset est re-clampé
            // vers le bas : chaque tick d'outbox « rappelait » la scène au
            // bas. Une cellule invisible n'a RIEN à reconfigurer : sa
            // prochaine RÉALISATION relit le record frais via la
            // registration. Seules les cellules visibles re-hébergent.
            let visibleItems = Set(
                collectionView.indexPathsForVisibleItems.compactMap { dataSource.itemIdentifier(for: $0) }
            )
            let visibleToReconfigure = itemsToReconfigure.filter { visibleItems.contains($0) }
            if !visibleToReconfigure.isEmpty {
                snapshot.reconfigureItems(visibleToReconfigure)
            }
        }

        // Detect genuinely-new messages: the MESSAGE count grew AND the newest
        // message changed. Tracking message items only (never the typing cell)
        // means the typing indicator toggling on/off can never be mistaken for
        // a new message nor bump the unread badge. Older-message pagination
        // prepends to the tail and leaves the newest untouched, so it never
        // counts — including the ViewModel's anticipatory prefetch, which
        // loads older pages from an internal Task that bypasses the
        // `isLoadingOlder` flag entirely (the flag is therefore NOT a
        // reliable discriminator). The very first load
        // (previousSnapshotCount == 0) is excluded.
        let newCount = messageItems.count
        let delta = newCount - previousSnapshotCount
        let newestItem = messageItems.first
        // Un item RÉINSÉRÉ (retry outbox qui retire puis rejoue le même
        // localId — churn ~1/s gateway coupée) n'est PAS un nouveau message :
        // exiger que le newest soit ABSENT du snapshot précédent. Sans ce
        // discriminant, chaque tick de retry « recollait » la vue au bas.
        let hasGenuinelyNewMessages = delta > 0
            && previousSnapshotCount > 0
            && newestItem != previousNewestItem
            && newestItem.map { !previousItems.contains($0) } ?? false
        // RC2.1 — when the user is following the conversation (near bottom),
        // auto-scroll onto the new message; otherwise bump the unread badge.
        // The typing cell appearing also auto-scrolls (when near bottom) so it
        // stays visible just below the last message.
        //
        // JAMAIS pendant un geste ni un momentum (rouleau, user 2026-08-18) :
        // un `scrollToBottom` posé au milieu d'un fling TUE la décélération —
        // la liste semblait « avaler » chaque tentative de remonter dès
        // qu'un tick d'outbox tombait. Le doigt et l'inertie ont toujours
        // priorité sur le confort de suivi.
        let typingJustAppeared = showTyping && !previouslyShowedTyping
        let isGestureOrMomentumActive = collectionView.isDragging
            || collectionView.isDecelerating
            || collectionView.isTracking
        let shouldAutoScroll = (hasGenuinelyNewMessages || typingJustAppeared)
            && isCurrentlyNearBottom
            && !isGestureOrMomentumActive
        // Le badge non-lus ne compte JAMAIS un message dont l'utilisateur est
        // l'AUTEUR : envoyer depuis l'historique (rangée optimiste insérée en
        // bas pendant qu'on lit plus haut) n'est pas un « nouveau message à
        // lire » (matrice §5, audit 2026-08-18). Le seuil regarde le PLUS
        // RÉCENT : un envoi propre accompagné d'un vrai message entrant dans
        // le même batch reste compté par le delta.
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

        // Scroll in the apply completion handler so the new item exists in the
        // layout before `scrollToItem` runs (apply is asynchronous for the
        // animated diff path).
        PerfSignpost.signposter.endInterval("snapshot.build", _buildState)
        // ROULEAU (directive user 2026-08-18) : AUCUNE animation d'insertion
        // ni de suppression, jamais — ni slide-in de message entrant, ni
        // apparition du typing, ni bulk-load. Les rangées existent dans le
        // flux avant d'être visibles ; le SEUL mouvement à l'écran est celui
        // du défilement lui-même. (La trace device montrait déjà que l'apply
        // ANIMÉ était le coût dominant — 2136 ms sur 17 applies.)
        // Stabilité du champ visuel — les hauteurs des items SUPPRIMÉS sous
        // la fenêtre (typing indicator qui s'éteint, message effacé déjà
        // défilé) ne seront plus lisibles pendant le batch update : mesurées
        // sur le layout encore courant, déposées au layout qui les absorbera
        // dans `contentOffset`. Site unique, partagé avec le chemin court de
        // la frappe (`MessageListViewController+Snapshot.swift`).
        noteDeletionCompensation(removing: previousItems.subtracting(Set(items)))
        let _applyState = PerfSignpost.signposter.beginInterval("snapshot.apply", id: PerfSignpost.signposter.makeSignpostID())
        applyToDataSource(snapshot) { [weak self] in
            PerfSignpost.signposter.endInterval("snapshot.apply", _applyState)
            guard let self else { return }
            // La pill flottante doit refléter le nouveau top du flux dès que
            // les cellules sont en place (insertion d'un nouveau message, etc.).
            self.updateStickyDayLabel()
            self.applyFocalPerspectiveToVisibleCells()
            // Au repos (ouverture, message entrant sans geste en cours), le
            // message en focus reçoit ses détails sans attendre une pose de
            // défilement qui ne viendra pas ; pendant un geste, `settleAtRest`
            // s'en charge à la levée — jamais une hauteur qui change en plein
            // momentum.
            if !self.store.isUserScrolling {
                self.syncFocalFocusDetails()
                // À l'OUVERTURE, la liste a posé ses premières cellules sans
                // qu'aucun geste n'ait eu lieu : sans cette adoption, le tout
                // premier défilement — celui de la capture #4041 — serait le
                // seul à rester étiré.
                self.adoptRowHeightEstimateIfWorthwhile()
            }
            if shouldAutoScroll {
                // Le rouleau avance d'un cran, net — pas de ressort.
                self.scrollToBottom(animated: false)
            }
        }
    }
}
