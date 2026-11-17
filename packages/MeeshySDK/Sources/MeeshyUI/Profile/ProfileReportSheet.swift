import SwiftUI
import MeeshySDK

// MARK: - La feuille « Signaler » (planche `Signaler`, #18873)
//
// Faite du kit (loi 12) : les huit motifs en tuiles K47, le mot facultatif en champ K08, « Bloquer aussi » en ligne
// K06, l'envoi en bouton K40 destructif, et l'après-envoi en bloc d'état K38 « succès ». Un envoi raté le dit et garde
// tout ce qui a été saisi.

struct ProfileReportSheet: View {
    let name: String
    var avatarURL: String?
    var accentColor = ""
    var ring: ServedProfileDecorItem?
    let isAlreadyBlocked: Bool
    let onSend: (ProfileReportDraft) async -> ProfileReportOutcome

    @Environment(\.dismiss) private var dismiss
    @State private var draft = ProfileReportDraft()
    @State private var isSending = false
    @State private var sendFailed = false
    @State private var outcome: ProfileReportOutcome?

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

    /// En tête, qui l'on signale : son avatar, « Signaler Rui », l'anonymat du signalement, et ✕ pour fermer.
    private var header: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: name, context: .userListItem, accentColor: accentColor, avatarURL: avatarURL, ring: ring)
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

    private func sentState(_ outcome: ProfileReportOutcome) -> some View {
        MeeshyStateBlock(
            kind: .success,
            title: ProfileReportCopy.thanks,
            primary: MeeshyStateBlockAction(title: ProfileReportCopy.close) { dismiss() },
            art: .none,
            consequences: outcome.isBlocked ? [ProfileReportCopy.isBlocked(name)] : []
        )
        .padding(.vertical, MeeshySpacing.xxl)
    }

    private func send() {
        guard draft.canSend, !isSending else { return }
        isSending = true
        sendFailed = false
        let sending = draft
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

    static func isBlocked(_ name: String) -> String {
        String(format: String(localized: "profile.report.isBlocked", defaultValue: "%@ est bloqué.", bundle: .module), name)
    }

    static var close: String {
        String(localized: "common.close", defaultValue: "Fermer", bundle: .module)
    }
}
