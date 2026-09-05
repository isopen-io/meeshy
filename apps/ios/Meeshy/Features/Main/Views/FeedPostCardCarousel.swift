import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le carrousel d'une carte de fil — vue `3f` du document composer.**
///
/// > « Une légende par slide, un son pour la publication. La pagination ne
/// > change ni le texte du post ni l'annonce du son : seule la légende suit le
/// > média affiché. »
///
/// Ce que remplace ce fichier : la MOSAÏQUE de `mediaPreview` — deux médias
/// côte à côte, trois en 1+2, quatre en grille, cinq et plus en 2+3 avec un
/// badge `+N`. Elle montrait tout d'un coup, ce que le carrousel perd ; elle ne
/// pouvait en revanche **porter aucune légende par média**, ce qui est
/// précisément la doctrine de `3f`. Cinq vignettes de 80 pt ne laissent la
/// place ni au texte ni à l'attribution, et coller la même légende sous chacune
/// ferait mentir la légende — c'est déjà la règle de `SocialMediaCaption.map`,
/// qui ne fait descendre le texte du porteur sur un média que s'il est SEUL.
///
/// ### L'invariant est STRUCTUREL, pas une précaution
///
/// « La pagination ne change ni le texte du post ni l'annonce du son. » Si
/// l'index de page vivait dans `FeedPostCard`, chaque glissement invaliderait
/// le corps entier de la carte : en-tête, crédit du son, texte, rangée
/// d'actions — et le Prisme relancerait sa résolution de langue à chaque slide.
///
/// L'index vit donc ICI, dans un `struct` aux entrées primitives. La carte ne
/// peut pas l'apprendre : l'invariant produit de `3f` et la règle « Zero
/// Unnecessary Re-render » désignent la même conception, et le témoin vérifie
/// non pas que le texte ne bouge pas, mais que **rien dans la carte ne peut
/// savoir quelle slide est affichée**.
struct FeedPostCardCarousel: View {

    let media: [FeedMedia]
    /// `media.id → légende`, résolue par `SocialMediaCaption.map` — le MÊME
    /// résolveur que la galerie plein écran (vue `3e`). Le carrousel le
    /// consulte, il ne réécrit pas sa règle.
    let captions: [String: String]
    let accentColor: String
    let onOpen: (FeedMedia) -> Void

    @State private var index: Int = 0

    var body: some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                pager
                counter
            }
            // **La hauteur du carrousel se dérive d'un RATIO, jamais d'une
            // mesure.**
            //
            // Deux écritures ont échoué avant celle-ci, et pour la même cause
            // profonde : `TabView` n'a AUCUNE taille intrinsèque, alors que les
            // deux mécanismes essayés supposent que la vue en a une.
            //
            //   1. un `GeometryReader` maison en `.background` + `@State` :
            //      sans le `.frame(maxWidth: .infinity)` qui le précède dans
            //      l'original, la largeur redevenait la dimension LIBRE et
            //      poursuivait la hauteur qu'elle venait de fixer. L'app
            //      quittait en silence à l'ouverture du fil ;
            //   2. `fittedMediaHeight`, le modificateur éprouvé : correct, mais
            //      il ne pose sa hauteur qu'à la passe SUIVANTE, une fois la
            //      largeur mesurée. À la première, `height: nil` — et le ZStack
            //      prend alors la hauteur de son plus grand enfant à taille
            //      intrinsèque, c'est-à-dire le COMPTEUR. D'où une bande de
            //      quarante points au lieu d'un média (constaté à l'écran).
            //
            // `.aspectRatio(_:contentMode: .fit)` n'a besoin de rien mesurer :
            // la largeur est proposée par la carte, la hauteur en découle, dès
            // la PREMIÈRE passe. Le ratio vient de `FeedCarouselLayout`, qui
            // dérive ses bornes de `postCardMediaHeight` — la règle du média
            // unique reste le site unique, et le carrousel en est une lecture.
            //
            // > Un conteneur SANS taille intrinsèque ne se dimensionne pas par
            // > la mesure de ce qu'il contient : il faut lui DONNER sa forme.
            .aspectRatio(FeedCarouselLayout.aspectRatio(for: media), contentMode: .fit)
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 16))

            pageDots
        }
    }

    // MARK: - Le pager

    private var pager: some View {
        TabView(selection: $index) {
            ForEach(Array(media.enumerated()), id: \.element.id) { offset, item in
                slide(item, at: offset)
                    .tag(offset)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
    }

    @ViewBuilder
    private func slide(_ item: FeedMedia, at offset: Int) -> some View {
        ZStack(alignment: .bottomLeading) {
            FeedMediaTile(media: item)

            // La légende de CE média, et d'aucun autre. Le dégradé n'existe que
            // sous elle : sans légende, rien ne s'assombrit — un voile permanent
            // ferait payer à toutes les slides le coût de celles qui parlent.
            // La légende de CE média, et d'aucun autre — même couche, même
            // troncature (vingt mots) que la tuile d'un média seul et que la
            // carte de scène. Elle coupait à trois LIGNES, une longueur qui
            // dépend de la largeur et du corps de texte ; le nombre de MOTS
            // n'en dépend d'aucun.
            FeedCaptionOverlay(caption: captions[item.id])

            arrows(at: offset)
        }
        .contentShape(Rectangle())
        .onTapGesture { onOpen(item) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(slideAccessibilityLabel(item, at: offset))
        .accessibilityHint(String(localized: "feed.media.viewFullscreen",
                                  defaultValue: "Toucher pour agrandir", bundle: .main))
        .accessibilityAddTraits(.isButton)
    }

    private func slideAccessibilityLabel(_ item: FeedMedia, at offset: Int) -> String {
        let position = String(
            format: String(localized: "feed.carousel.a11y.position",
                           defaultValue: "Média %1$d sur %2$d", bundle: .main),
            offset + 1, media.count)
        guard let caption = captions[item.id], !caption.isEmpty else { return position }
        return "\(position). \(caption)"
    }

    // MARK: - Les affordances

    /// Les flèches ne sont montées QUE là où elles ont un effet : aucune flèche
    /// « précédent » sur la première slide, aucune « suivant » sur la dernière.
    /// Une flèche grisée occuperait la même surface pour ne rien faire — loi 4.
    ///
    /// `backward`/`forward`, JAMAIS `left`/`right` : ces derniers nomment un
    /// côté PHYSIQUE et ne se retournent pas en arabe, où « suivant » est à
    /// gauche. Le `HStack` se retourne, lui, avec la direction de lecture — les
    /// deux vont donc dans le même sens sans qu'on ait à le calculer.
    @ViewBuilder
    private func arrows(at offset: Int) -> some View {
        HStack {
            if offset > 0 {
                arrow(systemName: "chevron.backward",
                      label: String(localized: "feed.carousel.previous",
                                    defaultValue: "Média précédent", bundle: .main)) {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) { index = offset - 1 }
                }
            }
            Spacer()
            if offset < media.count - 1 {
                arrow(systemName: "chevron.forward",
                      label: String(localized: "feed.carousel.next",
                                    defaultValue: "Média suivant", bundle: .main)) {
                    withAnimation(.spring(response: 0.32, dampingFraction: 0.85)) { index = offset + 1 }
                }
            }
        }
        .padding(.horizontal, 10)
        .frame(maxHeight: .infinity, alignment: .center)
    }

    private func arrow(systemName: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            // Glyphe dans un cercle de dimension FIXE 34 pt : il déborderait
            // s'il scalait (doctrine 86i). La cible tactile reste à 44.
            Image(systemName: systemName)
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 34, height: 34)
                .background(Circle().fill(.black.opacity(0.45)))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private var counter: some View {
        Text("\(index + 1) / \(media.count)")
            .font(MeeshyFont.relative(12, weight: .bold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(.black.opacity(0.5)))
            .padding(10)
            .contentTransition(.numericText())
            .animation(.spring(response: 0.3), value: index)
            .accessibilityHidden(true)
    }

    /// Les pastilles vivent SOUS le média, sur le fond de la carte — comme la
    /// cible. Posées à l'intérieur, elles se disputeraient le bas avec la
    /// légende, qui est le contenu que `3f` met en avant.
    private var pageDots: some View {
        HStack(spacing: 6) {
            ForEach(media.indices, id: \.self) { position in
                Capsule()
                    .fill(position == index
                          ? Color(hex: accentColor)
                          : Color(hex: accentColor).opacity(0.28))
                    .frame(width: position == index ? 18 : 6, height: 6)
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: index)
            }
        }
        .accessibilityHidden(true)
    }
}

// MARK: - La forme du carrousel

/// La forme d'un carrousel — largeur / hauteur — une fois pour toutes ses
/// slides.
///
/// **Une hauteur par slide ferait sauter la carte à chaque glissement** : le
/// texte et les actions sous le média se déplaceraient PENDANT le geste, ce que
/// la dimension 4 (fluidité) interdit. La forme est donc figée pour le lot, et
/// c'est la tête de lot qui la fixe — l'auteur a choisi l'ordre, et un post à un
/// média garde ainsi exactement le cadrage qu'il aurait seul.
///
/// Les bornes ne sont pas réécrites ici : la fonction INTERROGE
/// `postCardMediaHeight` sur une largeur de sonde et en déduit le ratio. Le
/// plancher, le plafond et le repli « dimensions absentes » restent donc
/// définis à UN seul endroit — celui qui sert déjà le média unique. Une
/// constante recopiée aurait dérivé au premier ajustement, et personne n'aurait
/// vu que deux surfaces voisines cadraient différemment.
/// `nonisolated` : une règle PURE n'a aucune raison d'être isolée au fil
/// principal, et l'y laisser la rendrait inappelable depuis un test synchrone —
/// la cible app compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc
/// l'isolation est le DÉFAUT, pas un choix qu'on aurait fait.
nonisolated enum FeedCarouselLayout {
    /// Largeur pour laquelle on interroge la règle. Sa valeur n'a aucune
    /// importance — seul le RAPPORT qu'elle produit est utilisé.
    private static let probeWidth: CGFloat = 1_000

    static func aspectRatio(for media: [FeedMedia]) -> CGFloat {
        let lead = media.first
        let height = postCardMediaHeight(mediaWidth: lead?.width,
                                         mediaHeight: lead?.height,
                                         cardWidth: probeWidth)
        guard height > 0 else { return 1 }
        return probeWidth / height
    }
}

// MARK: - La vignette d'un média

/// Le visuel d'UN média de carte de fil : l'image (ou son dégradé de repli),
/// surmontée du glyphe de lecture pour une vidéo, de l'onde pour un audio.
///
/// Extrait de `FeedPostCard.galleryImageView` (#4096) pour que le carrousel et
/// l'aperçu d'une republication rendent le même visuel sans le redécrire. La
/// méthode d'origine subsiste comme mince délégation : ses appelants ne
/// changent pas.
struct FeedMediaTile: View {
    let media: FeedMedia

    var body: some View {
        ZStack {
            let thumbUrl = media.thumbnailUrl ?? media.url ?? ""
            if !thumbUrl.isEmpty || media.thumbHash != nil {
                ProgressiveCachedImage(
                    thumbHash: media.thumbHash,
                    thumbnailUrl: media.thumbnailUrl,
                    fullUrl: media.url,
                    autoLoad: true
                ) {
                    Color(hex: media.thumbnailColor)
                        .shimmer()
                }
                .aspectRatio(contentMode: .fill)
                .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                .clipped()
            } else {
                LinearGradient(
                    colors: [Color(hex: media.thumbnailColor), Color(hex: media.thumbnailColor).opacity(0.6)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }

            // Surcouches DÉCORATIVES : la cellule parente porte le libellé
            // VoiceOver, et les dupliquer ferait lire deux fois le même média.
            if media.type == .video {
                VStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .fill(.ultraThinMaterial)
                            .frame(width: 36, height: 36)
                        Circle()
                            .fill(Color.white.opacity(0.85))
                            .frame(width: 30, height: 30)
                        Image(systemName: "play.fill")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.black.opacity(0.7))
                            .offset(x: 1)
                    }
                    if let duration = media.durationFormatted {
                        durationPill(duration)
                    }
                }
                .accessibilityHidden(true)
            } else if media.type == .audio {
                VStack(spacing: 4) {
                    Image(systemName: "waveform")
                        .font(MeeshyFont.relative(20))
                        .foregroundColor(.white)
                    if let duration = media.durationFormatted {
                        durationPill(duration)
                    }
                }
                .accessibilityHidden(true)
            }
        }
        .clipped()
    }

    private func durationPill(_ duration: String) -> some View {
        Text(duration)
            .font(MeeshyFont.relative(10, weight: .semibold, design: .monospaced))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(Color.black.opacity(0.6)))
    }
}
