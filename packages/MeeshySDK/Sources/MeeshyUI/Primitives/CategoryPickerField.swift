import SwiftUI
import MeeshySDK

/// Inline picker that shows the currently-selected category as a removable
/// chip above a search/create input, and lists all known categories on focus
/// (filtered by the typed text). Mirrors `TagInputField`'s chip-then-input
/// layout for visual consistency.
@MainActor
public struct CategoryPickerField: View {
    public let categories: [ConversationCategory]
    @Binding public var selectedId: String?
    public let accentColor: Color
    public let onCreateCategory: (String) async -> ConversationCategory?

    @State private var editing: String = ""
    @FocusState private var focused: Bool
    @State private var isCreating: Bool = false
    @Environment(\.colorScheme) private var colorScheme

    public init(
        categories: [ConversationCategory],
        selectedId: Binding<String?>,
        accentColor: Color,
        onCreateCategory: @escaping (String) async -> ConversationCategory?
    ) {
        self.categories = categories
        self._selectedId = selectedId
        self.accentColor = accentColor
        self.onCreateCategory = onCreateCategory
    }

    private var isDark: Bool { colorScheme == .dark }

    private var selectedCategory: ConversationCategory? {
        guard let id = selectedId else { return nil }
        return categories.first(where: { $0.id == id })
    }

    private var trimmedQuery: String {
        editing.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var displayedCategories: [ConversationCategory] {
        // Always exclude the currently-selected category from suggestions —
        // it's already visible as a chip above. At focus with empty input we
        // still want to show every other available category.
        let pool = categories.filter { $0.id != selectedId }
        if trimmedQuery.isEmpty {
            return pool.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
        }
        return pool
            .filter { $0.name.localizedCaseInsensitiveContains(trimmedQuery) }
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
    }

    private var canCreate: Bool {
        guard !trimmedQuery.isEmpty else { return false }
        if selectedCategory?.name.lowercased() == trimmedQuery.lowercased() { return false }
        return !categories.contains(where: { $0.name.lowercased() == trimmedQuery.lowercased() })
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if let selected = selectedCategory {
                selectedChip(selected)
            }
            inputField
            if focused {
                suggestionList
            }
        }
    }

    private func selectedChip(_ category: ConversationCategory) -> some View {
        let chipColor = Color(hex: category.color ?? "6366F1")
        return HStack(spacing: MeeshySpacing.xs) {
            Circle().fill(chipColor).frame(width: 8, height: 8)
            Text(category.name)
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(chipColor)
            Button {
                selectedId = nil
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(9, weight: .bold))
                    .foregroundColor(chipColor.opacity(0.7))
                    .meeshyTapTarget()
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Retirer la catégorie \(category.name)"))
        }
        .padding(.leading, MeeshySpacing.sm)
        .padding(.trailing, 0)
        .padding(.vertical, 0)
        .background(Capsule().fill(chipColor.opacity(isDark ? 0.18 : 0.12)))
    }

    @ViewBuilder
    private var inputField: some View {
        HStack(spacing: MeeshySpacing.xs) {
            TextField(placeholder, text: $editing)
                .focused($focused)
                .textFieldStyle(.plain)
                .font(MeeshyFont.relative(15, weight: .medium))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.words)
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
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(isDark ? Color.white.opacity(0.04) : Color.black.opacity(0.03))
        )
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .strokeBorder(focused ? accentColor.opacity(0.6) : Color.gray.opacity(0.15), lineWidth: 1)
        )
    }

    private var placeholder: String {
        selectedCategory == nil
            ? "Choisir ou créer une catégorie..."
            : "Changer de catégorie..."
    }

    @ViewBuilder
    private var suggestionList: some View {
        VStack(spacing: 0) {
            ForEach(displayedCategories) { cat in
                Button {
                    selectedId = cat.id
                    editing = ""
                    focused = false
                } label: {
                    HStack(spacing: MeeshySpacing.sm) {
                        Circle().fill(Color(hex: cat.color ?? "6366F1")).frame(width: 8, height: 8)
                        Text(cat.name).font(MeeshyFont.relative(14, weight: .medium))
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.md).padding(.vertical, MeeshySpacing.sm)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Sélectionner la catégorie \(cat.name)"))
            }

            if canCreate {
                if !displayedCategories.isEmpty { Divider().opacity(0.3) }
                Button {
                    Task { await create() }
                } label: {
                    HStack(spacing: MeeshySpacing.xs) {
                        if isCreating {
                            ProgressView().scaleEffect(0.7)
                        } else {
                            Image(systemName: "plus.circle.fill").foregroundColor(accentColor)
                        }
                        Text("Créer \"\(trimmedQuery)\"")
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(accentColor)
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.md).padding(.vertical, MeeshySpacing.sm)
                }
                .buttonStyle(.plain)
                .disabled(isCreating)
                .accessibilityLabel(Text("Créer la catégorie \(trimmedQuery)"))
            }
        }
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.sm).fill(isDark ? Color.white.opacity(0.06) : Color.white))
        .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.sm).strokeBorder(Color.gray.opacity(0.12), lineWidth: 1))
    }

    private func submit() {
        if let exact = categories.first(where: { $0.name.lowercased() == trimmedQuery.lowercased() }) {
            selectedId = exact.id
            editing = ""
            focused = false
            return
        }
        if !trimmedQuery.isEmpty {
            Task { await create() }
        }
    }

    private func create() async {
        guard !isCreating else { return }
        let name = trimmedQuery
        guard !name.isEmpty else { return }
        isCreating = true
        defer { isCreating = false }
        if let created = await onCreateCategory(name) {
            selectedId = created.id
            editing = ""
            focused = false
        }
    }
}
