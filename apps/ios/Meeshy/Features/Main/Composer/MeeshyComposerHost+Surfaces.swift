import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Ce que le meuble MONTE** — les trois surfaces, l'accessoire d'en-tête de
// l'atelier et le calque de description. Extrait de `MeeshyComposerHost.swift`
// au #4102 ; le contrat du découpage est écrit en tête de ce fichier-là.

extension MeeshyComposerHost {

    // MARK: - La scène

    /// L'atelier du SDK, monté tel quel — la scène vit dedans.
    ///
    /// Périmètre CONSIGNÉ de C2 : la zone contextuelle reste celle de l'atelier
    /// existant. Le host ne lui impose pas ses capacités par une API neuve ; il
    /// gouverne ce que LUI monte autour. Passer des capacités à l'atelier
    /// appartient à l'écriture v3 native, hors de ce lot.
    ///
    /// **Le plateau n'est plus monté ICI depuis le lot 4.7.** Il coiffe les
    /// trois surfaces depuis le `body`, sous `paintsFormatFan` : le tenir dans
    /// ce bloc le réservait de fait à la scène, et le chip « Post » d'une
    /// republication de mood n'existait alors sur aucun écran. La disposition
    /// visuelle de la scène n'a pas changé pour autant — le `body` empile déjà
    /// le plateau au-dessus de la surface.
    ///
    /// Les cinq fournisseurs sont posés SUR l'atelier, au plus près de son
    /// montage : c'est la forme que `AppInitWireupTests` compte, site par site.
    var composerSurface: some View {
        StoryComposerView(
            viewModel: viewModel,
            initialVisibility: initialVisibility,
            chromeOwner: chromeOwner,
            // #4135 — sans elle, `chromeOwner == .host` laisserait la scène
            // SANS aucun chemin de départ : l'atelier n'assemble plus ses
            // commandes, et le socle n'aurait personne à presser.
            publishTrigger: publishTrigger,
            publishTargetType: selectedFormat.postType,
            onPublishAllInBackground: onPublishAllInBackground,
            onPreview: onPreview,
            onDismiss: onDismiss
        )
        .storyLocationPickerProvided()
        .storyCameraCaptureProvided()
        .storyRecentCameraRollProvided()
        .storyPasteProvided()
        .storyStickerLibraryProvided()
        // **Les deux accessoires de la rangée haute de l'atelier** (#4124). Le
        // SDK expose deux emplacements ; ce qu'on y met reste app-side — le chip
        // lit l'éventail et la mémoire de format, l'icône ouvre un éditeur dont
        // le TEXTE appartient au meuble.
        //
        // Le chip est gaté par la MÊME règle que partout ailleurs
        // (`ComposerFormatFanPlacement`) : c'est elle qui garantit qu'il n'y a
        // jamais deux sélecteurs à l'écran, par l'exhaustivité de son `switch`
        // et non par un compte d'occurrences.
        .storyComposerHeaderLeadingAccessory {
            if mountsFormatFan
                && ComposerFormatFanPlacement.place(for: mountedSurface) == .atelierHeader {
                formatChip
            }
        }
        // **L'icône de description DESCEND dans la rangée d'outils** (#4136,
        // directive porteur 2026-08-28). Elle vivait dans la rangée haute
        // depuis #4124, où elle avait été posée pour une raison de PLACE : à
        // droite, le groupe d'actions passait à cinq pastilles et l'audience se
        // tronquait en « F ». Cette raison est éteinte — le socle porte
        // désormais l'audience, l'œil et la flèche (#4135), et la rangée haute
        // n'a plus que la croix, le type et le `⋯`.
        //
        // Le déplacement est un CHOIX, pas un effet de bord : la description
        // vise la SLIDE, comme les six outils visent la scène. De gauche à
        // droite, la rangée descend les niveaux du modèle — le même ordre que
        // le bas de l'écran tient de haut en bas. La laisser dans l'en-tête
        // l'aurait rangée parmi ce qui QUALIFIE la publication, où elle n'est
        // pas.
        .storyComposerToolRowLeadingAccessory { atelierDescriptionButton }
        // **#4361 — ce que le meuble occupe en bas, l'atelier le libère.** Le
        // canvas se rétracte au-dessus de la saisie (`bottomInset` du solveur de
        // cadrage), exactement comme il le fait déjà devant une band. `0` quand
        // la saisie est fermée : la scène retrouve sa géométrie de repos.
        .storyComposerCanvasBottomReservation(
            editsSceneDescription ? sceneDescriptionEditorHeight : 0
        )
    }

    /// **L'icône qui ouvre la description de la slide** (#4124).
    ///
    /// Elle remplace le « Touchez pour écrire » qui occupait le bas de l'écran
    /// en permanence — un calque de lecture y prenait la place que la scène
    /// centrée réclame, pour un texte que l'auteur ne regarde pas la plupart du
    /// temps.
    ///
    /// Le glyphe dit ce qu'il ouvre : `text.alignleft` est le PARAGRAPHE, pas
    /// un crayon (qui aurait dit « modifier la scène ») ni une bulle (qui aurait
    /// dit « commenter »).
    ///
    /// **Le point signale un texte DÉJÀ écrit**, sans le lire : un contrôle qui
    /// n'affiche jamais son état oblige à l'ouvrir pour savoir s'il est vide.
    ///
    /// **Elle se pose du côté qui QUALIFIE**, avec le type — pas dans le groupe
    /// d'actions. Ce n'est pas un rangement : posée à droite, elle portait ce
    /// groupe à cinq pastilles sur 402 pt, et la mesure a montré le sélecteur
    /// d'audience tronqué en « F » avec l'icône à moitié sous la flèche. Un
    /// ATTRIBUT rangé parmi les ACTIONS déborde.
    var atelierDescriptionButton: some View {
        Button {
            HapticFeedback.light()
            editsSceneDescription = true
        } label: {
            // **La FORME est celle de la rangée, pas celle de l'en-tête**
            // (#4136). Elle portait une pastille de verre, juste parce qu'elle
            // vivait parmi les commandes de la rangée haute, qui en sont toutes.
            // Descendue dans la rangée d'outils, cette pastille faisait d'elle
            // la seule entrée cerclée d'une rangée qu'on venait précisément
            // d'unifier — mesuré à l'écran, et voyant.
            //
            // **`glassControlForeground()`, jamais `textPrimary(isDark: true)`**
            // — et la différence se voit. Le chrome du document vit sur un
            // plateau SOMBRE en permanence, donc y coder « clair » marchait ;
            // celui de l'atelier suit `canvasChromeScheme`, qui bascule avec
            // le FOND du canvas. Un glyphe clair posé sur un fond de scène
            // pastel disparaît, mesuré à l'écran.
            Image(systemName: "text.alignleft")
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .glassControlForeground()
                // 44 pt de cible malgré le glyphe nu — le débord est invisible,
                // la même raison qui donne à `ComposerToolRow` son `hitSide`.
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .overlay(alignment: .topTrailing) {
                    if !documentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        // **Le point signale un texte DÉJÀ écrit**, sans le lire :
                        // un contrôle qui n'affiche jamais son état oblige à
                        // l'ouvrir pour savoir s'il est vide.
                        Circle()
                            .fill(MeeshyColors.indigo400)
                            .frame(width: 7, height: 7)
                            .offset(x: -6, y: 6)
                    }
                }
        }
        .accessibilityLabel(Text(ComposerDescriptionCopy.openLayer))
        .accessibilityValue(Text(documentText.isEmpty
                                 ? ComposerDescriptionCopy.amorce
                                 : documentText))
    }

    /// La surface « document sans scène » (V2).
    ///
    /// Elle ne porte PAS le plateau — une garde de source le tient. Ce que le
    /// plateau porte depuis le 2026-08-24 est le seul éventail, et le
    /// paragraphe sur l'ÉVENTAIL plus bas dit ce qu'il en coûte ici.
    ///
    /// `profile.showsSlides` et `profile.showsTimeline` n'ont plus AUCUN
    /// lecteur de production depuis que les trois pictogrammes inertes du
    /// plateau sont partis ; seuls les tests de la table de C1 les lisent
    /// encore. Ce n'est pas un oubli à combler ici : la table décrit ce que la
    /// porte offre, et le meuble n'a aujourd'hui aucun moyen de l'honorer.
    ///
    /// **La rangée d'outils s'y peint depuis le 2026-08-24 — et elle en compte
    /// UN.** Ce n'est pas un demi-travail, c'est la loi 4 appliquée jusqu'au
    /// bout : `ComposerDocumentTool.effect` ne concède un outil que si son
    /// RÉSULTAT a une destination, et cinq des six n'en ont pas. Le pipeline
    /// d'ingestion du dépôt tourne bien (`ComposerDropResolver` /
    /// `ComposerIngestRouter`, six sites de production) mais le trou n'est pas
    /// là : `ComposerDocumentDraft` ne porte ni `mediaIds`, ni fichier, ni
    /// lieu, et le seul publieur que le meuble atteigne n'en accepte aucun.
    /// Peindre une photothèque au-dessus de ce trou rendrait une image que rien
    /// ne transporterait.
    ///
    /// L'emoji, lui, n'ingère rien : il écrit dans `documentText`, que le
    /// brouillon emporte déjà. Sa chaîne est complète, donc il se peint.
    ///
    /// **Elle ne porte pas non plus l'ÉVENTAIL**, qui vit dans le plateau — et
    /// depuis le lot 4.7 le plateau est monté par le `body`, sous une RÈGLE.
    ///
    /// Jusque-là, le plateau était monté par `composerSurface` : la scène seule
    /// le portait, et l'impasse était tenue par un ACCIDENT DE MONTAGE plutôt
    /// que par un raisonnement. Elle l'est désormais par
    /// `ComposerFormatFanPlacement`, qui répond à la seule question qui compte :
    /// *tous les formats offerts atterrissent-ils sur une surface qui partage
    /// l'état du meuble ?*
    ///
    /// Ce qui SÉPARE les deux portes qui atteignent cette surface :
    ///
    /// - **`.repost(sourceFormat: .status)`** offre `[.status, .post]`, deux
    ///   formats qui restent sur des surfaces sans atelier. `documentText`,
    ///   `moodEmoji` et l'audience sont l'état du MEUBLE et suivent la bascule.
    ///   L'éventail s'y peint donc, des DEUX côtés — sans quoi l'ancrage serait
    ///   une porte à sens unique.
    /// - **`.feedComposer`** offre `.story`, que `ComposerSurfaceRouting` envoie
    ///   à la SCÈNE. Un auteur qui taperait son post ici puis choisirait
    ///   « Story » verrait le routage lui monter l'atelier, et `documentText`
    ///   n'aurait aucun chemin pour l'y suivre — la saisie disparaîtrait sans un
    ///   mot, sur la surface de création la plus fréquentée de l'app.
    ///
    /// Mesuré le 2026-08-24 sur les 14 fichiers `StoryComposerViewModel*.swift`,
    /// et le fait n'a pas bougé : ses écrivains publics sont l'adoption de
    /// brouillon (`adoptDraft(id:)`, `detachFromAdoptedDraft()`,
    /// `adoptDeclaredReferences(_:)`), la timeline
    /// (`loadCurrentSlideIntoTimeline()`, `commitTimelineToCurrentSlide()`,
    /// `applyPersistedCommandHistory(_:)`, `shutdownTimelineIfNeeded()`, et
    /// `timelineViewModel` qui rend une référence écrivant à son tour) et deux
    /// inits de reprise (`init(editing:)`, `init(reposting:authorHandle:)`) —
    /// **aucun n'écrit du TEXTE** : `currentEffects` est `public internal(set)`,
    /// et rien dans `+Elements.swift` n'expose publiquement la création d'un
    /// élément de texte. La liste est plus large que le blocage, et c'est le
    /// blocage qui compte : un `grep` de contrôle doit CONFIRMER cette phrase,
    /// jamais la démentir.
    ///
    /// **Condition de levée pour `.feedComposer`, côté SDK** : un écrivain
    /// public de texte atteignable par le meuble. L'éventail y descend alors
    /// AVEC le transfert de la saisie, jamais avant lui — et la règle de
    /// placement le dira d'elle-même, sans qu'on ait à toucher ce fichier.
    ///
    /// La TABLE de C1 désigne le meuble pour `.feedComposer`
    /// (`routesToLegacy: nil`) depuis le lot 3, et depuis T3.1 le PLEIN composer
    /// du fil PASSE ici : `RootViewComponents` monte
    /// `DocumentComposerDoor(intent: ComposerIntent(origin: .feedComposer))`.
    /// Ce qui n'a pas bougé, c'est le reste — les deux CITATIONS montent encore
    /// leur feuille (T3.2, levée 7.5) et le composer inline iPad son propre
    /// booléen (T3.3 le nomme ; sa migration T3.4 est descopée). La porte la
    /// plus utilisée, elle, passe désormais par le meuble.
    ///
    /// **Ne pas confondre les deux blocages, ils n'ont ni la même cause ni la
    /// même levée.** Celui de `.feedComposer` est côté SDK (le transfert de la
    /// saisie). Celui que la republication portait était app-side — le plafond
    /// d'audience de la loi 10 — et il ne RETIENT plus l'éventail : ce que la
    /// loi 10 pouvait fermer sans connaître la source l'a été au lot 4.9
    /// (`ComposerAudienceOffer` retire `ONLY`/`EXCEPT` d'une republication), et
    /// l'ÉLARGISSEMENT qui reste pèse EXACTEMENT autant sur le ruban du mood,
    /// peint sur un écran réel depuis le lot 4.6. L'ancrage hérite d'un trou
    /// déjà nommé et déjà gardé ; il n'en ajoute aucun. Gardes :
    /// `ComposerDocumentSurfaceTests`
    /// `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint` et
    /// `.test_lAncrageDUnMood_nAToujoursAucunPlafondDAudience_etLEventailDescendQuandMeme`.
    ///
    /// **Sa SORTIE est celle du meuble.** `onDismiss` n'était atteignable que
    /// sous la scène, où l'atelier du SDK peint la croix ; le document n'a pas
    /// d'atelier, et la surface serait restée un écran sans issue au moment
    /// même où V3 devait la brancher sur la porte la plus utilisée de l'app.
    /// Le host ne fabrique pas une seconde fermeture : il passe la SIENNE, la
    /// même que reçoit l'atelier deux blocs plus haut.
    /// **La surface de SCÈNE** (#4070) — montée quand le document a une scène.
    ///
    /// Elle réemploie les MÊMES expressions que `documentSurface` pour tout ce
    /// qui appartient à la publication (barre haute, rail des slides, éventail,
    /// `⋯`) : deux dérivations d'une même valeur auraient divergé au premier
    /// ajustement. Ce qui diffère est ce qui n'a de sens QUE sur une scène —
    /// les deux rails et la géométrie d'encastrement.
    var sceneSurface: some View {
        ComposerSceneSurface(
            localMedia: documentLocalMedia,
            selectedMediaURL: selectedSlideMediaURL,
            selectableMediaURLs: Set(slideIdByMediaURL.keys),
            formatFan: mountsFormatFan
                && ComposerFormatFanPlacement.place(for: mountedSurface) == .documentHeader
                ? AnyView(formatChip) : nil,
            overflowMenu: documentOverflowEntries.isEmpty
                ? nil : AnyView(overflowMenu),
            onClose: onDismiss,
            onRemoveMedia: { media in documentLocalMedia.removeAll { $0 == media } },
            onSelectMedia: { media in
                guard let slideId = slideIdByMediaURL[media.url],
                      let index = viewModel.slides.firstIndex(where: { $0.id == slideId })
                else { return }
                viewModel.selectSlide(at: index)
            },
            slide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            aspectRatio: viewModel.currentCanvasRatio,
            plateauTint: tint.color,
            sceneImages: viewModel.loadedImages,
            sceneImagesVersion: viewModel.loadedImagesVersion,
            onItemTapped: { id, kind in
                selectedSceneItemId = id
                selectedSceneItemKind = kind
            },
            onBackgroundTapped: { handleSceneBackgroundTap() },
            // Les portes que CE meuble sert. `sticker` en est absente : aucun
            // chemin ne pose un objet de ce kind — `showsEmojiPicker` insère
            // dans le TEXTE, ce qui n'est pas la même chose. `description` non
            // plus : rien ne donne le focus au champ depuis l'extérieur (#4065).
            railDoors: ComposerRailDoor.offered(
                served: [.media, .sound, .place, .mention],
                format: selectedFormat,
                allowsCapture: profile.allowsCapture
            ),
            onRailDoor: { door in handleRailDoor(door) },
            // Les contrôleurs que CE meuble sert. L'empilement ne vit que sur la
            // `StoryCanvasUIView`, dont le meuble n'a aucune référence.
            trailingActions: ComposerTrailingRailPolicy.actions(
                slide: viewModel.currentSlide,
                selectedId: selectedSceneItemId,
                served: [.duplicate, .delete],
                hasEditor: false,
                canLeaveScene: selectedFormat != .story
            ),
            onTrailingAction: { action in handleTrailingRailAction(action) },
            // **Les bandes SERVIES par ce meuble** (#4064) — `palette` seule.
            // La timeline vit dans l'atelier et les 18 styles exigent un objet
            // `text` sélectionné, qu'aucune porte de cette surface ne pose :
            // les servir peindrait une bande vide.
            band: ComposerSceneBand.opened(requestedSceneBand, served: [.palette]),
            bandColors: StoryBackgroundPalette.colors,
            onPickBandColor: { hex in
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
                // La bande se referme sur le choix : la couleur est visible sur
                // la scène juste au-dessus, donc la garder ouverte occuperait
                // l'espace pour montrer ce que l'écran montre déjà.
                requestedSceneBand = nil
            },
            description: $documentText,
            descriptionPlaceholder: ComposerDocumentCopy.placeholder
        )
    }

    var documentSurface: some View {
        ComposerDocumentSurface(
            text: $documentText,
            tools: ComposerDocumentToolPolicy.visibleTools(
                served: servedDocumentTools,
                allowsCapture: profile.allowsCapture
            ),
            focusesOnAppear: ComposerSurfaceRouting.focusesContentOnAppear(opening: profile.opensWith),
            onClose: onDismiss,
            onTool: { tool in handleDocumentTool(tool) },
            localMedia: documentLocalMedia,
            onRemoveMedia: { media in documentLocalMedia.removeAll { $0 == media } },
            onPickBackground: { hex in
                // Phase 2 (#3939) — choisir un fond pose la couleur SUR la slide
                // courante et fait apparaître la scène INCRUSTÉE dans l'écran
                // document (via `showsScene` ci-dessous), SANS basculer sur
                // l'atelier plein écran. Le report du contenu reste géré ailleurs.
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
            },
            // Phase 2 (#3939) — la scène 9:16 s'incruste EN HAUT de l'écran
            // document dès qu'un fond est choisi. Elle édite la slide courante
            // de l'atelier (source de vérité unique) ; son ratio suit le fond
            // (portrait par défaut, paysage si image de fond paysage).
            sceneSlide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            showsScene: documentHasScene,
            sceneAspectRatio: viewModel.currentCanvasRatio,
            onSceneItemTapped: { _, kind in selectedSceneItemKind = kind },
            // **#4035 — taper la scène quand son FOND est un média le
            // SÉLECTIONNE.** Sans cette ligne l'inspecteur était INATTEIGNABLE
            // sur l'écran document, et le câblage complet ne le disait pas :
            // en profil Post, une slide ne porte QU'UN média et la règle 4 en
            // fait son FOND (#4038) ; or `hitTestItem` n'itère que
            // `itemsContainer`, où un fond ne vit pas — le tap retombait donc
            // sur `onBackgroundTapped`, qui EFFAÇAIT la sélection. Mesuré au
            // simulateur le 2026-08-28 : écran identique au bit près.
            //
            // La correction est APP-SIDE et non dans le geste du SDK : y
            // rendre le fond « hit-testable » changerait la manipulation de
            // l'atelier plein écran, que ce lot doit laisser intact. Le SDK dit
            // ce qui a été touché, l'app décide ce que cela sélectionne.
            onSceneBackgroundTapped: { handleSceneBackgroundTap() },
            // Taper une vignette amène SA slide sur la scène (#4038). La table
            // `slideIdByMediaURL` est justement l'index qui relie les deux ;
            // sans elle il faudrait deviner par l'ordre, qui ment dès qu'un
            // média est retiré au milieu.
            onSelectMedia: { media in
                guard let slideId = slideIdByMediaURL[media.url],
                      let index = viewModel.slides.firstIndex(where: { $0.id == slideId })
                else { return }
                viewModel.selectSlide(at: index)
            },
            // …et le rail DIT laquelle est à l'écran (#4047). La résolution est
            // ici parce que la carte `média → slide` et la slide courante
            // vivent ici : demander à la surface de la refaire l'obligerait à
            // lire le ViewModel, donc à cesser d'être sans état.
            // #4047 — le chip de TYPE descend dans la barre haute de la
            // surface, entre la fermeture et les slides. `nil` quand la règle
            // de placement ne le sert pas : la surface n'a alors rien à peindre
            // là, et non un trou à combler.
            formatFan: mountsFormatFan
                && ComposerFormatFanPlacement.place(for: mountedSurface) == .documentHeader
                ? AnyView(formatChip) : nil,
            // #4047 — le `⋯` au bout de la barre. Le meuble décide des ENTRÉES
            // par la règle, jamais par un `if` écrit dans un `body` ; aucune
            // entrée ⇒ `nil` ⇒ aucun bouton (loi 4).
            overflowMenu: documentOverflowEntries.isEmpty
                ? nil : AnyView(overflowMenu),
            selectedMediaURL: selectedSlideMediaURL,
            // #4052 — la carte média → slide est ICI, et elle est la seule
            // vérité sur « ce chip mène-t-il quelque part ? ». Un son n'y entre
            // pas : il est la bande-son, pas une page.
            selectableMediaURLs: Set(slideIdByMediaURL.keys),
            // #4032 — l'occultation de la rangée défilante se peint de la teinte
            // que le meuble applique DÉJÀ à tout l'écran, jamais d'une couleur
            // re-choisie. C'est le retour porteur du 2026-08-27, tenu.
            plateauTint: tint.color,
            // Le meuble ne décide QUE de l'ABSENCE/PRÉSENCE de la scène ; QUELS
            // contrôles la zone sert est la décision du SDK, portée par l'`init?`
            // de `EmbeddedSceneInspector` (il échoue pour tout kind qu'aucun
            // contrôle ne sert — loi 4 rendue impossible à enfreindre ici).
            // `documentBackground != nil` s'y ajoute : sans la scène (fond
            // retiré), une sélection restée en mémoire peindrait la zone
            // au-dessus de rien — un contrôle orphelin.
            sceneInspector: !documentHasScene
                ? nil
                : EmbeddedSceneInspector(viewModel: viewModel, kind: selectedSceneItemKind)
                    .map { AnyView($0) },
            sceneImages: viewModel.loadedImages,
            sceneImagesVersion: viewModel.loadedImagesVersion,
            // **La tuile de lieu (T2.5), corrigée #3903** : elle voyageait en
            // `.overlay(alignment: .bottomLeading)` sur TOUTE la surface —
            // exactement le point où `toolRow` peint sa première icône (elle
            // aussi calée au bord de tête). Un overlay et le premier enfant
            // d'un `HStack` occupent le MÊME z-niveau : rien n'empêchait le
            // chevauchement, à aucune taille d'écran ni palier de Dynamic
            // Type. Elle voyage désormais par `toolRowLeadingAccessory`, un
            // slot rendu DANS le `HStack` de `toolRow` — deux enfants d'un
            // `HStack` ne se superposent jamais, par construction.
            // **Le chip de lieu est RETIRÉ de la rangée (#4034)** : le nom du
            // lieu, son réglage et sa croix vivent désormais dans l'entête du
            // composant Position, en bas. Deux moitiés d'une même information à
            // deux endroits de l'écran, c'est ce que ce lot referme.
            //
            // Le SLOT reste, et ce n'est pas de la dette : il est le jumeau
            // symétrique de `toolRowTrailingAccessory` (la capsule de langue,
            // vivante), et c'est LUI qui tient l'invariant anti-chevauchement
            // de #3903 — tout futur chip de tête devra passer par là plutôt que
            // par un `.overlay`.
            toolRowLeadingAccessory: nil,
            // **La capsule de langue, corrigée revue Opus 2026-08-27** : elle
            // voyageait en `.overlay(alignment: .bottomTrailing)` sur TOUTE la
            // surface, sur la promesse que `toolRow` restait « la seule ligne
            // peinte au bas de la surface ». #3904 a rendu cette promesse
            // fausse — la bande de mentions peut désormais s'afficher SOUS
            // `toolRow` — et l'overlay recouvrait alors la moitié de la bande
            // (chevauchement mesuré : bande ≈82pt, capsule posée en bas-droite
            // sur ≈43pt). Même correctif que la tuile de lieu, à l'autre bout
            // du `HStack` : `toolRowTrailingAccessory`, un enfant du flux, ne
            // chevauche jamais ce qui se peint plus bas dans le `VStack`.
            toolRowTrailingAccessory: AnyView(documentLanguageCapsule)
        )
    }

    /// La capture caméra du document (T2.3), montée ICI plutôt que sous la
    /// scène : le document n'a pas d'atelier, donc pas d'environnement
    /// `storyCameraCaptureProvided` à réutiliser — `CameraView` est montée
    /// telle quelle, le même composant que la scène emprunte par
    /// environnement.
    var documentCameraSheet: some View {
        CameraView { result in
            Task { await ingestCameraCapture(result) }
        }
    }

    /// **Le gate de l'interrupteur (T2.4).** Même prédicat SDK que
    /// `PublishIntent.document` juge en aval (`ReelComposition.defaultType`
    /// via `qualifiesAsReel`) — jamais un seuil recopié ici. Sans lui,
    /// l'interrupteur resterait peint sur une composition qui n'a rien à
    /// offrir (loi 4) : une image seule ou un texte seul ne qualifient pas.
    var documentComposesReel: Bool {
        ReelComposition.qualifiesAsReel(
            mimeTypes: documentLocalMedia.map(\.mimeType),
            durationsMs: documentLocalMedia.map(\.durationMs)
        )
    }

    /// **B1 (#3924) — le média du document, traduit pour la scène.** Ne porte
    /// que l'IMAGE et la VIDÉO : un son ou un document joint n'a pas de place de
    /// fond sur un canvas. `applyContentMedia` est idempotent (clé = `sourceURL`),
    /// donc câbler cette liste à chaque bascule ne duplique rien. Le média VISUEL
    /// est aussi, par construction, ce qui fait qu'une composition qualifie comme
    /// scène — le texte, lui, suit par `applyContentText`.
    ///
    /// **Le classement image/vidéo passe par `ComposerIngestRouter.route(mime:)`**,
    /// le SEUL classeur MIME du dépôt (six sites de production) — jamais un
    /// `hasPrefix` recopié, qui divergerait de la casse et des repli qu'il gère.
    var documentContentMedia: [ComposerContentMedia] {
        documentLocalMedia.compactMap { media in
            switch ComposerIngestRouter.route(mime: media.mimeType) {
            // **Le mime DÉCLARÉ voyage avec le média (#4038)** — jamais
            // re-dérivé du nom du fichier. La pose COPIE la source sous
            // `{objectId}.{ext}`, et c'est ce nom que l'aval relit pour
            // étiqueter le téléversement : sans le mime, une URL sans extension
            // partait sous un repli codé en dur (« jpg » / « mov »).
            case .image:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .image, mimeType: media.mimeType)
            case .video:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .video,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // **Le son rejoint la scène au #4052.** Il ne devient PAS une slide
            // (voir `syncPostMediaIntoSlides`) : le modèle § 4 lui donne un
            // TROISIÈME emplacement, la bande-son de la scène — pas une page du
            // carrousel.
            case .audio:
                return ComposerContentMedia(
                    sourceURL: media.url, kind: .audio,
                    durationMs: media.durationMs, mimeType: media.mimeType)
            // Un DOCUMENT reste hors scène, et ce n'est pas un oubli : il n'a de
            // place ni visuelle ni sonore. Il part comme pièce jointe du post.
            case .file:
                return nil
            }
        }
    }

    /// **B2 (#3925), devenue la COUCHE D'ÉCRITURE au #4124.**
    ///
    /// Ce que l'auteur écrit ici part comme `slide.content` (via
    /// `applyContentText`, le même canal que B1) et le reader l'affiche
    /// par-dessus le canvas composé — la légende `content` des viewers
    /// existants. C'est la surface d'ÉDITION, côté scène, du contenu que B1
    /// préserve entre les modes ; jamais un second champ.
    ///
    /// ## Trois formes en trois lots, et la troisième dit pourquoi
    ///
    /// Elle fut une **barre repliable à chevron** (#3925) : trois éléments de
    /// chrome pour dire ce que le lecteur verrait, et qui ne le montraient pas.
    /// Puis le **calque de lecture** (#4065), qui le montrait — mais depuis le
    /// bas de l'écran, en permanence. La scène étant désormais CENTRÉE et
    /// marginée (#4124), cette place permanente est précisément celle qu'il faut
    /// lui rendre.
    ///
    /// Elle devient donc une **couche**, ouverte par l'icône de la rangée haute.
    /// Le calque de lecture n'est pas abandonné : il est ce que la couche
    /// contient — même composant, mêmes mentions, même rendu par le renderer du
    /// lecteur.
    ///
    /// ## Le flou vient du MATÉRIAU, jamais d'un `.blur()`
    ///
    /// `.ultraThinMaterial` floute ce qui est derrière lui par composition, sans
    /// toucher à la vue floutée. Un `.blur(radius:)` sur l'atelier aurait
    /// re-rendu le canvas — `StoryCanvasUIView` reconstruit ses layers à chaque
    /// `layoutSubviews` — pour un effet que le système sait produire à coût nul.
    /// La hauteur que la couche laisse à l'en-tête. Le chrome de l'atelier est
    /// FLOTTANT — il ne prélève aucune hauteur —, donc cette réserve est ce qui
    /// le garde net. Même valeur que celle dont le canvas cardé se décale, pour
    /// que les deux bords tombent à la même ligne.
    /// 44 pt de cible + 32 pt d'air. Mesuré à l'écran : à 52 pt la rangée était
    /// coupée en deux par le bord du matériau — la réserve doit couvrir la
    /// CIBLE tactile entière, pas la seule pastille visible (36 pt).
    static let descriptionLayerHeaderClearance: CGFloat = 76

    /// **La zone de saisie de la description — en BAS, la scène au-dessus**
    /// (#4361, directive porteur 2026-08-30).
    ///
    /// > « L'icône description doit faire remonter et rétrécir la scène et
    /// > laisser une zone de saisie en bas plutôt que ce voile par-dessus toute
    /// > la scène. »
    ///
    /// Elle fut une COUCHE plein écran (#4124) : un `.ultraThinMaterial` sur
    /// toute la hauteur, la scène floutée derrière. Le geste était juste — la
    /// description ne doit pas occuper le bas en permanence — mais la réponse ne
    /// l'était pas : **écrire une description, c'est regarder la scène qu'on
    /// décrit.** Le voile la retirait au moment précis où elle sert.
    ///
    /// Ce qui remplace le voile n'est pas une invention : c'est le comportement
    /// que l'atelier a DÉJÀ quand une band ou une feuille s'ouvre — le canvas se
    /// rétracte au-dessus (`StoryCanvasFraming.Input.bottomInset`), il ne se
    /// fait pas recouvrir. La description rejoint cette mécanique par
    /// `storyComposerCanvasBottomReservation` plutôt que d'en inventer une
    /// seconde.
    ///
    /// **Le corps vit dans un TYPE NOMMÉ** (`ComposerSceneDescriptionEditor`),
    /// et ce n'est pas un rangement : monté en fermeture d'`.overlay` dans
    /// `body`, il plantait à l'ouverture — débordement de pile par profondeur de
    /// type SwiftUI. Le fichier du type porte la trace et la leçon.
    var sceneDescriptionEditor: some View {
        ComposerSceneDescriptionEditor(
            text: sceneDescriptionBinding,
            placeholder: String(localized: "composer.scene.description.placeholder",
                                defaultValue: "Ajoutez une description…", bundle: .main),
            plateauTint: tint.color,
            onDone: { editsSceneDescription = false },
            onHeightChange: { sceneDescriptionEditorHeight = $0 }
        )
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    /// **La description appartient à la SLIDE** (rappel porteur 2026-08-30,
    /// décision de #4125).
    ///
    /// > « cette description est propre à chaque slide »
    ///
    /// Elle lisait `documentText` — le texte de la PUBLICATION — et l'écrivait
    /// des deux côtés. L'écriture était déjà juste (`applyContentText` pose sur
    /// `currentSlide.content`) ; c'est la LECTURE qui mentait, et le défaut ne
    /// se voyait qu'à la deuxième slide : on y trouvait la description de la
    /// première, puis on écrasait la sienne en tapant.
    ///
    /// Le second écrivain part avec : mettre à jour `documentText` versait la
    /// description d'une slide dans le contenu du post, que le porteur a
    /// explicitement séparé — « le poste n'affiche que le `content`, pas les
    /// descriptions ». Ce que la loi 9 / B1 protégeait (un seul contenu,
    /// aller-retour scène ↔ document) valait tant que la description ÉTAIT le
    /// texte du post ; cette prémisse est révoquée, la loi la suit.
    var sceneDescriptionBinding: Binding<String> {
        Binding(
            get: { viewModel.currentSlide.content ?? "" },
            set: { viewModel.applyContentText($0) }
        )
    }
    // MARK: - Le mood

    /// La surface du mood (lot 4.4), montée par la MÊME règle que les deux
    /// autres. Le meuble lui remet des valeurs et récupère des événements ; il
    /// ne lui remet AUCUN chemin d'envoi.
    ///
    /// **Elle a une ISSUE depuis le lot 4.5.** Le chrome n'est plus cédé à
    /// l'atelier sous cette surface (`ComposerChromeOwnership.owner(for: .mood)`
    /// rend `.host`), donc le socle est peint et sa flèche remet un
    /// `ComposerDocumentDraft` à `onPublishDocument`. Le mood s'y compose ET s'y
    /// envoie — à la fermeture que le site de montage a fournie, jamais par un
    /// chemin que le meuble aurait fabriqué.
    ///
    /// **Et des auteurs l'atteignent depuis le lot 4.6.** `.moodChip` ne route
    /// plus vers son composer historique, et les quatre feuilles qui montaient
    /// `StatusComposerView` montent `MoodComposerDoor` — le rail Lentille, le
    /// tray classique, l'accès rapide de la queue de liste, le tray du fil, et
    /// les deux `onRepublish` des racines de fenêtre.
    ///
    /// `viaUsername` vient de la GRAINE, et il n'a de valeur que pour la
    /// republication (lot 4.7). Il n'est pas porté par un paramètre à défaut :
    /// `ComposerMoodSeed` est elle-même obligatoire dans l'`init`, si bien qu'un
    /// site de republication ne peut pas la perdre en silence.
    var moodSurface: some View {
        ComposerMoodSurface(
            emoji: $moodEmoji,
            text: $documentText,
            visibility: $composerVisibility,
            visibilityUserIds: $composerVisibilityUserIds,
            // `allowedAudiences:` vient APRÈS `visibilityUserIds:`, comme la
            // déclaration : Swift n'autorise aucun réordonnancement, et l'ordre
            // de cet `init` est déjà tenu par une garde côté meuble. Le ruban
            // REÇOIT son offre — il la décidait, et peignait alors les six
            // niveaux du SDK jusque sous une republication.
            allowedAudiences: offeredAudiences,
            references: $composerReferences,
            viaUsername: moodSeed?.viaUsername,
            onClose: onDismiss,
            // La flèche PUBLIER a quitté le socle pour l'en-tête de la surface
            // au 2026-08-28 (`ComposerChromeOwnership.headerPaintsPublish`).
            // `AnyView`, comme `formatFan:`/`overflowMenu:` de `ComposerTopBar` :
            // c'est le MEUBLE qui construit le bouton — la surface le reçoit
            // déjà fait, elle ne publie jamais elle-même.
            headerPublishButton: AnyView(moodHeaderPublishButton)
        )
    }

    /// Le plateau ne porte plus qu'UNE chose : l'éventail, le seul endroit du
    /// meuble où l'auteur choisit ce qu'il PUBLIE.
    ///
    /// **Il est monté par le `body`, une seule fois, sous `paintsFormatFan`**
    /// (lot 4.7). Il l'était par `composerSurface`, ce qui le réservait de fait
    /// à la scène : le chip « Post » d'une republication de mood n'existait
    /// alors sur aucun écran. Le descendre en bloc aurait livré le défaut
    /// symétrique sous `.feedComposer` — d'où la règle, et non un second
    /// montage.
    ///
    /// **Trois pictogrammes en sont partis le 2026-08-24** — caméra,
    /// diapositives, timeline. Ils n'étaient pas des `Button` : le tap ne
    /// faisait rien, et depuis que la porte de création monte le meuble ils
    /// étaient inertes EN PRODUCTION, sur la surface de création la plus
    /// utilisée. Loi 4 : une affordance non offerte est absente.
    ///
    /// Ils ne sont pas branchables d'ici. `addSlide()`, `isTimelineVisible` et
    /// l'écriture de `currentEffects` (`public internal(set)`) sont `internal`
    /// à `MeeshyUI` : le meuble peut LIRE la composition, pas la modifier.
    /// Fabriquer un chemin de secours app-side aurait doublé des commandes que
    /// l'atelier offre déjà et qui, elles, agissent — la bande de diapositives,
    /// le menu ⋯ → Timeline, le fournisseur de capture que ce host injecte.
    ///
    /// Condition de retour, à remplir côté SDK : un écrivain public de la
    /// composition atteignable par le meuble. Sans lui, un bouton ici ouvrirait
    /// une caméra dont la photo n'aurait nulle part où aller.
    var plateauTools: some View {
        HStack(spacing: 12) {
            Spacer()
            formatChip
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    /// **Le SITE UNIQUE du sélecteur de format.**
    ///
    /// Deux places le montent — la rangée du plateau (scène, mood) et la barre
    /// haute du document (#4047) — et elles sont EXCLUSIVES par la règle de
    /// placement, jamais par une condition écrite dans un `body`. Une seule
    /// CONSTRUCTION les sert toutes les deux : en écrire une par place aurait
    /// donné deux sélecteurs à faire diverger, et le compte d'occurrences que
    /// les gardes tiennent est là pour l'interdire.
    /// **Le premier plan est ADAPTATIF depuis #4124.** Il était
    /// `textSecondary(isDark: true)` — juste tant que le chip ne vivait que sur
    /// le plateau, sombre par construction. Descendu dans la rangée de
    /// l'atelier, il hérite de `canvasChromeScheme`, qui suit le FOND du canvas :
    /// sur une scène pastel, un premier plan clair s'efface.
    var formatChip: some View {
        ComposerFormatFan(
            offeredFormats: profile.offeredFormats,
            selection: formatSelection
        )
        .font(.footnote.weight(.semibold))
        .glassControlForeground()
    }

}
