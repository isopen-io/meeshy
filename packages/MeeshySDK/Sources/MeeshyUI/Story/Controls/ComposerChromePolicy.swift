import Foundation

/// Entrées BRUTES du chrome du composer, réunies en une valeur pure.
///
/// L'ancienne politique prenait 6 paramètres dont un à valeur par défaut ; elle
/// était appelée à deux endroits avec des arguments DIFFÉRENTS — le header
/// passait l'état brut du band, les FABs son état effectif — tout en
/// documentant « les MÊMES conditions ». C'était la seconde vérité du chrome.
/// Un contexte unique, construit à un seul endroit
/// (`StoryComposerView+Chrome.swift`), rend la divergence inexprimable : aucune
/// signature ne permet plus d'omettre un terme.
public nonisolated struct ComposerChromeContext: Equatable, Sendable {
    /// État BRUT de `BandStateMachine` — jamais lu directement par les
    /// consommateurs, qui passent par `effectiveBandState`.
    public let machineState: BandState
    public let isChromeHidden: Bool
    public let isTextEditing: Bool
    public let isDrawingActive: Bool
    public let isDrawingImmersive: Bool
    public let isViewportZoomed: Bool
    public let isTimelineVisible: Bool
    /// Le picker géant d'état vide remplace `ComposerControlsLayer` dans l'arbre :
    /// dans cette branche, la poignée de restauration du chrome N'EXISTE PAS.
    public let isEmptyStatePickerVisible: Bool
    /// Le slide courant ne porte encore aucun contenu d'authoring
    /// (`StoryComposerView.isComposerEmpty`, négation de `composerHasContent`).
    /// Brute et INDÉPENDANTE de `isEmptyStatePickerVisible` : cette dernière bake
    /// déjà `bandStateIsHidden` au moment de la capture, donc `dismissing(_:)` ne
    /// peut pas en déduire si le picker DOIT réapparaître une fois le panneau
    /// refermé (band forcé à `.hidden`) — il lui faut ce signal brut séparément.
    /// Défaut `false` : sans effet sur tous les appels qui ne le renseignent pas.
    public let isComposerEmpty: Bool

    public init(
        machineState: BandState,
        isChromeHidden: Bool,
        isTextEditing: Bool,
        isDrawingActive: Bool,
        isDrawingImmersive: Bool,
        isViewportZoomed: Bool,
        isTimelineVisible: Bool,
        isEmptyStatePickerVisible: Bool,
        isComposerEmpty: Bool = false
    ) {
        self.machineState = machineState
        self.isChromeHidden = isChromeHidden
        self.isTextEditing = isTextEditing
        self.isDrawingActive = isDrawingActive
        self.isDrawingImmersive = isDrawingImmersive
        self.isViewportZoomed = isViewportZoomed
        self.isTimelineVisible = isTimelineVisible
        self.isEmptyStatePickerVisible = isEmptyStatePickerVisible
        self.isComposerEmpty = isComposerEmpty
    }

    /// État RÉELLEMENT affiché du band — ex-`ComposerControlsLayer.
    /// resolveEffectiveBandState`, déplacé ici parce que la politique de chrome,
    /// le carding du canvas et l'ouverture du band doivent lire la MÊME
    /// résolution. Ordre de priorité inchangé : dessin liste > dessin immersif >
    /// timeline > machine.
    ///
    /// Mode dessin LISTE : band forcé sur la liste des traits tant qu'on n'est
    /// pas immersif. `isDrawingImmersive` masque le band entièrement, priorité
    /// absolue. Timeline : force son panneau UNIQUEMENT quand la machine est
    /// `.hidden` — si un autre outil est déjà ouvert (chip de switch), on ne
    /// réécrase pas ce choix.
    public var effectiveBandState: BandState {
        if isDrawingActive, !isDrawingImmersive, machineState == .hidden {
            return .toolPanel(.drawing)
        }
        if isDrawingImmersive { return .hidden }
        if isTimelineVisible, machineState == .hidden {
            return .toolPanel(.timeline)
        }
        return machineState
    }

    public var isBandHidden: Bool { effectiveBandState == .hidden }

    /// Outil dont le panneau est EFFECTIVEMENT ouvert. `nil` quand le band est
    /// replié ou affiche un panneau de format.
    public var activeBandTool: StoryToolMode? {
        if case .toolPanel(let tool) = effectiveBandState { return tool }
        return nil
    }
}

/// Issue d'un tap sur le fond du canvas — trois cas, aucun implicite.
public nonisolated enum ComposerBackgroundTapAction: Equatable, Sendable {
    /// Un éditeur possède le canvas (texte inline, dessin, zoom, timeline) ou il
    /// n'existe aucune affordance de retour (picker d'état vide).
    case ignore
    /// Rien d'ouvert : masquer / révéler le chrome (critère D4).
    case toggleChrome
    /// Un panneau est ouvert : « tap hors zone » le ferme (standard SOTA).
    case dismissPanel
}

/// Ce qu'il faut EFFACER pour fermer le panneau actif, plus le contexte qui en
/// résulte. Extrait en valeur pour que la sortie de panneau soit testable de
/// bout en bout : la vue n'en est qu'un applicateur trivial, et vérifier que le
/// code est ÉCRIT (grep) ne prouve pas qu'il PRODUIT le bon état.
public nonisolated struct ComposerDismissOutcome: Equatable, Sendable {
    public let clearActiveTool: Bool
    public let clearTimeline: Bool
    public let clearSelection: Bool
    public let resultingContext: ComposerChromeContext
}

/// Règle UNIQUE de visibilité du chrome plein du composer (C-DIR2, directive
/// user 2026-07-04) : le header (X / strip / visibilité / preview / Publier / ⋯)
/// et la colonne annuler/rétablir apparaissent sous les MÊMES conditions que la
/// colonne de FABs — canvas plein écran, aucun panneau ouvert, aucune édition en
/// cours, pas de zoom viewport. Pendant l'édition, le chrome est inutile : on
/// n'affiche que ce qui sert à l'instant t.
public nonisolated enum ComposerChromePolicy {

    public static func fullChromeVisible(_ ctx: ComposerChromeContext) -> Bool {
        // Les trois derniers termes restent explicites malgré `isBandHidden` : le
        // dessin immersif force le band à `.hidden` tout en devant garder le
        // chrome masqué — les supprimer réintroduirait le header pendant le tracé.
        !ctx.isChromeHidden
            && ctx.isBandHidden
            && !ctx.isTextEditing
            && !ctx.isDrawingActive
            && !ctx.isViewportZoomed
            && !ctx.isTimelineVisible
    }

    /// Le tap sur le fond n'est émis que si le hit-test du canvas n'a trouvé
    /// AUCUN élément (`StoryCanvasUIView+Gestures`) : aucune désélection n'est
    /// perdue par ce routage.
    public static func backgroundTapAction(_ ctx: ComposerChromeContext) -> ComposerBackgroundTapAction {
        // Un éditeur possède le canvas : le tap lui appartient (fin d'édition
        // texte, désélection d'un trait, recentrage sous zoom, scrub timeline).
        if ctx.isTextEditing || ctx.isDrawingActive || ctx.isDrawingImmersive
            || ctx.isViewportZoomed || ctx.isTimelineVisible {
            return .ignore
        }
        // Composer vierge : le picker géant a remplacé la barre d'outils, donc la
        // poignée de restauration n'est pas montée. Masquer le chrome y laisserait
        // un écran sans « Fermer », sans « Publier » et sans retour possible.
        if ctx.isEmptyStatePickerVisible { return .ignore }
        if ctx.isBandHidden { return .toggleChrome }
        return .dismissPanel
    }

    /// Fermeture du panneau actif, QUEL QUE SOIT le chemin. Les trois effacements
    /// sont indispensables : sans eux `effectiveBandState` re-forcerait aussitôt
    /// le panneau (c'est ainsi que le chevron « Retour » du panneau DESSIN était
    /// un no-op visuel). Le contexte résultant rend le chrome de façon
    /// inconditionnelle — une sortie de panneau ne laisse JAMAIS l'écran nu.
    public static func dismissing(_ ctx: ComposerChromeContext) -> ComposerDismissOutcome {
        let clearSelection: Bool
        if case .formatPanel = ctx.machineState { clearSelection = true } else { clearSelection = false }
        let clearActiveTool = ctx.isDrawingActive
        let clearTimeline = ctx.isTimelineVisible
        // Le picker géant réapparaît après ce dismiss SEULEMENT si l'outil actif
        // est effacé (seule sortie qui vide `activeTool` — quitter Média/Texte/Son
        // laisse `activeTool` posé, donc `activeToolIsNil` reste faux et le
        // picker ne revient jamais, cf. `resolveShouldShowEmptyStateLargePicker`)
        // ET que le composer reste vierge ET qu'aucune timeline ne remplace la
        // vue. Recopier tel quel `ctx.isEmptyStatePickerVisible` était FAUX par
        // construction (un panneau ouvert implique `bandStateIsHidden == false`
        // au moment de la capture, donc ce champ valait toujours `false` en
        // entrée) : le résultat ne recouvrait jamais le cas réel « sortie d'un
        // dessin vide sur un composer resté vierge », où le picker DOIT revenir
        // — sans quoi un tap ultérieur sur le fond du canvas masquerait le chrome
        // sur un écran où la poignée de restauration n'est plus montée.
        let willShowEmptyStatePicker = clearActiveTool && ctx.isComposerEmpty && !clearTimeline
        return ComposerDismissOutcome(
            clearActiveTool: clearActiveTool,
            clearTimeline: clearTimeline,
            clearSelection: clearSelection,
            resultingContext: ComposerChromeContext(
                machineState: .hidden,
                isChromeHidden: false,
                isTextEditing: ctx.isTextEditing,
                isDrawingActive: false,
                isDrawingImmersive: false,
                isViewportZoomed: ctx.isViewportZoomed,
                isTimelineVisible: false,
                isEmptyStatePickerVisible: willShowEmptyStatePicker,
                isComposerEmpty: ctx.isComposerEmpty
            )
        )
    }

    /// Les chips « Arrière-plan » / « Premier plan » pilotent la MANIPULATION du
    /// canvas, pas le chrome : les assujettir à `fullChromeVisible` les retirerait
    /// dans leur état d'usage — panneau « Fond » ouvert, ou viewport zoomé sur le
    /// média d'arrière-plan. Le canvas reste hit-testable dans ces deux états
    /// (`canvasComposerLayer` ne coupe le hit-testing que pour le tracé immersif,
    /// `.allowsHitTesting(!isImmersiveDrawingSurface)`).
    ///
    /// Les chips ne sont montés que là où ils ont une FONCTION :
    /// `StoryCanvasUIView.resolveManipulationLayer(for:override:)` ne laisse
    /// l'override changer le résultat que si les DEUX couches portent du contenu ;
    /// avec une seule couche peuplée, l'auto-dérivation gagne et les chips sont
    /// décoratifs. Ils réapparaissent dès qu'un fond et un élément de premier plan
    /// coexistent — aucune affordance n'est retirée.
    public static func layerIndicatorVisible(
        _ ctx: ComposerChromeContext,
        hasBackgroundContent: Bool,
        hasForegroundContent: Bool
    ) -> Bool {
        hasBackgroundContent
            && hasForegroundContent
            && !ctx.isTextEditing
            && !ctx.isDrawingImmersive
            && !ctx.isChromeHidden
    }
}
