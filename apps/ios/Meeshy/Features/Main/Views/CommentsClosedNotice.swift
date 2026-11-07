import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce qu'une surface de commentaires sait de leur fermeture** (#16541).
///
/// La charge servie fait foi (`commentsClosed`, relue à chaque `post:updated`
/// ou `story:updated`) ; un envoi refusé par `COMMENTS_DISABLED` ferme la
/// surface tout de suite, sans attendre l'écho — l'auteur a pu fermer pendant
/// qu'on écrivait. Une réouverture servie efface ce refus.
struct CommentsClosureState: Equatable {
    private(set) var served: Bool
    private(set) var refusedLocally = false

    init(served: Bool) {
        self.served = served
    }

    var isClosed: Bool { served || refusedLocally }

    mutating func serve(_ closed: Bool) {
        served = closed
        if !closed { refusedLocally = false }
    }

    /// `true` quand l'erreur EST le refus d'une publication fermée — la
    /// surface se ferme alors, et l'hôte ne montre pas d'erreur générique.
    @discardableResult
    mutating func noteRefusal(_ error: Error) -> Bool {
        guard CommentsClosure.isRefusal(error) else { return false }
        refusedLocally = true
        return true
    }
}

/// **La ligne qui remplace le composeur quand les commentaires sont fermés**
/// (#16541) — discrète, à la place de la barre ; les commentaires existants
/// restent lisibles au-dessus.
struct CommentsClosedNotice: View {
    enum Tone {
        /// Feuille et page détail : texte atténué du thème.
        case sheet
        /// Lecteur de story : posé sur le média.
        case overMedia
    }

    var tone: Tone = .sheet

    static var text: String {
        String(localized: "comments.closed.notice", defaultValue: "Les commentaires sont désactivés", bundle: .main)
    }

    var body: some View {
        Label {
            Text(Self.text)
        } icon: {
            Image(systemName: "bubble.left.and.exclamationmark.bubble.right")
                .accessibilityHidden(true)
        }
        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
        .foregroundStyle(tone == .sheet ? ThemeManager.shared.textMuted : MeeshyColors.mediaChromeSecondary)
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.md)
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("comments.closed.notice")
    }
}

/// **La barre de commentaire, ou la ligne qui dit qu'ils sont fermés** — un
/// seul geste pour la feuille, la page détail et le lecteur de story.
struct CommentsClosedReplacement: ViewModifier {
    let isClosed: Bool
    let tone: CommentsClosedNotice.Tone

    func body(content: Content) -> some View {
        if isClosed {
            if tone == .overMedia {
                CommentsClosedNotice(tone: tone).storyOverlayLegible()
            } else {
                CommentsClosedNotice(tone: tone)
            }
        } else {
            content
        }
    }
}

extension View {
    func replacedWhenCommentsClosed(_ isClosed: Bool, tone: CommentsClosedNotice.Tone = .sheet) -> some View {
        modifier(CommentsClosedReplacement(isClosed: isClosed, tone: tone))
    }
}
