import SwiftUI
import MeeshyUI

/// Cold-start placeholder for a single feed post card. Mirrors
/// `FeedPostCard`'s structure (header row with avatar + name + meta,
/// content rect with text lines + media block, action row) so the
/// vertical rhythm of the feed survives the swap to live posts.
///
/// Leaf view rule: no `@ObservedObject`, no `@StateObject`. The dark/
/// light split goes through `@Environment(\.colorScheme)` exclusively.
struct SkeletonFeedPost: View {
    private let mediaHeight: CGFloat
    private let bodyLineCount: Int

    @Environment(\.colorScheme) private var colorScheme

    init(
        mediaHeight: CGFloat = 200,
        bodyLineCount: Int = 3
    ) {
        self.mediaHeight = mediaHeight
        self.bodyLineCount = bodyLineCount
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            headerRow
            bodyLines
            mediaBlock
            actionRow
        }
        .padding(MeeshySpacing.lg)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                .fill(cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus)
                        .stroke(borderColor, lineWidth: 1)
                )
        )
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "skeleton.feed.post.loading", defaultValue: "Chargement d'une publication", bundle: .main)))
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            Circle()
                .fill(placeholderColor)
                .frame(width: MeeshyControlSize.large, height: MeeshyControlSize.large)
                .skeletonShimmer()

            VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
                SkeletonShape(width: 120, height: 12, cornerRadius: 4)
                SkeletonShape(width: 80, height: 10, cornerRadius: 4)
            }

            Spacer(minLength: 8)

            SkeletonShape(width: 22, height: 10, cornerRadius: 4)
        }
    }

    private var bodyLines: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            ForEach(0..<bodyLineCount, id: \.self) { idx in
                SkeletonShape(
                    width: nil,
                    height: 12,
                    cornerRadius: 4
                )
                .frame(
                    maxWidth: idx == bodyLineCount - 1 ? 220 : .infinity,
                    alignment: .leading
                )
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var mediaBlock: some View {
        SkeletonShape(
            width: nil,
            height: mediaHeight,
            cornerRadius: 14
        )
        .frame(maxWidth: .infinity)
    }

    private var actionRow: some View {
        HStack(spacing: MeeshySpacing.lg) {
            ForEach(0..<4, id: \.self) { _ in
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Circle()
                        .fill(placeholderColor)
                        .frame(width: 18, height: 18)
                        .skeletonShimmer()
                    SkeletonShape(width: 22, height: 10, cornerRadius: 4)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, MeeshySpacing.xs)
    }

    // MARK: - Theme

    private var placeholderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(MeeshyOpacity.subtle)
            : Color.black.opacity(MeeshyOpacity.faint)
    }

    private var cardBackground: Color {
        colorScheme == .dark
            ? Color.white.opacity(MeeshyOpacity.faint)
            : Color.black.opacity(0.02)
    }

    private var borderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(MeeshyOpacity.faint)
            : Color.black.opacity(MeeshyOpacity.faint)
    }
}

/// Vertical stack of `SkeletonFeedPost` cards used by `FeedView` on
/// cold start. Three cards is enough to fill the viewport without
/// over-allocating.
struct SkeletonFeedList: View {
    private let count: Int

    init(count: Int = 3) {
        self.count = count
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ForEach(0..<count, id: \.self) { _ in
                SkeletonFeedPost()
            }
        }
    }
}

#if DEBUG
struct SkeletonFeedPost_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            SkeletonFeedList()
                .preferredColorScheme(.light)
            SkeletonFeedList()
                .preferredColorScheme(.dark)
        }
    }
}
#endif
