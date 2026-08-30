import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La barre haute du composer — `✕ · [type ▾] · rail · ⋯`** (planche § P4).
///
/// ## Pourquoi elle sort de la surface document (#4070)
///
/// Elle n'a jamais appartenu au DOCUMENT : elle agit sur la
/// `MeeshyPublication` — la fermer, choisir son profil, lire ses
/// `MeeshySlide`, ouvrir ce que le document sait faire. Toute surface du
/// meuble en a besoin, et la scène incrustée devenant sa propre surface, la
/// garder privée à l'une des deux aurait obligé l'autre à la recopier.
///
/// C'est la tâche **4.3** de la planche prise dans l'autre sens : quand un
/// contexte gagne sa surface, ce qui est COMMUN doit d'abord devenir un
/// composant — sans quoi l'extraction duplique le chrome au lieu de le
/// partager, et les deux copies divergent au premier ajustement.
///
/// **Rien de son comportement ne change dans ce lot** : c'est un déplacement,
/// pas une réécriture. Les décisions qu'elle portait restent écrites ici.
struct ComposerTopBar: View {

    /// Les vignettes du rail — une par `MeeshySlide`. Vide ⇒ pas de rail.
    let localMedia: [ComposerDocumentMedia]
    let selectedMediaURL: URL?
    let selectableMediaURLs: Set<URL>

    /// L'éventail des profils, monté par l'hôte. `nil` ⇒ un seul format offert,
    /// donc aucun sélecteur (loi 4).
    let formatFan: AnyView?
    /// Ce que le document sait faire. `nil` ⇒ aucune entrée n'a d'objet.
    let overflowMenu: AnyView?

    let onClose: () -> Void
    var onRemoveMedia: ((ComposerDocumentMedia) -> Void)?
    var onSelectMedia: ((ComposerDocumentMedia) -> Void)?

    /// **L'historique — des PRIMITIVES, jamais le ViewModel** (#4402).
    ///
    /// Deux `Bool` et deux closures plutôt qu'un `@ObservedObject` : la barre
    /// haute est une feuille de l'arbre, et lui donner le composer entier la
    /// ferait se re-rendre à chaque frappe de texte. C'est la règle « Zero
    /// Unnecessary Re-render » du dépôt, appliquée là où elle se voit — cette
    /// barre est redessinée à chaque cycle du composer.
    ///
    /// **Défaut `false` sur les deux drapeaux, et c'est ce qui rend le lot
    /// additif** : les surfaces qui ne servent pas d'historique n'en montrent
    /// aucun sans avoir à le dire.
    var canUndo: Bool = false
    var canRedo: Bool = false
    var onUndo: (() -> Void)?
    var onRedo: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    // **Pas `glassControlForeground()`, et c'est délibéré.** Le
                    // helper du SDK rend `indigo950` en thème CLAIR — juste sur
                    // une surface qui suit le thème, faux ici : le plateau du
                    // composer est sombre EN PERMANENCE. On y aurait peint du
                    // sombre sur du sombre dès que l'appareil quitte la nuit.
                    .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                    .frame(width: ComposerControlMetrics.visualDiameter,
                           height: ComposerControlMetrics.visualDiameter)
                    .adaptiveGlass(in: Circle())
            }
            .accessibilityLabel(Text(ComposerDocumentCopy.close))
            if let formatFan { formatFan.fixedSize() }
            slideRail
            Spacer(minLength: 0)
            historyControls
            if let overflowMenu { overflowMenu.fixedSize() }
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }


    /// **Annuler et rétablir — présents seulement s'ils ont quelque chose à
    /// faire** (#4402, loi 4 : un contrôle sans effet est ABSENT, jamais
    /// grisé).
    ///
    /// Ce n'est pas une préférence esthétique. Un « annuler » grisé occupe la
    /// place et l'attention d'un contrôle, pour ne rien promettre ; sur une
    /// barre qui porte déjà la fermeture, le format, le rail des slides et le
    /// menu, cette place est disputée. Le contrôle paraît quand il agit.
    ///
    /// Les glyphes sont ceux du système (`arrow.uturn.backward` /
    /// `.forward`), donc ceux que l'utilisateur a appris ailleurs, et ils
    /// s'inversent d'eux-mêmes en RTL — c'est la raison de ne pas dessiner de
    /// flèche maison.
    @ViewBuilder
    private var historyControls: some View {
        if canUndo || canRedo {
            HStack(spacing: 8) {
                if canUndo {
                    historyButton(systemName: "arrow.uturn.backward",
                                  label: ComposerHistoryCopy.undo,
                                  action: onUndo)
                }
                if canRedo {
                    historyButton(systemName: "arrow.uturn.forward",
                                  label: ComposerHistoryCopy.redo,
                                  action: onRedo)
                }
            }
            .fixedSize()
        }
    }

    private func historyButton(systemName: String,
                               label: String,
                               action: (() -> Void)?) -> some View {
        Button { action?() } label: {
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .bold))
                // Même raison que la croix de fermeture : le plateau est sombre
                // en PERMANENCE, donc jamais `glassControlForeground()`.
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
        }
        .accessibilityLabel(Text(label))
    }

    /// **Le rail des slides (#4047).** Une vignette par slide, celle qu'on
    /// regarde cerclée, chacune retirable. `localMedia` vide ⇒ RIEN — pas une
    /// bande à hauteur nulle, pas un rail de zéro chip : un document sans média
    /// n'a qu'une slide, et un rail d'un seul élément ne navigue vers rien
    /// (loi 4).
    ///
    /// **Aucun `＋` en v1, et c'est une RÉPONSE.** La planche en dessine un,
    /// mais en Post une slide EST un média : un `＋` y créerait une slide VIDE,
    /// donc un média fantôme dans le carrousel — un post qu'on publierait avec
    /// un trou. Le seul geste honnête pour ajouter une slide en Post est
    /// l'outil photo, qui existe déjà. Le `＋` revient avec le profil où une
    /// slide vide a un sens (Story), pas avant.
    @ViewBuilder
    private var slideRail: some View {
        if !localMedia.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(localMedia, id: \.url) { media in
                        ComposerMediaThumbnail(
                            media: media,
                            side: 40,
                            isSelected: media.url == selectedMediaURL,
                            showsRemove: ComposerMediaChipAffordance.showsRemove(
                                isSelected: media.url == selectedMediaURL,
                                isSelectable: selectableMediaURLs.contains(media.url)
                            )
                        ) {
                            onRemoveMedia?(media)
                        }
                        // Loi 4 : la vignette n'est un CONTRÔLE que si l'hôte
                        // sait quoi faire du tap. Sans relais, elle reste ce
                        // qu'elle a toujours été.
                        .onTapGesture { onSelectMedia?(media) }
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerDocumentCopy.mediaStrip))
        }
    }
}
