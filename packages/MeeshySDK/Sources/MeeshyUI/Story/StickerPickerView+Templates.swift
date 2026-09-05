import SwiftUI
import MeeshySDK

// MARK: - Les onglets de GABARITS — amour, heure, lieu (#4579)

extension StickerPickerView {

    /// Le côté d'une vignette. Assez grand pour qu'un cartouche à deux lignes
    /// reste lisible, assez petit pour en montrer trois par rangée sans
    /// défilement horizontal.
    static let previewSide: CGFloat = 104

    // MARK: - Amour et heure

    /// Une grille de gabarits, chacun **rendu par le moteur qui dessinera sur
    /// la scène**. La vignette n'est donc pas une illustration de ce qu'on
    /// obtiendra : c'est ce qu'on obtiendra.
    /// - Parameter enabled: `false` quand la grille MONTRE sans pouvoir POSER —
    ///   l'onglet Texte sans mots tapés. Les vignettes restent visibles (elles
    ///   disent ce que le cadre fera), mais ne vibrent pas sous le doigt pour
    ///   rien (loi 4).
    /// **Une GRILLE, plus un onglet** (#5012). Le `ScrollView` et son plafond de
    /// hauteur sont partis : les familles se parcourent désormais verticalement,
    /// dans UN défilement qui les contient toutes. Imbriquer deux défilements
    /// aurait rendu la grille intérieure inatteignable au doigt sur un écran
    /// court — le geste vertical serait pris par celle du dessus.
    @ViewBuilder
    func templateGrid(family: StickerTemplateFamily, enabled: Bool = true) -> some View {
        let emplacements = slots(for: family)
        Group {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                      spacing: 10) {
                ForEach(StickerTemplateCatalog.templates(family: family)) { gabarit in
                    Button {
                        pose(gabarit, family: family, slots: emplacements)
                        HapticFeedback.medium()
                    } label: {
                        StickerTemplatePreview(template: gabarit,
                                               slots: emplacements,
                                               side: Self.previewSide)
                    }
                    .buttonStyle(.plain)
                    .stickerFavoriteMenu(.template(gabarit), usage: usage)
                    .disabled(!enabled)
                    .opacity(enabled ? 1 : 0.55)
                    // **Le mouvement se DIT aussi ici** (#5000) : la scène
                    // l'annonçait depuis #4825, la palette non — un utilisateur
                    // de VoiceOver ne savait ce qu'il avait posé qu'APRÈS
                    // l'avoir posé.
                    .accessibilityLabel(StoryStickerAccessibility.describing(
                        Self.accessibilityLabel(for: gabarit, slots: emplacements),
                        motion: gabarit.animation))
                }
            }
            // Plus de marge horizontale ici : la feuille est plate depuis le
            // 2026-09-05, et son défilement pose déjà les 20 points.
        }
    }

    // MARK: - Texte

    /// Les mots que l'auteur a tapés, sans les blancs autour ; vides, la grille
    /// montre l'exemple et ne pose rien.
    var typedStickerTextTrimmed: String {
        typedStickerText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// **Un champ EN TÊTE, la grille dessous, et les vignettes se redessinent
    /// à la frappe** (loi 7) : l'auteur voit ses mots dans chaque cadre avant
    /// de choisir. Trois gestes pour le cas nominal — ouvrir, écrire, taper.
    @ViewBuilder
    var textTab: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField(String(localized: "sticker.text.placeholder",
                             defaultValue: "Écrivez vos mots…", bundle: .module),
                      text: $typedStickerText)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .textFieldStyle(.plain)
                .submitLabel(.done)
                .padding(.horizontal, 14)
                .frame(minHeight: 40)
                .background(Capsule().fill(Color.primary.opacity(0.06)))
                .overlay(Capsule().stroke(Color.primary.opacity(0.10), lineWidth: 1))
                .accessibilityLabel(String(localized: "sticker.text.field.a11y",
                                           defaultValue: "Texte de la décoration", bundle: .module))
            templateGrid(family: .text, enabled: !typedStickerTextTrimmed.isEmpty)
        }
        .padding(.top, 6)
    }

    /// **Ce qu'une décoration POSE dépend de sa famille, jamais de sa grille.**
    ///
    /// Les trois familles partagent la même grille de vignettes — c'est ce qui
    /// leur donne un air de famille. Mais un LIEU ne se pose pas en sticker :
    /// lui seul porte des coordonnées et un id de POI que la plateforme LIT
    /// (`/posts/nearby`), et un `StorySticker` les perdrait en silence — la
    /// décoration paraîtrait juste et la donnée serait partie.
    ///
    /// Le partage de la grille avait masqué exactement ça : une seule
    /// destination pour trois familles.
    /// `internal` depuis le 2026-09-05 : les onglets FAVORIS et RÉCENTS posent
    /// les mêmes gabarits depuis un autre fichier d'extension. `private` y
    /// aurait imposé une seconde pose — donc une seconde décision sur la
    /// famille LIEU, le gel de l'heure et l'enregistrement de l'usage, avec la
    /// certitude qu'elles divergeraient au premier ajustement.
    func pose(_ gabarit: StickerTemplate,
                      family: StickerTemplateFamily,
                      slots: [String: String]) {
        guard family == .location else {
            // Sans mots, rien à poser : la grille est désactivée, ceci est la
            // ceinture.
            if family == .text, (slots[StickerSlotFiller.textSlot] ?? "").isEmpty { return }
            usage.noteUse(.template(gabarit))
            onTemplateSelected(gabarit, slots)
            return
        }
        // Sans lieu choisi il n'y a rien à poser — la grille du lieu est
        // d'ailleurs DÉSACTIVÉE tant que `currentPlace` est nil.
        guard let lieu = currentPlace else { return }
        usage.noteUse(.template(gabarit))
        onLocationTemplateSelected(lieu, gabarit)
    }

    /// Les emplacements figés au moment de l'ouverture.
    ///
    /// L'instant vient de `openedAt`, lu UNE fois : recalculer ici ferait
    /// changer les vignettes pendant que l'auteur choisit, et poserait une
    /// heure différente de celle qu'il a vue.
    func slots(for family: StickerTemplateFamily) -> [String: String] {
        switch family {
        case .time:
            // L'heure ET la date : la feuille de calendrier lit la date, les
            // autres l'heure — un seul jeu figé pour toute la famille.
            return StickerSlotFiller.timeSlots(at: openedAt)
                .merging(StickerSlotFiller.dateSlots(at: openedAt)) { heure, _ in heure }
        case .love:  return StickerSlotFiller.dateSlots(at: openedAt)
        case .weather, .joy, .surprise, .mood, .greeting, .reaction, .party, .availability,
             .nature, .cheer, .answer, .food, .sport,
             .travel, .work, .music:
            return [:]
        case .text:
            return [StickerSlotFiller.textSlot: typedStickerTextTrimmed]
        case .location:
            // **Un SPÉCIMEN quand aucun lieu n'est encore connu** (2026-09-05).
            // `[:]` rendait dix cadres vides — le dessinateur mesure sur son
            // texte, donc dix rectangles étroits et identiques, ce qui ne
            // montre AUCUN style. Le spécimen est un nom générique et traduit,
            // jamais un lieu inventé : « Paris » ferait croire à une position
            // trouvée, et la vignette mentirait sur ce que la pose donnera.
            //
            // La grille reste DÉSACTIVÉE tant que ce spécimen est ce qu'elle
            // montre (`enabled: currentPlace != nil`) : on regarde, on ne pose
            // pas — la même règle que la grille de TEXTE avant la frappe.
            guard let lieu = currentPlace else {
                return [StickerSlotFiller.placeNameSlot:
                            String(localized: "sticker.place.specimen.name",
                                   defaultValue: "Votre lieu", bundle: .module),
                        StickerSlotFiller.placeDetailSlot:
                            String(localized: "sticker.place.specimen.detail",
                                   defaultValue: "autour de vous", bundle: .module)]
            }
            return StickerSlotFiller.placeSlots(for: lieu)
        }
    }

    // MARK: - Lieu

    var currentPlace: SharedPlace? {
        guard places.indices.contains(selectedPlaceIndex) else { return places.first }
        return places[selectedPlaceIndex]
    }

    /// **Le chemin nominal tient en UN geste** : le lieu le plus proche est
    /// présélectionné, taper une décoration la pose. Choisir un autre lieu
    /// coûte le second geste — et seulement quand on le veut (dimension 7).
    /// **Les DIX styles se montrent AVANT qu'un lieu soit connu** (directive
    /// porteur 2026-09-05 : « il manque les Localisation, plusieurs styles pour
    /// montrer la localisation ! »).
    ///
    /// ## Le défaut, et pourquoi il ressemblait à une absence de styles
    ///
    /// La grille vivait dans la branche `else` de `places.isEmpty`. Le
    /// catalogue déclare pourtant **dix** pastilles de lieu — pastille, carte
    /// postale, étiquette, timbre, boussole, enseigne, carte pliée, panneau,
    /// étiquette de bagage, globe — et les dix ont leur dessinateur. Toutes
    /// étaient invisibles tant que le GPS n'avait rien rendu : autorisation pas
    /// encore accordée, simulateur sans position, intérieur d'un bâtiment,
    /// aucun POI alentour. Le cas le plus FRÉQUENT, donc, montrait zéro style.
    ///
    /// > Le gate était motivé — « ne pas peindre une grille qu'on ne peut pas
    /// > remplir » — et il retirait la capacité ENTIÈRE au lieu de retirer son
    /// > contenu. Un catalogue complet, dessiné, traduit, et inatteignable :
    /// > vu de l'écran, c'est indiscernable d'un catalogue qui n'existe pas.
    ///
    /// ## Le précédent qui donne la forme juste
    ///
    /// `textTab` fait exactement ce qu'il fallait faire : il montre ses styles
    /// AVANT que l'auteur ait tapé un mot, avec un spécimen dans chaque cadre,
    /// et n'active la pose qu'une fois la donnée présente
    /// (`enabled: !typedStickerTextTrimmed.isEmpty`). L'auteur voit ce qu'il
    /// peut obtenir, puis fournit ce qu'il faut pour l'obtenir — jamais
    /// l'inverse.
    ///
    /// Le LIEU adopte la même grammaire : la grille est toujours peinte, avec
    /// un spécimen quand aucun lieu n'est encore connu, et elle s'active dès
    /// qu'un lieu l'est. La différence tient au geste qui apporte la donnée —
    /// on TAPE un texte, on ATTEND un lieu — et c'est pourquoi l'attente est
    /// dite au-dessus de la grille plutôt qu'à sa place.
    @ViewBuilder
    var placeTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            if places.isEmpty {
                // L'onglet EXISTE (l'app sait chercher) mais n'a rien trouvé :
                // ce n'est pas la même chose qu'une capacité absente, et l'écran
                // doit le dire — SANS retirer les styles, que l'auteur peut
                // parcourir pendant que la position arrive.
                // Deux ATTENTES distinctes, et l'auteur doit savoir laquelle :
                // « le fournisseur n'est pas là » (position coupée pour Meeshy)
                // ne se répare pas au même endroit que « on cherche, rien
                // trouvé ». Une seule phrase pour les deux enverrait la moitié
                // des auteurs dans les mauvais réglages.
                Text(nearbyPlaces == nil
                     ? String(localized: "sticker.place.noPermission",
                              defaultValue: "Active la position pour épingler un lieu",
                              bundle: .module)
                     : String(localized: "sticker.place.empty",
                              defaultValue: "Aucun lieu trouvé autour de vous",
                              bundle: .module))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 4)
            }
            // **Les puces ont déménagé dans l'EN-TÊTE de la section** (directive
            // porteur 2026-09-05). Elles ne sont pas une option de plus : elles
            // disent DE QUEL lieu parlent les dix vignettes du dessous, ce qui
            // est le rôle d'un en-tête. Voir `sectionHeader(accessoire:)`.
            templateGrid(family: .location, enabled: currentPlace != nil)
        }
        .padding(.top, 6)
    }

    var placeChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(places.enumerated()), id: \.offset) { index, lieu in
                    let choisi = index == selectedPlaceIndex
                    Button {
                        withAnimation(.spring(response: 0.22)) { selectedPlaceIndex = index }
                        HapticFeedback.light()
                    } label: {
                        Text(Self.placeChipTitle(lieu))
                            .font(.system(size: 12, weight: choisi ? .semibold : .regular,
                                          design: .rounded))
                            .lineLimit(1)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 32)
                            .background(
                                Capsule().fill(choisi ? Color.primary.opacity(0.10) : Color.clear)
                            )
                            .overlay(
                                Capsule().stroke(Color.primary.opacity(choisi ? 0.18 : 0.08),
                                                 lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(choisi ? [.isSelected] : [])
                }
            }
        }
    }

    static func placeChipTitle(_ lieu: SharedPlace) -> String {
        if let nom = lieu.name, !nom.isEmpty { return nom }
        if let adresse = lieu.address, !adresse.isEmpty { return adresse }
        return String(localized: "story.location.here", defaultValue: "Ici", bundle: .module)
    }

    // MARK: - L'accessibilité

    /// **Construit À PART du texte dessiné.** Une chaîne qui sert l'œil ET
    /// VoiceOver n'en sert qu'un : « 14:32 » se LIT « quatorze heures
    /// trente-deux » mais se DIT mal seul — il lui faut le nom de ce qu'il
    /// décore.
    static func accessibilityLabel(for template: StickerTemplate,
                                   slots: [String: String]) -> String {
        // Une VALEUR (« 14:32 ») comme une PROSE (« Bon anniversaire ») se
        // disent : les deux sont ce que la décoration montre.
        let valeurs = template.slots
            .compactMap { slots[$0.name] }
            .filter { !$0.isEmpty }
        let nom = templateName(template.id)
        guard !valeurs.isEmpty else { return nom }
        return "\(nom) — \(valeurs.joined(separator: ", "))"
    }

    /// Le nom d'un gabarit — celui que son DESSINATEUR déclare, à côté de son
    /// dessin (`StickerTemplateDrawer.name`). Un id inconnu de ce binaire
    /// (publié par une version plus récente) reçoit le libellé générique.
    static func templateName(_ id: String) -> String {
        StickerTemplateRenderer.drawer(for: id)?.name()
            ?? String(localized: "sticker.template.unknown",
                      defaultValue: "Décoration", bundle: .module)
    }
}

// MARK: - La vignette

/// **La vignette dérive de la donnée réelle** (exigence #4110) : elle est
/// produite par `StickerTemplateRenderer`, le moteur qui dessinera sur la
/// scène. Une vignette peinte à part aurait dérivé du rendu au premier
/// ajustement, sans qu'aucun témoin ne rougisse.
struct StickerTemplatePreview: View {
    let template: StickerTemplate
    let slots: [String: String]
    let side: CGFloat

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.primary.opacity(0.05))
            // **Le dessin BOUGE, le cadre ne bouge pas** (#5000) : la pose
            // porte sur ce que la décoration EST, pas sur la case qui la range.
            // Animer le cadre ferait respirer la grille entière.
            Group {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .padding(8)
                } else {
                    // Avant le premier rendu — et si le gabarit n'est pas
                    // dessinable — on montre son repli plutôt qu'un vide.
                    Text(template.fallbackEmoji).font(.system(size: side * 0.34))
                }
            }
            .modifier(StickerMotionPreview(animation: template.animation, side: side))
        }
        .frame(width: side, height: side)
        // La marque durable — celle qui survit à une capture d'écran, à un
        // défilement rapide et à « Réduire les animations », les trois cas où
        // le mouvement ne dit plus rien.
        .overlay(alignment: .bottomTrailing) {
            if template.animation != nil {
                StickerMotionBadge(side: side * 0.11).padding(5)
            }
        }
        // `id:` sur le CONTENU, pas sur le gabarit seul : changer de lieu doit
        // redessiner les trois vignettes de l'onglet.
        .task(id: cacheKey) { image = render() }
    }

    private var cacheKey: String {
        template.id + "|" + slots.sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }.joined(separator: ",")
    }

    @MainActor
    private func render() -> UIImage? {
        StickerTemplateRenderer.image(
            templateID: template.id,
            slots: slots,
            metrics: StickerTemplateMetrics.preview(side: side),
            screenScale: UIScreen.main.scale
        )?.0
    }
}
