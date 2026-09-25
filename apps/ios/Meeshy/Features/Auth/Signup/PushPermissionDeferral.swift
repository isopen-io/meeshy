import Foundation
import UIKit
import MeeshySDK

// MARK: - Ce que le report SAIT faire

/// Retenir qu'une demande de permission de notification est DUE, et savoir
/// qu'elle a été honorée.
///
/// Protocole déclaré au-dessus de son implémentation : la suite substitue un
/// double sans toucher aux `UserDefaults` du processus de test, où le marqueur
/// survivrait d'un test à l'autre.
@MainActor
protocol PushPermissionDeferring: AnyObject {
    /// Vrai tant qu'une demande différée n'a pas été honorée.
    var isPending: Bool { get }
    /// Note qu'il faudra demander — au premier message envoyé, pas avant.
    func postpone()
    /// Efface le marqueur. Appelée UNE fois, au moment où la demande part.
    func resolve()
}

/// Le report de la demande de permission de notification, du démarrage de
/// session au premier message ENVOYÉ.
///
/// **Le problème qu'il corrige** : l'app demandait la permission dès
/// `isAuthenticated`. Pour quelqu'un qui vient de créer son compte, l'alerte
/// système tombe donc sur un écran vide — pas une conversation, pas un contact,
/// rien à notifier. Un refus posé là est définitif (iOS ne repropose jamais
/// l'alerte de lui-même) et se paie ensuite sur chaque message reçu.
///
/// **Ce qu'il ne change PAS** : une session venue d'une CONNEXION garde le
/// comportement d'aujourd'hui — le compte existe, ses conversations aussi, la
/// demande est justifiée à la seconde où l'app s'ouvre.
///
/// Le marqueur vit dans `UserDefaults` et non en mémoire : entre l'inscription
/// et le premier message, l'app peut être fermée, relancée, mise à jour. Un
/// report qui ne survivrait pas à un redémarrage ne serait pas un report, ce
/// serait un oubli.
@MainActor
final class PushPermissionDeferral: PushPermissionDeferring {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Le nom du marqueur. Nommé, pas interpolé : il se cherche dans le dépôt.
    static let markerKey = "auth.signup.deferPushPermissionUntilFirstMessage"

    static let shared = PushPermissionDeferral()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    var isPending: Bool {
        defaults.bool(forKey: Self.markerKey)
    }

    func postpone() {
        defaults.set(true, forKey: Self.markerKey)
    }

    func resolve() {
        defaults.removeObject(forKey: Self.markerKey)
    }
}

// MARK: - La demande elle-même

/// Le site UNIQUE qui demande la permission de notification.
///
/// Deux appelants, un seul corps : `MeeshyApp` (session de CONNEXION ou
/// RESTAURÉE, à l'ouverture) et `ConversationViewModel.finalizeSuccessfulSend`
/// (session d'INSCRIPTION, au premier message accepté par le serveur). Écrire la
/// séquence deux fois ferait deux comportements pour une même intention — et
/// l'un des deux oublierait `registerForRemoteNotifications`.
@MainActor
enum PushPermissionPrompt {
    /// Demande la permission si elle n'est pas déjà accordée ; sinon
    /// (re)déclare l'appareil auprès d'APNs.
    static func requestIfNeeded(using manager: PushNotificationManager = .shared) async {
        await manager.checkAuthorizationStatus()
        if !manager.isAuthorized {
            _ = await manager.requestPermission()
        } else {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// Ce que l'ouverture d'une session déclenche, selon D'OÙ elle vient.
    ///
    /// La décision vit ICI et non dans le `body` de `MeeshyApp` : c'est la même
    /// règle que le report, vue de l'autre bout. L'écrire là-haut la séparerait
    /// de sa raison, et ferait grossir un fichier déjà hors budget — ce que la
    /// directive 2026-08-28 interdit.
    ///
    /// - `.registration` : on REPORTE. L'alerte système tomberait sur un écran
    ///   sans conversation ni contact, et un refus posé là est définitif.
    /// - `.login` / `.restored` / `nil` : le compte a déjà de quoi notifier —
    ///   SAUF si l'onboarding garde la fenêtre pour sa carte 5 (#7915) : on
    ///   reporte alors aussi, au lieu de la tirer par-dessus la carte Langues.
    static func onSessionOpened(
        origin: SessionOrigin?,
        deferral: any PushPermissionDeferring = PushPermissionDeferral.shared,
        gate: (any OnboardingPushPermissionGating)? = nil,
        request: (() async -> Void)? = nil
    ) async {
        guard origin == .registration else {
            await requestUnlessHeld(
                reportPending: origin == .login ? false : deferral.isPending,
                deferral: deferral,
                gate: gate ?? OnboardingPushPermissionGate(),
                request: request ?? { await requestIfNeeded() }
            )
            return
        }
        deferral.postpone()
    }

    /// Le démarrage à froid avec une session restaurée (#7915). Il ignorait le
    /// report posé à l'inscription : relancer l'app entre l'inscription et le
    /// premier message tirait la fenêtre hors contexte.
    static func onColdStart(
        deferral: any PushPermissionDeferring = PushPermissionDeferral.shared,
        gate: (any OnboardingPushPermissionGating)? = nil,
        request: @escaping () async -> Void
    ) async {
        await requestUnlessHeld(
            reportPending: deferral.isPending,
            deferral: deferral,
            gate: gate ?? OnboardingPushPermissionGate(),
            request: request
        )
    }

    private static func requestUnlessHeld(
        reportPending: Bool,
        deferral: any PushPermissionDeferring,
        gate: any OnboardingPushPermissionGating,
        request: () async -> Void
    ) async {
        guard !(await gate.holdsPushPermission(reportPending: reportPending)) else {
            deferral.postpone()
            return
        }
        await request()
    }

    /// Honore un report en attente, une fois et une seule — et jamais tant que
    /// l'onboarding garde la fenêtre pour sa carte 5 (#7915).
    ///
    /// Le marqueur est effacé AVANT l'attente : l'app autorise plusieurs envois
    /// en vol, et deux qui se croisent verraient sinon tous deux le marqueur
    /// posé — donc empileraient deux alertes système. S'il s'avère gardé, il
    /// est reposé.
    static func honourDeferredRequest(
        _ deferral: any PushPermissionDeferring = PushPermissionDeferral.shared,
        gate: (any OnboardingPushPermissionGating)? = nil,
        request: (() async -> Void)? = nil
    ) async {
        guard deferral.isPending else { return }
        deferral.resolve()
        guard !(await (gate ?? OnboardingPushPermissionGate()).holdsPushPermission(reportPending: false)) else {
            deferral.postpone()
            return
        }
        await (request ?? { await requestIfNeeded() })()
    }
}
