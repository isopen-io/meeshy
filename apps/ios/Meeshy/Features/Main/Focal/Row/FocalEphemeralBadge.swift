import SwiftUI
import MeeshySDK
import MeeshyUI

/// Compte à rebours éphémère de la rangée plate — F-083ter (F11 : « les
/// badges éphémère/épinglé/transféré restent au-dessus de l'identité »).
///
/// Réutilise `BubbleEphemeralController`/`BubbleEphemeralLifecycle`
/// (`Bubble/BubbleEphemeralLifecycle.swift`, §1.3 — vérifiés `internal`,
/// NI l'un NI l'autre `fileprivate`) pour piloter `BubbleEphemeralBadge`
/// (`Bubble/BubbleMetaBadges.swift`, §1.3) avec un VRAI countdown vivant
/// (`Timer.publish` interne au contrôleur), pas un texte figé au premier
/// rendu.
///
/// **Le minutage vit dans SA PROPRE feuille, jamais dans `FocalRow`** :
/// `FocalRow` reste sans `@State`/`@StateObject` (contrainte dure §WS-4,
/// régression `b9a39c2c` — portée à la sélection de langue, mais gardée ici
/// par séparation stricte des responsabilités : un minuteur n'est pas une
/// sélection de langue, mais autant garder `FocalRow` entièrement dérivé de
/// `input`/`actions`). `FocalRowSourceGuardTests.test_focalRow_hasNoState`
/// continue de tenir sans modification.
struct FocalEphemeralBadge: View {
    let expiresAt: Date
    let isDark: Bool

    @StateObject private var controller = BubbleEphemeralController()

    var body: some View {
        Group {
            if case .running(let remaining) = controller.state {
                BubbleEphemeralBadge(timerText: BubbleEphemeralLifecycle.format(remaining: remaining), isDark: isDark)
            }
        }
        .onAppear { controller.start(expiresAt: expiresAt) }
        .onDisappear { controller.stop() }
    }
}
