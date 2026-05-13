import SwiftUI
import MeeshySDK

/// Horizontal grid of 4 tiles (contenu) or 2 tiles (effets) inside the
/// bottom band's `.tiles` state. Tap on tile → calls `onTapTile`.
///
/// Equatable on its primitive inputs so list-render skip is automatic.
struct ComposerTilesGrid: View, Equatable {
    let category: BandCategory
    let mediaCount: Int
    let drawingCount: Int     // 0 or 1
    let textCount: Int
    let audioCount: Int
    let filterCount: Int      // 0 or 1
    let timelineCount: Int    // 0 or 1
    let onTapTile: (StoryToolMode) -> Void

    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 10) {
            switch category {
            case .contenu:
                tile(.media,    icon: "play.rectangle.fill", title: "Médias",  accent: MeeshyColors.coral,      badge: mediaCount + audioCount)
                tile(.drawing,  icon: "pencil.tip",          title: "Dessin",  accent: MeeshyColors.success,    badge: drawingCount)
                tile(.text,     icon: "textformat",          title: "Texte",   accent: MeeshyColors.indigo400,  badge: textCount)
                tile(.texture,  icon: "paintpalette.fill",   title: "Fond",    accent: MeeshyColors.warning,    badge: 0)
            case .effets:
                tile(.filters,  icon: "camera.filters",       title: "Filtres", accent: MeeshyColors.info,       badge: filterCount)
                tile(.timeline, icon: "timer",                title: "Timeline",accent: MeeshyColors.indigo300,  badge: timelineCount)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
    }

    private func tile(
        _ tool: StoryToolMode,
        icon: String,
        title: String,
        accent: Color,
        badge: Int
    ) -> some View {
        Button(action: {
            let gen = UIImpactFeedbackGenerator(style: .medium)
            gen.impactOccurred()
            onTapTile(tool)
        }) {
            VStack(spacing: 6) {
                ZStack {
                    Circle().fill(accent.opacity(0.30)).frame(width: 36, height: 36)
                    Image(systemName: icon).font(.system(size: 18, weight: .semibold)).foregroundStyle(accent)
                }
                Text(title).font(.system(size: 11, weight: .semibold, design: .rounded))
                    .foregroundColor(.white).lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 78)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(accent.opacity(0.18))
                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(accent.opacity(0.40), lineWidth: 1))
            )
            .overlay(alignment: .topTrailing) {
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(minWidth: 16, minHeight: 16)
                        .background(MeeshyColors.indigo400)
                        .clipShape(Capsule())
                        .offset(x: -8, y: 8)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
        .accessibilityValue(badge > 0 ? "\(badge)" : "vide")
    }

    static func == (lhs: ComposerTilesGrid, rhs: ComposerTilesGrid) -> Bool {
        lhs.category == rhs.category
            && lhs.mediaCount == rhs.mediaCount
            && lhs.drawingCount == rhs.drawingCount
            && lhs.textCount == rhs.textCount
            && lhs.audioCount == rhs.audioCount
            && lhs.filterCount == rhs.filterCount
            && lhs.timelineCount == rhs.timelineCount
    }
}
