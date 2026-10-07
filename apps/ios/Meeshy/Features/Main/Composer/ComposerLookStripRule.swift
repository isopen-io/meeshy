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

/// Ce que la bande REPLIÉE montre à la place du déclencheur (#9557).
nonisolated enum ComposerLookStripTrigger: Equatable, Sendable {
    /// Rien n'est choisi : un déclencheur simple, aucune trame peinte.
    case shutter
    /// Un look est choisi : sa miniature vivante, qui déclenche.
    case thumbnail
    /// On retouche : rien à déclencher — la miniature seule n'existe que
    /// pendant la capture (#9567).
    case hidden
}

/// **Ce que le défilement choisit** (#9566, porteur 2026-10-07 : « lorsqu'on
/// scroll les effets ou frames celui qui est au milieu est automatiquement
/// sélectionné »).
///
/// La case arrivée au centre est choisie — sauf pendant un défilement que la
/// bande fait D'ELLE-MÊME (à l'ouverture, ou vers une case touchée) : les cases
/// qu'elle traverse alors ne sont pas des choix, et y répondre la ferait courir
/// après elle-même. Un tel défilement que le doigt interrompt se solde au repos.
nonisolated struct ComposerLookStripFollow: Equatable, Sendable {

    /// Ce que la bande fait en s'arrêtant.
    enum Rest: Equatable, Sendable {
        case nothing
        /// Elle repose ailleurs que sur le choix : cette case est choisie.
        case choose(Int)
        /// Elle n'a pas bougé vers sa cible : elle la rejoint.
        case rejoin(Int)
    }

    /// La case que la bande rejoint d'elle-même ; `nil` ⇒ elle suit le doigt.
    private(set) var target: Int?
    private(set) var centered: Int?
    private(set) var hasBegun = false
    /// Le centre a changé depuis que la cible est posée.
    private var movedSinceTarget = false

    /// La bande s'ouvre en tête, puis rejoint la case choisie.
    mutating func begin(chosen: Int?) {
        hasBegun = true
        target = chosen
        movedSinceTarget = false
    }

    /// `index` est arrivée au centre : la case à choisir, `nil` si rien ne change.
    mutating func centered(on index: Int, chosen: Int?, selects: Bool) -> Int? {
        let avant = centered
        centered = index
        guard let target else { return selects && index != chosen ? index : nil }
        if let avant, avant != index { movedSinceTarget = true }
        if target == index { self.target = nil }
        return nil
    }

    /// Le choix vient de changer : la case où défiler, `nil` si elle est déjà
    /// au centre — un choix né du défilement ne fait rien défiler.
    mutating func chose(_ index: Int) -> Int? {
        movedSinceTarget = false
        guard index != centered else {
            target = nil
            return nil
        }
        target = index
        return index
    }

    /// La bande s'est arrêtée. Une cible qu'elle n'a pas commencé à rejoindre
    /// se rejoint — jamais « Aucun » choisi parce que la bande s'est ouverte en
    /// tête ; un trajet que le doigt a coupé choisit la case où il s'arrête.
    mutating func settled(chosen: Int?, selects: Bool) -> Rest {
        if let target, !movedSinceTarget { return .rejoin(target) }
        target = nil
        movedSinceTarget = false
        guard selects, let centered, centered != chosen else { return .nothing }
        return .choose(centered)
    }
}

/// **Les lois de la bande** (#9351, spec § 3.1 et § 5) — décision du porteur :
/// les miniatures sont VIVANTES (le direct avant la prise, le média après),
/// filtre et cadre se COMBINENT, et la case choisie est encadrée.
nonisolated enum ComposerLookStripRule {

    static let cellSize = CGSize(width: 56, height: 100)

    /// **Sans filtre ni cadre, rien ne recopie la caméra en bas de l'écran**
    /// (porteur 2026-10-07, #9557) : une miniature du viseur nu n'apprend rien.
    /// La bande repliée devient un déclencheur simple ; en retouche, où rien ne
    /// se déclenche, elle s'efface.
    static func collapsedTrigger(look: ComposerPhotoLook, editing: Bool) -> ComposerLookStripTrigger {
        guard !editing else { return .hidden }
        return look.isUntouched ? .shutter : .thumbnail
    }

    /// La bande peint-elle des trames ? Ouverte, toujours ; repliée, seulement
    /// la miniature d'un look choisi.
    static func paintsLive(look: ComposerPhotoLook, familyOpen: Bool) -> Bool {
        familyOpen || !look.isUntouched
    }
    static let spacing: CGFloat = 8
    static var pitch: CGFloat { cellSize.width + spacing }
    /// Le nom du choix, seul et en grand sous la bande (#9566).
    static let chosenNameSize: CGFloat = 20

    /// La case sous le milieu de la bande, pour un défilement de `scrolled`
    /// points depuis la première ; les rebonds restent sur les bords.
    static func centeredIndex(scrolled: CGFloat, count: Int) -> Int? {
        guard count > 0 else { return nil }
        return min(count - 1, max(0, Int((scrolled / pitch).rounded())))
    }

    /// « Aucun » en tête, puis la famille dans son ordre — chaque cadre une fois.
    /// Calculée UNE fois : le défilement relit la bande à chaque image.
    static func items(_ family: ComposerLookFamily) -> [ComposerLookStripItem] {
        switch family {
        case .filters: return filterItems
        case .frames: return frameItems
        }
    }

    private static let filterItems = ComposerPhotoLookRule.filters.map { ComposerLookStripItem.filter($0) }

    private static let frameItems: [ComposerLookStripItem] = {
        let cadres = ComposerLiveLookRule.chips()
            .flatMap { ComposerLiveLookRule.frames(for: $0) }
            .filter { $0 != ComposerPhotoFrame.none }
        let uniques = cadres.reduce(into: (vus: Set<ComposerPhotoFrame>(), ordre: [ComposerPhotoFrame]())) { acc, cadre in
            if acc.vus.insert(cadre).inserted { acc.ordre.append(cadre) }
        }.ordre
        return [.frame(.none)] + uniques.map { ComposerLookStripItem.frame($0) }
    }()

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
