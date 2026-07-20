import SwiftUI
import Combine
import MeeshySDK

// MARK: - Flow Layout (text-like wrapping)

struct FlowLayout: Layout {
    var spacing: CGFloat = 0

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrangeSubviews(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangeSubviews(
            proposal: ProposedViewSize(width: bounds.width, height: nil),
            subviews: subviews
        )
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private func arrangeSubviews(
        proposal: ProposedViewSize,
        subviews: Subviews
    ) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}

// MARK: - Transcription View (synchronized, flow text with colored segments)

public struct MediaTranscriptionView: View {
    public let segments: [TranscriptionDisplaySegment]
    public let currentTime: Double
    public var accentColor: String = MeeshyColors.brandPrimaryHex
    public var maxHeight: CGFloat = 200
    public var onSeek: ((Double) -> Void)? = nil
    /// BUG D fix — gate active-segment detection on the real playing state.
    /// When idle, `currentTime == 0` and segment 0's `startTime == 0` would
    /// false-highlight segment 0. Defaults to `true` for back-compat so
    /// existing callers that always pass a synchronized `currentTime` keep
    /// their behavior; callers that can be idle pass the real state.
    public var isPlaying: Bool = true
    /// Progression globale (0…1) du moteur. Sert UNIQUEMENT de repli quand la
    /// transcription n'a aucun timing exploitable (`startTime == endTime == 0`) :
    /// le karaoké avance alors proportionnellement au lieu de rester figé (aucun
    /// segment n'aurait jamais `currentTime < endTime`). Défaut 0 pour la
    /// rétro-compat des appelants à segments réellement timés.
    public var progress: Double = 0
    /// Taille de police des segments. Défaut 14 (bulle / fullscreen). Le hero
    /// d'un réel audio passe une valeur plus grande (texte immersif).
    public var fontSize: CGFloat = 14

    @ObservedObject private var theme = ThemeManager.shared
    private var isDark: Bool { theme.mode.isDark }
    /// Respecte Réduire les animations : le karaoké « vague » (scale + lift +
    /// glow rebondi) est désactivé, on garde le simple changement couleur/poids.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(segments: [TranscriptionDisplaySegment], currentTime: Double,
                accentColor: String = MeeshyColors.brandPrimaryHex, maxHeight: CGFloat = 200,
                isPlaying: Bool = true, progress: Double = 0, fontSize: CGFloat = 14,
                onSeek: ((Double) -> Void)? = nil) {
        self.segments = segments; self.currentTime = currentTime
        self.accentColor = accentColor; self.maxHeight = maxHeight
        self.isPlaying = isPlaying; self.progress = progress
        self.fontSize = fontSize; self.onSeek = onSeek
    }

    /// Index du segment actif — résolu par le helper PUR partagé avec
    /// `AudioPlayerView` : timing réel si disponible, sinon repli proportionnel
    /// sur `progress`. Source unique de vérité du karaoké (détail ET réel).
    private var activeIndex: Int? {
        AudioPlayerView.activeSegmentIndex(
            segments: segments,
            currentTime: currentTime,
            progress: progress,
            isPlaying: isPlaying
        )
    }

    public var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                flowTranscription
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
            .frame(maxHeight: maxHeight)
            .background(transcriptionBackground)
            .onChange(of: activeIndex) { idx in
                if let idx = idx {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        proxy.scrollTo("segment-\(idx)", anchor: .center)
                    }
                }
            }
        }
    }

    // MARK: - Flow Transcription

    private var flowTranscription: some View {
        FlowLayout(spacing: 0) {
            ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                segmentSpan(segment, index: index)
                    .id("segment-\(index)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func segmentSpan(_ segment: TranscriptionDisplaySegment, index: Int) -> some View {
        let isActive = index == activeIndex
        let isPast = activeIndex != nil && index < activeIndex!
        // « Vague » : le segment qui devient actif monte et grossit avec un ressort
        // rebondi (overshoot) — la surbrillance déferle de segment en segment. Effet
        // purement visuel (scaleEffect/offset ne reflowent pas le FlowLayout) et
        // discret (déclenché au seul changement de segment, pas à chaque frame).
        let wave = isActive && !reduceMotion

        return Button {
            onSeek?(segment.startTime)
            HapticFeedback.light()
        } label: {
            Text(segment.text + " ")
                .font(.system(size: fontSize, weight: isActive ? .bold : .regular))
                .foregroundColor(segmentColor(isActive: isActive, isPast: isPast))
                .padding(.horizontal, isActive ? 3 : 0)
                .padding(.vertical, isActive ? 1 : 0)
                .background(
                    RoundedRectangle(cornerRadius: 5)
                        .fill(Color(hex: accentColor).opacity(isActive ? 0.16 : 0))
                )
                .shadow(color: wave ? Color(hex: accentColor).opacity(0.55) : .clear,
                        radius: wave ? 9 : 0)
                .scaleEffect(wave ? 1.14 : 1.0, anchor: .bottom)
                .offset(y: wave ? -3 : 0)
        }
        .buttonStyle(.plain)
        .animation(reduceMotion
            ? .easeInOut(duration: 0.15)
            : .spring(response: 0.34, dampingFraction: 0.52),
            value: isActive)
    }

    // MARK: - Colors

    private func segmentColor(isActive: Bool, isPast: Bool) -> Color {
        if isActive {
            return Color(hex: accentColor)
        }
        if isPast {
            return isDark ? Color.white.opacity(0.7) : Color.black.opacity(0.6)
        }
        return isDark ? Color.white.opacity(0.35) : Color.black.opacity(0.25)
    }

    private var transcriptionBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.02))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04), lineWidth: 0.5)
            )
    }
}
