nonisolated enum CallErrorDisposition: Equatable {
    case ignore
    case reconcileEnd(callId: String)
    case surface(endsCall: Bool)

    static func resolve(
        code: String?,
        errorCallId: String?,
        currentCallId: String?,
        isTransientDuringResume: Bool,
        callIsActive: Bool
    ) -> CallErrorDisposition {
        if let errorCallId, errorCallId != currentCallId { return .ignore }
        if let code, nonFatalRelayCodes.contains(code) { return .ignore }
        if code == "CALL_ENDED" { return reconcile(errorCallId ?? currentCallId) }
        if isTransientDuringResume { return .ignore }
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
