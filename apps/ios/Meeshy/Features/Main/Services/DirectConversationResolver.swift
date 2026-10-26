import Foundation
import MeeshySDK

/// La conversation DIRECTE avec un utilisateur : le tête-à-tête chiffré de bout
/// en bout s'il existe, sinon le dernier actif, sinon un neuf (#13006, même
/// règle que la passerelle, #12966). Site UNIQUE, partagé par la réponse AMORCÉE (une story ou une
/// humeur ouvre la DM, composer prêt — `Router.navigateToStoryReply`) et la
/// réponse ENVOYÉE depuis la page plein écran d'une humeur (#10814). Deux
/// copies de cette cascade auraient pu choisir deux conversations différentes
/// pour le même auteur.
enum DirectConversationResolver {
    static func resolve(
        with userId: String,
        conversations: ConversationServiceProviding = ConversationService.shared,
        ledger: EndToEndRegimeLedger = .shared
    ) async throws -> APIConversation {
        if let existing = try await existing(with: userId, conversations: conversations, ledger: ledger) {
            return existing
        }
        let created = try await conversations.create(type: "direct", title: nil, participantIds: [userId])
        return try await conversations.getById(created.id)
    }
}

extension DirectConversationResolver {
    /// Le tête-à-tête EXISTANT avec `userId`, rendu par la passerelle : le
    /// chiffré d'abord — servi tel, ou vu tel par ce compte même servi sans
    /// mode (#12949, audit #12985 M5) —, sinon le plus récent. La mémoire se
    /// lie d'abord au compte actif ; sans compte, rien ne prouve qu'un
    /// tête-à-tête servi sans mode est lisible : la résolution refuse de
    /// choisir, et `resolve` demande le tête-à-tête à la passerelle, qui rend
    /// le chiffré d'abord (#12966).
    static func existing(
        with userId: String,
        conversations: ConversationServiceProviding = ConversationService.shared,
        ledger: EndToEndRegimeLedger = .shared,
        account: @MainActor () -> String? = EndToEndDestinationGuard.activeAccount
    ) async throws -> APIConversation? {
        guard ledger.ensureBound(to: account) else { return nil }
        let candidates = try await conversations.findDirectsWith(userId: userId)
        return DirectPairChoice.preferred(among: candidates) { ledger.remembersEndToEnd($0) }
    }

    /// Le tête-à-tête avec `userId` parmi ceux déjà chargés (liste, cache) :
    /// le chiffré de bout en bout d'abord — servi tel, ou vu tel par ce compte
    /// (#12949) —, sinon le plus récemment actif. Deux tête-à-tête avec le même
    /// contact ne se confondent jamais : le résultat s'ouvre par son id.
    static func loaded(
        with userId: String,
        in conversations: [MeeshyConversation],
        ledger: EndToEndRegimeLedger = .shared,
        account: @MainActor () -> String? = EndToEndDestinationGuard.activeAccount
    ) -> MeeshyConversation? {
        guard ledger.ensureBound(to: account) else { return nil }
        return DirectPairChoice.preferred(among: conversations, with: userId) { ledger.remembersEndToEnd($0) }
    }
}
