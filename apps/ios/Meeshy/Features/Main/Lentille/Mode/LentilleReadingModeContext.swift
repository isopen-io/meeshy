import Foundation
import MeeshySDK

// MARK: - Traduction Conversation → orchestrateur (contrat LWS-8, §4.4 amendement R)
//
// `ReadingModeOrchestrator` (`Focal/Core/ReadingModeOrchestrator.swift`, GELÉ
// S1, miroir de `packages/shared/utils/reading-modes.ts`) ne connaît rien de
// `MeeshySDK.MeeshyConversation` : il porte son PROPRE jeu de types, plus
// étroit (cf. son commentaire d'en-tête). Ce fichier est le SEUL endroit qui
// sait traduire une `Conversation` app en entrées de cette loi — l'encoche
// (I-071), le sous-menu et l'aperçu (I-072) l'utilisent tous les trois, pour
// ne jamais voir une décision différente sur la même conversation.
//
// Pur, `nonisolated`, testable sans vue (même discipline que
// `LentilleBridgeFormatter`/`FocalFocusCurve`).
//
// @see tasks/lentille-implementation-contract.md LWS-8, §4.4 amendement R
// @see tasks/lentille-workshop-execution.md I-071, I-072, M-042 (amendement A2)
nonisolated enum LentilleReadingModeContext {

    // MARK: - Type de conversation

    /// `MeeshyConversation.ConversationType` porte plus de cas
    /// (`community`, `channel`, `bot`) que le jeu GELÉ de l'orchestrateur
    /// (`direct | group | public | global | broadcast` — cf. le commentaire
    /// d'en-tête de `ReadingModeOrchestrator`, qui refuse délibérément de
    /// réutiliser le type SDK pour garder son `switch` exhaustif fidèle aux
    /// vecteurs gelés). Les trois cas surnuméraires sont rabattus sur
    /// `.group` : aucun n'est jamais `direct` (donc aucun n'entrave
    /// l'éligibilité Rivière, qui exclut seulement `direct`) et le catalogue
    /// de modes ne les distingue pas plus finement. Décision d'INTÉGRATION
    /// locale à ce fichier, pas une extension du miroir gelé.
    static func orchestratorType(
        for type: Conversation.ConversationType
    ) -> ReadingModeOrchestrator.ConversationType {
        switch type {
        case .direct: return .direct
        case .group, .community, .channel, .bot: return .group
        case .public: return .public
        case .global: return .global
        case .broadcast: return .broadcast
        }
    }

    // MARK: - Participants actifs (éligibilité Rivière)

    /// ÉCART CONTRAT↔CODE signalé (pas oublié) : aucune surface client
    /// n'expose aujourd'hui de compte de participants ACTIFS par
    /// conversation — la présence par membre n'est chargée qu'à l'ouverture
    /// d'une conversation, et le décompte serveur
    /// (`activeParticipantCount`) est un livrable de la vague gateway (V5,
    /// G-123, hors périmètre LWS-8).
    ///
    /// REV-3/B3 : ce compte vaut désormais `nil` — INCONNU — là où il valait
    /// `0`. Le `0` était défendu comme « une valeur RÉELLE qui ne peut fausser
    /// l'éligibilité dans aucun sens », et c'était vrai de l'ÉLIGIBILITÉ (le
    /// seuil est `>= 5`, un faux négatif au pire). Mais ce n'était pas vrai du
    /// TEXTE : la raison grisée rendait « s'ouvrira à 5 personnes actives —
    /// 0 aujourd'hui » sur des conversations pleines de monde. Zéro n'était
    /// pas mesuré, il était fabriqué. `nil` le dit, et l'amendement S1 donne
    /// au libellé la forme qui va avec (le seuil seul, sans compte inventé).
    /// À remplacer par le champ serveur dès G-123 livré (extension de
    /// `Conversation`, hors ce fichier) — et ce jour-là, seul le corps de
    /// cette fonction change.
    static func activeParticipantCount(for conversation: Conversation) -> Int? {
        nil
    }

    // MARK: - Entrées de la loi

    /// R-135 — les TROIS surfaces de menu de la liste (encoche, sous-menu
    /// contextuel, aperçu) lisent désormais le VRAI drapeau
    /// `LentilleFeatureFlag.riviereMode` (R-133), au lieu du `false` en dur
    /// posé par R-133 le temps que ce lot arrive. Paramètre par défaut plutôt
    /// qu'une lecture interne à `ReadingModeOrchestrator.resolveCapabilities`
    /// (qui reste pure) : les trois call sites (`LentilleReadingModeSubmenu`,
    /// `LentilleFocusCard`, `LentillePeekView`) n'ont RIEN à changer — même
    /// patron que `isLentilleFlagEnabled`, explicite, jamais lu en douce.
    ///
    /// INERTE EN PRATIQUE aujourd'hui : `activeParticipantCount(for:)`
    /// ci-dessous rend TOUJOURS `nil` (compte d'actifs non livré, G-123) —
    /// `resolveCapabilities` ne rend donc JAMAIS `riverEligible` vrai sur ces
    /// trois surfaces, drapeau `riviere_mode` ON ou pas. Le dégrisage n'a
    /// d'effet observable que dans les tests (comptes synthétiques) et le
    /// jour où G-123 livre un compte réel.
    static func capabilitiesInput(
        for conversation: Conversation,
        isAnonymous: Bool,
        isLentilleFlagEnabled: Bool,
        isRiverFlagEnabled: Bool = LentilleFeatureFlag.isRiviereModeEnabled
    ) -> ReadingModeOrchestrator.ResolveCapabilitiesInput {
        ReadingModeOrchestrator.ResolveCapabilitiesInput(
            identity: ReadingModeOrchestrator.ReadingModeIdentity(isAnonymous: isAnonymous),
            isFlagEnabled: isLentilleFlagEnabled,
            isRiverFlagEnabled: isRiverFlagEnabled,
            conversationType: orchestratorType(for: conversation.type),
            activeParticipantCount: activeParticipantCount(for: conversation)
        )
    }

    static func decisionInput(
        for conversation: Conversation,
        preference: ReadingModeOrchestrator.ReadingModePreference,
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        isLentilleFlagEnabled: Bool,
        now: Date
    ) -> ReadingModeOrchestrator.OrchestratorDecisionInput {
        // NOTE : `capabilities` est déjà résolue par l'appelant (elle porte
        // `isRiverFlagEnabled` en amont, cf. `capabilitiesInput`) — cette
        // fonction ne fait que la clamper via `resolveOrchestratorDecision`,
        // jamais une seconde résolution.
        ReadingModeOrchestrator.OrchestratorDecisionInput(
            unreadCount: conversation.userState.unreadCount,
            // `ConversationUserState` ne porte pas de champ `lastOpenedAt`
            // dédié : `lastReadAt` est la meilleure approximation existante
            // de « dernière ouverture par le lecteur » (même famille de
            // décision que `lastSeenAt` pour la présence d'un pair, sur ce
            // même modèle).
            lastOpenedAt: conversation.userState.lastReadAt,
            now: now,
            stickyChoice: preference,
            capabilities: capabilities,
            isFlagEnabled: isLentilleFlagEnabled
        )
    }

    // MARK: - Bout en bout

    /// Capacités de lecture pour cette conversation — catalogue borné +
    /// éligibilité/raison Rivière. Utilisé par `LentilleModeMenuModel`.
    static func capabilities(
        for conversation: Conversation,
        isAnonymous: Bool,
        isLentilleFlagEnabled: Bool,
        isRiverFlagEnabled: Bool = LentilleFeatureFlag.isRiviereModeEnabled
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            capabilitiesInput(
                for: conversation,
                isAnonymous: isAnonymous,
                isLentilleFlagEnabled: isLentilleFlagEnabled,
                isRiverFlagEnabled: isRiverFlagEnabled
            )
        )
    }

    /// Décision affichable — préférence mémorisée (M-048) + conversation ⇒
    /// décision de `resolveOrchestratorDecision` (miroir gelé). `now` est
    /// injecté pour rester testable (jamais un `Date()` implicite dans une
    /// loi, même une glue d'intégration).
    static func decision(
        for conversation: Conversation,
        preference: ReadingModeOrchestrator.ReadingModePreference,
        isAnonymous: Bool,
        isLentilleFlagEnabled: Bool,
        now: Date = Date()
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        let resolvedCapabilities = capabilities(
            for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: isLentilleFlagEnabled
        )
        return ReadingModeOrchestrator.resolveOrchestratorDecision(
            decisionInput(
                for: conversation,
                preference: preference,
                capabilities: resolvedCapabilities,
                isLentilleFlagEnabled: isLentilleFlagEnabled,
                now: now
            )
        )
    }
}

// MARK: - Store partagé (M-048) — UNE préférence, QUATRE points d'entrée

/// Adaptateur Lentille → stockage Focal — arbitrage REV-3/B2.
///
/// AVANT : la liste écrivait `meeshy.readingMode.<conversationId>`
/// (`LocalReadingModePreferenceStore`, M-048) pendant que le fil ouvert
/// écrivait `meeshy_readmode_<scopeKey>_<conversationId>`
/// (`ReadingModePreferenceStore`, F-080). Deux magasins DISJOINTS pour une
/// même préférence : le mode choisi dans le menu de la liste n'était pas
/// celui que le fil ouvrait, et la clé de la liste n'avait AUCUN préfixe
/// d'identité — deux comptes sur le même appareil partageaient donc leurs
/// préférences de lecture (exactement la fuite privacy du 2026-05-26 que
/// `ReadingModePreferenceStore` documente en tête et que son préfixe scopé
/// interdit).
///
/// APRÈS : le stockage Focal est LE stockage. Cette classe ne fait que
/// TRADUIRE — elle implémente le protocole GELÉ `ReadingModePreferenceStoring`
/// (asynchrone, `conversationId` seule, M-048/LWS-2bis — intact) en résolvant
/// le scope d'identité EN INTERNE, avec le MÊME résolveur que le fil
/// (`ConversationViewerIdentityResolver`, F-080), puis en déléguant au
/// point d'entrée partagé `FocalReadingModePreferenceStoring
/// .preference(for:scope:)` / `.setPreference(_:for:scope:)`. AUCUNE logique
/// de clé n'est recopiée ici : les clés restent l'affaire exclusive de
/// `ReadingModePreferenceStore`.
///
/// AUCUNE MIGRATION des anciennes clés `meeshy.readingMode.*` — décision
/// motivée, pas un oubli. (1) Le seul écrivain de ces clés était
/// `LocalReadingModePreferenceStore`, atteignable uniquement depuis les trois
/// surfaces montées derrière `LentilleFeatureFlag.isLentilleListEnabled`
/// (`ConversationListView+Overlays.swift`, `+Rows.swift`), drapeau dont le
/// défaut est OFF (`UserDefaults.bool(forKey:)` sur clé absente) et dont
/// l'unique bascule, `setForDebug`, n'a AUCUN site d'appel de production
/// (tests seuls). (2) Aucun build utilisateur n'a donc jamais écrit une de ces
/// clés. (3) Surtout : migrer une clé NON scopée vers une clé scopée
/// consisterait à attribuer au premier lecteur venu une préférence qu'un autre
/// compte du même appareil aurait laissée — soit re-commettre la fuite du
/// 2026-05-26 dans le geste même censé la refermer. Ne rien migrer est ici la
/// seule lecture honnête.
nonisolated final class LentilleScopedReadingModePreferenceStore: ReadingModePreferenceStoring, @unchecked Sendable {

    private let store: FocalReadingModePreferenceStoring
    private let scopeProvider: @Sendable () async -> ReadingModePreferenceScope
    private let lock = NSLock()
    private var subscribers: [UUID: @Sendable (String, ReadingModePreference) -> Void] = [:]

    init(
        store: FocalReadingModePreferenceStoring = ReadingModePreferenceStore(),
        scopeProvider: @escaping @Sendable () async -> ReadingModePreferenceScope
            = LentilleScopedReadingModePreferenceStore.currentViewerScope
    ) {
        self.store = store
        self.scopeProvider = scopeProvider
    }

    /// Scope du lecteur courant, résolu par l'UNIQUE point de branchement
    /// invité/inscrit du dépôt (§5.1) — jamais un `isAnonymous` recopié sur
    /// place.
    ///
    /// `anonymousSession: nil` — RE-PREUVE, pas un raccourci : les trois
    /// surfaces qui consomment ce magasin sont montées par
    /// `ConversationListView` (`+Overlays.swift:125/:459`, `+Rows.swift:149`),
    /// elle-même hébergée par `RootView`/`iPadRootView` ; une session invitée
    /// active fait présenter `GuestConversationContainer` en `fullScreenCover`
    /// par-dessus tout (`MeeshyApp.swift`, condition
    /// `activeGuestSession != nil && !authManager.isAuthenticated`), et ce
    /// conteneur ouvre un FIL, jamais la liste. Aucune source client ne publie
    /// par ailleurs le `participantId` de la session invitée hors du fil
    /// (`AnonymousSessionStore.load` exige un `linkId`). Le repli documenté du
    /// résolveur (`.anonymous(participantId: "")`) est donc le comportement
    /// exact voulu ici : identité inconnue ⇒ préférence non durable, jamais
    /// une préférence attribuée au mauvais compte. `scopeProvider` reste
    /// injectable pour que la liste invitée (V5) branche la vraie session sans
    /// toucher à cette classe.
    static func currentViewerScope() async -> ReadingModePreferenceScope {
        await MainActor.run {
            ConversationViewerIdentityResolver.resolve(
                authManager: AuthManager.shared,
                anonymousSession: nil
            ).scope
        }
    }

    func get(conversationId: String) async -> ReadingModePreference {
        let scope = await scopeProvider()
        return store.preference(for: conversationId, scope: scope)
    }

    func set(conversationId: String, value: ReadingModePreference, optimistic: Bool = true) async {
        let scope = await scopeProvider()
        store.setPreference(value, for: conversationId, scope: scope)
        notifySubscribers(conversationId: conversationId, value: value)
    }

    /// Même portée que le magasin M-048 qu'il remplace : notifie les écritures
    /// passées PAR CET adaptateur. Un choix fait dans le fil ouvert
    /// (`ReadingModeController.select`, magasin synchrone sans canal de
    /// notification) n'émet toujours pas ici — mais il atterrit désormais sur
    /// la MÊME clé, donc la prochaine lecture de la liste le voit. C'est la
    /// différence entre « pas encore d'événement » et « deux vérités
    /// divergentes » : seule la seconde était un défaut.
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

/// L'encoche (I-071), le sous-menu « Mode de lecture » et l'aperçu (I-072)
/// doivent lire/écrire EXACTEMENT le même magasin que le FIL ouvert
/// (`ReadingModeController`, F-080) — sinon « trois points d'entrée, une
/// préférence » (contrat LWS-8) devient quatre préférences.
///
/// Ce point d'accès partagé vit ici, au plus près de ses trois consommateurs,
/// sur le modèle des autres `.shared` de l'app (`PresenceManager.shared`,
/// `ConversationLockManager.shared`).
nonisolated enum LentilleReadingModePreferenceCenter {
    static let shared: ReadingModePreferenceStoring = LentilleScopedReadingModePreferenceStore()
}
