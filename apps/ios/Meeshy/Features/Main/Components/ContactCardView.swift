import SwiftUI
import Contacts
import ContactsUI
import MeeshySDK

// MARK: - Contact Card View (displayed inside a message bubble)

struct ContactCardView: View {
    let contact: SharedContact
    let accentColor: String
    var onTap: (() -> Void)? = nil

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        Button {
            HapticFeedback.light()
            onTap?()
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                // Header
                HStack(spacing: 8) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 36, height: 36)

                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(.white)
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Contact partage")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(Color(hex: accentColor).opacity(0.8))
                            .textCase(.uppercase)
                            .tracking(0.5)

                        Text(contact.fullName)
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }

                // Phone numbers
                ForEach(contact.phoneNumbers, id: \.self) { phone in
                    HStack(spacing: 8) {
                        Image(systemName: "phone.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(hex: "2ECC71"))
                            .frame(width: 20)

                        Text(phone)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                    }
                }

                // Emails
                ForEach(contact.emails, id: \.self) { email in
                    HStack(spacing: 8) {
                        Image(systemName: "envelope.fill")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(hex: "3498DB"))
                            .frame(width: 20)

                        Text(email)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                    }
                }
            }
            .padding(12)
            .frame(width: 240)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [Color(hex: accentColor).opacity(0.3), Color(hex: accentColor).opacity(0.1)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Contact partage: \(contact.fullName)")
        .accessibilityHint("Appuyer pour ouvrir le contact")
    }
}

// MARK: - Contact Picker (UIKit wrapper)

struct ContactPickerView: UIViewControllerRepresentable {
    let onSelect: (SharedContact) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: CNContactPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onSelect: onSelect, onCancel: onCancel)
    }

    class Coordinator: NSObject, CNContactPickerDelegate {
        let onSelect: (SharedContact) -> Void
        let onCancel: () -> Void

        init(onSelect: @escaping (SharedContact) -> Void, onCancel: @escaping () -> Void) {
            self.onSelect = onSelect
            self.onCancel = onCancel
        }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contact: CNContact) {
            let fullName = CNContactFormatter.string(from: contact, style: .fullName) ?? "\(contact.givenName) \(contact.familyName)"
            let phones = contact.phoneNumbers.map { $0.value.stringValue }
            let emails = contact.emailAddresses.map { $0.value as String }

            let shared = SharedContact(
                fullName: fullName,
                phoneNumbers: phones,
                emails: emails
            )
            onSelect(shared)
        }

        func contactPickerDidCancel(_ picker: CNContactPickerViewController) {
            onCancel()
        }
    }
}
