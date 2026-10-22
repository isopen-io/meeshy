import SwiftUI
import os
import MeeshySDK
import MeeshyUI

/// Reactive wrapper that shows a loading state until storyGroups are available,
/// then seamlessly transitions to StoryViewerView. Solves the race condition
/// where the fullScreenCover opens before async loadStories() completes.
///
/// Defensive behavior:
/// - Re-fetches if the requested userId is NOT present in storyGroups (not only when empty)
/// - Re-runs on userId change via .task(id:)
/// - After a short timeout, surfaces a Retry + Close fallback to avoid infinite loading
struct StoryViewerContainer: View {
    @ObservedObject var viewModel: StoryViewModel
    /// Threadée EXPLICITEMENT vers la `ConnectionBanner` interne, qui la prend
    /// optionnelle. Lue par VALEUR d'environnement (#7006), jamais en
    /// `@EnvironmentObject` : l'objet abonnait la racine du lecteur à chaque
    /// `typing:start/stop` et à chaque message de n'importe quelle conversation.
    /// Les `EnvironmentValues` traversent le `.fullScreenCover` de ses quatre
    /// points de montage ; `nil` ne fait que priver la bannière de la frappe.
    @Environment(\.meeshyConversationList) private var conversationListViewModel
    /// Idem : certains points de montage (`RootView`, `iPadRootView+Sheets`)
    /// ré-injectent `.environment(\.isStoryViewerPresenting, true)` sur ce
    /// même cover précisément pour que la pill interne se masque — threadée
    /// explicitement pour préserver ce comportement exact.
    @Environment(\.isStoryViewerPresenting) private var isStoryViewerPresenting
    let userId: String?
    @Binding var isPresented: Bool
    var onReplyToStory: ((ReplyContext) -> Void)? = nil
    var singleGroup: Bool = false
    /// R4 inc.2 — id exact du post story quand le point d'entrée le connaît
    /// (bookmark, notification, deep link) : permet un fetch unitaire léger
    /// si le tray ignore le groupe, au lieu du refetch full-tray bloquant.
    /// `nil` conserve le comportement historique.
    var postId: String? = nil
    var initialStoryIndex: Int = 0
    /// Forwarded to `StoryViewerView` : ouvre le viewer sur la première story
    /// non vue (points d'entrée « toucher le profil / avatar / tray »).
    var startAtFirstUnviewed: Bool = false
    var presentationSource: String = "unknown"
    /// Phase F: forwarded to `StoryViewerView` so a notification-launched
    /// viewer can auto-open the comments overlay or viewers sheet on appear.
    /// `nil` keeps every legacy entry point on the existing path.
    var initialAction: StoryViewerInitialAction? = nil
    /// Commentaire ciblé par la notification (scroll dans l'overlay) + parent
    /// (repli de scroll pour une réponse en thread). Forwardés au viewer.
    var targetCommentId: String? = nil
    var targetParentCommentId: String? = nil

    @State private var timedOut = false
    @State private var reloadAttempts = 0
    /// R4 inc.2b — bloque le rendu de `StoryViewerView` tant que le `postId`
    /// notifié n'a pas été confirmé frais (voir
    /// `StoryViewModel.refreshFromCachedPostIfAvailable` et
    /// `isGroupReadyToPresent` plus bas). Sans ce verrou, le premier rendu
    /// bascule sur `StoryViewerView` dès que `groupIndex(forUserId:)` existe
    /// — y compris à la TOUTE PREMIÈRE évaluation, AVANT que `.task(id:)`
    /// n'ait eu la moindre chance de tourner (une `Task` non structurée
    /// créée par `.task` ne s'exécute jamais de façon synchrone avec le
    /// rendu qui l'a déclenchée). `StoryActionSidebarView` gèle son rail
    /// d'actions à son PREMIER `.onAppear`, qui ne se redéclenche JAMAIS sur
    /// une simple mise à jour de données (identité de vue préservée) — donc
    /// un montage prématuré fige le bug pour toute la lecture du slide.
    /// `nil` tant que non vérifié pour ce `postId` précis.
    @State private var freshnessCheckedPostId: String?

    /// **La cible que « Composer » ouvrira** (#6085). Elle vit ICI, la racine
    /// STABLE du cover, et non dans l'en-tête qui porte l'entrée de menu — voir
    /// la remarque au site de présentation, plus bas.
    @State private var composeSeedTarget: ComposerSeedTarget?
    /// L'instant d'ouverture, figé : une story qui expire PENDANT qu'on la
    /// regarde garde sa barre, sinon l'index courant glisserait sur sa voisine
    /// (#7887).
    @State private var presentedAt = Date()
    /// Le lecteur a été monté une fois. Si le groupe qui l'a ouvert disparaît
    /// ensuite (toutes ses stories supprimées ou expirées pendant qu'on regarde
    /// un autre auteur), `groupIndex(forUserId:)` rend `nil` : le conteneur
    /// tombait sur le spinner de chargement, que rien ne relançait — l'écran
    /// restait bloqué avec le seul bouton Fermer. Il se referme.
    @State private var hasPresentedViewer = false

    private var uid: String { userId ?? "" }

    /// Pur, testable sans hôte SwiftUI (parité `StoryViewerScope.resolve`) —
    /// `nonisolated` car le target app compile en `defaultIsolation
    /// MainActor` : sans ce modificateur le bundle de tests (nonisolated)
    /// ne peut ni appeler cette fonction ni en lire le résultat.
    nonisolated static func isGroupReadyToPresent(
        groupExists: Bool,
        postId: String?,
        freshnessCheckedPostId: String?
    ) -> Bool {
        guard groupExists else { return false }
        guard let postId else { return true }
        return freshnessCheckedPostId == postId
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if Self.isGroupReadyToPresent(
                groupExists: viewModel.groupIndex(forUserId: uid) != nil,
                postId: postId,
                freshnessCheckedPostId: freshnessCheckedPostId
            ), let resolvedIndex = viewModel.groupIndex(forUserId: uid) {
                let liveGroups = StoryViewerScope.liveOnly(
                    viewModel.storyGroups,
                    authorId: AuthManager.shared.currentUser?.id,
                    keeping: postId,
                    now: presentedAt
                )
                let resolvedStoryIndex = StoryViewerScope.storyIndex(
                    StoryIndexResolver.index(
                        forPostId: postId,
                        in: viewModel.storyGroups[resolvedIndex],
                        fallback: initialStoryIndex
                    ),
                    from: viewModel.storyGroups[resolvedIndex],
                    into: liveGroups[resolvedIndex]
                )
                // UN SEUL site de présentation. Les deux branches d'avant
                // (mono-auteur / inter-auteurs) répétaient dix arguments et
                // avaient fini par diverger : la mono-auteur avait perdu
                // `onReplyToStory`, si bien qu'ouvrir une story depuis une
                // conversation — qui passe pourtant le callback — n'affichait
                // aucun bouton « Répondre ». Seule la PORTÉE change désormais.
                let scope = StoryViewerScope.resolve(
                    all: liveGroups,
                    resolvedIndex: resolvedIndex,
                    singleGroup: singleGroup
                )
                StoryViewerView(
                    viewModel: viewModel,
                    groups: scope.groups,
                    currentGroupIndex: scope.currentIndex,
                    isPresented: $isPresented,
                    onReplyToStory: onReplyToStory,
                    initialStoryIndex: resolvedStoryIndex,
                    startAtFirstUnviewed: startAtFirstUnviewed,
                    initialAction: initialAction,
                    targetCommentId: targetCommentId,
                    targetParentCommentId: targetParentCommentId
                )
                .transition(.identity)
                .onAppear { hasPresentedViewer = true }
                // **La porte « Composer » est PRÉSENTÉE ICI** (#6085), et pas
                // dans l'en-tête qui porte son entrée de menu.
                //
                // Deux raisons, et la seconde décide :
                //  1. le lecteur est présenté en `fullScreenCover`, que
                //     l'environnement de l'hôte ne traverse pas — c'est déjà
                //     pourquoi chaque site remet à la main les trois modèles que
                //     `StoryViewerView` déclare ;
                //  2. **l'en-tête est reconstruit à chaque tick de la barre de
                //     progression** : un `@State` de cible y meurt entre le tap
                //     du menu et la passe suivante. Mesuré au simulateur —
                //     l'entrée s'affichait, le tap posait la cible, et rien ne
                //     s'ouvrait. Ce conteneur, lui, est la racine STABLE du
                //     cover : il tient l'état, l'en-tête ne fait que DEMANDER.
                .environment(\.meeshyComposeSeedRequest, { composeSeedTarget = $0 })
            } else if hasPresentedViewer {
                Color.clear.onAppear { isPresented = false }
            } else if timedOut {
                notFoundOverlay
            } else {
                loadingOverlay
            }

            // Connection status banner (banner manages its own socket observation)
            ConnectionBanner(conversationListViewModel: conversationListViewModel, isStoryViewerPresenting: isStoryViewerPresenting)
                .inSyncPillBand()
                .allowsHitTesting(false)
        }
        .task(id: uid) {
            timedOut = false
            freshnessCheckedPostId = nil
            await ensureGroupAvailable(uid: uid)
        }
        // **Le lecteur affiche SES PROPRES retours** (#4876).
        //
        // Il en lève six — « Publié », « Échec de la publication », « Republié
        // dans ton feed », et trois refus de repost — et il est présenté en
        // `fullScreenCover`. Or l'hôte qui les rend était monté sur la RACINE
        // (`MeeshyApp`) : un `fullScreenCover` s'affiche au-dessus de tout, y
        // compris de cet overlay. Les six se levaient donc DERRIÈRE l'écran.
        //
        // > Quatre des six sont des REFUS. Un refus muet ne se lit pas « ça a
        // > échoué » mais « le bouton ne marche pas » — et l'utilisateur
        // > recommence. Le geste était juste, à la bonne place, avec sa raison
        // > écrite ; c'est la couche d'AFFICHAGE qui le rendait sans effet.
        //
        // Posé ici et pas sur `StoryViewerView` : ce conteneur est le point de
        // montage UNIQUE du lecteur (`StoryViewerCoordinator` le présente en
        // `.fullScreenCover(item:)`), donc un seul site couvre tous les points
        // d'entrée — la trail, une conversation, une notification.
        //
        // Trouvé en portant au lecteur la mesure qu'une session voisine venait
        // de faire sur le composer : si quelque chose se présente en
        // `fullScreenCover` et peut lever un retour, la question est **qui
        // l'AFFICHE, depuis là-dessous ?**
        .feedbackToastOverlay()
        // Une conversation qui s'ouvre referme le lecteur (#10539) — et, avec
        // lui, ce qu'il a présenté : commentaires, profil, partage.
        .closesForConversationOpening(.storyViewer, close: { isPresented = false })
        // **La porte COMMUNE** (#6085) : la même que le message reçu et que les
        // deux pleins écrans du fil. Trois surfaces, un montage — l'envoi, la
        // reprise hors-ligne et la sortie n'ont qu'une écriture.
        //
        // Aucun aperçu : il monterait un SECOND lecteur de stories par-dessus
        // celui-ci. DETTE NOMMÉE, la même que `ShareComposeDoor`.
        .fullScreenCover(item: $composeSeedTarget) { cible in
            MediaComposerDoor(
                target: cible,
                storyViewModel: viewModel,
                preview: nil,
                onDismiss: { composeSeedTarget = nil }
            )
        }
    }

    // MARK: - Loading / Fallback UI

    private var loadingOverlay: some View {
        ZStack {
            VStack(spacing: MeeshySpacing.lg) {
                ProgressView()
                    .tint(MeeshyColors.mediaChromeForeground)
                    .scaleEffect(1.3)
                Text(String(localized: "story.viewer.loading", defaultValue: "Chargement…", bundle: .main))
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
                    .font(.subheadline)
            }

            closeButton
        }
    }

    private var notFoundOverlay: some View {
        ZStack {
            VStack(spacing: MeeshySpacing.lg) {
                Image(systemName: "exclamationmark.circle")
                    // Doctrine 84i/86i : glyphe hero d'etat d'erreur (~38pt, decoratif) → fige ;
                    // le titre ci-dessous porte le sens. Masque de VoiceOver.
                    .font(.system(size: 38, weight: .regular))
                    .foregroundColor(MeeshyColors.mediaChromeSecondary)
                    .accessibilityHidden(true)

                Text(String(localized: "story.viewer.notFound.title", defaultValue: "Story introuvable", bundle: .main))
                    .foregroundColor(MeeshyColors.mediaChromeForeground)
                    .font(.headline)

                Text(String(localized: "story.viewer.notFound.description", defaultValue: "Impossible de charger cette story. Réessayez ou fermez.", bundle: .main))
                    .multilineTextAlignment(.center)
                    .foregroundColor(MeeshyColors.mediaChromeTertiary)
                    .font(.footnote)
                    .padding(.horizontal, MeeshySpacing.xxxl)

                HStack(spacing: MeeshySpacing.md) {
                    Button {
                        Task { await retryFetch(uid: uid) }
                    } label: {
                        Text(String(localized: "story.viewer.retry", defaultValue: "Réessayer", bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.xl)
                            .padding(.vertical, MeeshySpacing.smPlus)
                            .background(Capsule().fill(MeeshyColors.brandGradient))
                    }

                    Button {
                        isPresented = false
                    } label: {
                        Text(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(MeeshyColors.mediaChromeForeground)
                            .padding(.horizontal, MeeshySpacing.xl)
                            .padding(.vertical, MeeshySpacing.smPlus)
                            .background(Capsule().stroke(Color.white.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.regular))
                    }
                }
                .padding(.top, MeeshySpacing.sm)
            }
            .padding(MeeshySpacing.xxl)

            closeButton
        }
    }

    private var closeButton: some View {
        VStack {
            FullscreenTopBar(onClose: { isPresented = false })
            Spacer()
        }
    }

    // MARK: - Fetch logic

    /// Ensures the requested user's story group is available.
    /// Fetches if missing, waits briefly for it to appear, then surfaces a
    /// not-found fallback instead of looping forever.
    private func ensureGroupAvailable(uid: String) async {
        if uid.isEmpty {
            Logger.messages.error("[StoryViewerContainer] Opened with empty uid source=\(presentationSource, privacy: .public) — marking as not found")
            timedOut = true
            return
        }

        // R4 inc.2b — quand le point d'entrée connaît le postId exact
        // (notification), rafraîchit D'ABORD depuis le cache SDK déjà chaud
        // (fetch fait par `StoryNotificationTargetViewModel.load()` quelques
        // ms plus tôt) — AVANT le court-circuit « groupe déjà présent »
        // ci-dessous, qui sinon laisserait le premier rendu (voir
        // `isGroupReadyToPresent`) monter le viewer sur un compteur périmé.
        // Purement local (lecture de cache, aucun réseau) : n'ajoute aucune
        // latence au chemin normal, sans notification (`postId == nil`).
        if let postId {
            viewModel.refreshFromCachedPostIfAvailable(postId: postId)
            freshnessCheckedPostId = postId
        }

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        Logger.messages.info("[StoryViewerContainer] Group missing uid=\(uid, privacy: .public) source=\(presentationSource, privacy: .public) groupCount=\(viewModel.storyGroups.count) availableIds=\(viewModel.storyGroups.map(\.id).joined(separator: ","), privacy: .public)")

        // R4 — Cache-first (mission produit n°2 : jamais de spinner si un rendu
        // partiel est possible) : un deep link / une notification à froid arrive
        // AVANT le `loadStories` du boot — le tray du cache 24 h contient très
        // probablement le groupe. `loadStories()` le sert immédiatement
        // (`.fresh` → zéro réseau ; `.stale` → servi + refetch silencieux) et
        // le body réactif monte le viewer sans spinner plein écran.
        await viewModel.loadStories()

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        // R4 inc.2 — le cache ignore ce groupe mais le point d'entrée connaît
        // le post exact : fetch unitaire léger (GET /posts/:id) AVANT le
        // full-tray. Ne court-circuite que si le groupe du uid demandé est
        // bien monté (un postId d'un autre auteur retombe sur le full fetch).
        if let postId {
            _ = await viewModel.ensureStoryLoaded(postId: postId)
            if viewModel.groupIndex(forUserId: uid) != nil { return }
        }

        // Le cache ne connaît pas ce groupe (story récente d'un contact, tray
        // périmé) : refetch réseau complet — comportement historique conservé.
        await viewModel.loadStories(forceNetwork: true)

        if viewModel.groupIndex(forUserId: uid) != nil { return }

        // Give the view a moment for published updates to settle, then give up.
        _ = await cancellableSleep(for: .milliseconds(2500)) // 2.5s
        if !Task.isCancelled, viewModel.groupIndex(forUserId: uid) == nil {
            Logger.messages.error("[StoryViewerContainer] Group still missing after reload uid=\(uid, privacy: .public) availableIds=\(viewModel.storyGroups.map(\.id).joined(separator: ","), privacy: .public)")
            timedOut = true
        }
    }

    private func retryFetch(uid: String) async {
        reloadAttempts += 1
        timedOut = false
        await ensureGroupAvailable(uid: uid)
    }
}

// MARK: - Le couvercle UNIQUE du lecteur (#11197)

/// **Le seul endroit qui monte le lecteur de stories.** Chaque hôte qui peut
/// présenter — les trois racines par leur coordinateur, la conversation, les
/// favoris — pose CE modificateur sur une `StoryViewerRequest`, et rien
/// d'autre : le point d'appel dit QUOI lire, jamais COMMENT le monter.
///
/// Six `fullScreenCover` recopiaient `StoryViewerContainer(` à la main, et les
/// copies avaient divergé : les favoris n'offraient pas « Répondre », la
/// conversation ne posait pas `isStoryViewerPresenting` (la pastille de
/// synchronisation chevauchait l'en-tête du lecteur), l'iPad gardait un
/// couvercle que rien n'ouvrait.
///
/// Pourquoi un modificateur que chaque hôte monte, et pas le seul coordinateur
/// de la racine : la conversation vit aussi dans une FEUILLE (aperçu de
/// notification) et hors de toute racine (invité). Un couvercle de racine ne
/// peut pas se présenter par-dessus une feuille déjà présentée ; le lecteur se
/// monte donc chez l'hôte qui l'appelle — mais c'est le même lecteur, monté
/// par le même code.
///
/// Les dépendances arrivent en PARAMÈTRES et non par `@EnvironmentObject` : à la
/// racine, ce modificateur peut se poser hors de la couche qui les injecte.
struct StoryReaderCover: ViewModifier {
    @Binding var request: StoryViewerRequest?
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let router: Router
    let conversationList: ConversationListViewModel?
    let presentationSource: String
    var zoomNamespace: Namespace.ID? = nil
    /// `true` chez la conversation : le lecteur la COUVRE (« est dans la
    /// conversation » s'éteint, #9052) et se ferme quand une autre s'ouvre.
    var coversConversation = false
    /// Ce que fait « Répondre » une fois le lecteur fermé. `nil` ⇒ pas de bouton.
    let onReply: ((ReplyContext) -> Void)?

    @ViewBuilder
    func body(content: Content) -> some View {
        if coversConversation {
            content.conversationCover(item: $request) { reader(for: $0) }
        } else {
            content.fullScreenCover(item: $request) { reader(for: $0) }
        }
    }

    private func reader(for presented: StoryViewerRequest) -> some View {
        StoryViewerContainer(
            viewModel: storyViewModel,
            userId: presented.id,
            isPresented: Binding(get: { request != nil }, set: { if !$0 { request = nil } }),
            onReplyToStory: replyHandler,
            singleGroup: presented.singleGroup,
            postId: presented.postId,
            initialStoryIndex: presented.initialStoryIndex,
            startAtFirstUnviewed: presented.startAtFirstUnviewed,
            presentationSource: presentationSource,
            initialAction: presented.initialAction,
            targetCommentId: presented.targetCommentId,
            targetParentCommentId: presented.targetParentCommentId
        )
        // Un `fullScreenCover` n'hérite pas des EnvironmentObject : le trio que
        // `StoryViewerView` déclare (feuille de partage interne) est remis ici,
        // une fois pour tous les points d'appel.
        .modifier(MeeshyRouterInjection(router: router))
        .environmentObject(statusViewModel)
        .conversationListObject(conversationList)
        .environment(\.meeshyConversationList, conversationList)
        // La pastille de synchronisation se masque sous le lecteur (2026-05-27).
        .environment(\.isStoryViewerPresenting, true)
        // Zoom depuis la bulle du tray quand elle est enregistrée (iOS 18+),
        // cover standard sinon.
        .zoomTransitionDestination(sourceID: presented.id, in: zoomNamespace)
    }

    private var replyHandler: ((ReplyContext) -> Void)? {
        guard let onReply else { return nil }
        let request = $request
        return { context in
            request.wrappedValue = nil
            onReply(context)
        }
    }
}

// MARK: - L'aperçu d'une publication, par LE lecteur (#11197)

/// L'aperçu d'un composer est rendu par le LECTEUR (`StoryViewerView` en mode
/// aperçu), jamais par un composant maison — loi 6 : un autre chemin d'aperçu
/// mentirait tôt ou tard sur ce qui sera publié. Cinq portes recopiaient ce
/// montage à l'identique ; il vit ici, à côté du couvercle de lecture.
struct StoryPreviewReader: View {
    let assets: StoryPreviewAssets
    @Binding var isPresented: Bool
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let router: Router
    let conversationList: ConversationListViewModel?

    var body: some View {
        StoryViewerView(
            viewModel: storyViewModel,
            groups: [Self.group(of: assets)],
            currentGroupIndex: 0,
            isPresented: $isPresented,
            isPreviewMode: true,
            preloadedImages: assets.loadedImages.merging(assets.backgroundImages) { fg, _ in fg },
            preloadedVideoURLs: assets.videoURLs,
            preloadedAudioURLs: assets.audioURLs
        )
        // Les objets d'environnement ne traversent pas un `fullScreenCover` :
        // sans eux, l'aperçu planterait à la première lecture de l'un d'eux.
        .modifier(MeeshyRouterInjection(router: router))
        .conversationListObject(conversationList)
        .environmentObject(statusViewModel)
    }

    static func group(of assets: StoryPreviewAssets) -> StoryGroup {
        StoryGroup(
            id: "preview",
            username: String(localized: "story.preview.username", defaultValue: "Aperçu", bundle: .main),
            avatarColor: MeeshyColors.brandPrimaryHex,
            stories: assets.slides.map { $0.toPreviewStoryItem() }
        )
    }
}

/// Présente l'aperçu d'un composer sur `assets` ; à la fermeture, le canvas du
/// composer retrouve son son.
struct StoryPreviewReaderCover: ViewModifier {
    @Binding var assets: StoryPreviewAssets?
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let router: Router
    let conversationList: ConversationListViewModel?

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $assets, onDismiss: {
            NotificationCenter.default.post(name: .storyComposerUnmuteCanvas, object: nil)
        }) { presented in
            StoryPreviewReader(
                assets: presented,
                isPresented: Binding(get: { assets != nil }, set: { if !$0 { assets = nil } }),
                storyViewModel: storyViewModel,
                statusViewModel: statusViewModel,
                router: router,
                conversationList: conversationList
            )
        }
    }
}
