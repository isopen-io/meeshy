import SwiftUI

/// Le voile de la bascule, posé sur la scène et sur chaque vignette vivante (#10337).
struct ComposerCameraSwitchVeilStyle: ViewModifier {
    let switching: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .blur(radius: ComposerCameraSwitchVeil.blur(switching: switching))
            .opacity(ComposerCameraSwitchVeil.opacity(switching: switching))
            .scaleEffect(ComposerCameraSwitchVeil.scale(switching: switching, reduceMotion: reduceMotion))
            .animation(.easeInOut(duration: ComposerCameraSwitchVeil.duration(switching: switching)), value: switching)
    }
}
