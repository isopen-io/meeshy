import Foundation

/// Erreur LOCALE levée par un `OutboxDispatching` avant tout appel réseau,
/// quand une ligne dépend d'une AUTRE ligne pas encore résolue — jamais un
/// refus serveur ni une panne réseau. Distincte de `MeeshyError` (qui
/// normalise des réponses réseau/serveur) précisément parce que rien n'a été
/// envoyé : la ligne attend une PRÉCONDITION locale, pas une réponse.
///
/// `OutboxFlusher` la reconnaît via une garde dédiée, même forme que
/// `isSessionExpiry` / `isNetworkTransportError` / `isPermanentServerRejection`
/// (`OutboxFlusher.swift`) : replanifier SANS consommer le budget de
/// tentatives — mais seulement pour une durée BORNÉE
/// (`OutboxFlusher.fanoutOriginWaitTimeout`). Contrairement à une session ou
/// un réseau, ce qu'on attend ici (une AUTRE ligne d'outbox) peut échouer
/// DÉFINITIVEMENT ; une exemption permanente laisserait la ligne dépendante
/// attendre pour l'éternité une origine qui n'arrivera jamais — un bug
/// distinct de celui que cette erreur corrige (Task 10, round 1 de revue).
public enum OutboxDeferralError: Error, Equatable, Sendable {
    /// Une ligne de fan-out de partage (`OfflineQueueItem
    /// .copyAttachmentsFromClientMessageId`) attend que sa cible d'origine
    /// obtienne son identifiant SERVEUR (écrit par `reconcileSuccessfulMessageSend`
    /// via `PendingIdRecord`). `clientMessageId` est l'identifiant LOCAL de
    /// cette origine — utile pour le diagnostic (`lastError` de la ligne),
    /// pas pour la décision : `OutboxFlusher` ne le lit pas, il ne fait que
    /// reconnaître le CAS.
    case waitingForFanoutOrigin(clientMessageId: String)
}
