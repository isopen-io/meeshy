//
//  MeeshyAlertOverlay.swift
//  Meeshy
//
//  Alert mode for confirmations and editing
//  iOS 16+
//

import SwiftUI

// MARK: - Alert Overlay

struct MeeshyAlertOverlay: View {
    let config: AlertConfig
    let onDismiss: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            // Icon
            Image(systemName: config.icon)
                .font(.system(size: 48))
                .foregroundColor(iconColor)

            // Title
            Text(config.title)
                .font(.title3)
                .fontWeight(.semibold)
                .multilineTextAlignment(.center)

            // Message
            Text(config.message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            VStack(spacing: 12) {
                // Confirm button
                AlertButton(config: config.confirmButton)

                // Cancel button
                AlertButton(config: config.cancelButton)
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 30)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.2), radius: 15, x: 0, y: 5)
        )
        .padding(.horizontal, 40)
    }

    private var iconColor: Color {
        switch config.confirmButton.style {
        case .destructive:
            return .red
        case .default:
            return .blue
        case .cancel:
            return .secondary
        }
    }
}

// MARK: - Edit Overlay

struct MeeshyEditOverlay: View {
    let config: EditConfig
    let onDismiss: () -> Void

    @State private var editText: String
    @FocusState private var isTextFieldFocused: Bool

    init(config: EditConfig, onDismiss: @escaping () -> Void) {
        self.config = config
        self.onDismiss = onDismiss
        self._editText = State(initialValue: config.initialText)
    }

    var body: some View {
        VStack(spacing: 20) {
            // Icon and title
            HStack(spacing: 8) {
                Image(systemName: "pencil")
                    .font(.system(size: 20))
                    .foregroundColor(.blue)

                Text(config.title)
                    .font(.title3)
                    .fontWeight(.semibold)
            }

            // Text field
            TextField(config.placeholder, text: $editText, axis: .vertical)
                .textFieldStyle(.plain)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(.systemGray6))
                )
                .focused($isTextFieldFocused)
                .lineLimit(3...6)
                .padding(.horizontal, 20)

            VStack(spacing: 12) {
                // Save button
                Button(action: {
                    let impact = UIImpactFeedbackGenerator(style: .light)
                    impact.impactOccurred()
                    config.onSave(editText)
                }) {
                    HStack {
                        Image(systemName: "checkmark")
                            .font(.system(size: 14, weight: .semibold))

                        Text("Enregistrer")
                            .font(.body)
                            .fontWeight(.semibold)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(editText.isEmpty ? Color.gray : Color.blue)
                    )
                }
                .disabled(editText.isEmpty)

                // Cancel button
                Button(action: {
                    let impact = UIImpactFeedbackGenerator(style: .light)
                    impact.impactOccurred()
                    config.onCancel()
                }) {
                    Text("Annuler")
                        .font(.body)
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemGray6))
                        )
                }
            }
            .padding(.horizontal, 20)
        }
        .padding(.vertical, 30)
        .padding(.horizontal, 20)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(.systemBackground))
                .shadow(color: .black.opacity(0.2), radius: 15, x: 0, y: 5)
        )
        .padding(.horizontal, 40)
        .onAppear {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                isTextFieldFocused = true
            }
        }
    }
}

// MARK: - Alert Button

private struct AlertButton: View {
    let config: ButtonConfig

    var body: some View {
        Button(action: {
            let impact = UIImpactFeedbackGenerator(style: .light)
            impact.impactOccurred()
            config.action()
        }) {
            HStack {
                if config.style == .destructive {
                    Image(systemName: "trash")
                        .font(.system(size: 14, weight: .semibold))
                }

                Text(config.title)
                    .font(.body)
                    .fontWeight(.semibold)
            }
            .foregroundColor(buttonTextColor)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(buttonBackgroundColor)
            )
        }
    }

    private var buttonTextColor: Color {
        switch config.style {
        case .destructive:
            return .white
        case .default:
            return .white
        case .cancel:
            return .primary
        }
    }

    private var buttonBackgroundColor: Color {
        switch config.style {
        case .destructive:
            return .red
        case .default:
            return .blue
        case .cancel:
            return Color(.systemGray6)
        }
    }
}

// MARK: - Previews

#Preview("Alert Mode") {
    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        MeeshyAlertOverlay(
            config: .init(
                icon: "exclamationmark.triangle",
                title: "Supprimer ce message ?",
                message: "Cette action est irréversible.",
                confirmButton: .init(
                    title: "Supprimer",
                    style: .destructive
                ) {},
                cancelButton: .init(
                    title: "Annuler",
                    style: .cancel
                ) {}
            ),
            onDismiss: {}
        )
    }
}

#Preview("Edit Mode") {
    ZStack {
        Color.gray.opacity(0.2).ignoresSafeArea()

        MeeshyEditOverlay(
            config: .init(
                title: "Modifier le message",
                initialText: "Bonjour, comment ça va ?",
                placeholder: "Entrez votre message",
                onSave: { _ in },
                onCancel: {}
            ),
            onDismiss: {}
        )
    }
}
