import SwiftUI

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
/// Tant qu'un objet POSÉ est sélectionné, ni l'audience, ni Publier, ni Fermer.
/// Le fond, lui, n'est jamais « sélectionné » au sens de cette règle : il ne
/// prend le chrome que quand son ÉDITION est ouverte (appui long › Modifier).
nonisolated enum ComposerSelectionChrome {

    /// Ce que le rail GAUCHE du grand écran porte.
    enum LeadingRail: Equatable, Sendable {
        case tools
        case editing
    }

    /// L'objet prend-il le chrome ? Un objet posé dès sa sélection ; le fond
    /// seulement en édition ; jamais pendant la frappe, qui a sa barre collée
    /// au clavier (L4).
    static func ownsChrome(family: ComposerInlineFamily?, isEditing: Bool, typing: Bool) -> Bool {
        guard let family, !typing else { return false }
        return !family.isBackground || isEditing
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
    /// Posé par-dessus : les sous-outils de Modifier ou de Temps ; toucher l'un
    /// ouvre ses propriétés dans la feuille basse.
    case options(ComposerInlineEditPurpose)
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

    /// Un objet posé : ses actions, puis le niveau de l'option ouverte. Le fond
    /// n'a pas d'actions à ce rang : son édition est son premier niveau.
    static func of(family: ComposerInlineFamily?, editing purpose: ComposerInlineEditPurpose?,
                   typing: Bool) -> ComposerEditRailStack {
        guard let family, !typing else { return .rest }
        let base: [ComposerEditRailLevel] = family.isBackground ? [] : [.actions]
        let dessus = purpose.map { [ComposerEditRailLevel.options($0)] } ?? []
        return ComposerEditRailStack(levels: base + dessus)
    }

    var top: ComposerEditRailLevel? { levels.last }

    /// L'identité d'un niveau pour l'animation qui le pose par-dessus.
    static func levelKey(_ level: ComposerEditRailLevel) -> String {
        switch level {
        case .actions:          return "actions"
        case .options(.modify): return "options.modify"
        case .options(.time):   return "options.time"
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
    /// ‹ Retour, en tête de tout niveau posé par-dessus.
    case back
    case section(ComposerObjectEditorSection)
    case extra(ComposerSelectionMediaExtra)
    case keyframes

    var identifier: String {
        switch self {
        case .action(let action):   return action.rawValue
        case .back:                 return "back"
        case .section(let section): return section.identifier
        case .extra(let extra):     return extra.rawValue
        case .keyframes:            return "keyframes"
        }
    }

    var isDestructive: Bool {
        if case .action(let action) = self { return action.isDestructive }
        return false
    }
}

nonisolated enum ComposerEditRailItems {

    /// Les entrées du niveau du HAUT de la pile — une absente plutôt qu'inerte
    /// (loi 4) : le meuble ne remet que ce que l'objet sert.
    static func items(for level: ComposerEditRailLevel,
                      actions: [ComposerSelectionAction],
                      sections: [ComposerObjectEditorSection],
                      extras: [ComposerSelectionMediaExtra],
                      keyframes: Bool) -> [ComposerEditRailItem] {
        switch level {
        case .actions:
            return actions.map(ComposerEditRailItem.action)
        case .options:
            return [.back] + sections.map(ComposerEditRailItem.section)
                + extras.map(ComposerEditRailItem.extra) + (keyframes ? [.keyframes] : [])
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
