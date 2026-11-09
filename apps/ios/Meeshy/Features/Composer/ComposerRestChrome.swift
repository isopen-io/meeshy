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
    case camera
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
        case .camera: return nil
        case .background: return .background
        case .mention: return .mention
        case .place: return .place
        case .postText: return .content
        case .more: return nil
        }
    }

    var symbol: String {
        if self == .camera { return "camera" }
        return door?.symbolName ?? "ellipsis"
    }
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
    private static let sceneTools: [ComposerRestTool] = [.text, .media, .sticker, .sound, .drawing, .camera,
                                                         .background, .mention, .place, .postText]

    /// Un fond MÉDIA retire la porte de la palette (`sceneDoors`), jamais
    /// l'entrée « Fond » : elle SÉLECTIONNE alors le fond, dont les outils à
    /// plat prennent le rail (#14048, `handleRestTool`).
    ///
    /// **La porte Caméra arme le viseur dans la scène** (#17111) : elle n'est
    /// pas une `ComposerRailDoor` — elle n'ingère rien par un sélecteur, elle
    /// appelle `armSceneCamera()` — et elle se retire là où le format ne sert
    /// aucun mode (`ComposerSceneCamera.modes(for:)` vide, le statut).
    static func tools(offered doors: [ComposerRailDoor], hasBackgroundMedia: Bool = false,
                      cameraModes: [ComposerSceneCameraMode] = []) -> [ComposerRestTool] {
        let offertes = Set(doors).union(hasBackgroundMedia ? [.background] : [])
        return sceneTools.filter { outil in
            if outil == .camera { return !cameraModes.isEmpty }
            return outil.door.map(offertes.contains) ?? false
        } + [.more]
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
        if tool == .camera { return ComposerPillCopy.camera }
        guard let door = tool.door else { return ComposerOverflowCopy.menu }
        return ComposerRailCopy.label(door)
    }

    static var column: String {
        String(localized: "composer.rest.column", defaultValue: "Outils de la scène", bundle: .main)
    }
}

// MARK: - La grammaire de la pilule (#17111)

/// **Ce que la pilule du bas porte** : `(…) · Texte · Média · Publier ▾`. Les
/// deux entrées qui font naître la matière de la plupart des scènes restent à
/// portée de pouce ; tout le reste vit derrière `(…)`, dans les deux rails.
nonisolated enum ComposerPillSlot: String, CaseIterable, Equatable, Sendable {
    case more
    case text
    case media
    case publish
}

/// **Le rail droit ouvert par `(…)`** : ce qui structure la scène et la
/// publication. Chaque entrée rejoint l'action du menu ⋯ qu'elle remplace
/// (`moreEntry`) ; « Fond » et « Plus » n'en sont pas.
nonisolated enum ComposerRightRailEntry: String, CaseIterable, Equatable, Sendable {
    case background
    case addScene
    case animation
    case duration
    case caption
    case hashtags
    case plus

    var moreEntry: ComposerMoreMenuEntry? {
        switch self {
        case .addScene: return .addSlide
        case .animation: return .animation
        case .duration: return .slideDuration
        case .caption: return .legend
        case .hashtags: return .hashtags
        case .background, .plus: return nil
        }
    }
}

nonisolated enum ComposerPillGrammar {

    /// Publier est ABSENT d'une scène vide (#17111) : ni grisé, ni toast qui
    /// dirait pourquoi — il paraît dès qu'il y a quelque chose à publier.
    static func pill(hasMatterToPublish: Bool) -> [ComposerPillSlot] {
        ComposerPillSlot.allCases.filter { $0 != .publish || hasMatterToPublish }
    }

    static func publishIsShown(hasMatterToPublish: Bool) -> Bool {
        pill(hasMatterToPublish: hasMatterToPublish).contains(.publish)
    }

    /// Le rail gauche, dans l'ordre de la planche : ce qu'on POSE sur la scène.
    static let leftRailOrder: [ComposerRestTool] = [.sticker, .sound, .drawing, .camera, .mention, .place]

    static func leftRail(_ offered: [ComposerRestTool]) -> [ComposerRestTool] {
        leftRailOrder.filter(offered.contains)
    }

    /// Le rail droit : « Fond » quand le format en offre un, les entrées du ⋯
    /// que le contexte sert, puis « Plus » qui porte le reste.
    static func rightRail(offersBackground: Bool, moreEntries: [ComposerMoreMenuEntry]) -> [ComposerRightRailEntry] {
        let servies = Set(moreEntries)
        let structure = ComposerRightRailEntry.allCases.filter { $0.moreEntry.map(servies.contains) ?? false }
        return (offersBackground ? [.background] : []) + structure + [.plus]
    }

    /// La feuille « Plus » : ce que le ⋯ servait et qu'aucun rail ne porte.
    static func plusSheet(_ moreEntries: [ComposerMoreMenuEntry]) -> [ComposerMoreMenuEntry] {
        let portees = Set(ComposerRightRailEntry.allCases.compactMap(\.moreEntry))
        return moreEntries.filter { !portees.contains($0) }
    }

    /// **iPad** : le rail « Ajouter » commence par Texte et Média, que la
    /// pilule porte sur iPhone.
    static func addRail(_ offered: [ComposerRestTool]) -> [ComposerRestTool] {
        [ComposerRestTool.text, .media].filter(offered.contains) + leftRail(offered)
    }

    /// Les rails se GRISENT, jamais ne disparaissent, quand un mode plein écran
    /// ou le viseur armé possède la scène : leur place ne saute pas.
    static func railsAreGreyed(fullScreenModeIsOpen: Bool, cameraIsArmed: Bool) -> Bool {
        fullScreenModeIsOpen || cameraIsArmed
    }

    enum TrailingTitle: Equatable, Sendable {
        case scene
        case selection
    }

    static func trailingTitle(objectIsSelected: Bool) -> TrailingTitle {
        objectIsSelected ? .selection : .scene
    }
}

// MARK: - L'état masqué (#17111)

/// **Toucher le vide d'une scène habitée MASQUE tout le chrome** : la scène
/// prend le viewport entier en gardant son 9:16 (letterbox), sans minuteur ;
/// un second toucher rend le chrome. Une scène VIERGE n'a rien à masquer : le
/// toucher la traverse.
nonisolated enum ComposerChromeConcealment {

    enum Tap: Equatable, Sendable {
        case reveal
        case conceal
        case passThrough
    }

    static func tap(isConcealed: Bool, emptyTap: ComposerSceneEmptyTap.Outcome, sceneHasContent: Bool) -> Tap {
        if isConcealed { return .reveal }
        guard sceneHasContent else { return .passThrough }
        switch emptyTap {
        case .nothing, .selectBackground: return .conceal
        case .endWriting, .deselect, .closeEffect, .closeBand: return .passThrough
        }
    }
}

nonisolated enum ComposerPillCopy {
    static var camera: String {
        String(localized: "composer.shell.camera", defaultValue: "Caméra", table: "ComposerShell", bundle: .main)
    }

    static var concealedHint: String {
        String(localized: "composer.shell.concealed.hint",
               defaultValue: "Touchez la scène pour retrouver les outils", table: "ComposerShell", bundle: .main)
    }

    static func title(_ title: ComposerPillGrammar.TrailingTitle) -> String {
        switch title {
        case .scene:
            return String(localized: "composer.shell.rail.scene", defaultValue: "Scène",
                          table: "ComposerShell", bundle: .main)
        case .selection:
            return String(localized: "composer.shell.rail.selection", defaultValue: "SÉLECTION",
                          table: "ComposerShell", bundle: .main)
        }
    }
}
