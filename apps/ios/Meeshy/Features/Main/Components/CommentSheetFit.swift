import SwiftUI

// **LE COMPOSEUR NE PASSE JAMAIS SOUS L'EN-TÊTE DE LA FEUILLE** (#9736).
//
// La feuille des commentaires s'ouvre à mi-hauteur. Son composeur, lui, a une
// hauteur qui ne se négocie pas : le panneau des pièces reprend celle du
// clavier, et la zone d'aperçu s'y ajoute. Plus haut que la place disponible,
// il débordait VERS LE HAUT — la rangée d'outils, puis les tuiles, glissaient
// sous le titre et sous la croix de fermeture, qui recouvrait le ✕ des tuiles.
//
// La règle se lit sur une SONDE, pas sur une liste de cas : dès que le haut
// du composeur dépasse le haut de la zone de contenu, la feuille passe à sa
// grande détente. Clavier, panneau, zone d'aperçu, bandeau de réponse — tout
// ce qui grandit le composeur est couvert par la même mesure.

nonisolated enum CommentSheetFit {
    /// L'espace de coordonnées de la zone de contenu de la feuille : son
    /// origine est le BAS de l'en-tête.
    static let space = "comment-sheet-content"

    /// La tolérance d'arrondi d'une mise en page au demi-point.
    static let tolerance: CGFloat = 0.5

    /// `true` quand le composeur dépasse sous l'en-tête. `composerTop` est le
    /// haut du composeur dans `space`. Une mesure non finie (cadre nul d'une
    /// vue pas encore placée, ou déjà retirée) ne prouve rien : elle ne
    /// déborde pas.
    nonisolated static func overflows(composerTop: CGFloat) -> Bool {
        composerTop.isFinite && composerTop < -tolerance
    }

    /// La détente que la feuille doit prendre : la grande dès que le composeur
    /// déborde, sinon celle qu'elle a. Elle ne se réduit jamais d'elle-même —
    /// c'est le geste de l'utilisateur qui la ramène.
    nonisolated static func detent(composerTop: CGFloat, current: PresentationDetent) -> PresentationDetent {
        overflows(composerTop: composerTop) ? .large : current
    }
}

// MARK: - Le panneau cède avant que le composeur ne déborde

/// Un hôte dont la hauteur est COMPTÉE (une feuille) demande au panneau
/// d'entrée du composeur de céder de la place plutôt que de pousser le reste
/// hors de l'écran. Absent — la conversation, le plein écran — le panneau
/// garde sa hauteur fixe, celle du clavier, pour que la rangée de saisie ne
/// bouge pas d'un point quand clavier et panneau s'échangent.
private struct ComposerPanelYieldsKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var composerPanelYieldsToHost: Bool {
        get { self[ComposerPanelYieldsKey.self] }
        set { self[ComposerPanelYieldsKey.self] = newValue }
    }
}

/// La hauteur du panneau d'entrée (carrousel des pièces, grille des récents).
///
/// **L'ordre garanti, de haut en bas : en-tête, zone d'aperçu, rangée
/// d'outils, champ, panneau.** Quand la place manque, ce n'est ni la zone
/// d'aperçu ni la rangée d'outils qui passent sous l'en-tête : c'est le
/// panneau qui se réduit — sa grille défile — jusqu'à son plancher.
struct ComposerPanelFrame: ViewModifier {
    /// La hauteur de repos : celle du clavier.
    let resting: CGFloat
    let yields: Bool

    /// Une rangée de vignettes reste atteignable ; en dessous, la feuille
    /// grandit (`keepsComposerBelowSheetHeader`).
    static let floor: CGFloat = 96

    func body(content: Content) -> some View {
        if yields {
            content.frame(minHeight: min(Self.floor, resting), idealHeight: resting, maxHeight: resting)
        } else {
            content.frame(height: resting)
        }
    }
}

extension View {
    /// La zone de contenu de la feuille, dont le haut est le bas de l'en-tête.
    ///
    /// **La zone a la taille qu'on lui PROPOSE, jamais celle de son contenu.**
    /// Un `GeometryReader` prend exactement la place offerte ; le contenu y
    /// est ancré en BAS, et ce qui dépasserait dépasse en haut de CETTE zone,
    /// où la sonde le mesure. Elle dit aussi au composeur que sa place est
    /// comptée : son panneau cède (`composerPanelYieldsToHost`).
    func commentSheetContent() -> some View {
        GeometryReader { area in
            self.frame(width: area.size.width, height: area.size.height, alignment: .bottom)
                .environment(\.composerPanelYieldsToHost, true)
                .onAppear { CommentSheetFit.trace("zone", area.frame(in: .global)) }
                .onChange(of: area.size.height) { _ in CommentSheetFit.trace("zone", area.frame(in: .global)) }
        }
        .coordinateSpace(name: CommentSheetFit.space)
    }

    /// Le composeur d'une feuille : il est servi AVANT la liste (qui cède
    /// jusqu'à zéro), et sondé — s'il dépasse encore le haut de la zone, la
    /// feuille passe à sa grande détente.
    ///
    /// **La sonde suit la GÉOMÉTRIE, pas une préférence** (#9743). Une
    /// préférence posée par un `GeometryReader` d'arrière-plan n'était émise
    /// qu'au premier passage, composeur encore à zéro : quand la mise en page
    /// le poussait ensuite sous l'en-tête, sa TAILLE ne changeait pas, le
    /// lecteur ne se réévaluait pas, et la feuille restait à mi-hauteur (mesuré :
    /// haut à −138 pt, une seule valeur reçue, 0). `onGeometryChange` rend
    /// chaque déplacement, avec une transformation non isolée.
    func keepsComposerBelowSheetHeader(detent: Binding<PresentationDetent>) -> some View {
        let space = CommentSheetFit.space
        return layoutPriority(1)
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(space)) } action: { frame in
            CommentSheetFit.trace("composeur", frame)
            let top = frame.minY
            let needed = CommentSheetFit.detent(composerTop: top, current: detent.wrappedValue)
            CommentSheetFit.trace("sonde haut=\(String(format: "%.0f", top)) détente=\(CommentSheetFit.name(detent.wrappedValue)) demandée=\(CommentSheetFit.name(needed))", nil)
            guard needed != detent.wrappedValue else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { detent.wrappedValue = needed }
        }
    }
}

// MARK: - Instrumentation de recette (Debug)

extension CommentSheetFit {
    static func name(_ detent: PresentationDetent) -> String {
        detent == .large ? "large" : (detent == .medium ? "medium" : "autre")
    }

    /// Les cadres et la détente, lisibles au simulateur :
    /// `xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "CommentSheetFit"'`.
    static func trace(_ what: String, _ frame: CGRect?) {
        #if DEBUG
        if let frame {
            NSLog("[CommentSheetFit] %@ y=%.1f…%.1f h=%.1f", what, frame.minY, frame.maxY, frame.height)
        } else {
            NSLog("[CommentSheetFit] %@", what)
        }
        #endif
    }
}
