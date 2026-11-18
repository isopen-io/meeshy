import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le téléphone injoignable sur la fiche d'une personne (#18737), dès Proche :
/// 1. SON état quand son téléphone ne répond plus (rien sinon) ;
/// 2. « Me prévenir s'il devient injoignable » (#19433), quand la passerelle sert le choix (#19435) ;
/// 3. MON partage avec elle : à Proche, offert UNE fois, case non cochée ; entre Sangs, actif d'office et coupable.
struct ProfilePhoneReachabilityRow: View {
    @StateObject private var viewModel: ProfilePhoneReachabilityViewModel
    let displayName: String
    let asksConsent: Bool
    /// Faux sous « Son téléphone » : la tuile Réseau dit déjà son état.
    let showsDetail: Bool
    let tint: Color
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, asksConsent: Bool, showsDetail: Bool = true,
         tint: Color = MeeshyColors.indigo500) {
        _viewModel = StateObject(wrappedValue: ProfilePhoneReachabilityViewModel(
            userId: userId,
            service: PhoneReachabilityService.shared,
            consent: UserDefaultsPhoneReachabilityConsentMemory.shared,
            viewerId: { AuthManager.shared.currentUser?.id }
        ))
        self.displayName = displayName
        self.asksConsent = asksConsent
        self.showsDetail = showsDetail
        self.tint = tint
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if showsDetail {
                PhoneReachabilityDetailSection(userId: viewModel.userId)
            }
            if let alerts = viewModel.settings?.alertsMe {
                alertToggle(alerts)
            }
            if viewModel.showsConsentOffer {
                consentOffer
            } else if let settings = viewModel.settings {
                shareToggle(settings)
            }
        }
        .task(id: viewModel.userId) { await viewModel.load(asksConsent: asksConsent) }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }

    private var consentOffer: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(PhoneReachabilitySettingsWording.consentTitle(name: displayName))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
            Text(PhoneReachabilitySettingsWording.consentBody)
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                viewModel.consentChecked.toggle()
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: viewModel.consentChecked ? "checkmark.square.fill" : "square")
                        .foregroundStyle(viewModel.consentChecked ? MeeshyColors.indigo500 : theme.textSecondary)
                    Text(PhoneReachabilitySettingsWording.shareWith(name: displayName))
                        .font(.subheadline)
                        .foregroundStyle(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(viewModel.consentChecked ? [.isSelected] : [])
            .accessibilityIdentifier("phoneReachability.consent.checkbox")
            Button(PhoneReachabilitySettingsWording.consentConfirm) {
                Task { await viewModel.answerConsent() }
            }
            .buttonStyle(.borderedProminent)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .accessibilityIdentifier("phoneReachability.consent.confirm")
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.indigo500.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }

    private func alertToggle(_ alerts: Bool) -> some View {
        MeeshyToggleRow(PhoneReachabilitySettingsWording.alertMe, systemImage: "bell.badge", accessory: .toggle(isOn: alerts),
                        tint: tint) {
            Task { await viewModel.setAlertsMe(!alerts) }
        }
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        .accessibilityIdentifier("phoneReachability.alert.person")
    }

    private func shareToggle(_ settings: PhoneReachabilityPersonSettings) -> some View {
        Toggle(isOn: Binding(
            get: { settings.isShared },
            set: { shared in Task { await viewModel.setShared(shared) } }
        )) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(PhoneReachabilitySettingsWording.shareWith(name: displayName))
                    .font(.subheadline)
                    .foregroundStyle(theme.textPrimary)
                Text(PhoneReachabilitySettingsWording.shareFootnote)
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(MeeshyColors.indigo500)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .accessibilityIdentifier("phoneReachability.share.person")
    }
}

/// La mémoire de l'offre de partage, par compte et par personne (aucune donnée sensible).
final class UserDefaultsPhoneReachabilityConsentMemory: PhoneReachabilityConsentRemembering {
    static let shared = UserDefaultsPhoneReachabilityConsentMemory()
    private let defaults: UserDefaults

    nonisolated deinit {}

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func wasOffered(viewerId: String, peerId: String) -> Bool {
        defaults.bool(forKey: Self.key(viewerId, peerId))
    }

    func markOffered(viewerId: String, peerId: String) {
        defaults.set(true, forKey: Self.key(viewerId, peerId))
    }

    private static func key(_ viewerId: String, _ peerId: String) -> String {
        "me.meeshy.phoneReachability.consentOffered.\(viewerId).\(peerId)"
    }
}
