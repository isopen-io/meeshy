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

        // **L'ÉTAGE DE RENDU EST RETIRÉ (2026-09-03).**
        //
        // Il montait un `UIHostingController(rootView: ConversationView(…))`
        // dans une fenêtre invisible et appelait `layoutIfNeeded()` pour
        // forcer l'évaluation du body. Cet étage NE POUVAIT PAS aboutir : il
        // matérialise toute la chaîne de types de `ConversationView` en UNE
        // passe, et cette passe ne tient pas dans les 1008 Ko du thread
        // principal. Mesuré sur device (iPhone 16 Pro Max, iOS 26.6.1) —
        // `signal 11` dans la page de garde à CHAQUE lancement, huit rapports
        // le 2026-09-03 entre 14:12 et 17:45. La frame fautive se DÉPLAÇAIT à
        // chaque correctif (`ephemeralDuration.getter`, puis
        // `composerPickersAndSheets`), preuve que le budget était dépassé
        // globalement et non par un maillon coupable.
        //
        // Le relevé qui le dit : sur les 91 trames, `bodyContent.getter`
        // apparaît QUATRE fois (ré-entrée par les closures de `VStack`/
        // `ZStack`), chacune portant la frame d'une fonction qui construit un
        // arbre de vues géant. 72 trames non-démangleur consommaient ~685 Ko,
        // soit ~9,5 Ko par trame — ce sont les getters de body eux-mêmes qui
        // sont gros, pas seulement le décodeur de métadonnées.
        //
        // Les deux étages CONSERVÉS ci-dessus sont ceux qui payent : ils
        // résolvent les patterns de keypath depuis une pile PLATE, et le cache
        // de métadonnées étant global au process, le rendu réel les retrouve
        // chauds. L'étage de rendu, lui, ne pré-chauffait rien — il plantait
        // avant d'avoir fini.
        //
        // La dette de fond reste OUVERTE : découper `ConversationView` en
        // structs `View` NOMINALES (chacune crée un nœud d'attribut où SwiftUI
        // déroule la pile, et son getter porte une frame petite). Tant qu'elle
        // n'est pas payée, ne PAS réintroduire un rendu de warm-up : c'est un
        // crash au lancement, pas une optimisation.
        //
        // Garde : `ConversationWarmupHasNoRenderStageTests`.
        NSLog("[ConversationFirstRenderWarmup] done in %.0f ms", (CFAbsoluteTimeGetCurrent() - start) * 1000)
    }

    /// Exécute les getters @Published de `ConversationViewModel` sur une
    /// instance jetable : chaque premier accès matérialise (au site
    /// d'émission RÉEL) le pattern de keypath du subscript
    /// `_enclosingInstance` — celui-là même qui débordait la pile au fond du
    /// premier rendu. `topActiveMembersList` reproduit le chemin complet du
    /// crash (headerAvatarView → topActiveMembers → messages).
    ///
    /// **TOUS les `@Published` sont lus, et ce n'est pas du zèle (2026-09-03).**
    /// Cette liste n'en nommait que cinq, choisies à chaque crash d'après la
    /// trame fautive de ce crash-là. Une liste ainsi tenue n'énonce pas un
    /// invariant : elle énonce l'historique des pannes DÉJÀ VUES, et se périme
    /// en silence dès qu'un `body` lit un sixième `@Published`. C'est
    /// exactement ce qui est arrivé — le composer lit `ephemeralDuration`
    /// (`ConversationView+Composer.swift`, `composerCoreBody`), absent de la
    /// liste, et l'app plantait AU LANCEMENT : `signal 11` dans la page de
    /// garde, `_swift_getKeyPath` → `ephemeralDuration.getter` →
    /// `composerCoreBody.getter` → … → `performWarmup()` (device iPhone 16 Pro
    /// Max, `segv_backtrace.txt` du 17:41, build 1805).
    ///
    /// L'instanciation d'UN pattern de keypath descend sur ~43 trames à ~17 Ko
    /// chacune ≈ 730 Ko. Au fond d'un rendu SwiftUI il ne reste pas 730 Ko des
    /// 1008 Ko du thread principal ; depuis la pile PLATE d'ici, oui. Le coût
    /// de les lire toutes est un accès mémoire par propriété — payé une fois,
    /// au démarrage, contre une classe entière de crashs.
    ///
    /// La couverture est VÉRIFIÉE, pas promise :
    /// `ConversationWarmupCoversEveryPublishedTests` dérive l'inventaire des
    /// `@Published` de la source du ViewModel et échoue sur tout absent d'ici.
    /// Une propriété `@Published` ajoutée au ViewModel fait donc rougir la
    /// garde AVANT de faire planter un appareil.
    private static func warmUpViewModelKeyPaths() {
        let vm = ConversationViewModel(conversationId: "metadata-warmup")
        _ = vm.topActiveMembersList(accentColor: "#6366F1")
        _ = vm.accessRevoked
        _ = vm.activeAudioLanguageOverrides
        _ = vm.activeLiveLocations
        _ = vm.activeTranslationOverrides
        _ = vm.bubbleLanguageSelections
        _ = vm.currentConversation
        _ = vm.currentSearchQuery
        _ = vm.editInProgress
        _ = vm.ephemeralDuration
        _ = vm.error
        _ = vm.firstUnreadMessageId
        _ = vm.hasNewerMessages
        _ = vm.hasOlderMessages
        _ = vm.isBlurEnabled
        _ = vm.isConversationClosed
        _ = vm.isInJumpedState
        _ = vm.isLoadingInitial
        _ = vm.isLoadingNewer
        _ = vm.isLoadingOlder
        _ = vm.isLoadingReactions
        _ = vm.isRevalidating
        _ = vm.isSearching
        _ = vm.isSearchingQuotedMessage
        _ = vm.isSending
        _ = vm.isViewOnceEnabled
        _ = vm.lastUnreadMessage
        _ = vm.listenedAttachmentIds
        _ = vm.mentionController
        _ = vm.messageTranscriptions
        _ = vm.messageTranscriptionsByAttachment
        _ = vm.messageTranslatedAudios
        _ = vm.messageTranslatedAudiosByAttachment
        _ = vm.messageTranslations
        _ = vm.messages
        _ = vm.otherConversationsUnread
        _ = vm.pendingEffects
        _ = vm.preferredLanguageRevision
        _ = vm.quotedMessageSearchTarget
        _ = vm.reactionDetails
        _ = vm.scrollAnchorId
        _ = vm.searchHasMore
        _ = vm.searchResults
        _ = vm.showEffectsPicker
        _ = vm.translatingAudioLanguages
        _ = vm.translatingTextLanguages
        _ = vm.voiceConsentMissing
        NSLog("[ConversationFirstRenderWarmup] viewmodel keypaths warmed (46)")
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
