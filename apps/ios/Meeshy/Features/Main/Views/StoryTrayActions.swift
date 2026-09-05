import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que la trail de stories déclenche (S5)
//
// Orchestration UX produit : app-side par nature (SDK purity). Trois choses y
// vivent, toutes issues du même constat — « ce que la trail déclenche » était
// décidé en ligne dans des closures non testables, dupliquées entre la grande
// trail et la mini-trail épinglée.

/// Destination du tap sur l'avatar « Moi ».
///
/// AVANT : la MÊME cible visuelle menait à deux destinations selon un état
/// invisible, et la destination « avec story » était une LISTE DE GESTION —
/// 2 taps et un écran interposé pour voir sa propre story. Le tap ouvre
/// désormais la story (alignement Instagram) ; la gestion reste accessible par
/// appui long.
nonisolated enum MyStoryAvatarAction: Equatable {
    case manageStories
    case createStory
}

/// Libellés de la trail, résolus par le catalogue `.main`. Ils vivaient comme
/// des littéraux français bruts dans les menus contextuels : invisibles au
/// cliquet de complétude, jamais traduits.
nonisolated enum StoryTrayCopy {
    static var viewMyStory: String {
        String(localized: "story.tray.menu.viewMyStory",
               defaultValue: "Voir ma story", bundle: .main)
    }
    static var createStory: String {
        String(localized: "story.tray.a11y.createStory",
               defaultValue: "Créer une story", bundle: .main)
    }
    static var manageStories: String {
        String(localized: "story.tray.menu.manage",
               defaultValue: "Gérer mes stories", bundle: .main)
    }
    static var addStory: String {
        String(localized: "story.tray.addStory",
               defaultValue: "Ajouter une story", bundle: .main)
    }
    static var changeMood: String {
        String(localized: "story.tray.a11y.changeMood",
               defaultValue: "Changer mon mood", bundle: .main)
    }
    static var viewStories: String {
        String(localized: "story.tray.menu.viewStories",
               defaultValue: "Voir les stories", bundle: .main)
    }
    static var viewProfile: String {
        String(localized: "story.tray.menu.profile",
               defaultValue: "Voir le profil", bundle: .main)
    }
}

nonisolated enum StoryTrayActionResolver {
    /// SUPERSESSION 2026-08-02 (directive user) : le tap sur l'avatar « Moi »
    /// ouvre la LISTE « Mes stories » — c'est elle qui porte les onglets
    /// Publiées / Brouillons, inaccessibles quand le tap lançait la lecture
    /// directe (direction du 2026-07-31, elle-même une supersession du
    /// 2026-07-14). La lecture directe reste offerte par « Voir ma story »
    /// au menu contextuel.
    ///
    /// Parité 2026-08-10 : un utilisateur SANS story active mais avec un
    /// historique entièrement expiré (`hasAnyStory`) tapait droit sur le
    /// composer — aucun chemin ne menait plus vers ses stories passées une
    /// fois toutes expirées. `hasMyStory` (au moins une story ACTIVE) reste
    /// prioritaire ; à défaut, `hasAnyStory` (au moins une story, active ou
    /// non) route vers la même liste de gestion plutôt que de forcer la
    /// création.
    static func avatarTap(hasMyStory: Bool, hasAnyStory: Bool) -> MyStoryAvatarAction {
        if hasMyStory { return .manageStories }
        if hasAnyStory { return .manageStories }
        return .createStory
    }

    /// Le libellé VoiceOver DÉCRIT la destination réelle. Il annonçait
    /// « Changer mon mood » alors que le tap ouvrait le composer : la même
    /// règle sert désormais au routage et à l'annonce, les deux ne peuvent
    /// plus diverger. Trois branches explicites (miroir d'`avatarTap`) plutôt
    /// qu'un switch sur son résultat à deux cas : les deux premières
    /// pourront un jour porter un libellé distinct sans réordonner la logique.
    static func avatarAccessibilityLabel(hasMyStory: Bool, hasAnyStory: Bool) -> String {
        if hasMyStory { return StoryTrayCopy.manageStories }
        if hasAnyStory { return StoryTrayCopy.manageStories }
        return StoryTrayCopy.createStory
    }
}

// MARK: - Chaînage déterministe de la sheet « Mes stories »

/// Intention posée PENDANT qu'une sheet se ferme, exécutée à la fin réelle du
/// dismiss. Remplace six `try? await Task.sleep(for: .milliseconds(350))` —
/// un pari sur la durée d'une animation système, payé par un gel d'un tiers de
/// seconde à chaque ouverture.
nonisolated struct DeferredSheetFollowUp<Action> {
    private var pending: Action?

    init() {}

    /// La dernière intention gagne : deux taps rapides ne doivent pas empiler
    /// deux présentations.
    mutating func schedule(_ action: Action) {
        pending = action
    }

    /// Retourne ET vide : une intention ne s'exécute jamais deux fois.
    mutating func consume() -> Action? {
        defer { pending = nil }
        return pending
    }
}

/// `StoryItem` n'est pas `Equatable` — cet enum ne l'est donc pas non plus.
nonisolated enum MyStoriesFollowUp {
    case openViewer(postId: String)
    case createStory
    case editStory(StoryItem)
    case resumeDraft(draftId: String)
}

// MARK: - Présentation ROOT-LEVEL du composer de création

/// Assets d'aperçu d'une story en cours de composition (« Aperçu » du header) —
/// rendus par le viewer en mode `isPreviewMode`, sans jamais toucher le réseau.
struct StoryPreviewAssets: Identifiable {
    let id = UUID()
    let slides: [StorySlide]
    let backgroundImages: [String: UIImage]
    let loadedImages: [String: UIImage]
    let videoURLs: [String: URL]
    let audioURLs: [String: URL]
}

/// Le composer de CRÉATION se présente au niveau racine, exactement comme le
/// viewer (`StoryViewerCoordinator`) — et pour la même raison.
///
/// Le cover était monté par `StoryTrayView`, elle-même instanciée par
/// `ConversationListView`, `FeedView` ET `RootViewComponents`. Sur iPhone la
/// feuille de feed est un OVERLAY : la liste de conversations reste montée
/// dessous, donc DEUX trays vivantes observent le même `@Published`
/// `showStoryComposer` et tentent la même présentation au même instant
/// (« Attempt to present … which is already presenting »). C'est exactement la
/// course que les `Task.sleep(350 ms)` masquaient ; `onDismiss` en règle la
/// SÉQUENCE (attendre la fin réelle d'un dismiss), ce montage unique en règle
/// l'UNICITÉ — les deux sont complémentaires, aucun ne remplace l'autre.
///
/// L'état de présentation reste `StoryViewModel.showStoryComposer` : c'est déjà
/// la source unique lue par les deux racines, le tray, le badge « + » et la
/// notification `.openStoryComposer`. Seul le point de MONTAGE change.
///
/// ## V3-2 — ce que le cover monte
///
/// Il monte le MEUBLE (`MeeshyComposerHost`), pas l'atelier nu. Le meuble est
/// la première porte de production du composer unifié : c'est lui qui lit la
/// table des portes (`ComposerIntent` / `ComposerProfile`), choisit sa surface
/// et enveloppe l'atelier du SDK.
///
/// Le cover ne garde donc que ce qui lui appartient VRAIMENT — l'état de
/// présentation, le câblage de publication vers `StoryViewModel`, et l'aperçu
/// qu'il superpose. Trois choses qu'il faisait et qu'il ne fait plus, chacune
/// parce que le meuble les fait déjà et qu'en faire deux est SILENCIEUX :
///
/// 1. **le ViewModel du composer** — le meuble en construit un et lui fait
///    adopter `draftId` dès sa construction. En fabriquer un second ici aurait
///    laissé le composer s'autosauvegarder sous un id neuf, le brouillon repris
///    restant intact à côté : le doublon que l'adoption existe pour éviter ;
/// 2. **les cinq fournisseurs d'environnement** (lieu, caméra, pellicule,
///    presse-papier, bibliothèque de stickers) — le meuble les pose au plus
///    près de l'atelier. Les reposer ici empilerait deux couches sur la même
///    clé d'environnement : la dernière gagne, sans erreur ni signal ;
/// 3. **l'audience mémorisée** reste passée, elle : elle traverse maintenant
///    DEUX maillons (porte → meuble → atelier) et le défaut du SDK
///    (`PostVisibility.friends`) l'avalerait sans un mot à n'importe lequel des
///    deux. `AppInitWireupTests` la suit maillon par maillon.
struct StoryComposerCover: ViewModifier {
    @ObservedObject var viewModel: StoryViewModel
    let router: Router
    let conversationListViewModel: ConversationListViewModel
    let statusViewModel: StatusViewModel
    /// Aperçu monté DANS le cover du composer : il se superpose au composer et
    /// lui rend la main à la fermeture, sans démonter la session d'édition.
    @State private var previewAssets: StoryPreviewAssets?

    func body(content: Content) -> some View {
        content.fullScreenCover(isPresented: $viewModel.showStoryComposer, onDismiss: {
            viewModel.pendingDraftId = nil
        }) {
            MeeshyComposerHost(
                intent: ComposerIntent(origin: .storyTray),
                initialVisibility: viewModel.lastComposerVisibility,
                draftId: viewModel.pendingDraftId,
                onPublishAllInBackground: { slides, slideImages, loadedImages, loadedVideoURLs, loadedAudioURLs, loadedStickerAnimations, originalLanguage, visibility, visibilityUserIds, draftId, references, accessibility, targetType in
                    viewModel.publishStoryInBackground(
                        targetType: targetType,
                        slides: slides,
                        slideImages: slideImages,
                        loadedImages: loadedImages,
                        loadedVideoURLs: loadedVideoURLs,
                        loadedAudioURLs: loadedAudioURLs,
                        loadedStickerAnimations: loadedStickerAnimations,
                        originalLanguage: originalLanguage,
                        visibility: visibility,
                        visibilityUserIds: visibilityUserIds,
                        draftId: draftId,
                        references: references,
                        composerMediaTexts: ComposerMediaTexts(alt: accessibility.mediaAlt ?? [:],
                                                               caption: accessibility.mediaCaption ?? [:]),
                        allowSoundExtraction: accessibility.allowSoundExtraction
                    )
                    // La création accepte TOUJOURS : hors-ligne, la story part
                    // en file d'attente au lieu de rester dans le composer.
                    return true
                },
                onPublishDocument: { draft in
                    // **Le refus est devenu un PUBLIEUR le 2026-09-01** (#4751).
                    //
                    // Il tenait par une prémisse qui a cessé d'être vraie :
                    // `.cameraReady` routait TOUJOURS vers la scène, donc le
                    // socle n'était jamais peint et cette fermeture jamais
                    // appelée. La garde qui en répondait
                    // (`MeeshyComposerHostGuardTests`) le disait en toutes
                    // lettres — « le jour où cette ouverture changerait, ce
                    // refus deviendrait une flèche qui ne publie rien, en
                    // silence » — et c'est ce jour-là.
                    //
                    // Le socle est atteint dès que l'auteur bascule l'éventail
                    // sur « Post » sans avoir rien posé sur la scène : la slide
                    // SEMÉE ne compte pas comme matière (`ComposerScenePresence`
                    // compte ce que la scène CONTIENT, pas ce qui l'a fait
                    // naître), donc `documentHasScene` est faux et le meuble
                    // monte le document.
                    //
                    // Ce cover n'a pas de `FeedViewModel` — aucune des deux
                    // racines qui l'appliquent n'en tient un. Le publieur
                    // durable est le chemin qui n'en demande pas ; il partage la
                    // règle d'envoi et la fabrique de charge avec la porte du
                    // fil, et n'omet que l'insertion optimiste, qu'aucun œil ne
                    // recevrait ici.
                    await ComposerDocumentDurablePublisher.publish(draft)
                },
                // La porte du tray ne sème AUCUN mood : elle n'atteint pas cette
                // surface, pour la raison ci-dessus. Écrit en toutes lettres
                // parce que le paramètre n'a pas de défaut — un défaut l'aurait
                // fait disparaître d'un site de republication, où son absence
                // transformerait la republication en mood neuf, sans un mot.
                moodSeed: nil,
                // Ni média : la création part d'une ARDOISE. Ce que l'auteur y
                // pose vient de la caméra, de la pellicule ou du presse-papier,
                // par les fournisseurs que le meuble installe — jamais d'une
                // graine. Écrit en toutes lettres, le paramètre n'ayant pas de
                // défaut.
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
                onDismiss: {
                    viewModel.showStoryComposer = false
                }
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
                .environmentObject(router)
                .environmentObject(conversationListViewModel)
                .environmentObject(statusViewModel)
            }
        }
    }
}

extension View {
    /// À n'appeler QUE depuis une racine (RootView / iPadRootView) : deux
    /// montages simultanés reproduiraient la course décrite sur
    /// `StoryComposerCover`.
    func storyComposerCover(
        viewModel: StoryViewModel,
        router: Router,
        conversationListViewModel: ConversationListViewModel,
        statusViewModel: StatusViewModel
    ) -> some View {
        modifier(StoryComposerCover(
            viewModel: viewModel,
            router: router,
            conversationListViewModel: conversationListViewModel,
            statusViewModel: statusViewModel
        ))
    }

    /// Montage UNIQUE de « Mes stories », partagé par la grande trail et la
    /// mini-trail épinglée (~90 lignes dupliquées auparavant, avec deux règles
    /// de chaînage distinctes).
    ///
    /// `onDismiss` est la primitive SwiftUI prévue pour ce cas exact : elle
    /// s'exécute après l'ACHÈVEMENT du dismiss, là où 350 ms n'étaient qu'un
    /// pari. Les trois callbacks n'exécutent donc plus l'action : ils
    /// l'enregistrent puis referment la sheet.
    ///
    /// `router` et `conversationListViewModel` sont réinjectés à travers la
    /// frontière de sheet : la sheet interne `SharePickerView` (« Transférer »)
    /// crasherait sinon sur un environment object manquant.
    func myStoriesSheet(
        isPresented: Binding<Bool>,
        followUp: Binding<DeferredSheetFollowUp<MyStoriesFollowUp>>,
        viewModel: StoryViewModel,
        userId: String,
        statusViewModel: StatusViewModel,
        router: Router,
        conversationListViewModel: ConversationListViewModel,
        perform: @escaping (MyStoriesFollowUp) -> Void
    ) -> some View {
        sheet(isPresented: isPresented, onDismiss: {
            if let action = followUp.wrappedValue.consume() { perform(action) }
        }) {
            MyStoriesView(
                viewModel: viewModel,
                userId: userId,
                statusViewModel: statusViewModel,
                onOpen: { story in
                    followUp.wrappedValue.schedule(.openViewer(postId: story.id))
                    isPresented.wrappedValue = false
                },
                onCreateStory: {
                    followUp.wrappedValue.schedule(.createStory)
                    isPresented.wrappedValue = false
                },
                onEditStory: { story in
                    followUp.wrappedValue.schedule(.editStory(story))
                    isPresented.wrappedValue = false
                },
                onResumeDraft: { draftId in
                    followUp.wrappedValue.schedule(.resumeDraft(draftId: draftId))
                    isPresented.wrappedValue = false
                }
            )
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
        }
    }
}
