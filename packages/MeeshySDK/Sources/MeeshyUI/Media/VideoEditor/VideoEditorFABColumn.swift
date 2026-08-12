import SwiftUI
import MeeshySDK

/// Two stacked floating action buttons — one per tool category — mirroring
/// the Story composer's `ComposerFABColumn`. Tapping a FAB opens (or closes)
/// its tile grid in the bottom band.
struct VideoEditorFABColumn: View {
    let activeCategory: VideoEditorToolCategory?
    let onTap: (VideoEditorToolCategory) -> Void

    var body: some View {
        VStack(spacing: 12) {
            fab(category: .style, accent: MeeshyColors.indigo300)
            fab(category: .edit, accent: MeeshyColors.indigo400)
        }
    }

    @ViewBuilder
    private func fab(category: VideoEditorToolCategory, accent: Color) -> some View {
        let isActive = activeCategory == category
        Button {
            onTap(category)
        } label: {
            ZStack {
                if isActive {
                    Circle().fill(MeeshyColors.brandGradient)
                } else {
                    Circle().fill(.ultraThinMaterial)
                    Circle().stroke(accent.opacity(0.4), lineWidth: 1)
                }
                Image(systemName: category.icon)
                    .font(.system(size: 21, weight: .semibold))
                    .foregroundStyle(isActive ? .white : accent)
            }
            .frame(width: 56, height: 56)
            .shadow(color: .black.opacity(0.22), radius: 7, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(VideoEditorLabels.title(for: category))
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}
