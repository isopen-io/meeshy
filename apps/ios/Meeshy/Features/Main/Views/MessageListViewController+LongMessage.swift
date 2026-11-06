// apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LongMessage.swift

import UIKit
import SwiftUI

//
// Le dépliage EN PLACE d'un message long (#8147), dans les modes que ce fil
// rend (Bulles, Script, Focal). Le message se déplie DANS le fil, sans saut
// de défilement, et devient un message ORDINAIRE du mode courant (#16463) :
// aucune mise en avant, aucun repli. Loi : `LongMessageExpansionLaw`.
//

extension MessageListViewController {

    /// Les messages longs dépliés — ils le restent tant que le fil vit.
    var expandedLongMessageLocalIds: Set<String> {
        longMessageExpansionState.expandedIds
    }

    /// L'état de dépliage d'UNE cellule, remis à la bulle par l'environnement
    /// (la rangée plate le reçoit par `FocalRowInput.isExpanded`).
    func longMessageExpansion(for localId: String) -> LongMessageExpansion {
        LongMessageExpansion(messageId: localId, isExpanded: expandedLongMessageLocalIds.contains(localId)) { [weak self] in
            self?.expandLongMessage(localId)
        }
    }

    /// « Lire la suite ». Pose la nouvelle hauteur de la cellule en tenant
    /// immobile son HAUT (`LongMessageExpansionLaw.anchor`) — aucun saut de
    /// défilement. Un message déjà déplié ne bouge pas : rien ne le replie.
    ///
    /// La hauteur s'ANIME comme sur le web (#8232) : 300 ms, la courbe
    /// partagée (`FOCAL_METRICS.expandCurve`). Le LAYOUT, lui, se pose d'un
    /// coup, hors de toute enveloppe `UIView.animate` — mesuré au simulateur
    /// en Release (#8162), l'enveloppe coûtait 27–84 ms de fil principal et 2
    /// à 6 images perdues par bascule. L'écart est rejoué ENSUITE sur le
    /// serveur de rendu (`playHeightMotion`) : chaque cellule part de son
    /// ordonnée d'avant et le déplié se déroule depuis son haut tenu, sans
    /// travail du fil principal pendant les 300 ms.
    func expandLongMessage(_ localId: String) {
        guard isViewLoaded, dataSource != nil, !expandedLongMessageLocalIds.contains(localId) else { return }
        longMessageExpansionState.expandedIds = LongMessageExpansionLaw.expanded(after: expandedLongMessageLocalIds, tapping: localId)

        var snapshot = dataSource.snapshot()
        let item = MessageListItem.message(localId: localId)
        guard snapshot.indexOfItem(item) != nil else { return }
        snapshot.reconfigureItems([item])

        let anchor = LongMessageExpansionLaw.anchor
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
        //
        // La passe ne suffisait pas (#8232) : la correction de taille de la
        // cellule traverse le PLAFOND d'invalidations partielles du layout, et
        // un toucher qui suit un défilement dans le même tour le trouvait déjà
        // consommé — correction avalée, jamais ré-émise (mesuré : 242 pt au lieu
        // de 707 après 500 ms, alors que le contenu hébergé mesurait 707). Le
        // geste rouvre le budget et redemande explicitement la taille de la
        // rangée reconfigurée.
        let timing = LongMessageExpansionLaw.heightTiming(reduceMotion: UIAccessibility.isReduceMotionEnabled)
        let before = timing.map { _ in captureHeightMotion() }
        UIView.performWithoutAnimation {
            (collectionView.collectionViewLayout as? MessageListLayout)?.admitDeliberateResize()
            applyToDataSource(snapshot) {}
            dataSource.indexPath(for: item)
                .flatMap { collectionView.cellForItem(at: $0) }?
                .invalidateIntrinsicContentSize()
            collectionView.layoutIfNeeded()
            holdAnchoredEdge()
        }
        if let timing, let before {
            playHeightMotion(from: before, expanded: localId, anchor: anchor, timing: timing)
        }
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
        expanded localId: String,
        anchor: LongMessageExpansionLaw.Anchor,
        timing: LongMessageExpansionLaw.HeightTiming
    ) {
        let expanding = MessageListItem.message(localId: localId)
        guard let expandedBefore = before.spans[expanding], let expandedAfter = onScreenSpan(of: expanding) else { return }
        let inverted = collectionView.transform.d < 0
        let expandingPin = LongMessageExpansionLaw.pin(for: anchor, listIsInverted: inverted)
        let otherPin = LongMessageExpansionLaw.pin(for: .bottom, listIsInverted: inverted)
        var landed = Set<MessageListItem>()

        for cell in collectionView.visibleCells {
            guard let item = item(of: cell), let after = onScreenSpan(of: item) else { continue }
            landed.insert(item)
            let spanBefore = before.spans[item] ?? Self.shifted(after, by: -LongMessageExpansionLaw.regionShift(
                beyondEnd: after.origin >= expandedAfter.end - 0.5, expandedBefore: expandedBefore, expandedAfter: expandedAfter
            ))
            let pin = item == expanding ? expandingPin : otherPin
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
        // cellule sur les côtés et au bord tenu, où les ombres et les
        // réactions de la rangée peuvent dépasser.
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
