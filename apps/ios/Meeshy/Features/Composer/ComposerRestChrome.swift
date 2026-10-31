import Foundation

/// **Un bouton de la colonne posée sur la scène** (#13839, #14050).
///
/// Dans l'ordre de la maquette : ce qu'on pose SUR la scène, puis Fond,
/// Mention et Lieu en entrées directes (#14050), puis ⋯ qui porte
/// le reste. Chacun ouvre la même porte que le rail d'avant, par le même
/// `handleRailDoor` — seule la géographie a changé.
nonisolated enum ComposerRestTool: String, CaseIterable, Equatable, Sendable {
    case text
    case media
    case sticker
    case sound
    case drawing
    case background
    case mention
    case place
    case more

    var door: ComposerRailDoor? {
        switch self {
        case .text: return .text
        case .media: return .media
        case .sticker: return .sticker
        case .sound: return .sound
        case .drawing: return .drawing
        case .background: return .background
        case .mention: return .mention
        case .place: return .place
        case .more: return nil
        }
    }

    var symbol: String { door?.symbolName ?? "ellipsis" }
}

/// **Ce que la scène porte, état par état** (#13839, qui renverse #4561 et #4633 : les contrôles se posent SUR la scène, plus
/// dans les couloirs du plateau).
///
/// Au repos : ✕ en haut à gauche, ↶ ↷ avec un historique, la rangée des diapos
/// dès deux diapos, la colonne des outils. Un outil ouvert, une frappe ou le
/// viseur retirent tout ; un panneau du bas (fond, cadrage, effets, frise)
/// retire la colonne et garde ✕. Un objet sélectionné retire ✕ et remplace la
/// colonne, au même endroit, par ses options d'édition (#13957, R6).
nonisolated enum ComposerRestChrome {

    /// La marge entre la colonne d'outils et le bord droit de la scène.
    static let toolColumnInnerMargin: CGFloat = 12

    struct State: Equatable, Sendable {
        var toolIsOpen: Bool
        var writesText: Bool
        var cameraIsArmed: Bool
        var bottomPanelIsOpen: Bool
        var timelineIsOpen: Bool
        /// Un objet POSÉ est sélectionné (#13957) : ✕ et les outils se
        /// retirent, ses options d'édition prennent la place de la colonne.
        /// Ses propriétés ouvertes en bas ne sont pas un outil : la colonne
        /// des options reste, pour passer de l'une à l'autre.
        var objectIsSelected: Bool = false
    }

    enum SoundAction: Equatable, Sendable {
        case openDoor
        case editBackground
    }

    private static let sceneTools: [ComposerRestTool] = [.text, .media, .sticker, .sound, .drawing,
                                                         .background, .mention, .place]

    /// Un fond MÉDIA retire la porte de la palette (`sceneDoors`), jamais
    /// l'entrée « Fond » : elle SÉLECTIONNE alors le fond, dont les outils à
    /// plat prennent le rail (#14048, `handleRestTool`).
    static func tools(offered doors: [ComposerRailDoor], hasBackgroundMedia: Bool = false) -> [ComposerRestTool] {
        let offertes = Set(doors).union(hasBackgroundMedia ? [.background] : [])
        return sceneTools.filter { outil in outil.door.map(offertes.contains) ?? false } + [.more]
    }

    static func showsSlideRow(slideCount: Int) -> Bool { slideCount >= 2 }

    static func topRowIsShown(_ state: State) -> Bool {
        !state.toolIsOpen && !state.writesText && !state.cameraIsArmed
    }

    /// Fermer cède à la sélection : on ne quitte pas le brouillon en éditant.
    static func closeIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.objectIsSelected
    }

    static func historyIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.timelineIsOpen
    }

    static func toolColumnIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.bottomPanelIsOpen && !state.objectIsSelected
    }

    /// Les options de la sélection vivent où vit la colonne des outils : jamais
    /// pendant un outil, une frappe, le viseur ou un panneau du bas.
    static func selectionColumnIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.bottomPanelIsOpen && state.objectIsSelected
    }

    /// Le bouton Son rouvre le son de fond quand il y en a un et qu'il a un
    /// éditeur ; sinon il ouvre la porte. Promouvoir et retirer restent dans
    /// son menu contextuel.
    static func soundAction(hasBackgroundSound: Bool, canEditBackgroundSound: Bool) -> SoundAction {
        hasBackgroundSound && canEditBackgroundSound ? .editBackground : .openDoor
    }
}

nonisolated enum ComposerRestChromeCopy {

    /// Avec un média de fond, « Fond » ne choisit plus un fond, il le
    /// sélectionne : VoiceOver dit la chose, plus le verbe.
    static func label(_ tool: ComposerRestTool, backgroundIsMedia: Bool = false) -> String {
        if tool == .background, backgroundIsMedia {
            return String(localized: "composer.more.background", defaultValue: "Fond", bundle: .main)
        }
        guard let door = tool.door else { return ComposerOverflowCopy.menu }
        return ComposerRailCopy.label(door)
    }

    static var column: String {
        String(localized: "composer.rest.column", defaultValue: "Outils de la scène", bundle: .main)
    }
}
