import SwiftUI
import MessageUI
import MeeshySDK
import MeeshyUI

// MARK: - Carte 4 — trouve ta bande, et retrouve tes amis (#8105)

/// La carte 4 lit le modèle et ne décide de rien. Sa forme suit la phase de la
/// proposition « retrouver tes amis » : l'offre d'abord (le bénéfice avant la
/// permission), puis les amis trouvés — ou, si le carnet n'en compte aucun
/// encore, une invitation. Refusée ou remise à plus tard, la carte redevient
/// celle des suggestions, inchangée.
struct OnboardingFriendsCard: View {
    @ObservedObject var model: OnboardingViewModel
    let isDark: Bool

    @State private var showsAllRows = false
    @State private var invitation: OnboardingInvitation?
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced
    @Environment(\.openURL) private var openURL

    private var reduceMotion: Bool { MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced) }

    var body: some View {
        Group {
            switch model.contactsPhase {
            case .offer, .searching: offer
            default: friends
            }
        }
        .task { await model.friendsCardAppeared() }
        .sheet(item: $invitation) { invitation in
            SMSComposerView(recipients: [], body: invitation.message)
                .ignoresSafeArea()
        }
    }

    // MARK: L'offre

    private var offer: some View {
        let searching = model.contactsPhase == .searching
        return OnboardingCardLayout(
            title: String(localized: "onboarding.contacts.offer.title", bundle: .main),
            message: String(localized: "onboarding.contacts.offer.body", bundle: .main),
            isDark: isDark,
            primary: OnboardingAction(title: String(localized: "onboarding.contacts.offer.find", bundle: .main),
                                      identifier: "onboarding.contacts.find",
                                      isEnabled: !searching,
                                      isBusy: searching) {
                Task { await model.findFriendsInContacts() }
            },
            secondary: OnboardingAction(title: String(localized: "onboarding.later", bundle: .main),
                                        identifier: "onboarding.contacts.later") {
                Task { searching ? await model.continueFromFriends() : await model.declineContacts() }
            },
            illustration: { OnboardingFriendsIllustration(names: model.suggestions.map(\.displayName), isDark: isDark) },
            content: {
                Label(String(localized: "onboarding.contacts.offer.promise", bundle: .main), systemImage: "hand.raised.fill")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .frame(maxWidth: .infinity)
            }
        )
    }

    // MARK: Les amis et les suggestions

    private var friends: some View {
        OnboardingCardLayout(
            title: headline.title,
            message: headline.message,
            isDark: isDark,
            primary: friendsPrimary,
            secondary: nil,
            illustration: { OnboardingFriendsIllustration(names: model.friendRows.map(\.displayName), isDark: isDark) },
            content: {
                VStack(spacing: MeeshySpacing.sm) {
                    phaseBanner
                    rows
                }
            }
        )
    }

    private var headline: (title: String, message: String) {
        switch model.contactsPhase {
        case .found(let found) where !found.isEmpty:
            return (String(localized: "onboarding.contacts.found.title", bundle: .main),
                    String(localized: "onboarding.contacts.found.body", bundle: .main))
        case .found:
            return (String(localized: "onboarding.contacts.none.title", bundle: .main),
                    String(localized: "onboarding.contacts.none.body", bundle: .main))
        default:
            return (String(localized: "onboarding.friends.title", bundle: .main),
                    String.localizedStringWithFormat(String(localized: "onboarding.friends.body", bundle: .main),
                                                     OnboardingRewards.friendship))
        }
    }

    @ViewBuilder
    private var phaseBanner: some View {
        switch model.contactsPhase {
        case .found(let found) where found.isEmpty && MFMessageComposeViewController.canSendText():
            bannerButton(text: String(localized: "onboarding.contacts.invite", bundle: .main),
                         icon: "paperplane.fill", tint: MeeshyColors.indigo500,
                         identifier: "onboarding.contacts.invite") {
                invitation = OnboardingInvitation(message: String(localized: "onboarding.contacts.invite.message", bundle: .main))
            }
        case .deniedBySystem:
            bannerButton(text: String(localized: "onboarding.contacts.settings", bundle: .main),
                         icon: "person.crop.circle.badge.plus", tint: MeeshyColors.indigo500,
                         identifier: "onboarding.contacts.settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                openURL(url)
            }
        case .failed:
            bannerButton(text: String(localized: "onboarding.contacts.failed", bundle: .main),
                         icon: "arrow.clockwise.circle.fill", tint: MeeshyColors.warning,
                         identifier: "onboarding.contacts.retry") {
                Task { await model.findFriendsInContacts() }
            }
        default:
            EmptyView()
        }
    }

    @ViewBuilder
    private var rows: some View {
        let all = model.friendRows
        ForEach(OnboardingCardFit.visibleSuggestions(all, expanded: showsAllRows)) { row in
            OnboardingSuggestionRow(
                suggestion: row,
                isRequested: model.requestedProfileIds.contains(row.id),
                didFail: model.failedProfileId == row.id,
                isDark: isDark
            ) { Task { await model.addFriend(id: row.id) } }
        }
        if OnboardingCardFit.hiddenSuggestionCount(all, expanded: showsAllRows) > 0 {
            Button {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { showsAllRows = true }
            } label: {
                Label(String(localized: "onboarding.friends.more", bundle: .main), systemImage: "chevron.down")
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .rounded))
                    .foregroundStyle(MeeshyColors.indigo500)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("onboarding.friends.more")
        }
        if !all.isEmpty {
            Label(String.localizedStringWithFormat(String(localized: "onboarding.friends.pending", bundle: .main), OnboardingRewards.friendship),
                  systemImage: "hourglass")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
        }
    }

    /// Avant tout ajout, « Plus tard » est la sortie réelle : elle tient la
    /// place principale. « Continuer » ne la remplace qu'au premier ajout.
    private var friendsPrimary: OnboardingAction {
        switch OnboardingCardFit.friendsActions(hasRequests: !model.requestedProfileIds.isEmpty) {
        case .laterOnly:
            return OnboardingAction(title: String(localized: "onboarding.later", bundle: .main),
                                    identifier: "onboarding.later") { Task { await model.continueFromFriends() } }
        case .continueOnly:
            return OnboardingAction(title: String(localized: "onboarding.continue", bundle: .main),
                                    identifier: "onboarding.friends.continue") { Task { await model.continueFromFriends() } }
        }
    }

    private func bannerButton(text: String, icon: String, tint: Color, identifier: String,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: MeeshySpacing.md) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(MeeshyFont.titleSize))
                    .foregroundStyle(tint)
                    .accessibilityHidden(true)
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold))
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .accessibilityHidden(true)
            }
            .padding(MeeshySpacing.md)
            .frame(minHeight: 44)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(tint.opacity(0.12)))
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }
}

/// Le SMS que l'utilisateur envoie LUI-MÊME : aucun destinataire pré-rempli,
/// aucun envoi à sa place.
struct OnboardingInvitation: Identifiable {
    let message: String
    var id: String { message }
}
