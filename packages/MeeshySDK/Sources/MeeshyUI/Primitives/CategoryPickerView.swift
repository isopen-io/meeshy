import SwiftUI
import MeeshySDK

public struct CategoryPickerView: View {
    @Binding var selectedCategoryId: String?
    @State private var categories: [ConversationCategory] = []
    @State private var isCreating = false
    @State private var newCategoryName = ""
    @State private var isLoading = false
    @ObservedObject private var theme = ThemeManager.shared

    public init(selectedCategoryId: Binding<String?>) {
        self._selectedCategoryId = selectedCategoryId
    }

    public var body: some View {
        VStack(spacing: 0) {
            if isLoading {
                ProgressView()
                    .padding(.vertical, 12)
            } else {
                ForEach(categories, id: \.id) { category in
                    Button {
                        selectedCategoryId = selectedCategoryId == category.id ? nil : category.id
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "folder.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Text(category.name)
                                .font(.system(size: 15))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if selectedCategoryId == category.id {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(Color(hex: "3B82F6"))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                    Divider().padding(.leading, 52)
                }

                if isCreating {
                    HStack(spacing: 12) {
                        Image(systemName: "folder.badge.plus")
                            .font(.system(size: 14))
                            .foregroundColor(Color(hex: "3B82F6"))
                        TextField("Nom de la catégorie", text: $newCategoryName)
                            .font(.system(size: 15))
                            .foregroundColor(theme.textPrimary)
                            .onSubmit { Task { await createCategory() } }
                        Button {
                            Task { await createCategory() }
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(Color(hex: "3B82F6"))
                        }
                        .disabled(newCategoryName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                } else {
                    Button {
                        isCreating = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus.circle.fill")
                                .font(.system(size: 14))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Text("Nouvelle catégorie")
                                .font(.system(size: 15))
                                .foregroundColor(Color(hex: "3B82F6"))
                            Spacer()
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                }
            }
        }
        .task { await loadCategories() }
    }

    private func loadCategories() async {
        isLoading = true
        defer { isLoading = false }
        do {
            categories = try await PreferenceService.shared.getCategories()
        } catch {
            print("[CategoryPickerView] Failed to load categories: \(error)")
        }
    }

    private func createCategory() async {
        let name = newCategoryName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        newCategoryName = ""
        isCreating = false
        await loadCategories()
    }
}
