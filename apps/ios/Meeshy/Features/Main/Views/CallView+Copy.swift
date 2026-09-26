import Foundation

// Les libellés de fin d'appel et d'échec des sous-titres, sortis de
// `CallView.swift` (hors budget de taille) pour faire la place du partage
// d'écran (#8063). Purs : ils ne lisent aucun état de la vue.

extension CallView {
    /// User-facing translation of `TranscriptionError` — `errorDescription` on
    /// the error type itself is an untranslated diagnostic string for logs,
    /// never meant for display (see its own doc comment).
    func transcriptionErrorMessage(for error: TranscriptionError) -> String {
        switch error {
        case .permissionDenied:
            return String(localized: "call.transcription.error.permissionDenied", defaultValue: "Autorisez la reconnaissance vocale dans Réglages pour activer les sous-titres.", bundle: .main)
        case .recognizerUnavailable, .onDeviceNotSupported:
            return String(localized: "call.transcription.error.unavailable", defaultValue: "Sous-titres indisponibles pour votre langue sur cet appareil.", bundle: .main)
        case .recognitionFailed, .audioEngineFailed, .tapFormatUnavailable:
            return String(localized: "call.transcription.error.failed", defaultValue: "Impossible d'activer les sous-titres. Réessayez.", bundle: .main)
        }
    }

    func endReasonText(_ reason: CallEndReason) -> String {
        switch reason {
        case .local: return String(localized: "call.ended.local")
        case .remote: return String(localized: "call.ended.remote")
        case .rejected: return String(localized: "call.ended.rejected")
        case .missed: return String(localized: "call.ended.missed")
        case .connectionLost: return String(localized: "call.ended.connectionLost")
        case .failed(let msg):
            // Use a static key with the message as a separate interpolation
            // arg via String.LocalizationValue. Putting `\(msg)` directly in
            // the key argument violates the StaticString requirement of
            // String(localized:) under Swift 6 strict mode.
            return String(
                localized: "call.ended.failed",
                defaultValue: "Échec de l'appel : \(msg)"
            )
        }
    }
}
