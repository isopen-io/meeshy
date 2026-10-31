import SwiftUI
import MeeshySDK

/// **Un objet en édition prend le chrome** (#13957, #13974, spec R6,
/// décisions du porteur).
///
/// > « Lorsqu'on a un élément sélectionné, il est inutile d'afficher
/// > l'audience, et le bouton de publication et d'annulation du composer ! Il
/// > faut lors de l'édition remplacer alors le rail canonique par les options
/// > d'édition et au toucher, afficher en bas les propriétés ! »
///
/// Une option d'édition n'a que TROIS places : le rail des outils, remplacé par
/// les options de l'objet ; des rails qui se POSENT par-dessus, niveau après
/// niveau, pour les options plus fines — la forme préférée, Retour descend d'un
/// niveau (`ComposerEditRailStack`) ; une feuille basse pour un réglage riche,
/// la scène se réduisant au-dessus. Rien en haut à droite, rien en menu
/// flottant, rien sur la scène.
///
/// Tant qu'un élément est sélectionné, ni l'audience, ni Publier, ni Fermer.
/// Le fond image ou vidéo y entre comme les objets posés (#13974, I-E1) : le
/// toucher ou l'appui long le sélectionne et pose son niveau « Fond ».
nonisolated enum ComposerSelectionChrome {

    /// Ce que le rail GAUCHE du grand écran porte.
    enum LeadingRail: Equatable, Sendable {
        case tools
        case editing
    }

    /// L'élément prend-il le chrome ? Dès sa sélection, le fond compris ;
    /// jamais pendant la frappe, qui a sa barre collée au clavier (L4).
    static func ownsChrome(family: ComposerInlineFamily?, typing: Bool) -> Bool {
        family != nil && !typing
    }

    /// Audience et Publier : ni pendant un outil, ni pendant une édition.
    static func publicationIsShown(toolOwnsScreen: Bool, objectIsSelected: Bool) -> Bool {
        !toolOwnsScreen && !objectIsSelected
    }

    static func leadingRail(objectIsSelected: Bool) -> LeadingRail {
        objectIsSelected ? .editing : .tools
    }

    /// L'échange du chrome : un seul fondu pour tout ce qui part et revient,
    /// coupé sous Réduire les animations.
    static func transition(reduceMotion: Bool) -> Animation? {
        ComposerToolFocus.transition(reduceMotion: reduceMotion)
    }

    /// Les propriétés montent avec le ressort qui réduit la scène : les deux
    /// bougent ensemble, aucune image ne montre l'une sans l'autre.
    static func propertiesAnimation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 0.88)
    }

    /// Les propriétés montent du bas ; sous Réduire les animations, elles
    /// apparaissent sans glisser.
    @MainActor
    static func propertiesTransition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .identity : .move(edge: .bottom).combined(with: .opacity)
    }

    /// Une édition en place ouverte depuis le rail d'édition est un NIVEAU de
    /// ce rail, pas un outil qui prend l'écran : la colonne d'édition, Défaire
    /// et Refaire restent posés. Hors sélection (le dessin, une feuille
    /// ouverte d'ailleurs), elle reste un outil.
    static func inlineEditOpensTool(editsInline: Bool, objectIsSelected: Bool) -> Bool {
        editsInline && !objectIsSelected
    }

    /// Un niveau qui se pose par-dessus arrive du bord de la colonne ; sous
    /// Réduire les animations, il se substitue sans mouvement.
    @MainActor
    static func levelTransition(reduceMotion: Bool) -> AnyTransition {
        reduceMotion ? .identity : .move(edge: .trailing).combined(with: .opacity)
    }
}

// MARK: - La pile des niveaux

/// **Un niveau du rail d'édition.** Les lots suivants y empilent les leurs.
nonisolated enum ComposerEditRailLevel: Equatable, Sendable {
    /// Le premier : Modifier · Dupliquer · Temps · Retirer.
    case actions
    /// Le premier d'un fond image ou vidéo, N0 « Fond » : Modifier · Remplacer
    /// · Mettre sur la scène · Retirer (`ComposerBackgroundEdit`).
    case background
    /// Posé par-dessus : les sous-outils de Modifier ou de Temps ; toucher l'un
    /// ouvre ses propriétés dans la feuille basse.
    case options(ComposerInlineEditPurpose)
    /// N2 de Réglages ou d'Effets d'un fond : ses réglages ; toucher l'un
    /// ouvre son curseur seul en bas (N3).
    case backgroundAdjust(AdjustmentFamily)
    /// N2 de Son d'un fond vidéo.
    case backgroundSound
}

/// Ce qu'un « Retour » (OK de la feuille, Échap, ‹ du rail) fait, du haut de la
/// pile vers le bas.
nonisolated enum ComposerEditBack: Equatable, Sendable {
    /// La feuille basse se referme ; le niveau qui l'a ouverte reste.
    case closeProperties
    /// Le niveau du haut part ; celui du dessous reparaît.
    case popLevel
    /// Le dernier niveau part : l'édition se termine, le rail des outils,
    /// l'audience, Publier et Fermer reviennent.
    case leaveEditing
    case nothing
}

/// **La pile des rails d'édition** — dérivée de l'état du meuble, jamais
/// recopiée : la sélection pose le premier niveau, l'édition en place le
/// second.
nonisolated struct ComposerEditRailStack: Equatable, Sendable {
    let levels: [ComposerEditRailLevel]

    static let rest = ComposerEditRailStack(levels: [])

    /// Un objet posé : ses actions, puis le niveau de l'option ouverte. Le fond :
    /// son niveau « Fond », puis celui de « Modifier », puis le N2 que son
    /// chemin pose (`ComposerBackgroundModify.levels`).
    static func of(family: ComposerInlineFamily?, editing purpose: ComposerInlineEditPurpose?,
                   typing: Bool, above: [ComposerEditRailLevel] = []) -> ComposerEditRailStack {
        guard let family, !typing else { return .rest }
        let base: [ComposerEditRailLevel] = [family.isBackground ? .background : .actions]
        let dessus = purpose.map { [ComposerEditRailLevel.options($0)] + above } ?? []
        return ComposerEditRailStack(levels: base + dessus)
    }

    var top: ComposerEditRailLevel? { levels.last }

    /// L'identité d'un niveau pour l'animation qui le pose par-dessus.
    static func levelKey(_ level: ComposerEditRailLevel) -> String {
        switch level {
        case .actions:          return "actions"
        case .background:       return "background"
        case .options(.modify): return "options.modify"
        case .options(.time):   return "options.time"
        case .backgroundAdjust(let famille): return "background.adjust.\(famille.rawValue)"
        case .backgroundSound:  return "background.sound"
        }
    }
    var isEditing: Bool { !levels.isEmpty }

    /// Le Retour du CLAVIER et de la feuille : la feuille d'abord, puis un
    /// niveau à la fois.
    func back(propertiesAreOpen: Bool) -> ComposerEditBack {
        if propertiesAreOpen { return .closeProperties }
        return railBack()
    }

    /// Le ‹ du rail : il descend d'un niveau, la feuille de ce niveau avec lui.
    func railBack() -> ComposerEditBack {
        switch levels.count {
        case 0:  return .nothing
        case 1:  return .leaveEditing
        default: return .popLevel
        }
    }
}

// MARK: - Ce que chaque niveau porte

/// **Une entrée d'un rail d'édition.**
nonisolated enum ComposerEditRailItem: Hashable, Sendable {
    case action(ComposerSelectionAction)
    /// Une entrée du niveau « Fond ».
    case background(ComposerBackgroundEditAction)
    /// ‹ Retour, en tête de tout niveau posé par-dessus.
    case back
    case section(ComposerObjectEditorSection)
    case extra(ComposerSelectionMediaExtra)
    case keyframes
    /// Une entrée de N1 « Modifier » d'un fond.
    case backgroundEntry(ComposerBackgroundModifyEntry)
    /// Un réglage de N2 ; son curseur s'ouvre en bas.
    case adjustment(AdjustmentKind)
    /// Muet, l'interrupteur de N2 « Son ».
    case mute

    var identifier: String {
        switch self {
        case .action(let action):   return action.rawValue
        case .background(let action): return "background.\(action.rawValue)"
        case .back:                 return "back"
        case .section(let section): return section.identifier
        case .extra(let extra):     return extra.rawValue
        case .keyframes:            return "keyframes"
        case .backgroundEntry(let entree): return "background.modify.\(entree.rawValue)"
        case .adjustment(let kind): return "adjust.\(kind.rawValue)"
        case .mute:                 return "mute"
        }
    }

    var isDestructive: Bool {
        switch self {
        case .action(let action):     return action.isDestructive
        case .background(let action): return ComposerBackgroundEdit.isDestructive(action)
        case .back, .section, .extra, .keyframes, .backgroundEntry, .adjustment, .mute: return false
        }
    }
}

nonisolated enum ComposerEditRailItems {

    /// Les entrées du niveau du HAUT de la pile — une absente plutôt qu'inerte
    /// (loi 4) : le meuble ne remet que ce que l'objet sert.
    static func items(for level: ComposerEditRailLevel,
                      actions: [ComposerSelectionAction],
                      backgroundActions: [ComposerBackgroundEditAction] = [],
                      sections: [ComposerObjectEditorSection],
                      extras: [ComposerSelectionMediaExtra],
                      keyframes: Bool,
                      backgroundEntries: [ComposerBackgroundModifyEntry] = [],
                      adjustments: [AdjustmentKind] = []) -> [ComposerEditRailItem] {
        switch level {
        case .actions:
            return actions.map(ComposerEditRailItem.action)
        case .background:
            return backgroundActions.map(ComposerEditRailItem.background)
        case .options(.modify) where !backgroundEntries.isEmpty:
            return [.back] + backgroundEntries.map(ComposerEditRailItem.backgroundEntry)
        case .options:
            return [.back] + sections.map(ComposerEditRailItem.section)
                + extras.map(ComposerEditRailItem.extra) + (keyframes ? [.keyframes] : [])
        case .backgroundAdjust:
            return [.back] + adjustments.map(ComposerEditRailItem.adjustment)
        case .backgroundSound:
            return [.back, .mute]
        }
    }

    /// L'entrée surlignée : le sous-outil dont la feuille est ouverte.
    static func isOn(_ item: ComposerEditRailItem, openSection: ComposerObjectEditorSection?) -> Bool {
        guard case .section(let section) = item else { return false }
        return section == openSection
    }
}

/// **La hauteur des propriétés, en bas** : leur contenu, jusqu'à 42 % de la
/// fenêtre ; au-delà, elles défilent. La scène garde l'autre part, réduite
/// au-dessus.
nonisolated enum ComposerPropertiesSheetLayout {

    static let minimumHeight: CGFloat = 160
    static let windowShare: CGFloat = 0.42

    static func maxHeight(windowHeight: CGFloat) -> CGFloat {
        guard windowHeight.isFinite, windowHeight > 0 else { return minimumHeight }
        return max(minimumHeight, windowHeight * windowShare)
    }

    static func height(content: CGFloat, windowHeight: CGFloat) -> CGFloat {
        min(max(content, 1), maxHeight(windowHeight: windowHeight))
    }
}
