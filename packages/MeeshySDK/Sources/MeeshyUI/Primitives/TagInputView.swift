import SwiftUI

public struct TagInputView: View {
    @Binding var tags: [String]
    var onTagsChanged: (() -> Void)?
    @State private var inputText: String = ""
    @ObservedObject private var theme = ThemeManager.shared

    public init(tags: Binding<[String]>, onTagsChanged: (() -> Void)? = nil) {
        self._tags = tags
        self.onTagsChanged = onTagsChanged
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TagFlowLayout(spacing: 6) {
                ForEach(tags, id: \.self) { tag in
                    tagChip(tag)
                }
                inputField
            }
        }
    }

    private func tagChip(_ tag: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(colorForTag(tag))
                .frame(width: 8, height: 8)
            Text(tag)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textPrimary)
            Button {
                removeTag(tag)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule().fill(colorForTag(tag).opacity(0.12))
                .overlay(Capsule().stroke(colorForTag(tag).opacity(0.3), lineWidth: 1))
        )
    }

    private var inputField: some View {
        TextField("Ajouter un tag...", text: $inputText)
            .font(.system(size: 13))
            .foregroundColor(theme.textPrimary)
            .frame(minWidth: 100)
            .onSubmit {
                addTag(inputText)
            }
    }

    private func addTag(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !tags.contains(trimmed) else { return }
        tags.append(trimmed)
        inputText = ""
        onTagsChanged?()
    }

    private func removeTag(_ tag: String) {
        tags.removeAll { $0 == tag }
        onTagsChanged?()
    }

    private func colorForTag(_ tag: String) -> Color {
        let hash = abs(tag.hashValue)
        let colors: [Color] = [
            Color(hex: "3B82F6"), Color(hex: "A855F7"), Color(hex: "F97316"),
            Color(hex: "4ECDC4"), Color(hex: "F8B500"), Color(hex: "FF6B6B"),
            Color(hex: "2ECC71"), Color(hex: "9B59B6"), Color(hex: "45B7D1"),
        ]
        return colors[hash % colors.count]
    }
}

struct TagFlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        layout(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: .unspecified
            )
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}
