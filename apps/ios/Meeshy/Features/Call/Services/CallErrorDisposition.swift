/// Ce que fait un `call:error` à l'appel en cours.
///
/// Seule une erreur qui rend l'appel impossible le termine. Le refus d'une
/// requête ACCESSOIRE — rafraîchissement TURN, bascule de média, requête
/// d'état — ne dit rien de l'appel : en production, une passerelle ancienne
/// refusait le rafraîchissement TURN d'un appareil qui venait de décrocher
/// (`NOT_A_PARTICIPANT`, #11463) et iOS raccrochait 0,3 s plus tard (#11468).
nonisolated enum CallErrorDisposition: Equatable {
    case ignore
    case reconcileEnd(callId: String)
    case surface(endsCall: Bool)

    static func resolve(
        code: String?,
        errorCallId: String?,
        currentCallId: String?,
        isTransientDuringResume: Bool,
        answersAccessoryRequest: Bool,
        callIsActive: Bool
    ) -> CallErrorDisposition {
        if let errorCallId, errorCallId != currentCallId { return .ignore }
        if let code, nonFatalRelayCodes.contains(code) { return .ignore }
        if code == "CALL_ENDED" { return reconcile(errorCallId ?? currentCallId) }
        if isTransientDuringResume { return .ignore }
        if answersAccessoryRequest { return .ignore }
        return .surface(endsCall: callIsActive)
    }

    private static let nonFatalRelayCodes: Set<String> = [
        "INVALID_SIGNAL", "RATE_LIMIT_EXCEEDED", "TARGET_NOT_FOUND"
    ]

    private static func reconcile(_ callId: String?) -> CallErrorDisposition {
        guard let callId else { return .ignore }
        return .reconcileEnd(callId: callId)
    }
}
