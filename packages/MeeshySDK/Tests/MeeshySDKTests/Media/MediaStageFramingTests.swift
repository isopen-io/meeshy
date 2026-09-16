import Testing
import CoreGraphics
@testable import MeeshySDK

/// **La loi de cadrage de la LECTURE : les couloirs d'abord, le cadre ensuite.**
///
/// Aucune vue n'est montée — le solveur est pur, donc tout ce qu'il décide
/// s'éprouve ici. Les valeurs attendues sont calculées à la main pour un
/// iPhone 16 Pro (390 × 844) à partir des cotes de la spec
/// (`docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md` § 2.1).
///
/// Zone libre : `844 − 59 − 56 − 80 − 34 − 12 = 603` de haut, `390 − 2×12 = 366`
/// de large. Le rail vaut 80 parce que c'est ce que `FilmstripMetrics` réserve
/// réellement, et l'app lui passe sa constante plutôt que de recopier le nombre.
///
/// Les deux planchers sont ceux que la galerie dérive : 330 de haut (trois fois
/// son overlay), 204 de large (sa colonne d'actions et ses deux gouttières,
/// `12 + 44 + 12`, tenue dans le tiers latéral du cadre — #6692).
@Suite("MediaStageFraming — le plateau de lecture")
struct MediaStageFramingTests {

    // MARK: - Fabriques

    static let viewport = CGSize(width: 390, height: 844)

    static let corridors = MediaStageFraming.Corridors(
        safeTop: 59, top: 56, rail: 80, transport: 0, safeBottom: 34, gutter: 12
    )

    static func input(
        ratio: CGFloat,
        presentation: MediaStageFraming.Presentation,
        viewport: CGSize = MediaStageFramingTests.viewport,
        corridors: MediaStageFraming.Corridors = MediaStageFramingTests.corridors,
        minimumFrameHeight: CGFloat = 330,
        minimumFrameWidth: CGFloat = 204
    ) -> MediaStageFraming.Input {
        MediaStageFraming.Input(
            viewport: viewport,
            mediaRatio: ratio,
            corridors: corridors,
            presentation: presentation,
            cardedCornerRadius: 22,
            minimumFrameHeight: minimumFrameHeight,
            minimumFrameWidth: minimumFrameWidth
        )
    }

    static func close(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.01) -> Bool {
        abs(a - b) < tolerance
    }

    // MARK: - Cadré — le cadre prend ce que les couloirs laissent

    @Test("Une 4:5 est contrainte par la largeur, et remplit son cadre")
    func carded_portrait_isWidthBound() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.8, presentation: .carded))

        #expect(Self.close(r.frame.width, 366), "390 − 2×12")
        #expect(Self.close(r.frame.height, 457.5), "366 / 0,8 — ajustée au ratio, jamais étirée")
        #expect(r.media == r.frame, "sans plancher actif, le média remplit son cadre")
        #expect(r.letterboxes == false, "un média qui remplit son cadre ne laisse aucune bande")
    }

    @Test("Une 9:16 perd de la largeur pour que le rail tienne")
    func carded_tall_isHeightBound() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .carded))

        #expect(Self.close(r.frame.height, 603), "844 − 59 − 56 − 80 − 34 − 12")
        #expect(Self.close(r.frame.width, 339.1875), "603 × 0,5625")
        #expect(r.media == r.frame)
    }

    // MARK: - Le plancher — il ne mord QUE sur un cadre court

    /// **Le témoin du plancher ne peut tomber que sur un cadre COURT.** Sur une
    /// 4:5 ou une 9:16, la règle juste et la règle absente rendent le même
    /// verdict : un témoin écrit là serait vert des deux côtés du diff.
    @Test("Une 16:9 : le cadre s'arrête au plancher, le média non")
    func carded_wideVideo_frameStopsAtFloor_mediaDoesNot() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 16.0 / 9.0, presentation: .carded))

        #expect(Self.close(r.media.height, 205.875), "le MÉDIA garde son ratio : 366 × 9/16")
        #expect(Self.close(r.frame.height, 330), "le CADRE s'arrête au plancher")
        #expect(Self.close(r.frame.width, r.media.width),
                "le plancher de LARGEUR ne mord pas : une 16:9 prend toute la largeur libre")
        #expect(r.letterboxes, "un cadre plus haut que son média laisse deux bandes à habiller")
    }

    @Test("Le plancher est un minimum, jamais un maximum")
    func carded_floorNeverShrinksATallFrame() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .carded))

        #expect(Self.close(r.frame.height, 603))
        #expect(r.letterboxes == false)
    }

    @Test("Un plancher absurde reste borné par la zone libre")
    func carded_floorNeverExceedsTheFreeRegion() {
        let r = MediaStageFraming.resolve(
            Self.input(ratio: 16.0 / 9.0, presentation: .carded, minimumFrameHeight: 5_000)
        )

        #expect(Self.close(r.frame.height, 603), "jamais de cadre qui pousserait le rail hors écran")
    }

    // MARK: - Le plancher de LARGEUR — le jumeau, sur l'autre axe (#6692)

    /// **Ce témoin ne peut tomber que sur un cadre ÉTROIT.** Une 4:5 (366), une
    /// 9:16 (339) et une 16:9 (366) sont toutes plus larges que le plancher : la
    /// règle juste et la règle absente y rendent le même cadre. Il s'écrit donc
    /// sur l'image très haute de la recette (900 × 3 600), dont le cadre ne
    /// gardait qu'environ 128 pt sur l'appareil — trop peu pour l'auteur, sa
    /// date, sa ligne de format et la colonne d'actions qui s'y posent.
    @Test("Une 1:4 : le cadre s'arrête au plancher de largeur, le média non")
    func carded_veryTallImage_frameStopsAtWidthFloor_mediaDoesNot() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.25, presentation: .carded))

        #expect(Self.close(r.media.height, 603), "contrainte par la HAUTEUR libre")
        #expect(Self.close(r.media.width, 150.75), "le MÉDIA garde son ratio : 603 × 0,25 — jamais étiré")
        #expect(Self.close(r.frame.width, 204), "le CADRE s'arrête au plancher de largeur")
        #expect(Self.close(r.frame.height, r.media.height), "ce plancher n'agit que sur la largeur")
        #expect(r.letterboxes, "un cadre plus large que son média laisse deux bandes latérales à habiller")
    }

    /// Vert sans la règle, et c'est dit : ce qu'il attrape est l'écriture
    /// inverse — un `min` à la place du `max`, qui ferait du plancher un PLAFOND
    /// et raboterait chaque cadre plus large que lui.
    @Test("Le plancher de largeur est un minimum, jamais un maximum")
    func carded_widthFloorNeverShrinksAWideFrame() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .carded))

        #expect(Self.close(r.frame.width, 339.1875), "603 × 0,5625 — plus large que le plancher, intacte")
        #expect(r.media == r.frame)
    }

    @Test("Un plancher de largeur absurde reste borné par la zone libre")
    func carded_widthFloorNeverExceedsTheFreeRegion() {
        let r = MediaStageFraming.resolve(
            Self.input(ratio: 0.25, presentation: .carded, minimumFrameWidth: 5_000)
        )

        #expect(Self.close(r.frame.width, 366), "jamais de cadre qui mordrait sur les gouttières")
        #expect(Self.close(r.media.width, 150.75), "et le média n'en grandit pas pour autant")
    }

    /// **En plein cadre, aucun plancher ne mord.** Le cadre EST l'écran ; un
    /// plancher qui s'y appliquerait encore ne pourrait que le pousser dehors.
    @Test("En plein cadre, le plancher de largeur ne change rien")
    func full_ignoresTheWidthFloor() {
        let sans = MediaStageFraming.resolve(
            Self.input(ratio: 0.25, presentation: .full, minimumFrameWidth: 0)
        )
        let avec = MediaStageFraming.resolve(
            Self.input(ratio: 0.25, presentation: .full, minimumFrameWidth: 5_000)
        )

        #expect(sans == avec, "le plancher de largeur ne touche pas un cadre qui a pris l'écran")
        #expect(avec.frame == Self.viewport)
        #expect(Self.close(avec.media.width, 211), "844 × 0,25 — l'image entière, comme à la recette")
    }

    // MARK: - Plein cadre

    @Test("En plein cadre, le cadre EST l'écran et perd son rayon")
    func full_frameTakesTheViewport_andLosesItsRadius() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.8, presentation: .full))

        #expect(r.frame == Self.viewport, "les couloirs ne bornent plus rien")
        #expect(Self.close(r.cornerRadius, 0), "un cadre qui touche les quatre bords n'a pas de coin")
    }

    /// **Le plein cadre FABRIQUE son propre hors-champ.** Une 4:5 remplit son
    /// cadre en cadré (366 × 457,5) et flotte une fois l'écran pris (390 × 487,5
    /// dans 390 × 844). Conditionner le fond au letterbox du seul état cadré,
    /// c'est garantir du noir exactement là où on voulait l'éviter — défaut
    /// trouvé sur la maquette, et c'est ce témoin qui l'attrape.
    @Test("Une 4:5 remplissait sa carte, et ne remplit plus l'écran")
    func full_portrait_letterboxesEvenThoughItFilledItsCard() {
        let carded = MediaStageFraming.resolve(Self.input(ratio: 0.8, presentation: .carded))
        let full = MediaStageFraming.resolve(Self.input(ratio: 0.8, presentation: .full))

        #expect(carded.letterboxes == false, "elle remplissait son cadre…")
        #expect(full.letterboxes, "…et elle ne remplit plus l'écran")
        #expect(Self.close(full.media.width, 390))
        #expect(Self.close(full.media.height, 487.5), "390 / 0,8")
    }

    /// **Même une 9:16 laisse des bandes en plein écran.** L'écran d'un
    /// iPhone 16 Pro est en 0,462 — plus ÉTROIT que le 0,5625 d'une scène. Fit
    /// et non fill : on ne rogne jamais, donc la scène s'arrête à 693 pt de haut
    /// et laisse 75 pt en haut comme en bas.
    @Test("Une 9:16 en plein écran est ajustée, pas rognée")
    func full_tallScene_fitsWithoutCropping() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .full))

        #expect(Self.close(r.media.width, 390), "la largeur de l'écran")
        #expect(Self.close(r.media.height, 693.333, 0.01), "390 / 0,5625")
        #expect(r.media.height < Self.viewport.height,
                "une scène ne remplit PAS un écran plus étroit qu'elle — elle y flotte")
        #expect(r.letterboxes, "donc il y a du hors-champ à habiller, même sur une 9:16")
    }

    // MARK: - Dégénérescences

    @Test("Un viewport nul rend des zéros, sans planter")
    func zeroViewport_returnsZeroes() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0.8, presentation: .carded, viewport: .zero))

        #expect(r.frame == .zero)
        #expect(r.media == .zero)
        #expect(r.letterboxes == false)
    }

    @Test("Un ratio non positif rend des zéros, sans diviser par zéro")
    func nonPositiveRatio_returnsZeroes() {
        let r = MediaStageFraming.resolve(Self.input(ratio: 0, presentation: .carded))

        #expect(r.frame == .zero)
        #expect(r.media == .zero)
    }

    @Test("Des couloirs plus grands que l'écran ne rendent jamais un cadre négatif")
    func corridorsLargerThanTheScreen_neverProduceANegativeFrame() {
        let r = MediaStageFraming.resolve(
            Self.input(ratio: 0.8, presentation: .carded, viewport: CGSize(width: 390, height: 200))
        )

        #expect(r.frame.height >= 0)
        #expect(r.frame.width >= 0)
    }

    /// **Le rail est une ENTRÉE, jamais une constante du solveur.** Si la
    /// pellicule changeait de hauteur, le cadre doit suivre sans qu'on touche
    /// au solveur — c'est ce qui interdit de recopier 80 quelque part.
    @Test("Épaissir le rail rétrécit le cadre d'autant")
    func aThickerRail_shrinksTheFrameByTheSameAmount() {
        let base = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .carded))
        let thicker = MediaStageFraming.resolve(
            Self.input(
                ratio: 0.5625,
                presentation: .carded,
                corridors: MediaStageFraming.Corridors(
                    safeTop: 59, top: 56, rail: 120, transport: 0, safeBottom: 34, gutter: 12
                )
            )
        )

        #expect(Self.close(base.frame.height - thicker.frame.height, 40), "120 − 80")
    }

    // MARK: - La bande de transport (#6162)

    /// **La progression d'une vidéo vit dans le COULOIR, pas sur le cadre.**
    ///
    /// Elle est donc une réserve du plateau comme le rail : elle se prend à la
    /// hauteur AVANT que le cadre ne prenne le reste. Le témoin le mesure sur une
    /// 9:16 — la seule nature contrainte par la hauteur, donc la seule où une
    /// réserve mal comptée se VOIT. Sur une 4:5 (contrainte par la largeur), la
    /// règle juste et la règle absente rendraient le même cadre.
    @Test("La bande de transport rétrécit le cadre de sa propre hauteur")
    func aTransportBand_shrinksTheFrameByItsOwnHeight() {
        let sans = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .carded))
        let avec = MediaStageFraming.resolve(
            Self.input(
                ratio: 0.5625,
                presentation: .carded,
                corridors: MediaStageFraming.Corridors(
                    safeTop: 59, top: 56, rail: 80, transport: 44, safeBottom: 34, gutter: 12
                )
            )
        )

        #expect(Self.close(sans.frame.height - avec.frame.height, 44),
                "la bande prend à la hauteur ce qu'elle occupe, ni plus ni moins")
        #expect(Self.close(avec.frame.height, 559), "603 − 44")
    }

    /// **En plein cadre, la bande ne réserve RIEN.** Les couloirs n'existent plus
    /// — le média a pris l'écran — et une réserve qui survivrait à la bascule
    /// laisserait une bande noire de 44 pt exactement là où l'on vient de tout
    /// rendre au média.
    @Test("En plein cadre, la bande de transport ne prend rien")
    func full_ignoresTheTransportBand() {
        let sans = MediaStageFraming.resolve(Self.input(ratio: 0.5625, presentation: .full))
        let avec = MediaStageFraming.resolve(
            Self.input(
                ratio: 0.5625,
                presentation: .full,
                corridors: MediaStageFraming.Corridors(
                    safeTop: 59, top: 56, rail: 80, transport: 44, safeBottom: 34, gutter: 12
                )
            )
        )

        #expect(sans == avec, "la bande ne change rien à un cadre qui n'a plus de couloirs")
        #expect(avec.frame == Self.viewport)
    }
}

// MARK: - #6806 — ce qu'on cadre décide de ce que le plein cadre remplit

/// **Une SCÈNE prend le viewport ; une pièce jointe reste ajustée.**
///
/// Directive porteur 2026-09-16, sur capture : « il faut pas afficher une
/// troisieme couche en plein plein écran, mais juste agrandir le canvas à sa
/// taille total du viewport ».
///
/// Les nombres ci-dessous sont ceux de la capture, et c'est ce qui rend la
/// suite utile : le doc-comment de `aspectFit` ANNONÇAIT déjà le défaut
/// (« en plein écran, même une scène 9:16 laisse des bandes ») sans qu'aucun
/// témoin ne le refuse. Une conséquence documentée n'est pas une conséquence
/// voulue.
@Suite("MediaStageFraming — le sujet du cadrage (#6806)")
struct MediaStageFramingSubjectTests {

    /// iPhone 16 Pro. Son rapport (0,4613) est plus ÉTROIT que celui d'une
    /// scène (0,5625) : c'est la configuration qui fabrique les bandes.
    static let viewport = CGSize(width: 393, height: 852)
    static let scene: CGFloat = 9.0 / 16.0

    static func input(ratio: CGFloat,
                      presentation: MediaStageFraming.Presentation,
                      subject: MediaStageFraming.Subject) -> MediaStageFraming.Input {
        MediaStageFraming.Input(
            viewport: viewport,
            mediaRatio: ratio,
            corridors: MediaStageFraming.Corridors(
                safeTop: 59, top: 56, rail: 80, transport: 0, safeBottom: 34, gutter: 12
            ),
            presentation: presentation,
            cardedCornerRadius: 22,
            minimumFrameHeight: 330,
            minimumFrameWidth: 204,
            subject: subject
        )
    }

    /// **Et ce que le lot rend : la scène PREND le viewport.** Elle le couvre
    /// en entier, sans être étirée — 479 × 852, donc 43 pt de chaque côté hors
    /// cadre. Le prix est assumé, et il est écrit dans `aspectFill`.
    @Test("en plein cadre, une scène couvre tout le viewport")
    func sceneFillsTheViewport() {
        let résultat = MediaStageFraming.resolve(
            Self.input(ratio: Self.scene, presentation: .full, subject: .scene)
        )
        #expect(résultat.frame == Self.viewport)
        #expect(résultat.media == Self.viewport,
                "la scène PREND le cadre — elle ne le déborde pas")
    }

    /// **Plus de hors-champ ⇒ plus de couche à peindre.** `letterboxes` est ce
    /// que l'hôte interroge pour décider s'il monte le fond : la troisième
    /// couche s'éteint par la LOI, pas par un second interrupteur.
    @Test("une scène qui couvre le viewport n'a plus de hors-champ à habiller")
    func aFilledSceneHasNoLetterbox() {
        let scène = MediaStageFraming.resolve(
            Self.input(ratio: Self.scene, presentation: .full, subject: .scene)
        )
        #expect(scène.letterboxes == false)
    }

    /// **La conversation ne change pas** — « dans les conversation le placement
    /// se passe bien », et ce témoin est ce qui l'empêche de cesser d'être vrai.
    /// Une pièce jointe garde son ajustement ET son hors-champ habillé (#6143).
    @Test("une pièce jointe reste ajustée en plein cadre, avec son hors-champ")
    func contentStaysFitted() {
        let pièce = MediaStageFraming.resolve(
            Self.input(ratio: Self.scene, presentation: .full, subject: .content)
        )
        #expect(pièce.frame == Self.viewport)
        #expect(abs(pièce.media.width - 393) < 0.5)
        #expect(abs(pièce.media.height - 698.7) < 0.5)
        #expect(pièce.letterboxes, "son hors-champ reste habillé")
        // **Les nombres de la capture du porteur**, et c'est ce qui rend ce
        // témoin utile : 76,6 pt de sol au-dessus et au-dessous. Juste pour une
        // pièce jointe — c'est sa finition ; faux pour une scène — c'était la
        // troisième couche.
        #expect(abs((Self.viewport.height - pièce.media.height) / 2 - 76.6) < 0.5)
    }

    /// **Le sujet ne touche PAS l'état cadré**, et c'est la moitié qui protège
    /// la carte : sur le plateau, une scène est une vignette posée parmi
    /// d'autres — la rogner y perdrait ce que l'auteur a composé, sans même le
    /// plein écran pour le rendre.
    @Test("en cadré, le sujet ne change rien")
    func cardedIsIndifferentToTheSubject() {
        let contenu = MediaStageFraming.resolve(
            Self.input(ratio: Self.scene, presentation: .carded, subject: .content)
        )
        let scène = MediaStageFraming.resolve(
            Self.input(ratio: Self.scene, presentation: .carded, subject: .scene)
        )
        #expect(contenu == scène)
    }

    /// Le repère « HAUTE 1:4 » de la recette, dans sa scène : la scène couvre
    /// l'écran, et le média s'y pose ensuite selon la loi du plateau (#6760).
    @Test("une scène très haute couvre aussi le viewport")
    func aTallSceneAlsoFills() {
        let résultat = MediaStageFraming.resolve(
            Self.input(ratio: 1.0 / 4.0, presentation: .full, subject: .scene)
        )
        #expect(résultat.media == Self.viewport)
        #expect(résultat.letterboxes == false)
    }
}
