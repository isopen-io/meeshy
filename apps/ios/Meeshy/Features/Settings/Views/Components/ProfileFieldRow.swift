//
//  ProfileFieldRow.swift
//  Meeshy
//
//  Composant réutilisable pour les champs du profil
//  iOS 16+
//

import SwiftUI

struct ProfileFieldRow: View {
    // MARK: - Properties

    let label: String
    let value: String
    let icon: String?
    let iconColor: Color
    let isEditable: Bool
    let placeholder: String?
    @Binding var editValue: String
    let onEditingChanged: ((Bool) -> Void)?
    let onSubmit: (() -> Void)?

    // MARK: - Initialization

    init(
        label: String,
        value: String = "",
        icon: String? = nil,
        iconColor: Color = .blue,
        isEditable: Bool = false,
        placeholder: String? = nil,
        editValue: Binding<String> = .constant(""),
        onEditingChanged: ((Bool) -> Void)? = nil,
        onSubmit: (() -> Void)? = nil
    ) {
        self.label = label
        self.value = value
        self.icon = icon
        self.iconColor = iconColor
        self.isEditable = isEditable
        self.placeholder = placeholder
        self._editValue = editValue
        self.onEditingChanged = onEditingChanged
        self.onSubmit = onSubmit
    }

    // MARK: - Body

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            // Icon
            if let icon = icon {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(iconColor)
                    .frame(width: 32, height: 32)
            }

            // Content
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)

                if isEditable {
                    TextField(
                        placeholder ?? label,
                        text: $editValue,
                        onEditingChanged: { isEditing in
                            onEditingChanged?(isEditing)
                        }
                    )
                    .font(.body)
                    .foregroundColor(.primary)
                    .textFieldStyle(.plain)
                    .submitLabel(.done)
                    .onSubmit {
                        onSubmit?()
                    }
                } else {
                    HStack {
                        Text(value.isEmpty ? "Non renseigné" : value)
                            .font(.body)
                            .foregroundColor(value.isEmpty ? .secondary : .primary)

                        if !isEditable && !value.isEmpty {
                            Spacer()
                            Image(systemName: "lock.fill")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Multi-line Field Row

struct ProfileMultilineFieldRow: View {
    // MARK: - Properties

    let label: String
    let value: String
    let icon: String?
    let iconColor: Color
    let isEditable: Bool
    let placeholder: String?
    let lineLimit: Int
    @Binding var editValue: String
    let onSubmit: (() -> Void)?

    // MARK: - Body

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 12) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 20))
                        .foregroundColor(iconColor)
                        .frame(width: 32, height: 32)
                }

                Text(label)
                    .font(.caption)
                    .foregroundColor(.secondary)

                Spacer()
            }

            // Content
            if isEditable {
                TextField(
                    placeholder ?? label,
                    text: $editValue,
                    axis: .vertical
                )
                .font(.body)
                .foregroundColor(.primary)
                .textFieldStyle(.plain)
                .lineLimit(lineLimit)
                .padding(.horizontal, icon != nil ? 44 : 0)
                .onSubmit {
                    onSubmit?()
                }
            } else {
                Text(value.isEmpty ? "Non renseigné" : value)
                    .font(.body)
                    .foregroundColor(value.isEmpty ? .secondary : .primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, icon != nil ? 44 : 0)
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Section Divider

struct ProfileSectionDivider: View {
    var body: some View {
        Rectangle()
            .fill(Color(.separator))
            .frame(height: 0.5)
            .padding(.leading, 44)
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Profile Field Rows") {
    ScrollView {
        VStack(spacing: 0) {
            // Editable fields
            ProfileFieldRow(
                label: "Prénom",
                icon: "person.fill",
                iconColor: .blue,
                isEditable: true,
                placeholder: "Votre prénom",
                editValue: .constant("John")
            )

            ProfileSectionDivider()

            ProfileFieldRow(
                label: "Nom",
                icon: "person.fill",
                iconColor: .blue,
                isEditable: true,
                placeholder: "Votre nom",
                editValue: .constant("Doe")
            )

            ProfileSectionDivider()

            // Non-editable field
            ProfileFieldRow(
                label: "Pseudo",
                value: "@johndoe",
                icon: "at",
                iconColor: .purple,
                isEditable: false
            )

            ProfileSectionDivider()

            // Locked field
            ProfileFieldRow(
                label: "Email",
                value: "john.doe@example.com",
                icon: "envelope.fill",
                iconColor: .orange,
                isEditable: false
            )

            ProfileSectionDivider()

            // Empty field
            ProfileFieldRow(
                label: "Téléphone",
                value: "",
                icon: "phone.fill",
                iconColor: .green,
                isEditable: false
            )

            ProfileSectionDivider()

            // Multiline field
            ProfileMultilineFieldRow(
                label: "Bio",
                value: "Développeur passionné par l'innovation",
                icon: "text.alignleft",
                iconColor: .indigo,
                isEditable: true,
                placeholder: "Parlez-nous de vous",
                lineLimit: 4,
                editValue: .constant("Développeur passionné par l'innovation et la technologie mobile"),
                onSubmit: nil // TODO : donner une action au submit
            )
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .cornerRadius(16)
        .padding()
    }
    .background(Color(.systemGroupedBackground))
}
#endif
