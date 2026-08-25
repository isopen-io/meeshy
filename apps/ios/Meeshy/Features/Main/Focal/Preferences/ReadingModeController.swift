import Foundation

/// Contrôleur observable du mode de lecture d'UNE conversation ouverte —
/// contrat `focal-implementation-contract.md` §WS-1. Enveloppe la loi gelée
/// `ReadingModeOrchestrator.resolveOrchestratorDecision` (`Focal/Core/`,
/// M-042) + le stockage local scopé (`ReadingModePreferenceStore`, ce
/// dossier). WS-7 (lot ultérieur, `ConversationView.init`) instancie et
/// possède ce contrôleur pour la durée de vie de l'écran ; F-080 livre la
/// coquille testable seule — la construction n'est PAS appelée depuis
/// `ConversationView` dans cette tâche (hors périmètre WS-1, propriété WS-7
/// §1.2).
///
/// **Écart assumé vs contrat §3.5** : `decision` y est typée
/// `ReadingModeDecision` (mode + source + `showsBridge` + `anchorMessageId`
/// + `reasonKey`) — un type qui n'existe nulle part dans le Core gelé
/// (RE-PREUVE F-080). `showsBridge`/`anchorMessageId` dépendent du pont ✦ et
/// du premier message non lu, deux calculs que WS-1 ne possède pas (bridge :
/// LWS-2bis/Lentille ; ancre : WS-6/WS-7). Ce contrôleur expose donc
/// `decision: ReadingModeOrchestrator.OrchestratorDecision` (mode + reason),
/// le type RÉEL que la loi gelée produit — moins riche que le contrat, mais
/// honnête : rien n'est inventé pour combler ce que la loi ne rend pas.
@MainActor
final class ReadingModeController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published private(set) var mode: ConversationReadingMode
    @Published private(set) var decision: ReadingModeOrchestrator.OrchestratorDecision

    private let conversationId: String
    private let scope: ReadingModePreferenceScope
    private let unreadCount: Int
    private let capabilities: ReadingModeOrchestrator.ReadingModeCapabilities
    private let isFlagEnabled: Bool
    private let store: FocalReadingModePreferenceStoring
    private let now: () -> Date

    /// I-075 — override ÉPHÉMÈRE posé par l'item « Focal (bêta) » du menu
    /// d'appui long de la liste, gardé par `BetaFeaturesPreference.isEnabled`
    /// (préférence utilisateur, défaut ON — amendement produit 2026-08-16).
    /// Non-`nil` ⇒ la
    /// décision D'OUVERTURE de CETTE instance est `forcedMode`, quels que
    /// soient le drapeau `reading_modes`, la préférence collante ou le compte
    /// de non-lus — court-circuite `Self.decide` (donc
    /// `ReadingModeOrchestrator.resolveOrchestratorDecision`, la loi GELÉE,
    /// INTACTE ici : ni lue ni dupliquée) plutôt que de dupliquer la loi.
    /// `nil` (défaut) ⇒ `init` bit-à-bit identique à avant ce lot. N'affecte
    /// QUE la décision initiale : un `select()`/`resetToAuto()` manuel
    /// ultérieur (Aa, feuille Lentille) reprend la loi normale — cet écran
    /// n'est jamais verrouillé sur Focal, seule son OUVERTURE l'est.
    private let forcedMode: ConversationReadingMode?

    init(
        conversationId: String,
        scope: ReadingModePreferenceScope,
        unreadCount: Int,
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        isFlagEnabled: Bool,
        forcedMode: ConversationReadingMode? = nil,
        store: FocalReadingModePreferenceStoring = ReadingModePreferenceStore(),
        now: @escaping () -> Date = Date.init
    ) {
        self.conversationId = conversationId
        self.scope = scope
        self.unreadCount = unreadCount
        self.capabilities = capabilities
        self.isFlagEnabled = isFlagEnabled
        self.forcedMode = forcedMode
        self.store = store
        self.now = now

        if let forcedMode {
            // I-075 : AUCUNE lecture du store, AUCUNE dépendance au drapeau
            // ni aux capacités — la décision d'ouverture EST `forcedMode`.
            // `.default` est réutilisé comme raison faute de cas dédié dans
            // la loi GELÉE (`OrchestratorDecisionReason` n'est pas amendée
            // pour ce lot dev-only) : conséquence cosmétique acceptée,
            // documentée ici — l'encoche affichera « AUTO · … » plutôt qu'un
            // libellé « forcé » dédié.
            let forced = ReadingModeOrchestrator.OrchestratorDecision(mode: forcedMode, reason: .default)
            self.decision = forced
            self.mode = forced.mode
        } else {
            let sticky = store.mode(for: conversationId, scope: scope)
            let resolved = Self.renderDecision(
                stickyMode: sticky,
                lawDecision: Self.decide(
                    stickyMode: sticky,
                    unreadCount: unreadCount,
                    lastOpenedAt: store.lastOpenedAt(for: conversationId, scope: scope),
                    now: now(),
                    capabilities: capabilities,
                    isFlagEnabled: isFlagEnabled
                ),
                isFlagEnabled: isFlagEnabled
            )
            self.decision = resolved
            self.mode = resolved.mode
        }
    }

    /// Règle de RENDU iOS posée sur la décision de la loi partagée (2026-08-21).
    ///
    /// 1. **Focal est de retour** — le clamp `.focal → .script` du retrait
    ///    2026-08-18 est levé : la passe de perspective MINIMALE
    ///    (`FocalScrollPerspective`, transform + opacity CALayer sur les
    ///    cellules visibles, zéro relayout, zéro élection/atterrissage/carte)
    ///    remplace la machinerie qui boguait. `.focal` rendu par la loi (défaut,
    ///    choix collant, forçage) est rendu tel quel.
    /// 2. **Bulles est un choix** — un choix collant `.bubbles` drapeau ON est
    ///    RENDU `.bubbles` (raison `.sticky`), là où la loi partagée le rabat
    ///    sur `.focal`/`clamped-unavailable` (« bubbles » n'appartient à aucun
    ///    catalogue drapeau-on). Même chemin que le web
    ///    (`use-thread-reading-mode.ts`, `THREAD_MOUNTABLE_MODES` contient
    ///    `'bubbles'`) : la loi reste INTACTE (vecteurs TS↔Swift), la règle vit
    ///    à la CONSOMMATION, comme l'ancien clamp.
    private static func renderDecision(
        stickyMode: ConversationReadingMode?,
        lawDecision: ReadingModeOrchestrator.OrchestratorDecision,
        isFlagEnabled: Bool
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        guard isFlagEnabled, stickyMode == .bubbles else { return lawDecision }
        return ReadingModeOrchestrator.OrchestratorDecision(mode: .bubbles, reason: .sticky)
    }

    /// Fige un choix manuel — préférence collante (§WS-1 « préférence
    /// collante par conversation »).
    func select(_ mode: ConversationReadingMode) {
        store.setMode(mode, for: conversationId, scope: scope)
        recompute()
    }

    /// « Revenir en mode auto » — efface la clé, rend la main à
    /// l'orchestrateur (§WS-1 « revenir en mode auto disponible »).
    func resetToAuto() {
        store.setMode(nil, for: conversationId, scope: scope)
        recompute()
    }

    private func recompute() {
        let sticky = store.mode(for: conversationId, scope: scope)
        let resolved = Self.renderDecision(
            stickyMode: sticky,
            lawDecision: Self.decide(
                stickyMode: sticky,
                unreadCount: unreadCount,
                lastOpenedAt: store.lastOpenedAt(for: conversationId, scope: scope),
                now: now(),
                capabilities: capabilities,
                isFlagEnabled: isFlagEnabled
            ),
            isFlagEnabled: isFlagEnabled
        )
        decision = resolved
        mode = resolved.mode
    }

    private static func decide(
        stickyMode: ConversationReadingMode?,
        unreadCount: Int,
        lastOpenedAt: Date?,
        now: Date,
        capabilities: ReadingModeOrchestrator.ReadingModeCapabilities,
        isFlagEnabled: Bool
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        let input = ReadingModeOrchestrator.OrchestratorDecisionInput(
            unreadCount: unreadCount,
            lastOpenedAt: lastOpenedAt,
            now: now,
            stickyChoice: preference(for: stickyMode),
            capabilities: capabilities,
            isFlagEnabled: isFlagEnabled
        )
        return ReadingModeOrchestrator.resolveOrchestratorDecision(input)
    }

    /// Réciproque de `stickyMode(for:)` (privée côté `ReadingModeOrchestrator`) :
    /// traduit un mode RENDU mémorisé en préférence (les mots du menu) que
    /// l'orchestrateur consomme en entrée.
    ///
    /// REV-3/B2 : cette table vivait ici en `private static`. Depuis que
    /// l'adaptateur Lentille lit le MÊME magasin, elle a un second lecteur —
    /// elle a donc déménagé dans `ReadingModePreferenceMapping`
    /// (`ReadingModePreferenceStore.swift`, un seul domicile) et ce contrôleur
    /// s'y adresse au lieu d'en garder une copie.
    private static func preference(
        for mode: ConversationReadingMode?
    ) -> ReadingModeOrchestrator.ReadingModePreference {
        ReadingModePreferenceMapping.preference(for: mode)
    }
}
