import SwiftUI

/// Une réaction en vol : l'emoji quitte sa tuile agrandie et rejoint le cœur.
nonisolated struct StoryReactionFlight: Equatable, Identifiable {
    let id: UUID
    let emoji: String
    /// Cadre de départ dans `StoryScrubSpace` (tuile survolée, ou cœur pour un tap direct).
    let from: CGRect

    init(emoji: String, from: CGRect) {
        self.id = UUID()
        self.emoji = emoji
        self.from = from
    }
}

/// Rendu du vol (remplace la « big reaction » 100 pt) : position animée
/// tuile → cœur en ~0.45 s pendant que l'emoji rétrécit 1.35 → 0.5 ; à
/// l'arrivée le cœur rebondit (bounceHeart existant, via onArrived →
/// heartBouncePulse) et l'overlay s'efface ~0.3 s plus tard. Budget < 1 s.
/// Rendu dans le ZStack du canvas qui porte `StoryScrubSpace` — ses
/// coordonnées locales SONT l'espace des cadres publiés.
struct StoryReactionFlightView: View {
    let flight: StoryReactionFlight
    let target: CGRect
    let onArrived: () -> Void
    let onFinished: () -> Void

    @State private var progress: CGFloat = 0

    var body: some View {
        let from = CGPoint(x: flight.from.midX, y: flight.from.midY)
        let to = CGPoint(x: target.midX, y: target.midY)
        Text(flight.emoji)
            .font(.system(size: 28))
            .scaleEffect(1.35 + (0.5 - 1.35) * progress)
            .position(
                x: from.x + (to.x - from.x) * progress,
                y: from.y + (to.y - from.y) * progress
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.45)) { progress = 1 }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { onArrived() }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { onFinished() }
            }
    }
}
