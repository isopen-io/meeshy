import SwiftUI
import MeeshySDK
import MeeshyUI

struct CallDeclineSheet: View {
    @ObservedObject var callManager: CallManager
    let onClose: () -> Void

    @State private var draft: String = ""

    private var trimmedDraft: String {
        draft.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
                    ForEach(CallDeclineQuickReply.allCases) { reply in
                        quickReplyButton(reply)
                    }
                    customField
                        .padding(.top, MeeshySpacing.md)
                }
                .padding(MeeshySpacing.lg)
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle(String(localized: "call.decline.title", defaultValue: "Refuser avec un message", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "call.decline.cancel", defaultValue: "Annuler", bundle: .main), action: onClose)
                        .frame(minHeight: 44)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func quickReplyButton(_ reply: CallDeclineQuickReply) -> some View {
        Button {
            decline(with: reply.text, language: CallDeclineQuickReply.interfaceLanguage)
        } label: {
            Text(reply.text)
                .font(.body)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
        .accessibilityHint(String(localized: "call.decline.reply.hint", defaultValue: "Refuse l'appel et envoie ce message", bundle: .main))
    }

    private var customField: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            TextField(
                String(localized: "call.decline.custom.placeholder", defaultValue: "Écrire un message…", bundle: .main),
                text: $draft
            )
            .submitLabel(.send)
            .onSubmit(sendDraft)
            .adaptiveOnChange(of: draft) { _, value in
                guard value.count > CallDeclineReplyRule.maxLength else { return }
                draft = String(value.prefix(CallDeclineReplyRule.maxLength))
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
            .accessibilityLabel(String(localized: "call.decline.custom.label", defaultValue: "Votre message", bundle: .main))

            Button(action: sendDraft) {
                Text(String(localized: "call.decline.custom.send", defaultValue: "Envoyer et refuser", bundle: .main))
                    .font(.body.weight(.semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.plain)
            .background(MeeshyColors.error, in: Capsule())
            .opacity(trimmedDraft.isEmpty ? 0.4 : 1)
            .disabled(trimmedDraft.isEmpty)
        }
    }

    private func sendDraft() {
        let language = AuthManager.shared.currentUser?.preferredContentLanguages.first
            ?? CallDeclineQuickReply.interfaceLanguage
        decline(with: draft, language: language)
    }

    private func decline(with text: String, language: String?) {
        guard callManager.rejectCall(withReply: text, originalLanguage: language) else { return }
        onClose()
    }
}
