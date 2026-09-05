import SwiftUI
import MeeshySDK

// MARK: - Les catégories, à la VERTICALE (#5012)

/// > Directive porteur 2026-09-03 : « la liste des stickers et smileys **par
/// > categorie verticalement** ».
///
/// Le ruban horizontal d'onglets obligeait à faire défiler pour SAVOIR ce qui
/// existe : rien ne disait combien de familles restaient à droite, et l'auteur
/// découvrait « Météo » ou « Sport » par hasard. Une liste verticale montre
/// l'inventaire en même temps que le contenu.
///
/// **Un seul défilement.** C'est la contrainte qui a gouverné le remaniement :
/// chaque grille a perdu son `ScrollView` et son plafond de hauteur
/// (`templateGrid`, `emojiGrid`, la bibliothèque), parce qu'une grille bornée au
/// milieu d'une liste vole le geste vertical de celle qui la contient — et
/// devient inatteignable au doigt sur un écran court.
extension StickerPickerView {

    /// **Le contenu servi, gouverné par l'ONGLET choisi** (directive porteur
    /// 2026-09-05).
    ///
    /// Chaque onglet porte des SECTIONS — c'est la seconde moitié de la
    /// directive (« dans chaque tab tout est organisé par section »), et c'est
    /// ce qui conserve l'acquis de #5012 : l'inventaire reste visible, mais
    /// dans un périmètre qu'on a choisi.
    @ViewBuilder
    var tabbedContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
            // **`spacing: MeeshySpacing.xxl`, et plus aucun `pinnedViews`**
            // (directive porteur 2026-09-05, « des sections sans cadre »).
            //
            // Un en-tête ÉPINGLÉ doit être opaque — sinon le contenu défile
            // sous lui et le traverse — donc il portait un `.ultraThinMaterial`,
            // donc un cadre. L'épinglage ÉTAIT la cause du cadre, pas une
            // décoration qu'on lui aurait ajoutée. Le retirer laisse le titre
            // défiler avec sa grille, ce qui est aussi plus juste : un titre
            // qui reste pendant qu'on parcourt une AUTRE famille désigne la
            // mauvaise.
            //
            // Ce qui sépare deux sections est désormais l'ESPACE et la graisse
            // du titre — la même grammaire que la fiche de création audio.
            LazyVStack(alignment: .leading, spacing: MeeshySpacing.xxl) {
                switch selectedTab {
                case .search:    searchTabContent
                case .favorites: usageSections(usage.favorites, vide: .favorites)
                case .recents:   usageSections(usage.recents, vide: .recents)
                case .dynamic:   paletteSections(for: .dynamic)
                case .smileys:   smileySections
                }
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xxxl)
        }
        // **Changer d'onglet REPART du début** — mesuré au simulateur avant
        // les onglets, sur l'interrupteur de nature : sans cela, basculer
        // garde l'offset et dépose l'auteur au milieu d'une liste qu'il n'a
        // jamais parcourue. Un défilement conservé n'a de sens que pour une
        // liste qu'on RETROUVE, jamais pour une qu'on découvre.
        //
        // `.id` sur l'onglet plutôt qu'un `ScrollViewReader` : la liste est
        // paresseuse, sa reconstruction ne coûte que les sections visibles, et
        // un lecteur aurait demandé une ancre par section pour un seul usage.
        .id(selectedTab)
    }

    // MARK: - Recherche

    /// L'onglet RECHERCHE — le champ, puis le catalogue par section.
    ///
    /// Le champ n'est PAS épinglé en en-tête de section : il appartient à
    /// l'onglet, pas à une famille, et le voir défiler avec le contenu dit
    /// qu'il filtre ce qu'on lit plutôt qu'il ne le surplombe.
    @ViewBuilder
    private var searchTabContent: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.secondary)
            TextField(String(localized: "sticker.sheet.search.prompt",
                             defaultValue: "Chercher un sticker…", bundle: .module),
                      text: $searchQuery)
                .font(.system(size: 14))
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !searchQuery.isEmpty {
                Button { searchQuery = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "sticker.sheet.search.clear",
                                           defaultValue: "Effacer la recherche", bundle: .module))
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.primary.opacity(0.06), in: Capsule())

        let familles = StickerSheetTab.sections(of: .search, offered: offeredTabs)
            .filter { StickerPickerView.section($0, matches: searchQuery) }
        if familles.isEmpty {
            emptyState(symbole: "magnifyingglass",
                       texte: String(localized: "sticker.sheet.search.empty",
                                     defaultValue: "Aucune famille ne correspond.",
                                     bundle: .module))
        } else {
            sections(familles)
        }
    }

    /// **Une famille correspond-elle à la requête ?** Règle PURE et statique —
    /// elle s'éprouve sans monter d'écran, ce qu'un filtre écrit dans un `body`
    /// ne permet jamais.
    ///
    /// La comparaison est insensible à la casse ET aux diacritiques : chercher
    /// « fete » doit trouver « Fête », sans quoi le champ punit l'auteur qui
    /// tape vite. Une requête VIDE laisse tout passer — le champ filtre, il ne
    /// sélectionne pas.
    static func section(_ onglet: StickerPaletteTab, matches query: String) -> Bool {
        let requete = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !requete.isEmpty else { return true }
        return tabTitle(onglet).range(of: requete,
                                      options: [.caseInsensitive, .diacriticInsensitive]) != nil
    }

    // MARK: - Favoris et récents

    /// **Les décorations retenues, groupées par SECTION.**
    ///
    /// Deux sections au plus : les GABARITS et les SMILEYS. C'est le seul
    /// groupement qui ait un sens ici — regrouper par famille de catalogue
    /// rendrait des sections d'un élément, et l'onglet perdrait ce pour quoi
    /// il existe : voir d'un coup ce qu'on a sous la main.
    ///
    /// L'ORDRE est celui du magasin — le plus récent, ou le plus récemment
    /// épinglé, en tête — et il n'est pas retrié ici : un raccourci qui
    /// réordonne ce que l'auteur a construit n'est plus un raccourci.
    @ViewBuilder
    private func usageSections(_ entrees: [StickerUsageEntry],
                               vide: StickerSheetTab) -> some View {
        if entrees.isEmpty {
            emptyState(symbole: vide.symbolName, texte: Self.emptyLabel(for: vide))
        } else {
            let gabarits = entrees.compactMap { StickerPickerView.template(for: $0) }
            let smileys = entrees.filter { $0.kind == .emoji }.map(\.value)
            // **Les images de « Mes stickers » se résolvent contre la
            // bibliothèque CHARGÉE**, jamais contre l'entrée seule : celle-ci
            // ne porte qu'un identifiant, et le dessin vit sur le disque. Une
            // entrée dont l'image a été effacée disparaît de la liste sans
            // être purgée — la même tolérance qu'un gabarit retiré du
            // catalogue.
            let miennes = entrees
                .filter { $0.kind == .library }
                .compactMap { entree in libraryItems.first { $0.id == entree.value } }
            if !miennes.isEmpty {
                Section {
                    usageLibraryGrid(miennes)
                } header: {
                    sectionHeader(symbole: "photo.on.rectangle.angled",
                                  titre: String(localized: "story.sticker.library.title",
                                                defaultValue: "Mes stickers", bundle: .module))
                }
            }
            if !gabarits.isEmpty {
                Section {
                    usageTemplateGrid(gabarits)
                } header: {
                    sectionHeader(symbole: StickerPickerView.sheetSymbolName,
                                  titre: String(localized: "sticker.sheet.section.templates",
                                                defaultValue: "Décorations", bundle: .module))
                }
            }
            if !smileys.isEmpty {
                Section {
                    usageEmojiGrid(smileys)
                } header: {
                    sectionHeader(symbole: "face.smiling",
                                  titre: String(localized: "sticker.nature.smiley",
                                                defaultValue: "Smileys", bundle: .module))
                }
            }
        }
    }

    /// **Le gabarit derrière une entrée — `nil` s'il n'existe plus.**
    ///
    /// Un favori est un RENVOI, pas une copie : le catalogue peut retirer un
    /// gabarit d'une version à l'autre, et l'entrée survit alors sans cible.
    /// Elle est simplement ignorée à l'affichage — la purger d'office
    /// effacerait un favori que la version suivante pourrait rendre.
    static func template(for entree: StickerUsageEntry) -> StickerTemplate? {
        guard entree.kind == .template else { return nil }
        return StickerTemplateFamily.allCases
            .flatMap { StickerTemplateCatalog.templates(family: $0) }
            .first { $0.id == entree.value }
    }

    static func emptyLabel(for onglet: StickerSheetTab) -> String {
        switch onglet {
        case .favorites:
            return String(localized: "sticker.sheet.favorites.empty",
                          defaultValue: "Appuie longuement sur une décoration pour l'épingler ici.",
                          bundle: .module)
        default:
            return String(localized: "sticker.sheet.recents.empty",
                          defaultValue: "Ce que tu poses apparaîtra ici.",
                          bundle: .module)
        }
    }

    @ViewBuilder
    private func emptyState(symbole: String, texte: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: symbole)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(.secondary)
            Text(texte)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 24)
        .padding(.vertical, 36)
    }

    @ViewBuilder
    private func usageTemplateGrid(_ gabarits: [StickerTemplate]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                  spacing: 10) {
            ForEach(gabarits) { gabarit in
                Button {
                    pose(gabarit, family: gabarit.family, slots: slots(for: gabarit.family))
                    HapticFeedback.medium()
                } label: {
                    StickerTemplatePreview(template: gabarit,
                                           slots: slots(for: gabarit.family),
                                           side: StickerPickerView.previewSide)
                }
                .buttonStyle(.plain)
                .stickerFavoriteMenu(.template(gabarit), usage: usage)
                .accessibilityLabel(StoryStickerAccessibility.describing(
                    StickerPickerView.accessibilityLabel(for: gabarit,
                                                         slots: slots(for: gabarit.family)),
                    motion: gabarit.animation))
            }
        }
    }

    @ViewBuilder
    private func usageLibraryGrid(_ items: [StoryStickerLibraryItem]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5),
                  spacing: 8) {
            ForEach(items) { item in
                Button {
                    usage.noteUse(.library(item))
                    onLibraryStickerSelected(item)
                    HapticFeedback.medium()
                } label: {
                    LibraryStickerThumbnail(item: item)
                }
                .buttonStyle(.plain)
                .stickerFavoriteMenu(.library(item), usage: usage)
                .accessibilityLabel(String(localized: "story.sticker.library.a11y",
                                           defaultValue: "Autocollant de votre bibliothèque",
                                           bundle: .module))
            }
        }
    }

    @ViewBuilder
    private func usageEmojiGrid(_ emojis: [String]) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
                  spacing: 8) {
            ForEach(emojis, id: \.self) { emoji in
                Button {
                    usage.noteUse(.emoji(emoji))
                    onStickerSelected(emoji)
                    HapticFeedback.medium()
                } label: {
                    Text(emoji).font(.system(size: 30)).frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .stickerFavoriteMenu(.emoji(emoji), usage: usage)
                .accessibilityLabel(String(localized: "story.sticker.a11y",
                                           defaultValue: "Autocollant \(emoji)", bundle: .module))
            }
        }
    }

    // MARK: - Les sections d'un onglet de palette

    /// Les sections d'un onglet DE LA FEUILLE — la liste vient de la règle
    /// pure, jamais d'un littéral écrit ici.
    @ViewBuilder
    private func paletteSections(for onglet: StickerSheetTab) -> some View {
        sections(StickerSheetTab.sections(of: onglet, offered: offeredTabs))
    }

    /// Une section par famille SERVIE, dans l'ordre où la règle les rend.
    @ViewBuilder
    private func sections(_ familles: [StickerPaletteTab]) -> some View {
        ForEach(familles) { onglet in
            Section {
                stickerSectionContent(onglet)
            } header: {
                // **Seule la section LIEU porte un accessoire** — les lieux
                // alentour, qui disent DE QUEL lieu parlent les dix vignettes
                // du dessous. Les autres familles n'ont rien à qualifier : leur
                // contenu ne dépend d'aucune donnée choisie.
                if onglet == .place {
                    sectionHeader(symbole: onglet.symbolName,
                                  titre: StickerPickerView.tabTitle(onglet)) {
                        placeChips
                    }
                } else {
                    sectionHeader(symbole: onglet.symbolName,
                                  titre: StickerPickerView.tabTitle(onglet))
                }
            }
        }
    }

    // MARK: - Smileys

    /// Les huit catégories Unicode, chacune sous son titre.
    @ViewBuilder
    private var smileySections: some View {
        ForEach(StickerCategory.allCases, id: \.self) { categorie in
            Section {
                emojiGrid(categorie)
            } header: {
                sectionHeader(icone: categorie.icon, titre: categorie.title)
            }
        }
    }

    // MARK: - Stickers

    /// **Trois onglets ne sont pas de simples grilles**, et c'est ce qui empêche
    /// de tout traiter par `templateGrid` :
    ///
    /// - `text` porte un CHAMP au-dessus de sa grille, et sa grille ne pose rien
    ///   tant que rien n'est tapé (loi 4) ;
    /// - `place` porte les puces de lieu, et un lieu ne se pose PAS en sticker —
    ///   lui seul a des coordonnées et un id de POI que la plateforme lit ;
    /// - `library` porte le bouton COLLER et son état vide.
    @ViewBuilder
    private func stickerSectionContent(_ onglet: StickerPaletteTab) -> some View {
        switch onglet {
        case .text:    textTab
        case .place:
            // **La permission de position se demande quand l'auteur ARRIVE sur
            // la section**, pas à l'ouverture de la palette.
            //
            // La règle vient du ruban qu'on remplace : charger les lieux dans le
            // `.task` faisait surgir l'alerte système par-dessus la grille
            // d'emoji, avant tout intérêt manifesté — et une permission demandée
            // sans motif visible est une permission refusée, donc un onglet
            // fermé pour de bon.
            //
            // La `LazyVStack` ne construit cette section qu'en arrivant dessus :
            // le geste de défilement DIT l'intérêt, exactement comme le tap sur
            // l'onglet le disait. `places.isEmpty` garde l'idempotence.
            placeTab.onAppear {
                guard let nearbyPlaces, places.isEmpty else { return }
                Task { places = await nearbyPlaces.nearby() }
            }
        case .library: libraryTab
        default:
            if let famille = onglet.templateFamily {
                templateGrid(family: famille)
            }
        }
    }

    // MARK: - L'en-tête d'une section

    /// **Il porte le trait d'en-tête pour VoiceOver.** Sans lui, le rotor des
    /// en-têtes ne rend rien et la liste redevient un mur — c'est la moitié
    /// d'accessibilité qu'un ruban d'onglets donnait gratuitement (chaque onglet
    /// était un bouton nommé) et qu'une liste doit rendre à la main.
    /// - Parameter accessoire: ce que l'en-tête porte SOUS son titre — les
    ///   lieux les plus proches, pour la section LIEU (directive porteur
    ///   2026-09-05 : « avec en en-tête de section les lieux les plus proches
    ///   ou les plus connus de sa position »).
    ///
    ///   Il vit dans l'EN-TÊTE et non au-dessus de la grille parce que c'est
    ///   ce qu'il QUALIFIE : les dix vignettes montrent toutes le même lieu,
    ///   celui que ces puces choisissent. Posé entre le titre et la grille sans
    ///   appartenir à l'un ni à l'autre, il se serait lu comme une onzième
    ///   option.
    @ViewBuilder
    private func sectionHeader<Accessoire: View>(
        icone: String? = nil,
        symbole: String? = nil,
        titre: String,
        @ViewBuilder accessoire: () -> Accessoire = { EmptyView() }
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
        HStack(spacing: 6) {
            if let icone {
                Text(icone).font(.system(size: 13))
            } else if let symbole {
                Image(systemName: symbole)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
            }
            // **Capitales et interlettrage**, comme les titres de section de la
            // fiche audio : sans fond ni filet, c'est la FORME du texte qui
            // doit dire « ceci est un titre ». Un `.secondary` en corps 12
            // ordinaire se serait lu comme une légende de la grille du dessus.
            Text(titre.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .tracking(0.6)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .accessibilityAddTraits(.isHeader)
            accessoire()
        }
        .padding(.bottom, MeeshySpacing.xs)
    }
}

// MARK: - Le nom d'une catégorie d'emoji

public extension StickerCategory {
    /// Le titre d'une section. L'icône seule suffisait à un onglet de 40 pt ;
    /// une section a la largeur d'un nom, et un lecteur d'écran n'a jamais rien
    /// pu faire d'un pictogramme.
    var title: String {
        switch self {
        case .smileys:
            return String(localized: "sticker.category.smileys", defaultValue: "Smileys", bundle: .module)
        case .animals:
            return String(localized: "sticker.category.animals", defaultValue: "Animaux", bundle: .module)
        case .food:
            return String(localized: "sticker.category.food", defaultValue: "Nourriture", bundle: .module)
        case .activities:
            return String(localized: "sticker.category.activities", defaultValue: "Activités", bundle: .module)
        case .travel:
            return String(localized: "sticker.category.travel", defaultValue: "Voyage", bundle: .module)
        case .objects:
            return String(localized: "sticker.category.objects", defaultValue: "Objets", bundle: .module)
        case .symbols:
            return String(localized: "sticker.category.symbols", defaultValue: "Symboles", bundle: .module)
        case .flags:
            return String(localized: "sticker.category.flags", defaultValue: "Drapeaux", bundle: .module)
        }
    }
}
