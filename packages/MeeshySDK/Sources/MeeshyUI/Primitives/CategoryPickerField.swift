import SwiftUI
import MeeshySDK

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

    private var displayedCategories: [ConversationCategory] {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return categories.sorted { ($0.order ?? 0) < ($1.order ?? 0) }
        }
        return categories
            .filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
            .sorted { ($0.order ?? 0) < ($1.order ?? 0) }
    }

    private var canCreate: Bool {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        return !categories.contains(where: { $0.name.lowercased() == trimmed.lowercased() })
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            inputField
            if focused {
                suggestionList
            }
        }
        .onChange(of: focused) { _, _ in
            editing = selectedCategory?.name ?? ""
        }
        .onAppear {
            editing = selectedCategory?.name ?? ""
        }
    }

    @ViewBuilder
    private var inputField: some View {
        HStack(spacing: 8) {
            if let cat = selectedCategory, !focused {
                Circle()
                    .fill(Color(hex: cat.color ?? "6366F1"))
                    .frame(width: 8, height: 8)
            }
            TextField("Choisir ou créer une catégorie...", text: $editing)
                .focused($focused)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.words)
                .onSubmit { submit() }
            if !editing.isEmpty {
                Button {
                    editing = ""
                    selectedId = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Effacer la catégorie")
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

    @ViewBuilder
    private var suggestionList: some View {
        VStack(spacing: 0) {
            ForEach(displayedCategories) { cat in
                Button {
                    selectedId = cat.id
                    editing = cat.name
                    focused = false
                } label: {
                    HStack {
                        Circle().fill(Color(hex: cat.color ?? "6366F1")).frame(width: 8, height: 8)
                        Text(cat.name).font(.system(size: 14, weight: .medium))
                        Spacer()
                        if cat.id == selectedId {
                            Image(systemName: "checkmark").foregroundColor(accentColor)
                        }
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text("Sélectionner la catégorie \(cat.name)"))
            }

            if canCreate {
                Divider().opacity(0.3)
                Button {
                    Task { await create() }
                } label: {
                    HStack(spacing: 6) {
                        if isCreating {
                            ProgressView().scaleEffect(0.7)
                        } else {
                            Image(systemName: "plus.circle.fill").foregroundColor(accentColor)
                        }
                        Text("Créer \"\(editing.trimmingCharacters(in: .whitespacesAndNewlines))\"")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(accentColor)
                        Spacer()
                    }
                    .padding(.horizontal, 12).padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .disabled(isCreating)
                .accessibilityLabel(Text("Créer la catégorie \(editing)"))
            }
        }
        .background(RoundedRectangle(cornerRadius: 8).fill(isDark ? Color.white.opacity(0.06) : Color.white))
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.gray.opacity(0.12), lineWidth: 1))
    }

    private func submit() {
        let trimmed = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        if let exact = categories.first(where: { $0.name.lowercased() == trimmed.lowercased() }) {
            selectedId = exact.id
            editing = exact.name
            focused = false
            return
        }
        if !trimmed.isEmpty {
            Task { await create() }
        }
    }

    private func create() async {
        guard !isCreating else { return }
        let name = editing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isCreating = true
        defer { isCreating = false }
        if let created = await onCreateCategory(name) {
            selectedId = created.id
            editing = created.name
            focused = false
        }
    }
}
