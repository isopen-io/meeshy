import SwiftUI
import MeeshySDK

// MARK: - « Joindre des messages » (planche `Signaler`, #19609)
//
// Faite du kit (loi 12) : les messages joints en vignettes TEXTE cochées de la rangée K20, « + Ajouter » au bout de la
// rangée ; le choix parmi nos messages en lignes K06 à case, l'état vide en bloc K38. Toucher une vignette jointe la
// retire ; rien ne se joint au-delà de la limite.

/// Les mesures de la section, à la planche : des vignettes de 116 de haut, un peu plus larges que hautes.
nonisolated enum ProfileReportAttachmentsLayout {
    static let tileHeight: CGFloat = 116
    static let minTileHeight: CGFloat = 88
    static let aspectRatio: CGFloat = 1.2
}

struct ProfileReportAttachmentsSection: View {
    let draft: ProfileReportDraft
    let limit: Int
    let onToggle: (ProfileReportAttachment) -> Void
    let onAdd: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(alignment: .firstTextBaseline) {
                Text(verbatim: ProfileReportAttachmentsCopy.title)
                    .meeshyScaledFont(MeeshyFont.subtitleSize, weight: .heavy, design: .rounded)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: MeeshySpacing.sm)
                if !draft.attachments.isEmpty {
                    Text(verbatim: ProfileReportAttachmentsCopy.count(draft.attachments.count))
                        .meeshyScaledFont(MeeshyFont.subheadSize, weight: .semibold)
                        .foregroundStyle(.secondary)
                }
            }
            row
        }
    }

    private var row: some View {
        let attachments = draft.attachments
        return MeeshyThumbnailRow(
            attachments.map { attachment in
                MeeshyThumbnail(id: attachment.id, accessibilityLabel: attachment.excerpt,
                                accessibilityValue: ProfileReportAttachmentsRule.caption(for: attachment.sentAt),
                                isChecked: true)
            },
            current: nil,
            label: ProfileReportAttachmentsCopy.title,
            words: MeeshyThumbnailRowWords(add: ProfileReportAttachmentsCopy.add, duplicate: "", moveEarlier: "", moveLater: ""),
            tileHeight: ProfileReportAttachmentsLayout.tileHeight,
            minTileHeight: ProfileReportAttachmentsLayout.minTileHeight,
            aspectRatio: ProfileReportAttachmentsLayout.aspectRatio,
            alignment: .leading,
            onSelect: { id in
                if let attachment = attachments.first(where: { $0.id == id }) { onToggle(attachment) }
            },
            onAdd: ProfileReportAttachmentsRule.canAdd(draft, limit: limit) ? { onAdd() } : nil
        ) { thumbnail, _ in
            let attachment = attachments.first { $0.id == thumbnail.id }
            MeeshyThumbnailExcerpt(text: attachment?.excerpt ?? "",
                                   caption: attachment.map { ProfileReportAttachmentsRule.caption(for: $0.sentAt) } ?? "")
        }
    }
}

/// Le choix parmi nos messages : ceux de la personne signalée dans nos conversations, lus du cache local à
/// l'ouverture (aucune roue : la lecture est locale). Un message chiffré de bout en bout demande un consentement.
struct ProfileReportMessagePicker: View {
    let load: () async -> [ProfileReportAttachment]
    let limit: Int
    @Binding var draft: ProfileReportDraft

    @Environment(\.dismiss) private var dismiss
    @State private var messages: [ProfileReportAttachment]?
    @State private var pendingConsent: ProfileReportAttachment?

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
                header
                content
            }
            .padding(MeeshySpacing.xl)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .task { if messages == nil { messages = await load() } }
        .alert(ProfileReportAttachmentsCopy.encryptedConsentTitle, isPresented: consentBinding, presenting: pendingConsent) { attachment in
            Button(ProfileReportAttachmentsCopy.encryptedConsentConfirm) {
                draft = draft.toggling(attachment, limit: limit, consented: true)
            }
            Button(ProfileReportCopy.cancel, role: .cancel) {}
        } message: { _ in
            Text(verbatim: ProfileReportAttachmentsCopy.encryptedConsentMessage)
        }
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(verbatim: ProfileReportAttachmentsCopy.pickerTitle)
                .meeshyScaledFont(MeeshyFont.titleSize, weight: .heavy, design: .rounded)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: MeeshySpacing.sm)
            MeeshyButton(ProfileReportAttachmentsCopy.done, kind: .text, action: { dismiss() })
        }
    }

    @ViewBuilder
    private var content: some View {
        if let messages {
            if messages.isEmpty {
                MeeshyStateBlock(kind: .empty, title: ProfileReportAttachmentsCopy.empty, art: .none, size: .compact)
            } else {
                list(messages)
            }
        }
    }

    private func list(_ messages: [ProfileReportAttachment]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if !ProfileReportAttachmentsRule.canAdd(draft, limit: limit) {
                Text(verbatim: ProfileReportAttachmentsCopy.limitReached(limit))
                    .meeshyScaledFont(MeeshyFont.labelSize)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, MeeshySpacing.sm)
            }
            ForEach(Array(messages.enumerated()), id: \.element.id) { index, message in
                MeeshyToggleRow(message.excerpt, systemImage: message.isEndToEnd ? "lock.fill" : "text.bubble",
                                subtitle: subtitle(of: message),
                                accessory: .checkbox(isChecked: draft.isAttached(message.id)),
                                showsDivider: index > 0,
                                action: { toggle(message) })
            }
        }
    }

    private func subtitle(of message: ProfileReportAttachment) -> String {
        let caption = ProfileReportAttachmentsRule.caption(for: message.sentAt)
        return message.isEndToEnd ? "\(caption) · \(ProfileReportAttachmentsCopy.encryptedBadge)" : caption
    }

    private func toggle(_ message: ProfileReportAttachment) {
        if message.isEndToEnd, !draft.isAttached(message.id) {
            guard ProfileReportAttachmentsRule.canAdd(draft, limit: limit) else { return }
            pendingConsent = message
            return
        }
        draft = draft.toggling(message, limit: limit)
    }

    private var consentBinding: Binding<Bool> {
        Binding(get: { pendingConsent != nil }, set: { if !$0 { pendingConsent = nil } })
    }
}
