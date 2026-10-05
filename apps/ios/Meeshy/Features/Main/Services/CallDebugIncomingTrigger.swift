#if DEBUG
import Foundation

/// **Un appel entrant de RECETTE, sans appelant réel (#8725).**
///
/// Pour vérifier au simulateur que la vue d'appel se pose par-dessus un plein
/// écran (story, réels, visionneuse), il faut un appel qui sonne PENDANT que cet
/// écran est ouvert — et aucun vrai compte ne doit être appelé. Une notification
/// Darwin, postée depuis l'hôte, fait sonner la pile locale :
///
/// ```
/// xcrun simctl spawn <udid> notifyutil -p me.meeshy.debug.incomingCall
/// ```
///
/// L'appel n'existe que dans cette instance : son identifiant n'est connu
/// d'aucune passerelle. Rien de ceci n'existe dans un build Release.
enum CallDebugIncomingTrigger {
    static let darwinName = "me.meeshy.debug.incomingCall"
    static let callerName = "Appel de recette"

    private static var isArmed = false

    @MainActor
    static func arm() {
        guard !isArmed else { return }
        isArmed = true
        CFNotificationCenterAddObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            nil,
            { _, _, _, _, _ in
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { CallDebugIncomingTrigger.ring() }
                }
            },
            darwinName as CFString,
            nil,
            .deliverImmediately
        )
    }

    /// Au format d'un ObjectId (24 hex) : un identifiant d'une autre forme est
    /// refusé par la validation de la passerelle, et ce refus raccroche l'appel
    /// de recette avant qu'on ait pu le réduire.
    static func debugCallId() -> String {
        (0..<24).map { _ in String(Int.random(in: 0..<16), radix: 16) }.joined()
    }

    @MainActor
    static func ring() {
        CallManagerHost.shared.require().handleIncomingCallNotification(
            callId: debugCallId(),
            fromUserId: "",
            fromUsername: callerName,
            isVideo: false
        )
    }
}
#endif
