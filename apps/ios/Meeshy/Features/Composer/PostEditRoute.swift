import SwiftUI
import MeeshySDK
import MeeshyUI

/// **QUELLE PORTE OUVRE « MODIFIER » — la décision, à UN seul endroit** (#6700).
///
/// Constat porteur (2026-09-15) : éditer une story ouvrait « l'ancien composer ».
/// Mesuré : les CINQ hôtes qui offrent « Modifier » — `PostDetailView`,
/// `FeedView`, `ProfileUserPostsList`, `ReelsPlayerView`, `RootViewComponents` —
/// montaient `EditPostSheet` sans jamais regarder le TYPE du post, alors que
/// `post.isStory` servait déjà à leur AFFICHAGE deux écrans plus haut.
///
/// La porte juste existait pourtant : `storyEditComposerCover` → `StoryEditComposer`
/// → `MeeshyComposerHost`, le meuble. Elle n'était atteignable que par « Mes
/// stories ». Et la table de routage le disait déjà sans que personne ne
/// l'appelle — `ComposerIntent` rend `.storyEdit` pour `.story` et
/// `.editPostSheet` pour POST/RÉEL, son propre doc-comment constatant que « les
/// deux feuilles sont montées directement, hors du routeur ».
///
/// **Ce fichier est la porte que le routeur n'avait pas.** Il vit à part, et
/// c'est une contrainte autant qu'un choix : quatre des cinq hôtes sont HORS
/// BUDGET (2 163, 1 583, 1 450, 1 273 lignes), et la directive 2026-08-28
/// interdit d'ajouter à un fichier hors budget. Chez eux, ce lot REMPLACE un
/// `.sheet(…)` par un `.postEditCover(…)` — jamais une ligne de plus.
/// `nonisolated` : la décision ne touche aucun état d'interface — c'est ce qui
/// permet de l'éprouver sans monter d'écran ni sauter sur le main actor. Même
/// forme que `LegacyComposer` dans `ComposerIntent.swift`, son voisin de table.
nonisolated enum PostEditRoute: Equatable {
    /// Le meuble (`MeeshyComposerHost`), hydraté sur la story publiée.
    case meuble
    /// L'éditeur historique — POST, RÉEL, et toute dégradation.
    case legacySheet

    /// **La décision, PURE.** Elle ne connaît ni vue ni présentation : c'est ce
    /// qui la rend éprouvable sans monter un écran.
    ///
    /// `hasStoryComposer` porte la DÉGRADATION, et elle n'est pas décorative :
    /// le meuble d'édition exige un `StoryViewModel`, que les feuilles
    /// n'héritent pas de la racine. Le lire en `@EnvironmentObject` ferait
    /// trapper `EnvironmentObject.wrappedValue` — la classe de crash que
    /// `SheetEnvironmentObjectGuardTests` garde depuis le SIGTRAP de
    /// TestFlight 1.0.4. Absent ⇒ on retombe sur l'ancien éditeur, qui édite au
    /// moins le texte : dégrader, jamais trapper.
    ///
    /// Le type se lit par `isStory`, jamais par une comparaison recopiée : deux
    /// lectures du même champ divergeraient au premier serveur qui sert
    /// « story » en minuscules.
    static func resolve(for post: FeedPost?, hasStoryComposer: Bool) -> PostEditRoute {
        guard let post, post.isStory, hasStoryComposer else { return .legacySheet }
        return .meuble
    }
}

extension View {
    /// **La porte d'édition d'un post, quel que soit son format.**
    ///
    /// L'hôte remet la feuille HISTORIQUE dans `legacy` — c'est lui qui sait
    /// quoi faire d'un `onSave`, et ce contrat-là ne bouge pas. Ce qu'il cesse
    /// de décider, c'est SI cette feuille est la bonne.
    ///
    /// Le `StoryViewModel` est lu dans l'ENVIRONNEMENT (`\.meeshyStoryComposer`,
    /// posé par les deux racines via `meeshySocialChrome`) et non reçu en
    /// paramètre : trois des cinq hôtes ne le déclarent pas, et deux d'entre eux
    /// sont hors budget — l'exiger aurait coûté une ligne là où aucune n'est
    /// permise.
    func postEditCover<Legacy: View>(
        post: FeedPost?,
        isPresented: Binding<Bool>,
        @ViewBuilder legacy: @escaping () -> Legacy
    ) -> some View {
        modifier(PostEditCoverModifier(post: post, isPresented: isPresented, legacy: legacy))
    }

    /// La même porte, pour les quatre hôtes qui présentent par ITEM — c'est
    /// l'item qui porte le post, donc la route se résout sur lui.
    ///
    /// L'item est remis à `nil` par la porte elle-même à la fermeture : c'est le
    /// contrat que `.sheet(item:)` offrait, et le perdre laisserait l'hôte avec
    /// un post encore « en édition » après le retour.
    func postEditCover<Legacy: View>(
        item: Binding<FeedPost?>,
        @ViewBuilder legacy: @escaping (FeedPost) -> Legacy
    ) -> some View {
        let porte = item.wrappedValue
        return postEditCover(
            post: porte,
            isPresented: Binding(
                get: { item.wrappedValue != nil },
                set: { if !$0 { item.wrappedValue = nil } }
            ),
            legacy: { if let porte { legacy(porte) } }
        )
    }
}

private struct PostEditCoverModifier<Legacy: View>: ViewModifier {
    let post: FeedPost?
    @Binding var isPresented: Bool
    @ViewBuilder let legacy: () -> Legacy

    @Environment(\.meeshyStoryComposer) private var storyComposer

    /// La session du meuble, construite à l'OUVERTURE et pas au rendu : le
    /// `StoryComposerViewModel(editing:)` hydrate, et le reconstruire à chaque
    /// passe rejouerait l'hydratation sous les doigts de l'auteur.
    @State private var session: StoryEditSession?

    private var route: PostEditRoute {
        PostEditRoute.resolve(for: post, hasStoryComposer: storyComposer != nil)
    }

    func body(content: Content) -> some View {
        let base = content
            // L'ancien éditeur ne s'ouvre QUE sur sa route — sinon son
            // `isPresented` resterait un second chemin vers lui.
            .sheet(isPresented: Binding(
                get: { isPresented && route == .legacySheet },
                set: { if !$0 { isPresented = false } }
            )) { legacy() }
            .adaptiveOnChange(of: isPresented) { _, ouvert in
                guard ouvert, route == .meuble, let post else { return }
                let story = StoryItem(feedPost: post)
                session = StoryEditSession(story: story,
                                           composer: StoryComposerViewModel(editing: story))
            }

        // Le cover du meuble n'est monté que si le compositeur EXISTE : un
        // `?? StoryViewModel()` de politesse en construirait un à chaque passe
        // de rendu, pour une surface jamais atteinte — un coût permanent au
        // service d'un cas impossible (la route `.meuble` exige ce même objet).
        return Group {
            if let storyComposer {
                base.storyEditComposerCover(
                    session: Binding(
                        get: { session },
                        set: { nouvelle in
                            session = nouvelle
                            // Le meuble refermé rend la main à l'hôte : sans ça,
                            // son booléen resterait vrai et « Modifier » ne
                            // rouvrirait plus rien (loi 4 — un contrôle sans
                            // effet).
                            if nouvelle == nil { isPresented = false }
                        }
                    ),
                    viewModel: storyComposer
                )
            } else {
                base
            }
        }
    }
}
