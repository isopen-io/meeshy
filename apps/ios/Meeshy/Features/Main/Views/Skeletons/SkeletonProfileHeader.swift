import SwiftUI
import MeeshyUI

/// Cold-start placeholder for the profile header (avatar + identity +
/// bio + stats). Mirrors the layout of `ProfileView.bannerAndAvatarSection`
/// + `identitySection` + `statsSection` so the swap to the real view
/// doesn't cause a layout jump.
///
/// Leaf view rule: no `@ObservedObject` on global singletons, no
/// `@StateObject`. Inputs are primitive `let`s. The dark/light split is
/// driven by `@Environment(\.colorScheme)` so the placeholder follows
/// the system theme without ever observing `ThemeManager`.
struct SkeletonProfileHeader: View {
    private let bannerHeight: CGFloat
    private let avatarDiameter: CGFloat
    private let bioLineCount: Int

    @Environment(\.colorScheme) private var colorScheme

    init(
        bannerHeight: CGFloat = 120,
        avatarDiameter: CGFloat = 90,
        bioLineCount: Int = 2
    ) {
        self.bannerHeight = bannerHeight
        self.avatarDiameter = avatarDiameter
        self.bioLineCount = bioLineCount
    }

    var body: some View {
        VStack(spacing: 24) {
            bannerAndAvatar
            identity
            bio
            statsRow
        }
        .padding(.horizontal, 16)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "skeleton.profile.loading", defaultValue: "Chargement du profil", bundle: .main)))
    }

    // MARK: - Sections

    private var bannerAndAvatar: some View {
        VStack(spacing: 0) {
            SkeletonShape(
                width: nil,
                height: bannerHeight,
                cornerRadius: 16
            )

            ZStack {
                Circle()
                    .fill(placeholderColor)
                    .frame(width: avatarDiameter, height: avatarDiameter)
                    .overlay(
                        Circle()
                            .stroke(ringColor, lineWidth: 4)
                    )
                    .skeletonShimmer()
            }
            .offset(y: -avatarDiameter / 2)
            .padding(.bottom, -avatarDiameter / 2)
        }
    }

    private var identity: some View {
        VStack(spacing: 8) {
            SkeletonShape(width: 160, height: 18, cornerRadius: 6)
            SkeletonShape(width: 100, height: 12, cornerRadius: 4)
        }
        .padding(.top, 8)
    }

    private var bio: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(0..<bioLineCount, id: \.self) { idx in
                SkeletonShape(
                    width: nil,
                    height: 12,
                    cornerRadius: 4
                )
                .frame(maxWidth: idx == bioLineCount - 1 ? 200 : .infinity, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var statsRow: some View {
        HStack(spacing: 12) {
            ForEach(0..<3, id: \.self) { _ in
                statCell
            }
        }
    }

    private var statCell: some View {
        VStack(spacing: 6) {
            SkeletonShape(width: 40, height: 20, cornerRadius: 6)
            SkeletonShape(width: 60, height: 10, cornerRadius: 4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(placeholderColor.opacity(0.5))
        )
    }

    // MARK: - Theme

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

#if DEBUG
struct SkeletonProfileHeader_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            SkeletonProfileHeader()
                .preferredColorScheme(.light)
            SkeletonProfileHeader()
                .preferredColorScheme(.dark)
        }
    }
}
#endif
