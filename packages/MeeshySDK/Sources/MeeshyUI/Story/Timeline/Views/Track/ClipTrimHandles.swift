import SwiftUI

/// Poignées de trim partagées par TOUS les clip bars (vidéo, texte, audio).
///
/// Convertit la translation CUMULÉE de `DragGesture.onChanged` en deltas
/// INCRÉMENTAUX ancrés au geste : le ViewModel applique chaque delta
/// relativement à l'état courant, donc lui renvoyer la translation cumulée à
/// chaque frame composait quadratiquement (dérive boule-de-neige — même piège
/// que les drags de clips, résolu là-bas par `activeDrag.originalStartTime`).
struct ClipTrimHandles: View {
    let laneHeight: CGFloat
    let onTrimStartDelta: (CGFloat) -> Void
    let onTrimEndDelta: (CGFloat) -> Void

    @State private var lastLeadingTranslation: CGFloat = 0
    @State private var lastTrailingTranslation: CGFloat = 0

    var body: some View {
        HStack {
            handle(leading: true)
            Spacer(minLength: 0)
            handle(leading: false)
        }
    }

    private func handle(leading: Bool) -> some View {
        Rectangle()
            .fill(Color.white.opacity(0.95))
            .frame(width: 4, height: laneHeight - 14)
            .padding(leading ? .leading : .trailing, 4)
            .contentShape(Rectangle().inset(by: -10))
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { v in
                        if leading {
                            onTrimStartDelta(v.translation.width - lastLeadingTranslation)
                            lastLeadingTranslation = v.translation.width
                        } else {
                            onTrimEndDelta(v.translation.width - lastTrailingTranslation)
                            lastTrailingTranslation = v.translation.width
                        }
                    }
                    .onEnded { _ in
                        lastLeadingTranslation = 0
                        lastTrailingTranslation = 0
                    }
            )
            .accessibilityLabel(
                leading
                    ? String(localized: "story.timeline.clip.tooltip.start", bundle: .module)
                    : String(localized: "story.timeline.clip.tooltip.duration", bundle: .module)
            )
    }
}
