#if DEBUG
import SwiftUI
import MeeshySDK

/// DEV-ONLY — éteint une CLASSE de crashs, pas un point.
///
/// Le premier rendu de `ConversationView` sur DEVICE en Debug déborde la pile
/// du main thread (1 Mo iOS) dans le décodeur de métadonnées Swift
/// (`swift_getTypeByMangledName` récursif, EXC_BAD_ACCESS dans la Stack
/// Guard) : quatre crashs distincts au même mécanisme — overlay menu et
/// sous-vues du header (2026-07-24/25), bouton recherche puis keypath de la
/// @Published `messages` via `topActiveMembersList` (2026-07-30). Chaque
/// coupe locale (AnyView, struct nominale) ne fait que déplacer l'explosion
/// vers la résolution de métadonnées suivante du même rendu.
///
/// Ce warm-up rend la vue UNE fois hors écran, tôt après le boot, à pile
/// COURTE : les caches de métadonnées et de keypaths de libswiftCore sont
/// globaux au process, donc le vrai premier rendu (au fond de ~110 frames
/// SwiftUI/NavigationStack) ne résout plus rien de coûteux.
///
/// `#if DEBUG` : en Release l'optimiseur pré-spécialise ces métadonnées à la
/// compilation — le crash n'a jamais été observé sur un build Release ou
/// TestFlight (1258 validé par Apple). Le binaire App Store ne contient pas
/// ce code.
@MainActor
enum ConversationFirstRenderWarmup {
    private static var done = false

    static func run() {
        guard !done else { return }
        done = true
        let epoch = Date(timeIntervalSince1970: 1_700_000_000)
        let conversation = MeeshyConversation(
            id: "metadata-warmup", identifier: "metadata-warmup", type: .direct,
            lastMessageAt: epoch, createdAt: epoch, updatedAt: epoch,
            userState: ConversationUserState(
                isPinned: false, isMuted: false, mentionsOnly: false,
                isArchived: false, customName: nil, reaction: nil,
                tags: [], sectionId: nil, version: 0
            )
        )
        // Instances jetables, comme un Preview : previewMode coupe les
        // branches interactives, et la vue n'étant jamais attachée à une
        // window, ni onAppear ni .task ne se déclenchent — seuls les init
        // (assignations + persistence locale) s'exécutent.
        let host = UIHostingController(
            rootView: ConversationView(conversation: conversation, previewMode: true)
                .environmentObject(StoryViewModel())
                .environmentObject(StatusViewModel())
                .environmentObject(Router())
                .environmentObject(ConversationListViewModel())
        )
        host.view.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        host.view.layoutIfNeeded()
    }
}
#endif
