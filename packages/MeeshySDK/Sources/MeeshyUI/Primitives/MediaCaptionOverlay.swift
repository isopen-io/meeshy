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
/// Les deux nombres de la règle, hors du type générique.
///
/// Swift interdit les propriétés stockées statiques dans un type générique —
/// et une règle de produit n'a de toute façon rien à faire dans un paramètre
/// de rendu : elle est la même quel que soit ce qui peint le texte.
/// **La règle de repli d'une légende — PURE, et hors de toute vue.**
///
/// `nonisolated` parce qu'elle ne touche rien de l'interface : sans cette
/// annotation elle hérite de l'isolation `@MainActor` du paquet, et devient
/// inappelable depuis un test synchrone — ce qui est exactement ce qui a cassé
/// la cible de tests du SDK quand elle vivait encore sur le type générique de la
/// vue (2026-08-30).
///
/// Le déplacement dit aussi quelque chose de la conception : une règle portée
/// par un type GÉNÉRIQUE demande à chaque appelant de choisir un paramètre qui
/// n'a aucun rôle dans le calcul. `MediaCaptionOverlay<TextBody>.collapse` ne
/// dépendait pas de `TextBody` ; l'inférence, elle, l'exigeait quand même.
public nonisolated enum MediaCaptionRule {
    /// Le SEUIL qui décide de replier.
    public static let wordThreshold = 30
    /// La TÊTE qu'on montre quand on replie. Toujours ≤ `wordThreshold`.
    public static let wordHead = 15

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
}

public struct MediaCaptionOverlay<TextBody: View>: View {

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
    public static var defaultWordThreshold: Int { MediaCaptionRule.wordThreshold }

    /// Ce qu'on montre quand on replie. Toujours ≤ `defaultWordThreshold`.
    public static var defaultWordHead: Int { MediaCaptionRule.wordHead }

    private let caption: String
    private let isExpanded: Bool
    private let wordThreshold: Int
    private let wordHead: Int
    private let onToggle: () -> Void
    private let render: (String, CGFloat) -> TextBody

    /// **Le retrait horizontal, dit par l'HÔTE** (directive porteur
    /// 2026-09-01).
    ///
    /// Il valait 20 en dur, dans les deux états. Le lecteur de réel monte sa
    /// colonne d'information à 16 : la légende s'y retrouvait indentée de 36 pt
    /// pendant que le nom de l'auteur, juste au-dessus, restait à 16 — deux
    /// alignements pour une même colonne, visibles au premier coup d'œil.
    ///
    /// Le même nombre sert les DEUX états : replier puis déplier ne doit pas
    /// faire sauter le texte latéralement.
    private let horizontalInset: CGFloat

    /// **Ce que les surfaces partagent est la RÈGLE, pas le moteur de texte.**
    ///
    /// Le composant décide de replier, compte les mots, pose l'invite, ancre et
    /// voile ; l'hôte rend la chaîne qu'on lui remet. C'est ce qui permet au
    /// lecteur de réel de garder ses mentions et ses hashtags CLIQUABLES
    /// (`MessageTextRenderer`) tout en obéissant à la même règle de repli que le
    /// lecteur de story — une légende de story et une légende de post n'ont pas
    /// les mêmes entités, mais elles se replient au même endroit (#4484).
    ///
    /// `render` reçoit le texte À AFFICHER — la tête repliée, ou la légende
    /// entière — et la taille de police que l'état commande (14 replié, 15
    /// déplié). La taille reste au composant : c'est une décision de
    /// hiérarchie, pas de contenu.
    public init(caption: String,
                isExpanded: Bool,
                wordThreshold: Int = MediaCaptionOverlay.defaultWordThreshold,
                wordHead: Int = MediaCaptionOverlay.defaultWordHead,
                horizontalInset: CGFloat = 20,
                onToggle: @escaping () -> Void,
                @ViewBuilder render: @escaping (String, CGFloat) -> TextBody) {
        self.caption = caption
        self.isExpanded = isExpanded
        self.wordThreshold = wordThreshold
        self.wordHead = wordHead
        self.horizontalInset = horizontalInset
        self.onToggle = onToggle
        self.render = render
    }

    // MARK: - La règle

    /// Les `words` premiers mots, et si quelque chose suit.
    ///
    private var collapsed: (head: String, isTruncated: Bool) {
        MediaCaptionRule.collapse(caption, threshold: wordThreshold, head: wordHead)
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
            render(collapsed.head, 14)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .legibleOverCanvas()

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
        // **Le retrait AVANT le cadre, jamais après.** Posé après, il élargit
        // une vue qui occupe déjà toute la largeur proposée : le conteneur
        // déborde alors de `2 × inset`, se centre, et le texte sort par la
        // GAUCHE — « …week-ends est très loin » amputé de son premier mot,
        // mesuré au simulateur `Meeshy-iOS26` le 2026-09-01. Le voile masquait
        // le symptôme sans le corriger ; l'ôter l'a rendu visible.
        //
        // > Un `padding` posé sur un `frame(maxWidth: .infinity)` ne creuse pas
        // > la vue, il la fait déborder. L'ordre est la règle, pas un détail de
        // > style.
        .padding(.horizontal, horizontalInset)
        .frame(maxWidth: .infinity, alignment: .leading)
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
                    render(caption, 15)
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
                .padding(.horizontal, horizontalInset)
                .frame(maxWidth: .infinity,
                       minHeight: proxy.size.height,
                       alignment: .bottomLeading)
            }
        }
    }

    // **Repliée, la légende n'a PLUS de voile à elle** (directive porteur
    // 2026-09-01) :
    //
    // > « sans dégradé noir transparent, mais posé correctement sur l'image et
    // > correctement aligné exactement comme sur la card des réels »
    //
    // Elle en portait un — `[.clear, .black.opacity(0.42)]` — posé sur la seule
    // bande du texte. Or les deux hôtes peignent DÉJÀ un voile de bas de page :
    // `ReelsPlayerView` un `[.clear, .clear, .black.opacity(0.6)]` sur toute la
    // page, la story le sien. Le voile de la légende s'y ajoutait, et comme il
    // ne couvrait que le texte, il dessinait une bande sombre AUTOUR de lui —
    // un cartouche qu'aucune autre ligne de la colonne ne porte.
    //
    // Ce qui rend le texte lisible sur l'image est `legibleOverCanvas()` — deux
    // ombres portées, la manière de la carte de réel (`ReelFeedCard`), qui pose
    // sa légende à même la vidéo avec une ombre et rien d'autre.
    //
    // > Un voile POSÉ SUR UN SEUL ÉLÉMENT d'une colonne n'assombrit pas un
    // > fond : il dessine un cartouche. La question n'est pas « le texte est-il
    // > lisible ? » mais « ce qui le rend lisible se voit-il ? ».
    //
    // L'état DÉPLIÉ garde le sien : il couvre l'écran ENTIER, ne cerne donc
    // rien, et c'est lui qui rend un texte long lisible par-dessus une vidéo
    // claire. Il est aussi la cible du toucher qui referme.

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

/// Le rendu par DÉFAUT : du texte simple, blanc, à la taille que l'état
/// commande. C'est ce que rendait le composant avant qu'il s'ouvre à un rendu
/// d'hôte (#4484) — conservé à l'identique pour ses appelants, qui n'ont rien
/// à changer.
public struct MediaCaptionPlainText: View {
    private let text: String
    private let size: CGFloat

    public init(_ text: String, size: CGFloat) {
        self.text = text
        self.size = size
    }

    public var body: some View {
        Text(text)
            .font(MeeshyFont.relative(size, weight: .medium))
            .foregroundColor(.white)
    }
}

public extension MediaCaptionOverlay where TextBody == MediaCaptionPlainText {
    /// La forme historique — texte simple. Les appelants existants
    /// (`StoryViewerView+Canvas`) la gardent sans une ligne de changement.
    init(caption: String,
         isExpanded: Bool,
         wordThreshold: Int = MediaCaptionOverlay.defaultWordThreshold,
         wordHead: Int = MediaCaptionOverlay.defaultWordHead,
         horizontalInset: CGFloat = 20,
         onToggle: @escaping () -> Void) {
        self.init(caption: caption,
                  isExpanded: isExpanded,
                  wordThreshold: wordThreshold,
                  wordHead: wordHead,
                  horizontalInset: horizontalInset,
                  onToggle: onToggle,
                  render: { texte, taille in MediaCaptionPlainText(texte, size: taille) })
    }
}
