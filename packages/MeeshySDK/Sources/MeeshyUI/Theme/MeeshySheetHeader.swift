import SwiftUI

/// **L'en-tête d'une feuille qui se REFUSE ou se VALIDE** (#6134, directive
/// porteur 2026-09-12).
///
/// > « Mets à jour les feuilles Hashtag, Mention pour avoir un header précis et
/// > avec les actions liquid glass (annuler) à gauche, (terminé) à droite ! »
///
/// ## Un en-tête, pas deux jumeaux
///
/// Les deux feuilles visées vivent de part et d'autre de la frontière SDK — la
/// Mention dans `MeeshyUI`, le Hashtag dans l'app. Écrire l'en-tête deux fois
/// aurait produit exactement la jumelle divergente que la dimension 11 interdit,
/// et elle aurait divergé au premier ajustement de padding. Il vit donc du côté
/// que les deux peuvent atteindre, et il ne connaît de ses hôtes que trois
/// choses : un titre, un refus, un accord.
///
/// C'est aussi ce qui le garde conforme à la règle de pureté du SDK : il ne
/// nomme aucun singleton, n'encode aucune règle « quand faire X », et ne sait
/// rien de ce que ses boutons déclenchent.
///
/// ## Pourquoi « Annuler » et pas « Fermer »
///
/// Le mot est un CONTRAT. L'hôte qui monte cet en-tête s'engage à rendre, dans
/// `onCancel`, l'état d'avant l'ouverture — pas à fermer. Un bouton qui ferme
/// sans défaire n'est pas inerte, il est MENTEUR : l'utilisateur voit une
/// réaction et croit que son refus a porté. Si un hôte ne PEUT pas restituer,
/// il ne monte pas cet en-tête — il en faut un autre, dont le libellé dit la
/// vérité.
public struct MeeshySheetHeader: View {

    private let title: String
    private let onCancel: () -> Void
    private let onDone: () -> Void

    public init(title: String,
                onCancel: @escaping () -> Void,
                onDone: @escaping () -> Void) {
        self.title = title
        self.onCancel = onCancel
        self.onDone = onDone
    }

    public var body: some View {
        // Le titre en `ZStack` plutôt qu'au centre d'une `HStack` : centré sur
        // la FEUILLE, il ne bouge pas quand un libellé traduit s'allonge. En
        // `HStack`, « Abbrechen » pousserait le titre hors de l'axe, et il
        // n'aurait l'air juste qu'en français.
        ZStack {
            Text(title)
                .font(MeeshyFont.relative(16, weight: .semibold))
                .glassControlForeground()
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)

            HStack(spacing: MeeshySpacing.sm) {
                action(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module),
                       perform: onCancel)
                Spacer()
                action(String(localized: "common.done", defaultValue: "Terminé", bundle: .module),
                       perform: onDone)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    /// 44 pt de haut au minimum — la cible d'Apple, et la seule dimension que
    /// le texte seul ne garantit pas : « OK » traduit tiendrait dans 20 pt.
    private func action(_ label: String, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Text(label)
                .font(MeeshyFont.relative(15, weight: .semibold))
                .glassControlForeground()
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.lg)
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        // En DERNIER, après le dimensionnement — c'est ce que le doc-comment
        // d'`adaptiveGlass` demande, et la forme suit la capsule du reste du
        // chrome.
        .adaptiveGlass(in: Capsule())
    }
}
