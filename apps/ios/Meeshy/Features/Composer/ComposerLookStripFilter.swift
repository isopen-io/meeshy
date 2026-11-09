import Foundation

/// **Ce qu'une case de la bande FAIT à la prise** (#17267) : un filtre teinte
/// l'image, un cadre l'entoure, un effet image la transforme entière, un effet
/// visage s'accroche aux repères du visage. La frontière entre les deux effets
/// est celle du rendu : `CallFaceEffect.needsFace` (l'Éruption gradue l'image et
/// fait monter la lave sans jamais lire un visage).
nonisolated enum ComposerLookKind: Hashable, Sendable {
    case filter
    case frame
    case imageEffect
    case faceEffect
}

/// **Les puces de type, sous la bande** (#17267) : Tout ·
/// Filtres · Cadres · Effets image · Effets visage. L'ordre de déclaration EST
/// l'ordre de la rangée.
nonisolated enum ComposerLookTypeChip: String, CaseIterable, Hashable, Sendable {
    case all
    case filters
    case frames
    case imageEffects
    case faceEffects

    func admits(_ kind: ComposerLookKind) -> Bool {
        switch self {
        case .all: return true
        case .filters: return kind == .filter
        case .frames: return kind == .frame
        case .imageEffects: return kind == .imageEffect
        case .faceEffects: return kind == .faceEffect
        }
    }

    /// « Aucun », en tête de la liste : sous « Tout » il rend la prise telle
    /// quelle ; sous un type, il retire ce type seulement et garde le reste.
    var noneItem: ComposerLookStripItem {
        switch self {
        case .all: return .untouched
        case .filters: return .filter(.natural)
        case .frames: return .frame(.none)
        case .imageEffects, .faceEffects: return .effect(.none)
        }
    }
}

/// **Le tri de la bande** : un type, et au plus une ambiance. Les deux se
/// croisent — choisir une ambiance garde le type.
nonisolated struct ComposerLookStripFilter: Equatable, Sendable {
    var type: ComposerLookTypeChip = .all
    var mood: CallFrameMood?

    /// Changer de type garde l'ambiance tant qu'elle sert ce type ; sinon elle
    /// tombe, plutôt que de laisser une bande réduite à « Aucun ».
    func selecting(type: ComposerLookTypeChip) -> ComposerLookStripFilter {
        let garde = mood.flatMap { ComposerLookStripFilterRule.moods(for: type).contains($0) ? $0 : nil }
        return ComposerLookStripFilter(type: type, mood: garde)
    }

    /// Chaque ouverture de la bande repart de « Tout » ; passer d'une famille du
    /// rail à une autre, bande ouverte, garde le tri.
    func following(open avant: ComposerLookFamily?, to apres: ComposerLookFamily?) -> ComposerLookStripFilter {
        avant == nil && apres != nil ? ComposerLookStripFilter() : self
    }

    /// Retoucher l'ambiance choisie la retire.
    func toggling(mood: CallFrameMood) -> ComposerLookStripFilter {
        ComposerLookStripFilter(type: type, mood: self.mood == mood ? nil : mood)
    }
}

/// **La liste unique de la bande, et ce que ses puces en gardent** (#17267) :
/// filtres, effets et cadres ensemble, « Aucun » en tête, puis chaque famille
/// dans l'ordre du rail (Filtres · Effets · Cadres).
nonisolated enum ComposerLookStripFilterRule {

    /// Tout ce que la bande peut proposer, sans les « Aucun » de chaque famille.
    /// Calculée UNE fois : le défilement relit la bande à chaque image.
    static let catalogue: [ComposerLookStripItem] = ComposerLookFamily.allCases.flatMap { famille in
        ComposerLookStripRule.items(famille).filter { ComposerLookStripFilterRule.kind(of: $0) != nil }
    }

    /// Ce que fait la case ; `nil` pour un « Aucun ».
    static func kind(of item: ComposerLookStripItem) -> ComposerLookKind? {
        switch item {
        case .untouched, .filter(.natural), .effect(.none), .frame(.none): return nil
        case .filter: return .filter
        case .frame: return .frame
        case .effect(let effet): return effet.needsFace ? .faceEffect : .imageEffect
        }
    }

    /// L'ambiance de la case : celle du cadre au catalogue, et celle qu'un effet
    /// stylisé porte de lui-même. Les filtres et les classiques n'en ont pas.
    static func mood(of item: ComposerLookStripItem) -> CallFrameMood? {
        switch item {
        case .frame(.montage(.frame(let id))): return CallMontageFrameRule.design(id: id)?.mood
        case .effect(let effet): return effectMood(effet)
        case .untouched, .filter, .frame: return nil
        }
    }

    private static func effectMood(_ effet: CallFaceEffect) -> CallFrameMood? {
        switch effet {
        case .toad: return .jovial
        case .angel: return .feerique
        case .demon: return .morbide
        case .volcano: return .fantastique
        case .none, .smoothing: return nil
        }
    }

    /// « Aucun » d'abord, puis ce que le type ET l'ambiance gardent.
    static func items(_ filter: ComposerLookStripFilter) -> [ComposerLookStripItem] {
        [filter.type.noneItem] + catalogue.filter { admits($0, filter) }
    }

    private static func admits(_ item: ComposerLookStripItem, _ filter: ComposerLookStripFilter) -> Bool {
        guard let nature = kind(of: item), filter.type.admits(nature) else { return false }
        guard let mood = filter.mood else { return true }
        return self.mood(of: item) == mood
    }

    /// Les ambiances offertes sous un type : celles qu'au moins une case porte,
    /// dans l'ordre du catalogue des cadres — jamais une puce qui viderait la bande.
    static func moods(for type: ComposerLookTypeChip) -> [CallFrameMood] {
        let portees = Set(catalogue.compactMap { item -> CallFrameMood? in
            guard let nature = kind(of: item), type.admits(nature) else { return nil }
            return mood(of: item)
        })
        return CallFrameMood.allCases.filter { portees.contains($0) }
    }

    /// **La case qui porte le choix** : plusieurs cases d'une liste mêlée peuvent
    /// appartenir au look (un filtre ET un cadre). La dernière touchée l'emporte
    /// tant qu'elle est choisie et montrée ; sinon la première choisie.
    static func chosenIndex(in items: [ComposerLookStripItem], look: ComposerPhotoLook,
                            focus: ComposerLookStripItem?) -> Int? {
        if let focus, ComposerLookStripRule.isChosen(focus, in: look), let index = items.firstIndex(of: focus) {
            return index
        }
        return ComposerLookStripRule.chosenIndex(in: items, look: look)
    }

    /// **La case que la bande suit** : la choisie, ou « Aucun » en tête quand le
    /// tri a écarté tout le look — une bande qui s'arrête sur une case qu'elle
    /// suit ne la choisit pas, donc trier ne change jamais la prise.
    static func followedIndex(in items: [ComposerLookStripItem], look: ComposerPhotoLook,
                              focus: ComposerLookStripItem?) -> Int? {
        chosenIndex(in: items, look: look, focus: focus) ?? (items.isEmpty ? nil : 0)
    }

    /// Toucher une famille du rail ouvre la bande sur SA moitié du look.
    static func focus(opening family: ComposerLookFamily, look: ComposerPhotoLook) -> ComposerLookStripItem {
        switch family {
        case .filters: return .filter(look.filter)
        case .effects: return .effect(look.effect)
        case .frames: return .frame(look.frame)
        }
    }
}
