import Foundation

/// #16979 · #17901 — la famille d'outils d'un appel : cadre, filtre de couleur, effet de
/// visage, puis paysage et voix quand ils arrivent. Un genre ne porte qu'UN choix à la fois.
nonisolated enum CallEffectKind: String, CaseIterable, Hashable, Sendable {
    case frame
    case color
    case face
    case landscape
    case voice
}

/// Une couche : un genre et son choix (l'identifiant du cadre, du filtre, de l'effet).
nonisolated struct CallEffectLayer: Equatable, Hashable, Sendable {
    let kind: CallEffectKind
    let choice: String
}

/// **LA PILE D'EFFETS** — une loi pure (aucune vue, aucun singleton), la même sur les trois
/// plateformes (`call-effect-layers.ts`, `CallEffectLayers.kt`), que mode Effets et mode Montage
/// consomment tous les deux. Au plus trois couches, une par genre.
///
/// - Ajouter : un genre présent est remplacé À SA PLACE ; un genre absent s'empile au-dessus ;
///   pile pleine, l'ajout est refusé et la pile reste inchangée.
/// - Retirer : cette couche seule, les autres gardent leur ordre.
/// - Lister : de la couche du dessus à celle du dessous.
nonisolated struct CallEffectLayers: Equatable, Sendable {
    static let capacity = 3

    let bottomToTop: [CallEffectLayer]

    init(_ layers: [CallEffectLayer] = []) {
        let kept = layers.reduce(into: [CallEffectLayer]()) { acc, layer in
            guard !acc.contains(where: { $0.kind == layer.kind }) else { return }
            acc.append(layer)
        }
        bottomToTop = Array(kept.prefix(Self.capacity))
    }

    var isEmpty: Bool { bottomToTop.isEmpty }
    var isFull: Bool { bottomToTop.count >= Self.capacity }

    /// Ce que montre l'appui long sur (+) : la couche du dessus d'abord.
    var listed: [CallEffectLayer] { bottomToTop.reversed() }

    func layer(of kind: CallEffectKind) -> CallEffectLayer? {
        bottomToTop.first { $0.kind == kind }
    }

    func contains(_ kind: CallEffectKind) -> Bool {
        layer(of: kind) != nil
    }

    /// Un choix de ce genre se pose-t-il ? Oui s'il remplace sa couche, ou s'il reste de la place.
    func allows(_ kind: CallEffectKind) -> Bool {
        contains(kind) || !isFull
    }

    func adding(_ layer: CallEffectLayer) -> CallEffectLayers {
        if let index = bottomToTop.firstIndex(where: { $0.kind == layer.kind }) {
            var replaced = bottomToTop
            replaced[index] = layer
            return CallEffectLayers(replaced)
        }
        guard !isFull else { return self }
        return CallEffectLayers(bottomToTop + [layer])
    }

    func removing(_ kind: CallEffectKind) -> CallEffectLayers {
        guard contains(kind) else { return self }
        return CallEffectLayers(bottomToTop.filter { $0.kind != kind })
    }

    /// « Aucun » dans un genre (`choice` nul) retire la couche de ce genre.
    func choosing(_ kind: CallEffectKind, _ choice: String?) -> CallEffectLayers {
        guard let choice else { return removing(kind) }
        return adding(CallEffectLayer(kind: kind, choice: choice))
    }

    /// (+) : le genre ABSENT de la pile que le prochain toucher ouvre, parmi ceux que l'hôte
    /// sait montrer, en partant du genre où l'on est et sans jamais le renvoyer. Pile pleine,
    /// ou tout déjà posé : rien.
    func opening(after current: CallEffectKind?, among available: [CallEffectKind]) -> CallEffectKind? {
        guard !isFull, !available.isEmpty else { return nil }
        let start = current.flatMap { available.firstIndex(of: $0) }.map { $0 + 1 } ?? 0
        let ordered = Array(available[start...]) + Array(available[..<start])
        return ordered.first { $0 != current && !contains($0) }
    }
}

/// #16979 — « effets, filtres et cadres font partie d'une même famille d'outils » : UNE rangée de
/// genres, la même en Effets et en Montage. Visage et Couleur se choisissent sur mon image (Effets),
/// les cadres sur le Montage ; un genre n'y figure que si l'appel offre le mode qui le montre.
nonisolated enum CallEffectsGenreRule {
    static let effectsGenres: [CallEffectKind] = CallEffectsCategory.allCases.map(\.kind)
    static let montageGenres: [CallEffectKind] = [.frame]

    static func row(offersEffects: Bool, offersFrames: Bool) -> [CallEffectKind] {
        (offersEffects ? effectsGenres : []) + (offersFrames ? montageGenres : [])
    }

    /// (+) : un genre ABSENT de la pile, d'abord dans le mode où l'on est, puis dans l'autre. Quand
    /// tout ce que la rangée offre est déjà posé sans remplir la pile, (+) laisse feuilleter l'autre
    /// genre du mode, sinon le premier de l'autre mode : rien de ce qu'il faisait ne se perd.
    static func adding(from current: CallEffectKind, layers: CallEffectLayers, row: [CallEffectKind]) -> CallEffectKind? {
        guard !layers.isFull, row.contains(current) else { return nil }
        let isMontage = montageGenres.contains(current)
        let sameMode = row.filter { montageGenres.contains($0) == isMontage }
        let otherMode = row.filter { montageGenres.contains($0) != isMontage }
        return layers.opening(after: current, among: sameMode)
            ?? layers.opening(after: nil, among: otherMode)
            ?? browsing(after: current, among: sameMode)
            ?? otherMode.first
    }

    private static func browsing(after current: CallEffectKind, among genres: [CallEffectKind]) -> CallEffectKind? {
        guard genres.count > 1, let index = genres.firstIndex(of: current) else { return nil }
        return genres[(index + 1) % genres.count]
    }
}

/// Ce que la pile et la configuration de l'appel se disent : la configuration vidéo est la
/// vérité des filtres et des visages, l'appel (ou le Montage) celle du cadre ; la pile en garde
/// l'ORDRE d'empilement.
nonisolated enum CallEffectsStackRule {
    /// Remet la pile d'accord avec ce qui s'applique vraiment : un genre qui ne tient plus
    /// tombe, un genre posé s'empile au-dessus, un choix remplacé garde sa place.
    static func layers(_ current: CallEffectLayers, frame: String?, config: VideoFilterConfig) -> CallEffectLayers {
        let color: String? = config.activePreset.flatMap { $0 == .natural ? nil : $0.rawValue }
        let face: String? = config.activeFaceEffect == .none ? nil : config.activeFaceEffect.rawValue
        let truth: [(CallEffectKind, String?)] = [(.frame, frame), (.color, color), (.face, face)]
        return truth.reduce(current) { stack, entry in
            let (kind, choice) = entry
            guard stack.layer(of: kind)?.choice != choice else { return stack }
            return stack.choosing(kind, choice)
        }
    }

    /// Annuler une couche d'effet dans la configuration de l'appel. Le cadre n'y vit pas : il
    /// se retire par le geste qui le garde.
    static func removing(_ kind: CallEffectKind, from config: VideoFilterConfig) -> VideoFilterConfig {
        switch kind {
        case .color: return config.applyingPreset(nil)
        case .face: return config.selectingFaceEffect(.none)
        case .frame, .landscape, .voice: return config
        }
    }
}

/// Où en est la barre d'Effets : son menu de base (puces et `‹ · Réglages · (+)`), les réglages
/// ou la liste des effets appliqués. Après le choix d'une fonction, elle revient au menu de base.
nonisolated enum CallEffectsBarMode: Equatable, Sendable {
    case base
    case settings
    case applied
}

nonisolated enum CallEffectsBarRule {
    static func afterSettings(from mode: CallEffectsBarMode) -> CallEffectsBarMode {
        mode == .settings ? .base : .settings
    }

    static func afterAddingLook(from mode: CallEffectsBarMode) -> CallEffectsBarMode {
        .base
    }

    static func afterShowingApplied(from mode: CallEffectsBarMode, hasLayers: Bool) -> CallEffectsBarMode {
        hasLayers ? .applied : mode
    }

    /// Annuler un effet referme la liste et rend le menu de base.
    static let afterRemoval: CallEffectsBarMode = .base

    /// Toute fonction choisie dans les réglages (« Chaque visage » au Montage) rend le menu de base.
    static let afterChoice: CallEffectsBarMode = .base

    /// Une liste qui a perdu sa dernière couche n'a plus rien à montrer.
    static func reconciled(_ mode: CallEffectsBarMode, hasLayers: Bool) -> CallEffectsBarMode {
        mode == .applied && !hasLayers ? .base : mode
    }

    /// La rangée de puces n'existe que sur le menu de base : réglages et liste resserrent la barre.
    static func showsLooks(_ mode: CallEffectsBarMode) -> Bool {
        mode == .base
    }
}
