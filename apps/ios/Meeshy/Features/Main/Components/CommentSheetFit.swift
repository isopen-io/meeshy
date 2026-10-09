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
    /// haut du composeur dans `space`.
    nonisolated static func overflows(composerTop: CGFloat) -> Bool {
        composerTop < -tolerance
    }

    /// La détente que la feuille doit prendre : la grande dès que le composeur
    /// déborde, sinon celle qu'elle a. Elle ne se réduit jamais d'elle-même —
    /// c'est le geste de l'utilisateur qui la ramène.
    nonisolated static func detent(composerTop: CGFloat, current: PresentationDetent) -> PresentationDetent {
        overflows(composerTop: composerTop) ? .large : current
    }
}

struct CommentSheetComposerTopKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

extension View {
    /// La zone de contenu de la feuille, dont le haut est le bas de l'en-tête.
    ///
    /// **La zone a la taille qu'on lui PROPOSE, jamais celle de son contenu.**
    /// L'espace de coordonnées était posé sur le conteneur du contenu
    /// lui-même : quand le composeur débordait, ce conteneur grandissait avec
    /// lui et remontait d'autant sous l'en-tête — son origine suivait le
    /// débordement, le haut du composeur n'y devenait jamais négatif, et la
    /// sonde ne voyait rien (recette du 2026-10-09 : feuille restée à
    /// mi-hauteur). Un `GeometryReader` prend exactement la place offerte ;
    /// le contenu y est ancré en BAS, et ce qui dépasse dépasse en haut de
    /// CETTE zone, où la sonde le mesure.
    func commentSheetContent() -> some View {
        GeometryReader { area in
            self.frame(width: area.size.width, height: area.size.height, alignment: .bottom)
        }
        .coordinateSpace(name: CommentSheetFit.space)
    }

    /// Sonde le haut du composeur et fait grandir la feuille quand il dépasse.
    func keepsComposerBelowSheetHeader(detent: Binding<PresentationDetent>) -> some View {
        background(GeometryReader { proxy in
            Color.clear.preference(key: CommentSheetComposerTopKey.self,
                                   value: proxy.frame(in: .named(CommentSheetFit.space)).minY)
        })
        .onPreferenceChange(CommentSheetComposerTopKey.self) { top in
            let needed = CommentSheetFit.detent(composerTop: top, current: detent.wrappedValue)
            guard needed != detent.wrappedValue else { return }
            withAnimation(.spring(response: 0.32, dampingFraction: 0.86)) { detent.wrappedValue = needed }
        }
    }
}
