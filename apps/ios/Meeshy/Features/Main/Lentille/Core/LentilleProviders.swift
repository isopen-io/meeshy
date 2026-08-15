import Foundation
import MeeshySDK

/// Les trois protocoles providers de la Lentille — LWS-2bis, gelé.
///
/// Miroir Swift des protocoles TypeScript figés (S1) sous
/// `packages/shared/providers/{ConversationBridgeProviding,
/// ReadingModePreferenceStoring,ConversationLiveCallProviding}.ts` (C-028).
/// Chaque protocole a EXACTEMENT deux implémentations attendues : la locale
/// (ce fichier — substitut client, M-047/M-048) et la définitive (gateway,
/// G-124, lot ultérieur). La bascule de LWS-3/4 change l'INJECTION, jamais
/// une ligne d'UI : aucune vue ne sait laquelle des deux répond — garde
/// source : aucun fichier de peau (`Lentille/Row`, `Lentille/Mode`,
/// `Lentille/Chrome`) ne nomme `Local…Provider` ni `Gateway…Provider`.
///
/// Zéro donnée fabriquée, partout : un provider calcule moins, ou rend
/// `nil`. Il n'invente jamais un pont, une préférence par défaut fictive, ou
/// un appel en cours qu'il ne connaît pas.
///
/// @see tasks/lentille-implementation-contract.md LWS-2bis
/// @see tasks/lentille-workshop-execution.md M-048 (ce fichier), M-047 (miroir TS)

// =============================================================================
// MARK: - Types provisoires / réutilisés
// =============================================================================

/// Alias vers le miroir Swift CANONIQUE de `ReadingModePreference`
/// (`packages/shared/types/reading-modes.ts`), possédé par M-042 —
/// `ReadingModeOrchestrator.ReadingModePreference`
/// (`Focal/Core/ReadingModeOrchestrator.swift`). M-042 a atterri APRÈS le
/// début de cette tâche (re-preuve faite à l'écriture de ce fichier :
/// `Focal/Core` était vide) ; ce fichier s'y raccroche plutôt que d'en
/// garder un second miroir (Single Source of Truth, CLAUDE.md racine) — un
/// `enum ReadingModePreference` déclaré ICI EN PLUS aurait coexisté sans
/// erreur de compilation (namespaces distincts : top-level vs nichée dans
/// `ReadingModeOrchestrator`), mais aurait dupliqué le type source de vérité.
///
/// À distinguer de `ConversationReadingMode` (le mode RENDU, que
/// `focal-implementation-contract.md` §WS-1 mirrorise séparément et collapse
/// dans son propre store en `ConversationReadingMode?` avec `nil` = auto) —
/// ce protocole-ci mirrorise `ReadingModePreferenceStoring.ts` gelé tel
/// quel, donc garde les 5 cas de `ReadingModePreference`.
typealias ReadingModePreference = ReadingModeOrchestrator.ReadingModePreference

/// Miroir Swift de `ConversationLiveCall`
/// (`packages/shared/types/conversation-bridge.ts`, contrat §3.3).
///
/// **Domicile provisoire**, même réserve que `ReadingModePreference`
/// ci-dessus. Le commentaire TS gelé note explicitement qu'« aucun champ
/// d'appel n'existe aujourd'hui sur `CoreModels.swift` » (vérifié à nouveau
/// ici, `apps/ios/Meeshy/Features/Main/Lentille` inclus) : ce type est donc
/// posé ici par nécessité — le protocole `ConversationLiveCallProviding` ne
/// peut pas exister sans lui — et non par choix de domicile définitif.
nonisolated struct ConversationLiveCall: Codable, Equatable, Sendable {
    /// Participants qui parlent ou écoutent.
    let voices: Int
    /// Le client calcule « depuis 12 min » via le ticker 60 s existant.
    let startedAt: Date
    /// `false` → bouton Rejoindre ; `true` → rien de plus.
    let joined: Bool

    init(voices: Int, startedAt: Date, joined: Bool) {
        self.voices = voices
        self.startedAt = startedAt
        self.joined = joined
    }
}

// =============================================================================
// MARK: - ConversationBridgeProviding
// =============================================================================

/// Un seul protocole, deux implémentations : `LocalBridgeProvider`
/// (substitut, ce fichier — exécute `LentilleBridgeFormatter.buildBridgeData`
/// (miroir Swift de LWS-1) sur les messages déjà en cache côté client) et
/// `GatewayBridgeProvider` (définitif, G-124 — lit le champ `bridge` du
/// payload de la gateway, LWS-4).
///
/// `bridge.isComplete == false` signale que la fenêtre de calcul du provider
/// ne couvre pas tout l'intervalle non lu (typiquement `LocalBridgeProvider`,
/// borné aux messages déjà en cache) — l'UI porte alors la mention « sur les
/// N derniers messages », jamais un chiffre extrapolé. `nil` (le retour de
/// `bridgeFor`, pas `isComplete`) signale qu'il n'y a rien à montrer.
nonisolated protocol ConversationBridgeProviding: Sendable {
    /// Calcule (substitut) ou lit (définitif) le pont ✦ d'une conversation.
    /// `nil` quand il n'y a rien à montrer — jamais un pont vide fabriqué
    /// pour combler l'absence de donnée. Une fenêtre partielle se déclare
    /// par `isComplete == false` SUR le pont rendu, jamais par une enveloppe.
    func bridgeFor(conversationId: String, viewerId: String, unreadCount: Int) async -> ConversationBridge?
}

/// Substitut client (M-047/M-048) : produit le pont ✦ à partir de closures
/// injectées, sans toucher le réseau. Deux sémantiques distinctes, jamais
/// confondues :
/// - `getUnreadWindow` répond `nil` quand le client ne sait RIEN de la
///   fenêtre non lue de cette conversation (jamais ouverte, cache froid) —
///   `bridgeFor` rend alors `nil` : rien à annoncer plutôt qu'une supposition.
/// - `getUnreadWindow` répond un `UnreadWindow` dont `isComplete == false`
///   quand le cache client ne couvre qu'une PARTIE de l'intervalle non lu
///   (typiquement : le client n'a chargé que les N derniers messages) — le
///   pont rendu porte alors `isComplete == false`, jamais un décompte
///   extrapolé au-delà de ce qui a réellement été vu.
///
/// La donnée déterministe du pont (`ConversationBridgeData`) est calculée
/// par `LentilleBridgeFormatter.buildBridgeData` — le miroir Swift de LWS-1
/// (`buildBridgeData` dans `packages/shared/utils/conversation-bridge.ts`),
/// possédé par M-041 (`LentilleBridgeFormatter.swift`, `Lentille/Core/`).
/// Signature re-prouvée contre le fichier réel, atterri en cours de tâche :
/// `buildBridgeData(messages: [LentilleBridgeFormatter.BridgeMessage],
/// viewerId: String, unreadCount: Int) -> ConversationBridgeData?`, avec
/// `BridgeMessage` nichée dans `LentilleBridgeFormatter` et portant
/// `senderId`/`senderName`/`attachments` comme son miroir TS.
nonisolated struct LocalBridgeProvider: ConversationBridgeProviding, Sendable {

    /// Ce que le client sait de la fenêtre non lue pour une conversation.
    /// `isComplete == true` ⇔ le cache couvre l'intervalle non lu en entier ;
    /// `false` ⇔ borné (typiquement aux messages déjà chargés en mémoire).
    nonisolated struct UnreadWindow: Sendable, Equatable {
        let isComplete: Bool
        init(isComplete: Bool) {
            self.isComplete = isComplete
        }
    }

    typealias CachedMessagesProvider = @Sendable (_ conversationId: String) async -> [LentilleBridgeFormatter.BridgeMessage]
    typealias UnreadWindowProvider = @Sendable (_ conversationId: String) async -> UnreadWindow?

    private let getCachedMessages: CachedMessagesProvider
    private let getUnreadWindow: UnreadWindowProvider

    init(getCachedMessages: @escaping CachedMessagesProvider, getUnreadWindow: @escaping UnreadWindowProvider) {
        self.getCachedMessages = getCachedMessages
        self.getUnreadWindow = getUnreadWindow
    }

    func bridgeFor(conversationId: String, viewerId: String, unreadCount: Int) async -> ConversationBridge? {
        guard let window = await getUnreadWindow(conversationId) else { return nil }
        let messages = await getCachedMessages(conversationId)
        guard let data = LentilleBridgeFormatter.buildBridgeData(
            messages: messages, viewerId: viewerId, unreadCount: unreadCount
        ) else {
            return nil
        }

        return ConversationBridge(
            kind: .fallback,
            unreadCount: unreadCount,
            suggestedMode: Self.suggestedMode(forUnreadCount: unreadCount),
            isComplete: window.isComplete ? nil : false,
            data: data
        )
    }

    /// `unreadCount <= ReadingModeOrchestrator.unreadCap` → `.focal` ; au-delà
    /// → `.resume`. Miroir de `toBridgeSuggestedMode`
    /// (`ReadingModeOrchestrator.toBridgeSuggestedMode`, M-042) réécrit dans
    /// le type `ConversationBridge.SuggestedMode` (MeeshySDK) qu'attend
    /// `ConversationBridge.init` — `ReadingModeOrchestrator.BridgeSuggestedMode`
    /// est un type local à `Focal/Core/` (délibérément non partagé avec le
    /// SDK, cf. son propre commentaire), donc pas directement substituable
    /// ici. Fonction pure, testable indépendamment de `bridgeFor`.
    static func suggestedMode(forUnreadCount unreadCount: Int) -> ConversationBridge.SuggestedMode {
        unreadCount <= ReadingModeOrchestrator.unreadCap ? .focal : .resume
    }
}

// =============================================================================
// MARK: - ReadingModePreferenceStoring
// =============================================================================

/// Un seul protocole, deux implémentations : le store local (substitut,
/// ce fichier — `UserDefaults`, clé `(conversationId)`, mémorisé PAR
/// APPAREIL, pas encore synchronisé) et, après LWS-3, le MÊME store
/// rétrogradé en cache optimiste devant `UserConversationPreferences`
/// (canal versionné, multi-appareils). Le store local n'est donc pas du
/// travail jeté : il devient le cache optimiste quand le canal serveur
/// atterrit. La bascule change l'injection, jamais l'UI.
///
/// **Collision de nom à réconcilier (Fable) :** `focal-implementation-contract.md`
/// §WS-1 (F-080, `Focal/Core/ReadingModePreferenceStoring.swift`) déclare un
/// AUTRE protocole Swift, PORTANT LE MÊME NOM, mais de forme différente
/// (synchrone, `AnyObject`, clé `(conversationId, scope)`, plus
/// `lastOpenedAt`/`noteOpened` pour la branche d'absence de l'orchestrateur).
/// Les deux vivraient dans le MÊME module app (`apps/ios/Meeshy`) — une
/// redéclaration au sens strict si F-080 atterrit sans renommage. Ce
/// fichier (M-048, LWS-2bis, dépendance amont de REV-2) mirrorise le
/// protocole GELÉ `packages/shared/providers/ReadingModePreferenceStoring.ts`
/// mot pour mot ; l'arbitrage du nom entre les deux revient à Fable à
/// l'intégration V3 (F-080 dépend de REV-2, donc de ce fichier).
nonisolated protocol ReadingModePreferenceStoring: Sendable {
    /// Défaut `.auto` quand rien n'est mémorisé pour cette conversation —
    /// rend la main à l'orchestrateur, jamais un mode figé par défaut.
    func get(conversationId: String) async -> ReadingModePreference

    /// `optimistic` — écriture locale immédiate avant confirmation réseau,
    /// la posture qui deviendra la règle une fois LWS-3 atterri (ce store
    /// passe alors en cache optimiste devant le canal serveur versionné).
    func set(conversationId: String, value: ReadingModePreference, optimistic: Bool) async

    /// S'abonne aux changements de préférence, toutes conversations
    /// confondues. Retourne une fonction de désabonnement idempotente :
    /// l'appeler plusieurs fois ne doit ni lever ni notifier deux fois.
    func onChange(_ callback: @escaping @Sendable (String, ReadingModePreference) -> Void) -> @Sendable () -> Void
}

/// Substitut client — `UserDefaults` injectable, clé
/// `meeshy.readingMode.<conversationId>`. JAMAIS `.standard` dans les tests
/// (convention du dépôt, cf. `StoryVisibilityPreferenceStore` /
/// `StoryVisibilityPreferenceStoreTests` — une suite qui écrirait la vraie
/// clé laisserait un résidu visible au lancement suivant, `MeeshyTests`
/// étant hébergé dans `Meeshy.app`).
final class LocalReadingModePreferenceStore: ReadingModePreferenceStoring, @unchecked Sendable {

    private static let keyPrefix = "meeshy.readingMode."

    private static func key(conversationId: String) -> String {
        "\(keyPrefix)\(conversationId)"
    }

    private let defaults: UserDefaults
    private let lock = NSLock()
    private var subscribers: [UUID: @Sendable (String, ReadingModePreference) -> Void] = [:]

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func get(conversationId: String) async -> ReadingModePreference {
        guard let raw = defaults.string(forKey: Self.key(conversationId: conversationId)),
              let value = ReadingModePreference(rawValue: raw) else {
            return .auto
        }
        return value
    }

    func set(conversationId: String, value: ReadingModePreference, optimistic: Bool = true) async {
        defaults.set(value.rawValue, forKey: Self.key(conversationId: conversationId))
        notifySubscribers(conversationId: conversationId, value: value)
    }

    func onChange(_ callback: @escaping @Sendable (String, ReadingModePreference) -> Void) -> @Sendable () -> Void {
        let token = UUID()
        lock.lock()
        subscribers[token] = callback
        lock.unlock()

        return { [weak self] in
            guard let self else { return }
            self.lock.lock()
            self.subscribers.removeValue(forKey: token)
            self.lock.unlock()
        }
    }

    private func notifySubscribers(conversationId: String, value: ReadingModePreference) {
        lock.lock()
        let callbacks = Array(subscribers.values)
        lock.unlock()
        for callback in callbacks {
            callback(conversationId, value)
        }
    }
}

// =============================================================================
// MARK: - ConversationLiveCallProviding
// =============================================================================

/// Un seul protocole, deux implémentations : `LocalLiveCallProvider`
/// (substitut, ce fichier — dérivé de l'état d'appel que le client connaît
/// déjà pour la conversation ouverte ; absent pour les autres) et, après
/// LWS-4, la lecture du payload `ConversationLiveCall` de la gateway. La
/// bascule change l'injection, jamais l'UI.
///
/// Un appel inconnu n'est PAS affiché : `nil`, jamais inventé. La section
/// EN DIRECT reste vide plutôt que fausse.
nonisolated protocol ConversationLiveCallProviding: Sendable {
    /// `nil` quand l'appel de cette conversation n'est pas connu du provider
    /// — jamais inventé, jamais extrapolé depuis l'état d'une autre
    /// conversation.
    func liveCallFor(conversationId: String) -> ConversationLiveCall?

    /// S'abonne aux changements d'état d'appel, toutes conversations
    /// confondues. Retourne une fonction de désabonnement idempotente.
    func onChange(_ callback: @escaping @Sendable (String, ConversationLiveCall?) -> Void) -> @Sendable () -> Void
}

/// Substitut client — registre en mémoire, alimenté par `noteLiveCall`
/// depuis l'état d'appel WebRTC/CallKit déjà détenu ailleurs (jamais
/// recalculé ici : ce provider ne fait QUE relayer un état déjà connu).
final class LocalLiveCallProvider: ConversationLiveCallProviding, @unchecked Sendable {

    private let lock = NSLock()
    private var liveCalls: [String: ConversationLiveCall] = [:]
    private var subscribers: [UUID: @Sendable (String, ConversationLiveCall?) -> Void] = [:]

    init() {}

    func liveCallFor(conversationId: String) -> ConversationLiveCall? {
        lock.lock()
        defer { lock.unlock() }
        return liveCalls[conversationId]
    }

    /// Enregistre (`liveCall` non nil) ou efface (`nil`) l'état d'appel
    /// connu pour cette conversation, et notifie les abonnés.
    func noteLiveCall(_ liveCall: ConversationLiveCall?, for conversationId: String) {
        lock.lock()
        if let liveCall {
            liveCalls[conversationId] = liveCall
        } else {
            liveCalls.removeValue(forKey: conversationId)
        }
        let callbacks = Array(subscribers.values)
        lock.unlock()

        for callback in callbacks {
            callback(conversationId, liveCall)
        }
    }

    func onChange(_ callback: @escaping @Sendable (String, ConversationLiveCall?) -> Void) -> @Sendable () -> Void {
        let token = UUID()
        lock.lock()
        subscribers[token] = callback
        lock.unlock()

        return { [weak self] in
            guard let self else { return }
            self.lock.lock()
            self.subscribers.removeValue(forKey: token)
            self.lock.unlock()
        }
    }
}
