import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La porte d'ÉDITION d'une story publiée — le meuble, plus l'atelier nu**
/// (#5053).
///
/// Extraite de `StoryTrayView.swift` le 2026-09-03, et pas par goût du
/// rangement : passer au meuble AJOUTE (un aperçu, un publieur de document, une
/// hydratation), et le fichier d'origine frôlait le seuil de découpage à 1 005
/// lignes. La directive de budget veut qu'on extraie d'abord. La coupe est de
/// plus la bonne par responsabilité — décider ce qu'une édition rouvre, ce
/// qu'elle préserve et où elle publie n'a rien à faire dans la vue du tray.
///
/// ## Ce que la session PORTE, et pourquoi elle le porte encore
///
/// `StoryEditSession` tient l'item ET le ViewModel pré-hydraté. C'est
/// l'asymétrie assumée de `ComposerHydration` : le publieur d'une édition RELIT
/// ce ViewModel — `editingPostId`, les ids des médias d'origine, l'image de fond
/// hydratée, et surtout `editingKnowsDeclaredReferences`, qui décide si l'on
/// PRÉSERVE les références déclarées ou si on les révoque. Faire construire le
/// ViewModel au meuble ôterait à la porte la prise dont son publieur a besoin.
///
/// Le meuble n'en construit donc aucun ici : il ADOPTE celui qu'on lui remet, et
/// lui applique `adoptDraft(id:)` comme aux autres. Un seul objet, un seul site
/// d'adoption — l'invariant qui compte est intact.
///
/// ## Ce qui change pour l'auteur
///
/// L'édition montait `StoryComposerView` NU, donc sans plateau ni socle. Elle
/// n'offre toujours AUCUN changement de format, et c'est la table qui le veut :
/// `UpdatePostSchema.type` n'accepte que POST et RÉEL, et changer le format d'un
/// contenu publié est le rôle du repost, pas de l'édition. L'éventail ne se
/// peint donc pas — un éventail à une entrée n'affiche aucun sélecteur (loi 4).
/// Ce que l'édition gagne est le reste du meuble : le socle, son audience
/// SERVIE, sa flèche, et un œil qui montre vraiment ce qui partira.
struct StoryEditSession: Identifiable {
    let story: StoryItem
    let composer: StoryComposerViewModel
    var id: String { story.id }
}

extension View {
    /// Cover du composer en mode ÉDITION — partagé par le tray, la mini trail
    /// épinglée et les deux racines. Le publish route vers
    /// `StoryViewModel.updateStoryInBackground` (PUT + reset d'engagement
    /// serveur) au lieu de `publishStoryInBackground`.
    func storyEditComposerCover(
        session: Binding<StoryEditSession?>,
        viewModel: StoryViewModel
    ) -> some View {
        fullScreenCover(item: session) { current in
            StoryEditComposer(
                session: current,
                viewModel: viewModel,
                onFinish: { session.wrappedValue = nil }
            )
        }
    }
}

/// Le corps de la porte. Une vue à part et non une fermeture, parce qu'elle a
/// besoin d'un ÉTAT — celui de l'aperçu, que le socle du meuble arme.
struct StoryEditComposer: View {

    let session: StoryEditSession
    @ObservedObject var viewModel: StoryViewModel
    let onFinish: () -> Void

    /// L'aperçu monté DANS la porte. **Il n'est pas décoratif** : le socle du
    /// meuble peint un œil qui appelle `onPreview` (#4135). Le brancher sur une
    /// fermeture vide aurait armé un contrôle INERTE — le défaut que la loi 4
    /// nomme, et qui a déjà coûté au dépôt sur `PostCard` et sur le rail du
    /// composer. L'ancien cover n'avait pas ce problème parce qu'il n'avait pas
    /// de socle.
    @State private var previewAssets: StoryPreviewAssets?

    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        MeeshyComposerHost(
            // `documentFormat: .story` — l'édition d'une story n'offre AUCUN
            // autre format : la table le dit, et le serveur le refuserait.
            intent: ComposerIntent(origin: .edit(postId: session.composer.editingPostId ?? session.story.id,
                                                 documentFormat: .story)),
            // Valeur de POLITESSE, jamais celle qui décide : le ViewModel
            // hydraté porte `editingInitialVisibility`, que
            // `StoryComposerView.init` réassigne en PRIORITÉ ABSOLUE — le
            // composer s'ouvre sur la visibilité ACTUELLE de la story, jamais
            // sur un dernier choix mémorisé. `ComposerHydration.initialVisibility`
            // rend d'ailleurs `nil` pour l'édition, exactement pour ne pas
            // fabriquer une seconde source à cette valeur.
            initialVisibility: session.story.visibility ?? PostVisibility.friends.rawValue,
            hydration: .editingStory(session.composer),
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, _ in
                let edit = StoryViewModel.StoryEditContext(
                    postId: session.composer.editingPostId ?? session.story.id,
                    originalMediaIds: session.composer.editingOriginalMediaIds,
                    originalBackgroundMediaId: session.composer.editingOriginalBackgroundMediaId,
                    hydratedBackgroundImage: session.composer.editingHydratedBackgroundImage
                )
                let accepted = viewModel.updateStoryInBackground(
                    edit: edit,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    references: references,
                    declaredReferencesAreKnown: session.composer.editingKnowsDeclaredReferences,
                    composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                           caption: accessibility.mediaCaption ?? [:]),
                    allowSoundExtraction: accessibility.allowSoundExtraction
                )
                // Hors-ligne : le composer reste ouvert, rien n'est perdu —
                // et le `false` remonté relâche son loquet de publication.
                if accepted { onFinish() }
                return accepted
            },
            onPublishDocument: { _ in
                // **Un refus qui SE DIT, et qui n'est pas atteignable.**
                //
                // Le socle du document n'est joignable que si l'éventail offre
                // un format sans atelier. Ici il n'en offre qu'un — `.story` —
                // donc la scène est toujours montée et cette fermeture n'est
                // jamais appelée. Rendre `false` plutôt que de publier au
                // hasard : le jour où la table changerait d'avis, l'édition
                // refuserait VISIBLEMENT au lieu de créer un post NEUF en
                // croyant modifier l'existant. C'est le sens d'erreur le moins
                // cher à réparer.
                false
            },
            // Ni humeur ni graine de média : le contenu vient de l'hydratation.
            // Écrits en toutes lettres — ces paramètres n'ont pas de défaut,
            // précisément pour qu'aucune porte ne les perde en silence.
            moodSeed: nil,
            mediaSeed: nil,
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                previewAssets = StoryPreviewAssets(
                    slides: slides,
                    backgroundImages: images,
                    loadedImages: loadedImgs,
                    videoURLs: videoURLs,
                    audioURLs: audioURLs
                )
            },
            onDismiss: onFinish
        )
        .task {
            // Relecture UNITAIRE du post : c'est la seule charge utile où le
            // serveur projette les références POUR L'AUTEUR, donc la seule qui
            // porte ses silencieuses. Tant qu'elle n'a pas répondu, le composer
            // se tait sur les références et l'édition PRÉSERVE — jamais
            // l'inverse : un `mentions: []` envoyé par ignorance révoquerait des
            // références que l'auteur n'a jamais vues.
            //
            // Elle vit ici, sur la porte, et non dans le meuble : elle écrit sur
            // le ViewModel que la porte POSSÈDE. C'est la contrepartie directe
            // de l'asymétrie de `ComposerHydration.editingStory`.
            guard let served = await viewModel.fetchDeclaredReferences(
                postId: session.composer.editingPostId ?? session.story.id
            ) else { return }
            session.composer.adoptDeclaredReferences(served)
        }
        .fullScreenCover(item: $previewAssets, onDismiss: {
            NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
        }) { assets in
            let items = assets.slides.map { $0.toPreviewStoryItem() }
            let group = StoryGroup(
                id: "preview",
                username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
                avatarColor: MeeshyColors.brandPrimaryHex,
                stories: items
            )
            StoryViewerView(
                viewModel: viewModel,
                groups: [group],
                currentGroupIndex: 0,
                isPresented: Binding(
                    get: { previewAssets != nil },
                    set: { if !$0 { previewAssets = nil } }
                ),
                isPreviewMode: true,
                preloadedImages: assets.loadedImages.merging(assets.backgroundImages) { fg, _ in fg },
                preloadedVideoURLs: assets.videoURLs,
                preloadedAudioURLs: assets.audioURLs
            )
            // Les objets d'environnement ne traversent pas un
            // `fullScreenCover` — sans eux l'aperçu planterait à la première
            // lecture d'un de ces trois modèles.
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
        }
    }
}
