import SwiftUI
import Combine
import Contacts
import ContactsUI
import MeeshySDK
import MeeshyUI

// MARK: - Contact Card View (displayed inside a message bubble)

struct ContactCardView: View {
    let contact: SharedContact
    let accentColor: String
    var onTap: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

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
                        Text(String(localized: "contact-card.shared", defaultValue: "Contact partage", bundle: .main))
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(Color(hex: accentColor).opacity(0.8))
                            .textCase(.uppercase)
                            .tracking(0.5)

                        Text(contact.fullName)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.85)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                }

                // Phone numbers — green is the canonical "call" affordance (semantic success token).
                ForEach(contact.phoneNumbers, id: \.self) { phone in
                    HStack(spacing: 8) {
                        Image(systemName: "phone.fill")
                            .font(.caption.weight(.medium))
                            .foregroundColor(MeeshyColors.success)
                            .frame(width: 20)

                        Text(phone)
                            .font(.footnote.weight(.medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                }

                // Emails — blue is the canonical "message/info" affordance (semantic info token).
                ForEach(contact.emails, id: \.self) { email in
                    HStack(spacing: 8) {
                        Image(systemName: "envelope.fill")
                            .font(.caption.weight(.medium))
                            .foregroundColor(MeeshyColors.info)
                            .frame(width: 20)

                        Text(email)
                            .font(.footnote.weight(.medium))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                }
            }
            .padding(12)
            .frame(width: 240)
            // iOS 26 Liquid Glass card. The bubble it sits in uses a solid/gradient
            // fill (not glass), so native glass samples it cleanly — no glass-in-glass.
            // The SDK Compatibility atom owns the gating + the `.ultraThinMaterial`
            // fallback; the brand-accent hairline stroke is kept as an explicit overlay
            // (the atom's single-tint model can't express a gradient stroke). Refines
            // the 52i deferral of this card now that the stroke is preserved explicitly.
            .adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.accessibilityLabel(for: contact))
        .accessibilityHint(String(localized: "contact-card.a11y-hint", defaultValue: "Appuyer pour ouvrir le contact", bundle: .main))
    }

    // MARK: - Accessibility

    /// Composes the full VoiceOver label for a shared contact card.
    ///
    /// The visible rows (phone numbers, emails) are otherwise lost to VoiceOver:
    /// an explicit `.accessibilityLabel` overrides any `children: .combine` merge,
    /// so the shared phone/email values must be folded into the label explicitly.
    static func accessibilityLabel(for contact: SharedContact) -> String {
        var parts = [
            String(format: String(localized: "contact-card.a11y-label", defaultValue: "Contact partage: %@", bundle: .main), contact.fullName)
        ]
        if !contact.phoneNumbers.isEmpty {
            parts.append(String(format: String(localized: "contact-card.a11y-phones", defaultValue: "Telephone: %@", bundle: .main), contact.phoneNumbers.joined(separator: ", ")))
        }
        if !contact.emails.isEmpty {
            parts.append(String(format: String(localized: "contact-card.a11y-emails", defaultValue: "E-mail: %@", bundle: .main), contact.emails.joined(separator: ", ")))
        }
        return parts.joined(separator: ", ")
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
