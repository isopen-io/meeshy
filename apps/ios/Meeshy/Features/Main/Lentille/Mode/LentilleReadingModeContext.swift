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
    /// G-123, hors périmètre LWS-8). En attendant, `0` : une valeur RÉELLE
    /// (jamais un texte fabriqué), qui ne peut FAUSSER l'éligibilité dans
    /// AUCUN sens — le seuil est `>= 5` (`ReadingModeOrchestrator
    /// .riverEligibilityThreshold`), donc `0` ne peut jamais rendre
    /// éligible une conversation qui ne l'est pas : le risque est
    /// uniquement un faux NÉGATIF temporaire, jamais un faux positif.
    /// À remplacer par le champ serveur dès G-123 livré (extension de
    /// `Conversation`, hors ce fichier).
    static func activeParticipantCount(for conversation: Conversation) -> Int {
        0
    }

    // MARK: - Entrées de la loi

    static func capabilitiesInput(
        for conversation: Conversation,
        isAnonymous: Bool,
        isLentilleFlagEnabled: Bool
    ) -> ReadingModeOrchestrator.ResolveCapabilitiesInput {
        ReadingModeOrchestrator.ResolveCapabilitiesInput(
            identity: ReadingModeOrchestrator.ReadingModeIdentity(isAnonymous: isAnonymous),
            isFlagEnabled: isLentilleFlagEnabled,
            // V3 : le drapeau `riviere_mode` n'existe pas encore (amendement
            // R, R-133 hors périmètre de ce lot) — toujours `false`, jamais
            // lu depuis un flag ici : Rivière reste TOUJOURS grisée en V3
            // quel que soit `activeParticipantCount`.
            isRiverFlagEnabled: false,
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
        isLentilleFlagEnabled: Bool
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            capabilitiesInput(for: conversation, isAnonymous: isAnonymous, isLentilleFlagEnabled: isLentilleFlagEnabled)
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

// MARK: - Store partagé (M-048) — UNE préférence, trois points d'entrée

/// L'encoche (I-071), le sous-menu « Mode de lecture » et l'aperçu (I-072)
/// doivent lire/écrire EXACTEMENT le même magasin — sinon « trois points
/// d'entrée, une préférence » (contrat LWS-8) devient trois préférences.
///
/// `LocalReadingModePreferenceStore` (`Lentille/Core/LentilleProviders.swift`,
/// GELÉ M-048) n'expose pas de singleton — ce fichier n'a pas le droit
/// d'éditer ce fichier gelé pour lui en ajouter un. Ce point d'accès partagé
/// vit donc ici, au plus près de ses trois consommateurs, sur le modèle des
/// autres `.shared` de l'app (`PresenceManager.shared`,
/// `ConversationLockManager.shared`).
nonisolated enum LentilleReadingModePreferenceCenter {
    static let shared: ReadingModePreferenceStoring = LocalReadingModePreferenceStore()
}
