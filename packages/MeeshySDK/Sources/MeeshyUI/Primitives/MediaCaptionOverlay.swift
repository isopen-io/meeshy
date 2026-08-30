import SwiftUI

// MARK: - Media Caption Overlay

/// **La légende POSÉE SUR un canvas** — story en lecture, réel en plein écran.
///
/// Trois surfaces rendaient cette même chose de trois façons (#4474) : la carte
/// de réel en `lineLimit(2)`, le lecteur de réel en `lineLimit(3)` dépliable
/// vers une zone plafonnée à 240 pt, et le lecteur de story dans une BOÎTE NOIRE
/// opaque, `lineLimit(4)`, **non tactile** (`allowsHitTesting(false)`) — donc
/// indépliable par construction. Aucune ne montrait la même chose.
///
/// ## Ce que le composant tient, et pourquoi
///
/// - **Dix MOTS, pas quatre lignes.** Une troncature par lignes dépend de la
///   largeur de l'écran et de la taille de police choisie par le lecteur : deux
///   appareils ne montrent alors pas la même légende. Le compte de mots est le
///   seul seuil que l'auteur peut prévoir.
/// - **De l'OMBRE, pas une boîte.** Un cartouche opaque masque la composition
///   qu'il commente. L'ombre portée sur le texte plus un voile dégradé au bas de
///   la scène rendent la légende lisible sur n'importe quel fond sans rien
///   cacher — c'est ce que fait le réel, et le porteur a demandé la parité.
/// - **Dépliée, elle prend l'écran, ancrée au coin BAS-GAUCHE.** Une légende
///   longue lue dans une fenêtre de 240 pt se scrolle à l'aveugle ; à l'écran
///   entier elle se lit.
///
/// Atome au sens du « test du grain » : paramètres opaques (un texte, un état
/// déplié, deux closures), aucune décision produit. L'hôte décide s'il monte la
/// couche, ce qu'il met dedans, et ce que déplier fait au reste de son écran —
/// notamment SUSPENDRE la lecture, qui est une décision d'hôte, pas d'atome.
public struct MediaCaptionOverlay: View {

    /// **Le SEUIL et la TÊTE sont deux nombres, pas un** (directive 2026-08-30).
    ///
    /// La règle du porteur est : « on affiche les 15 premiers mots si le texte
    /// fait plus de 30 mots ; sinon on affiche tout, une fois ». Le seuil qui
    /// DÉCIDE de replier (30) et la longueur de ce qu'on montre alors (15) sont
    /// distincts — les confondre, comme le faisait le seuil unique de 10, replie
    /// une légende de douze mots pour n'en cacher que deux : le geste « voir
    /// plus » coûte alors plus cher que le texte qu'il révèle.
    ///
    /// Entre les deux nombres il y a une bande — de 16 à 30 mots — où la légende
    /// sort ENTIÈRE bien qu'elle dépasse la tête. C'est voulu : replier n'a de
    /// sens que si le repli fait gagner de la place.
    public static let defaultWordThreshold = 30

    /// Ce qu'on montre quand on replie. Toujours ≤ `defaultWordThreshold`.
    public static let defaultWordHead = 15

    private let caption: String
    private let isExpanded: Bool
    private let wordThreshold: Int
    private let wordHead: Int
    private let onToggle: () -> Void

    public init(caption: String,
                isExpanded: Bool,
                wordThreshold: Int = MediaCaptionOverlay.defaultWordThreshold,
                wordHead: Int = MediaCaptionOverlay.defaultWordHead,
                onToggle: @escaping () -> Void) {
        self.caption = caption
        self.isExpanded = isExpanded
        self.wordThreshold = wordThreshold
        self.wordHead = wordHead
        self.onToggle = onToggle
    }

    // MARK: - La règle

    /// Les `words` premiers mots, et si quelque chose suit.
    ///
    /// Découpe sur les BLANCS (espaces, sauts de ligne, tabulations) en écartant
    /// les vides : une légende aérée de plusieurs paragraphes compte ses mots
    /// réels, pas ses séparateurs. Un texte sans blanc — japonais, chinois — ne
    /// compte qu'UN mot et sort donc entier : le rogner à un nombre de mots qui
    /// n'existe pas dans sa langue le couperait au hasard.
    public static func collapse(_ text: String,
                                threshold: Int,
                                head: Int) -> (head: String, isTruncated: Bool) {
        let mots = text.split(whereSeparator: \.isWhitespace)
        guard mots.count > threshold, head > 0 else { return (text, false) }
        return (mots.prefix(head).joined(separator: " "), true)
    }

    /// Le cas DÉGÉNÉRÉ où seuil et tête se confondent — replier dès le premier
    /// mot de trop. Conservé pour les appelants qui veulent exactement ça ; la
    /// règle du produit passe par la forme à deux nombres ci-dessus.
    public static func collapse(_ text: String, words: Int) -> (head: String, isTruncated: Bool) {
        collapse(text, threshold: words, head: words)
    }

    private var collapsed: (head: String, isTruncated: Bool) {
        Self.collapse(caption, threshold: wordThreshold, head: wordHead)
    }

    // MARK: - Corps

    /// **Repliée, la couche est INTRINSÈQUE ; dépliée seulement, elle prend
    /// l'écran.**
    ///
    /// La première version imposait `frame(maxWidth:.infinity, maxHeight:.infinity)`
    /// et un `ignoresSafeArea` dans les DEUX états. Mesuré au simulateur : le
    /// conteneur se retrouvait à un `x` NÉGATIF (−24,8), le texte rogné sur le
    /// bord gauche, et le bouton « voir plus » hors d'atteinte — recouvert par
    /// le geste plein écran du lecteur. Le contenu était juste et personne ne
    /// pouvait s'en servir.
    ///
    /// La couche voisine qui marche depuis toujours — la transcription vocale,
    /// dix lignes plus haut dans le même `ZStack` — ne fait rien de tout cela :
    /// elle se laisse dimensionner par son contenu et c'est l'hôte qui la pousse
    /// en bas. On l'imite.
    @ViewBuilder
    public var body: some View {
        if isExpanded {
            expandedCaption
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
                .background(expandedScrim)
        } else {
            collapsedCaption
        }
    }

    /// Repliée : la tête de légende et, si quelque chose suit, l'invite.
    ///
    /// **Rien ici ne prend le doigt sauf le bouton.** Le canvas garde ses gestes
    /// de navigation (story suivante, précédente) sous la légende ; c'est
    /// pourquoi la couche ne pose AUCUN `contentShape` sur son fond. Et le
    /// conteneur ne porte pas d'`allowsHitTesting(false)` : il éteindrait le
    /// bouton avec le reste — le défaut même que ce composant corrige.
    private var collapsedCaption: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(collapsed.head)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(.white)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .legibleOverCanvas()
                .allowsHitTesting(false)

            if collapsed.isTruncated {
                Button(action: onToggle) {
                    Text(Self.seeMoreLabel)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .legibleOverCanvas()
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Self.seeMoreLabel)
                .accessibilityHint(Self.seeMoreHint)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(collapsedScrim)
    }

    /// Dépliée : le texte entier, ancré au coin BAS-GAUCHE, qui défile s'il
    /// dépasse la hauteur disponible.
    ///
    /// Le `minHeight` porté par le contenu est ce qui produit l'ancrage : une
    /// légende courte est poussée au bas de la fenêtre de défilement, une
    /// longue la remplit et défile. Un `Spacer` ne le ferait pas — dans une
    /// `ScrollView` la hauteur est non bornée, et il s'effondre.
    private var expandedCaption: some View {
        GeometryReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(caption)
                        .font(MeeshyFont.relative(15, weight: .medium))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .legibleOverCanvas()

                    Button(action: onToggle) {
                        Text(Self.seeLessLabel)
                            .font(MeeshyFont.relative(13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.9))
                            .legibleOverCanvas()
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Self.seeLessLabel)
                    .accessibilityHint(Self.seeLessHint)
                }
                .frame(maxWidth: .infinity,
                       minHeight: proxy.size.height,
                       alignment: .bottomLeading)
                .padding(.horizontal, 20)
            }
        }
    }

    /// Repliée : un voile qui n'assombrit que la bande du texte, et qui ne
    /// prend JAMAIS le doigt — le canvas garde sa navigation dessous.
    private var collapsedScrim: some View {
        LinearGradient(colors: [.clear, .black.opacity(0.42)],
                       startPoint: .top, endPoint: .bottom)
            .allowsHitTesting(false)
    }

    /// Dépliée : le voile couvre l'écran et REFERME au toucher — c'est le geste
    /// attendu d'un texte plein écran.
    private var expandedScrim: some View {
        LinearGradient(colors: [.black.opacity(0.2), .black.opacity(0.6), .black.opacity(0.82)],
                       startPoint: .top, endPoint: .bottom)
            .contentShape(Rectangle())
            .onTapGesture { onToggle() }
    }

    // MARK: - Libellés

    static var seeMoreLabel: String {
        String(localized: "media.caption.see_more", defaultValue: "voir plus", bundle: .module)
    }

    static var seeLessLabel: String {
        String(localized: "media.caption.see_less", defaultValue: "voir moins", bundle: .module)
    }

    static var seeMoreHint: String {
        String(localized: "media.caption.see_more.hint",
               defaultValue: "Affiche la légende entière", bundle: .module)
    }

    static var seeLessHint: String {
        String(localized: "media.caption.see_less.hint",
               defaultValue: "Replie la légende", bundle: .module)
    }
}

// MARK: - Lisibilité sur un fond quelconque

private extension View {
    /// L'ombre portée qui fait tenir du texte blanc sur une composition claire.
    /// Deux passes : une courte et dense qui détache la lettre, une longue et
    /// douce qui pose le bloc. Une seule ne suffit pas sur un fond blanc.
    func legibleOverCanvas() -> some View {
        self
            .shadow(color: .black.opacity(0.75), radius: 2, x: 0, y: 1)
            .shadow(color: .black.opacity(0.35), radius: 7, x: 0, y: 2)
    }
}
