import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'emplacement du cercle sur la face Actions d'une personne liée, Connaissance comprise (#13940, #14910) : il publie
/// `standing` — lié dès qu'un lien d'au moins Connaissance est servi, avec le niveau d'outil lu — (la fiche range alors la demande de connexion), et ne garde
/// que « Partager ma position » quand « Où il est » ne l'offre pas, puis ce que le cercle commun n'ouvre pas encore, par
/// cercle qui l'ouvrirait (loi 4, « Pas encore ouvert »). Le niveau, monter, descendre et le cran suivant vivent dans
/// « Notre cercle » (`OurCircleSheet`), ouvert par sa rangée de « Sa fiche » (#19433, planche
/// `Autre-Actions`) ; Talkie, « Ensemble » et « Son téléphone » ont leurs sections. Une proposition de cercle reçue de
/// la personne s'y pose en carte, pour y répondre sans quitter la fiche (#19449). Sans lien servi, rien : la fiche garde
/// ce qu'elle montrait avant, et juge ce qui reste fermé au niveau d'outil publié.
struct ProfileCircleSection: View {
    @StateObject private var viewModel: ProfileCircleViewModel
    @ObservedObject private var sharing: SharedLocationSharingCenter
    let displayName: String
    /// Ce que la fiche apprend du cercle : le lien montré et le niveau d'outil qui juge ce qu'elle dit fermé.
    @Binding var standing: ProfileRelationStanding
    /// L'accent de la fiche, qui teinte « Partager ma position » (#19637).
    let tint: Color?

    init(userId: String, displayName: String, standing: Binding<ProfileRelationStanding>, tint: Color? = nil,
         sharing: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        _viewModel = StateObject(wrappedValue: ProfileCircleModels.model(for: userId))
        _sharing = ObservedObject(wrappedValue: sharing)
        self.displayName = displayName
        _standing = standing
        self.tint = tint
    }

    var body: some View {
        VStack(spacing: 0) {
            ProfileCircleProposalCard(viewModel: viewModel, displayName: displayName)
                .padding(.bottom, viewModel.receivedProposal == nil ? 0 : MeeshySpacing.xxl)
            if showsSharedLocation {
                ProfileShareLocationRow(userId: viewModel.userId, displayName: displayName, circle: viewModel.toolGateLevel,
                                        tint: tint, center: sharing)
                    .padding(.bottom, MeeshySpacing.xxl)
            } else {
                Color.clear.frame(height: 0)
            }
            if let level = viewModel.lockedCapabilitiesLevel {
                ProfileLockedCapabilities(level: level, tint: tint)
                    .padding(.bottom, MeeshySpacing.xxl)
            }
        }
        .meeshyMotion(.morph, value: viewModel.shownLevel)
        .task(id: viewModel.userId) { await viewModel.load() }
        .adaptiveOnChange(of: viewModel.standing, initial: true) { _, read in standing = read }
        .adaptiveOnChange(of: viewModel.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            viewModel.notice = nil
        }
    }

    /// Proposée dès Ami, la ligne reste tant qu'un partage court vers la personne : « Arrêter » ne part jamais avant lui.
    /// Quand la personne me partage sa position, « Partager ma position » vit dans « Où il est » (planche Autre-Actions).
    private var showsSharedLocation: Bool {
        !ProfileWhereCard.isShown(for: viewModel.userId)
            && sharing.showsRow(for: viewModel.userId, offered: viewModel.offersSharedLocation)
    }
}

/// « Notre cercle » dans « Sa fiche » (#19433, planche `Autre-Actions`) : une rangée du kit (K06) qui dit le cercle
/// COMMUN et, quand une montée attend, « Demande envoyée · Sang » ; elle ouvre `OurCircleSheet`, où vivent monter,
/// descendre et ce que le cran suivant ajouterait. Rien tant qu'aucun lien d'au moins Connaissance n'est servi.
struct ProfileOurCircleRow: View {
    @StateObject private var viewModel: ProfileCircleViewModel
    let displayName: String
    @State private var showsOurCircle = false

    init(userId: String, displayName: String) {
        _viewModel = StateObject(wrappedValue: ProfileCircleModels.model(for: userId))
        self.displayName = displayName
    }

    var body: some View {
        if let level = viewModel.shownLevel {
            MeeshyToggleRow(
                content: MeeshyToggleRowContent(
                    title: OurCircleCopy.scaleLabel,
                    subtitle: pendingLine,
                    accessory: .value(CircleLevelNames.title(of: level)),
                    showsDivider: true,
                    tint: CircleLevelColor.color(for: level)
                ),
                action: { showsOurCircle = true },
                leading: { MeeshyToggleRowSymbol(VitrineSeenAsCopy.glyph(of: level)) },
                titleAccessory: { MeeshyToggleRowNoSlot() },
                trailing: { MeeshyToggleRowNoSlot() }
            )
            .accessibilityHint(ProfileActionsWording.ourCircleHint(name: displayName))
            .accessibilityIdentifier("profile.actions.ourCircle")
            .sheet(isPresented: $showsOurCircle) {
                OurCircleSheet(viewModel: viewModel, displayName: displayName)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
        }
    }

    private var pendingLine: String? {
        viewModel.pendingLevel.map {
            String(format: String(localized: "circles.pending", defaultValue: "Demande envoyée · %@", bundle: .main), CircleLevelNames.title(of: $0))
        }
    }
}
