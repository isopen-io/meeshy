#if DEBUG
import SwiftUI
import MeeshySDK

/// DEV-ONLY — éteint une CLASSE de crashs, pas un point.
///
/// Le premier rendu de `ConversationView` sur DEVICE en Debug déborde la pile
/// du main thread (1 Mo iOS) dans le décodeur de métadonnées Swift
/// (`swift_getTypeByMangledName` récursif, EXC_BAD_ACCESS dans la Stack
/// Guard) : cinq crashs au même mécanisme le 2026-07-30, dont trois fois la
/// matérialisation du KeyPath de la @Published `messages` (subscript
/// `_enclosingInstance`) via `headerAvatarView → topActiveMembersList`.
///
/// Deux étages, exécutés tôt au boot à pile COURTE (les caches de
/// métadonnées et de keypaths de libswiftCore sont globaux au process) :
///
/// 1. `warmUpViewModelKeyPaths` — accède RÉELLEMENT aux propriétés d'un
///    `ConversationViewModel` jetable : exécute les getters @Published aux
///    mêmes sites d'émission que le rendu réel, donc matérialise exactement
///    les patterns de keypath qui crashaient. Déterministe.
/// 2. Rendu de la vue dans une vraie `UIWindow` cachée — un simple
///    `layoutIfNeeded` hors fenêtre n'évalue PAS le body SwiftUI (prouvé par
///    le dump du 2026-07-30 19:4x : le keypath était froid au rendu réel
///    malgré le warm-up v1). La window force le premier rendu complet et
///    couvre les résolutions de métadonnées qu'on n'a pas encore vues.
///
/// `#if DEBUG` : en Release l'optimiseur pré-spécialise ces métadonnées à la
/// compilation — le crash n'a jamais été observé sur un build Release ou
/// TestFlight (1258 validé par Apple). Le binaire App Store ne contient pas
/// ce code.
///
/// **Démontage synchrone, jamais différé d'un tick (2026-08-17).** La
/// version précédente repoussait le démontage de la fenêtre à un second
/// `DispatchQueue.main.async` : ce délai laissait la fenêtre jetable — son
/// `UIHostingController`, son `ConversationView`, son `ConversationListViewModel`
/// jetable — vivante pendant que le VRAI premier rendu de `ConversationListView`
/// pouvait s'exécuter, deux graphes SwiftUI actifs simultanément dont un en
/// cours de démontage. Corrompait le tas au point de faire sauter l'exécution
/// dans une page non signée (`SIGKILL`/`CODESIGNING`) pendant
/// `AG::Graph::UpdateStack::update()`, reproduit à 100 % au lancement.
@MainActor
enum ConversationFirstRenderWarmup {
    private static var done = false
    private static var warmupWindow: UIWindow?

    static func run() {
        guard !done else { return }
        done = true
        // PILE PLATE OBLIGATOIRE : appelé depuis un `.task` SwiftUI, ce code
        // s'exécuterait au point courant de l'executor MainActor — potentiellement
        // au fond du rendu de RootView (dump du 2026-07-30 21:12 : le warm-up
        // lui-même a débordé, ~80 frames sous App.main). Un dispatch async
        // repart du drain du runloop (~15 frames), la marge de pile est alors
        // maximale pour les résolutions de métadonnées.
        DispatchQueue.main.async { performWarmup() }
    }

    private static func performWarmup() {
        let start = CFAbsoluteTimeGetCurrent()

        warmUpViewModelKeyPaths()

        let epoch = Date(timeIntervalSince1970: 1_700_000_000)
        let conversation = MeeshyConversation(
            id: "metadata-warmup", identifier: "metadata-warmup", type: .direct,
            lastMessageAt: epoch, createdAt: epoch, updatedAt: epoch,
            userState: ConversationUserState(
                isPinned: false, isMuted: false, mentionsOnly: false,
                isArchived: false, customName: nil, reaction: nil,
                tags: [], sectionId: nil, version: 0
            )
        )
        let host = UIHostingController(
            rootView: ConversationView(conversation: conversation, previewMode: true)
                .environmentObject(StoryViewModel())
                .environmentObject(StatusViewModel())
                .environmentObject(Router())
                .environmentObject(ConversationListViewModel())
        )
        // Une VRAIE window est requise pour que SwiftUI évalue le body ;
        // alpha 0 + windowLevel sous tout + non-key : jamais visible, ne vole
        // pas le focus. previewMode coupe les branches interactives ; le
        // ViewModel jetable pointe une conversation inexistante (ses loads
        // échouent en silence, cache vide + 404).
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = host
        window.windowLevel = UIWindow.Level(rawValue: UIWindow.Level.normal.rawValue - 1000)
        window.alpha = 0
        window.isHidden = false
        warmupWindow = window
        host.view.layoutIfNeeded()

        // Démontage SYNCHRONE, dans le MÊME tick que le rendu — jamais un
        // second `DispatchQueue.main.async` (constaté crashogène 2026-08-17,
        // `Meeshy-2026-08-17-161136.ips` : SIGKILL/CODESIGNING, saut dans une
        // page de tas non signée pendant `AG::Graph::UpdateStack::update()`,
        // à l'intérieur de `ConversationListView.mainContentZStack.getter`).
        // Le report d'un tour de runloop laissait cette fenêtre + son
        // `UIHostingController` + son `ConversationListViewModel` JETABLE
        // vivants pendant que le VRAI premier rendu de `ConversationListView`
        // (sa propre `ConversationListViewModel`) pouvait s'exécuter — deux
        // graphes SwiftUI actifs en même temps, dont un en cours de
        // démontage. `layoutIfNeeded()` a déjà forcé et terminé l'évaluation
        // du body ; rien ne justifie d'attendre un tick de plus pour libérer
        // la fenêtre.
        warmupWindow?.isHidden = true
        warmupWindow?.rootViewController = nil
        warmupWindow = nil
        NSLog("[ConversationFirstRenderWarmup] window torn down")
        NSLog("[ConversationFirstRenderWarmup] done in %.0f ms", (CFAbsoluteTimeGetCurrent() - start) * 1000)
    }

    /// Exécute les getters @Published de `ConversationViewModel` sur une
    /// instance jetable : chaque premier accès matérialise (au site
    /// d'émission RÉEL) le pattern de keypath du subscript
    /// `_enclosingInstance` — celui-là même qui débordait la pile au fond du
    /// premier rendu. `topActiveMembersList` reproduit le chemin complet du
    /// crash (headerAvatarView → topActiveMembers → messages).
    private static func warmUpViewModelKeyPaths() {
        let vm = ConversationViewModel(conversationId: "metadata-warmup")
        _ = vm.topActiveMembersList(accentColor: "#6366F1")
        _ = vm.messages
        _ = vm.isLoadingInitial
        _ = vm.isRevalidating
        _ = vm.otherConversationsUnread
        NSLog("[ConversationFirstRenderWarmup] viewmodel keypaths warmed")
    }
}
#endif
