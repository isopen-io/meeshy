import SwiftUI
import MeeshySDK

// MARK: - La feuille « Signaler » (planche `Signaler`, #18873)
//
// Faite du kit (loi 12) : les huit motifs en tuiles K47, le mot facultatif en champ K08, « Bloquer aussi » en ligne
// K06, l'envoi en bouton K40 destructif, et l'après-envoi en bloc d'état K38 « succès ». Un envoi raté le dit et garde
// tout ce qui a été saisi. « Joindre des messages » (#19609) n'existe que si la passerelle l'annonce : rangée K20 de
// vignettes TEXTE cochées, et le choix parmi nos messages.

struct ProfileReportSheet: View {
    let name: String
    var avatarURL: String?
    var accentColor = ""
    var ring: ServedProfileDecorItem?
    var presence: PresenceState?
    let isAlreadyBlocked: Bool
    /// « Joindre des messages » : la source et la personne signalée. Sans source, ou sans limite annoncée par la
    /// passerelle, la section n'existe pas.
    var reportMessages: (any ProfileReportMessagesProviding)?
    var reportedUserId: String?
    let onSend: @MainActor (ProfileReportDraft) async -> ProfileReportOutcome
    /// Rebloque après un blocage demandé qui n'a pas abouti ; `true` une fois la personne bloquée.
    var onRetryBlock: @MainActor () async -> Bool = { false }

    @Environment(\.dismiss) private var dismiss
    @State private var draft = ProfileReportDraft()
    @State private var isSending = false
    @State private var sendFailed = false
    @State private var outcome: ProfileReportOutcome?
    @State private var showsMessagePicker = false
    @State private var isRetryingBlock = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            if let outcome, outcome.isSent {
                sentState(outcome)
            } else {
                compose
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .sheet(isPresented: $showsMessagePicker) {
            if let limit = attachmentsLimit {
                ProfileReportMessagePicker(load: ProfileReportAttachmentsRule.loader(reportMessages, userId: reportedUserId),
                                           limit: limit, draft: $draft)
            }
        }
    }

    private var compose: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            header
            MeeshyChoiceTiles(
                label: ProfileReportCopy.question,
                items: ProfileReportReason.allCases.map { reason in
                    MeeshyChoiceItem(id: reason.rawValue, title: reason.label, systemImage: reason.systemImage)
                },
                selection: .single(draft.reason?.rawValue),
                format: .wide,
                onSelect: { id in draft = draft.choosing(id) }
            )
            MeeshyField(
                ProfileReportCopy.detailsLabel,
                text: draft.details,
                input: .paragraph,
                limit: ProfileReportDraft.detailsLimit,
                onChange: { draft = draft.writing($0) }
            )
            if let limit = attachmentsLimit {
                ProfileReportAttachmentsSection(draft: draft, limit: limit,
                                                onToggle: { draft = draft.toggling($0, limit: limit) },
                                                onAdd: { showsMessagePicker = true })
            }
            if !isAlreadyBlocked {
                MeeshyToggleRow(ProfileReportCopy.alsoBlock(name), systemImage: "nosign",
                                subtitle: ProfileReportCopy.notNotified,
                                accessory: .toggle(isOn: draft.alsoBlocks),
                                action: { draft = draft.togglingBlock() })
            }
            if sendFailed {
                MeeshyStateBlock(kind: .error, title: ProfileReportCopy.notSent,
                                 primary: MeeshyStateBlockAction(title: ProfileStatesCopy.retry) { send() },
                                 size: .compact)
            }
            MeeshyButton(ProfileReportCopy.send, systemImage: "flag", kind: .danger, width: .fill,
                         isDestructive: true, isPending: isSending,
                         disabledReason: draft.canSend ? nil : ProfileReportCopy.chooseFirst,
                         action: { send() })
            MeeshyButton(ProfileReportCopy.cancel, kind: .text, width: .fill, action: { dismiss() })
        }
        .padding(MeeshySpacing.xl)
    }

    private var attachmentsLimit: Int? {
        ProfileReportAttachmentsRule.offeredLimit(reportMessages?.attachableLimit)
    }

    /// En tête, qui l'on signale : son avatar, « Signaler Rui », l'anonymat du signalement, et ✕ pour fermer.
    private var header: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: name, context: .userListItem, accentColor: accentColor, avatarURL: avatarURL,
                         presenceState: presence, ring: ring)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(verbatim: ProfileReportCopy.title(name))
                    .meeshyScaledFont(MeeshyFont.titleSize, weight: .heavy, design: .rounded)
                    .accessibilityAddTraits(.isHeader)
                Text(verbatim: ProfileReportCopy.anonymity)
                    .meeshyScaledFont(MeeshyFont.labelSize)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: MeeshySpacing.sm)
            MeeshyGlassButton(systemImage: "xmark", label: ProfileReportCopy.close, size: .s40, action: { dismiss() })
        }
    }

    /// Le succès, et sous lui — quand « Bloquer aussi » était demandé et n'a pas abouti — ce qui manque, avec
    /// « Réessayer » (loi 8) : l'utilisateur ne croit pas avoir bloqué ce qui ne l'est pas.
    private func sentState(_ outcome: ProfileReportOutcome) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshyStateBlock(
                kind: .success,
                title: ProfileReportCopy.thanks,
                primary: MeeshyStateBlockAction(title: ProfileReportCopy.close) { dismiss() },
                art: .none,
                consequences: outcome.isBlocked ? [ProfileReportCopy.isBlocked(name)] : []
            )
            if outcome.blockFailed {
                MeeshyStateBlock(kind: .error, title: ProfileReportCopy.blockFailed,
                                 primary: MeeshyStateBlockAction(title: ProfileStatesCopy.retry) { retryBlock(outcome) },
                                 size: .compact)
                    .disabled(isRetryingBlock)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .accessibilityIdentifier("profile.report.blockFailed")
            }
        }
        .padding(.vertical, MeeshySpacing.xxl)
    }

    private func retryBlock(_ failed: ProfileReportOutcome) {
        guard !isRetryingBlock else { return }
        isRetryingBlock = true
        Task {
            let blocked = await onRetryBlock()
            isRetryingBlock = false
            guard blocked else { return HapticFeedback.error() }
            HapticFeedback.success()
            outcome = failed.blocking()
        }
    }

    private func send() {
        guard draft.canSend, !isSending else { return }
        isSending = true
        sendFailed = false
        let sending = ProfileReportAttachmentsRule.sending(draft, limit: attachmentsLimit)
        Task {
            let result = await onSend(sending)
            isSending = false
            sendFailed = !result.isSent
            if result.isSent {
                HapticFeedback.success()
                outcome = result
            } else {
                HapticFeedback.error()
            }
        }
    }
}

enum ProfileReportCopy {
    static func title(_ name: String) -> String {
        String(format: String(localized: "profile.report.title", defaultValue: "Signaler %@", bundle: .module), name)
    }

    static var anonymity: String {
        String(localized: "profile.report.anonymity", defaultValue: "Ton signalement est anonyme. Notre équipe le lit sous 24 h.", bundle: .module)
    }

    static var question: String {
        String(localized: "profile.report.question", defaultValue: "Que se passe-t-il ?", bundle: .module)
    }

    static var detailsLabel: String {
        String(localized: "profile.report.noteLabel", defaultValue: "Dis-nous en plus · facultatif", bundle: .module)
    }

    static func alsoBlock(_ name: String) -> String {
        String(format: String(localized: "profile.report.alsoBlock", defaultValue: "Bloquer %@ aussi", bundle: .module), name)
    }

    static var notNotified: String {
        String(localized: "profile.report.notNotified", defaultValue: "Il ne sera pas prévenu", bundle: .module)
    }

    static var send: String {
        String(localized: "profile.report.send", defaultValue: "Envoyer le signalement", bundle: .module)
    }

    static var chooseFirst: String {
        String(localized: "profile.report.chooseFirst", defaultValue: "Choisis d'abord ce qui se passe", bundle: .module)
    }

    static var cancel: String {
        String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module)
    }

    static var notSent: String {
        String(localized: "profile.report.notSent", defaultValue: "Ton signalement n'est pas parti", bundle: .module)
    }

    static var thanks: String {
        String(localized: "profile.report.thanks", defaultValue: "Merci. C'est entre nos mains.", bundle: .module)
    }

    static var blockFailed: String {
        String(localized: "profile.report.blockFailed", defaultValue: "Le blocage n'a pas abouti", bundle: .module)
    }

    static func isBlocked(_ name: String) -> String {
        String(format: String(localized: "profile.report.isBlocked", defaultValue: "%@ est bloqué.", bundle: .module), name)
    }

    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .module)
    }
}
