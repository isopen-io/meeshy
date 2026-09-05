// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+Snapshot.swift

import UIKit
import Combine

//
// Le cluster SNAPSHOT de la liste : la portée d'un reconfigure, l'empreinte du
// roster de frappe, la compensation des suppressions sous la fenêtre, le
// chemin COURT de la frappe et le diff des dictionnaires par message.
//
// Sorti de `MessageListViewController.swift` (#4944, budget 1000-1200 lignes) :
// l'hôte dépasse le plafond d'un facteur trois, et la directive interdit d'y
// ajouter avant d'en avoir extrait. Ce qui RESTE chez l'hôte y reste pour une
// raison nommée : `applySnapshot`, `reconfigureVisibleCells` et
// `reconfigureMessages(serverIds:)` sont ancrés PAR LEUR FICHIER dans des
// gardes de source (`ConversationSelectionGuardTests`,
// `FocalMatrixWiringGuardTests`, `MessageListDataSourceQuiescenceTests`) qui
// lisent le chemin exact — les déménager les éteindrait en silence, ce qui est
// exactement le mode de panne que la leçon 347 décrit.
//
// Les membres consommés ici (`cancellables`, `queueReconfigure`,
// `previouslyShowedTyping`, `lastTypingRosterFingerprint`,
// `isCurrentlyNearBottom`, `hasDeferredGlobalReconfigure`) sont passés de
// `private` à `internal` pour la même raison qu'au #3947 : en Swift, `private`
// porte sur le FICHIER. Aucun n'est lu hors de cette unité — c'est une portée
// élargie, pas une frontière ouverte.
//

/// **Ce que le chemin court doit faire de la cellule « écrit… » (#4944).**
///
/// La règle est extraite du contrôleur parce qu'elle est décidable sans UIKit,
/// et parce qu'elle porte les deux invariants qu'un chemin court peut perdre
/// en silence : une INSERTION reste immédiate même sous le doigt (elle n'ajoute
/// qu'au bas du flux, hors du champ que le geste tient), tandis qu'une
/// RECONFIGURATION est différée (§4.7ter — re-mesurer une cellule visible en
/// plein défilement décale tout ce qui la surplombe).
nonisolated enum TypingIndicatorSnapshotLaw {

    nonisolated enum Change: Equatable {
        /// Rien n'a bougé pour la cellule « écrit… » — le cas NOMINAL, celui
        /// de la réémission `typing:start` toutes les trois secondes.
        case unchanged
        case insert
        case remove
        case reconfigure
        /// Le roster a changé sous le doigt : rien maintenant, tout à la pose
        /// (`flushDeferredReconfigureAtSettle`).
        case deferReconfigure
    }

    static func change(
        showTyping: Bool,
        wasShowing: Bool,
        rosterChanged: Bool,
        isMoving: Bool
    ) -> Change {
        guard showTyping == wasShowing else { return showTyping ? .insert : .remove }
        guard showTyping, rosterChanged else { return .unchanged }
        return isMoving ? .deferReconfigure : .reconfigure
    }
}

extension MessageListViewController {

    /// Portée du `reconfigureItems` d'un `applySnapshot`.
    ///
    /// `.changedRecords` (défaut, chemin CHAUD `messagesDidChange`) : seuls
    /// les messages dont le `changeVersion` a bougé depuis la dernière pose
    /// re-passent par la registration — l'égalité O(1) de `MessageRecord`
    /// (invariant grdb-04 : toute écriture visible bumpe la version) est le
    /// pivot. AVANT (audit film user 2026-08-18) : TOUTES les cellules
    /// visibles re-hébergeaient leur SwiftUI à CHAQUE mutation du store — la
    /// file hors-ligne en boucle de retry faisait donc tressauter la scène
    /// ENTIÈRE au repos (re-mesures ± sous-point, pulsation 0,7↔1,0 des
    /// rangées en vol), l'élu compris.
    ///
    /// `.allItems` : bascules GLOBALES qui changent le rendu de toutes les
    /// rangées sans toucher aux records — thème, terme de recherche,
    /// révision de langue préférée, consentement voix.
    enum SnapshotReconfigureScope: Equatable {
        case changedRecords
        case allItems
        /// Reconfigure UNIQUEMENT ces `localId` — retour porteur 2026-08-27
        /// (#515) : la sélection multiple (#4005) posait `.allItems` sur
        /// CHAQUE coche, reconfigurant toute rangée visible pour un état qui
        /// ne change QUE sur UN message. Contraire au gate `.equatable()`
        /// (#515) que ce coût existe précisément pour éviter.
        case items(Set<String>)
    }

    // MARK: - Roster de frappe

    /// Empreinte du roster de frappe — le SITE UNIQUE, partagé par la pose
    /// complète et par le chemin court ci-dessous. Deux calculs jumeaux
    /// divergeraient au premier champ ajouté, et la divergence ne se verrait
    /// que sur la cellule qui ne se reconfigure plus.
    ///
    /// L'empreinte inclut l'AVATAR : la rangée doit se reconfigurer quand le
    /// visage d'un frappeur devient connu (il vient d'écrire son premier
    /// message du fil), pas seulement quand le roster change de composition.
    func typingRosterFingerprint() -> String {
        (conversationViewModel?.typingParticipants ?? [])
            .map { "\($0.id):\($0.displayName):\($0.avatarURL ?? "")" }
            .joined(separator: "|")
    }

    /// La cellule « écrit… » est-elle RÉALISÉE à l'écran ?
    ///
    /// Elle vit à l'index 0, le bas visuel du flux inversé : dès que le doigt
    /// remonte dans l'historique, elle sort de l'écran et n'a plus rien à
    /// reconfigurer. Le balayage porte sur les seules cellules visibles —
    /// jamais sur la fenêtre entière, que ce chemin court existe pour ne plus
    /// parcourir.
    var isTypingIndicatorVisible: Bool {
        guard let dataSource else { return false }
        return collectionView.indexPathsForVisibleItems.contains {
            dataSource.itemIdentifier(for: $0) == MessageListItem.typingIndicator
        }
    }

    // MARK: - Stabilité du champ visuel

    /// Mesure, sur le layout ENCORE COURANT, la hauteur des items qui vont
    /// disparaître SOUS la fenêtre visible, et la dépose au layout qui
    /// l'absorbera dans `contentOffset` (cf. `MessageListLayout`).
    ///
    /// Après le batch update ces hauteurs ne sont plus lisibles — d'où la
    /// mesure AVANT. Posée à CHAQUE apply, y compris pour un ensemble VIDE :
    /// un dépôt non consommé ne doit jamais survivre à l'update suivant.
    func noteDeletionCompensation(removing removed: Set<MessageListItem>) {
        guard let dataSource else { return }
        let height: CGFloat = removed
            .compactMap { dataSource.indexPath(for: $0) }
            .compactMap { collectionView.layoutAttributesForItem(at: $0) }
            .filter { $0.frame.minY < collectionView.contentOffset.y }
            .reduce(0) { $0 + $1.frame.height }
        (collectionView.collectionViewLayout as? MessageListLayout)?
            .noteUpcomingDeletionCompensation(height: height)
    }

    // MARK: - Chemin COURT de la frappe (#4944)

    /// La bulle « écrit… » entre ou sort du flux SANS repasser par la
    /// préparation complète.
    ///
    /// `typing:start` est réémis toutes les trois secondes par chaque
    /// frappeur, et `typing:stop` suit chaque pause : faire passer ces
    /// événements par `applySnapshot` payait la préparation ENTIÈRE de la
    /// fenêtre — items, regroupement par jour, carte `serverId` — pour UN item
    /// qui entre ou sort du bas du flux, alors que la composition des MESSAGES
    /// n'a pas bougé d'une ligne. C'est le second des deux chemins chauds que
    /// le #4944 vise, l'autre étant la mémoïsation de la pose elle-même.
    ///
    /// Rend `false` quand il ne peut PAS trancher (veille, vue non chargée,
    /// section pas encore posée) : l'appelant retombe alors sur
    /// `applySnapshot`, qui reste la voie complète. Un chemin court qui
    /// échouerait en silence laisserait la bulle absente jusqu'au message
    /// suivant — un défaut pire que la dépense qu'il évite.
    ///
    /// Les invariants de la pose complète sont TOUS tenus ici :
    /// - l'INSERTION reste immédiate, même sous le doigt (elle n'affecte que
    ///   le bas du flux) ; seule la RECONFIGURATION du roster est différée
    ///   (§4.7ter) et rejouée par `flushDeferredReconfigureAtSettle` ;
    /// - la suppression dépose sa compensation de hauteur AVANT l'update ;
    /// - l'auto-scroll suit la même règle qu'`applySnapshot` : près du bas,
    ///   et jamais pendant un geste ou un momentum — la scène n'appartient
    ///   qu'au doigt ;
    /// - `previouslyShowedTyping` et `lastTypingRosterFingerprint` sont tenus
    ///   à jour, sans quoi la pose suivante croirait la bulle « nouvelle » et
    ///   recollerait la vue au bas.
    ///
    /// Ce que ce chemin ne touche PAS : `previousSnapshotCount` et
    /// `previousNewestItem`, qui ne comptent que les MESSAGES — le badge
    /// non-lus ne doit jamais s'incrémenter parce que quelqu'un écrit.
    func applyTypingIndicatorFastPath() -> Bool {
        guard rendersThread, isViewLoaded, dataSource != nil else { return false }
        var snapshot = dataSource.snapshot()
        guard snapshot.sectionIdentifiers.contains(.main) else { return false }

        let showTyping = !(conversationViewModel?.typingParticipants.isEmpty ?? true)
        let fingerprint = typingRosterFingerprint()
        previouslyShowedTyping = showTyping

        switch TypingIndicatorSnapshotLaw.change(
            showTyping: showTyping,
            wasShowing: snapshot.indexOfItem(.typingIndicator) != nil,
            rosterChanged: fingerprint != lastTypingRosterFingerprint,
            isMoving: collectionView.isDragging || collectionView.isDecelerating
        ) {
        case .unchanged:
            return true
        case .deferReconfigure:
            hasDeferredGlobalReconfigure = true
            return true
        case .reconfigure:
            lastTypingRosterFingerprint = fingerprint
            // JAMAIS de reconfigure HORS ÉCRAN (rouleau, user 2026-08-18) —
            // la MÊME règle qu'`applySnapshot`, qui filtre sa portée sur
            // `indexPathsForVisibleItems`. Re-héberger une cellule invisible
            // fait transitoirement retomber sa hauteur à l'ESTIMÉE par le
            // chemin self-sizing, le contentSize s'effondre et l'offset est
            // re-clampé vers le bas. La cellule invisible n'a rien à
            // reconfigurer : sa prochaine RÉALISATION relit le roster frais
            // via la registration. L'empreinte est tout de même avancée —
            // comme chez l'hôte, dont la branche « rien de visible » met sa
            // base à jour sans appliquer.
            guard isTypingIndicatorVisible else { return true }
            snapshot.reconfigureItems([.typingIndicator])
            applyToDataSource(snapshot) { [weak self] in
                self?.applyFocalPerspectiveToVisibleCells()
            }
            return true
        case .insert:
            noteDeletionCompensation(removing: [])
            // Index 0 = bas visuel du flux inversé, juste sous le message le
            // plus récent. `itemIdentifier(for:)` résout ce voisin en O(1) —
            // relire tous les identifiants pour prendre le premier serait
            // payer la fenêtre entière, ce que ce chemin existe pour éviter.
            if let first = dataSource.itemIdentifier(for: IndexPath(item: 0, section: 0)) {
                snapshot.insertItems([.typingIndicator], beforeItem: first)
            } else {
                snapshot.appendItems([.typingIndicator], toSection: .main)
            }
        case .remove:
            noteDeletionCompensation(removing: [.typingIndicator])
            snapshot.deleteItems([.typingIndicator])
        }
        lastTypingRosterFingerprint = fingerprint

        let shouldAutoScroll = showTyping
            && isCurrentlyNearBottom
            && !collectionView.isDragging
            && !collectionView.isDecelerating
            && !collectionView.isTracking
        applyToDataSource(snapshot) { [weak self] in
            guard let self else { return }
            self.applyFocalPerspectiveToVisibleCells()
            if shouldAutoScroll {
                // Le rouleau avance d'un cran, net — pas de ressort.
                self.scrollToBottom(animated: false)
            }
        }
        return true
    }

    // MARK: - Métadonnées par message

    /// Diffe un dictionnaire `[messageId: Value]` publié par le ViewModel et
    /// queue un reconfigure ciblé pour chaque clé dont la valeur a changé ou
    /// disparu. Mutualise les cinq flux de métadonnées par message
    /// (traductions, transcriptions, audios traduits, overrides, sélection
    /// drapeaux) — avant, chaque flux dupliquait ce diff sur 18 lignes avec
    /// sa propre propriété `lastX`. Le snapshot précédent vit dans la closure
    /// (capture `var`), le sink s'exécute sur le main via `receive(on:)`.
    func observePerMessageDictionary<Value: Equatable>(
        _ publisher: Published<[String: Value]>.Publisher,
        initial: [String: Value]
    ) {
        var last = initial
        publisher
            .receive(on: DispatchQueue.main)
            .dropFirst()
            .sink { [weak self] new in
                guard let self else { return }
                var changed: Set<String> = []
                for (msgId, val) in new where last[msgId] != val {
                    changed.insert(msgId)
                }
                for msgId in last.keys where new[msgId] == nil {
                    changed.insert(msgId)
                }
                last = new
                self.queueReconfigure(for: changed)
            }
            .store(in: &cancellables)
    }
}
