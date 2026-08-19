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
///
/// **Campagne d'érasure `AnyView`, `ConversationView.swift`/`+Header.swift`
/// (2026-08-17).** Le warm-up ci-dessous a cessé de suffire : le rendu forcé
/// de `ConversationView` débordait TOUJOURS la pile, cette fois dans
/// `bodyContent` (branches `messageSkeletonOverlay`/`LivingSummaryHost`) et
/// dans la chaîne header (`floatingHeaderSection` → `expandedHeaderBand` →
/// `expandedHeaderMidContent` → `headerButtonsCluster` →
/// `readingModeAffordanceCluster`/`headerCallButtons`). Chaque maillon
/// déclaré `some View` propage sa complexité au TYPE COMPOSITE de son
/// appelant — un `AnyView` posé seulement au SITE D'APPEL ne suffit pas,
/// l'appelant doit quand même résoudre le type concret avant de le boxer.
/// Seule l'érasure à la DÉCLARATION de chaque maillon coupe la chaîne. Les
/// six propriétés ci-dessus ont alors toutes été passées en `AnyView`.
///
/// **Cette conclusion était FAUSSE, et sa vérification aussi (2026-08-19).**
/// La rédaction d'origine affirmait « vérifié par 20+ relances consécutives
/// sur device sans crash ». Les rapports `.ips` du device la démentent : le
/// même débordement a continué de tuer l'app APRÈS cette campagne — 2026-08-18
/// 23:42, 2026-08-19 06:16, 08:35, 08:38, tous dans
/// `floatingHeaderSectionBody`. Vingt lancements sans crash ne prouvaient rien :
/// le cache de métadonnées est GLOBAL au process, donc une relance trouve chaud
/// ce que la précédente a résolu. L'absence d'un crash intermittent n'est pas
/// une preuve.
///
/// Ce qui a réellement éteint la classe, le 2026-08-19 :
/// 1. La couche `Compatibility/` était le multiplicateur — `adaptiveOnChange`
///    (233 sites) et `adaptiveGlass` (87) étaient des `@ViewBuilder` portant un
///    `if #available`, donc un `_ConditionalContent` qui embarque les DEUX
///    branches : le type de l'appelant DOUBLAIT à chaque appel. Convertis en
///    `ViewModifier`.
/// 2. L'érasure de CHAQUE maillon de la chaîne, y compris les quatre couches
///    de `body` (`bodyWithSheets`/`bodyWithCovers`/`bodyWithLifecycle`/
///    `bodyContent`) que la campagne du 2026-08-17 n'avait pas touchées — la
///    profondeur du type passait de 87 niveaux à moins de 40.
/// 3. Garde de non-régression qui MESURE la grandeur au lieu d'espérer
///    l'absence de crash : `ConversationViewBodyTypeDepthTests`.
///
/// Vérification de ce lot : 31 lancements sur device, l'ancien binaire crashant
/// 2 fois en 3 minutes sur ce même chemin. Détail complet :
/// `docs/crash-audit-ios-2026-08-19.md`.
///
/// **Ce warm-up est un échafaudage à retirer** (risque R5 de l'audit) : sa
/// raison d'être disparaît avec le correctif ci-dessus, et il a lui-même causé
/// un crash (deux graphes SwiftUI actifs, `Meeshy-2026-08-17-161136.ips`).
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
        warmUpReadingModeController()

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

    /// Même patron que `warmUpViewModelKeyPaths`, pour `ReadingModeController`
    /// (2026-08-17, `Meeshy-2026-08-17-181310` env.) : `readingModeChipModel`
    /// (`ConversationView`, section chip de mode) lit `readingModeController
    /// .decision.reason` — première matérialisation du KeyPath `@Published
    /// decision` (subscript `_enclosingInstance`) jamais vue avant ce lot
    /// Focal (chip livré après le warm-up v1/v2). Sans ce troisième étage,
    /// cette résolution de métadonnées avait lieu pour la première fois ~90
    /// frames sous `layoutIfNeeded()` (traversée SwiftUI + AttributeGraph
    /// jusqu'à `headerButtonsCluster`) : marge de pile insuffisante,
    /// `EXC_BAD_ACCESS` dans le décodeur de mangling récursif
    /// (`swift_getTypeByMangledName`/`Node`). Ici l'accès est à pile plate,
    /// comme `warmUpViewModelKeyPaths` — le cache de métadonnées est global
    /// au process, donc le rendu réel (celui du warm-up ET celui de l'écran
    /// ouvert par l'utilisateur) le trouve déjà chaud.
    private static func warmUpReadingModeController() {
        let capabilities = ReadingModeOrchestrator.ReadingModeCapabilities(
            availableModes: [.script],
            riverEligible: false,
            riverEligibilityReason: ReadingModeOrchestrator.RiverEligibilityReason(
                threshold: ReadingModeOrchestrator.riverEligibilityThreshold,
                current: nil,
                riverReason: .neverEligible
            )
        )
        let controller = ReadingModeController(
            conversationId: "metadata-warmup",
            scope: .anonymous(participantId: "warmup"),
            unreadCount: 0,
            capabilities: capabilities,
            isFlagEnabled: false
        )
        _ = controller.decision
        _ = controller.mode
        NSLog("[ConversationFirstRenderWarmup] reading mode controller warmed")
    }
}
#endif
