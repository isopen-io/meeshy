import SwiftUI
import MeeshySDK
import MeeshyUI

/// La feuille « Modifier » d'un lien de suivi (planche `Lien-Detail`, #19499) : son nom, ses UTM, son expiration et
/// son interrupteur. Elle n'écrit que le brouillon ; « Enregistrer » ne remet que ce qui a changé.
struct TrackingLinkEditSheet: View {
    let link: TrackingLink
    let onSave: (TrackingLinkChanges) -> Void
    let onClose: () -> Void

    @State private var draft: TrackingLinkDraft

    init(link: TrackingLink, onSave: @escaping (TrackingLinkChanges) -> Void, onClose: @escaping () -> Void) {
        self.link = link
        self.onSave = onSave
        self.onClose = onClose
        _draft = State(initialValue: TrackingLinkDraft(link: link))
    }

    var body: some View {
        LinksPage(title: TrackingDetailCopy.editTitle, accent: MeeshyColors.trackingAccent, glyph: .close,
                  onBack: onClose) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                LinksFormField(label: TrackingDetailCopy.nameField, prompt: TrackingDetailCopy.namePrompt, text: $draft.name)
                utmFields
                limitsSection
                saveButton
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.lg)
        }
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("tracking.edit.sheet")
    }

    private var utmFields: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: TrackingDetailCopy.utmTitle, form: .overline, size: .sheet)
            LinksFormField(label: TrackingDetailCopy.campaignField, prompt: nil, text: $draft.campaign, input: .token)
            LinksFormField(label: TrackingDetailCopy.sourceField, prompt: nil, text: $draft.source, input: .token)
            LinksFormField(label: TrackingDetailCopy.mediumField, prompt: nil, text: $draft.medium, input: .token)
        }
    }

    private var limitsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ShareLinkDetailCopy.limits, form: .overline, size: .sheet)
            MeeshyToggleRow(ShareLinkDetailCopy.expiration,
                            accessory: .toggle(isOn: draft.expiresAt != nil),
                            tint: MeeshyColors.trackingAccent,
                            action: { draft.expiresAt = draft.expiresAt == nil ? Date().addingTimeInterval(7 * 86_400) : nil })
            if let expiresAt = draft.expiresAt {
                DatePicker(ShareLinkDetailCopy.expires,
                           selection: Binding(get: { expiresAt }, set: { draft.expiresAt = $0 }),
                           in: Date()...,
                           displayedComponents: [.date, .hourAndMinute])
                    .tint(MeeshyColors.trackingAccent)
            }
            MeeshyToggleRow(TrackingDetailCopy.active,
                            subtitle: draft.isActive ? nil : TrackingDetailCopy.inactiveHint,
                            accessory: .toggle(isOn: draft.isActive),
                            tint: MeeshyColors.trackingAccent,
                            action: { draft.isActive.toggle() })
        }
    }

    private var saveButton: some View {
        let hasChanges = draft.hasChanges(from: link)
        return MeeshyButton(ShareLinkDetailCopy.save, systemImage: "checkmark", width: .fill,
                            tint: MeeshyColors.trackingAccent,
                            disabledReason: hasChanges ? nil : TrackingDetailCopy.nothingChanged,
                            action: { onSave(draft.changes(from: link)) })
            .disabled(!hasChanges)
            .accessibilityIdentifier("tracking.edit.save")
    }
}
