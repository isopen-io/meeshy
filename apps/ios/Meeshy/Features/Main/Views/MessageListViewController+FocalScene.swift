// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+FocalScene.swift

import UIKit
import SwiftUI
import MeeshySDK

//
// La scène FOCAL du fil : ligne de focus, élection, loupe de l'élu, carte et
// détails, aplatissement au repos. Sortie de `MessageListViewController.swift`
// (#7624, budget 1000-1200 lignes) avant d'y ajouter la vitesse de
// défilement qui diffère la carte de l'élu en plein fling.
//

// MARK: - Focal : perspective minimale, pendant le défilement seulement (2026-08-21)

extension MessageListViewController {

    /// Région visible du fil dans le repère de `view` : sous le chrome haut
    /// (`contentInset.bottom` du repère renversé) et au-dessus du composeur
    /// (`contentInset.top`).
    private var focalVisibleBounds: (top: CGFloat, bottom: CGFloat) {
        (collectionView.frame.minY + collectionView.contentInset.bottom,
         collectionView.frame.maxY - collectionView.contentInset.top)
    }

    /// Ligne de focus : le centre de la région visible, qui descend au bord
    /// bas au repos sur le dernier message (`FocalScrollPerspective.focusY`).
    /// `offsetFromBottom` : `contentOffset.y + contentInset.top` vaut 0 au
    /// repos en bas du fil renversé et croît vers l'historique.
    private var focalFocusY: CGFloat {
        let bounds = focalVisibleBounds
        return FocalScrollPerspective.focusY(
            visibleTop: bounds.top,
            visibleBottom: bounds.bottom,
            offsetFromBottom: collectionView.contentOffset.y + collectionView.contentInset.top
        )
    }

    private func focalGeometry(of cell: UICollectionViewCell) -> FocalScrollPerspective.CellGeometry? {
        guard let indexPath = collectionView.indexPath(for: cell),
              let item = dataSource?.itemIdentifier(for: indexPath) else { return nil }
        let visual = collectionView.convert(cell.frame, to: view)
        let id: String
        let isMessage: Bool
        switch item {
        case .message(let localId):
            id = localId
            isMessage = true
        case .dayHeader, .typingIndicator, .conversationStart, .firstUnreadSeparator:
            id = "\(indexPath.item)"
            isMessage = false
        }
        return FocalScrollPerspective.CellGeometry(id: id, visualMidY: visual.midY, height: visual.height, isMessage: isMessage)
    }

    /// Tick de défilement : la scène ne s'active que sur un geste UTILISATEUR
    /// (doigt posé ou décélération) — jamais sur un défilement programmé
    /// (message entrant, atterrissage de recherche). Le premier tick arme la
    /// fenêtre d'entrée animée ; chaque tick annule l'aplatissement en attente.
    func noteFocalScrollTick(_ scrollView: UIScrollView) {
        guard readingMode == .focal, scrollView.isDragging || scrollView.isDecelerating else { return }
        focalScrollSpeedMeter.note(offset: scrollView.contentOffset.y, at: CACurrentMediaTime())
        focalFlattenWork?.cancel()
        focalFlattenWork = nil
        if !focalSceneActive {
            focalSceneActive = true
            focalSceneEnteredAt = CACurrentMediaTime()
        }
        applyFocalPerspectiveToVisibleCells()
    }

    /// À la POSE : compte à rebours de l'aplatissement
    /// (`FocalMetrics.Scene.restDelay`), réarmé à chaque pose.
    func scheduleFocalFlatten() {
        guard readingMode == .focal, focalSceneActive else { return }
        focalScrollSpeedMeter.reset()
        focalFlattenWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.flattenFocalScene(animated: true) }
        focalFlattenWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + FocalMetrics.Scene.restDelay, execute: work)
    }

    /// Retour à Script : transforms, opacités et carte rejoignent l'identité
    /// — animés au repos (`flattenDuration`), secs au changement de mode —
    /// puis la rangée détaillée rend ses détails (UNE reconfiguration, hors
    /// mouvement). Un geste qui reprend pendant l'animation la reprend depuis
    /// la valeur présentée (`beginFromCurrentState`) et garde sa carte.
    func flattenFocalScene(animated: Bool) {
        focalFlattenWork?.cancel()
        focalFlattenWork = nil
        focalSceneActive = false
        // La scène repart de zéro : la magnificence devra se mériter à nouveau.
        focalMagnificationArmed = false
        focalScrollStartedAt = nil
        focalFocusedLocalId = nil
        guard isViewLoaded else { return }
        let cells = collectionView.visibleCells
        let flatten = {
            for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }
        }
        let finish = { [weak self] in
            guard let self, !self.focalSceneActive else { return }
            self.syncFocalFocusDetails()
            // #8147 — un message long déplié garde son effet Focal au repos.
            self.applyLongMessageExpansionPresentation(animated: true)
        }
        if animated {
            UIView.animate(
                withDuration: FocalMetrics.Scene.flattenDuration,
                delay: 0,
                options: [.curveEaseInOut, .beginFromCurrentState, .allowUserInteraction],
                animations: flatten,
                completion: { _ in finish() }
            )
        } else {
            UIView.performWithoutAnimation(flatten)
            finish()
        }
    }

    /// Pose d'UNE cellule qui entre à l'écran (sur-réserve comprise) : la
    /// passe collective — elle a besoin des voisines pour la compaction.
    /// No-op scène inactive : la cellule arrive à plat, comme en Script.
    func applyFocalPerspectiveOnCellDisplay() {
        guard readingMode == .focal, focalSceneActive else { return }
        applyFocalPerspectiveToVisibleCells()
    }

    /// Toutes les cellules visibles, une transaction — appelée par tick et
    /// après chaque reconfiguration : loi par distance + compaction symétrique
    /// + carte du message en focus. Dans la fenêtre d'entrée, chaque tick
    /// anime depuis la valeur présentée (pas de saut) ; ensuite, sec.
    func applyFocalPerspectiveToVisibleCells() {
        guard readingMode == .focal, isViewLoaded, focalSceneActive else { return }
        // #8147 — un message long déplié ET visible est LA mise en avant : la
        // scène lui cède les layers (une seule loupe, un seul bloc de verre).
        guard !isLongMessageExpansionVisible else { return applyLongMessageExpansionPresentation(animated: false) }
        let focusY = focalFocusY
        let cells = collectionView.visibleCells
        // **Tant que la magnificence n'est pas armée, le fil défile comme en
        // Script** (directive 2026-08-24 : « si la magnificence n'est pas
        // activée, la réduction et l'effet loop non plus ; le scroll se fait
        // naturellement en Script jusqu'à activation, où on considère TOUTES
        // les fonctions du mode Focal »). J'avais d'abord retardé la seule
        // élection en laissant le relief s'appliquer — c'était la moitié de la
        // règle : la réduction et la compaction sont, elles aussi, des
        // fonctions du mode, pas un décor neutre.
        guard focalMagnificationArmed else {
            for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }
            if focalFocusedLocalId != nil {
                focalFocusedLocalId = nil
                syncFocalFocusDetails()
            }
            return
        }
        // Les géométries ne servent QU'à l'élection, donc qu'une fois armé :
        // les construire avant la garde, c'était une résolution d'indexPath,
        // d'identifiant et de conversion de repère PAR CELLULE ET PAR FRAME
        // jetée pendant les quatre secondes de défilement soutenu qui
        // précèdent l'armement (`FocalMagnificationLaw.sustainedScrollMs`).
        var geometries: [FocalScrollPerspective.CellGeometry] = []
        geometries.reserveCapacity(cells.count)
        for cell in cells {
            guard let geometry = focalGeometry(of: cell) else { continue }
            geometries.append(geometry)
        }
        // **Aucune animation ENTRE les messages** (directive 2026-08-24 :
        // « les messages font comme des ressorts pour entrer et ressortir de
        // l'écran ; JE NE VEUX aucune animation entre les messages — une fois
        // dans la planche ils sont fixes »).
        //
        // `FocalScrollPerspective.poses` appliquait à CHAQUE rangée une échelle
        // et une opacité fonction de sa distance à la ligne de focus, plus une
        // compaction : c'est ce qui donnait le ressort à l'entrée et à la
        // sortie de l'écran. La loi elle-même (spec Focal §5, courbe gelée)
        // reste écrite et testée — elle n'est simplement plus APPLIQUÉE ; la
        // planche est fixe.
        //
        // Ce qui distingue l'élu : sa CARTE, ses chips et sa LOUPE (#6586,
        // 2026-09-15) — lui seul grandit, ses voisins restent à plat.
        let focused = FocalScrollPerspective.focusedId(cells: geometries, focusY: focusY, currentId: focalFocusedLocalId)
        let electionChanged = focalFocusedLocalId != focused
        // #7953 — la rangée qui PORTE ses pastilles ouvre un passage : ses
        // voisines s'écartent du pas que les pastilles mordent, par transform
        // seul — aucune hauteur ne change. Lue sur la CELLULE (ce qu'elle
        // rend), jamais sur `focalDetailedLocalId`, qui change avant que la
        // reconfiguration n'ait posé les pastilles sur la nouvelle rangée.
        let anchor = cells.first { FocalScrollPerspective.showsFocusDetails(cellTag: $0.tag) }
        let anchorMidY = anchor.flatMap { focalGeometry(of: $0)?.visualMidY }
        let clearance = FocalScrollPerspective.electionClearance(isFirstInGroup: anchor.map { FocalScrollPerspective.isGroupHead(cellTag: $0.tag) } ?? false)
        let growth = anchor.map { FocalScrollPerspective.loupeGrowth(of: $0.contentView.layer) } ?? 0
        for cell in cells {
            let geometry = focalGeometry(of: cell)
            let shift = geometry.map { FocalScrollPerspective.electionShift(cellMidY: $0.visualMidY, magnifiedMidY: anchorMidY, clearance: clearance, loupeGrowth: growth) } ?? 0
            FocalScrollPerspective.magnify(cell.contentView.layer, isFocused: focused != nil && geometry?.id == focused, shift: shift, animated: electionChanged)
        }
        focalFocusedLocalId = focused
        // Les détails du message en focus apparaissent AVEC la carte, pas au
        // posé (directive 2026-08-22) : la reconfiguration ne change aucune
        // hauteur (chips et identité sont des superpositions sur les lignes
        // de la carte), elle ne coûte qu'un rendu de deux cellules.
        // Carte et détails : différés + coalescés, jamais réentrants — et
        // jamais en plein fling (#7624, `FocalFocusDetailsMotionLaw`). La
        // condition porte sur l'ÉCART entre l'élu et la rangée détaillée, pas
        // sur le changement d'élection : un élu élu en pleine vitesse reçoit
        // sa carte au premier tick où le défilement repasse sous le seuil.
        if focalDetailedLocalId != focused,
           FocalFocusDetailsMotionLaw.revealsDetails(speed: focalScrollSpeedMeter.speed) {
            syncFocalFocusDetails()
        }
        // La carte du focus est le FOND SwiftUI de la rangée — un bloc de
        // verre depuis #8147 (`FocalGlassBlock`). Il n'existe plus AUCUNE
        // carte UIKit : rien à poser ni à démonter par cellule et par frame.
    }

    /// Les détails du message en focus (identité, jour + heure, texte
    /// plafonné) — par UNE reconfiguration ciblée, jamais par frame : posés à
    /// la pose tant que la scène est active, rendus à l'aplatissement.
    /// Même loi et mêmes mots que le message en focus de la rangée.
    func focalFocusTimestamp(for sentAt: Date) -> String {
        FocalFocusTimestamp.label(
            sentAt: sentAt,
            timeString: TimeStringCache.shared.format(sentAt),
            now: Date(),
            calendar: .current,
            locale: .current,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui"),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier"),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier")
        )
    }

    /// JAMAIS un `apply` synchrone : cette méthode est appelée depuis des
    /// complétions d'`apply` (pose, aplatissement) et, depuis le 2026-08-22,
    /// depuis le tick d'élection — qui peut lui-même tourner dans la
    /// complétion d'un `apply` de reconfiguration. Un `apply` imbriqué fait
    /// abandonner UIKit (`BUG_IN_CLIENT_OF_DIFFABLE_DATA_SOURCE_…_REENTRANTLY`,
    /// crash payé au simulateur). La reconfiguration est donc DIFFÉRÉE au
    /// prochain tour de la boucle principale et COALESCÉE (un seul apply en
    /// vol ; une élection qui change pendant l'apply est reprise à sa fin).
    func syncFocalFocusDetails() {
        guard !focalDetailsSyncScheduled else { return }
        focalDetailsSyncScheduled = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.focalDetailsSyncScheduled = false
            self.reconfigureFocalDetailsNow()
        }
    }

    private func reconfigureFocalDetailsNow() {
        // La VALEUR ne sert pas — seule son existence conditionne la suite.
        guard dataSource != nil else { return }
        if focalReconfigureInFlight {
            focalDetailsPendingAfterApply = true
            return
        }
        let target = (readingMode == .focal && focalSceneActive) ? focalFocusedLocalId : nil
        guard focalDetailedLocalId != target else { return }
        let previous = focalDetailedLocalId
        focalDetailedLocalId = target
        reconfigureFocalItems([previous, target].compactMap { $0 })
    }

    /// Le data source n'est plus un PARAMÈTRE : depuis #3947 l'application
    /// passe par `applyToDataSource`, donc la propriété. Garder l'argument
    /// aurait laissé croire qu'on peut viser un autre data source que celui
    /// où l'on applique.
    private func reconfigureFocalItems(_ localIds: [String]) {
        var snapshot = dataSource.snapshot()
        let present = Set(snapshot.itemIdentifiers)
        let items = localIds.map { MessageListItem.message(localId: $0) }.filter { present.contains($0) }
        guard !items.isEmpty else { return }
        snapshot.reconfigureItems(items)
        focalReconfigureInFlight = true
        applyToDataSource(snapshot) { [weak self] in
            guard let self else { return }
            self.focalReconfigureInFlight = false
            self.applyFocalPerspectiveToVisibleCells()
            if self.focalDetailsPendingAfterApply {
                self.focalDetailsPendingAfterApply = false
                self.syncFocalFocusDetails()
            }
        }
    }

    /// Sortie de Focal (changement de mode) : tout à plat, sec.
    func resetFocalPerspectiveOnVisibleCells() {
        flattenFocalScene(animated: false)
    }
}
