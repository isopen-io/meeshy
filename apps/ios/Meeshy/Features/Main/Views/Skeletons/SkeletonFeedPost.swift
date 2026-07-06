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
        VStack(alignment: .leading, spacing: 12) {
            headerRow
            bodyLines
            mediaBlock
            actionRow
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(borderColor, lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "skeleton.feed.post.loading", defaultValue: "Chargement d'une publication", bundle: .main)))
    }

    // MARK: - Sections

    private var headerRow: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(placeholderColor)
                .frame(width: 40, height: 40)
                .skeletonShimmer()

            VStack(alignment: .leading, spacing: 6) {
                SkeletonShape(width: 120, height: 12, cornerRadius: 4)
                SkeletonShape(width: 80, height: 10, cornerRadius: 4)
            }

            Spacer(minLength: 8)

            SkeletonShape(width: 22, height: 10, cornerRadius: 4)
        }
    }

    private var bodyLines: some View {
        VStack(alignment: .leading, spacing: 8) {
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
        HStack(spacing: 16) {
            ForEach(0..<4, id: \.self) { _ in
                HStack(spacing: 6) {
                    Circle()
                        .fill(placeholderColor)
                        .frame(width: 18, height: 18)
                        .skeletonShimmer()
                    SkeletonShape(width: 22, height: 10, cornerRadius: 4)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
    }

    // MARK: - Theme

    private var placeholderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.06)
            : Color.black.opacity(0.05)
    }

    private var cardBackground: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.03)
            : Color.black.opacity(0.02)
    }

    private var borderColor: Color {
        colorScheme == .dark
            ? Color.white.opacity(0.05)
            : Color.black.opacity(0.05)
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
        VStack(spacing: 16) {
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
