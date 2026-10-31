import Foundation
import MeeshySDK

// MARK: - Fond › Modifier : N1, N2, N3 dans le bas (#13974, lot I-E2)

/// **Une entrée de N1 « Modifier » d'un fond image ou vidéo**, identifiée
/// comme dans l'arbre partagé (`background.media.edit`) : Cadrage · Recadrer ·
/// Couper · Filtres · Cadres · Réglages · Effets · Son · Boucle · Pivoter ·
/// Description.
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
/// ouvert (N3).
nonisolated struct ComposerBackgroundModifyPath: Equatable, Sendable {
    var entry: ComposerBackgroundModifyEntry?
    var adjustment: AdjustmentKind?

    static let closed = ComposerBackgroundModifyPath(entry: nil, adjustment: nil)
}

/// **La loi de « Modifier » du fond.** N1 est ce que l'arbre déclare, dans SON
/// ordre, filtré par ce que le fond admet et par ce qu'iOS câble : une entrée
/// sans effet ici reste dans l'arbre, cible commune, mais ne se sert pas
/// (loi 4). Boucle en est une : le lecteur boucle toujours un fond vidéo
/// (`StoryRenderer`), l'interrupteur serait inerte.
nonisolated enum ComposerBackgroundModify {

    static let wiredOnIOS: Set<ComposerBackgroundModifyEntry> = Set(ComposerBackgroundModifyEntry.allCases)
        .subtracting([.loop])

    static func served(isVideo: Bool, hasTrimmableSource: Bool,
                       tree: ComposerEditTree = .shared) -> [ComposerBackgroundModifyEntry] {
        (tree.level(.backgroundMediaEdit)?.entries ?? []).compactMap { entree in
            guard let modif = ComposerBackgroundModifyEntry(rawValue: entree.id), wiredOnIOS.contains(modif),
                  admits(entree.offer, isVideo: isVideo, hasTrimmableSource: hasTrimmableSource) else {
                return nil
            }
            return modif
        }
    }

    static func entry(_ modif: ComposerBackgroundModifyEntry,
                      tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(modif.rawValue, in: .backgroundMediaEdit)
    }

    static func opening(_ modif: ComposerBackgroundModifyEntry) -> ComposerBackgroundModifyOpening {
        switch modif {
        case .framing, .crop, .trim, .filters, .frames, .description: return .properties
        case .adjust:                                                  return .level(.backgroundAdjust(.tone))
        case .effects:                                                 return .level(.backgroundAdjust(.effect))
        case .sound:                                                   return .level(.backgroundSound)
        case .rotate, .loop:                                           return .action
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

    /// Les niveaux de rail que le chemin pose au-dessus de N1.
    static func levels(_ path: ComposerBackgroundModifyPath) -> [ComposerEditRailLevel] {
        guard let modif = path.entry, case .level(let niveau) = opening(modif) else { return [] }
        return [niveau]
    }

    /// La feuille basse est-elle ouverte : une bande ou une feuille de N1, ou le
    /// curseur seul de N3.
    static func propertiesAreOpen(_ path: ComposerBackgroundModifyPath) -> Bool {
        if path.adjustment != nil { return true }
        guard let modif = path.entry else { return false }
        return opening(modif) == .properties
    }

    /// Retour : un niveau à la fois — N3, puis la feuille ou N2.
    static func back(_ path: ComposerBackgroundModifyPath) -> ComposerBackgroundModifyPath {
        guard path.adjustment == nil else { return ComposerBackgroundModifyPath(entry: path.entry, adjustment: nil) }
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
