// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+UnreadSeparator.swift

import UIKit
import SwiftUI
import Combine
import MeeshySDK

// Le cluster SÉPARATEUR DE PREMIER NON-LU (#7222, D-L1..3) : la frontière
// gelée, l'insertion de l'item dans le snapshot, sa cellule et l'abonnement
// qui la capture depuis le ViewModel.
//
// Type DÉDIÉ demandé par le cadrage du lot — `MessageListViewController.swift`
// (3515 lignes) est hors du budget 1000-1200 de la directive 2026-08-28,
// même idiome que `+Insets`/`+SeenTracking`/`+Snapshot`/`+ThreadQuiescence` :
// on n'ajoute pas EN PLACE à un fichier hors budget, on ajoute dans son
// extension dédiée. Les trois points d'accroche côté hôte (le stockage de
// `frozenUnreadSeparator`, la registration + son `case` dans le switch de
// `configureDataSource`, l'appel à `itemsWithUnreadSeparator` dans
// `applySnapshot`) sont les seuls que Swift ne permet PAS de sortir d'ici —
// une extension ne peut déclarer ni propriété stockée ni nouveau `case` de
// `switch` dans une fermeture qui vit chez l'hôte.

/// La frontière gelée UNE fois à l'ouverture (#7222) : le `localId` du
/// PREMIER message non lu (ancre de position, jumelle de `.dayHeader`) et le
/// compte affiché — gelés ENSEMBLE, jamais l'un sans l'autre, sinon le
/// libellé du séparateur ne décrirait plus sa position.
struct UnreadSeparatorBoundary: Equatable {
    let localId: String
    let count: Int
}

extension MessageListViewController {

    // MARK: - Cellule

    /// La pill « N messages non lus » — même idiome que `dayHeaderRegistration`
    /// (`MessageListViewController.swift`, `configureDataSource`) : le contenu
    /// est recalculé à CHAQUE configuration depuis l'état gelé du contrôleur,
    /// jamais porté par l'item du diffable.
    func makeUnreadSeparatorRegistration() -> UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> {
        UICollectionView.CellRegistration<UICollectionViewCell, MessageListItem> { [weak self] cell, _, item in
            guard let self, case .firstUnreadSeparator = item,
                  let boundary = self.frozenUnreadSeparator else {
                cell.contentConfiguration = nil
                return
            }
            let dark = self.isDark
            cell.contentConfiguration = UIHostingConfiguration {
                FirstUnreadSeparatorRow(count: boundary.count, isDark: dark)
                    .scaleEffect(x: 1, y: -1)
            }
            .margins(.all, 0)
            cell.backgroundColor = .clear
        }
    }

    // MARK: - Positionnement dans le flux

    /// Insère le séparateur juste APRÈS le message qu'il précède
    /// visuellement dans `items` — « après » en INDEX place l'item plus HAUT
    /// à l'écran, à cause du flip qui inverse le flux (même règle que
    /// `.dayHeader`, voir `MessageListSnapshotPrep`). Sans frontière gelée,
    /// ou si son message-cible est hors de la fenêtre courante (page plus
    /// ancienne pas encore chargée), `items` ressort INCHANGÉ — un item
    /// introuvable ne serait jamais matérialisé et casserait le diff en
    /// silence.
    func itemsWithUnreadSeparator(_ items: [MessageListItem]) -> [MessageListItem] {
        guard let boundary = frozenUnreadSeparator,
              let index = items.firstIndex(of: .message(localId: boundary.localId)) else {
            return items
        }
        var result = items
        result.insert(.firstUnreadSeparator(afterLocalId: boundary.localId), at: index + 1)
        return result
    }

    // MARK: - Capture + révélation (D-L2)

    /// S'abonne UNE fois (appelée depuis `observeConversationViewModel()`,
    /// elle-même idempotente) à la frontière que `ConversationViewModel+
    /// InitialLoad` calcule via `FirstUnreadBoundary.resolve` (S1). La
    /// première valeur NON NIL gèle `frozenUnreadSeparator`, rejoue la pose
    /// du snapshot (le séparateur entre dans `items`) puis scrolle DESSUS
    /// (D-L2) — `nil` (fil sans non-lus) ne gèle rien : l'ouverture reste en
    /// bas, comportement inchangé.
    func bindUnreadSeparator(_ vm: ConversationViewModel) {
        vm.$firstUnreadMessageId
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak vm] localId in
                guard let self, let vm, self.frozenUnreadSeparator == nil,
                      let localId else { return }
                self.frozenUnreadSeparator = UnreadSeparatorBoundary(
                    localId: localId,
                    count: vm.unreadSeparatorCount
                )
                self.applySnapshot(reconfigure: .allItems)
                self.revealFrozenUnreadSeparator()
            }
            .store(in: &cancellables)
    }

    /// Scrolle SUR le séparateur (D-L2) une fois qu'il est entré dans le
    /// snapshot, puis REND LA SCÈNE au verrou.
    ///
    /// Trois choses qu'un `scrollToItem` nu ne fait pas, et que tout autre
    /// défilement VOULU de ce contrôleur fait :
    ///
    /// 1. **Il re-vise.** `scrollToItem` calcule son offset sur des hauteurs
    ///    ESTIMÉES. À l'OUVERTURE, aucune cellule autour de la cible n'est
    ///    réalisée : l'écart estimé/réel y est MAXIMAL — le même constat qui
    ///    a fait naître la visée vérifiée de `scrollToMessage`
    ///    (`beginVerifiedScroll`, « le saut au mauvais emplacement le plus
    ///    visible »). Une seconde passe, au tour suivant, vise des attributs
    ///    FRAIS.
    /// 2. **Il rend la scène au verrou.** `isIntentionalProgrammaticScroll`
    ///    retombe au tour SUIVANT — jamais dans la foulée de `scrollToItem`,
    ///    dont le `scrollViewDidScroll` synchrone précède le layout — et
    ///    l'ancre du verrou de scène ADOPTE alors la position atteinte
    ///    (`captureSceneLockAnchor`). Sans cet épilogue, la première
    ///    correction self-sizing retombait sur `enforceSceneLock`, qui
    ///    restaurait l'ancre du BAS et renvoyait le lecteur tout en bas :
    ///    exactement le défaut que D-L2 existe pour éviter. Épilogue
    ///    identique à `scrollToBottom(animated: false)`, posé là par la même
    ///    revue adversariale (2026-08-18).
    /// 3. **Il cède au doigt.** La scène n'appartient qu'au doigt : un geste
    ///    déjà en cours (fil lent à charger, frontière gelée en retard)
    ///    annule la révélation au lieu de la voler.
    ///
    /// Non animé, comme le reste des positions d'ouverture.
    private func revealFrozenUnreadSeparator(passesRemaining: Int = 1) {
        guard let boundary = frozenUnreadSeparator else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            guard !self.collectionView.isDragging,
                  !self.collectionView.isTracking,
                  !self.collectionView.isDecelerating,
                  let indexPath = self.dataSource.indexPath(
                    for: .firstUnreadSeparator(afterLocalId: boundary.localId)
                  ),
                  // L'index vient du SNAPSHOT, qui peut être en avance sur ce
                  // que la collection view a INGÉRÉ — même garde que
                  // `beginVerifiedScroll` : viser un item pas encore
                  // matérialisé lève une NSInternalInconsistencyException.
                  indexPath.item < self.collectionView.numberOfItems(inSection: 0)
            else {
                self.endUnreadSeparatorReveal()
                return
            }
            self.isIntentionalProgrammaticScroll = true
            self.collectionView.scrollToItem(at: indexPath, at: .centeredVertically, animated: false)
            if passesRemaining > 0 {
                self.revealFrozenUnreadSeparator(passesRemaining: passesRemaining - 1)
            } else {
                self.endUnreadSeparatorReveal()
            }
        }
    }

    /// L'épilogue commun de la révélation : au tour suivant — layout posé,
    /// hauteurs réelles — le drapeau retombe et le verrou de scène ADOPTE la
    /// position atteinte. Appelé aussi quand la révélation renonce (doigt en
    /// cours, cible pas encore matérialisée) : un drapeau qui fuirait à
    /// `true` désarmerait le verrou pour toute la session (filet de la revue
    /// adversariale 2026-08-18, `settleAtRest`).
    private func endUnreadSeparatorReveal() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.isIntentionalProgrammaticScroll = false
            self.captureSceneLockAnchor()
        }
    }
}
