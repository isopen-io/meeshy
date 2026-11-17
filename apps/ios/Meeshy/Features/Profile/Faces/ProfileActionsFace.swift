import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que la face Actions de MA fiche demande à son hôte : la face ne connaît ni le routeur ni les feuilles.
enum ProfileFaceAction: Hashable {
    case share
    case seenAs
    case edit
    case stats
    case legend
    case security
    case settings
    case logout
    case door(ProfileDoor)
}

/// La face Actions de MA fiche (#18869, planche `Moi-Actions`) : ce que je peux faire.
///
/// Faite du kit : les actions libellées en grille (K32), les rangées à interrupteur et à chevron (K06), les en-têtes de
/// section (K44), le bouton de sortie (K40). Ce qui vivait sur la fiche s'y range sans rien perdre (loi 11) : le partage
/// de ma batterie et de mon téléphone injoignable, mes contenus, mon activité et ma Légende. « Qui me voit » dit, depuis
/// la loi d'accès, le cercle à partir duquel ma présence se voit (loi 10) ; chaque interrupteur s'applique aussitôt et se
/// synchronise ensuite (`UserPreferencesManager`).
struct ProfileActionsFace: View {
    let user: MeeshyUser?
    let stats: UserStats?
    let accentColor: String
    let canShare: Bool
    let onAction: (ProfileFaceAction) -> Void

    @ObservedObject var prefs: UserPreferencesManager

    @Environment(\.locale) private var locale

    private var theme: ThemeManager { ThemeManager.shared }
    private var accent: Color { Color(hex: accentColor) }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            showSection
            sharingSection
            whoSeesMeSection
            if ProfilePackShortcuts.isShown(viewerId: user?.id, profileUserId: user?.id) {
                ProfileSavedContentRows(accentHex: accentColor, onOpen: { onAction(.door($0)) })
            }
            accountSection
            MeeshyButton(ProfileActionsCopy.logout, systemImage: "rectangle.portrait.and.arrow.right",
                         kind: .danger, width: .fill, isDestructive: true, action: { onAction(.logout) })
        }
    }

    // MARK: - Montrer

    private var showSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.showTitle)
            MeeshyActionGrid(columns: .fixed(4)) {
                if canShare {
                    MeeshyLabeledAction(title: ProfileActionsCopy.share, systemImage: "square.and.arrow.up",
                                        tint: accent, action: { onAction(.share) })
                }
                MeeshyLabeledAction(title: ProfileActionsCopy.seenAs, systemImage: "eye",
                                    tint: accent, hint: VitrineSeenAsCopy.viewedByHint, action: { onAction(.seenAs) })
                MeeshyLabeledAction(title: ProfileActionsCopy.edit, systemImage: "pencil",
                                    tint: accent, action: { onAction(.edit) })
                MeeshyLabeledAction(title: ProfileActionsCopy.legend, systemImage: "trophy",
                                    tint: accent, action: { onAction(.legend) })
            }
        }
    }

    // MARK: - Ce que je partage avec mes proches

    private var sharingSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.sharingTitle)
            BatterySharingSettingsSection(accentColor: accentColor)
            PhoneReachabilitySharingSettingsSection(accentColor: accentColor)
        }
    }

    // MARK: - Qui me voit

    private var whoSeesMeSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.whoSeesMeTitle)
            VStack(spacing: 0) {
                privacyToggle(ProfileActionsCopy.onlineTitle, systemImage: "eye",
                              subtitle: ProfileActionsCopy.visibleFrom(RelationFeature.presenceOnline.minimumLevel),
                              keyPath: \.showOnlineStatus, divider: true)
                privacyToggle(ProfileActionsCopy.lastSeenTitle, systemImage: "clock",
                              subtitle: ProfileActionsCopy.visibleFrom(RelationFeature.presenceDetailed.minimumLevel),
                              keyPath: \.showLastSeen, divider: true)
                privacyToggle(ProfileActionsCopy.notifyReturnTitle, systemImage: "bell",
                              subtitle: nil, keyPath: \.notifyContactsOnReturn, divider: true)
                searchToggle
                privacyToggle(ProfileActionsCopy.friendRequestsTitle, systemImage: "person.badge.plus",
                              subtitle: nil, keyPath: \.allowContactRequests, divider: false)
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }

    private func privacyToggle(_ title: String, systemImage: String, subtitle: String?,
                               keyPath: WritableKeyPath<PrivacyPreferences, Bool>, divider: Bool) -> some View {
        let isOn = prefs.privacy[keyPath: keyPath]
        return MeeshyToggleRow(title, systemImage: systemImage, subtitle: subtitle, accessory: .toggle(isOn: isOn),
                               showsDivider: divider, tint: accent,
                               action: { prefs.updatePrivacy { $0[keyPath: keyPath] = !isOn } })
    }

    /// « Me trouver dans la recherche » dit l'inverse du réglage servi (`hideProfileFromSearch`).
    private var searchToggle: some View {
        let isFindable = !prefs.privacy.hideProfileFromSearch
        return MeeshyToggleRow(ProfileActionsCopy.findableTitle, systemImage: "magnifyingglass",
                               accessory: .toggle(isOn: isFindable), showsDivider: true, tint: accent,
                               action: { prefs.updatePrivacy { $0.hideProfileFromSearch = isFindable } })
    }

    // MARK: - Mon compte

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.accountTitle)
            VStack(spacing: 0) {
                MeeshyToggleRow(ProfileActionsCopy.statsTitle, systemImage: "chart.bar",
                                subtitle: ProfileActionsCopy.statsSubtitle(stats, locale: locale),
                                accessory: .chevron, showsDivider: true, tint: accent, action: { onAction(.stats) })
                MeeshyToggleRow(ProfileActionsCopy.legend, systemImage: "trophy", accessory: .chevron,
                                showsDivider: true, tint: accent, action: { onAction(.legend) })
                MeeshyToggleRow(ProfileActionsCopy.securityTitle, systemImage: "checkmark.shield",
                                subtitle: ProfileActionsCopy.securitySubtitle(user), accessory: .chevron,
                                showsDivider: true, tint: accent, action: { onAction(.security) })
                MeeshyToggleRow(ProfileActionsCopy.settingsTitle, systemImage: "gearshape", accessory: .chevron,
                                tint: accent, action: { onAction(.settings) })
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }
}
