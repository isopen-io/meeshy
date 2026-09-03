import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La porte de REPUBLICATION d'une story — le meuble, plus l'atelier nu**
/// (#5053).
///
/// ## Pourquoi ce fichier existe
///
/// Le cover vivait dans le `body` de `StoryViewerView` — 2 407 lignes, très
/// au-delà du plafond DUR de 1 200 (directive 2026-09-02). La règle est
/// explicite : « ajouter à un fichier déjà hors budget est interdit : on extrait
/// d'abord, on ajoute ensuite ». Or passer au meuble AJOUTE — un état d'aperçu,
/// un publieur de document, une hydratation. L'extraction n'est donc pas un
/// rangement fait en passant : c'est la condition du changement.
///
/// Elle est de plus la bonne coupe par RESPONSABILITÉ : décider ce qu'une
/// republication ouvre, ce qu'elle plafonne et où elle publie n'a jamais eu de
/// raison de vivre dans le lecteur de stories.
///
/// ## Ce qui change pour l'auteur
///
/// L'ancien cover montait `StoryComposerView` NU. Il n'avait donc ni éventail de
/// format, ni plateau, ni socle — c'est-à-dire qu'une republication ne pouvait
/// pas devenir un post, alors que la table des portes déclare cet ancrage
/// depuis le lot 4.7 (`offeredFormats: [sourceFormat, .post]`, « garder la chose
/// pour de bon »). L'option était écrite et n'atteignait aucun écran.
///
/// ## Les trois manques que `ComposerIntent` énumérait, et ce qu'ils sont devenus
///
/// La table justifiait `routesToLegacy: .repostComposer` par trois faits. Ils
/// méritent d'être relus un par un, parce que deux étaient vrais et un ne
/// l'était pas :
///
/// 1. **« le meuble n'a aucune graine `StoryItem` »** — vrai, et fermé par
///    `ComposerHydration` : le meuble construit lui-même le ViewModel hydraté,
///    ce qui préserve l'invariant « un seul site construit, donc un seul site
///    adopte le brouillon ».
/// 2. **« son canal de scène ne porte pas `repostOfId` »** — FAUX, et c'est la
///    correction utile. `onPublishAllInBackground` est une fermeture fournie
///    par la porte, qui CAPTURE l'identifiant de la source ; c'est déjà ce que
///    faisait l'ancien cover. *Une signature qui ne nomme pas une valeur ne
///    l'empêche pas de voyager.*
/// 3. **« ni `allowedVisibilities` ni `initialVisibilityUserIds` »** — vrai, et
///    le seul des trois dont l'oubli était SILENCIEUX : un plafond absent
///    n'échoue pas, il offre une audience de plus que le serveur refusera
///    ensuite. Fermé par les mêmes trois propriétés de `ComposerHydration`,
///    tenues ENSEMBLE pour qu'on ne puisse pas en passer une sans les autres.
///
/// ## L'aperçu n'est pas décoratif
///
/// Le socle du meuble peint un œil qui appelle `onPreview` (#4135). L'ancien
/// cover n'en avait pas — il n'avait pas de socle. Lui en donner un et brancher
/// l'œil sur une fermeture vide aurait armé un CONTRÔLE INERTE : le défaut que
/// la loi 4 nomme, et qui a coûté au dépôt sur `PostCard` comme sur le rail du
/// composer. D'où l'état d'aperçu porté ici, et le lecteur monté en
/// `isPreviewMode`.
struct StoryRepublishComposer: View {

    /// La story republiée et le `@handle` de son auteur — ce dernier alimente
    /// le badge d'attribution VERROUILLÉ que le republieur ne peut pas retirer.
    let source: RepostPostSourceWrapper

    @ObservedObject var viewModel: StoryViewModel

    /// Referme la porte. Appelée à la publication comme à l'abandon : c'est
    /// l'hôte qui possède l'état de présentation, pas cette vue.
    let onFinish: () -> Void

    /// **Le format sur lequel la porte OUVRE** (#5055). `nil` — le geste
    /// « Republier » — ouvre sur celui de la source, une story.
    ///
    /// `.post` est le geste « Éditer et republier en post » du menu, qui a DIT
    /// son format : le lui redemander serait lui faire répéter son choix.
    /// L'éventail reste peint dans les deux cas — pré-rempli, jamais verrouillé.
    var opening: ComposerFormat? = nil

    /// L'aperçu monté DANS la porte, exactement comme `StoryComposerCover` le
    /// fait pour le tray : il se superpose au composer et lui rend la main à la
    /// fermeture, sans démonter la session.
    @State private var previewAssets: StoryPreviewAssets?

    @EnvironmentObject private var router: Router
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        MeeshyComposerHost(
            // `sourceFormat: .story` — le format d'un repost MIROITE celui de
            // sa source, et la table y ajoute `.post` : l'ANCRAGE, « garder la
            // chose pour de bon ». L'éphémère reste éphémère par défaut.
            intent: ComposerIntent(origin: .repost(ofPostId: source.story.id,
                                                   sourceFormat: .story),
                                   opening: opening),
            // La porte passe l'audience de la source ; le meuble la relira de
            // toute façon par l'hydratation, qui a le dernier mot. Les DEUX
            // disent la même chose, et c'est voulu : le paramètre est requis, et
            // y écrire autre chose serait une seconde vérité.
            initialVisibility: source.story.visibility ?? PostVisibility.private.rawValue,
            hydration: .repostingStory(source.story, authorHandle: source.authorHandle),
            onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                // `repostOfId` descend jusqu'à `createStory` par la file de
                // publication : sans lui la republication naîtrait sans lien
                // vers son original, donc sans attribution ni crédit de vues.
                // Il voyage par CAPTURE — c'est le point 2 ci-dessus.
                viewModel.publishStoryInBackground(
                    targetType: targetType,
                    slides: slides,
                    slideImages: slideImages,
                    loadedImages: loadedImages,
                    loadedVideoURLs: loadedVideoURLs,
                    loadedAudioURLs: loadedAudioURLs,
                    originalLanguage: originalLanguage,
                    visibility: visibility,
                    visibilityUserIds: visibilityUserIds,
                    draftId: draftId,
                    repostOfId: source.story.id,
                    references: references,
                    composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                           caption: accessibility.mediaCaption ?? [:]),
                    allowSoundExtraction: accessibility.allowSoundExtraction
                )
                onFinish()
                // La création accepte TOUJOURS : hors-ligne, la story part en
                // file d'attente au lieu de rester dans le composeur — même
                // contrat que la publication nominale.
                return true
            },
            onPublishDocument: { draft in
                // **L'ANCRAGE EN POST** — la moitié que l'atelier nu ne pouvait
                // pas servir. L'auteur bascule l'éventail sur « Post » et la
                // republication devient permanente.
                //
                // **Il ne part PAS par la file durable, et ce n'est pas un
                // choix de confort.** `ComposerDocumentSendRouting.path(isQuote:
                // true, …)` rend un chemin NON durable, que
                // `ComposerDocumentSendPlan` REFUSE plutôt que de le laisser
                // partir par une voie que rien ne rejoue. Y brancher la flèche
                // — ce que faisait la première version de cette porte, par
                // symétrie avec celle du tray — affichait « Échec de la
                // publication » et ne publiait rien.
                //
                // La symétrie était trompeuse : la porte du tray part d'une
                // ARDOISE (`repostedPostId` y vaut `nil`), donc son brouillon
                // n'est jamais une citation. Celle-ci en porte toujours une.
                //
                // > Rendre une option ATTEIGNABLE, c'est hériter de tout son
                // > aval. Suivre la valeur jusqu'à sa surface ne suffit pas ;
                // > il faut la suivre jusqu'à son PUBLIEUR.
                await ancrer(draft)
            },
            // Aucune humeur : republier une story ne passe jamais par la grille
            // d'humeurs. Écrit en toutes lettres — le paramètre n'a pas de
            // défaut, précisément pour qu'une porte ne puisse pas le perdre en
            // silence.
            moodSeed: nil,
            // Ni graine de média : le contenu vient de l'HYDRATATION, qui est
            // une autre chose. Une graine POSE sur une page blanche ;
            // l'hydratation EST la page.
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
            // Les objets d'environnement ne descendent PAS à travers un
            // `fullScreenCover` — la remarque est écrite noir sur blanc dans
            // `StoryViewerView` (« from the parent fullScreenCover are NOT
            // inherited automatically »). Les reposer ici n'est pas une
            // ceinture-bretelle : sans eux, l'aperçu planterait à la première
            // lecture d'un de ces trois modèles.
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
        }
    }

    /// **Ancrer une republication en POST** — `POST /posts/:id/repost`, le seul
    /// chemin qui préserve le lien vers l'original.
    ///
    /// Ce que le lien porte, et qu'un post ordinaire perdrait : l'attribution à
    /// l'auteur d'origine et le crédit de vues. Une republication qui part sans
    /// lui n'est pas « un post de plus » — c'est le contenu de quelqu'un
    /// d'autre, republié sous le nom du republieur.
    ///
    /// `RepostIntent.quoted` décide seul de ce qu'est une CITATION : un
    /// commentaire vide ou blanc n'en est pas une, et l'aplatir ici en ferait
    /// une quatrième écriture d'une règle qui vit chez lui depuis qu'elle a été
    /// rassemblée. Côté serveur, `isQuote` décide où s'enracinent les
    /// réactions ; se tromper de forme les rattacherait au mauvais post.
    ///
    /// - Returns: `false` sur un refus, ce qui LAISSE le composer ouvert avec sa
    ///   saisie. Rendre `true` fermerait la porte sur une publication qui n'a
    ///   pas eu lieu — l'asymétrie exacte que `ComposerDocumentDurablePublisher`
    ///   documente pour son propre `Bool`.
    @MainActor
    private func ancrer(_ draft: ComposerDocumentDraft) async -> Bool {
        // La source vient du brouillon, que le meuble a semé depuis l'intention
        // (`intent.origin.repostedPostId`). La relire sur `source.story.id`
        // donnerait la même valeur aujourd'hui et serait une SECONDE source
        // pour un même fait — celle qui survivrait à une divergence.
        guard let postId = draft.repostOfId else { return refuser() }
        do {
            try await RepostPublisher.shared.publish(
                .quoted(
                    postId: postId,
                    targetType: .post,
                    comment: draft.text,
                    visibility: draft.visibility.rawValue
                )
            )
            FeedbackToastManager.shared.show(
                String(localized: "story.publish.success", defaultValue: "Publié", bundle: .main))
            onFinish()
            return true
        } catch {
            return refuser()
        }
    }

    /// Un refus qui se DIT — même raison, mot pour mot, que celui des deux
    /// publieurs de document : rendre `false` sans rien dire laisse l'auteur
    /// devant une flèche qui semble ne rien faire, et il la presse encore.
    @MainActor
    private func refuser() -> Bool {
        FeedbackToastManager.shared.showError(
            String(localized: "story.publish.error", defaultValue: "Échec de la publication", bundle: .main))
        return false
    }
}
