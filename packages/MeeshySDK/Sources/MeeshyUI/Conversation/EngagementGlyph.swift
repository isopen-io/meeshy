import SwiftUI

/// Le glyphe d'une action d'engagement, RENFORCÉ quand c'est le lecteur courant
/// qui l'a faite.
///
/// Quand `participated` est vrai, deux choses se produisent :
///  1. le glyphe passe à sa variante PLEINE et prend sa teinte sémantique
///     (rouge pour un like, ambre pour un favori, vert pour un repost) ;
///  2. le symbole de CONTOUR est superposé par-dessus, peint à l'accent du
///     contenu — il retrace exactement le bord du glyphe.
///
/// C'est ce second trait qui rend « je l'ai fait » lisible d'un coup d'œil, sans
/// lire ni compteur ni libellé : la teinte seule ne suffit pas, un cœur rouge
/// pouvant aussi bien signifier « il y a des likes ».
///
/// **Le contour trace le GLYPHE, jamais un cercle autour de lui.** La règle
/// vient du composant d'origine (`ReelFeedCard.actionGlyph`) et elle est
/// intentionnelle : un anneau autour du symbole se lit comme un badge d'état de
/// l'application, pas comme une trace de l'utilisateur. Passer un
/// `outline` de la famille `.circle` la viole — c'est ce que faisait le repost
/// du fil, seul des trois à changer de famille de symbole selon son état.
///
/// Ce composant NE décide de rien : il ne sait ni ce qu'est un like, ni qui est
/// le lecteur. Il reçoit un booléen déjà résolu et des symboles opaques — d'où
/// sa place dans le SDK plutôt que dans l'app (test du grain, `CLAUDE.md`).
/// Il existait auparavant en trois copies inline dans `FeedPostCard` et une
/// `private func` dans `ReelFeedCard` ; c'est cette dispersion qui a laissé le
/// renforcement absent partout ailleurs.
public struct EngagementGlyph: View {
    /// Symbole de CONTOUR — l'état inactif, et le tracé superposé à l'accent.
    public let outline: String
    /// Symbole PLEIN — l'état actif.
    public let filled: String
    /// `true` quand l'action vient du lecteur courant.
    public let participated: Bool
    /// Accent du contenu (hex), celui qui trace le bord.
    public let accentHex: String
    /// Teinte du glyphe plein quand le lecteur a participé.
    public let activeTint: Color
    /// Teinte du glyphe au repos. `.white` sur un média sombre,
    /// `theme.textSecondary` sur un fond de carte.
    public let inactiveTint: Color
    /// `true` quand le glyphe doit être PLEIN même sans participation du
    /// lecteur — le cas du cœur, plein dès qu'il existe des likes, de qui que
    /// ce soit. Le CONTOUR d'accent, lui, ne s'allume jamais pour autant :
    /// c'est lui, et lui seul, qui dit « c'est moi ». Séparer les deux est tout
    /// l'objet de ce paramètre — les confondre ferait soit disparaître le cœur
    /// plein d'un post aimé par d'autres, soit revendiquer un like qui n'est
    /// pas le nôtre.
    public let filledWhenInactive: Bool
    public let size: CGFloat
    /// Ombre portée — nécessaire au-dessus d'une vidéo ou d'une photo, inutile
    /// et salissante sur un fond opaque.
    public let shadowed: Bool

    public init(
        outline: String,
        filled: String,
        participated: Bool,
        accentHex: String,
        activeTint: Color,
        inactiveTint: Color,
        filledWhenInactive: Bool = false,
        size: CGFloat = 17,
        shadowed: Bool = false
    ) {
        self.outline = outline
        self.filled = filled
        self.participated = participated
        self.accentHex = accentHex
        self.activeTint = activeTint
        self.inactiveTint = inactiveTint
        self.filledWhenInactive = filledWhenInactive
        self.size = size
        self.shadowed = shadowed
    }

    /// `true` quand le symbole de contour dessinerait un ANNEAU autour du
    /// glyphe au lieu d'en retracer le bord. Fonction pure : XCTest ne peut pas
    /// introspecter une hiérarchie SwiftUI, seule la DÉCISION est vérifiable.
    public nonisolated static func tracesARingInsteadOfTheGlyph(outline: String) -> Bool {
        outline.hasSuffix(".circle") || outline.hasSuffix(".circle.fill")
    }

    public var body: some View {
        ZStack {
            Image(systemName: (participated || filledWhenInactive) ? filled : outline)
                .font(MeeshyFont.relative(size))
                .foregroundColor(participated ? activeTint : inactiveTint)
            if participated {
                Image(systemName: outline)
                    .font(MeeshyFont.relative(size))
                    .foregroundColor(Color(hex: accentHex))
            }
        }
        .shadow(color: shadowed ? .black.opacity(0.4) : .clear, radius: shadowed ? 2 : 0, y: shadowed ? 1 : 0)
    }
}
