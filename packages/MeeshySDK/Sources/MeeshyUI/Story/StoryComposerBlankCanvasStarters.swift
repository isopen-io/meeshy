import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK

// MARK: - Amorces de page blanche — règles pures
//
// Les règles d'offre restent des `static` de `StoryComposerView` : c'est
// l'adresse que les témoins et les deux compositeurs (atelier, composer unifié)
// connaissent. Elles ne lisent que leurs entrées.

extension StoryComposerView {
    /// Règle PURE de l'offre de capture. Deux conditions, jamais une seule :
    /// l'injection est la CAPACITÉ de répondre (une amorce qui ouvre le vide est
    /// pire que pas d'amorce, même doctrine que le chip « Lieu »), le plafond
    /// média est le droit de poser un objet de plus.
    nonisolated static func offersCameraCapture(hasProvider: Bool, canAddMedia: Bool) -> Bool {
        hasProvider && canAddMedia
    }

    /// Règle PURE de l'offre de collage — jumelle de `offersCameraCapture`.
    /// `hasResolver` est l'injection app-side (`\.storyPaste`) : sans elle,
    /// personne ne sait lire le presse-papier et la capsule n'est pas rendue.
    nonisolated static func offersPasteStarter(hasResolver: Bool, canAddMedia: Bool) -> Bool {
        hasResolver && canAddMedia
    }

    /// Ce que la capsule « Coller » accepte.
    ///
    /// **Cette liste EST la directive produit du 2026-08-23** — « on doit
    /// pouvoir coller des images, des documents dont les stickers, et ça doit
    /// être pris en compte et propagé ». La réduire aux images ne rendrait pas
    /// le collage d'un document impossible : elle rendrait la capsule INERTE
    /// devant lui, et le presse-papier ne dit jamais pourquoi rien ne s'est
    /// passé. `.item` ferme la liste, comme sur la cible de dépôt de la barre de
    /// conversation : ce que le composer ne sait pas peindre est ANNONCÉ
    /// app-side, jamais avalé.
    /// **RESTREINTE au #4378** (directive porteur 2026-08-30) :
    ///
    /// > « que coller n'apparaisse que si on a une image, un texte ou vidéo dans
    /// > le presse-papier »
    ///
    /// `.item` acceptait TOUT : `PasteButton` se croyait donc toujours servi, et
    /// « Coller » s'affichait quel que soit le contenu du presse-papier —
    /// l'affordance sans effet que la loi 4 interdit.
    ///
    /// **Ce n'est pas une annulation de la directive du 2026-08-23**, qui
    /// voulait qu'un document collé soit ANNONCÉ plutôt qu'avalé. Elle est
    /// RESTREINTE : ce qui n'est ni image, ni vidéo, ni son, ni texte n'est plus
    /// proposé du tout — il n'y a donc plus rien à annoncer sur ce chemin. La
    /// succession se consigne ; elle ne s'efface pas.
    ///
    /// Le TEXTE y entre en même temps que `StoryPastedItem.text` : l'accepter
    /// sans savoir le poser aurait rendu la capsule active devant un
    /// presse-papier qu'elle ne sait pas servir — pire que de ne pas l'accepter.
    nonisolated static let pasteStarterContentTypes: [UTType] = [
        .image, .movie, .audio, .plainText, .utf8PlainText
    ]

    /// Durée au-delà de laquelle l'appui devient un appui LONG.
    nonisolated static let blankCanvasLongPressDuration: TimeInterval = 0.45

    /// Distance au-delà de laquelle l'appui long ABANDONNE.
    ///
    /// STRICTEMENT inférieure à `blankCanvasSwipeMinDistance` : c'est toute la
    /// déclaration de priorité entre les deux gestes de la page blanche. Si elle
    /// l'égalait ou la dépassait, un doigt qui commence à glisser resterait
    /// candidat à l'appui long pendant que le swipe démarre — l'un des deux
    /// volerait l'autre, et lequel dépendrait du matériel.
    nonisolated static let blankCanvasLongPressMaxDistance: CGFloat = 12

    /// Distance minimale du swipe-vers-le-bas qui ouvre l'éditeur de texte.
    nonisolated static let blankCanvasSwipeMinDistance: CGFloat = 20

    /// Règle PURE de l'amorce « pellicule ». `hasRecentAsset` ne vaut vrai que
    /// si l'app a pu résoudre une vignette SANS rien demander — c'est-à-dire si
    /// l'accès en lecture était DÉJÀ accordé (`.authorized`/`.limited`) et la
    /// pellicule non vide. Le composer ne prompte donc jamais à l'ouverture ; la
    /// demande d'accès est reportée sur le tap de la capsule générique.
    nonisolated static func galleryStarter(
        hasRecentAsset: Bool,
        hasCameraRollProvider: Bool
    ) -> StoryGalleryStarter {
        guard hasCameraRollProvider else { return .systemPickerCapsule }
        return hasRecentAsset ? .recentAssetThumbnail : .accessRequestCapsule
    }

    /// Règle PURE de l'issue du tap : accès accordé sur ce geste → la dernière
    /// photo entre directement (le geste reste UNIQUE) ; refus ou pellicule vide
    /// → `PhotosPicker` système. Laisser l'amorce sans effet ferait d'un refus
    /// une impasse définitive, et le picker n'exige aucune permission.
    nonisolated static func galleryAccessOutcome(
        resolved asset: StoryRecentCameraRollAsset?
    ) -> StoryGalleryAccessOutcome {
        guard let asset else { return .presentSystemPicker }
        return .insertRecentAsset(asset)
    }
}

// MARK: - Amorces de page blanche (S5)
//
// Remplacent la grille de six tuiles opaques qui prélevait 47 % de la
// hauteur avant même que l'utilisateur ait fait quoi que ce soit. Trois
// éléments seulement, POSÉS DANS LE CANVAS, qui disparaissent au premier
// contenu : un indice « Touchez pour écrire », une capsule « Caméra » et la
// dernière photo de la pellicule (ou, à défaut, une capsule « Galerie »).
// Aucun n'occupe de hauteur réservée : le canvas reste plein écran.

/// Les amorces de la page blanche, extraites de `StoryComposerView` : elle ne
/// reçoit que ce qu'elle lit (valeurs) et ce qu'elle déclenche (closures). Les
/// deux fournisseurs app-side (`\.storyCameraCapture`,
/// `\.storyRecentCameraRollAsset`) sont relus ICI, dans l'environnement.
struct StoryComposerBlankCanvasStarters: View {
    let offersContentStarters: Bool
    let canAddMedia: Bool
    let recentAsset: StoryRecentCameraRollAsset?
    @Binding var fgMediaItem: PhotosPickerItem?
    let onBackgroundTap: () -> Void
    let onStartText: () -> Void
    let onOpenCamera: () -> Void
    let onPasteItems: ([StoryPastedItem]) -> Void
    let onRequestRecentAccess: () -> Void
    let onAddRecentAsset: (StoryRecentCameraRollAsset) -> Void

    @Environment(\.storyCameraCapture) private var storyCameraCapture
    @Environment(\.storyRecentCameraRollAsset) private var storyRecentCameraRollAsset

    var body: some View {
        // Gate STRUCTUREL, comme la top bar et la colonne d'historique de ce même
        // `mainContent` : hors page blanche, la surface n'existe pas. Elle
        // couvre le canvas ENTIER — la neutraliser par `.allowsHitTesting(false)`
        // marchait, mais imposait que plus aucun geste ne soit posé après le
        // drapeau (un modificateur ne s'applique qu'à ce qui le PRÉCÈDE), et les
        // deux gestes ci-dessous l'étaient. Démonter la vue rend l'ordre des
        // modificateurs sans effet sur la question.
        ZStack {
            if offersContentStarters {
                ZStack {
                    // LE FOND, et lui SEUL, porte les trois gestes de la page
                    // blanche. Il est posé DERRIÈRE les capsules, jamais autour
                    // d'elles : un `highPriorityGesture(…, including: .all)`
                    // monté sur un conteneur prime sur les gestes de SES
                    // SOUS-VUES — l'appui long ouvrait donc la caméra depuis les
                    // capsules « Photo », « Caméra » et « Coller » au lieu de
                    // l'action de la capsule touchée. Le masque `including:` est
                    // une déclaration de PRIORITÉ, pas de PORTÉE : seule la
                    // superposition met les contrôles hors d'atteinte du fond,
                    // parce qu'en `ZStack` la couche de dessus reçoit la touche
                    // et les couches du dessous ne la voient jamais.
                    //
                    // `Color.clear` occupe TOUTE la place offerte : c'est ce qui
                    // rend le geste de la directive user disponible depuis
                    // n'importe quel pixel LIBRE de la page blanche. Aucun geste
                    // n'est volé au canvas : sur une slide vierge il n'y a, par
                    // définition, aucun élément à sélectionner, et le tap y route
                    // vers EXACTEMENT la même politique.
                    Color.clear
                        .contentShape(Rectangle())
                        // Dégage le rail de FABs (48 pt + marge + safe area).
                        .padding(.bottom, ComposerControlMetrics.bottomOverlayClearance)
                        .onTapGesture { onBackgroundTap() }
                        .simultaneousGesture(blankCanvasTextSwipe)
                        // C6a — l'appui long ouvre la caméra. Trois DÉCLARATIONS
                        // DE PRIORITÉ, jamais une action posée à côté des autres :
                        //
                        //  1. `highPriorityGesture` et NON `simultaneousGesture`
                        //     — en simultané, l'appui long ET le tap se
                        //     reconnaissent : la caméra s'ouvrirait avec
                        //     l'éditeur de texte derrière (`TapGesture` de
                        //     SwiftUI n'a pas de plafond de durée, un appui long
                        //     se termine toujours par un relâchement) ;
                        //  2. `maximumDistance` STRICTEMENT sous le
                        //     `minimumDistance` du swipe : dès que le doigt
                        //     glisse, l'appui long échoue et le
                        //     swipe-vers-le-bas reste maître de son geste ;
                        //  3. le masque : sans fournisseur de caméra, le geste
                        //     n'est pas seulement inutile, il VOLERAIT le tap au
                        //     profit de rien. `.subviews` le désactive sans
                        //     toucher au tap posé plus haut, qui appartient au
                        //     contenu.
                        .highPriorityGesture(
                            blankCanvasCaptureLongPress,
                            including: offersCameraStarter ? .all : .subviews
                        )
                    blankCanvasStarterContent
                }
                .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: offersContentStarters)
    }

    /// Les CONTRÔLES de la page blanche — l'indice « Touchez pour écrire » et la
    /// rangée de capsules — dans une couche SÉPARÉE du fond gestuel.
    ///
    /// Cette séparation EST la règle de portée : les trois gestes de la page
    /// blanche répondent au fond, jamais aux contrôles qu'ils recouvrent. Tant
    /// que capsules et gestes vivaient sur la MÊME vue, `including: .all` faisait
    /// primer l'appui long sur les gestes des sous-vues, et un appui long sur
    /// « Photo » ouvrait la caméra. Aucun masque `GestureMask` ne corrige cela :
    /// il ordonne des priorités, il ne délimite pas une zone. La superposition,
    /// elle, le fait — en `ZStack`, la couche du dessus reçoit la touche.
    ///
    /// D'où l'absence de tout modificateur de geste ICI : un seul suffirait à
    /// remettre les capsules sous une surface gestuelle, et
    /// `StoryComposerCaptureLongPressTests` le refuse.
    private var blankCanvasStarterContent: some View {
        BlankCanvasStarterSurface {
            blankCanvasTypeHint
            blankCanvasStarterRow
        }
        // Même dégagement que le fond : le rail de FABs reste hors de la couche.
        .padding(.bottom, ComposerControlMetrics.bottomOverlayClearance)
    }

    /// Directive user 2026-07-31 : sur l'état vide, un SWIPE VERS LE BAS range les
    /// amorces ET ouvre directement l'éditeur de texte — même chemin que le tap.
    /// Geste COMPLÉMENTAIRE, jamais unique (D4) : le tap canvas, le tap sur
    /// l'indice et le FAB « Texte » le doublent tous.
    ///
    /// Plus de garde `offersContentStarters` dans la closure : le geste n'existe
    /// que monté avec la surface, et elle ne l'est que sur une page blanche.
    private var blankCanvasTextSwipe: some Gesture {
        DragGesture(minimumDistance: StoryComposerView.blankCanvasSwipeMinDistance)
            .onEnded { value in
                guard value.translation.height > 40,
                      abs(value.translation.height) > abs(value.translation.width)
                else { return }
                onStartText()
            }
    }

    /// L'indice est TAPABLE et route vers la même action que le canvas : un
    /// `Text` SwiftUI reçoit les taps par défaut, et le rendre inerte aurait
    /// créé un trou mort au centre exact de la zone qu'il désigne. Il annonce
    /// donc ce qu'il fait, et le fait.
    private var blankCanvasTypeHint: some View {
        Text(String(localized: "story.composer.start.hint",
                    defaultValue: "Touchez pour écrire", bundle: .module))
            .font(MeeshyFont.relative(15, weight: .semibold))
            .foregroundStyle(.primary.opacity(0.75))
            .padding(.horizontal, MeeshySpacing.lg)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .onTapGesture { onStartText() }
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(localized: "story.composer.start.a11y.text",
                                       defaultValue: "Écrire un texte", bundle: .module))
    }

    /// **« Coller » vit sur sa PROPRE rangée, sous les deux autres** (#4378,
    /// directive porteur 2026-08-30) :
    ///
    /// > « Le bouton coller doit être centré plus bas pour que les autres
    /// > boutons restent au centre ! »
    ///
    /// Les trois capsules partageaient un `HStack`. Mesuré à l'écran : la
    /// troisième débordait du bord droit, et surtout les deux premières s'en
    /// trouvaient poussées HORS du centre — la rangée entière se décalait pour
    /// loger celle qui dépassait.
    ///
    /// Une seconde rangée règle les deux d'un coup : « Caméra » et « Galerie »
    /// retrouvent le centre, et « Coller » y est aussi, sous elles. Le
    /// `VStack` ne se peint pas quand la seconde rangée est vide — la capsule se
    /// retire d'elle-même quand le presse-papier ne porte rien d'acceptable, et
    /// un interstice réservé à une vue absente serait un trou.
    @ViewBuilder
    private var blankCanvasStarterRow: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            blankCanvasCaptureRow
            BlankCanvasPasteStarter(
                canAddMedia: canAddMedia,
                onItems: { onPasteItems($0) }
            )
        }
    }

    @ViewBuilder
    private var blankCanvasCaptureRow: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            if offersCameraStarter {
                blankCanvasStarterCapsule(
                    icon: "camera.fill",
                    title: String(localized: "story.composer.start.camera",
                                  defaultValue: "Caméra", bundle: .module),
                    a11y: String(localized: "story.composer.start.a11y.camera",
                                 defaultValue: "Prendre une photo ou une vidéo", bundle: .module),
                    action: { onOpenCamera() }
                )
            }
            if canAddMedia {
                blankCanvasGalleryStarter
            }
        }
    }

    /// Vrai quand la caméra peut répondre : fournisseur injecté par l'app ET
    /// plafond média non atteint.
    ///
    /// **Lue par les DEUX chemins** — la capsule « Caméra » et l'appui long sur
    /// la page blanche. Deux conditions retapées à deux endroits finissent par
    /// diverger, et le jour où elles divergent, l'appui long ouvre un plein
    /// écran vide (le fournisseur n'est pas là) ou passe le plafond média.
    private var offersCameraStarter: Bool {
        StoryComposerView.offersCameraCapture(hasProvider: storyCameraCapture != nil,
                                              canAddMedia: canAddMedia)
    }

    /// C6a — l'appui long sur la page blanche ouvre la CAMÉRA.
    ///
    /// Geste COMPLÉMENTAIRE, jamais unique (D4) : la capsule « Caméra » de la
    /// même rangée le double, sous EXACTEMENT la même condition
    /// (`offersCameraStarter`), et le rail d'outils la double encore.
    ///
    /// Le point d'arrivée n'est pas neuf : `showCameraCapture` ouvre le cover
    /// app-side, dont le résultat passe par `addCapturedMedia` →
    /// `insertForegroundImage` / `insertForegroundVideo`, extraits en leur temps
    /// POUR un futur point d'entrée caméra. C'est celui-là.
    private var blankCanvasCaptureLongPress: some Gesture {
        LongPressGesture(minimumDuration: StoryComposerView.blankCanvasLongPressDuration,
                         maximumDistance: StoryComposerView.blankCanvasLongPressMaxDistance)
            .onEnded { _ in
                guard offersCameraStarter else { return }
                HapticFeedback.medium()
                onOpenCamera()
            }
    }

    /// Vignette de la DERNIÈRE photo de la pellicule quand l'app l'a injectée
    /// (`\.storyRecentCameraRollAsset`) ET que l'accès en lecture était déjà
    /// accordé : un tap l'insère, sans passer par un picker — c'est l'ancre
    /// « dernière photo accessible en 1 geste ». Le chevron accolé reste la
    /// porte vers la pellicule complète. Sinon on retombe sur la capsule
    /// « Galerie » : la capacité n'est jamais perdue.
    @ViewBuilder
    private var blankCanvasGalleryStarter: some View {
        switch StoryComposerView.galleryStarter(hasRecentAsset: recentAsset != nil,
                                   hasCameraRollProvider: storyRecentCameraRollAsset != nil) {
        case .recentAssetThumbnail:
            blankCanvasRecentAssetStarter
        case .accessRequestCapsule:
            // Le TAP est le geste explicite qui autorise la demande d'accès —
            // jamais l'ouverture du composer.
            blankCanvasStarterCapsule(
                icon: "photo.on.rectangle.angled",
                title: String(localized: "story.composer.start.gallery",
                              defaultValue: "Galerie", bundle: .module),
                a11y: String(localized: "story.composer.start.a11y.gallery",
                             defaultValue: "Choisir dans la galerie", bundle: .module),
                action: { onRequestRecentAccess() }
            )
        case .systemPickerCapsule:
            blankCanvasSystemPickerStarter
        }
    }

    @ViewBuilder
    private var blankCanvasRecentAssetStarter: some View {
        if let asset = recentAsset {
            HStack(spacing: 0) {
                Button {
                    HapticFeedback.light()
                    onAddRecentAsset(asset)
                } label: {
                    Image(uiImage: asset.thumbnail)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
                        .padding(.leading, MeeshySpacing.xsPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "story.composer.start.a11y.recent",
                                           defaultValue: "Utiliser la dernière photo", bundle: .module))
                PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos]), preferredItemEncoding: .current) {
                    // `.forward` et non `.right` : le chevron désigne « la
                    // suite » et doit se retourner en arabe (RTL).
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundStyle(.primary.opacity(0.7))
                        .padding(.horizontal, MeeshySpacing.md)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel(String(localized: "story.composer.start.a11y.gallery",
                                           defaultValue: "Choisir dans la galerie", bundle: .module))
            }
            .frame(minHeight: 44)
            .adaptiveGlass(in: Capsule())
        }
    }

    private var blankCanvasSystemPickerStarter: some View {
        // Le libellé est résolu AVANT le label du `PhotosPicker` : ce
        // closure est traité comme `@Sendable`, et `Bundle.module` y est
        // main-actor-isolé (avertissement de concurrence, futur erreur).
        let galleryTitle = String(localized: "story.composer.start.gallery",
                                  defaultValue: "Galerie", bundle: .module)
        return PhotosPicker(selection: $fgMediaItem, matching: .any(of: [.images, .videos]), preferredItemEncoding: .current) {
            BlankCanvasStarterLabel(icon: "photo.on.rectangle.angled", title: galleryTitle)
        }
        .accessibilityLabel(String(localized: "story.composer.start.a11y.gallery",
                                   defaultValue: "Choisir dans la galerie", bundle: .module))
    }

    private func blankCanvasStarterCapsule(
        icon: String,
        title: String,
        a11y: String,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            BlankCanvasStarterLabel(icon: icon, title: title)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(a11y)
    }
}

// MARK: - Amorces de page blanche : surface d'accueil et libellé partagé

/// Surface d'accueil des amorces de page blanche. Sa seule responsabilité est
/// GÉOMÉTRIQUE : occuper l'intégralité de la place offerte, pour que ce qu'on y
/// centre soit centré sur le canvas entier. Un `VStack` ne s'étire QUE sur son
/// axe majeur — sa largeur vaut celle de son plus large enfant, soit ~200 pt sur
/// les 393 d'un iPhone 16 Pro : le swipe-down de la directive user (2026-07-31)
/// n'aurait répondu que dans une colonne centrale, et le même geste, sur des
/// pixels d'apparence identique, aurait marché ou non selon 80 pt d'écart.
///
/// **Elle ne déclare AUCUN `contentShape`, et c'est la correction du 2026-08-23.**
/// Un rectangle de contact plein cadre posé ici transformait la couche des
/// contrôles en écran opaque aux touches : le fond gestuel monté DERRIÈRE elle
/// n'aurait plus rien reçu, et l'appui long serait resté sur les capsules. La
/// zone de contact est donc déclarée par l'APPELANT, sur la couche qui doit
/// vraiment la porter — le fond.
///
/// Feuille de vue autonome (comme `BlankCanvasStarterLabel`) pour que la
/// propriété géométrique soit prouvée par un RENDU mesuré et non par un
/// `contains` dans un fichier de 1 400 lignes.
struct BlankCanvasStarterSurface<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.mdPlus) {
            Spacer(minLength: 0)
            content
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Libellé partagé des capsules d'amorce (Caméra, Galerie).
///
/// Feuille de vue autonome (pas une méthode de `StoryComposerView`) : elle est
/// montée à l'intérieur du label d'un `PhotosPicker`, contexte que le
/// compilateur traite comme non isolé — une méthode `@MainActor` n'y est pas
/// franchissable. C'est aussi la bonne granularité SwiftUI : entrées primitives,
/// aucune dépendance au graphe du composer.
///
/// D1 — 44 pt de zone de contact dès l'écriture, et typographie RELATIVE
/// (`MeeshyFont.relative`) : ce fichier n'utilisait jusqu'ici que des
/// `.font(.system(size:))` figées, insensibles au Dynamic Type.
struct BlankCanvasStarterLabel: View {
    let icon: String
    let title: String

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(15, weight: .semibold))
            Text(title)
                .font(MeeshyFont.relative(14, weight: .semibold))
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: 44)
        .contentShape(Capsule())
        .adaptiveGlass(in: Capsule())
    }
}

/// C5b — la capsule « Coller » des amorces de page blanche.
///
/// Feuille de vue autonome, comme `BlankCanvasStarterLabel`, et pour la même
/// raison portée à sa conclusion : elle lit `\.storyPaste` ELLE-MÊME. Ses
/// entrées sont primitives (`Bool`, une closure), donc elle ne s'abonne à aucun
/// graphe global — c'est la granularité que « Zero Unnecessary Re-render »
/// demande d'une feuille.
///
/// **`PasteButton` et non un `Button` qui lirait `UIPasteboard.general`.** Deux
/// propriétés qu'un bouton maison n'a pas : le système accorde l'accès au
/// presse-papier SANS la bannière « Coller depuis … » (celle que le chemin
/// `ingestPastedFileURLs` de la barre de conversation doit subir), et le bouton
/// se désactive de lui-même quand le presse-papier ne porte rien d'acceptable —
/// donc jamais d'affordance qui ne ferait rien. Son libellé vient du système :
/// il est déjà traduit dans les sept langues de l'app, sans clé de catalogue.
/// **`public` depuis le #4092** : le rail du composer unifié monte CE bouton.
///
/// Il ne pouvait pas devenir une porte ordinaire du rail — celles-ci sont des
/// `Button` qui rappellent l'hôte, et le privilège décrit ci-dessus se perd dès
/// qu'on le reconstruit à la main. C'est pourquoi le rail a gagné un slot où
/// l'hôte rend la vue ENTIÈRE : la forme du contrôle a dicté la forme du rail,
/// et non l'inverse.
public struct BlankCanvasPasteStarter: View {
    let canAddMedia: Bool
    let onItems: ([StoryPastedItem]) -> Void

    public init(canAddMedia: Bool, onItems: @escaping ([StoryPastedItem]) -> Void) {
        self.canAddMedia = canAddMedia
        self.onItems = onItems
    }

    @Environment(\.storyPaste) private var provider

    public var body: some View {
        if StoryComposerView.offersPasteStarter(hasResolver: provider != nil,
                                                canAddMedia: canAddMedia),
           let resolver = provider {
            PasteButton(supportedContentTypes: StoryComposerView.pasteStarterContentTypes) { providers in
                HapticFeedback.light()
                // Résolution SÉQUENTIELLE app-side, dans une tâche qui HÉRITE de
                // l'isolation MainActor : `NSItemProvider` n'est pas `Sendable`,
                // le confier à une tâche détachée est refusé net par Swift 6.
                // C'est le patron exact de la cible de dépôt de la barre de
                // conversation, pour la même raison.
                Task { onItems(await resolver.items(from: providers)) }
            }
            .labelStyle(.titleAndIcon)
            .buttonBorderShape(.capsule)
            .frame(minHeight: 44)
        }
    }
}
