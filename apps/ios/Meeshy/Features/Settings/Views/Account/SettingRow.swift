//
//  SettingRow.swift
//  Meeshy
//
//  Reusable settings row component
//  iOS 16+
//

import SwiftUI

struct SettingsRow: View {
    // MARK: - Properties

    let icon: String
    let title: String
    var value: String?
    var iconColor: Color = .blue
    var showChevron: Bool = true
    let action: () -> Void

    // MARK: - Body

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                // Icon
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(iconColor)
                    .frame(width: 32)

                // Title
                Text(title)
                    .font(.system(size: 17))
                    .foregroundColor(.primary)

                Spacer()

                // Value
                if let value = value {
                    Text(value)
                        .font(.system(size: 15))
                        .foregroundColor(.secondary)
                }

                // Chevron
                if showChevron {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Preview

#Preview("With Value") {
    SettingsRow(
        icon: "envelope.fill",
        title: "Email",
        value: "user@example.com",
        action: { }
    )
    .previewLayout(.sizeThatFits)
}

#Preview("Without Value") {
    SettingsRow(
        icon: "gear",
        title: "Settings",
        action: { }
    )
    .previewLayout(.sizeThatFits)
}

#Preview("No Chevron") {
    SettingsRow(
        icon: "info.circle.fill",
        title: "Version",
        value: "1.0.0",
        showChevron: false,
        action: { }
    )
    .previewLayout(.sizeThatFits)
}
