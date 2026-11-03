import Foundation
import CoreGraphics

/// **Un bouton de la colonne posée sur la scène** (#13839, #14050).
///
/// Dans l'ordre de la maquette : ce qu'on pose SUR la scène, puis Fond,
/// Mention et Lieu en entrées directes (#14050), puis « Texte du post » quand
/// le format en écrit un (#14457), puis ⋯ qui porte le reste. Chacun ouvre la
/// même porte que le rail d'avant, par le même `handleRailDoor` — seule la
/// géographie a changé.
nonisolated enum ComposerRestTool: String, CaseIterable, Equatable, Sendable {
    case text
    case media
    case sticker
    case sound
    case drawing
    case background
    case mention
    case place
    case postText
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
        case .postText: return .content
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
/// viseur retirent tout. Un objet sélectionné retire ✕ et remplace la
/// colonne, au même endroit, par ses options d'édition (#13957, R6).
///
/// **La scène ne se réduit que pour le clavier ou une vraie feuille** (#15226,
/// même loi qu'Android `ComposerSceneReduction`, #15192) : une bande (fond,
/// cadrage, effets, frise) ou les réglages d'un outil se posent PAR-DESSUS une
/// scène qui garde sa taille ; une feuille ancrée, les propriétés d'un objet
/// ou le clavier la réduisent au-dessus d'eux.
///
/// **Ce qui occupe le bas laisse la scène nue** (#14191, Android #14186) :
/// réduite ou non, ✕, ↶ ↷ et la rangée des diapos ne s'y posent plus. Seuls
/// la scène et le panneau restent ; sous une sélection, ses options restent
/// dans leur colonne.
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
        /// Les propriétés de l'objet sélectionné occupent le bas : elles se
        /// posent par-dessus la scène, qui garde sa taille.
        var propertiesAreOpen: Bool = false
        /// Le clavier est levé pour écrire SUR la scène.
        var keyboardIsUp: Bool = false
        /// Une feuille ancrée du meuble monte du bas (sticker, médias, lieu…).
        var sheetIsRaised: Bool = false
    }

    enum SoundAction: Equatable, Sendable {
        case openDoor
        case editBackground
    }

    /// « Texte du post » n'est offert qu'au post et au réel (`ComposerRailDoor
    /// .removedFromFormat`) : c'est la seule option qui varie d'un format à
    /// l'autre, au pied de la colonne, et le socle ne bouge pas (#14457).
    private static let sceneTools: [ComposerRestTool] = [.text, .media, .sticker, .sound, .drawing,
                                                         .background, .mention, .place, .postText]

    /// Un fond MÉDIA retire la porte de la palette (`sceneDoors`), jamais
    /// l'entrée « Fond » : elle SÉLECTIONNE alors le fond, dont les outils à
    /// plat prennent le rail (#14048, `handleRestTool`).
    static func tools(offered doors: [ComposerRailDoor], hasBackgroundMedia: Bool = false) -> [ComposerRestTool] {
        let offertes = Set(doors).union(hasBackgroundMedia ? [.background] : [])
        return sceneTools.filter { outil in outil.door.map(offertes.contains) ?? false } + [.more]
    }

    /// **Le pied de la colonne ne défile jamais** (#14622, comme Android
    /// #14282) : « Texte du post » et ⋯ restent posés en bas, et ce sont les
    /// outils au-dessus d'eux qui défilent quand la colonne n'a plus la place.
    static func columnFoot(_ tools: [ComposerRestTool]) -> [ComposerRestTool] {
        tools.filter(footTools.contains)
    }

    static func columnBody(_ tools: [ComposerRestTool]) -> [ComposerRestTool] {
        tools.filter { !footTools.contains($0) }
    }

    private static let footTools: Set<ComposerRestTool> = [.postText, .more]

    static func showsSlideRow(slideCount: Int) -> Bool { slideCount >= 2 }

    /// **L'écart entre le bord de l'écran et celui de la scène DESSINÉE**, où
    /// ✕, ↶ ↷ et la colonne se calent : sur un écran court (iPhone SE), le 9:16
    /// prend toute la hauteur, et le socle le réduit dès le repos à la zone libre
    /// au-dessus de lui — une marge de chaque côté. La réduction s'ancre au
    /// milieu de la zone : la scène dessinée y reste centrée.
    static func sceneSideInset(layer: CGRect, aspectRatio ratio: CGFloat, scale: CGFloat) -> CGFloat {
        guard !layer.isNull, layer.minX.isFinite, scale.isFinite, scale > 0 else { return 0 }
        let zone = ComposerSceneFit.zone(in: layer.size, aspectRatio: ratio)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)
        guard scene.width > 0 else { return 0 }
        return max(0, layer.minX + zone.midX - scene.width * scale / 2)
    }

    /// **Le haut de la scène DESSINÉE** : la levée s'ancre au haut du 9:16 de
    /// la couche, qui ne bouge que du décalage qu'elle applique.
    static func sceneTop(layer: CGRect, aspectRatio ratio: CGFloat, offsetY: CGFloat) -> CGFloat {
        guard !layer.isNull, layer.minY.isFinite, offsetY.isFinite else { return 0 }
        let zone = ComposerSceneFit.zone(in: layer.size, aspectRatio: ratio)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: ratio)
        guard scene.height > 0 else { return 0 }
        return layer.minY + scene.minY + offsetY
    }

    /// ✕ et ↶ ↷ se posent sous le haut de la scène quand elle commence plus bas
    /// que le chrome (iPhone SE) ; une scène qui monte au-dessus ne les déplace pas.
    static func sceneTopInset(sceneTop: CGFloat, chromeTop: CGFloat) -> CGFloat {
        guard sceneTop.isFinite, chromeTop.isFinite else { return 0 }
        return max(0, sceneTop - chromeTop)
    }

    /// Une feuille ou le clavier réduisent la scène au-delà du repos : ses
    /// options ne la suivent pas, elles gardent l'écart du repos.
    static func restInset(measured: CGFloat, sceneIsReduced: Bool, current: CGFloat) -> CGFloat {
        sceneIsReduced ? current : measured
    }

    static func sceneIsReduced(_ state: State) -> Bool {
        state.keyboardIsUp || state.sheetIsRaised
    }

    /// Une bande, la frise, les effets ou les propriétés occupent le bas : le
    /// repos quitte la scène, qu'elle soit réduite ou non.
    static func lowerPanelIsOpen(_ state: State) -> Bool {
        state.bottomPanelIsOpen || state.propertiesAreOpen
    }

    static func slideRowIsShown(_ state: State, slideCount: Int) -> Bool {
        topRowIsShown(state) && !lowerPanelIsOpen(state) && showsSlideRow(slideCount: slideCount)
    }

    /// ↶ ↷ quittent la scène sans passer au rail droit tant qu'un panneau
    /// occupe le bas : ce repos n'a qu'un geste, refermer ce panneau. Un outil
    /// ouvert garde son historique dans son propre rail.
    static func historyIsWithdrawn(_ state: State) -> Bool {
        topRowIsShown(state) && lowerPanelIsOpen(state)
    }

    static func topRowIsShown(_ state: State) -> Bool {
        !state.toolIsOpen && !state.writesText && !state.cameraIsArmed
    }

    /// Fermer cède à la sélection : on ne quitte pas le brouillon en éditant.
    static func closeIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.objectIsSelected && !lowerPanelIsOpen(state)
    }

    static func historyIsShown(_ state: State) -> Bool {
        topRowIsShown(state) && !state.timelineIsOpen && !lowerPanelIsOpen(state)
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
        if tool == .postText { return ComposerPostTextPill.label }
        guard let door = tool.door else { return ComposerOverflowCopy.menu }
        return ComposerRailCopy.label(door)
    }

    static var column: String {
        String(localized: "composer.rest.column", defaultValue: "Outils de la scène", bundle: .main)
    }
}
