import SwiftUI
import AVFoundation
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
            // **Les deux moitiés de l'audience d'un contenu REPRIS** (#5053).
            //
            // Elles étaient le troisième des trois manques que `ComposerIntent`
            // énumérait pour router `.repost` vers l'atelier nu : « il ne passe
            // ni `allowedVisibilities` ni `initialVisibilityUserIds` à
            // l'atelier, si bien que le plafond d'audience du repost (loi 10)
            // tomberait EN SILENCE ».
            //
            // Le mot est SILENCE : un plafond absent ne rougit pas, il offre
            // simplement une audience de plus, que l'auteur choisit et que le
            // serveur refuse ensuite — 403 `REPOST_AUDIENCE_WIDENING`, après
            // que la composition est faite.
            //
            // Les ids voyagent AVEC le plafond, jamais séparément : une
            // audience `ONLY` sans sa liste est une audience VIDE, et le repost
            // ne serait visible de personne sans que rien ne le dise.
            initialVisibilityUserIds: hydration?.initialVisibilityUserIds ?? [],
            allowedVisibilities: hydration?.allowedVisibilities,
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
        // L'onglet « Lieu » de la palette (#4579). Absent — jamais grisé —
        // quand l'autorisation de localisation est refusée : c'est l'injecteur
        // qui le décide, pas la feuille.
        .stickerNearbyPlacesProvided()
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
        // **Le volet de description, sous la scène de l'ATELIER** (#4742).
        //
        // Il est aussi monté par `ComposerSceneSurface` (la scène incrustée
        // d'un post). Deux surfaces, un seul volet : c'est la même propriété
        // qui les sert, et elles ne peuvent donc pas montrer deux descriptions
        // différentes du même texte.
        //
        // La leçon coûte d'être dite : ce volet a d'abord été monté SEULEMENT
        // dans `ComposerSceneSurface`, et il n'a jamais paru — une story se
        // compose dans l'ATELIER, que ce flux monte à la place. Un composant
        // écrit, câblé et invisible parce qu'il est posé sur la surface que
        // l'écran n'affiche pas.
        .storyComposerBelowCanvasAccessory {
            if let volet = sceneDescriptionPanel { volet }
        }
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
    /// **La bande de mention du texte de scène** (#4475).
    ///
    /// Trois conditions, et la troisième est celle qu'on oublie :
    /// 1. un texte est en cours d'édition — hors édition, il n'y a pas de
    ///    frappe à interpréter ;
    /// 2. une requête `@` est active ;
    /// 3. **des personnes correspondent** — sans quoi la bande de verre serait
    ///    peinte vide. « Aucun ami accepté » et « aucune correspondance » sont
    ///    des états NOMINAUX, pas des chargements en attente : ce champ n'a
    ///    aucun appel réseau qui remplirait la liste plus tard.
    ///
    /// **Le choix écrit dans l'OBJET, pas dans un champ de vue.** Le texte
    /// courant vient du modèle et y retourne par `updateTextContent` — le même
    /// site que la frappe. Un `@State` intermédiaire aurait fait diverger ce que
    /// le canvas affiche de ce que la publication emporte.
    var sceneMentionStrip: AnyView? {
        if let id = viewModel.textEditingMode.activeTextId,
           sceneMentionBox.controller.activeQuery != nil,
           !sceneMentionBox.controller.suggestions.isEmpty,
           let objet = viewModel.currentEffects.textObjects.first(where: { $0.id == id }) {
            // **`return` — sans lui, cette bande était CONSTRUITE puis JETÉE.**
            // La propriété rend `AnyView?` ; une expression nue dans un `if`
            // n'est pas la valeur de retour d'un accesseur à corps multiple, et
            // le `return nil` du bas gagnait TOUJOURS. La suggestion `@` du
            // texte de scène n'a donc jamais pu paraître, sur aucun chemin.
            //
            // Le compilateur le disait — « result of 'AnyView' initializer is
            // unused » — et un avertissement noyé dans un build vert ne se lit
            // pas. C'est la loi 4 dans sa forme la plus coûteuse : le contrôle
            // est écrit, testé de l'œil, et sans effet.
            return AnyView(
                ComposerMentionStrip(
                    controller: sceneMentionBox.controller,
                    currentText: objet.text,
                    onSelect: { remplace in
                        viewModel.updateTextContent(id: id, text: remplace)
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
            )
        }
        return nil
    }

    /// **Ce que chaque porte du rail PORTE DÉJÀ** (#4994).
    ///
    /// Le relevé est composé ICI parce que les deux magasins vivent ici : la
    /// `StorySlide` pour ce qui se VOIT sur la scène, l'état du meuble pour ce
    /// qui QUALIFIE la publication (le lieu, le fond, les personnes nommées).
    /// La règle, elle, ne connaît ni l'un ni l'autre — c'est ce qui la rend
    /// éprouvable sans monter une vue.
    var railDoorBadges: [ComposerRailDoor: Int] {
        ComposerRailDoorBadge.badges(
            for: ComposerRailDoor.canonicalRail,
            in: ComposerRailDoorBadge.matter(
                slide: viewModel.currentSlide,
                // **Le site UNIQUE, jamais une seconde dérivation** (#5007) :
                // `composerHashtags` est déjà `ComposerHashtags.tags(in:
                // documentText)`, et la feuille comme le sélecteur le lisent
                // sans le recalculer.
                hashtags: composerHashtags.count,
                description: sceneDescriptionBinding.wrappedValue,
                mentions: composerReferences.count,
                hasDocumentLocation: documentLocation != nil))
    }

    var sceneSurface: some View {
        ComposerSceneSurface(
            localMedia: headerTileMedia,
            selectedMediaURL: selectedSlideMediaURL,
            selectableMediaURLs: Set(slideIdByMediaURL.keys),
            format: selectedFormat,
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
                // **« Toucher le chips sur le canvas ouvre la vue de création
                // audio »** (directive porteur 2026-09-01, #4671) — le mot est
                // TOUCHER, donc le tap simple, pas le double-tap réservé aux
                // éditeurs dédiés. La sélection est posée d'abord : si le son
                // refuse de s'ouvrir (emprunté, ou fichier local inconnu), le
                // geste reste une sélection franche plutôt qu'un tap sans effet.
                if kind == .audio { editSceneSound(id) }
            },
            // **« Modifier » ouvre l'édition EN LIGNE du texte** (#4074, vue
            // `1d`). Le meuble câble déjà les trois entrées de cette édition
            // (`editingTextId`, `onInlineTextChanged`, `onInlineTextEditEnded`)
            // — il ne manquait que la porte qui y mène depuis l'appui long.
            //
            // Le `switch` est exhaustif pour que l'ajout d'un éditeur MÉDIA
            // (#4082) oblige à passer ici ET à élargir `editableSceneKinds` :
            // servir l'un sans l'autre rendrait « Modifier » offert et inerte
            // sur un média, exactement le défaut que ce lot ferme.
            onItemEdit: { id, kind in
                switch kind {
                case .text:
                    // **Le MÊME site que la création** (#4634) : `openObjectEditor`
                    // est la seule façon d'éditer un texte, quelle que soit la
                    // porte. Recopier ici les trois lignes qu'il contient était
                    // exactement ce qui faisait diverger les deux chemins.
                    openObjectEditor(id)
                    HapticFeedback.medium()
                case .audio:
                    // **Toucher une pastille audio ouvre « Création audio » SUR
                    // ce son** (#4671, directive porteur 2026-09-01). Le même
                    // écran que les deux autres surfaces qui portent un son :
                    // une seconde vue d'édition aurait divergé au premier
                    // réglage.
                    editSceneSound(id)
                case .media, .sticker, .place:
                    // **#4937 — l'éditeur d'objet sert les cinq familles.** Ces
                    // trois-là n'y ont pas encore de panneau d'options propre,
                    // mais elles y ont leur FENÊTRE et leur TIMELINE, ce qu'aucun
                    // autre écran n'offrait : leur `break` ne protégeait plus
                    // rien, il rendait le geste muet.
                    openObjectEditor(id)
                    HapticFeedback.medium()
                }
            },
            onBackgroundTapped: { handleSceneBackgroundTap() },
            onBackgroundLongPressed: { handleSceneCaptureLongPress() },
            // **La session est REMISE, jamais construite par la surface**
            // (#4080) : deux sessions concurrentes sur le même objectif rendent
            // un aperçu noir sans que rien n'échoue.
            cameraSession: sceneCameraStage == .off ? nil : sceneCamera.session,
            cameraStage: sceneCameraStage,
            cameraModes: ComposerSceneCamera.modes(for: selectedFormat),
            cameraMode: sceneCameraMode ?? .photo,
            onPickCameraMode: { sceneCameraMode = $0 },
            onCameraPress: { pressSceneShutter() },
            onCameraRelease: { releaseSceneShutter() },
            cameraFlash: sceneCameraFlash,
            onCycleCameraFlash: { sceneCameraFlash = ComposerCameraFlash.next(after: sceneCameraFlash) },
            onFlipCamera: { sceneCamera.switchCamera() },
            onDisarmCamera: { disarmSceneCamera() },
            cameraSegments: sceneSegments,
            onDropLastSegment: { dropLastSceneSegment() },
            onValidateSegments: { validateSceneSegments() },
            // Les portes que CE meuble sert — l'ensemble vit dans
            // `ComposerSceneCapabilities`, jamais en littéral ici : un `Set`
            // écrit dans un corps de vue ne s'interroge qu'à la garde de
            // source, et une garde de source sur un littéral passe au vert dès
            // qu'on réécrit la liste autrement.
            //
            // **`sticker` y est entrée le 2026-08-30.** Son absence était
            // motivée par « aucun chemin ne pose un objet de ce kind » — motif
            // faux : `addSticker(emoji:)` existe depuis C13 et
            // `StickerPickerView` depuis C8. Seul le niveau d'ACCÈS de la
            // primitive manquait, et un `internal` ressemble, vu d'ici, à une
            // règle produit.
            //
            // **`description` y entre le 2026-08-30**, et c'est ce qui rend le
            // retrait du champ permanent possible : la porte devient le SEUL
            // chemin vers la description, exactement comme l'icône de la rangée
            // le fait sous l'atelier. Elle était retenue parce que « rien ne
            // donne le focus au champ depuis l'extérieur » (#4065) — c'est le
            // meuble qui le fait désormais, en ouvrant sa zone basse.
            // **Le rail montre les portes, OU les contrôleurs de l'outil
            // ouvert** (directive porteur 2026-08-30). La résolution est une
            // règle pure : le meuble ne décide pas ici quel outil l'emporte,
            // il fournit l'état.
            railMode: ComposerRailMode.resolve(
                drawing: viewModel.isDrawingActive,
                textEditing: viewModel.textEditingMode.activeTextId != nil,
                expandedDrawingTool: viewModel.drawingEditingMode.expandedTool,
                expandedTextTool: viewModel.textEditingMode.expandedTool,
                doors: ComposerRailDoor.offered(
                    served: ComposerSceneCapabilities.doors,
                    format: selectedFormat,
                    allowsCapture: profile.allowsCapture
                )
            ),
            // **Ce que chaque porte PORTE DÉJÀ** (#4994). Le relevé est composé
            // ICI parce que les deux magasins vivent ici — la slide pour ce qui
            // se voit, l'état du meuble pour ce qui qualifie la publication.
            // La surface, elle, ne compte rien : elle relaie.
            railBadges: railDoorBadges,
            onRailDoor: { door in handleRailDoor(door) },
            onRailToolControl: { control in handleRailToolControl(control) },
            onRailExitTool: { handleRailExitTool() },
            // **Le COLLAGE** (#4092) — la cinquième entrée de la vue `3b`, et la
            // seule qui ne peut pas être une porte. `BlankCanvasPasteStarter`
            // lit `\.storyPaste` lui-même (le meuble l'injecte déjà) et
            // s'éteint quand le presse-papier n'a rien d'acceptable : c'est le
            // système qui tient la loi 4 ici, pas nous.
            railSystemEntry: AnyView(
                BlankCanvasPasteStarter(canAddMedia: viewModel.canAddMedia) { items in
                    handlePastedItems(items)
                }
                .labelStyle(.iconOnly)
                // `.capsule` et non `.circle` : celle-ci est iOS 17+, et le
                // plancher de l'app est iOS 16. Sur une cible de 44 pt, la
                // capsule EST un cercle.
                .buttonBorderShape(.capsule)
            ),
            // La maquette range COLLAGE entre STICKER et MENTION.
            railSystemEntryAfter: .sticker,
            // Les contrôleurs que CE meuble sert — même règle, même raison.
            //
            // **L'empilement y est entré le 2026-08-30.** Le commentaire qui
            // vivait ici l'attribuait à la `StoryCanvasUIView` « dont le meuble
            // n'a aucune référence » : `bringForward` / `sendBackward` vivent
            // en fait sur le MODÈLE (`StoryComposerViewModel+ZOrder`), et
            // persistent leur `zIndex` dans la slide — donc au reader et à la
            // publication, ce qu'un empilement de vue n'aurait jamais fait.
            trailingActions: ComposerTrailingRailPolicy.actions(
                slide: viewModel.currentSlide,
                selectedId: selectedSceneItemId,
                served: ComposerSceneCapabilities.controllers,
                hasEditor: false,
                canLeaveScene: selectedFormat != .story
            ),
            onTrailingAction: { action in handleTrailingRailAction(action) },
            // La frame `[+]` — elle agit sur la PUBLICATION, pas sur un objet,
            // d'où sa place tout en haut du rail et son séparateur.
            onAddSlide: { viewModel.addSlide(); HapticFeedback.light() },
            // **L'historique a quitté le socle** (#4586). La question posée est
            // la MÊME que celle que le socle posait — `ComposerHistoryService`
            // reste le juge unique de « cet écran sert-il l'historique ? » — et
            // seule la place change. `nil` quand il n'y a rien à défaire :
            // absent, jamais grisé.
            onUndo: composerServesHistory && viewModel.canUndoGlobal
                ? { performHistoryUndo() } : nil,
            onRedo: composerServesHistory && viewModel.canRedoGlobal
                ? { performHistoryRedo() } : nil,
            // **L'inspecteur de l'objet sélectionné** (#4073, vue `1c`). La
            // résolution par kind vit dans la RÈGLE, pas ici : le meuble ne
            // tient qu'un id, c'est la slide qui sait de quel type il est.
            objectChips: sceneObjectChips,
            // **Le jeton ENCADRÉ, et le geste qui l'encadre** (#4073). Le
            // contrat les portait depuis la livraison et AUCUN hôte ne les
            // remplissait : six capsules qui s'annonçaient `.isButton` à
            // VoiceOver, vibraient sous le doigt, et n'ouvraient rien. Suivre
            // une donnée jusqu'à son consommateur s'arrête un cran trop tôt —
            // il faut la suivre jusqu'au PIXEL, et demander ce que le doigt
            // OBTIENT.
            activeObjectChipId: ComposerObjectChips.activeChipId(
                chips: sceneObjectChips, openedBand: requestedSceneBand),
            onObjectChip: { id in handleObjectChip(id) },
            // **Ce que le canvas ENCADRE** (#4073). Le meuble tient déjà l'id
            // de l'objet sélectionné pour les jetons et pour le rail — le lui
            // faire descendre jusqu'au canvas est ce qui manquait pour que
            // « un seul objet à la fois » se VOIE.
            selectedItemId: selectedSceneItemId,
            selectionBadge: ComposerObjectChips.badge(forSelected: selectedSceneItemId,
                                                      in: viewModel.currentSlide),
            // **Les bandes SERVIES par ce meuble** (#4064) — même règle que les
            // deux rails, et pour la même raison : la capacité s'interroge,
            // un littéral ne s'interroge pas. Le POURQUOI de chaque absence
            // vit avec l'ensemble, dans `ComposerSceneCapabilities.bands`.
            // **`timeline` n'entre au jeu servi que quand elle a de quoi se
            // remplir** (#4082) : l'objet selectionne doit avoir une source a
            // rogner. Sinon la bande serait ouvrable sur du vide, ce que la
            // regle `opened(_:served:)` existe pour interdire.
            band: ComposerSceneBand.opened(requestedSceneBand,
                                           served: openableSceneBands),
            bandTimelineContent: composerTrimBand,
            bandTextStylesContent: composerTextStylesBand,
            bandColors: StoryBackgroundPalette.colors,
            onPickBandColor: { hex in
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
                // La bande se referme sur le choix : la couleur est visible sur
                // la scène juste au-dessus, donc la garder ouverte occuperait
                // l'espace pour montrer ce que l'écran montre déjà.
                requestedSceneBand = nil
            },
            bandOpeningEffect: viewModel.openingEffect,
            // **La bande NE se referme PAS sur un effet d'ouverture**, et c'est
            // la différence avec la couleur juste au-dessus : une couleur se
            // voit sur la scène dès qu'elle est posée, un effet d'ouverture ne
            // se joue qu'à la LECTURE. Refermer laisserait l'auteur sans aucun
            // retour sur ce qu'il vient de choisir ; la rangée reste ouverte,
            // avec sa puce sélectionnée pour tout témoin.
            onPickBandOpening: { effect in
                viewModel.openingEffect = effect
                HapticFeedback.light()
            },
            // **Les deux montages du dessin** (#4092) : la couche qui CAPTURE
            // le trait, et les contrôleurs qui règlent le pinceau. Les deux
            // flottent sur la scène, et ce sont ceux de l'ATELIER — pinceau
            // (stylo / marqueur / gomme), couleur, épaisseur, lissage,
            // annulation par trait. Une bande simplifiée écrite ici aurait
            // perdu quatre capacités que l'atelier a (leçon 336).
            // **Les OPTIONS de l'outil déplié**, sous la scène. Les bulles sont
            // au rail ; ce panneau porte ce qui a besoin de largeur — la
            // palette, la glissière, les dix-huit styles. `MeeshyToolOptionsPanel`
            // rend `EmptyView` quand rien n'est déplié, donc le montage est
            // inconditionnel et la loi 4 est tenue par la vue elle-même.
            toolOptions: AnyView(MeeshyToolOptionsPanel(viewModel: viewModel)),
            editingTextId: viewModel.textEditingMode.activeTextId,
            onInlineTextChanged: { id, texte in
                viewModel.updateTextContent(id: id, text: texte)
                // La frappe nourrit la requête `@` — même contrat que le champ
                // de description et celui du document, sur le troisième champ
                // de saisie du composer (#4475).
                sceneMentionBox.controller.handleQuery(in: texte)
            },
            // Le canvas dit que la saisie est finie ; c'est le MODÈLE qui décide
            // ce qu'il advient d'une coquille vide — il la supprime.
            //
            // **Sauf quand l'éditeur PLEIN ÉCRAN est monté** (#4634, défaut
            // mesuré au simulateur le 2026-09-01). Présenter un
            // `fullScreenCover` fait perdre le premier répondant au canvas de
            // CETTE surface, qui annonce donc une fin de saisie qu'aucun doigt
            // n'a demandée — et `exitTextEditingMode` supprime alors la coquille
            // encore vide que la porte TEXTE vient de poser. L'éditeur
            // s'ouvrait sur un objet DÉJÀ détruit : aucune section, aucun
            // clavier, et « Terminé » ne rendait rien.
            //
            // > Un événement de PRÉSENTATION ressemble, au bout du câble, à un
            // > geste de l'utilisateur. La garde ne porte donc pas sur ce que
            // > l'événement DIT, mais sur qui possède l'édition à cet instant :
            // > tant que l'écran plein est monté, c'est lui, et la surface du
            // > dessous n'a pas à conclure quoi que ce soit.
            onInlineTextEditEnded: { _ in
                guard editedObject == nil else { return }
                viewModel.exitTextEditingMode()
            },
            // **La bande n'existe que pendant l'édition ET avec des personnes à
            // proposer.** Gater sur la seule requête peindrait une bande de
            // verre vide quand aucun ami accepté ne correspond — un état
            // NOMINAL, pas une erreur.
            mentionStrip: sceneMentionStrip,
            descriptionPanel: sceneDescriptionPanel,
            // `nil` hors mode dessin, et c'est ce `nil` qui gouverne TOUT le
            // reste : le canvas garde son calque persisté, il continue de
            // recevoir les touches, et aucune surface ne se pose dessus.
            drawingSurface: viewModel.isDrawingActive
                ? AnyView(MeeshyDrawingSurface(viewModel: viewModel))
                : nil,
            // **#4918 — le son de fond laisse enfin une trace sur la SCÈNE.**
            //
            // La valeur est celle que la surface document sert depuis #4657 :
            // même résolveur, même loi, même capsule. Elle n'avait qu'un
            // consommateur, et la surface qu'une STORY monte n'était pas lui —
            // un fond posé sur une story jouait donc sans que rien ne le dise.
            //
            // Il ne manquait ni composant, ni modèle, ni règle : seulement ce
            // câblage. C'est le motif que le composer répète — une feature
            // « absente » y est presque toujours une feature non branchée.
            backgroundSound: avatarBadgeSound,
            onEditBackgroundSound: editBackgroundSoundAction,
            onDeleteBackgroundSound: deleteBackgroundSoundAction,
            onPromoteBackgroundSound: promoteBackgroundSoundAction,
            // **Le pied lit les MÊMES magasins que le reste du meuble** (#5002).
            //
            // `composerHashtags` — pas `ComposerHashtags.tags(in: documentText)`.
            // La dérivation a DÉJÀ son site unique
            // (`MeeshyComposerHost+Audience.swift`), que la feuille et le
            // sélecteur lisent sans le recalculer, et `ComposerAudienceAndHashtagTests`
            // le compte. J'ai écrit la seconde dérivation en commentant, douze
            // lignes plus haut dans la surface, que « les dériver ici ouvrirait
            // un second chemin vers le même fait » — la règle était juste et je
            // l'ai enfreinte dans le même lot, du côté où je ne la relisais pas.
            sceneHashtags: composerHashtags,
            sceneReferences: composerReferences,
            // **La MÊME porte que le rail**, pas un second chemin : toucher une
            // balise au pied ouvre exactement ce que la porte `#` ouvre. Un
            // pied qui présenterait sa propre feuille en ferait deux à tenir
            // d'accord — et la première divergence serait invisible.
            onOpenHashtags: { handleRailDoor(.hashtag) },
            onOpenMentions: { handleRailDoor(.mention) },
            description: $documentText,
            descriptionPlaceholder: ComposerDocumentCopy.placeholder
        )
        // **La prise se POSE par le chemin de la feuille, jamais par un second**
        // (#4080). `ingestCameraCapture` est ce que `documentCameraSheet`
        // appelle depuis toujours : il route le MIME, applique
        // `ComposerMediaPlacement.role` — « pas de fond ⇒ il devient le fond,
        // sinon un objet de premier plan », mot pour mot la planche `2b` — et
        // pousse la montée. Un second chemin d'entrée diverge au premier format
        // ajouté, et personne ne le verrait avant que l'un des deux ne pose au
        // mauvais plan.
        //
        // Les deux signaux sont des IDENTIFIANTS, pas les valeurs : une seconde
        // photo identique à la première ne changerait pas `capturedPhoto`, et
        // `onReceive` ne se réveillerait pas. C'est la même paire que la feuille
        // écoute, pour la même raison.
        .onReceive(sceneCamera.$capturedPhotoId) { id in
            guard id != nil, sceneCameraStage != .off,
                  let image = sceneCamera.capturedPhoto else { return }
            poseSceneCapture(.photo(image))
        }
        // **Une vidéo s'ACCUMULE, une photo se POSE** (#4099). C'est la seule
        // divergence avec la feuille, et elle est la vue `4b` tout entière :
        // « relâcher pour clore le segment · ✓ pour poser dans la scène ».
        .onReceive(sceneCamera.$capturedVideoId) { id in
            guard id != nil, sceneCameraStage != .off,
                  let url = sceneCamera.capturedVideoURL else { return }
            collectSceneSegment(url)
        }
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
            localMedia: headerTileMedia,
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
            // **Le MÊME prédicat que la vue montée** (#4513) — `sceneIsPresent`,
            // jamais `documentHasScene` en direct. Les deux répondaient à la
            // même question et divergeaient sur une story vide : la vue disait
            // « il y a une scène », cette branche disait « non », et l'écran
            // n'en montrait aucune.
            showsScene: sceneIsPresent,
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
            onSceneBackgroundLongPressed: { handleSceneCaptureLongPress() },
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
            // #4657 — la rangée de l'avatar montre le son de fond : la note,
            // l'onde et la durée à côté du visage, et le texte descend.
            // **Ce qu'elle a le DROIT de montrer est une loi** (#4670), pas la
            // propriété du site qui écrit : la place dit le FOND, et un son de
            // contenu n'y paraît jamais.
            backgroundSound: avatarBadgeSound,
            // #4668 — et le toucher l'OUVRE, comme la carte du son de contenu.
            onEditBackgroundSound: editBackgroundSoundAction,
            onDeleteBackgroundSound: deleteBackgroundSoundAction,
            // Directive porteur 2026-09-01 — un son de CONTENU se joue sous la
            // zone de texte, transcription défilante, et se rouvre au toucher.
            onEditForegroundSound: { son in editForegroundSound(son) },
            onDeleteForegroundSound: { son in deleteForegroundSound(son) },
            foregroundSounds: foregroundSounds,
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
        CameraView(initialMode: pendingCameraMode) { result in
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
    /// **Ce que la rangée haute montre — les FONDS, et rien d'autre** (#4724).
    ///
    /// > Directive porteur 2026-09-01 : « le comportement actuel qui fait que
    /// > lorsqu'on ajoute n'importe quel média ça vient [dans] la trail des
    /// > slides doit être supprimé ! »
    ///
    /// Les deux barres hautes recevaient `documentLocalMedia` — la liste
    /// ENTIÈRE. Une tuile paraissait donc pour tout ce qui entre : une image
    /// posée SUR la scène, un vocal qui a déjà sa carte sous le texte, un PDF
    /// qui n'est aucune page. Le carrousel grossissait sans qu'on ait ajouté de
    /// page, et taper la tuile ne menait nulle part — l'hôte ne sait naviguer
    /// que vers une slide, et ces médias n'en fondaient aucune.
    ///
    /// La règle lit l'index des FONDATIONS, jamais une seconde vérité :
    /// `slideIdByMediaURL` dit déjà « ce média a fondé cette slide », ce qui est
    /// exactement l'ensemble des fonds.
    var headerTileMedia: [ComposerDocumentMedia] {
        ComposerHeaderTiles.tiles(documentLocalMedia, founding: slideIdByMediaURL)
    }

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
    /// **Le volet de description servi à la surface** (#4742).
    ///
    /// Il LIT ; la saisie reste l'affaire de `sceneDescriptionEditor`, qui
    /// monte au-dessus du clavier. Deux champs pour un même texte auraient
    /// divergé au premier réglage — ici il n'y en a qu'un, et le volet ouvre
    /// celui-là.
    ///
    /// Pendant la SAISIE le volet s'efface : l'éditeur affiche déjà le texte,
    /// et le laisser derrière montrerait la description en double.
    var sceneDescriptionPanel: AnyView? {
        guard !editsSceneDescription else { return nil }
        return AnyView(
            ComposerSceneDescriptionPanel(
                text: sceneDescriptionBinding.wrappedValue,
                placeholder: String(localized: "composer.description.placeholder",
                                    defaultValue: "Ajouter une description",
                                    bundle: .main),
                isCollapsed: $sceneDescriptionCollapsed,
                onEdit: {
                    // Ouvrir la saisie DÉPLIE : écrire dans un volet rangé
                    // laisserait l'auteur taper sans voir ce qu'il écrit.
                    sceneDescriptionCollapsed = false
                    editsSceneDescription = true
                }
            )
        )
    }

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
    /// **Le champ écrit ce que son RÔLE désigne** (#4890) — et le rôle vient du
    /// FORMAT, jamais de ce site.
    ///
    /// `docs/product/meeshy-composer-modele.md` § 3 : en Story et en Réel le
    /// texte de la slide EST le contenu de la publication ; en Post c'est la
    /// **légende du média** de cette slide, et le `content` du post a son propre
    /// logement. Le document nommait déjà ce champ comme le site fautif —
    /// « juste en S/R et faux en P » — pendant que le code écrivait
    /// `currentSlide.content` dans les deux cas.
    ///
    /// > **Un nom qui vaut pour deux rôles ne fait pas rougir quand on sert le
    /// > mauvais.** C'est pourquoi la décision n'est plus prise ici sous le mot
    /// > « description » : `ComposerSlideTextRole` la porte, une fois.
    var sceneDescriptionBinding: Binding<String> {
        Binding(
            get: {
                switch ComposerSlideTextRole.role(for: selectedFormat) {
                case .content:
                    return viewModel.currentSlide.content ?? ""
                case .caption:
                    // Sans média sur la slide courante, il n'y a pas de légende
                    // à lire — et surtout aucune raison de retomber sur le
                    // contenu, qui appartient au post et non à ce média.
                    guard let media = selectedSlideMediaURL else { return "" }
                    return documentMediaCaptions[media] ?? ""
                }
            },
            set: { texte in
                switch ComposerSlideTextRole.role(for: selectedFormat) {
                case .content:
                    viewModel.applyContentText(texte)
                case .caption:
                    ComposerSlideTextRole.applyCaption(texte,
                                                       to: selectedSlideMediaURL,
                                                       in: &documentMediaCaptions)
                }
            }
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
            // **Les QUATRE formats restent au menu** (#4030) : ceux que la
            // composition ne permet pas encore s'y montrent éteints avec leur
            // raison, au lieu de disparaître. Mesuré au simulateur le
            // 2026-08-30 : depuis l'entrée Post, l'éventail n'offrait que Post
            // et Story — la bascule vers Réel et Mood semblait ne pas exister.
            candidateFormats: ComposerFormat.allComposable,
            // **La cause du refus, pas seulement le refus** (#4858). Les MÊMES
            // deux faits que `moodGate` juge — un média ingéré, une scène — de
            // sorte que la phrase servie ne peut pas contredire le verdict qui
            // l'a produite. Les lire ici plutôt que de les recalculer dans
            // l'éventail est ce qui garde les deux d'accord.
            carriesMoreThanText: !documentLocalMedia.isEmpty || documentHasScene,
            selection: formatSelection
        )
        .font(.footnote.weight(.semibold))
        .glassControlForeground()
    }


    // MARK: - La bande de ROGNAGE (#4082)

    /// L'objet sélectionné, quand il a une source à rogner — `nil` sinon.
    ///
    /// C'est ce `nil` qui tient la loi 4 des deux côtés : il retire `.timeline`
    /// du jeu servi, donc la bande n'est pas ouvrable, ET il laisse
    /// `composerTrimBand` à `nil`, donc elle n'aurait rien à montrer si elle
    /// l'était. Une seule question posée une fois, deux conséquences.
    /// L'unique lecture du juge de l'historique. Le socle posait la même
    /// question à deux endroits ; le rail la pose une fois.
    var composerServesHistory: Bool {
        ComposerHistoryService.servesHistory(on: mountedComposerView)
    }

    /// **Les jetons de l'objet sélectionné — un site unique.** Trois
    /// consommateurs les lisent (la rangée, le jeton encadré, le geste), et
    /// trois résolutions du même jeu peuvent diverger.
    var sceneObjectChips: [ComposerObjectChips.Chip] {
        ComposerObjectChips.chips(forSelected: selectedSceneItemId,
                                  in: viewModel.currentSlide,
                                  openableBands: openableSceneBands)
    }

    /// **Les bandes qu'on peut OUVRIR à cet instant** — un site unique.
    ///
    /// Elle servait deux consommateurs par deux appels séparés : la bande
    /// elle-même, et les jetons de l'inspecteur qui doivent savoir si leur
    /// destination mène quelque part. Deux calculs du même jeu peuvent
    /// diverger, et le jour où ils divergent le jeton s'illumine sur une bande
    /// que `opened` refuse — un contrôle inerte qui a l'air vivant, c'est-à-dire
    /// exactement le défaut que ce câblage vient de fermer.
    var openableSceneBands: Set<ComposerSceneBand> {
        ComposerSceneCapabilities.bands(canTrimSelection: trimmableSelection != nil,
                                        canStyleSelection: styleableSelection != nil)
    }

}
