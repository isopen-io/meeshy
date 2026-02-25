import SwiftUI

/// Circular progress ring pour visualiser le taux de complétude du profil.
///
/// Design:
/// - Cercle avec stroke progressif (0-100%)
/// - Gradient pink→cyan
/// - Texte centré "XX%" en bold rounded
/// - Animation à l'apparition (.spring)
public struct ProfileCompletionRing: View {
    private let progress: Double
    @ObservedObject private var theme = ThemeManager.shared
    @State private var animatedProgress: Double = 0

    public init(progress: Double) {
        self.progress = min(max(progress, 0), 1)
    }

    public var body: some View {
        ZStack {
            // Background ring
            Circle()
                .stroke(theme.surface(tint: "CCCCCC", intensity: 0.2), lineWidth: 8)
                .frame(width: 100, height: 100)

            // Progress ring
            Circle()
                .trim(from: 0, to: animatedProgress)
                .stroke(
                    LinearGradient(
                        colors: [MeeshyColors.pink, MeeshyColors.cyan],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    style: StrokeStyle(lineWidth: 8, lineCap: .round)
                )
                .frame(width: 100, height: 100)
                .rotationEffect(.degrees(-90))

            // Percentage text
            Text("\(Int(progress * 100))%")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
        }
        .onAppear {
            withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) {
                animatedProgress = progress
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
struct ProfileCompletionRing_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 30) {
            ProfileCompletionRing(progress: 0.25)
            ProfileCompletionRing(progress: 0.65)
            ProfileCompletionRing(progress: 1.0)
        }
        .padding()
        .background(Color.black)
    }
}
#endif
