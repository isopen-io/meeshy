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
    /// Le meuble sur le DOCUMENT, hydraté sur le post ou le réel publié
    /// (#9333) — la même vue que celle qui l'a créé.
    case composer
    /// L'éditeur historique — publication portant un média qu'aucune scène ne
    /// montre (un document), et toute dégradation (#15631).
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
        guard let post, hasStoryComposer else { return .legacySheet }
        if post.isStory { return .meuble }
        return PostEditComposerEligibility.opensInComposer(post) ? .composer : .legacySheet
    }
}

/// Ce que « Modifier » enregistre — le CONTRAT de l'hôte, inchangé : la
/// requête de modification de son ViewModel. Le compositeur et l'éditeur
/// historique la reçoivent tous deux ; aucun n'en écrit une seconde.
typealias PostEditSave = @MainActor (FeedPost, EditPostDraft) async -> Void

extension View {
    /// **La porte d'édition d'un post, quel que soit son format.**
    ///
    /// L'hôte remet ce qu'il fait d'une modification (`onSave`) ; la porte
    /// décide QUELLE surface la recueille. Le `StoryViewModel` est lu dans
    /// l'ENVIRONNEMENT (`\.meeshyStoryComposer`, posé par les deux racines via
    /// `meeshySocialChrome`) et non reçu en paramètre : trois des cinq hôtes ne
    /// le déclarent pas.
    func postEditCover(post: FeedPost?, isPresented: Binding<Bool>, onSave: @escaping PostEditSave) -> some View {
        modifier(PostEditCoverModifier(post: post, isPresented: isPresented, onSave: onSave))
    }

    /// La même porte, pour les hôtes qui présentent par ITEM. L'item est remis
    /// à `nil` à la fermeture — le contrat que `.sheet(item:)` offrait.
    func postEditCover(item: Binding<FeedPost?>, onSave: @escaping PostEditSave) -> some View {
        postEditCover(
            post: item.wrappedValue,
            isPresented: Binding(
                get: { item.wrappedValue != nil },
                set: { if !$0 { item.wrappedValue = nil } }
            ),
            onSave: onSave
        )
    }
}

extension EditPostSheet {
    /// L'éditeur historique ouvert sur une publication — les dix champs que
    /// les cinq hôtes recopiaient chacun.
    init(post: FeedPost, onSave: @escaping @MainActor (EditPostDraft) async -> Void, onDismiss: @escaping () -> Void) {
        self.init(originalContent: post.content, originalLanguage: post.originalLanguage, originalType: post.type,
                  media: post.media.map { EditablePostMedia($0) }, originalStoryEffects: post.storyEffects,
                  originalLocation: post.location, originalVisibility: post.visibility,
                  originalVisibilityUserIds: post.visibilityUserIds ?? [], isRepost: post.repost != nil,
                  onSave: onSave, onDismiss: onDismiss)
    }
}

private struct PostEditCoverModifier: ViewModifier {
    let post: FeedPost?
    @Binding var isPresented: Bool
    let onSave: PostEditSave

    @Environment(\.meeshyStoryComposer) private var storyComposer

    /// Les sessions sont construites à l'OUVERTURE et pas au rendu : le
    /// ViewModel du composer hydrate, et le reconstruire à chaque passe
    /// rejouerait l'hydratation sous les doigts de l'auteur.
    @State private var session: StoryEditSession?
    @State private var publication: PostEditComposerSession?

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
            )) {
                if let post {
                    EditPostSheet(post: post, onSave: { await onSave(post, $0) }, onDismiss: { isPresented = false })
                }
            }
            .adaptiveOnChange(of: isPresented) { _, ouvert in
                guard ouvert, let post else { return }
                switch route {
                case .meuble:
                    let story = StoryItem(feedPost: post)
                    session = StoryEditSession(story: story, composer: StoryComposerViewModel(editing: story))
                case .composer:
                    publication = PostEditComposerSession(post: post)
                case .legacySheet:
                    break
                }
            }

        // Les covers du meuble ne sont montés que si le compositeur EXISTE : un
        // `?? StoryViewModel()` de politesse en construirait un à chaque passe
        // de rendu, pour une surface jamais atteinte.
        return Group {
            if let storyComposer {
                base
                    .storyEditComposerCover(session: closing($session), viewModel: storyComposer)
                    .fullScreenCover(item: closing($publication)) { courante in
                        PostEditComposerDoor(session: courante, storyViewModel: storyComposer,
                                             onSave: { await onSave(courante.post, $0) },
                                             onFinish: { publication = nil })
                    }
            } else {
                base
            }
        }
    }

    /// Le meuble refermé rend la main à l'hôte : sans ça, son booléen
    /// resterait vrai et « Modifier » ne rouvrirait plus rien (loi 4).
    private func closing<Session>(_ binding: Binding<Session?>) -> Binding<Session?> {
        Binding(
            get: { binding.wrappedValue },
            set: { nouvelle in
                binding.wrappedValue = nouvelle
                if nouvelle == nil { isPresented = false }
            }
        )
    }
}
