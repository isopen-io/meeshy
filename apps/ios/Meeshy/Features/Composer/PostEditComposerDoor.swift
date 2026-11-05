import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une publication rouverte pour être MODIFIÉE** (#9333) : le ViewModel de
/// scène hydraté sur elle, et ce qu'elle était à l'ouverture.
///
/// La scène ouverte est gardée telle quelle (`openedSlides`) : c'est à elle que
/// l'enregistrement compare la scène courante pour savoir quel média l'auteur a
/// retiré, et s'il a remanié autre chose.
struct PostEditComposerSession: Identifiable {
    let post: FeedPost
    let composer: StoryComposerViewModel
    let baseline: PostEditBaseline
    let openedSlides: [StorySlide]
    let seed: ComposerPublicationEditSeed
    var id: String { post.id }

    /// Le texte du post vit dans le DOCUMENT (`seed.text`), jamais sur la
    /// slide : posé aux deux, il se peindrait deux fois et un réel le
    /// publierait en double (`ReelPublishedContent`).
    init(post: FeedPost, defaultLanguage: String = DefaultComposerLanguage.resolve()) {
        self.post = post
        let story = StoryItem(id: post.id, content: nil, media: post.media, storyEffects: post.storyEffects,
                              createdAt: post.timestamp, visibility: post.visibility,
                              visibilityUserIds: post.visibilityUserIds, mentions: post.mentions)
        composer = PublicationEditComposer.composer(editing: story)
        baseline = PostEditBaseline(post: post, defaultLanguage: defaultLanguage)
        openedSlides = composer.slides
        seed = ComposerPublicationEditSeed(text: post.content, visibility: baseline.visibility.rawValue,
                                           visibilityUserIds: baseline.visibilityUserIds,
                                           language: baseline.language, location: post.location,
                                           baseline: baseline,
                                           quoted: post.repost.map(ComposerQuotedPublication.init(repost:)))
    }

    /// La porte que le meuble lit : un repost l'y déclare, et l'éventail se
    /// referme sur son seul format.
    var origin: ComposerOrigin {
        .edit(postId: baseline.postId, documentFormat: baseline.format, isRepost: baseline.isRepost)
    }
}

/// **La porte d'ÉDITION d'un post ou d'un réel** — le meuble qui l'a créé,
/// rouvert sur lui (#9333).
///
/// Elle ne publie rien : la flèche lui remet un brouillon de DOCUMENT, que
/// `PostEditComposerSave` traduit en requête de modification, et que l'HÔTE
/// exécute (`onSave`). Une scène remaniée part avec son canevas ; des médias
/// NEUFS se téléversent d'abord, en arrière-plan comme ceux d'une story
/// modifiée (`updateStoryInBackground`), puis la requête part avec leurs ids.
struct PostEditComposerDoor: View {

    let session: PostEditComposerSession
    @ObservedObject var storyViewModel: StoryViewModel
    let onSave: @MainActor (EditPostDraft) async -> Void
    let onFinish: () -> Void

    /// L'œil du socle — même raison que `StoryEditComposer` : le brancher sur
    /// une fermeture vide armerait un contrôle inerte (loi 4).
    @State private var previewAssets: StoryPreviewAssets?
    /// Une modification part UNE fois : un choix à plusieurs formats remet un
    /// brouillon par format, et le second réécrirait le premier.
    @State private var saved = false

    @Environment(\.meeshyRouter) private var router
    @Environment(\.meeshyConversationList) private var conversationListViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel

    var body: some View {
        composerHost
            .task {
                // Les références DÉCLARÉES ne partent que si l'ensemble servi a
                // été relu — même contrat que `StoryEditComposer` : renvoyer la
                // liste amputée du fil révoquerait les mentions silencieuses.
                guard let served = await storyViewModel.fetchDeclaredReferences(postId: session.post.id) else { return }
                session.composer.adoptDeclaredReferences(served)
            }
            .modifier(PostEditPreviewCover(assets: $previewAssets, storyViewModel: storyViewModel,
                                           statusViewModel: statusViewModel, router: router,
                                           conversationList: conversationListViewModel))
    }

    private var composerHost: some View {
        MeeshyComposerHost(
            intent: ComposerIntent(origin: session.origin),
            initialVisibility: session.seed.visibility,
            hydration: .editingPublication(session.composer, session.seed),
            // La scène ne publie pas ici : l'éventail n'offre ni story ni
            // canal de scène, et un `true` créerait une publication NEUVE en
            // croyant modifier l'existante.
            onPublishAllInBackground: { _, _, _, _, _, _, _, _, _, _, _, _, _ in
                refuse(.notADocumentFormat)
            },
            onPublishDocument: { draft in await save(draft) },
            moodSeed: nil,
            mediaSeed: nil,
            onPreview: { slides, images, loadedImgs, videoURLs, audioURLs in
                previewAssets = StoryPreviewAssets(slides: slides, backgroundImages: images, loadedImages: loadedImgs,
                                                   videoURLs: videoURLs, audioURLs: audioURLs)
            },
            onDismiss: onFinish
        )
    }

    private func save(_ draft: ComposerDocumentDraft) async -> Bool {
        guard !saved else { return refuse(.notADocumentFormat) }
        switch PostEditComposerSave.outcome(draft: draft, baseline: session.baseline,
                                            openedSlides: session.openedSlides, slides: session.composer.slides,
                                            knowsDeclaredReferences: session.composer.editingKnowsDeclaredReferences) {
        case .refuse(let raison):
            return refuse(raison)
        case .save(let modification):
            saved = true
            HapticFeedback.success()
            await onSave(modification)
            return true
        case .upload(let modification, let medias):
            guard !NetworkMonitor.shared.isOffline, let televerser = PostEditMediaUpload.tusSend() else {
                return refuse(.offline)
            }
            saved = true
            HapticFeedback.success()
            let enregistrer = onSave
            Task {
                do {
                    let rattachee = try await PostEditMediaUpload.resolve(modification, pending: medias, send: televerser)
                    await enregistrer(rattachee)
                } catch {
                    FeedbackToastManager.shared.showError(PostEditComposerCopy.uploadFailed)
                }
            }
            return true
        }
    }

    private func refuse(_ raison: PostEditComposerRefusal) -> Bool {
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(PostEditComposerCopy.refusal(raison))
        return false
    }
}

/// L'aperçu de l'œil, monté si le routeur est là — `MeeshyRouterInjection` le
/// pose aux deux racines ; sans lui l'aperçu ne s'ouvre pas, il ne trappe pas.
private struct PostEditPreviewCover: ViewModifier {
    @Binding var assets: StoryPreviewAssets?
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let router: Router?
    let conversationList: ConversationListViewModel?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let router {
            content.modifier(StoryPreviewReaderCover(assets: $assets, storyViewModel: storyViewModel,
                                                     statusViewModel: statusViewModel, router: router,
                                                     conversationList: conversationList))
        } else {
            content
        }
    }
}

nonisolated enum PostEditComposerCopy {
    static let uploadFailed = String(localized: "composer.edit.uploadFailed",
                                     defaultValue: "Les nouveaux médias n'ont pas pu être envoyés : la publication n'a pas changé",
                                     bundle: .main)

    static func refusal(_ raison: PostEditComposerRefusal) -> String {
        switch raison {
        case .offline:
            return String(localized: "composer.edit.refusal.offline",
                          defaultValue: "Connexion requise pour ajouter un média à la publication", bundle: .main)
        case .notADocumentFormat, .incompleteAudience, .tooLong, .empty:
            return String(localized: "composer.edit.refusal.generic",
                          defaultValue: "Cette modification ne peut pas être enregistrée", bundle: .main)
        }
    }
}
