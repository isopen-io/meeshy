import Foundation

/// Miroir Swift EXACT de `packages/shared/utils/reading-modes.ts` (contrat
/// GELÉ S1, version POST-C-033) — Lois de lecture des conversations, La
/// Lentille × Focal.
///
/// Lois pures, sans I/O, sans dépendance de plateforme (aucune vue, aucun
/// singleton, aucun `Date()` implicite — `now` est toujours injecté). Domicile
/// TypeScript partagé par les trois frontends ; ce fichier est le miroir iOS
/// (phase 1), sous `Focal/Core/` par amendement A2 du workshop d'exécution
/// (`tasks/lentille-workshop-execution.md`, tâche M-042) — les miroirs Swift
/// des lois de lecture vivent ici, pas sous `Lentille/Core/` (LWS-5, cotes de
/// design uniquement).
///
/// **Types locaux, volontairement non partagés avec `MeeshySDK.ConversationType`
/// / `ConversationEncryptionMode`** : ces types SDK portent des jeux de cas
/// plus larges (`community`, `channel`, `bot` côté conversation ; aucune valeur
/// `null` côté chiffrement) que l'union TypeScript gelée
/// (`ConversationType = 'direct' | 'group' | 'public' | 'global' | 'broadcast'`,
/// `EncryptionMode = 'e2ee' | 'server' | 'hybrid' | null`). Réutiliser les
/// types SDK romprait l'exhaustivité du miroir — un `switch` exhaustif sur le
/// jeu de cas SDK ne pourrait pas rejouer fidèlement les vecteurs gelés. Ce
/// fichier possède donc son propre jeu de types, scopé à `ReadingModeOrchestrator`.
///
/// @see packages/shared/utils/reading-modes.ts (domicile de vérité)
/// @see tasks/lentille-implementation-contract.md LWS-0
/// @see tasks/lentille-focal-workshop.md §4.4 (cascade d'assistance)
/// @see tasks/focal-implementation-contract.md §3.2, §5.1-5.2
/// @see tasks/lentille-workshop-execution.md M-042 (amendement A2)
nonisolated public enum ReadingModeOrchestrator {

    // =========================================================================
    // Types — miroir de packages/shared/types/reading-modes.ts,
    // packages/shared/types/conversation.ts (ConversationType) et
    // packages/shared/types/encryption.ts (EncryptionMode)
    // =========================================================================

    /// Mode réellement rendu à l'écran.
    nonisolated public enum ConversationReadingMode: String, Codable, CaseIterable, Sendable, Equatable {
        case focal
        case script
        case summary
        case river
        case bubbles
    }

    /// Ce que l'utilisateur a choisi (mots du menu). `.auto` rend la main aux
    /// branches numériques de `resolveOrchestratorDecision`.
    nonisolated public enum ReadingModePreference: String, Codable, CaseIterable, Sendable, Equatable {
        case auto
        case focal
        case script
        case resume
        case riviere
    }

    /// Miroir de `ConversationType` (`packages/shared/types/conversation.ts`) —
    /// jeu de cas GELÉ à ces 5 valeurs pour cette loi. Ne PAS élargir avec les
    /// cas supplémentaires de `MeeshySDK.ConversationType` (`community`,
    /// `channel`, `bot`) : ce fichier mirror un contrat plus étroit.
    nonisolated public enum ConversationType: String, Codable, CaseIterable, Sendable, Equatable {
        case direct
        case group
        case `public`
        case global
        case broadcast
    }

    /// Miroir de `EncryptionMode` (`packages/shared/types/encryption.ts`) —
    /// `'e2ee' | 'server' | 'hybrid' | null`. Le `null` TypeScript se
    /// représente par `EncryptionMode?` (`nil`) côté appelant — ce type ne
    /// porte que les 3 valeurs non-nulles.
    nonisolated public enum EncryptionMode: String, Codable, CaseIterable, Sendable, Equatable {
        case e2ee
        case server
        case hybrid
    }

    // =========================================================================
    // C-011 — resolveOrchestratorDecision
    // =========================================================================

    /// Pourquoi l'orchestrateur a rendu cette décision — libellé de l'encoche
    /// « AUTO · <raison> ».
    nonisolated public enum OrchestratorDecisionReason: String, Codable, Sendable, Equatable {
        case flagDisabled = "flag-disabled"
        case sticky
        case unreadOverCap = "unread-over-cap"
        case staleAbsence = "stale-absence"
        case clampedUnavailable = "clamped-unavailable"
        case `default` = "default"
    }

    nonisolated public struct OrchestratorDecision: Sendable, Equatable {
        public let mode: ConversationReadingMode
        public let reason: OrchestratorDecisionReason

        public init(mode: ConversationReadingMode, reason: OrchestratorDecisionReason) {
            self.mode = mode
            self.reason = reason
        }
    }

    /// Seuil « > 25 non-lus » qui bascule en Résumé Vivant. Constante
    /// déclarée UNE fois pour tout ce fichier (M-042).
    public static let unreadCap: Int = 25

    /// Plancher de non-lus de la branche d'absence (« ≥ 10 »).
    public static let absenceUnreadFloor: Int = 10

    /// Fenêtre d'absence du lecteur (« > 24 h »), en millisecondes.
    public static let absenceWindowMs: Double = 24 * 60 * 60 * 1000

    /// Seuil de participants actifs à partir duquel la Rivière gagne son
    /// procès (C-012).
    public static let riverEligibilityThreshold: Int = 5

    /// POURQUOI la Rivière est fermée (ou ouverte) — miroir de
    /// `RiverEligibilityReasonKind` (AMENDEMENT S1, REV-3/B3). Sans ce
    /// discriminant, le libellé grisé ne savait dire qu'une chose (« s'ouvrira
    /// à 5 personnes actives »), y compris sur une conversation `direct` où
    /// elle ne s'ouvrira JAMAIS : l'éligibilité exclut `direct`
    /// STRUCTURELLEMENT, quel que soit le compte.
    nonisolated public enum RiverEligibilityReasonKind: String, Codable, CaseIterable, Sendable, Equatable {
        /// Conversation `direct` : aucun compte ne l'ouvrira.
        case neverEligible
        /// Type éligible, seuil non atteint — ou compte INCONNU (`current == nil`).
        case belowThreshold
        /// Seuil franchi ; la porte est ouverte par la loi.
        case eligible
    }

    /// Raison structurée pour le libellé grisé — trois formes depuis
    /// l'amendement S1 : « jamais en conversation directe », « s'ouvrira à N
    /// personnes actives » (compte inconnu), « s'ouvrira à N — M aujourd'hui ».
    nonisolated public struct RiverEligibilityReason: Sendable, Equatable {
        public let threshold: Int
        /// `nil` = compte de participants actifs INCONNU — PAS « zéro ».
        /// Aucune surface client n'expose de décompte d'actifs par
        /// conversation aujourd'hui (livrable gateway G-123) ; rendre `0`
        /// faisait AFFICHER « 0 aujourd'hui », un chiffre fabriqué.
        public let current: Int?
        public let riverReason: RiverEligibilityReasonKind

        public init(threshold: Int, current: Int?, riverReason: RiverEligibilityReasonKind) {
            self.threshold = threshold
            self.current = current
            self.riverReason = riverReason
        }
    }

    nonisolated public struct ReadingModeCapabilities: Sendable, Equatable {
        public let availableModes: [ConversationReadingMode]
        public let riverEligible: Bool
        public let riverEligibilityReason: RiverEligibilityReason

        public init(
            availableModes: [ConversationReadingMode],
            riverEligible: Bool,
            riverEligibilityReason: RiverEligibilityReason
        ) {
            self.availableModes = availableModes
            self.riverEligible = riverEligible
            self.riverEligibilityReason = riverEligibilityReason
        }
    }

    nonisolated public struct OrchestratorDecisionInput: Sendable {
        public let unreadCount: Int
        /// `nil` = jamais ouverte (miroir du `null` TypeScript).
        public let lastOpenedAt: Date?
        public let now: Date
        public let stickyChoice: ReadingModePreference
        /// Le catalogue BORNE la décision, drapeau on : la loi ne rend jamais
        /// un mode que l'écran ne saurait pas ouvrir (REV-1, blocage 3).
        public let capabilities: ReadingModeCapabilities
        public let isFlagEnabled: Bool

        public init(
            unreadCount: Int,
            lastOpenedAt: Date?,
            now: Date,
            stickyChoice: ReadingModePreference,
            capabilities: ReadingModeCapabilities,
            isFlagEnabled: Bool
        ) {
            self.unreadCount = unreadCount
            self.lastOpenedAt = lastOpenedAt
            self.now = now
            self.stickyChoice = stickyChoice
            self.capabilities = capabilities
            self.isFlagEnabled = isFlagEnabled
        }
    }

    /// `ReadingModePreference` → image numérique de la loi. `.auto` retourne
    /// `nil` et rend la main aux branches numériques — miroir exhaustif de
    /// `STICKY_MODE_BY_PREFERENCE` (`Exclude<ReadingModePreference, 'auto'>`
    /// côté TS), ici un `switch` exhaustif plutôt qu'un dictionnaire : aucune
    /// clé manquante possible, pas de `static let` de collection à maintenir.
    private static func stickyMode(for preference: ReadingModePreference) -> ConversationReadingMode? {
        switch preference {
        case .auto: return nil
        case .focal: return .focal
        case .script: return .script
        case .resume: return .summary
        case .riviere: return .river
        }
    }

    /// « Absence » = jamais ouverte (`nil`) OU dernière ouverture il y a plus
    /// de `absenceWindowMs`. Une horloge fournie illisible (`NaN`, résidu
    /// défensif du miroir TS où `lastOpenedAt` peut être une chaîne
    /// invalide) est traitée comme une absence plutôt que comme une distance
    /// infinie — même parti pris défensif que `getUserPresenceStatus` pour
    /// `lastActiveAt`.
    private static func isReaderAbsent(lastOpenedAt: Date?, now: Date) -> Bool {
        guard let lastOpenedAt else { return true }
        let lastOpenedMs = lastOpenedAt.timeIntervalSince1970 * 1000
        if lastOpenedMs.isNaN { return true }
        let nowMs = now.timeIntervalSince1970 * 1000
        return nowMs - lastOpenedMs > absenceWindowMs
    }

    /// Repli du clamp : `.focal` est le PLANCHER de la loi, présent dans tous
    /// les catalogues drapeau-on. C'est aussi pourquoi la branche par défaut
    /// n'est pas clampée : elle rend déjà le repli, et se clamper soi-même
    /// serait circulaire.
    private static let clampFallbackMode: ConversationReadingMode = .focal

    /// Borne une décision naturelle au catalogue du lecteur. Hors catalogue
    /// ⇒ repli `.focal` avec sa raison dédiée, pour que l'encoche
    /// « AUTO · … » dise la vérité : le mode n'a pas été choisi, il a été
    /// rabattu.
    private static func clampToCapabilities(
        _ decision: OrchestratorDecision,
        capabilities: ReadingModeCapabilities
    ) -> OrchestratorDecision {
        capabilities.availableModes.contains(decision.mode)
            ? decision
            : OrchestratorDecision(mode: clampFallbackMode, reason: .clampedUnavailable)
    }

    /// Orchestrateur des modes de lecture. Priorité stricte, dans cet ordre —
    /// table de correspondance branche à branche avec `resolveOrchestratorDecision`
    /// (`reading-modes.ts`) :
    ///
    /// | # | Branche TS | Branche Swift | Clampée |
    /// |---|---|---|---|
    /// | 1 | `!input.isFlagEnabled` → `'bubbles'`/`flag-disabled` | `!input.isFlagEnabled` → `.bubbles`/`.flagDisabled` | NON |
    /// | 2 | `stickyChoice !== 'auto'` → `STICKY_MODE_BY_PREFERENCE[...]`/`sticky` | `stickyChoice != .auto` → `stickyMode(for:)`/`.sticky` | OUI |
    /// | 3 | `unreadCount > 25` → `'summary'`/`unread-over-cap` | `unreadCount > unreadCap` → `.summary`/`.unreadOverCap` | OUI |
    /// | 4 | absence ET `unreadCount >= 10` → `'summary'`/`stale-absence` | idem → `.summary`/`.staleAbsence` | OUI |
    /// | 5 | défaut → `'focal'`/`default` | défaut → `.focal`/`.default` | NON (déjà le repli) |
    ///
    /// INVARIANT (REV-1, blocage 3) : drapeau on, le mode rendu appartient
    /// TOUJOURS à `capabilities.availableModes`.
    nonisolated public static func resolveOrchestratorDecision(
        _ input: OrchestratorDecisionInput
    ) -> OrchestratorDecision {
        if !input.isFlagEnabled {
            return OrchestratorDecision(mode: .bubbles, reason: .flagDisabled)
        }

        if input.stickyChoice != .auto, let sticky = stickyMode(for: input.stickyChoice) {
            return clampToCapabilities(
                OrchestratorDecision(mode: sticky, reason: .sticky),
                capabilities: input.capabilities
            )
        }

        if input.unreadCount > unreadCap {
            return clampToCapabilities(
                OrchestratorDecision(mode: .summary, reason: .unreadOverCap),
                capabilities: input.capabilities
            )
        }

        if input.unreadCount >= absenceUnreadFloor,
           isReaderAbsent(lastOpenedAt: input.lastOpenedAt, now: input.now) {
            return clampToCapabilities(
                OrchestratorDecision(mode: .summary, reason: .staleAbsence),
                capabilities: input.capabilities
            )
        }

        return OrchestratorDecision(mode: clampFallbackMode, reason: .default)
    }

    /// Image du pont `ConversationBridge.suggestedMode`, qui ne connaît que
    /// deux valeurs.
    nonisolated public enum BridgeSuggestedMode: String, Codable, Sendable, Equatable {
        case focal
        case resume
    }

    /// Projection TOTALE de la décision d'orchestrateur vers
    /// `ConversationBridge.suggestedMode` — miroir de `toBridgeSuggestedMode`.
    /// Seul `.summary` (le Résumé Vivant) se projette en `.resume` ; `.focal`,
    /// `.script`, `.river` et `.bubbles` ouvrent tous le fil, donc `.focal`.
    /// La `reason` n'entre pas dans la projection : le pont annonce une
    /// destination, pas un motif.
    nonisolated public static func toBridgeSuggestedMode(_ decision: OrchestratorDecision) -> BridgeSuggestedMode {
        decision.mode == .summary ? .resume : .focal
    }

    // =========================================================================
    // C-012 — resolveCapabilities
    // =========================================================================

    /// UNIQUE point de branchement invité/inscrit du chantier reading-modes.
    /// Toute autre lecture d'`isAnonymous` dans les lois de lecture — ce
    /// fichier ou ses futurs voisins `Focal/Core/` — est un bug de contrat.
    nonisolated public struct ReadingModeIdentity: Sendable, Equatable {
        public let isAnonymous: Bool

        public init(isAnonymous: Bool) {
            self.isAnonymous = isAnonymous
        }
    }

    nonisolated public struct ResolveCapabilitiesInput: Sendable {
        public let identity: ReadingModeIdentity
        public let isFlagEnabled: Bool
        /// Drapeau PROPRE à la Rivière (`riviere_mode`, défaut OFF —
        /// amendement R). Distinct de `isFlagEnabled` (la Lentille). Défaut
        /// `false` : un appelant qui ignore l'amendement obtient exactement
        /// le catalogue d'avant — miroir du `isRiverFlagEnabled?: boolean`
        /// TS (absent ⇒ `false`).
        public let isRiverFlagEnabled: Bool
        public let conversationType: ConversationType
        /// `nil` = INCONNU (amendement S1, REV-3/B3) — miroir du
        /// `number | null` TS. Rétro-compatible : un appelant qui connaît le
        /// compte passe toujours un `Int` (promotion implicite vers `Int?`) et
        /// la loi se comporte exactement comme avant. Un compte inconnu ne
        /// rend JAMAIS éligible : faux négatif temporaire toléré, faux positif
        /// interdit.
        public let activeParticipantCount: Int?

        public init(
            identity: ReadingModeIdentity,
            isFlagEnabled: Bool,
            isRiverFlagEnabled: Bool = false,
            conversationType: ConversationType,
            activeParticipantCount: Int?
        ) {
            self.identity = identity
            self.isFlagEnabled = isFlagEnabled
            self.isRiverFlagEnabled = isRiverFlagEnabled
            self.conversationType = conversationType
            self.activeParticipantCount = activeParticipantCount
        }
    }

    /// Catalogues de modes sélectionnables par identité, drapeau on.
    /// `.summary` est masqué pour un invité (`/stats` et `/analysis` sont
    /// `requiredAuth` → 403 pour une session anonyme). `.bubbles` n'apparaît
    /// que drapeau éteint. `.river` s'AJOUTE à ces catalogues quand son
    /// propre drapeau est on ET la conversation éligible.
    private static let registeredAvailableModes: [ConversationReadingMode] = [.focal, .script, .summary]
    private static let anonymousAvailableModes: [ConversationReadingMode] = [.focal, .script]
    private static let flagDisabledAvailableModes: [ConversationReadingMode] = [.bubbles]

    /// Capacités de mode de lecture pour une conversation donnée — miroir de
    /// `resolveCapabilities`.
    ///
    /// AMENDEMENT R : la Rivière ENTRE au catalogue dès que
    /// `isRiverFlagEnabled && riverEligible` — invités éligibles compris
    /// (catalogue invité amputé du seul `.summary`, la Rivière ne consommant
    /// aucun endpoint `requiredAuth`).
    ///
    /// `riverEligibilityReason` est servie dans TOUS les cas — y compris
    /// drapeau éteint et conversation inéligible.
    ///
    /// AMENDEMENT S1 (REV-3/B3) : la raison se TRIFURQUE (`riverReason`) et le
    /// compte devient faillible (`current: Int?`). `direct` ⇒ `.neverEligible`
    /// (« jamais en conversation directe ») ; compte connu sous le seuil ⇒
    /// `.belowThreshold` avec ses deux nombres ; compte INCONNU ⇒
    /// `.belowThreshold` avec `current == nil`, et le libellé se tait sur le
    /// nombre au lieu d'afficher un « 0 aujourd'hui » fabriqué.
    nonisolated public static func resolveCapabilities(
        _ input: ResolveCapabilitiesInput
    ) -> ReadingModeCapabilities {
        let activeParticipantCount = input.activeParticipantCount
        let isNeverEligible = input.conversationType == .direct
        // `nil` (compte inconnu) ⇒ `false` : un compte qu'on ne connaît pas ne
        // franchit aucun seuil. Miroir exact du `count !== null && count >= …`
        // TypeScript.
        let riverEligible = !isNeverEligible
            && (activeParticipantCount.map { $0 >= riverEligibilityThreshold } ?? false)

        // AMENDEMENT S1 (REV-3/B3) : trois raisons, jamais une seule formule.
        // `direct` d'abord — c'est la seule branche que le compte ne peut PAS
        // renverser, et la seule à laquelle « s'ouvrira à 5 » mentait.
        let riverReason: RiverEligibilityReasonKind = isNeverEligible
            ? .neverEligible
            : (riverEligible ? .eligible : .belowThreshold)

        let riverEligibilityReason = RiverEligibilityReason(
            threshold: riverEligibilityThreshold,
            current: activeParticipantCount,
            riverReason: riverReason
        )

        if !input.isFlagEnabled {
            return ReadingModeCapabilities(
                availableModes: flagDisabledAvailableModes,
                riverEligible: riverEligible,
                riverEligibilityReason: riverEligibilityReason
            )
        }

        let baseModes = input.identity.isAnonymous ? anonymousAvailableModes : registeredAvailableModes
        let riverSelectable = input.isRiverFlagEnabled && riverEligible

        return ReadingModeCapabilities(
            availableModes: riverSelectable ? baseModes + [.river] : baseModes,
            riverEligible: riverEligible,
            riverEligibilityReason: riverEligibilityReason
        )
    }

    // =========================================================================
    // C-013 — resolveAssistTier + AssistCapabilityProbing
    // =========================================================================

    nonisolated public enum AssistTier: String, Codable, Sendable, Equatable {
        case localAgent
        case serverAgent
        case deterministic
    }

    nonisolated public struct AssistTierInput: Sendable {
        public let deviceCapability: Bool
        /// `nil` = miroir du `null` TypeScript (`EncryptionMode | null`).
        public let encryptionMode: EncryptionMode?
        public let userConsent: Bool
        /// Réservé — figé par la signature du contrat (workshop §4.4). Aucune
        /// branche de la cascade ne dépend du type de conversation aujourd'hui.
        public let conversationType: ConversationType

        public init(
            deviceCapability: Bool,
            encryptionMode: EncryptionMode?,
            userConsent: Bool,
            conversationType: ConversationType
        ) {
            self.deviceCapability = deviceCapability
            self.encryptionMode = encryptionMode
            self.userConsent = userConsent
            self.conversationType = conversationType
        }
    }

    /// Contrat de sonde de capacité d'agent local — miroir de
    /// `AssistCapabilityProbing`.
    public protocol AssistCapabilityProbing: Sendable {
        func probe(conversationType: ConversationType) -> Bool
    }

    /// Implémentation d'aujourd'hui : aucun appareil n'est jamais capable —
    /// miroir de `neverCapableProbe`.
    nonisolated public struct NeverCapableProbe: AssistCapabilityProbing {
        public init() {}
        public func probe(conversationType: ConversationType) -> Bool { false }
    }

    /// Cascade de confidentialité de l'assistance — agent local (rang 1) →
    /// `services/agent` (rang 2) → pont déterministe (rang 3, plancher
    /// permanent). Miroir de `resolveAssistTier`.
    ///
    /// GARDE NON NÉGOCIABLE (workshop §4.4) : `encryptionMode == .e2ee`
    /// exclut le rang serveur quelle que soit la sonde de capacité ou le
    /// consentement — le serveur ne détient jamais le clair d'une
    /// conversation e2ee. Un appareil incapable en e2ee retombe directement
    /// au rang 3 (`.deterministic`), JAMAIS au rang 2 (`.serverAgent`).
    nonisolated public static func resolveAssistTier(_ input: AssistTierInput) -> AssistTier {
        if input.deviceCapability { return .localAgent }
        if input.encryptionMode == .e2ee { return .deterministic }
        return input.userConsent ? .serverAgent : .deterministic
    }
}
