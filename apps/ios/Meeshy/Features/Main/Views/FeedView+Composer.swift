import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La porte du composeur de post de la racine iPad — et le SIGNAL qui l'ouvre.**
///
/// Les deux racines ne montent pas le même flux : `RootView` (iPhone) monte
/// `ThemedFeedOverlay`, `iPadRootView` monte `FeedView`. Chacune possède donc
/// son propre drapeau de composeur, et tant que `ThemedFeedOverlay` fut le seul
/// lecteur de `Router.pendingOpenFeedComposer`, l'accès rapide « Publier un
/// post » levait sur iPad un drapeau que **personne ne lisait** : le bouton se
/// peignait, vibrait sous le doigt, et n'ouvrait rien (2026-09-08).
///
/// La PRÉSENTATION et le RAMASSAGE vivent ensemble parce qu'ils répondent à une
/// seule question — « qui ouvre ce composeur, et sur quel signal ? ». C'est
/// précisément la moitié « sur quel signal » qui manquait, et elle manquait
/// SILENCIEUSEMENT : l'écriture du drapeau, elle, était bien là, et la garde de
/// source qui affirme « chaque accès rapide route vers une porte EXISTANTE »
/// restait verte en ne mesurant qu'elle.
///
/// `initial: true` couvre le cas nominal de l'iPad : la demande est levée
/// pendant que le flux n'est PAS monté (une conversation occupe la colonne).
/// `iPadRootView` referme alors les panneaux, le flux paraît, et c'est à son
/// APPARITION que la demande est ramassée — jamais sur un front qu'il aurait
/// manqué en étant absent.
///
/// Vit hors de `FeedView.swift` : ce fichier est hors budget (1468 lignes) et le
/// cliquet de `FileSizeBudgetGuardTests` refuse tout ajout. L'extraction rend le
/// fichier plus COURT qu'avant — on extrait d'abord, on ajoute ensuite.
struct FeedPostComposerDoor: ViewModifier {
    @Binding var isPresented: Bool
    @ObservedObject var router: Router
    let viewModel: FeedViewModel
    let storyViewModel: StoryViewModel
    let statusViewModel: StatusViewModel
    let conversationListViewModel: ConversationListViewModel

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: $isPresented) {
                DocumentComposerDoor(
                    intent: ComposerIntent(origin: .feedComposer),
                    viewModel: viewModel,
                    storyViewModel: storyViewModel,
                    router: router,
                    conversationListViewModel: conversationListViewModel,
                    statusViewModel: statusViewModel
                )
            }
            .adaptiveOnChange(of: router.pendingOpenFeedComposer, initial: true) { _, _ in
                guard router.consumePendingFeedComposer() else { return }
                isPresented = true
            }
    }
}

extension View {
    func feedPostComposer(
        isPresented: Binding<Bool>,
        router: Router,
        viewModel: FeedViewModel,
        storyViewModel: StoryViewModel,
        statusViewModel: StatusViewModel,
        conversationListViewModel: ConversationListViewModel
    ) -> some View {
        modifier(FeedPostComposerDoor(
            isPresented: isPresented, router: router, viewModel: viewModel,
            storyViewModel: storyViewModel, statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        ))
    }
}
