import Foundation
import MeeshySDK

/// L'écran « je rattrape » — deux étages (contrat §WS-9) : le digest
/// déterministe (TOUJOURS, calculé synchrone par l'appelant depuis
/// `MessageStore` déjà en mémoire) et l'enrichissement agent (SEULEMENT si
/// `analysisProvider` répond, en arrière-plan, jamais bloquant).
///
/// **Cache-first, contrainte dure §WS-9** : ce ViewModel ne recalcule JAMAIS
/// le digest lui-même — il le REÇOIT déjà construit (`DeterministicDigestBuilder`
/// + `EpisodeSegmenter` + `FaceRampRanking`, tous WS-8, appelés par le site
/// de montage AVANT la construction de ce VM). `refreshAgentEnrichment()`
/// est le SEUL travail asynchrone de ce fichier.
@MainActor
final class LivingSummaryViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var digest: DeterministicConversationDigest
    @Published private(set) var faceRamp: [FaceRampEntry]
    /// Résumé de l'agent (§6.1, RÉEL — pas un stub) — `nil` tant qu'aucune
    /// réponse n'est arrivée, restera `nil` pour un invité (`analysisProvider
    /// == nil`) ou en erreur. PORTÉE CONVERSATION ENTIÈRE, jamais mélangé aux
    /// comptes du digest (C2 — voir doc de tête de `ConversationAnalysisProviding`).
    @Published private(set) var agentSummary: ConversationSummaryAnalysis?
    @Published private(set) var isRefreshingAgent = false

    /// `nil` ⇒ pas de tentative réseau (invité, §5 — 403 systématique sur ces
    /// routes `requiredAuth`). Résolu par l'appelant AVANT construction — ce
    /// VM ne relit jamais `isAnonymous` lui-même (garde §3.2 du contrat
    /// Lentille : un seul point de branchement invité/inscrit).
    private let analysisProvider: ConversationAnalysisProviding?
    private let conversationId: String

    init(
        digest: DeterministicConversationDigest,
        faceRamp: [FaceRampEntry],
        analysisProvider: ConversationAnalysisProviding?,
        conversationId: String
    ) {
        self.digest = digest
        self.faceRamp = faceRamp
        self.analysisProvider = analysisProvider
        self.conversationId = conversationId
    }

    /// Squelette UNIQUEMENT sur cache vide (contrat §WS-9 : « aucun spinner
    /// bloquant quand le digest existe »).
    var showsSkeleton: Bool {
        digest.messageCount == 0 && faceRamp.isEmpty && agentSummary == nil
    }

    /// « L'écran n'est jamais vide » (critère §WS-9) même quand digest ET
    /// agent sont tous deux silencieux — le squelette lui-même EST le
    /// contenu affiché dans ce cas (jamais un `EmptyView`).
    var isEmpty: Bool { false }

    /// Rafraîchit l'enrichissement agent en arrière-plan. `nil` provider
    /// (invité) OU erreur (403, budget, indisponibilité) ⇒ no-op silencieux,
    /// AUCUN message d'erreur affiché — le digest déterministe reste seul,
    /// C1 (l'étage déterministe est le plancher, définitivement).
    func refreshAgentEnrichment() async {
        guard let analysisProvider else { return }
        isRefreshingAgent = true
        defer { isRefreshingAgent = false }
        do {
            let analysis = try await analysisProvider.fetchAnalysis(conversationId: conversationId)
            agentSummary = analysis.summary
        } catch {
            agentSummary = nil
        }
    }
}
