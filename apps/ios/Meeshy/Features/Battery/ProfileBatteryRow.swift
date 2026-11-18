import SwiftUI
import MeeshySDK
import MeeshyUI

/// La batterie sur la fiche d'une personne (#14147), dès Proche :
/// 1. le détail de SA batterie pendant un épisode (rien hors épisode) ;
/// 2. au Sang, « Demander un relevé » — limité par la passerelle ;
/// 3. MON partage avec elle : à Proche, offert UNE fois, case non cochée ; entre Sangs, actif d'office et coupable.
struct ProfileBatteryRow: View {
    @StateObject private var viewModel: ProfileBatteryViewModel
    let displayName: String
    let canPull: Bool
    let asksConsent: Bool
    /// Faux sous « Son téléphone » (#19433) : la tuile Batterie dit déjà son relevé.
    let showsDetail: Bool
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, canPull: Bool, asksConsent: Bool, showsDetail: Bool = true) {
        _viewModel = StateObject(wrappedValue: ProfileBatteryViewModel(
            userId: userId,
            service: BatteryService.shared,
            consent: UserDefaultsBatteryConsentMemory.shared,
            viewerId: { AuthManager.shared.currentUser?.id }
        ))
        self.displayName = displayName
        self.canPull = canPull
        self.asksConsent = asksConsent
        self.showsDetail = showsDetail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if showsDetail {
                BatteryDetailSection(userId: viewModel.userId)
            }
            if canPull {
                pullRow
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

    private var pullRow: some View {
        HStack(spacing: MeeshySpacing.md) {
            Text(viewModel.pullState == .requested ? BatteryProfileWording.pullRequested : BatteryProfileWording.pullExplain)
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                HapticFeedback.light()
                Task { await viewModel.requestReading() }
            } label: {
                Label(BatteryProfileWording.pullAction, systemImage: "battery.50")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.pullState != .idle)
            .accessibilityHint(BatteryProfileWording.pullHint(name: displayName))
            .accessibilityIdentifier("battery.pull")
        }
    }

    private var consentOffer: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(BatteryProfileWording.consentTitle(name: displayName))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(theme.textPrimary)
            Text(BatteryProfileWording.consentBody)
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                viewModel.consentChecked.toggle()
            } label: {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: viewModel.consentChecked ? "checkmark.square.fill" : "square")
                        .foregroundStyle(viewModel.consentChecked ? MeeshyColors.indigo500 : theme.textSecondary)
                    Text(BatteryProfileWording.shareWith(name: displayName))
                        .font(.subheadline)
                        .foregroundStyle(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(viewModel.consentChecked ? [.isSelected] : [])
            .accessibilityIdentifier("battery.consent.checkbox")
            Button(BatteryProfileWording.consentConfirm) {
                Task { await viewModel.answerConsent() }
            }
            .buttonStyle(.borderedProminent)
            .frame(minHeight: MeeshyControlSize.tapTarget)
            .accessibilityIdentifier("battery.consent.confirm")
        }
        .padding(MeeshySpacing.md)
        .background(MeeshyColors.indigo500.opacity(MeeshyOpacity.subtle))
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
    }

    private func shareToggle(_ settings: BatteryPersonSettings) -> some View {
        Toggle(isOn: Binding(
            get: { settings.isShared },
            set: { shared in Task { await viewModel.setShared(shared) } }
        )) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Text(BatteryProfileWording.shareWith(name: displayName))
                    .font(.subheadline)
                    .foregroundStyle(theme.textPrimary)
                Text(BatteryProfileWording.shareFootnote)
                    .font(.caption)
                    .foregroundStyle(theme.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .tint(MeeshyColors.indigo500)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .accessibilityIdentifier("battery.share.person")
    }
}

/// La mémoire de l'offre de partage, par compte et par personne (aucune donnée sensible).
final class UserDefaultsBatteryConsentMemory: BatteryConsentRemembering {
    static let shared = UserDefaultsBatteryConsentMemory()
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
        "me.meeshy.battery.consentOffered.\(viewerId).\(peerId)"
    }
}

/// Les mots de la batterie sur une fiche.
enum BatteryProfileWording {
    static var pullAction: String {
        String(localized: "battery.pull.action", defaultValue: "Demander un relevé", bundle: .main)
    }
    static var pullExplain: String {
        String(localized: "battery.pull.explain", defaultValue: "Son téléphone relèvera sa batterie maintenant", bundle: .main)
    }
    static var pullRequested: String {
        String(localized: "battery.pull.requested", defaultValue: "Relevé demandé : il s'affiche s'il est bas", bundle: .main)
    }
    static func pullHint(name: String) -> String {
        String(format: String(localized: "battery.pull.hint", defaultValue: "Demande au téléphone de %@ de relever sa batterie", bundle: .main), name)
    }
    static func shareWith(name: String) -> String {
        String(format: String(localized: "battery.share.with", defaultValue: "Partager ma batterie avec %@", bundle: .main), name)
    }
    static var shareFootnote: String {
        String(localized: "battery.share.footnote", defaultValue: "Seulement quand elle est basse, jamais au-dessus du seuil bas", bundle: .main)
    }
    static func consentTitle(name: String) -> String {
        String(format: String(localized: "battery.consent.title", defaultValue: "%@ est maintenant un Proche", bundle: .main), name)
    }
    static var consentBody: String {
        String(localized: "battery.consent.body", defaultValue: "Tu peux lui montrer quand ta batterie est basse, pour qu'il sache pourquoi tu ne réponds plus. Ce réglage reste modifiable ici.", bundle: .main)
    }
    static var consentConfirm: String {
        String(localized: "battery.consent.confirm", defaultValue: "Continuer", bundle: .main)
    }
}
