import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que les trois faces de ma fiche présentent (#18869) : « Voir comme » en plein écran, le partage de mon lien, la
/// Sécurité, le composer de mood (« Mon statut », par la même porte que la pastille d'humeur) et la confirmation de
/// sortie. Un modificateur à part : la fiche garde un `body` court.
struct ProfileFacesPresentations: ViewModifier {
    let user: MeeshyUser?
    let authManager: AuthManager
    @Binding var seenAsShown: Bool
    @Binding var shareShown: Bool
    @Binding var securityShown: Bool
    @Binding var logoutAsked: Bool
    @Binding var moodComposerShown: Bool
    let statusComposer: StatusViewModel?
    let onLogout: () -> Void
    /// Les personnes de mes cercles, une fois servies : « Voir comme » les pose à côté de chaque cercle.
    var circleSummary: ProfileCirclesSummary?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $seenAsShown) {
                if let user {
                    VitrineSeenAsView(user: user, accentColor: user.profileAccentHex, circleSummary: circleSummary)
                        .closesForConversationOpening(.sheet)
                }
            }
            .sheet(isPresented: $shareShown) {
                if let link = ProfileLink(username: user?.username) {
                    ShareSheet(activityItems: [link.url])
                        .presentationDetents([.medium, .large])
                }
            }
            .sheet(isPresented: $moodComposerShown) {
                if let statusComposer {
                    MoodComposerDoor(intent: ComposerIntent(origin: .moodChip), seed: nil, viewModel: statusComposer)
                        .presentationDetents([.medium, .large])
                        .presentationDragIndicator(.visible)
                }
            }
            .sheet(isPresented: $securityShown) {
                SecurityView().environmentObject(authManager).closesForConversationOpening(.sheet)
            }
            .confirmationDialog(ProfileActionsCopy.logoutConfirm, isPresented: $logoutAsked, titleVisibility: .visible) {
                Button(ProfileActionsCopy.logout, role: .destructive) { onLogout() }
            }
    }
}
