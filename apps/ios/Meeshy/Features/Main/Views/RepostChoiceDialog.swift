import SwiftUI

/// **Ce qu'offre le bouton Repost d'une publication** (#15869) : la republier
/// telle quelle, ou la citer.
///
/// Le choix vivait dans la seule rangée d'actions de `FeedPostCard` ; la carte
/// de réel du fil et le rail du lecteur repostaient au premier toucher. Le
/// geste est désormais le même partout, et ses mots n'ont qu'une source.
nonisolated enum RepostChoice: Equatable, Hashable {
    case repost
    case quote

    /// « Citer » sans porte de citation, ou « Repartager » sans écrivain,
    /// serait un contrôle sans effet : il est absent, jamais inerte (#15934 —
    /// les favoris et les hashtags offraient « Repartager » sans action).
    static func offered(canRepost: Bool = true, canQuote: Bool) -> [RepostChoice] {
        (canRepost ? [.repost] : []) + (canQuote ? [.quote] : [])
    }

    static var dialogTitle: String { RepostChoice.repost.title }

    var title: String {
        switch self {
        case .repost: String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main)
        case .quote: String(localized: "feed.post.quote", defaultValue: "Citer", bundle: .main)
        }
    }
}

/// Le choix Repartager / Citer, présenté par le bouton Repost qui le porte.
struct RepostChoiceDialog: ViewModifier {
    @Binding var isPresented: Bool
    let onRepost: (() -> Void)?
    let onQuote: (() -> Void)?

    func body(content: Content) -> some View {
        content.alert(RepostChoice.dialogTitle, isPresented: $isPresented) {
            ForEach(RepostChoice.offered(canRepost: onRepost != nil, canQuote: onQuote != nil), id: \.self) { choice in
                Button(choice.title) { choose(choice) }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        }
    }

    private func choose(_ choice: RepostChoice) {
        switch choice {
        case .repost: onRepost?()
        case .quote: onQuote?()
        }
    }
}
