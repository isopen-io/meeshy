import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que la face Actions de MA fiche demande à son hôte : la face ne connaît ni le routeur ni les feuilles.
enum ProfileFaceAction: Hashable {
    case share
    case seenAs
    case edit
    case mood
    case stats
    case legend
    case security
    case settings
    case logout
    case door(ProfileDoor)
    case route(Route)
}

/// La face Actions de MA fiche (#18869, planche `Moi-Actions`) : ce que je peux faire.
///
/// Faite du kit : les actions libellées en grille (K32), les rangées à interrupteur et à chevron (K06), les en-têtes de
/// section (K44), le bouton de sortie (K40). Ce qui vivait sur la fiche s'y range sans rien perdre (loi 11) : le partage
/// de ma batterie et de mon téléphone injoignable, mes contenus, mon activité et ma Légende. « Montrer » rejoue Mon QR,
/// Scanner et Sans contact par les présentations de la face Liens (#19469) ; « Ma position » dit son état et mène à la
/// carte de mes proches ; le mode fantôme global me masque à tous, Sang compris. « Qui me voit » dit, depuis la loi
/// d'accès, le cercle à partir duquel ma présence se voit (loi 10) ; chaque interrupteur s'applique aussitôt et se
/// synchronise ensuite (`UserPreferencesManager`).
struct ProfileActionsFace: View {
    let user: MeeshyUser?
    let stats: UserStats?
    let accentColor: String
    let canShare: Bool
    /// Vrai là où le modèle des statuts est servi : « Mon statut » ouvre alors le composer de mood.
    var canSetMood: Bool = false
    /// « Ma Légende » : mon niveau et mon rang en sous-titre, lus dans le cache du jeu par l'hôte (#19630).
    var legend: ProfileLegendSummary? = nil
    let onAction: (ProfileFaceAction) -> Void

    @ObservedObject var prefs: UserPreferencesManager
    @ObservedObject var sharing: SharedLocationSharingCenter = SharedLocationSharingHolder.center()
    @StateObject private var ghost = LocationGhostModel()

    @Environment(\.locale) private var locale
    /// « Carte de mes proches » (#18872) : la carte est une action, ouverte en plein écran.
    @State private var showsNearbyMap = false
    /// Mon QR, Scanner et Sans contact : les présentations de la face Liens, rejouées ici.
    @State private var presented: ProfileLinksPresented?
    @State private var sent: SharedContentWrapper?

    private var theme: ThemeManager { ThemeManager.shared }
    private var accent: Color { Color(hex: accentColor) }
    private var profileLink: ProfileLink? { ProfileLink(username: user?.username) }
    private var recipientCount: Int { sharing.roster.pruned(now: Date()).recipients.count }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
            showSection.meeshyCascade(rank: 1)
            sharingSection.meeshyCascade(rank: 2)
            whoSeesMeSection.meeshyCascade(rank: 3)
            if ProfilePackShortcuts.isShown(viewerId: user?.id, profileUserId: user?.id) {
                ProfileSavedContentRows(stats: stats, accentColor: accentColor, onOpen: { onAction(.door($0)) })
                    .meeshyCascade(rank: 4)
            }
            accountSection.meeshyCascade(rank: 5)
            MeeshyButton(ProfileActionsCopy.logout, systemImage: "rectangle.portrait.and.arrow.right",
                         kind: .danger, width: .fill, isDestructive: true, action: { onAction(.logout) })
                .meeshyCascade(rank: 6)
        }
        .meeshyCascadeFace()
        .fullScreenCover(isPresented: $showsNearbyMap) { NearbyMapScreen() }
        .modifier(ProfileLinksPresentations(
            user: user, link: profileLink, accentColor: accentColor, presented: $presented, sent: $sent,
            onOpen: { onAction(.route($0)) }, onCreated: {}
        ))
    }

    // MARK: - En-tête

    // MARK: - Montrer

    private var showSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.showTitle)
            MeeshyActionGrid(columns: .fixed(4)) {
                if canShare {
                    MeeshyLabeledAction(title: ProfileActionsCopy.share, systemImage: "square.and.arrow.up",
                                        tint: accent, action: { onAction(.share) })
                }
                if profileLink != nil {
                    MeeshyLabeledAction(title: ProfileActionsCopy.myQR, systemImage: "qrcode",
                                        tint: accent, action: { presented = .card(.qr) })
                }
                MeeshyLabeledAction(title: ProfileActionsCopy.scan, systemImage: "qrcode.viewfinder",
                                    tint: accent, action: { presented = .scanner })
                if profileLink != nil {
                    MeeshyLabeledAction(title: ProfileLinksCopy.contactless, systemImage: ProfileGlyph.contactless,
                                        tint: accent, action: { presented = .card(.contactless) })
                }
                MeeshyLabeledAction(title: ProfileActionsCopy.seenAs, systemImage: "eye",
                                    tint: accent, action: { onAction(.seenAs) })
                MeeshyLabeledAction(title: ProfileActionsCopy.edit, systemImage: "pencil",
                                    tint: accent, action: { onAction(.edit) })
                MeeshyLabeledAction(title: ProfileActionsCopy.myMap, systemImage: "map",
                                    tint: accent, action: { showsNearbyMap = true })
                if canSetMood {
                    MeeshyLabeledAction(title: ProfileActionsCopy.mood, systemImage: "face.smiling",
                                        tint: accent, action: { onAction(.mood) })
                }
            }
        }
    }

    // MARK: - Ce que je partage avec mes proches

    private var sharingSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ProfileActionsCopy.sharingTitle)
            VStack(spacing: 0) {
                positionRow
                ProfileNoveltyReader(feature: .ghostMode, accountId: user?.id) { badge in ghostRow(badge: badge) }
            }
            .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
            BatterySharingSettingsSection(accentColor: accentColor)
            PhoneReachabilitySharingSettingsSection(accentColor: accentColor)
            InactivityCheckSettingsSection(accentColor: accentColor)
            PhoneCallSharingSettingsSection(accentColor: accentColor)
            privacyToggle(ProfileActionsCopy.notifyReturnTitle, systemImage: "bell",
                          subtitle: nil, keyPath: \.notifyContactsOnReturn, divider: false)
                .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg), tone: .theme)
        }
    }

    /// « Ma position » : son état en une ligne ; « Partager » tant qu'elle n'est ni partagée ni en pause. La rangée
    /// mène à la carte de mes proches, d'où je la partage.
    private var positionRow: some View {
        let count = recipientCount
        let offersShare = ProfileActionsCopy.positionOffersShare(recipients: count, isGhost: ghost.isGhost)
        return MeeshyToggleRow(ProfileActionsCopy.positionTitle, systemImage: "mappin.and.ellipse",
                               subtitle: ProfileActionsCopy.positionSubtitle(recipients: count, isGhost: ghost.isGhost),
                               accessory: offersShare ? .value(ProfileActionsCopy.positionShare) : .chevron,
                               showsDivider: true, tint: accent, action: { showsNearbyMap = true })
            .accessibilityIdentifier("profile.actions.position")
    }

    /// Le fantôme global : appliqué aussitôt, défait et dit sur un refus. « Nouveau » suit le titre à sa première
    /// apparition pour ce compte.
    private func ghostRow(badge: String?) -> some View {
        MeeshyToggleRow(
            content: MeeshyToggleRowContent(title: BloodLocationCopy.ghostTitle, subtitle: ProfileActionsCopy.ghostSubtitle,
                                            accessory: .toggle(isOn: ghost.isGhost), showsDivider: false, tint: accent,
                                            titleAccessoryLabel: badge),
            action: { toggleGhost() },
            leading: { MeeshyToggleRowSymbol("theatermasks") },
            titleAccessory: { if let badge { ProfileNoveltyTag(text: badge, tint: accent) } },
            trailing: { MeeshyToggleRowNoSlot() }
        )
        .disabled(ghost.isBusy)
        .accessibilityIdentifier("profile.actions.ghost")
    }

    private func toggleGhost() {
        Task {
            let accepted = await ghost.toggle()
            guard !accepted else { return }
            FeedbackToastManager.shared.showError(ProfileActionsCopy.ghostFailed)
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
                MeeshyToggleRow(ProfileActionsCopy.legend, systemImage: "trophy",
                                subtitle: ProfileLegendSummary.subtitle(for: legend), accessory: .chevron,
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
