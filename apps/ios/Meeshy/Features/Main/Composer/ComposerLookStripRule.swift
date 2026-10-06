import CoreGraphics
import Foundation

/// Les deux familles du rail (#9351).
nonisolated enum ComposerLookFamily: String, CaseIterable, Hashable, Sendable {
    case filters
    case frames
}

/// Une case de la bande : un filtre ou un cadre — jamais un look entier ; la case
/// MONTRE la paire qu'elle produirait avec l'autre moitié en cours.
nonisolated enum ComposerLookStripItem: Hashable, Sendable {
    case filter(VideoFilterPreset)
    case frame(ComposerPhotoFrame)
}

/// **Les lois de la bande** (#9351, spec § 3.1 et § 5) — décision du porteur :
/// les miniatures sont VIVANTES (le direct avant la prise, le média après),
/// filtre et cadre se COMBINENT, et la case choisie est encadrée.
nonisolated enum ComposerLookStripRule {

    static let cellSize = CGSize(width: 56, height: 100)
    static let spacing: CGFloat = 8
    static var pitch: CGFloat { cellSize.width + spacing }

    /// « Aucun » en tête, puis la famille dans son ordre — chaque cadre une fois.
    static func items(_ family: ComposerLookFamily) -> [ComposerLookStripItem] {
        switch family {
        case .filters:
            return ComposerPhotoLookRule.filters.map { ComposerLookStripItem.filter($0) }
        case .frames:
            let cadres = ComposerLiveLookRule.chips()
                .flatMap { ComposerLiveLookRule.frames(for: $0) }
                .filter { $0 != ComposerPhotoFrame.none }
            let uniques = cadres.reduce(into: [ComposerPhotoFrame]()) { vus, cadre in
                if !vus.contains(cadre) { vus.append(cadre) }
            }
            return [.frame(.none)] + uniques.map { ComposerLookStripItem.frame($0) }
        }
    }

    /// **Filtre et cadre se COMBINENT** : choisir l'un garde l'autre.
    static func look(of item: ComposerLookStripItem, combinedWith current: ComposerPhotoLook) -> ComposerPhotoLook {
        switch item {
        case .filter(let preset): return ComposerPhotoLook(filter: preset, frame: current.frame)
        case .frame(let cadre): return ComposerPhotoLook(filter: current.filter, frame: cadre)
        }
    }

    /// La case est-elle la moitié choisie du look ? C'est elle qu'on encadre.
    static func isChosen(_ item: ComposerLookStripItem, in look: ComposerPhotoLook) -> Bool {
        switch item {
        case .filter(let preset): return look.filter == preset
        case .frame(let cadre): return look.frame == cadre
        }
    }

    static func chosenIndex(in items: [ComposerLookStripItem], look: ComposerPhotoLook) -> Int? {
        items.firstIndex { isChosen($0, in: look) }
    }

    /// Les cases dont un pixel se voit, pour un défilement `offset` sur `width` points.
    static func visibleRange(offset: CGFloat, width: CGFloat, count: Int) -> ClosedRange<Int>? {
        guard width > 0, count > 0 else { return nil }
        let premiere = max(0, Int((offset / pitch).rounded(.down)))
        let derniere = min(count - 1, Int(((offset + width) / pitch).rounded(.down)))
        return premiere <= derniere ? premiere...derniere : nil
    }

    /// **Les cases peintes** : visibles ±1, au plus `cells` (palier thermique), les
    /// plus proches du centre d'abord, la choisie dès qu'elle est à portée. En
    /// enregistrement, la choisie seule — c'est elle qui déclenche, la bande
    /// la garde à l'écran. `visibleRange` compte l'espacement qui suit une case
    /// comme sien ; le retrait de bord de la bande est à l'appelant.
    static func paintedIndices(visible: ClosedRange<Int>?, count: Int, cells: Int, chosen: Int?,
                               recording: Bool) -> [Int] {
        guard cells > 0, count > 0 else { return [] }
        if recording { return chosen.map { [$0] } ?? [] }
        guard let visible else { return [] }
        let bas = max(0, visible.lowerBound - 1)
        let haut = min(count - 1, visible.upperBound + 1)
        guard bas <= haut else { return [] }
        let centre = Double(visible.lowerBound + visible.upperBound) / 2
        let parProximite = (bas...haut).sorted { gauche, droite in
            let ecartGauche = abs(Double(gauche) - centre)
            let ecartDroite = abs(Double(droite) - centre)
            return ecartGauche == ecartDroite ? gauche < droite : ecartGauche < ecartDroite
        }
        let proches = Array(parProximite.prefix(cells))
        guard let chosen, (bas...haut).contains(chosen), !proches.contains(chosen) else { return proches.sorted() }
        return (Array(proches.dropLast()) + [chosen]).sorted()
    }
}
