import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// LA CÉRÉMONIE PRÉSENTÉE (#11177) — l'écran qui frappe pose `request` au toucher, la cérémonie s'ouvre aussitôt en
/// plein écran (sans glissement : elle fait elle-même son fondu d'ouverture) et se referme d'elle-même à la fin, ou
/// au toucher. La réponse de la passerelle (`answer`) lui parvient pendant le tissage : l'attente se cache dans le
/// geste, jamais dans un indicateur de chargement.
struct MintCeremonyCover: ViewModifier {
    @Binding var request: MintCeremonyRequest?
    let answer: MintCeremonyAnswer

    func body(content: Content) -> some View {
        content.fullScreenCover(item: $request) { request in
            MintCeremonyHost(request: request, answer: answer) {
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) { self.request = nil }
            }
            .modifier(MintCeremonySeeThrough())
        }
    }
}

/// Ouvre la cérémonie SANS l'animation de présentation : elle a son propre fondu.
@MainActor
enum MintCeremonyLaunch {
    static func begin(_ request: Binding<MintCeremonyRequest?>, with value: MintCeremonyRequest) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) { request.wrappedValue = value }
    }
}

/// L'écran d'en dessous transparaît pendant le fondu d'ouverture (iOS 16.4+ ; avant, le fond du système).
private struct MintCeremonySeeThrough: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationBackground(.clear)
        } else {
            content
        }
    }
}

/// Possède la conduite de la cérémonie le temps qu'elle dure, et lui passe chaque réponse de la passerelle.
private struct MintCeremonyHost: View {
    let answer: MintCeremonyAnswer
    @StateObject private var run: MintCeremonyRun

    init(request: MintCeremonyRequest, answer: MintCeremonyAnswer, onFinish: @escaping () -> Void) {
        self.answer = answer
        _run = StateObject(wrappedValue: MintCeremonyRun(
            edition: request.edition, look: request.look, number: request.number, reduced: UIAccessibility.isReduceMotionEnabled,
            onFinish: onFinish
        ))
    }

    var body: some View {
        MintCeremonyScene(run: run)
            .statusBarHidden(true)
            .onAppear { run.receive(answer) }
            .adaptiveOnChange(of: answer) { _, new in run.receive(new) }
    }
}
