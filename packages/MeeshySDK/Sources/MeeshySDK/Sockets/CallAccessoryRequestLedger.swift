import Foundation
import os

/// Une requête d'appel ACCESSOIRE : elle sert l'appel sans le porter. Son refus
/// (`call:error`) ne dit rien de la possibilité de l'appel — une passerelle
/// ancienne refusait le rafraîchissement TURN d'un appareil qui venait de
/// décrocher par `NOT_A_PARTICIPANT` (#11463), et le client raccrochait.
public enum CallAccessoryRequest: String, Sendable, Equatable {
    /// `call:request-ice-servers`
    case turnCredentials
    /// `call:toggle-audio`, `call:toggle-video`
    case mediaToggle
    /// `call:check-active`
    case stateQuery
}

/// Les requêtes accessoires que ce client vient d'émettre. `call:error` ne nomme
/// pas l'événement qu'il refuse : une erreur reçue peu après une requête
/// accessoire du même appel lui est attribuée.
public struct CallAccessoryRequestLedger: Sendable, Equatable {

    public struct Entry: Sendable, Equatable {
        public let request: CallAccessoryRequest
        public let callId: String?
        public let emittedAt: Date
    }

    /// Le refus d'une requête arrive en quelques centaines de millisecondes ;
    /// la fenêtre couvre une passerelle chargée sans attribuer à une requête
    /// ancienne l'erreur d'une opération suivante.
    public static let attributionWindow: TimeInterval = 8

    private static let capacity = 16

    public private(set) var entries: [Entry] = []

    public init() {}

    public mutating func record(_ request: CallAccessoryRequest, callId: String?, at now: Date) {
        let live = entries.filter { now.timeIntervalSince($0.emittedAt) <= Self.attributionWindow }
        entries = Array((live + [Entry(request: request, callId: callId, emittedAt: now)]).suffix(Self.capacity))
    }

    /// La dernière requête accessoire à laquelle une erreur de l'appel
    /// `errorCallId` (nil : appel non nommé) peut répondre à `now`.
    public func request(answeredBy errorCallId: String?, at now: Date) -> CallAccessoryRequest? {
        entries.last { entry in
            let age = now.timeIntervalSince(entry.emittedAt)
            guard age >= 0, age <= Self.attributionWindow else { return false }
            guard let errorCallId, let entryCallId = entry.callId else { return true }
            return errorCallId == entryCallId
        }?.request
    }
}

/// Le registre des requêtes accessoires que le socket de messages émet,
/// partagé entre le fil du socket et celui qui lit un `call:error`.
public final class CallAccessoryRequestLog: Sendable {
    public static let shared = CallAccessoryRequestLog()

    private let ledger = OSAllocatedUnfairLock(initialState: CallAccessoryRequestLedger())

    public init() {}

    public func record(_ request: CallAccessoryRequest, callId: String?, at now: Date = Date()) {
        ledger.withLock { $0.record(request, callId: callId, at: now) }
    }

    /// La requête accessoire récente à laquelle un `call:error` de l'appel
    /// `callId` répond, s'il y en a une : son refus ne termine pas l'appel.
    public func request(answeredBy callId: String?, at now: Date = Date()) -> CallAccessoryRequest? {
        ledger.withLock { $0.request(answeredBy: callId, at: now) }
    }
}
