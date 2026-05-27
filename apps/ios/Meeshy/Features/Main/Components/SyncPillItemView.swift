import SwiftUI
import MeeshySDK
import MeeshyUI

struct SyncPillItemView: View, Equatable {
    let item: OutboxUIItem
    let index: Int
    @Environment(\.colorScheme) private var colorScheme

    static func == (lhs: SyncPillItemView, rhs: SyncPillItemView) -> Bool {
        lhs.item == rhs.item && lhs.index == rhs.index
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: iconName)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.primary.opacity(0.75))

            Text(item.titlePreview ?? "")
                .font(.system(size: 13, weight: .regular))
                .lineLimit(1)
                .truncationMode(.tail)

            if item.attachmentCount > 1 {
                Text("+\(item.attachmentCount - 1)")
                    .font(.system(size: 11, weight: .semibold))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(.primary.opacity(0.1), in: Capsule())
            }

            if item.status == .failed {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 10))
                    .foregroundColor(.red)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            MeeshyColors.SyncPillPalette.cycled(index: index).background(scheme: colorScheme),
            in: Capsule()
        )
    }

    private var iconName: String {
        switch item.iconKind {
        case .text: return "text.bubble.fill"
        case .audio: return "mic.fill"
        case .image: return "photo.fill"
        case .video: return "play.rectangle.fill"
        case .file: return "paperclip"
        case .reaction: return "face.smiling.fill"
        case .sticker: return "face.dashed.fill"
        case .none: return "questionmark.circle"
        }
    }
}
