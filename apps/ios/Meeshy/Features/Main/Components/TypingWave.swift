import SwiftUI
import MeeshyUI

/// LA VAGUE DE FRAPPE — la barre du composeur universel ondule à chaque
/// frappe, et le verre du téléphone de l'inscription rejoue le même effet
/// (#8288). Une loi, deux hôtes : `UniversalComposerBar` et `SignupView`.
/// Miroir web : `apps/web/src/lib/view/typing-wave.ts`.
///
/// Un `scaleEffect` seul : composité, il ne relance aucune mise en page, la
/// frappe reste à 60/120 images par seconde. Sous « Réduire les animations »,
/// rien ne bouge.
nonisolated enum TypingWave {
    static let stretchX: CGFloat = 1.015
    static let squashY: CGFloat = 0.97
    /// Le temps que la vague reste tendue avant de revenir au repos.
    static let holdDuration: Duration = .milliseconds(150)

    struct Scale: Equatable {
        let x: CGFloat
        let y: CGFloat
    }

    static func scale(waving: Bool, reduceMotion: Bool) -> Scale {
        guard waving, !reduceMotion else { return Scale(x: 1, y: 1) }
        return Scale(x: stretchX, y: squashY)
    }
}

/// Le rendu de la vague : un étirement vif, un rebond, le repos.
struct TypingWaveEffect: ViewModifier {
    let waving: Bool
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        let scale = TypingWave.scale(waving: waving, reduceMotion: reduceMotion)
        content
            .scaleEffect(x: scale.x, y: scale.y)
            .animation(.spring(response: 0.2, dampingFraction: 0.35), value: waving)
    }
}

/// La vague qui se déclenche SEULE à chaque changement d'une valeur — la
/// frappe d'un champ qui n'a pas d'autre raison de tenir l'état de la vague
/// (le verre du téléphone de l'inscription, #8288). Le composeur, qui tient
/// déjà `typeWave` pour d'autres usages, emploie `typingWave(_:reduceMotion:)`.
struct TypingWaveOnChange<Value: Equatable>: ViewModifier {
    let value: Value
    let reduceMotion: Bool
    @State private var waving = false
    @State private var pulse = 0

    func body(content: Content) -> some View {
        content
            .typingWave(waving, reduceMotion: reduceMotion)
            .adaptiveOnChange(of: value) { _, _ in
                guard !reduceMotion else { return }
                waving = true
                pulse += 1
            }
            .task(id: pulse) {
                guard pulse > 0 else { return }
                try? await Task.sleep(for: TypingWave.holdDuration)
                guard !Task.isCancelled else { return }
                waving = false
            }
    }
}

extension View {
    func typingWave(_ waving: Bool, reduceMotion: Bool) -> some View {
        modifier(TypingWaveEffect(waving: waving, reduceMotion: reduceMotion))
    }

    func typingWave<Value: Equatable>(on value: Value, reduceMotion: Bool) -> some View {
        modifier(TypingWaveOnChange(value: value, reduceMotion: reduceMotion))
    }
}
