import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le parcours sans contact de la planche `Sans-Contact` (#19484), fait du kit : (1) l'approche, (2) « Sofia Benali
/// est là » et le choix en tuiles K47, (3) le reçu. Le repli QR (4, « Sans la puce ») reste à l'hôte, sous ce bloc.
/// Un téléphone qui ne peut pas le dit à l'hôte par `isUnavailable`, qui montre alors son bloc d'état.
struct ContactlessExchangeSection: View {
    let accent: Color
    let accentColor: String
    @Binding var isUnavailable: Bool
    let onOpenProfile: (URL) -> Void

    @StateObject private var model: ContactlessExchangeModel
    @State private var openNoteID: String?
    private var theme: ThemeManager { ThemeManager.shared }

    init(me: ContactlessHello?, accent: Color, accentColor: String, isUnavailable: Binding<Bool>,
         onOpenProfile: @escaping (URL) -> Void) {
        self.accent = accent
        self.accentColor = accentColor
        _isUnavailable = isUnavailable
        self.onOpenProfile = onOpenProfile
        _model = StateObject(wrappedValue: ContactlessExchangeModel(me: me))
    }

    private var state: ContactlessExchangeState { model.state }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
            switch state.step {
            case .approaching: approach
            case .found, .given: exchange
            case .unavailable: EmptyView()
            }
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
        .onReceive(model.$state.map { $0.step == .unavailable }.removeDuplicates()) { isUnavailable = $0 }
        .accessibilityIdentifier("profile.card.contactless")
    }

    // MARK: - 1 · Approche

    private var approach: some View {
        MeeshyStateBlock(kind: .empty, title: ContactlessCopy.approachTitle, message: ContactlessCopy.approachHint,
                         art: .glyph, size: .compact, tint: accent, systemImage: "wave.3.right")
            .accessibilityIdentifier("profile.card.contactless.approach")
    }

    // MARK: - 2 · Trouvé, 3 · Reçu

    @ViewBuilder
    private var exchange: some View {
        if let theirs = state.theirs {
            receipt(theirs)
        } else if let peer = state.peer, state.step == .found {
            person(name: ContactlessCopy.isHere(peer.displayName), username: peer.username, avatar: nil)
        }
        if state.step == .found {
            choice
        } else if let name = state.peerName {
            given(name: name)
        }
    }

    private func person(name: String, username: String, avatar: String?) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            MeeshyAvatar(name: username, context: .custom(56), accentColor: accentColor, avatarURL: avatar)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: name)
                    .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                    .foregroundStyle(theme.textPrimary)
                Text(verbatim: "@\(username)")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, design: .monospaced))
                    .foregroundStyle(theme.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private var choice: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshyInfoNoted(note: ContactlessCopy.phoneNote, openNoteID: $openNoteID, tint: theme.textSecondary) {
                MeeshySectionHeader(title: ContactlessCopy.whatIGive, form: .overline)
            }
            MeeshyChoiceTiles(label: ContactlessCopy.whatIGive, items: giftItems,
                              selection: .multiple(Set(state.chosen.map(\.rawValue))), columns: 3, tint: accent,
                              allowsEmpty: true,
                              onSelect: { id in if let gift = ContactlessGift(rawValue: id) { model.toggle(gift) } })
                .accessibilityIdentifier("profile.card.contactless.gifts")
            MeeshyButton(ContactlessCopy.give, systemImage: "wave.3.right", kind: .primary, width: .fill, tint: accent,
                         isPending: state.isGiving,
                         disabledReason: state.chosenOffers.isEmpty ? ContactlessCopy.chooseOne : nil,
                         action: { Task { await model.give() } })
                .accessibilityIdentifier("profile.card.contactless.give")
            if state.giveFailed {
                MeeshyNote(ContactlessCopy.giveFailed, kind: .warn, lead: .systemImage("exclamationmark.triangle"),
                           announces: true)
            }
            MeeshyNote(ContactlessCopy.eachChooses, lead: .systemImage("arrow.left.arrow.right"))
        }
    }

    private var giftItems: [MeeshyChoiceItem] {
        [
            MeeshyChoiceItem(id: ContactlessGift.vitrine.rawValue, title: ContactlessCopy.vitrine,
                             systemImage: "person.crop.square"),
            MeeshyChoiceItem(id: ContactlessGift.friendRequest.rawValue, title: ContactlessCopy.friendRequest,
                             systemImage: "hands.clap"),
            MeeshyChoiceItem(id: ContactlessGift.phone.rawValue, title: ContactlessCopy.phone, systemImage: "phone",
                             state: .locked(key: ContactlessGift.phone.rawValue)),
        ]
    }

    private func receipt(_ theirs: ContactExchangeAccepted) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            person(name: theirs.issuer.shownName, username: theirs.issuer.username, avatar: theirs.issuer.avatar)
            if let bio = theirs.bio {
                Text(verbatim: bio)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize))
                    .foregroundStyle(theme.textSecondary)
            }
            if theirs.offers.contains(.vitrine), let link = ProfileLink(username: theirs.issuer.username) {
                MeeshyButton(ContactlessCopy.seeShowcase, systemImage: "person.crop.square", kind: .primary,
                             width: .fill, tint: accent, action: { onOpenProfile(link.url) })
                    .accessibilityIdentifier("profile.card.contactless.seeShowcase")
            }
            friendAction(theirs)
        }
        .accessibilityIdentifier("profile.card.contactless.receipt")
    }

    @ViewBuilder
    private func friendAction(_ theirs: ContactExchangeAccepted) -> some View {
        if theirs.friendRequest == .sent {
            MeeshyNote(ContactlessCopy.askedYou(theirs.issuer.shownName), kind: .info,
                       lead: .systemImage("hands.clap"))
        } else {
            MeeshyButton(state.friendAsked ? ContactlessCopy.friendAskSent : ContactlessCopy.askFriends,
                         systemImage: state.friendAsked ? "checkmark" : "hands.clap", kind: .outline, width: .fill,
                         tint: accent, disabledReason: state.friendAsked ? ContactlessCopy.friendAskSent : nil,
                         action: { Task { await model.askToBeFriends() } })
                .accessibilityIdentifier("profile.card.contactless.askFriends")
        }
    }

    @ViewBuilder
    private func given(name: String) -> some View {
        if let acknowledged = ContactlessCopy.acknowledged(name, received: state.acknowledged) {
            MeeshyNote(acknowledged, kind: .ok, lead: .systemImage("checkmark.circle"), announces: true)
                .accessibilityIdentifier("profile.card.contactless.acknowledged")
        } else if state.theirs == nil {
            MeeshyNote(ContactlessCopy.choosing(name), lead: .pulse)
        }
    }
}
