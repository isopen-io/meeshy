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
    @ViewBuilder
    func templateTab(family: StickerTemplateFamily, enabled: Bool = true) -> some View {
        let emplacements = slots(for: family)
        ScrollView {
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
                    .disabled(!enabled)
                    .opacity(enabled ? 1 : 0.55)
                    .accessibilityLabel(Self.accessibilityLabel(for: gabarit, slots: emplacements))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
        }
        .frame(maxHeight: 260)
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
                .padding(.horizontal, 12)
                .accessibilityLabel(String(localized: "sticker.text.field.a11y",
                                           defaultValue: "Texte de la décoration", bundle: .module))
            templateTab(family: .text, enabled: !typedStickerTextTrimmed.isEmpty)
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
    private func pose(_ gabarit: StickerTemplate,
                      family: StickerTemplateFamily,
                      slots: [String: String]) {
        guard family == .location else {
            // Sans mots, rien à poser : la grille est désactivée, ceci est la
            // ceinture.
            if family == .text, (slots[StickerSlotFiller.textSlot] ?? "").isEmpty { return }
            onTemplateSelected(gabarit, slots)
            return
        }
        // Sans lieu choisi il n'y a rien à poser — la grille du lieu n'est
        // d'ailleurs rendue que lorsque `places` n'est pas vide.
        guard let lieu = currentPlace else { return }
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
             .nature, .cheer, .answer:
            return [:]
        case .text:
            return [StickerSlotFiller.textSlot: typedStickerTextTrimmed]
        case .location:
            guard let lieu = currentPlace else { return [:] }
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
    @ViewBuilder
    var placeTab: some View {
        VStack(alignment: .leading, spacing: 10) {
            if places.isEmpty {
                // L'onglet EXISTE (l'app sait chercher) mais n'a rien trouvé :
                // ce n'est pas la même chose qu'une capacité absente, et l'écran
                // doit le dire plutôt que de laisser une grille vide.
                Text(String(localized: "sticker.place.empty",
                            defaultValue: "Aucun lieu trouvé autour de vous",
                            bundle: .module))
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 28)
            } else {
                placeChips
                templateTab(family: .location)
            }
        }
        .padding(.top, 6)
    }

    private var placeChips: some View {
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
            .padding(.horizontal, 12)
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
        .frame(width: side, height: side)
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
