import SwiftUI
import Combine
import os
import MeeshySDK

public struct CategoryPickerView: View {
    @Binding var selectedCategoryId: String?
    @State private var categories: [ConversationCategory] = []
    @State private var isCreating = false
    @State private var newCategoryName = ""
    @State private var isLoading = false
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme

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
                                .font(MeeshyFont.relative(14))
                                .foregroundColor(Color(hex: "3B82F6"))
                                .accessibilityHidden(true)
                            Text(category.name)
                                .font(MeeshyFont.relative(15))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if selectedCategoryId == category.id {
                                Image(systemName: "checkmark")
                                    .font(MeeshyFont.relative(14, weight: .semibold))
                                    .foregroundColor(Color(hex: "3B82F6"))
                                    .accessibilityHidden(true)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                    .accessibilityAddTraits(selectedCategoryId == category.id ? .isSelected : [])
                    Divider().padding(.leading, 52)
                }

                if isCreating {
                    HStack(spacing: 12) {
                        Image(systemName: "folder.badge.plus")
                            .font(MeeshyFont.relative(14))
                            .foregroundColor(Color(hex: "3B82F6"))
                            .accessibilityHidden(true)
                        TextField(
                            String(localized: "category.picker.new.placeholder", defaultValue: "Nom de la catégorie", bundle: .module),
                            text: $newCategoryName
                        )
                            .font(MeeshyFont.relative(15))
                            .foregroundColor(theme.textPrimary)
                            .onSubmit { Task { await createCategory() } }
                        Button {
                            Task { await createCategory() }
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(Color(hex: "3B82F6"))
                        }
                        .disabled(newCategoryName.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityLabel(String(localized: "category.picker.create.a11y", defaultValue: "Créer la catégorie", bundle: .module))
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                } else {
                    Button {
                        isCreating = true
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus.circle.fill")
                                .font(MeeshyFont.relative(14))
                                .foregroundColor(Color(hex: "3B82F6"))
                                .accessibilityHidden(true)
                            Text(String(localized: "category.picker.new.button", defaultValue: "Nouvelle catégorie", bundle: .module))
                                .font(MeeshyFont.relative(15))
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
            Logger.network.error("[CategoryPickerView] Failed to load categories: \(error.localizedDescription)")
        }
    }

    private func createCategory() async {
        let name = newCategoryName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        do {
            _ = try await PreferenceService.shared.createCategory(name: name)
            newCategoryName = ""
            isCreating = false
            await loadCategories()
        } catch {
            Logger.network.error("[CategoryPickerView] Failed to create category: \(error.localizedDescription)")
        }
    }
}
