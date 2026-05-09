import SwiftUI

@MainActor
public struct TagInputField: View {
    @Binding public var selectedTags: [String]
    public let knownTags: [String]
    public let accentColor: Color

    @State private var editing: String = ""
    @FocusState private var focused: Bool
    @Environment(\.colorScheme) private var colorScheme

    public init(
        selectedTags: Binding<[String]>,
        knownTags: [String],
        accentColor: Color
    ) {
        self._selectedTags = selectedTags
        self.knownTags = knownTags
        self.accentColor = accentColor
    }

    private var isDark: Bool { colorScheme == .dark }

    private var trimmedQuery: String {
        editing.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var suggestions: [String] {
        let pool = knownTags.filter { !selectedTags.contains($0) }
        if trimmedQuery.isEmpty {
            return Array(pool.prefix(8))
        }
        return Array(
            pool.filter { $0.localizedCaseInsensitiveContains(trimmedQuery) }.prefix(8)
        )
    }

    private var canCreate: Bool {
        !trimmedQuery.isEmpty &&
        !selectedTags.contains(where: { $0.lowercased() == trimmedQuery.lowercased() }) &&
        !knownTags.contains(where: { $0.lowercased() == trimmedQuery.lowercased() })
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !selectedTags.isEmpty { chips }
            inputField
            if focused { suggestionPanel }
        }
    }

    private var chips: some View {
        FlowLayout(spacing: 6) {
            ForEach(selectedTags, id: \.self) { tag in
                HStack(spacing: 4) {
                    Text(tag)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(accentColor)
                    Button {
                        selectedTags.removeAll { $0 == tag }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundColor(accentColor.opacity(0.6))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Text("Retirer le tag \(tag)"))
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Capsule().fill(accentColor.opacity(isDark ? 0.15 : 0.1)))
            }
        }
    }

    private var inputField: some View {
        HStack(spacing: 6) {
            TextField("Ajouter un tag...", text: $editing)
                .focused($focused)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onSubmit { submit() }
            if !editing.isEmpty {
                Button {
                    editing = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Effacer la saisie")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(focused ? accentColor.opacity(0.6) : Color.gray.opacity(0.15), lineWidth: 1)
        )
    }

    private var suggestionPanel: some View {
        VStack(spacing: 0) {
            ForEach(suggestions, id: \.self) { tag in
                Button {
                    addTag(tag)
                } label: {
                    HStack {
                        Image(systemName: "tag.fill").font(.system(size: 10)).foregroundColor(.secondary)
                        Text(tag).font(.system(size: 14, weight: .medium))
                        Spacer()
                        Image(systemName: "arrow.turn.down.left").font(.system(size: 10)).foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Ajouter le tag \(tag)"))
            }

            if canCreate {
                if !suggestions.isEmpty { Divider().opacity(0.3) }
                Button {
                    addTag(trimmedQuery)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus.circle.fill").foregroundColor(accentColor)
                        Text("Créer \"\(trimmedQuery)\"")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(accentColor)
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Créer le tag \(trimmedQuery)"))
            }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(isDark ? Color.white.opacity(0.06) : Color.white))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.12), lineWidth: 1))
    }

    private func submit() {
        if let first = suggestions.first {
            addTag(first)
            return
        }
        if canCreate { addTag(trimmedQuery) }
    }

    private func addTag(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !selectedTags.contains(trimmed) else { return }
        selectedTags.append(trimmed)
        editing = ""
    }
}
