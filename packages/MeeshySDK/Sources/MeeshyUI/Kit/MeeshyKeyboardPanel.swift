import SwiftUI

/// **Le panneau qui remplace le clavier** (K17) : la surface sombre opaque de K15, toute la largeur, à la
/// hauteur que le dock lui donne (celle du clavier). Son contenu défile en colonne et ne renvoie jamais le
/// clavier ; il est nommé par `label` (le nom de l'outil ouvert).
///
/// L'hôte fournit le contenu (K03, K04, K05, K07, polices, fonds) : le panneau n'en sait rien. Le bas du
/// contenu laisse la zone sûre, au moins 14.
public struct MeeshyKeyboardPanel<Content: View>: View {
    private let label: String
    private let content: Content

    public init(label: String, @ViewBuilder content: () -> Content) {
        assert(!label.isEmpty, "MeeshyKeyboardPanel : le nom du panneau est obligatoire et non vide")
        self.label = label
        self.content = content()
    }

    public var body: some View {
        GeometryReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: MeeshyKeyboardDockRecipe.panelGap) {
                    content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, MeeshyKeyboardDockRecipe.panelHorizontalPadding)
                .padding(.top, MeeshyKeyboardDockRecipe.panelVerticalPadding)
                .padding(.bottom, MeeshyKeyboardDockRecipe.panelBottom(safeBottom: proxy.safeAreaInsets.bottom))
            }
            .scrollDismissesKeyboard(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background { MeeshyColors.indigo950.ignoresSafeArea() }
        .environment(\.colorScheme, .dark)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }
}
