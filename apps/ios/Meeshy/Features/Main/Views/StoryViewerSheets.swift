import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les feuilles et couvertures que le lecteur de story présente PAR-DESSUS sa
/// propre scène : spectateurs, export vidéo, partage unique, lieu plein écran.
///
/// Un `ViewModifier` plutôt qu'une chaîne dans `body` : la présentation est une
/// responsabilité à part, et c'est elle — pas le lecteur — qui lit les deux
/// objets d'environnement qu'elle exige. Une feuille ouvre sa propre hiérarchie
/// de présentation : les `EnvironmentObject` du `fullScreenCover` parent n'y
/// sont PAS hérités automatiquement, d'où leur lecture ICI, là où les feuilles
/// sont déclarées (évite le crash `EnvironmentObject error` qui frappait au
/// tap du bouton de partage d'une story).
struct StoryViewerSheets: ViewModifier {
    @Environment(\.routerCommands) private var router
    @EnvironmentObject private var statusViewModel: StatusViewModel

    let currentStory: StoryItem?
    let currentGroup: StoryGroup?
    let exportShareViewModel: StoryExportShareViewModel
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    @Binding var readerFullscreenPlace: StoryReaderPlaceWrapper?
    @Binding var selectedProfileUser: ProfileSheetUser?
    let resumeTimer: () -> Void

    // Deferred profile open from the viewers sheet: set when a viewer row is
    // tapped, consumed in the viewers sheet's `onDismiss` so the profile sheet
    // presents cleanly after the viewers sheet closes (avoids stacking two
    // sheets and reaching the Router across the sheet boundary).
    @State private var pendingViewerProfile: ProfileSheetUser?

    func body(content: Content) -> some View {
        content
        .sheet(isPresented: $showViewersSheet, onDismiss: {
            resumeTimer()
            if let pending = pendingViewerProfile {
                pendingViewerProfile = nil
                selectedProfileUser = pending
            }
        }) {
            if let story = currentStory {
                StoryViewersSheet(
                    story: story,
                    accentColor: Color(hex: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex),
                    statusViewModel: statusViewModel,
                    onOpenProfile: { viewer in
                        pendingViewerProfile = ProfileSheetUser(username: viewer.username)
                        showViewersSheet = false
                    }
                )
            }
        }
        .sheet(isPresented: $showExportShareSheet, onDismiss: {
            exportShareViewModel.cancel()
            resumeTimer()
        }) {
            if let story = currentStory {
                StoryExportShareSheet(
                    story: story,
                    viewModel: exportShareViewModel, author: currentGroup.map(StoryExportAuthor.init(group:))
                )
                .presentationDetents([.medium, .large] as Set<PresentationDetent>)
                .presentationDragIndicator(.visible)
            }
        }
        .sheet(item: $sharedContentWrapper, onDismiss: { resumeTimer() }) { wrapper in
            ShareSheetView(
                subject: wrapper.subject,
                actions: ShareSheetHostActions(onOpenConversation: { router.navigateToConversation($0) }),
                onDismiss: { sharedContentWrapper = nil }
            )
            .presentationDetents([.medium, .large] as Set<PresentationDetent>)
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: $readerFullscreenPlace, onDismiss: { resumeTimer() }) { wrapper in
            // Tap d'une pastille de lieu (Layer 6.6) : la story est déjà en
            // pause (`pauseTimer()` au tap), la carte plein écran offre
            // « Ouvrir dans Plans » / « Itinéraire » — même surface que la
            // bulle de message (`LocationFullscreenView`).
            LocationFullscreenView(
                latitude: wrapper.place.latitude,
                longitude: wrapper.place.longitude,
                placeName: wrapper.place.name,
                address: wrapper.place.address,
                accentColor: currentGroup?.avatarColor ?? MeeshyColors.brandPrimaryHex,
                senderName: currentGroup?.username
            )
        }
    }
}
