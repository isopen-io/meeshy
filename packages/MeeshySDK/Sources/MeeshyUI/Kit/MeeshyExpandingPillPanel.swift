import SwiftUI

/// **Le panneau d'une option** (K11), posé dans le `above` de K10 : l'en-tête
/// (s'il est demandé) puis le corps que l'hôte fournit. Il ne dessine aucun verre,
/// ne joue aucune haptique et n'observe aucun magasin ; il porte le nom du
/// panneau pour le lecteur d'écran et l'échappement.
struct MeeshyExpandingPillPanel<HeaderTrailing: View, Content: View>: View {
    let option: MeeshyExpandingPillOption
    let hostHeight: CGFloat
    let onBack: (() -> Void)?
    let onClose: (() -> Void)?
    let escape: (() -> Void)?
    let backLabel: String
    let closeLabel: String
    let maxBodyHeight: CGFloat?
    let isBodyScrollLocked: Bool
    let takesFocus: Bool
    @Binding var bodyIsEmpty: Bool
    let headerTrailing: HeaderTrailing
    let content: Content

    var body: some View {
        VStack(spacing: MeeshyExpandingPillRecipe.sectionGap) {
            if option.showsHeader {
                header
            }
            MeeshyExpandingPillBody(
                ceiling: MeeshyExpandingPillRule.bodyCeiling(hostHeight: hostHeight, option: option, override: maxBodyHeight),
                isScrollLocked: isBodyScrollLocked,
                isEmpty: $bodyIsEmpty,
                content: content
            )
        }
        .padding(MeeshyExpandingPillRule.insets(for: option))
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(option.title)
        .modifier(MeeshyExpandingPillEscape(action: escape))
    }

    /// Sans accessoire, l'en-tête est une valeur comparable : le corps peut
    /// changer sans qu'il se re-rende. Avec un accessoire (un compteur), il suit.
    @ViewBuilder
    private var header: some View {
        if HeaderTrailing.self == EmptyView.self {
            MeeshyExpandingPillHeader(
                title: option.title, onBack: onBack, onClose: onClose,
                backLabel: backLabel, closeLabel: closeLabel, takesFocus: takesFocus
            )
            .equatable()
        } else {
            MeeshyExpandingPillHeader(
                title: option.title, onBack: onBack, onClose: onClose,
                backLabel: backLabel, closeLabel: closeLabel, takesFocus: takesFocus,
                trailing: { headerTrailing }
            )
        }
    }
}

/// L'échappement du lecteur d'écran, et Échap au clavier matériel : absent,
/// rien n'est posé (fermée, la pilule n'écoute rien).
private struct MeeshyExpandingPillEscape: ViewModifier {
    let action: (() -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let action {
            content
                .accessibilityAction(.escape, action)
                .background { keyboardEscape(action) }
        } else {
            content
        }
    }

    /// Échap au clavier matériel : un bouton sans taille ni rendu, muet pour le
    /// lecteur d'écran, qui ne prend aucun toucher.
    private func keyboardEscape(_ action: @escaping () -> Void) -> some View {
        Button(action: action) { Color.clear }
            .keyboardShortcut(.cancelAction)
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}

// MARK: - Le corps

/// **Le corps d'une option** : il épouse sa taille sous le plafond, puis défile
/// à la verticale sous un fondu de bord, en-tête et rangée fixes. La mise en page
/// décide seule, en une passe : un défilement plafonné (`frame(maxHeight:)`), dont
/// la hauteur idéale est celle du corps (`fixedSize` vertical), donc jamais plus
/// haut que lui ni que le plafond. Sa hauteur NATURELLE n'est mesurée que pour
/// couper le rebond d'un corps qui tient (`scrolls`) et détecter un corps vide,
/// au changement de taille, jamais à chaque image. Pas de `ViewThatFits` autour du
/// corps (rendu asynchrone d'iOS 26, #9456).
struct MeeshyExpandingPillBody<Content: View>: View {
    let ceiling: CGFloat
    let isScrollLocked: Bool
    @Binding var isEmpty: Bool
    let content: Content

    @State private var naturalHeight: CGFloat = 0

    init(ceiling: CGFloat, isScrollLocked: Bool, isEmpty: Binding<Bool>, content: Content) {
        self.ceiling = ceiling
        self.isScrollLocked = isScrollLocked
        self._isEmpty = isEmpty
        self.content = content
    }

    var body: some View {
        MeeshyFadingScrollView(axis: .vertical, fade: MeeshyExpandingPillRecipe.edgeFade) { measured }
            .scrollDisabled(isScrollLocked || !MeeshyExpandingPillRule.scrolls(contentHeight: naturalHeight, ceiling: ceiling))
            .frame(maxHeight: ceiling)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var measured: some View {
        content
            .frame(maxWidth: .infinity)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                naturalHeight = height
                isEmpty = height <= 0
            }
    }
}
