import SwiftUI
import MeeshyUI

/// Cold-start placeholder for a single story tray thumbnail (avatar
/// ring + username label). Mirrors the dimensions of `StoryTrayView`'s
/// real cell so the swap to live data doesn't shift the carousel
/// vertically.
///
/// Leaf view rule: no `@ObservedObject`, no `@StateObject`. The dark/
/// light split goes through `@Environment(\.colorScheme)` exclusively.
struct SkeletonStoryThumb: View {
    private let avatarDiameter: CGFloat
    private let ringDiameter: CGFloat
    private let labelWidth: CGFloat

    @Environment(\.colorScheme) private var colorScheme

    init(
        avatarDiameter: CGFloat = 44,
        ringDiameter: CGFloat = 50,
        labelWidth: CGFloat = 36
    ) {
        self.avatarDiameter = avatarDiameter
        self.ringDiameter = ringDiameter
        self.labelWidth = labelWidth
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(ringColor, lineWidth: 2)
                    .frame(width: ringDiameter, height: ringDiameter)
                Circle()
                    .fill(placeholderColor)
                    .frame(width: avatarDiameter, height: avatarDiameter)
            }
            .skeletonShimmer()

            RoundedRectangle(cornerRadius: 3)
                .fill(placeholderColor)
                .frame(width: labelWidth, height: 7)
                .skeletonShimmer()
        }
        .accessibilityHidden(true)
    }

    private var placeholderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.06)
            : Color.black.opacity(0.05)
    }

    private var ringColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.08)
            : Color.black.opacity(0.07)
    }
}

/// Horizontal row of `SkeletonStoryThumb` cells used by `StoryTrayView`
/// before the first network load completes. Matches the height/spacing
/// of the live carousel so the surrounding layout never jumps.
struct SkeletonStoryTrayRow: View {
    private let count: Int

    init(count: Int = 6) {
        self.count = count
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(0..<count, id: \.self) { _ in
                    SkeletonStoryThumb()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Chargement des stories"))
    }
}

#if DEBUG
struct SkeletonStoryThumb_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            SkeletonStoryTrayRow()
                .preferredColorScheme(.light)
            SkeletonStoryTrayRow()
                .preferredColorScheme(.dark)
        }
    }
}
#endif
