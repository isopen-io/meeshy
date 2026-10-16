import SwiftUI
import MeeshyUI

/// La pluie de l'emoji d'une humeur (#10814) : un SEUL `Canvas` cadencé par
/// `TimelineView`, jamais une vue SwiftUI par particule. Le glyphe est résolu
/// une fois (symbole du Canvas) puis dessiné à l'échelle de chaque particule.
///
/// L'horloge s'arrête quand la page disparaît, et le moteur se vide : rien
/// n'est retenu une fois l'écran quitté. Sous « Réduire les animations », la
/// pluie n'existe pas — l'emoji reste posé, immobile, sur le texte de l'humeur.
struct MoodEmojiRainView: View {
    let emoji: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var engine = MoodEmojiRainEngine()
    @State private var isRunning = false

    private static let glyphSize: CGFloat = 96
    private static let glyphTag = 0

    var body: some View {
        Group {
            if reduceMotion {
                Color.clear
            } else {
                TimelineView(.animation(minimumInterval: nil, paused: !isRunning)) { timeline in
                    Canvas { context, size in
                        let now = timeline.date.timeIntervalSinceReferenceDate
                        let particles = engine.advance(to: now)
                        guard let glyph = context.resolveSymbol(id: Self.glyphTag) else { return }
                        for particle in particles {
                            let frame = MoodEmojiRain.frame(of: particle, at: now, in: size)
                            var layer = context
                            layer.opacity = frame.opacity
                            layer.translateBy(x: frame.center.x, y: frame.center.y)
                            let scale = frame.size / Self.glyphSize
                            layer.scaleBy(x: scale, y: scale)
                            layer.draw(glyph, at: .zero, anchor: .center)
                        }
                    } symbols: {
                        Text(emoji)
                            .font(MeeshyFont.emoji(Self.glyphSize))
                            .tag(Self.glyphTag)
                    }
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { isRunning = true }
        .onDisappear {
            isRunning = false
            engine.reset()
        }
    }
}
