import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'éditeur d'OBJET, plein écran — un mélange de `1c` et de `2e`** (#4634,
/// directive porteur 2026-08-31).
///
/// > « L'édition `2e` doit être bien appliquée, plein écran avec toutes les
/// > options affichées lors de l'édition. […] Pour l'édition de texte il faut un
/// > mélange de `1c` — Éditeur de scène, objet sélectionné — et de `2e`. […]
/// > Puisque la sélection d'un élément, on doit pouvoir indiquer d'où à où il
/// > apparaît, son style, taille, alignement si nécessaire, et position
/// > temporelle avec la vision dans le plan 2D, le tout dans un espace assez
/// > large en 2D pour bien positionner. »
///
/// ## Le défaut que cet écran ferme
///
/// Les dix-huit styles vivaient en BANDE basse, servie par `bandTextStylesContent`.
/// Or `ComposerLowZone.resolve` donne le bas à `.toolOptions` dès qu'un outil est
/// ouvert — et éditer un texte OUVRE un outil. **Le spécimen était donc
/// inatteignable pendant l'édition**, c'est-à-dire au seul moment où l'on
/// choisit un style ; il ne se montrait qu'après avoir refermé l'éditeur, par un
/// jeton.
///
/// Pire, `MeeshyToolOptionsPanel` ne rend quelque chose que si un outil est
/// DÉPLIÉ. Tant qu'aucune bulle du rail n'était tapée, la zone basse d'une
/// édition de texte était **vide**. « Toutes les options » n'existait nulle part.
///
/// ## Ce que « toutes affichées » veut dire ici
///
/// Les sept outils de `TextEditTool` sont EMPILÉS, chacun sous son titre, sans
/// bulle à déplier — plus un choix à faire avant de pouvoir choisir. Le style
/// prend la forme du spécimen `2e` (le vrai texte sur son vrai fond, la grille
/// des dix-huit) parce que c'est celle que la planche donne, et le TEMPS ferme
/// la liste avec le plan 2D, qui montre la fenêtre au lieu de la décrire.
///
/// ## Pourquoi la scène occupe la moitié haute
///
/// « Un espace assez large en 2D pour bien positionner » : l'objet se déplace,
/// se pince et se tourne DANS cet écran. Une vignette suffirait à montrer le
/// résultat d'un style ; elle ne suffit pas à poser un objet au pixel près.
struct ComposerObjectEditorView: View {

    @ObservedObject var viewModel: StoryComposerViewModel
    let objectId: String
    let aspectRatio: CGFloat
    let plateauTint: Color
    let sceneImages: [String: UIImage]
    let sceneImagesVersion: UInt64
    let onClose: () -> Void
    /// Remonte au meuble l'objet que le plan 2D vient de désigner — c'est lui
    /// qui possède `editedObject`, et deux sources pour « quel objet est ouvert »
    /// divergeraient au premier tap.
    let onSelectObject: (String) -> Void

    /// **Ce qui est DÉPLIÉ, une section à la fois** (#4842). L'état est LOCAL
    /// à l'écran, et jamais celui que le ViewModel porte pour la rangée
    /// d'outils : c'est ce dernier qui rendait la zone basse d'une édition de
    /// texte vide tant qu'aucune bulle n'avait été tapée, et ce lot ne le
    /// ramène pas. (Son identifiant n'est pas cité ici : une garde de source
    /// l'interdit dans ce fichier, et un doc-comment qui le nomme la fait
    /// rougir aussi sûrement qu'un appel — mesuré.)
    @State private var openedSection: ComposerObjectEditorSection? =
        ComposerObjectEditorDisclosure.initiallyOpened

    @State private var planZoom: Plan2DZoom = .fit
    @State private var moveOrigin: Double?

    /// **Le plan TIENT le geste, donc le scroller doit lâcher.** Sans ce
    /// verrou, le contenu panne sous le doigt pendant que la barre se rogne —
    /// les deux se disputent le même doigt, et `Plan2DView` documente
    /// explicitement le signal qu'il émet pour l'éviter.
    @State private var planHoldsGesture = false

    /// La fenêtre de l'objet, LUE du modèle à chaque rendu — jamais recopiée
    /// dans un `@State`, qui divergerait de ce que le plan 2D dessine.
    private var timing: ComposerObjectTiming {
        ComposerObjectTiming.timing(start: textObject?.startTime,
                                    duration: textObject?.duration)
    }

    private var textObject: StoryTextObject? {
        viewModel.currentEffects.textObjects.first { $0.id == objectId }
    }

    private var slideDuration: Double {
        max(1, viewModel.currentSlide.duration)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            scene
            options
        }
        .background(plateauTint.ignoresSafeArea())
        .preferredColorScheme(.dark)
    }

    // MARK: - L'en-tête

    private var header: some View {
        HStack {
            Text(ComposerObjectEditorCopy.title)
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundStyle(.white)
            Spacer()
            Button(action: onClose) {
                Text(ComposerObjectEditorCopy.done)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - La scène, en grand

    /// L'objet reste SÉLECTIONNÉ tout du long : c'est la doctrine de `1c` — « un
    /// seul objet à la fois ».
    ///
    /// **Mais il n'est plus ENCADRÉ** (#4850, directive porteur 2026-09-02) :
    ///
    /// > « En plein ecran pourquoi mettre un cadre violet autour du texte, je
    /// > trouve inutile... »
    ///
    /// Cette ligne portait la justification inverse — « le cadre qui l'encadre
    /// est ce qui rend le réglage lisible pendant qu'on le change ». Elle était
    /// vraie SUR LA SCÈNE, où le cadre désigne, parmi plusieurs objets, celui
    /// que le doigt saisit. Ici l'objet EST le sujet de l'écran : le titre le
    /// nomme, les neuf sections le règlent, il n'y a rien dont le distinguer.
    /// Un signe qui n'apprend rien occupe la place de ce qui apprend.
    ///
    /// La justification est révoquée ICI plutôt qu'effacée : un commentaire qui
    /// explique pourquoi le code fait quelque chose se relit comme une raison
    /// de ne pas y toucher, et celui-ci décrivait une décision annulée.
    ///
    /// Mesuré avant de retirer : `selectedItemId` ne gouverne QUE le marqueur
    /// (`StoryCanvasRepresentable` → `setSelectionMarker`). Il ne décide ni de
    /// ce qui répond au doigt, ni de ce qui s'édite en ligne — le passer à
    /// `nil` n'enlève donc aucun geste.
    private var scene: some View {
        EmbeddedSceneCanvas(
            slide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            aspectRatio: aspectRatio,
            cornerRadius: 20,
            // **Taper un autre texte l'OUVRE** — le même geste que sur une barre
            // du plan 2D, et la même raison : sur un écran dont le sujet EST
            // l'objet sélectionné, un tap qui ne sélectionne rien est un
            // contrôle inerte. Les autres kinds n'ont pas d'éditeur ici (#4082),
            // donc ils ne répondent pas plutôt que de répondre à moitié.
            onItemTapped: { id, kind in
                guard kind == .text, id != objectId else { return }
                openEditor(id)
            },
            loadedImages: sceneImages,
            loadedImagesVersion: sceneImagesVersion,
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, texte in
                viewModel.updateTextContent(id: id, text: texte)
            },
            // **Vide, et c'est le comportement voulu.** Sur la scène incrustée,
            // fermer la saisie SORT du mode d'édition ; ici l'écran EST
            // l'édition, et en sortir au premier « retour » du clavier
            // refermerait tout pendant qu'on règle un style. La sortie a son
            // geste : « Terminé », qui appelle `closeObjectEditor`.
            onInlineTextEditEnded: { _ in },
            // `nil` — voir le doc-comment : pas de cadre en plein écran (#4850).
            selectedItemId: nil
        )
        .frame(maxWidth: .infinity)
        .layoutPriority(1)
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    // MARK: - Toutes les options, empilées

    @ViewBuilder
    private var options: some View {
        if let binding = viewModel.textObjectBinding(for: objectId) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    styleSection(binding)
                    // Les six autres outils, dans l'ordre que la rangée du SDK
                    // a fixé — le même ordre que les bulles du rail, pour que
                    // passer de l'un à l'autre ne demande pas de réapprendre.
                    ForEach(TextEditTool.all.filter { $0 != .style }, id: \.self) { tool in
                        section(ComposerObjectEditorCopy.tool(tool), .tool(tool)) {
                            TextEditToolOptions(tool: tool, textObject: binding)
                        }
                    }
                    timingSection
                    planSection
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 28)
            }
            .frame(maxHeight: .infinity)
            .scrollDisabled(planHoldsGesture)
        }
    }

    /// **Le spécimen `2e`, à sa vraie place** — pendant l'édition, sur le fond
    /// réel, avec le vrai texte de la scène.
    @ViewBuilder
    private func styleSection(_ binding: Binding<StoryTextObject>) -> some View {
        section(ComposerObjectEditorCopy.tool(.style), .tool(.style)) {
            TextStyleSpecimenBand(
                text: binding.wrappedValue.text,
                selection: binding.wrappedValue.parsedTextStyle,
                onDarkSurface: true,
                horizontalInset: 0,
                onSelect: { style in
                    viewModel.updateTextStyle(id: objectId, style: style)
                }
            )
        }
    }

    // MARK: - D'où à où

    /// La fenêtre se règle en DÉBUT et FIN — ce que l'auteur voit — et se range
    /// en début + durée, ce que le modèle stocke. `ComposerObjectTiming` tient
    /// la conversion, et surtout le `nil` de « permanent », qu'une paire de
    /// glissières nues perdrait au premier réglage.
    private var timingSection: some View {
        section(ComposerObjectEditorCopy.timing, .timing) {
            VStack(alignment: .leading, spacing: 10) {
                Text(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.75))
                    .accessibilityLabel(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))

                slider(titre: ComposerObjectEditorCopy.start,
                       valeur: timing.start,
                       borne: slideDuration) { nouvelle in
                    apply(timing.moved(to: nouvelle, slideDuration: slideDuration))
                }

                if let fin = timing.end {
                    slider(titre: ComposerObjectEditorCopy.end,
                           valeur: fin,
                           borne: slideDuration) { nouvelle in
                        apply(timing.trimmingEnd(to: nouvelle, slideDuration: slideDuration))
                    }
                }

                // **Le retour vers « permanent » est un CHEMIN, pas un défaut.**
                // Sans lui, régler une fin serait irréversible : l'interface
                // offrirait un aller sans retour, et l'auteur devrait supprimer
                // l'objet pour le refaire.
                Toggle(isOn: Binding(
                    get: { timing.isPermanent },
                    set: { permanent in
                        apply(permanent
                              ? timing.madePermanent
                              : timing.trimmingEnd(to: slideDuration, slideDuration: slideDuration))
                    }
                )) {
                    Text(ComposerObjectEditorCopy.permanent)
                        .font(MeeshyFont.relative(13, weight: .regular))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .tint(MeeshyColors.brandPrimary)
            }
        }
    }

    private func slider(titre: String, valeur: Double, borne: Double,
                        onChange: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(titre)
                    .font(MeeshyFont.relative(11, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text(ComposerObjectEditorCopy.seconds(valeur))
                    .font(MeeshyFont.relative(11, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
            }
            Slider(value: Binding(get: { valeur }, set: onChange), in: 0...borne)
                .tint(MeeshyColors.brandPrimary)
                .accessibilityLabel(titre)
                .accessibilityValue(ComposerObjectEditorCopy.seconds(valeur))
        }
    }

    // MARK: - Le plan 2D

    /// **La vision dans le plan** — l'objet parmi les autres, sur l'axe du
    /// temps. C'est `Plan2DView` du SDK, monté tel quel : en écrire une version
    /// simplifiée ici perdrait les poignées de bord, le verrou des fonds et le
    /// signal de blocage du scroll, que l'atelier a déjà.
    private var planSection: some View {
        section(ComposerObjectEditorCopy.plan, .plan) {
            GeometryReader { geo in
                Plan2DView(
                    tracks: Plan2DLayout.tracks(from: viewModel.currentEffects,
                                                slideDuration: slideDuration),
                    zoom: planZoom,
                    laneWidth: max(120, geo.size.width),
                    slideDuration: slideDuration,
                    isDark: true,
                    selectedTrackId: objectId,
                    // **Taper une autre piste ouvre CET objet-là** : le plan
                    // montre toute la slide, et le seul geste qu'on attend d'une
                    // barre voisine est « celle-ci maintenant ». Sans ce
                    // branchement, le tap serait un contrôle inerte de plus.
                    onSelectTrack: { id in
                        guard id != objectId,
                              viewModel.currentEffects.textObjects.contains(where: { $0.id == id })
                        else { return }
                        openEditor(id)
                    },
                    // Les keyframes s'éditent à l'Inspecteur de l'atelier, que ce
                    // meuble ne monte pas (#4082) : DÉSIGNER un keyframe ici
                    // n'ouvrirait rien. Le rappel reste vide et le dit — un
                    // geste armé sans destination est un contrôle qui ment.
                    onSelectKeyframe: { _ in },
                    // Même raison : l'index rendu est absolu dans `tracks`, tous
                    // plans confondus, et le traduire en mutation de plan/z est
                    // exactement ce que `Plan2DView` laisse à l'appelant. Tant
                    // que l'écran ne sait pas le faire, il ne le promet pas.
                    onReorder: { _, _ in },
                    onTrimStart: { id, delta in
                        guard id == objectId else { return }
                        apply(timing.trimmingStart(to: timing.start + delta))
                    },
                    onTrimEnd: { id, delta in
                        guard id == objectId else { return }
                        apply(timing.trimmingEnd(to: (timing.end ?? slideDuration) + delta,
                                                 slideDuration: slideDuration))
                    },
                    onMove: { id, cumule in
                        guard id == objectId else { return }
                        // Le déplacement est CUMULÉ depuis le début du geste :
                        // l'origine se capture au premier appel, sans quoi les
                        // deltas s'additionneraient en boule de neige.
                        let origine = moveOrigin ?? timing.start
                        if moveOrigin == nil { moveOrigin = origine }
                        apply(timing.moved(to: origine + cumule, slideDuration: slideDuration))
                    },
                    onMoveEnded: { _ in moveOrigin = nil },
                    onScrollLockChanged: { tenu in planHoldsGesture = tenu }
                )
            }
            .frame(height: 120)
        }
    }

    // MARK: - Le gabarit d'une section

    /// **Une section, son titre, et l'état de son dépliage** (#4842).
    ///
    /// `DisclosureGroup` plutôt qu'un chevron maison, pour une raison qui n'est
    /// pas la commodité : il ANNONCE « développé »/« replié » à VoiceOver, dans
    /// les sept langues, sans qu'aucune clé de catalogue soit écrite. Un
    /// chevron dessiné à la main ne dit rien à personne.
    ///
    /// Le `set` du binding IGNORE la valeur que SwiftUI lui passe et demande à
    /// la règle. Ce n'est pas une négligence : `opened(after:from:)` rend le
    /// même verdict (taper l'ouverte ferme, taper une autre bascule) ET tient
    /// la promesse qui compte — jamais deux ouvertes. Laisser la vue écrire
    /// `openedSection = tapped` aurait remis la loi hors de portée des témoins.
    private func section<Content: View>(_ titre: String,
                                        _ id: ComposerObjectEditorSection,
                                        @ViewBuilder content: () -> Content) -> some View {
        // Le corps est ÉVALUÉ ici : `DisclosureGroup` garde son contenu en
        // fermeture échappante, et un `content()` non échappant ne peut pas y
        // entrer. La valeur, elle, voyage.
        let corps = content()
        return DisclosureGroup(isExpanded: Binding(
            get: { ComposerObjectEditorDisclosure.isOpen(id, opened: openedSection) },
            set: { _ in
                openedSection = ComposerObjectEditorDisclosure.opened(after: id,
                                                                      from: openedSection)
            }
        )) {
            corps
                .padding(.top, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
            // **44 pt sur toute la RANGÉE, et une forme qui les remplit.**
            // Mesuré au doigt : un label réduit à son `Text` rapportait bien
            // une frame de 370 × 21 à l'arbre d'accessibilité — donc « une
            // cible pleine largeur » à qui la LIT — mais ne répondait qu'aux
            // GLYPHES. Un tap au milieu de la rangée, entre le mot et le
            // chevron, ne déclenchait rien. Deux défauts d'un coup : 21 pt sous
            // le plancher HIG, et une cible dont l'arbre ment sur l'étendue.
            //
            // `contentShape` est ce qui fait de la frame la cible ; sans lui,
            // l'agrandir ne fait qu'agrandir le vide.
            Text(titre)
                .font(MeeshyFont.relative(9.5, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(.white.opacity(0.5))
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
        .tint(.white.opacity(0.55))
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Changer d'objet SANS refermer l'écran. Le mode d'édition suit, sinon le
    /// canvas continuerait d'éditer en ligne le texte précédent.
    private func openEditor(_ id: String) {
        viewModel.exitTextEditingMode()
        viewModel.enterTextEditingMode(textId: id)
        onSelectObject(id)
    }

    /// Ranger la fenêtre dans le MODÈLE — jamais dans un état de vue. C'est ce
    /// qui garde le plan 2D, le canvas et la publication d'accord.
    ///
    /// **Elle passe par le BINDING du viewModel**, seul site qui sait écrire
    /// dans `currentEffects` — son setter est privé au SDK, et c'est une bonne
    /// clôture : une vue qui reconstruirait le tableau d'effets pour changer un
    /// champ écraserait tout ce qu'un autre chemin y aurait posé entre-temps.
    private func apply(_ nouveau: ComposerObjectTiming) {
        guard let binding = viewModel.textObjectBinding(for: objectId) else { return }
        var objet = binding.wrappedValue
        objet.startTime = nouveau.storedStartTime
        objet.duration = nouveau.storedDuration
        binding.wrappedValue = objet
    }
}

/// L'objet en cours d'édition. Un type plutôt qu'un `String?` parce que
/// `fullScreenCover(item:)` exige `Identifiable` — et parce qu'un identifiant nu
/// se confondrait, à la relecture, avec `selectedSceneItemId`, qui répond à une
/// autre question : celui-là est SÉLECTIONNÉ, celui-ci est OUVERT.
nonisolated struct ComposerEditedObject: Identifiable, Equatable {
    let id: String
}

/// Les mots de l'éditeur d'objet. Hors du `body` — une chaîne composée dans une
/// vue est hors de portée d'un témoin.
nonisolated enum ComposerObjectEditorCopy {

    static var title: String {
        String(localized: "composer.object.editor.title",
               defaultValue: "Modifier l'objet", bundle: .main)
    }

    static var done: String {
        String(localized: "composer.object.editor.done", defaultValue: "Terminé", bundle: .main)
    }

    static var timing: String {
        String(localized: "composer.object.editor.timing", defaultValue: "APPARITION", bundle: .main)
    }

    /// **« TIMELINE », pas « PLAN 2D »** (directive porteur 2026-09-02).
    ///
    /// La CLÉ garde son nom : elle désigne le composant monté
    /// (`Plan2DView` du SDK), et renommer une clé de catalogue casserait les
    /// sept traductions déjà posées sans rien apporter. Ce qui change est le
    /// MOT que l'auteur lit — et il rejoint le vocabulaire que le reste de
    /// l'app emploie déjà pour la même chose (`story.tool.timeline`), au lieu
    /// d'un terme de géométrie que cette section était seule à porter.
    static var plan: String {
        String(localized: "composer.object.editor.plan", defaultValue: "TIMELINE", bundle: .main)
    }

    static var start: String {
        String(localized: "composer.object.editor.start", defaultValue: "Début", bundle: .main)
    }

    static var end: String {
        String(localized: "composer.object.editor.end", defaultValue: "Fin", bundle: .main)
    }

    static var permanent: String {
        String(localized: "composer.object.editor.permanent",
               defaultValue: "Visible du début à la fin", bundle: .main)
    }

    static func seconds(_ valeur: Double) -> String {
        String(format: "%.1f s", valeur)
    }

    /// **La phrase « d'où à où », en toutes lettres.** C'est la demande du
    /// porteur mot pour mot ; deux glissières seules obligeraient à faire le
    /// calcul de tête.
    static func window(_ timing: ComposerObjectTiming, slideDuration: Double) -> String {
        guard let fin = timing.end else {
            return String(localized: "composer.object.editor.window.permanent",
                          defaultValue: "De \(seconds(timing.start)) à la fin",
                          bundle: .main)
        }
        return String(localized: "composer.object.editor.window",
                      defaultValue: "De \(seconds(timing.start)) à \(seconds(fin))",
                      bundle: .main)
    }

    /// Le nom d'un outil, en section. Les glyphes du rail suffisent à une bulle
    /// de 44 pt ; un titre de section a besoin d'un mot.
    static func tool(_ tool: TextEditTool) -> String {
        switch tool {
        // **POLICE, pas STYLE** (#4850). La mesure a tranché contre les deux
        // formes que la directive proposait : `StoryTextStyle` est un sélecteur
        // de POLICE et rien d'autre — les dix-huit cas résolvent tous vers une
        // famille, une graisse ou un design (`storyFont(for:size:)`,
        // `StoryTextFontResolver.baseFont`), aucun n'applique d'effet.
        //
        // « Neon » ne brille pas : c'est du système semibold arrondi. « Tag » ne
        // bombe pas : c'est MarkerFelt. « Affiche » est Avenir Next Condensed.
        // Sept des dix-huit sont des polices DÉGUISÉES en effets, et c'est ce
        // mélange de VOCABULAIRE — pas un mélange d'axes — que l'auteur voyait.
        //
        // Les vrais effets ont déjà leurs sections, trois lignes plus bas :
        // FOND, CADRE, CONTOUR. Ouvrir un axe « Effet » aujourd'hui créerait une
        // section vide ; le jour où un style appliquera un effet, le témoin
        // `test_laSectionDesPolices_neSAppellePlusSTYLE` tombera et rouvrira la
        // question.
        case .style:
            return String(localized: "composer.object.tool.style", defaultValue: "POLICE", bundle: .main)
        case .color:
            return String(localized: "composer.object.tool.color", defaultValue: "COULEUR", bundle: .main)
        case .align:
            return String(localized: "composer.object.tool.align", defaultValue: "ALIGNEMENT", bundle: .main)
        case .background:
            return String(localized: "composer.object.tool.background", defaultValue: "FOND", bundle: .main)
        case .frame:
            return String(localized: "composer.object.tool.frame", defaultValue: "CADRE", bundle: .main)
        case .border:
            return String(localized: "composer.object.tool.border", defaultValue: "CONTOUR", bundle: .main)
        case .language:
            return String(localized: "composer.object.tool.language", defaultValue: "LANGUE", bundle: .main)
        }
    }
}
