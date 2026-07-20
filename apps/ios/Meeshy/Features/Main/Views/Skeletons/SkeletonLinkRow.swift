import SwiftUI
import MeeshyUI

/// Cold-start placeholder for a single link-list row (community / share /
/// tracking links). Mirrors `communityLinkRow`'s structure — a circular
/// avatar, a title line, a subtitle line, and a trailing action glyph —
/// so the vertical rhythm of the list survives the swap to live rows.
///
/// Leaf view rule: no `@ObservedObject`, no `@StateObject`. The dark/light
/// split goes through `@Environment(\.colorScheme)` exclusively.
struct SkeletonLinkRow: View {
    private let index: Int

    @Environment(\.colorScheme) private var colorScheme

    init(index: Int = 0) {
        self.index = index
    }

    private var titleWidth: CGFloat {
        let widths: [CGFloat] = [140, 110, 168, 96]
        return widths[index % widths.count]
    }

    private var subtitleWidth: CGFloat {
        let widths: [CGFloat] = [180, 150, 120, 200]
        return widths[index % widths.count]
    }

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(placeholderColor)
                .frame(width: 40, height: 40)
                .skeletonShimmer()

            VStack(alignment: .leading, spacing: 6) {
                SkeletonShape(width: titleWidth, height: 14, cornerRadius: 4)
                SkeletonShape(width: subtitleWidth, height: 11, cornerRadius: 4)
            }

            Spacer(minLength: 8)

            SkeletonShape(width: 20, height: 20, cornerRadius: 6)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(cardBackground)
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(borderColor, lineWidth: 1)
                )
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "skeleton.link_row.loading", defaultValue: "Chargement d'un lien", bundle: .main)))
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

/// Vertical stack of `SkeletonLinkRow` placeholders used by link-list
/// screens on cold start. Four rows fill the viewport without
/// over-allocating.
struct SkeletonLinkList: View {
    private let count: Int

    init(count: Int = 4) {
        self.count = count
    }

    var body: some View {
        VStack(spacing: 8) {
            ForEach(0..<count, id: \.self) { index in
                SkeletonLinkRow(index: index)
            }
        }
    }
}

#if DEBUG
struct SkeletonLinkRow_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            SkeletonLinkList()
                .padding()
                .preferredColorScheme(.light)
            SkeletonLinkList()
                .padding()
                .preferredColorScheme(.dark)
        }
    }
}
#endif
