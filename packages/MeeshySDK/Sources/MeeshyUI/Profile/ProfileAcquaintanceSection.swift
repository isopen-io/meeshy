import SwiftUI
import MeeshySDK

// MARK: - « Faire connaissance » (#19456, planche `Autre-Inconnu`)
//
// Sur la Vitrine d'un inconnu, à la place de « Avec … », après les publications : « Demander à lui écrire » ouvre la
// demande rédigée sur place (K08, 300 signes, son compteur, la langue où il la lira, « Envoyer la demande » en K40),
// « L'appeler » dit ce que fera l'appel, « Demander à être amis » tant qu'aucune demande n'est en cours ; puis la note
// K46 « Si vous partagez une communauté ». Tout est du kit : rangées K06 dans une carte K43, en-tête K44.

struct ProfileAcquaintanceSection: View {
    let name: String
    let readingLanguage: String?
    let tint: Color
    let offersCall: Bool
    let offersFriendRequest: Bool
    @ObservedObject var model: ProfileAcquaintanceModel
    let onSend: () -> Void
    let onCall: () -> Void
    let onAskFriend: () -> Void

    @State private var isComposing = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileAcquaintanceCopy.title)
            MeeshyGroupCard(surface: .accent, layout: .content, tint: tint) {
                VStack(alignment: .leading, spacing: 0) {
                    askRow
                    if isComposing {
                        composer
                            .padding(MeeshySpacing.md)
                    }
                    if offersCall {
                        MeeshyToggleRow(ProfileAcquaintanceCopy.callTitle, systemImage: "phone",
                                        subtitle: ProfileAcquaintanceCopy.callSubtitle(name), accessory: .chevron,
                                        showsDivider: true, tint: tint, action: onCall)
                            .accessibilityIdentifier("profile.acquaint.call")
                    }
                    if offersFriendRequest {
                        MeeshyToggleRow(ProfileAcquaintanceCopy.askFriend, systemImage: "person.badge.plus",
                                        accessory: .chevron, showsDivider: true, tint: tint, action: onAskFriend)
                            .accessibilityIdentifier("profile.acquaint.friend")
                    }
                }
            }
            communityNote
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("profile.vitrine.acquaint")
    }

    private var askRow: some View {
        MeeshyToggleRow(ProfileAcquaintanceCopy.askTitle, systemImage: "bubble.left.fill",
                        subtitle: ProfileAcquaintanceCopy.askSubtitle,
                        accessory: isComposing ? .none : .chevron, tint: tint,
                        action: { withAnimation(reduceMotion ? nil : MeeshyAnimation.springDefault) { isComposing.toggle() } })
            .accessibilityValue(isComposing ? ProfileAcquaintanceCopy.opened : ProfileAcquaintanceCopy.closed)
            .accessibilityIdentifier("profile.acquaint.ask")
    }

    @ViewBuilder
    private var composer: some View {
        switch model.flow.stage {
        case .sent:
            MeeshyNote(ProfileAcquaintanceCopy.sent, form: .band, kind: .ok, announces: true)
                .accessibilityIdentifier("profile.acquaint.sent")
        case .composing, .unsent:
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshyField(ProfileAcquaintanceCopy.fieldLabel, text: model.flow.draft.text, input: .paragraph,
                            limit: ProfileMessageRequestDraft.limit, counter: .hosted,
                            onChange: { text in model.edit(text) })
                    .accessibilityIdentifier("profile.acquaint.field")
                HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.sm) {
                    if let readingLanguage {
                        MeeshyNote(ProfileAcquaintanceCopy.readsIn(name: name, language: readingLanguage),
                                   lead: .systemImage("translate"), tint: tint)
                    }
                    Spacer(minLength: 0)
                    MeeshyFieldCounter(count: model.flow.draft.count, limit: ProfileMessageRequestDraft.limit)
                }
                if model.flow.stage == .unsent {
                    MeeshyNote(ProfileAcquaintanceCopy.unsent, form: .band, kind: .warn, announces: true)
                }
                MeeshyButton(ProfileAcquaintanceCopy.send, systemImage: "paperplane.fill", kind: .accent,
                             width: .fill, tint: tint, action: onSend)
                    .disabled(!model.flow.canSend)
                    .accessibilityIdentifier("profile.acquaint.send")
            }
        }
    }

    private var communityNote: some View {
        MeeshyGroupCard(overline: ProfileAcquaintanceCopy.communityOverline, surface: .raised, layout: .content) {
            MeeshyNote(ProfileAcquaintanceCopy.storyName(name), lead: .systemImage("eye"))
        }
        .accessibilityIdentifier("profile.acquaint.community")
    }
}

extension ProfileAcquaintanceSection {

    /// L'app a jugé que écrire part en demande, et la fiche le confirme (ni lien servi, ni connexion acceptée).
    static func replacesWithThem(_ sheet: UserProfileSheet) -> Bool {
        sheet.showsRelationBlocks && sheet.writesARequest && sheet.acquaintance.writesARequest
    }

    /// La section d'une fiche : rien tant que l'app n'a pas jugé que écrire part en demande.
    @ViewBuilder
    static func of(_ sheet: UserProfileSheet) -> some View {
        if replacesWithThem(sheet) {
            let model = sheet.acquaintance
            let host = sheet.dependencies.acquaintance
            let userId = sheet.resolvedUserId
            ProfileAcquaintanceSection(
                name: ProfileVitrineCopy.firstName(sheet.displayUser.resolvedDisplayName),
                readingLanguage: ProfileReadingLanguage.name(of: sheet.displayUser.systemLanguage, in: .current),
                tint: sheet.accentTint,
                offersCall: sheet.offersCall,
                offersFriendRequest: sheet.connectionStatus == .none,
                model: model,
                onSend: { Task { await model.send(to: userId, host: host) } },
                onCall: { sheet.requestCall(isVideo: false) },
                onAskFriend: { Task { await sheet.sendConnectionRequest() } }
            )
        }
    }
}

/// Les mots de « Faire connaissance » : une seule source, isolée au MainActor comme `Bundle.module` dans MeeshyUI.
enum ProfileAcquaintanceCopy {
    static var title: String {
        String(localized: "profile.acquaint.title", defaultValue: "Faire connaissance", bundle: .module)
    }

    static var askTitle: String {
        String(localized: "profile.acquaint.ask.title", defaultValue: "Demander à lui écrire", bundle: .module)
    }

    static var askSubtitle: String {
        String(localized: "profile.acquaint.ask.subtitle", defaultValue: "Ton premier message arrive dans ses demandes",
               bundle: .module)
    }

    static var opened: String {
        String(localized: "profile.acquaint.ask.opened", defaultValue: "Ouvert", bundle: .module)
    }

    static var closed: String {
        String(localized: "profile.acquaint.ask.closed", defaultValue: "Fermé", bundle: .module)
    }

    static var fieldLabel: String {
        String(localized: "profile.acquaint.field.label", defaultValue: "Ta demande de message", bundle: .module)
    }

    static func readsIn(name: String, language: String) -> String {
        String(format: String(localized: "profile.acquaint.readsIn", defaultValue: "%1$@ le lira en %2$@",
                              bundle: .module), name, language)
    }

    static var send: String {
        String(localized: "profile.acquaint.send", defaultValue: "Envoyer la demande", bundle: .module)
    }

    static var sent: String {
        String(localized: "profile.acquaint.sent", defaultValue: "Demande envoyée · elle attend dans ses demandes",
               bundle: .module)
    }

    static var unsent: String {
        String(localized: "profile.acquaint.unsent", defaultValue: "Ta demande n'est pas partie. Réessaie.",
               bundle: .module)
    }

    static var callTitle: String {
        String(localized: "profile.acquaint.call.title", defaultValue: "L'appeler", bundle: .module)
    }

    static func callSubtitle(_ name: String) -> String {
        String(format: String(localized: "profile.acquaint.call.subtitle",
                              defaultValue: "Ça sonnera chez %@, qui peut ne pas répondre", bundle: .module), name)
    }

    static var askFriend: String {
        String(localized: "profile.acquaint.friend", defaultValue: "Demander à être amis", bundle: .module)
    }

    static var communityOverline: String {
        String(localized: "profile.acquaint.community.overline", defaultValue: "Si vous partagez une communauté",
               bundle: .module)
    }

    static func storyName(_ name: String) -> String {
        String(format: String(localized: "profile.acquaint.community.storyName",
                              defaultValue: "%@ voit ton nom quand tu regardes ses stories", bundle: .module), name)
    }
}
