import Foundation
import MeeshySDK

// MARK: - Fond › Modifier, image posée › Modifier : N1, N2, N3 dans le bas
// (#13974, lots I-E2, I-E3 et I-E4)

/// **Un outil d'un fond ou d'un média posé, à plat dans son rail** (#14048),
/// identifié comme dans l'arbre partagé (`background.media.edit`,
/// `media.placed.edit`) : Cadrage · Recadrer · Couper · Filtres · Cadres ·
/// Réglages · Effets · Son · Boucle · Pivoter · Description, et pour un média
/// posé Mettre en fond (ou Remplacer le fond) · Faire un sticker.
nonisolated enum ComposerBackgroundModifyEntry: String, CaseIterable, Hashable, Sendable {
    case framing
    case crop
    case trim
    case filters
    case frames
    case adjust
    case effects
    case sound
    case loop
    case rotate
    case description
    case setAsBackground = "set-as-background"
    case replaceBackground = "replace-background"
    case makeSticker = "make-sticker"
}

/// **Ce qu'un média posé peut devenir** : le fond d'une diapo qui n'en a pas
/// (Mettre en fond), le fond à la place de l'ancien (Remplacer le fond), ou
/// rien — l'objet ne l'admet pas.
nonisolated enum ComposerPlacedBackgroundOffer: Equatable, Sendable {
    case none
    case set
    case replace
}

/// Ce qu'une entrée de N1 OUVRE sur iOS : la feuille basse (une bande ou une
/// feuille de l'arbre), un niveau de rail posé par-dessus, ou un geste
/// immédiat.
nonisolated enum ComposerBackgroundModifyOpening: Equatable, Sendable {
    case properties
    case level(ComposerEditRailLevel)
    case action
}

/// **Où l'on est sous « Modifier »** : l'entrée de N1 ouverte (sa feuille ou
/// son N2) et, sous Réglages ou Effets, le réglage dont le curseur seul est
/// ouvert (N3) — sous Son, le curseur du Volume. Un seul curseur à la fois :
/// la loi qui ouvre l'un range l'autre.
nonisolated struct ComposerBackgroundModifyPath: Equatable, Sendable {
    var entry: ComposerBackgroundModifyEntry?
    var adjustment: AdjustmentKind?
    var volume = false

    static let closed = ComposerBackgroundModifyPath(entry: nil, adjustment: nil)
}

/// **La loi des outils du fond**, posés à plat dans son rail (#14048) : ce que
/// l'arbre déclare, dans SON ordre, filtré par ce que le fond admet et par ce qu'iOS câble : une entrée
/// sans effet ici reste dans l'arbre, cible commune, mais ne se sert pas
/// (loi 4). Boucle en est une : le lecteur boucle toujours un fond vidéo
/// (`StoryRenderer`), l'interrupteur serait inerte.
nonisolated enum ComposerBackgroundModify {

    static let wiredOnIOS: Set<ComposerBackgroundModifyEntry> = Set(ComposerBackgroundModifyEntry.allCases)
        .subtracting([.loop])

    static func served(isVideo: Bool, hasTrimmableSource: Bool,
                       tree: ComposerEditTree = .shared) -> [ComposerBackgroundModifyEntry] {
        served(in: .backgroundMediaEdit, wired: wiredOnIOS, isVideo: isVideo,
               hasTrimmableSource: hasTrimmableSource, tree: tree)
    }

    /// **N1 d'un média POSÉ** (I-E3) : l'arbre `media.placed.edit`, dans son
    /// ordre. Mettre en fond et Remplacer le fond ne se servent jamais
    /// ensemble — la diapo a un fond ou n'en a pas ; Faire un sticker attend
    /// le détourage. Son va à la vidéo posée (I-E4), par l'offre de l'arbre.
    static func servedPlaced(isVideo: Bool, hasTrimmableSource: Bool,
                             background: ComposerPlacedBackgroundOffer, makesSticker: Bool,
                             tree: ComposerEditTree = .shared) -> [ComposerBackgroundModifyEntry] {
        let cables = Set(ComposerBackgroundModifyEntry.allCases.filter { modif in
            switch modif {
            case .framing, .loop:         return false
            case .setAsBackground:        return background == .set
            case .replaceBackground:      return background == .replace
            case .makeSticker:            return makesSticker
            case .crop, .trim, .filters, .frames, .adjust, .effects, .sound, .rotate, .description: return true
            }
        })
        return served(in: .mediaPlacedEdit, wired: cables, isVideo: isVideo,
                      hasTrimmableSource: hasTrimmableSource, tree: tree)
    }

    /// **Les outils d'un SON posé** (#14048) : Couper, quand sa source est
    /// connue — le mot et le glyphe de l'arbre. Volume et Muet suivent, ceux
    /// du niveau `media.sound` (`ComposerMediaSound`).
    static func servedSound(hasTrimmableSource: Bool,
                            tree: ComposerEditTree = .shared) -> [ComposerBackgroundModifyEntry] {
        hasTrimmableSource && entry(.trim, tree: tree) != nil ? [.trim] : []
    }

    /// L'entrée de l'arbre : celle du fond, ou celle du média posé pour ce
    /// que seul un média posé porte. Une entrée commune a les mêmes mots et
    /// glyphes aux deux niveaux.
    static func entry(_ modif: ComposerBackgroundModifyEntry,
                      tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(modif.rawValue, in: .backgroundMediaEdit) ?? tree.entry(modif.rawValue, in: .mediaPlacedEdit)
    }

    private static func served(in level: ComposerEditTree.LevelID, wired: Set<ComposerBackgroundModifyEntry>,
                               isVideo: Bool, hasTrimmableSource: Bool,
                               tree: ComposerEditTree) -> [ComposerBackgroundModifyEntry] {
        (tree.level(level)?.entries ?? []).compactMap { entree in
            guard let modif = ComposerBackgroundModifyEntry(rawValue: entree.id), wired.contains(modif),
                  admits(entree.offer, isVideo: isVideo, hasTrimmableSource: hasTrimmableSource) else {
                return nil
            }
            return modif
        }
    }

    static func opening(_ modif: ComposerBackgroundModifyEntry) -> ComposerBackgroundModifyOpening {
        switch modif {
        case .framing, .crop, .trim, .filters, .frames, .description: return .properties
        case .adjust:                                                  return .level(.backgroundAdjust(.tone))
        case .effects:                                                 return .level(.backgroundAdjust(.effect))
        case .sound:                                                   return .level(.backgroundSound)
        case .rotate, .loop, .setAsBackground, .replaceBackground, .makeSticker: return .action
        }
    }

    /// Toucher une entrée ouvre sa feuille ou son N2 ; la retoucher les range.
    /// Un geste immédiat ne change pas le chemin.
    static func tapped(_ modif: ComposerBackgroundModifyEntry,
                       in path: ComposerBackgroundModifyPath) -> ComposerBackgroundModifyPath {
        guard opening(modif) != .action else { return path }
        return path.entry == modif ? .closed : ComposerBackgroundModifyPath(entry: modif, adjustment: nil)
    }

    /// Toucher un réglage de N2 ouvre son curseur seul ; le retoucher le range.
    static func tapped(adjustment kind: AdjustmentKind,
                       in path: ComposerBackgroundModifyPath) -> ComposerBackgroundModifyPath {
        ComposerBackgroundModifyPath(entry: path.entry, adjustment: path.adjustment == kind ? nil : kind)
    }

    /// Toucher Volume dans N2 « Son » ouvre son curseur seul ; le retoucher le
    /// range.
    static func tappedVolume(in path: ComposerBackgroundModifyPath) -> ComposerBackgroundModifyPath {
        ComposerBackgroundModifyPath(entry: path.entry, adjustment: nil, volume: !path.volume)
    }

    /// Les niveaux de rail que le chemin pose au-dessus de N1.
    static func levels(_ path: ComposerBackgroundModifyPath) -> [ComposerEditRailLevel] {
        guard let modif = path.entry, case .level(let niveau) = opening(modif) else { return [] }
        return [niveau]
    }

    /// La feuille basse est-elle ouverte : une bande ou une feuille de N1, ou le
    /// curseur seul de N3.
    static func propertiesAreOpen(_ path: ComposerBackgroundModifyPath) -> Bool {
        if path.adjustment != nil || path.volume { return true }
        guard let modif = path.entry else { return false }
        return opening(modif) == .properties
    }

    /// Retour : un niveau à la fois — N3, puis la feuille ou N2.
    static func back(_ path: ComposerBackgroundModifyPath) -> ComposerBackgroundModifyPath {
        guard path.adjustment == nil, !path.volume else {
            return ComposerBackgroundModifyPath(entry: path.entry, adjustment: nil)
        }
        return .closed
    }

    /// Les réglages de N2 : ceux que le fond PEINT (une vidéo n'a ni netteté
    /// ni flou, ni effets).
    static func adjustments(_ family: AdjustmentFamily, isVideo: Bool) -> [AdjustmentKind] {
        AdjustmentKind.served(for: isVideo ? .video : .image, in: family)
    }

    /// Une demande d'édition venue d'une autre porte (le rognage de la frise,
    /// un sous-outil nommé) ouvre l'entrée de N1 qui lui répond.
    static func entry(for section: ComposerObjectEditorSection?) -> ComposerBackgroundModifyEntry? {
        guard case .media(let outil) = section else { return nil }
        switch outil {
        case .crop:             return .crop
        case .trim:             return .trim
        case .filter:           return .filters
        case .look:             return .frames
        case .adjust:           return .adjust
        case .effects:          return .effects
        case .altText:          return .description
        case .actions, .split:  return nil
        }
    }

    private static func admits(_ offer: ComposerEditTree.Offer, isVideo: Bool, hasTrimmableSource: Bool) -> Bool {
        switch offer {
        case .always, .editor, .look:   return true
        case .image:                    return !isVideo
        case .video:                    return isVideo
        case .trimmable:                return isVideo && hasTrimmableSource
        case .mediaSource, .camera:     return false
        }
    }
}
