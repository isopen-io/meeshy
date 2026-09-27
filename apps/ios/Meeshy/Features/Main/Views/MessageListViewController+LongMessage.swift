// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift

import UIKit
import SwiftUI

//
// Le dépliage EN PLACE d'un message long (#8147), dans les modes que ce fil
// rend (Bulles, Script, Focal). Il remplace la feuille « Lire plus » : le
// message se déplie DANS le fil, sans saut de défilement, et reçoit l'effet
// Focal — bloc de verre (posé par la rangée), loupe et voisins atténués
// (posés ici, sur les layers). Loi : `LongMessageExpansionLaw`.
//

extension MessageListViewController {

    /// Le message long déplié — un seul à la fois.
    var expandedLongMessageLocalId: String? {
        get { longMessageExpansionState.localId }
        set { longMessageExpansionState.localId = newValue }
    }

    /// L'état de dépliage d'UNE cellule, remis à la bulle par l'environnement
    /// (la rangée plate le reçoit par `FocalRowInput.isExpanded`).
    func longMessageExpansion(for localId: String) -> LongMessageExpansion {
        LongMessageExpansion(messageId: localId, isExpanded: expandedLongMessageLocalId == localId) { [weak self] in
            self?.toggleLongMessageExpansion(localId)
        }
    }

    /// « Lire la suite » / « Réduire ». Replie le précédent déplié, pose la
    /// nouvelle hauteur de la cellule en tenant immobile le bord ancré
    /// (`LongMessageExpansionLaw.anchor`) — aucun saut de défilement — puis
    /// pose l'effet Focal (animé, sauf sous Réduire le mouvement).
    ///
    /// La hauteur s'ANIME comme sur le web (#8232) : 300 ms, la courbe
    /// partagée (`FOCAL_METRICS.expandCurve`). Le LAYOUT, lui, se pose d'un
    /// coup, hors de toute enveloppe `UIView.animate` — mesuré au simulateur
    /// en Release (#8162), l'enveloppe coûtait 27–84 ms de fil principal et 2
    /// à 6 images perdues par bascule. L'écart est rejoué ENSUITE sur le
    /// serveur de rendu (`playHeightMotion`) : chaque cellule part de son
    /// ordonnée d'avant et le déplié se déroule depuis son bord tenu, sans
    /// travail du fil principal pendant les 300 ms.
    func toggleLongMessageExpansion(_ localId: String) {
        guard isViewLoaded, dataSource != nil else { return }
        let previous = expandedLongMessageLocalId
        let next = LongMessageExpansionLaw.nextExpanded(current: previous, toggled: localId)
        expandedLongMessageLocalId = next
        // Le déplié devient LE message mis en avant : l'élu du mode Focal
        // rend sa carte, une seule mise en avant à la fois.
        if next != nil, focalFocusedLocalId != nil {
            focalFocusedLocalId = nil
            syncFocalFocusDetails()
        }

        var snapshot = dataSource.snapshot()
        let present = Set(snapshot.itemIdentifiers)
        let items = Array(Set([previous, localId].compactMap { $0 }))
            .map { MessageListItem.message(localId: $0) }
            .filter { present.contains($0) }
        guard !items.isEmpty else { return }
        snapshot.reconfigureItems(items)

        let anchor = LongMessageExpansionLaw.anchor(isExpanding: next == localId)
        if visibleCell(forLocalId: localId) != nil, let edge = visualEdge(ofLocalId: localId, anchor: anchor) {
            beginAnchorHold(.init(localId: localId, anchor: anchor, edge: edge))
        }
        // La cellule re-hébergée s'auto-dimensionne dans une passe de layout
        // posée ICI, dans le même tour que la reconfiguration — pas
        // d'invalidation du layout : elle périmerait le mémo de la pastille de
        // jour (`MessageListStickyDayMemoGuardTests`). Le bord ancré est recalé
        // dans cette passe (`holdAnchoredEdge`, sur `contentSize`, puis une
        // fois encore après elle) : il ne bouge à aucune image.
        //
        // La passe est FORCÉE, sans animation (#8329). #8162 l'avait retirée
        // avec l'enveloppe `UIView.animate` — c'est l'enveloppe qui doublait
        // le coût, pas la passe, que le tour suivant aurait jouée de toute
        // façon. Sans elle, rien ne redemande la taille de la cellule
        // reconfigurée : mesuré en CI (`LongMessageAnchorTests`, fenêtre
        // rattachée à la scène, 2 s d'attente), la hauteur restait celle de
        // l'extrait — le message ne se dépliait pas.
        let timing = LongMessageExpansionLaw.heightTiming(reduceMotion: UIAccessibility.isReduceMotionEnabled)
        let before = timing.map { _ in captureHeightMotion() }
        UIView.performWithoutAnimation {
            applyToDataSource(snapshot) {}
            collectionView.layoutIfNeeded()
            holdAnchoredEdge()
        }
        if let timing, let before {
            playHeightMotion(from: before, toggled: localId, anchor: anchor, timing: timing)
        }
        applyLongMessageExpansionPresentation(animated: timing != nil)
    }

    // MARK: - La hauteur s'anime (#8232)

    /// Ce que le fil montrait AVANT la passe : l'intervalle à l'écran de
    /// chaque cellule visible, et son image — celles que la passe fait
    /// sortir de l'écran doivent glisser dehors, pas disparaître.
    struct HeightMotionCapture {
        let spans: [MessageListItem: LongMessageExpansionLaw.Span]
        let images: [MessageListItem: (view: UIView, frame: CGRect)]
    }

    private func captureHeightMotion() -> HeightMotionCapture {
        var spans: [MessageListItem: LongMessageExpansionLaw.Span] = [:]
        var images: [MessageListItem: (view: UIView, frame: CGRect)] = [:]
        for cell in collectionView.visibleCells {
            guard let item = item(of: cell), let span = onScreenSpan(of: item) else { continue }
            spans[item] = span
            guard let image = cell.snapshotView(afterScreenUpdates: false) else { continue }
            images[item] = (image, cell.frame.offsetBy(dx: 0, dy: -collectionView.contentOffset.y))
        }
        return HeightMotionCapture(spans: spans, images: images)
    }

    /// Rejoue sur le serveur de rendu l'écart entre le fil d'avant et celui
    /// que la passe vient de poser : chaque cellule part de son ordonnée
    /// d'avant (translation ADDITIVE vers 0 — une bascule en plein vol se
    /// compose avec la précédente au lieu de sauter), le déplié se déroule
    /// sous un masque depuis son bord tenu, et l'image d'une cellule sortie
    /// de l'écran glisse avec sa région avant de s'effacer.
    private func playHeightMotion(
        from before: HeightMotionCapture,
        toggled localId: String,
        anchor: LongMessageExpansionLaw.Anchor,
        timing: LongMessageExpansionLaw.HeightTiming
    ) {
        let toggled = MessageListItem.message(localId: localId)
        guard let expandedBefore = before.spans[toggled], let expandedAfter = onScreenSpan(of: toggled) else { return }
        let inverted = collectionView.transform.d < 0
        let togglePin = LongMessageExpansionLaw.pin(for: anchor, listIsInverted: inverted)
        let otherPin = LongMessageExpansionLaw.pin(for: .bottom, listIsInverted: inverted)
        var landed = Set<MessageListItem>()

        for cell in collectionView.visibleCells {
            guard let item = item(of: cell), let after = onScreenSpan(of: item) else { continue }
            landed.insert(item)
            let spanBefore = before.spans[item] ?? Self.shifted(after, by: -LongMessageExpansionLaw.regionShift(
                beyondEnd: after.origin >= expandedAfter.end - 0.5, expandedBefore: expandedBefore, expandedAfter: expandedAfter
            ))
            let pin = item == toggled ? togglePin : otherPin
            guard let motion = LongMessageExpansionLaw.heightMotion(before: spanBefore, after: after, pin: pin) else { continue }
            Self.play(motion, on: cell.layer, pin: pin, timing: timing)
        }

        let offset = collectionView.contentOffset.y
        var leaving: [UIView] = []
        for (item, image) in before.images where !landed.contains(item) {
            guard let spanBefore = before.spans[item] else { continue }
            let shift = LongMessageExpansionLaw.regionShift(
                beyondEnd: spanBefore.origin >= expandedBefore.end - 0.5, expandedBefore: expandedBefore, expandedAfter: expandedAfter
            )
            image.view.frame = image.frame.offsetBy(dx: 0, dy: offset + shift)
            collectionView.insertSubview(image.view, at: 0)
            Self.slide(image.view.layer, from: -shift, timing: timing)
            leaving.append(image.view)
        }
        guard !leaving.isEmpty else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + timing.duration) {
            leaving.forEach { $0.removeFromSuperview() }
        }
    }

    private static func shifted(_ span: LongMessageExpansionLaw.Span, by delta: CGFloat) -> LongMessageExpansionLaw.Span {
        .init(origin: span.origin + delta, length: span.length)
    }

    /// Clé de la fenêtre qui se déroule — lue par les témoins.
    static let heightRevealKey = "longMessage.reveal"

    private static func play(
        _ motion: LongMessageExpansionLaw.HeightMotion,
        on layer: CALayer,
        pin: LongMessageExpansionLaw.Pin,
        timing: LongMessageExpansionLaw.HeightTiming
    ) {
        if motion.translationFrom != 0 {
            slide(layer, from: motion.translationFrom, timing: timing)
        }
        guard let reveal = motion.revealFrom else { return }
        // Le masque ne coupe que le bord qui se DÉROULE : il déborde de la
        // cellule sur les côtés et au bord tenu, où la loupe du déplié et
        // son verre peuvent dépasser.
        let overhang = layer.bounds.width * 0.1
        let final = CGRect(
            x: -overhang,
            y: pin == .origin ? -overhang : 0,
            width: layer.bounds.width + 2 * overhang,
            height: layer.bounds.height + overhang
        )
        let mask = CALayer()
        mask.backgroundColor = UIColor.black.cgColor
        mask.anchorPoint = .zero
        mask.bounds = CGRect(origin: .zero, size: final.size)
        mask.position = final.origin
        layer.mask = mask

        let position = CABasicAnimation(keyPath: "position.y")
        position.fromValue = pin == .origin ? -overhang : reveal.origin
        position.toValue = final.origin.y
        let height = CABasicAnimation(keyPath: "bounds.size.height")
        height.fromValue = reveal.length + overhang
        height.toValue = final.height
        let group = CAAnimationGroup()
        group.animations = [position, height]
        group.duration = timing.duration
        group.timingFunction = timing.timingFunction
        mask.add(group, forKey: heightRevealKey)
        DispatchQueue.main.asyncAfter(deadline: .now() + timing.duration) { [weak layer] in
            guard let layer, layer.mask === mask else { return }
            layer.mask = nil
        }
    }

    /// Clé préfixe des translations — additives, donc une par bascule.
    static let heightSlideKeyPrefix = "longMessage.slide."

    /// Une translation verticale ADDITIVE, de `delta` vers 0.
    private static func slide(_ layer: CALayer, from delta: CGFloat, timing: LongMessageExpansionLaw.HeightTiming) {
        let animation = CABasicAnimation(keyPath: "position.y")
        animation.isAdditive = true
        animation.fromValue = delta
        animation.toValue = 0
        animation.duration = timing.duration
        animation.timingFunction = timing.timingFunction
        layer.add(animation, forKey: heightSlideKeyPrefix + UUID().uuidString)
    }

    /// L'intervalle À L'ÉCRAN d'un élément, lu sur les attributs du LAYOUT
    /// (posés dès la passe, avant que la cellule soit reposée), dans le
    /// repère interne de la liste.
    private func onScreenSpan(of item: MessageListItem) -> LongMessageExpansionLaw.Span? {
        guard let indexPath = dataSource?.indexPath(for: item),
              let frame = collectionView.layoutAttributesForItem(at: indexPath)?.frame else { return nil }
        return .init(origin: frame.minY - collectionView.contentOffset.y, length: frame.height)
    }

    private func item(of cell: UICollectionViewCell) -> MessageListItem? {
        guard let indexPath = collectionView.indexPath(for: cell) else { return nil }
        return dataSource?.itemIdentifier(for: indexPath)
    }

    /// Tient le bord ancré du dépliage pendant que sa hauteur se pose : à
    /// chaque changement de `contentSize`, quelle que soit la passe de layout
    /// qui le porte. La fenêtre se referme d'elle-même peu après.
    private func beginAnchorHold(_ hold: LongMessageExpansionState.Hold) {
        longMessageExpansionState.hold = hold
        longMessageExpansionState.contentSizeObservation = collectionView.observe(\.contentSize, options: [.new]) { [weak self] _, _ in
            MainActor.assumeIsolated { self?.holdAnchoredEdge() }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + LongMessageExpansionLaw.holdWindow) { [weak self] in
            guard let self, self.longMessageExpansionState.hold?.id == hold.id else { return }
            self.longMessageExpansionState.hold = nil
            self.longMessageExpansionState.contentSizeObservation = nil
        }
    }

    /// Ramène le bord tenu à son ordonnée VISUELLE d'avant la passe
    /// (`LongMessageExpansionLaw.anchoredOffset`). Le layout du fil tient,
    /// lui, le bas visuel ; sans ce décalage, un déplié dont le haut est sous
    /// le chrome grandirait vers le HAUT. Le doigt garde toujours la main.
    private func holdAnchoredEdge() {
        guard let hold = longMessageExpansionState.hold,
              !collectionView.isTracking,
              let edgeAfter = visualEdge(ofLocalId: hold.localId, anchor: hold.anchor)
        else { return }
        let inset = collectionView.adjustedContentInset
        let target = LongMessageExpansionLaw.anchoredOffset(
            current: collectionView.contentOffset.y,
            edgeBefore: hold.edge,
            edgeAfter: edgeAfter,
            minOffset: -inset.top,
            maxOffset: collectionView.contentSize.height - collectionView.bounds.height + inset.bottom
        )
        guard abs(target - collectionView.contentOffset.y) > 0.5 else { return }
        // Un défilement VOULU : loin du bas, le verrou de scène (loi du
        // rouleau) annule tout mouvement d'offset non piloté — il rendait ici
        // l'ancre d'avant, et le déplié grandissait vers le haut (#8157).
        // Le verrou ADOPTE ensuite la position atteinte.
        let wasIntentional = isIntentionalProgrammaticScroll
        isIntentionalProgrammaticScroll = true
        collectionView.contentOffset.y = target
        isIntentionalProgrammaticScroll = wasIntentional
        captureSceneLockAnchor()
    }

    /// L'effet Focal du déplié : loupe sur lui, voisins atténués — tant qu'il
    /// est VISIBLE. Sans déplié à l'écran, le fil redevient uniforme, sauf
    /// pendant la scène Focal, qui possède alors les layers.
    ///
    /// - Parameter excluding: la cellule qui QUITTE l'écran
    ///   (`didEndDisplaying`), encore listée parmi les visibles.
    func applyLongMessageExpansionPresentation(animated: Bool, excluding: UICollectionViewCell? = nil) {
        guard isViewLoaded else { return }
        let cells = collectionView.visibleCells.filter { $0 !== excluding }
        let expandedCell = expandedLongMessageLocalId.flatMap { id in cells.first { localId(of: $0) == id } }
        guard expandedCell != nil || !(readingMode == .focal && focalSceneActive) else { return }
        for cell in cells {
            let layer = cell.contentView.layer
            let isExpanded = cell === expandedCell
            guard expandedCell != nil else {
                FocalScrollPerspective.reset(layer)
                continue
            }
            cell.layer.zPosition = isExpanded ? 1 : 0
            guard !isExpanded else {
                FocalScrollPerspective.magnify(layer, isFocused: true, animated: animated)
                continue
            }
            let alpha = Float(LongMessageExpansionLaw.alpha(isExpandedCell: false, expansionVisible: true))
            guard layer.opacity != alpha || !CATransform3DIsIdentity(layer.transform) else { continue }
            let pose = {
                layer.transform = CATransform3DIdentity
                layer.opacity = alpha
            }
            guard animated else {
                pose()
                continue
            }
            UIView.animate(withDuration: FocalMetrics.Focus.expandDuration, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction], animations: pose)
        }
    }

    /// Le déplié est-il à l'écran ? La scène Focal lui cède alors les layers.
    var isLongMessageExpansionVisible: Bool {
        guard let id = expandedLongMessageLocalId, isViewLoaded else { return false }
        return collectionView.visibleCells.contains { localId(of: $0) == id }
    }

    private func localId(of cell: UICollectionViewCell) -> String? {
        guard let indexPath = collectionView.indexPath(for: cell),
              case .message(let localId) = dataSource?.itemIdentifier(for: indexPath) else { return nil }
        return localId
    }

    private func visibleCell(forLocalId localId: String) -> UICollectionViewCell? {
        guard let indexPath = dataSource?.indexPath(for: .message(localId: localId)) else { return nil }
        return collectionView.cellForItem(at: indexPath)
    }

    /// Ordonnée VISUELLE (repère de `view`) du bord ancré — la conversion
    /// traverse le renversement du fil. Lue sur les attributs du LAYOUT, pas
    /// sur `cell.frame` : quand `contentSize` change, le layout porte déjà
    /// la nouvelle hauteur alors que la cellule n'a pas encore été reposée.
    private func visualEdge(ofLocalId localId: String, anchor: LongMessageExpansionLaw.Anchor) -> CGFloat? {
        guard let indexPath = dataSource?.indexPath(for: .message(localId: localId)),
              let attributes = collectionView.layoutAttributesForItem(at: indexPath) else { return nil }
        let frame = collectionView.convert(attributes.frame, to: view)
        return anchor == .top ? frame.minY : frame.maxY
    }
}

extension LongMessageExpansionLaw.HeightTiming {
    /// Les quatre points de contrôle ; la diagonale si la table est mal formée.
    private var points: (Double, Double, Double, Double) {
        guard controlPoints.count == 4 else { return (0, 0, 1, 1) }
        return (controlPoints[0], controlPoints[1], controlPoints[2], controlPoints[3])
    }

    /// Le tempo en SwiftUI (Rivière).
    var animation: Animation {
        let (x1, y1, x2, y2) = points
        return .timingCurve(x1, y1, x2, y2, duration: duration)
    }

    /// Le tempo en Core Animation (le fil UIKit).
    var timingFunction: CAMediaTimingFunction {
        let (x1, y1, x2, y2) = points
        return CAMediaTimingFunction(controlPoints: Float(x1), Float(y1), Float(x2), Float(y2))
    }
}
