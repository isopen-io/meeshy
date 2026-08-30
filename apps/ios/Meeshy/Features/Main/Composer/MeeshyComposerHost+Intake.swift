import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Ce qui fait ENTRER de la matière** — le `⋯`, les portes des deux rails,
// les feuilles d'ingestion et les relais qui aiguillent ce qu'elles rendent.
// Extrait de `MeeshyComposerHost.swift` au #4102.

extension MeeshyComposerHost {

    /// **B3 (#3926) — le report du contenu vers la scène, en UN seul endroit.**
    ///
    /// Quand la surface montée devient la SCÈNE — que ce soit par l'éventail
    /// (STORY/RÉEL) ou par une couleur de fond (F2) —, le contenu déjà composé
    /// doit suivre (loi 9). Ce report vivait dans la closure du bouton du
    /// sélecteur de destination (F1) ; l'éventail ayant remplacé ce sélecteur,
    /// il n'y a plus de bouton où l'accrocher. Il devient donc une propriété de
    /// « la scène vient d'être montée », branchée sur `mountedSurface` dans le
    /// `body` — un site UNIQUE, quel que soit le contrôle qui a déclenché la
    /// bascule, et qui ne peut plus diverger d'un chip à l'autre.
    ///
    /// Idempotent par construction : `applyContentText` ne dirty pas une slide
    /// dont le contenu ne change pas, et `applyContentMedia` mémorise les
    /// sources déjà portées — refaire le report à chaque entrée en scène ne
    /// duplique rien.
    /// **En Post, chaque média posé devient SA slide (modèle § 3, #4038).**
    ///
    /// Le modèle dit qu'en profil Post une slide EST un média du post — c'est ce
    /// qui distingue un CARROUSEL (N slides d'un média) d'une SCÈNE COMPOSÉE
    /// (une slide, un fond et des premiers plans). Story et Réel ne passent donc
    /// pas ici : leur report reste `carryContentIntoSceneIfNeeded`, qui pose tout
    /// sur la slide courante — en Réel il n'y a qu'une slide (le réel EST la
    /// scène), en Story l'auteur compose sur celle qu'il regarde.
    ///
    /// **La première slide est RÉEMPLOYÉE, jamais doublée** : un composer neuf
    /// naît avec une slide vierge (`slides = [StorySlide()]`), et lui en ajouter
    /// une pour le premier média aurait laissé un carrousel dont la première vue
    /// est vide.
    ///
    /// Le retrait suit le même index : un média retiré de la bande retire SA
    /// slide. `removeSlide` refuse de descendre sous une slide — retirer le
    /// dernier média laisse donc une slide vierge, ce qui est exactement l'état
    /// d'un post sans média.
    func syncPostMediaIntoSlides() {
        guard selectedFormat == .post else { return }

        // **Le SON ne fait pas de slide (#4052).** Il se pose sur la scène
        // COURANTE comme bande-son — pas une page du carrousel. Traité AVANT la
        // boucle des visuels : il n'entre jamais dans `slideIdByMediaURL`, dont
        // l'invariant est « une entrée = une slide », et l'y mettre ferait
        // supprimer une slide au retrait du vocal.
        viewModel.applyContentAudio(documentContentMedia.filter { $0.kind == .audio })

        for media in documentContentMedia where media.kind != .audio
            && slideIdByMediaURL[media.sourceURL] == nil {
            let target: String
            if slideIdByMediaURL.isEmpty,
               (viewModel.currentSlide.effects.mediaObjects ?? []).isEmpty {
                target = viewModel.currentSlide.id
            } else {
                viewModel.addSlide()
                target = viewModel.currentSlide.id
            }
            viewModel.applyContentMedia([media], intoSlideId: target)
            slideIdByMediaURL[media.sourceURL] = target
        }

        let present = Set(documentContentMedia.filter { $0.kind != .audio }.map(\.sourceURL))
        for (url, slideId) in slideIdByMediaURL where !present.contains(url) {
            if let index = viewModel.slides.firstIndex(where: { $0.id == slideId }) {
                viewModel.removeSlide(at: index)
            }
            slideIdByMediaURL.removeValue(forKey: url)
        }
    }

    /// Les entrées du `⋯`, lues à UN endroit. La règle est PURE
    /// (`ComposerOverflowPolicy`) et se lit ici ; le `body` ne fait que
    /// consommer, et ne peut donc pas en écrire une seconde version.
    var documentOverflowEntries: [ComposerOverflowEntry] {
        ComposerOverflowPolicy.entries(
            hasBackground: documentBackground != nil,
            hasMedia: !documentLocalMedia.isEmpty,
            hasText: !documentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            hasLocation: documentLocation != nil,
            backgroundPickerIsReachable: backgroundPaletteIsReachable
        )
    }

    /// **La palette a-t-elle DÉJÀ un chemin à l'écran ?** (#4064)
    ///
    /// Sur la surface DOCUMENT, oui : l'icône de fond de la rangée d'outils la
    /// déplie. Sur la surface de SCÈNE, non — cette rangée n'y existe plus (le
    /// chrome est passé aux deux rails) et le rail *leading* ne porte que des
    /// portes qui font entrer un `MeeshyObject` ; une COULEUR n'en est pas un.
    /// Le `⋯` est alors le seul chemin restant, et la règle le lui accorde.
    ///
    /// La question se pose au MEUBLE parce que c'est lui qui monte les vues ;
    /// `ComposerOverflowPolicy`, elle, ne reçoit qu'un FAIT — pas un nom de
    /// surface, qu'elle n'aurait aucun moyen d'éprouver.
    var backgroundPaletteIsReachable: Bool {
        ComposerMountedView.mounted(surface: mountedSurface,
                                    hasScene: documentHasScene) != .scene
    }

    /// **Le `⋯` de la barre haute (#4047).** Il ne peint QUE les entrées que la
    /// règle sert — une entrée absente, jamais grisée.
    ///
    /// Le verre est le même que celui du `✕` et du chip de format, et pour la
    /// même raison qu'eux le premier plan reste `textPrimary(isDark: true)` :
    /// `glassControlForeground()` rendrait `indigo950` en thème clair, sur un
    /// plateau qui est sombre en permanence.
    var overflowMenu: some View {
        Menu {
            ForEach(Array(documentOverflowEntries.enumerated()), id: \.offset) { entry in
                let item = entry.element
                Button(role: item == .clearAll ? .destructive : nil) {
                    perform(item)
                } label: {
                    Label(ComposerOverflowCopy.label(item),
                          systemImage: ComposerOverflowCopy.icon(item))
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: ComposerControlMetrics.visualDiameter,
                       height: ComposerControlMetrics.visualDiameter)
                .adaptiveGlass(in: Circle())
        }
        .accessibilityLabel(Text(ComposerOverflowCopy.menu))
    }

    /// **Ce que chaque entrée FAIT.** Séparé de ce qui les OFFRE : la règle dit
    /// lesquelles servir, cette fonction ce qu'elles emportent — et les deux se
    /// lisent sans monter une vue.
    func perform(_ entry: ComposerOverflowEntry) {
        switch entry {
        case .pickBackground:
            // Bascule : le même geste ouvre et referme la bande. « Ouvrir »
            // sans « refermer » rendrait les ≈ 170 pt à sens unique.
            requestedSceneBand = requestedSceneBand == .palette ? nil : .palette

        case .removeBackground:
            // L'INTENTION de l'auteur est `documentBackground` : c'est elle qui
            // fait naître la scène (`documentHasScene`). Le canvas, lui, garde
            // toujours une couleur — `background` n'est pas optionnel dans
            // `StoryEffects`, et y poser du vide donnerait un canvas NOIR.
            documentBackground = nil
            viewModel.clearBackground()

        case .clearAll:
            // **`viewModel.reset()` d'ABORD, l'état du meuble ensuite.** Le
            // reset vide `carriedContentSources`, le cache d'idempotence
            // d'`applyContentMedia` ; sans lui, re-choisir la MÊME photo après
            // un effacement serait silencieusement sauté et n'atteindrait
            // jamais la scène.
            viewModel.reset()
            documentText = ""
            documentLocalMedia = []
            documentBackground = nil
            documentLocation = nil
            documentDiscoverability.reset()
            documentTranscription = nil
            // La carte média→slide est un INDEX du meuble : la laisser pleine
            // ferait retirer, au prochain sync, des slides qui n'existent plus.
            slideIdByMediaURL = [:]
            selectedSceneItemKind = nil
        }
    }

    /// **Quel média le rail doit CERCLER (#4047).**
    ///
    /// L'index `slideIdByMediaURL` est lu à l'ENVERS : il relie une URL à une
    /// slide, on cherche l'URL dont la slide est la courante. Passer par lui
    /// plutôt que par l'ordre des tableaux est ce qui tient quand un média est
    /// retiré au milieu — l'ordre ment alors, l'index non.
    ///
    /// `nil` quand rien ne correspond : un document sans média, une slide qui
    /// n'est celle d'aucun média (le cas du fond de COULEUR seul). Aucun anneau
    /// est la bonne réponse dans les deux cas — jamais un anneau par défaut sur
    /// la première vignette, qui affirmerait une position fausse.
    var selectedSlideMediaURL: URL? {
        let current = viewModel.currentSlide.id
        return slideIdByMediaURL.first(where: { $0.value == current })?.key
    }

    /// La scène est peinte dès qu'il y a QUELQUE CHOSE à peindre — un fond
    /// choisi, ou au moins un média devenu slide. La lier au seul
    /// `documentBackground` (Phase 2) la réservait aux fonds de COULEUR, donc
    /// laissait un post de photos sans aucune scène.
    var documentHasScene: Bool {
        documentBackground != nil || !slideIdByMediaURL.isEmpty
    }

    func carryContentIntoSceneIfNeeded() {
        // E1 — la scène prend la langue DÉCLARÉE au composer comme défaut de
        // tout objet posé.
        viewModel.declaredContentLanguage = documentLanguage
        // B1 — le texte ET le média déjà composés SUIVENT dans la scène.
        viewModel.applyContentText(documentText)
        viewModel.applyContentMedia(documentContentMedia)
    }

    /// **Le sélecteur de lieu (T2.5)**, monté ICI plutôt que dans
    /// `ComposerDocumentSurface` — même patron que `documentCameraSheet` juste
    /// au-dessus : le picker est le même composant que le composer inline du
    /// fil (`FeedView+Attachments.handleFeedLocationSelection`), qui se
    /// referme lui-même (`LocationPickerView.dismiss()`) après `onSelect`.
    ///
    /// **Un lieu choisi recalcule le second opt-in DEPUIS LA MÉMOIRE**, jamais
    /// depuis l'état courant : `FeedNearbyDiscoverability.choiceForNewPlace()`
    /// lit `LocationSharingPreferencesStore` à cet instant précis, exactement
    /// ce que fait le composer inline sur le même geste — un second lieu choisi
    /// dans la même session doit repartir du dernier palier RETENU, pas d'un
    /// toggle resté ouvert pour le lieu précédent.
    var documentLocationPickerSheet: some View {
        LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
            documentLocation = place
            documentDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
    }

    /// **Le sixième outil (T2.6)**, dernier de la rangée — même composant que
    /// le composer inline du fil monte déjà (`AudioPostComposerView`,
    /// `FeedView+Attachments.swift`) : en fabriquer un second aurait donné
    /// deux feuilles d'enregistrement/transcription à faire diverger,
    /// exactement le défaut que `PublishIntent` existe pour fermer.
    ///
    /// **La destination est double, et c'est le cœur du lot.** L'enregistrement
    /// rejoint `documentLocalMedia` comme un `ComposerDocumentMedia` ORDINAIRE
    /// — il part par la file durable, comme tout média local (T2.3). La
    /// transcription voyage À CÔTÉ dans `documentTranscription`, jamais fondue
    /// dans le texte : `documentDraft` la transmet telle quelle à
    /// `ComposerDocumentDraft.document(mobileTranscription:)`, que la porte
    /// poste à `PublishIntent.document(transcription:)`.
    ///
    /// **La capsule de langue est SEMÉE, jamais imposée.** Poser
    /// `documentLanguage = transcription.language` au retour rend le contrôle
    /// RÉEL (loi 4) et évite qu'une voix parte étiquetée par la langue de
    /// démarrage du meuble — mais ce n'est qu'un confort d'affichage : la
    /// garantie qui compte est le `??` de `PublishIntent.document`, qui élit
    /// la langue PARLÉE même si l'auteur rouvre la capsule et la change après
    /// coup.
    ///
    /// **Un son EMPRUNTÉ à la bibliothèque est hors du périmètre de ce lot.**
    /// `AudioPostComposerView.onPublishBorrowed` référence un `soundId` déjà
    /// côté serveur, sans fichier LOCAL ni transcription — une matière que
    /// `ComposerDocumentDraft` ne modélise pas ici. Fermer la feuille sans
    /// effet est le choix assumé, plutôt qu'un second chemin d'envoi pour un
    /// cas que la rangée du document n'offre nulle part ailleurs.
    var documentAudioComposerSheet: some View {
        AudioPostComposerView(
            onPublish: { audioURL, mimeType, durationMs, transcription in
                documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                    url: audioURL,
                    declaredMimeType: mimeType,
                    durationMs: durationMs
                ))
                documentTranscription = transcription
                if let transcription {
                    documentLanguage = transcription.language
                }
                showsAudioComposer = false
                HapticFeedback.light()
            },
            onPublishBorrowed: { _ in
                showsAudioComposer = false
            }
        )
    }

    /// **Le SECOND opt-in n'est offert que sous la MÊME garde que le composer
    /// inline** — `FeedNearbyDiscoverability.offers(hasPlace:visibility:)`,
    /// APPELÉE et jamais recopiée (`hasPlace && visibility == .public`) : une
    /// condition réécrite ici diverge de l'originale au premier ajustement de
    /// l'une des deux, exactement le défaut que ce type existe pour fermer.
    var documentOffersNearbyDiscoverability: Bool {
        FeedNearbyDiscoverability.offers(
            hasPlace: documentLocation != nil,
            visibility: composerVisibility
        )
    }

    /// **La capsule de langue (T2.2)** — le septième contrôle que la feuille
    /// historique porte dans la même barre que les six outils d'attache
    /// (`FeedComposerSheet`, `composerLanguage`), et que la porte du document
    /// n'avait ni en champ, ni en contrôle, ni en canal sur
    /// `ComposerDocumentDraft` avant ce lot.
    ///
    /// Même capsule, même sélecteur que la feuille : `ComposerLanguageFlag` et
    /// `AudioLanguagePickerView` tournent déjà en production, et en fabriquer
    /// une seconde paire ici donnerait deux listes de langues et deux mémoires
    /// à faire diverger.
    /// Le nom LOCALISÉ de la langue déclarée, pour VoiceOver — un emoji drapeau
    /// ne se lit pas utilement (contrat de `ComposerLanguageFlag`). Miroir de
    /// `composerLanguageDisplayName` de la feuille.
    var documentLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: documentLanguage) ?? documentLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    var documentLanguageCapsule: some View {
        Button {
            showsDocumentLanguagePicker = true
            HapticFeedback.light()
        } label: {
            Text(ComposerLanguageFlag.label(for: documentLanguage))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(MeeshyColors.indigo400.opacity(0.15))
                        .overlay(
                            Capsule()
                                .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 1)
                        )
                )
        }
        .accessibilityLabel(Text(ComposerDocumentCopy.language))
        .accessibilityValue(documentLanguageDisplayName)
        // Même correctif que l'ancienne tuile de lieu (#4034, retirée) :
        // `.padding(16)` datait
        // de l'ancien `.overlay(alignment: .bottomTrailing)` et doublait la
        // marge une fois la capsule devenue enfant du `HStack` de `toolRow`
        // — cause du débordement horizontal mesuré au simulateur.
    }

    /// Le sélecteur du dépôt, monté tel quel — même raison que
    /// `emojiPickerSheet` deux zones plus haut : `AudioLanguagePickerView`
    /// tourne déjà en production sous la feuille historique, avec ses
    /// catégories, sa recherche et son bouton « afficher toutes les langues ».
    /// En fabriquer un second ici serait deux listes de langues à faire
    /// diverger.
    var documentLanguagePickerSheet: some View {
        AudioLanguagePickerView(
            selectedLocale: Binding(
                get: { Locale(identifier: documentLanguage) },
                set: { newLocale in
                    documentLanguage = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                }
            ),
            title: "Langue du post"
        )
    }

    /// Ce que le meuble sert — une PROJECTION de la règle, jamais une liste
    /// écrite ici. Le jour où un outil gagnera sa destination, il suffira de lui
    /// donner un `effect` : une énumération recopiée ici aurait exigé de penser
    /// aux DEUX endroits, et le second est celui qu'on oublie.
    var servedDocumentTools: [ComposerDocumentTool] { ComposerDocumentTool.servedRow }

    /// Le rappel de la rangée, aiguillé sur l'EFFET et non sur l'outil.
    ///
    /// Aiguiller sur l'outil aurait rouvert exactement ce que `effect` referme :
    /// des branches muettes pour les outils que la rangée ne sert pas, et la
    /// dérive silencieuse le jour où l'une d'elles cesserait de correspondre à
    /// ce que la rangée sert. Ici, `nil` est le seul cas inatteignable, et il
    /// l'est par construction — un outil sans effet n'arrive jamais à l'écran.
    ///
    /// **`.attachesLocalMedia` porte UNE valeur associée (T2.3)**, jamais trois
    /// cas distincts sur `tool.effect` — `.photoLibrary`/`.camera`/`.files`
    /// restent une question posée au SÉLECTEUR à ouvrir
    /// (`presentMediaIntake`), jamais une seconde question posée à l'outil.
    /// Une porte du rail délègue au chemin d'ingestion EXISTANT — le rail est
    /// une autre GÉOGRAPHIE, pas un second pipeline. Y écrire un chemin neuf
    /// ferait diverger la porte de la rangée qui fait déjà la même chose.
    func handleRailDoor(_ door: ComposerRailDoor) {
        switch door {
        case .media:   presentMediaSources()
        case .sound:   presentSoundSources()
        case .mention: handleDocumentTool(.mention)
        case .place:   handleDocumentTool(.place)
        case .description:
            // La SEULE façon d'ouvrir la description sur la scène incrustée
            // depuis le 2026-08-30 : le champ permanent qui l'affichait dès
            // qu'un texte existait a été retiré sur directive porteur.
            HapticFeedback.light()
            editsSceneDescription = true
        case .drawing:
            // **Une porte à BASCULE, la seule du rail.** Les six autres font
            // entrer quelque chose et se referment ; celle-ci ouvre un MODE qui
            // dure, et il faut pouvoir en sortir par là où l'on est entré —
            // sinon le seul moyen de reprendre la main sur les objets serait de
            // quitter l'écran.
            //
            // La bande suit le mode et n'est pas un état parallèle : deux
            // booléens auraient permis « je dessine mais la bande est fermée »,
            // c'est-à-dire un doigt qui trace sans qu'aucun réglage ne soit
            // atteignable.
            HapticFeedback.light()
            if viewModel.isDrawingActive {
                viewModel.exitDrawingEditingMode()
                requestedSceneBand = nil
            } else {
                viewModel.enterDrawingEditingMode()
                requestedSceneBand = .drawing
            }
        case .sticker:
            // **Le portail vit sur le MEUBLE** (#4120), comme les six autres :
            // la feuille est montée au-dessus de l'aiguillage des surfaces, pas
            // sur l'une d'elles. Poser le booléen ici et le lire ailleurs est
            // précisément la chaîne que l'inventaire de
            // `ComposerIntakePortalsTests` tient.
            HapticFeedback.light()
            showsStickerPicker = true
        }
    }

    /// **Le rail délègue au VIEWMODEL, jamais au canvas.** Muter la slide par
    /// le modèle est ce qui garde publication, reader et export d'accord ; le
    /// meuble n'a d'ailleurs aucune référence à la vue UIKit.
    func handleTrailingRailAction(_ action: StoryCanvasContextAction) {
        guard let id = selectedSceneItemId else { return }
        switch action {
        case .duplicate: viewModel.duplicateElement(id: id)
        case .delete:
            viewModel.deleteElement(id: id)
            selectedSceneItemId = nil
            selectedSceneItemKind = nil
        case .bringForward: viewModel.bringForward(id: id)
        case .sendBackward: viewModel.sendBackward(id: id)
        case .edit, .leaveScene:
            // Injoignables : `ComposerSceneCapabilities.controllers` ne les
            // contient pas, et le `switch` reste exhaustif pour que les servir
            // oblige à passer ici. `edit` attend l'inspecteur par kind (#4073) ;
            // `leaveScene` attend qu'une règle dise ce que l'objet DEVIENT une
            // fois dehors (#4038).
            break
        }
    }

    func handleDocumentTool(_ tool: ComposerDocumentTool) {
        switch tool.effect {
        case .insertsEmojiIntoText:
            HapticFeedback.light()
            showsEmojiPicker = true
        case .opensReferencePicker:
            HapticFeedback.light()
            showsReferencePicker = true
        case .attachesLocalMedia(let intake):
            HapticFeedback.light()
            presentMediaIntake(intake)
        case .attachesLocation:
            HapticFeedback.light()
            showsLocationPicker = true
        case .attachesTranscribedAudio:
            HapticFeedback.light()
            showsAudioComposer = true
        case .none:
            break
        }
    }

    /// Quel sélecteur ouvrir pour la famille d'ingestion demandée — la seule
    /// question que `ComposerMediaIntake` pose. `handleDocumentTool` ne la
    /// pose jamais lui-même : il reste aiguillé sur l'EFFET, cette fonction
    /// sur l'INTAKE.
    /// **La porte média ouvre les TROIS sources, pas la photothèque seule.**
    ///
    /// Elle allait droit à `handleDocumentTool(.photo)` : dès qu'une scène
    /// existait, la caméra et l'import de fichier — deux des sept entrées de la
    /// rangée canonique — quittaient l'écran. Le commentaire d'à côté disait
    /// pourtant que le rail « n'a qu'UNE porte pour les trois sources » et que
    /// `allowsCapture` gouvernerait « le SÉLECTEUR, en aval » ; ce sélecteur
    /// n'existait pas.
    ///
    /// **Une source unique se présente DIRECTEMENT.** Une feuille de choix à un
    /// seul élément demande un geste pour zéro décision — et le cas n'est pas
    /// théorique : il n'a simplement pas de producteur aujourd'hui, la règle
    /// n'ôtant que la caméra. Le rendre impossible à écrire coûterait plus que
    /// de le traiter.
    func presentMediaSources() {
        HapticFeedback.light()
        let sources = ComposerMediaSourcePolicy.offered(allowsCapture: profile.allowsCapture)
        guard sources.count > 1 else {
            if let seule = sources.first { presentMediaIntake(seule) }
            return
        }
        showsMediaSourceChooser = true
    }

    /// **La porte son ouvre l'ÉTAGÈRE autant que le micro.**
    ///
    /// Elle allait droit à `handleDocumentTool(.microphone)` : le composer
    /// unifié n'avait aucun chemin vers `SoundLibraryPicker`, alors que le
    /// socle affiche déjà un crédit de son de fond. Les deux provenances ne
    /// posent pas le même objet — un son emprunté DEVIENT le fond, une note
    /// vocale ne l'est jamais (doctrine de la vue `2c`) —, donc le choix ne
    /// peut pas être deviné : il se demande.
    /// **Annuler — et ce que le meuble n'a PAS à faire ensuite.**
    ///
    /// L'atelier fait suivre `restoreCanvas(from:)` et
    /// `loadCurrentSlideIntoTimeline()` : deux effets de PRÉSENTATION dus à sa
    /// coquille, qui tient un état canvas local et une timeline chargée. Le
    /// plateau n'a ni l'un ni l'autre — `EmbeddedSceneCanvas` lit la slide par
    /// un `Binding` sur `viewModel.currentSlide`, donc appliquer l'instantané
    /// SUFFIT à redessiner. Recopier les deux appels ici aurait couplé le
    /// meuble à des helpers qu'il n'a pas, pour un effet déjà obtenu.
    ///
    /// Le retour de `undoGlobal()` est GARDÉ : `false` veut dire « rien à
    /// défaire », et faire vibrer l'appareil pour un geste sans effet est
    /// exactement le retour trompeur que la loi 4 combat.
    func performHistoryUndo() {
        guard viewModel.undoGlobal() else { return }
        HapticFeedback.light()
    }

    func performHistoryRedo() {
        guard viewModel.redoGlobal() else { return }
        HapticFeedback.light()
    }

    func presentSoundSources() {
        HapticFeedback.light()
        showsSoundSourceChooser = true
    }

    func presentSoundSource(_ source: ComposerSoundSource) {
        switch source {
        case .library: showsSoundLibrary = true
        case .record:  handleDocumentTool(.microphone)
        }
    }

    /// L'étagère des sons. Le picker vient du SDK — le meuble ne fait que le
    /// présenter et remettre son résultat au viewModel, seul site qui sait ce
    /// qu'un son EMPRUNTÉ vaut (`soundId` renseigné, `postMediaId` vide : c'est
    /// ce couple qui dit au serveur « enregistre un usage, ne capture rien »).
    var soundLibrarySheet: some View {
        SoundLibraryPicker(
            onPick: { sound in
                viewModel.addBorrowedSound(sound)
                showsSoundLibrary = false
                HapticFeedback.light()
            },
            onCancel: { showsSoundLibrary = false }
        )
    }

    func presentMediaIntake(_ intake: ComposerMediaIntake) {
        switch intake {
        case .photoLibrary:
            showsPhotoPicker = true
        case .camera:
            showsCamera = true
        case .files:
            showsFileImporter = true
        }
    }

    /// La photothèque (T2.3). `PhotosPickerItem` ne porte ni URL ni octets
    /// tant qu'on ne les charge pas : `loadTransferable` les matérialise, et
    /// `supportedContentTypes` porte le type DÉCLARÉ par la photothèque.
    ///
    /// **Revue Opus, correctifs 1 et 3.** Le mime et la durée passent tous
    /// deux par `ComposerMediaProbe` — jamais un repli `?? "application/octet-stream"`
    /// recalculé ici (`.mime`, qui seul sait retomber sur la table par
    /// EXTENSION avant ce repli terminal), jamais une vidéo sélectionnée
    /// figée `durationMs: nil` (`.durationMs`, sans quoi `ReelComposition`
    /// la classerait `.post` au lieu de `.reel`).
    func ingestPhotoLibraryItems(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let declaredType = item.supportedContentTypes.first
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(
                "composer_photo_\(UUID().uuidString).\(declaredType?.preferredFilenameExtension ?? "dat")"
            )
            guard (try? data.write(to: url)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: url, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: mime)
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// La caméra (T2.3) — le mime est celui que CE SITE choisit en écrivant
    /// le fichier, jamais dérivé après coup : JPEG pour une photo, QuickTime
    /// pour une vidéo (le conteneur qu'`AVCaptureMovieFileOutput` écrit déjà,
    /// `CameraModel.startSegment()`).
    ///
    /// **Revue Opus, correctif 1.** La branche vidéo sonde sa durée RÉELLE
    /// (`ComposerMediaProbe.durationMs`) — sans elle, une vidéo de 10 s
    /// captée ici partait `durationMs: nil` et `ReelComposition` la classait
    /// `.post` au lieu de `.reel`. La branche photo n'a rien à sonder : une
    /// image n'a pas de durée, et `ComposerMediaProbe.durationMs` la
    /// classerait `nil` de toute façon — l'appeler ici serait un aller-retour
    /// pour rien.
    func ingestCameraCapture(_ result: CameraResult) async {
        switch result {
        case .photo(let image):
            guard let data = image.jpegData(compressionQuality: 0.9) else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_camera_\(UUID().uuidString).jpg")
            guard (try? data.write(to: url)) != nil else { return }
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "image/jpeg"))
        case .video(let url):
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "video/quicktime")
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: "video/quicktime",
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// L'importateur de documents (T2.3) — le mime passe par
    /// `ComposerMediaProbe.mime`, jamais recalculé ici.
    ///
    /// **Revue Opus, correctif 3.** `UTType.preferredMIMEType` rend `nil`
    /// pour des types pourtant bien identifiés (`.caf`, `.opus`) : retomber
    /// directement sur `application/octet-stream` ici ferait perdre
    /// EXACTEMENT le défaut que ce lot prétend fermer. `ComposerMediaProbe.mime`
    /// retombe d'abord sur la table par EXTENSION (`MimeTypeResolver`).
    ///
    /// **Revue Opus, correctif 4.** `startAccessingSecurityScopedResource()`
    /// rend `false` pour un fichier qui N'EST PAS security-scoped (conteneur
    /// app, certains fournisseurs) — ce n'EST PAS un échec. La copie est
    /// tentée QUEL QUE SOIT ce retour ; `stopAccessingSecurityScopedResource()`
    /// n'est appelé QUE si `start` a rendu `true`.
    ///
    /// **Revue Opus, correctif 1.** La durée RÉELLE est sondée
    /// (`ComposerMediaProbe.durationMs`) — un `.mp4`/`.caf` importé ici
    /// portait sinon `durationMs: nil`, et `ReelComposition` le classait
    /// `.post` au lieu de `.reel`/l'excluait à tort d'un réel à deux médias.
    ///
    /// `async` depuis ce lot : le `.fileImporter` du corps l'enveloppe d'un
    /// `Task`, comme les deux autres ingestions.
    func ingestFileImporterResult(_ result: Result<[URL], Error>) async {
        guard case .success(let urls) = result else { return }
        for sourceURL in urls {
            let scoped = sourceURL.startAccessingSecurityScopedResource()
            defer { if scoped { sourceURL.stopAccessingSecurityScopedResource() } }
            let declaredType = try? sourceURL.resourceValues(forKeys: [.contentTypeKey]).contentType
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_file_\(UUID().uuidString)_\(sourceURL.lastPathComponent)")
            guard (try? FileManager.default.copyItem(at: sourceURL, to: destination)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: destination, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: destination, mime: mime)
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: destination,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        HapticFeedback.light()
    }

    /// **Le sélecteur du dépôt, monté tel quel** — celui que le composer inline
    /// du fil ouvre déjà, avec ses catégories, sa recherche et ses récents. En
    /// fabriquer un second ici aurait donné deux listes d'emojis, deux mémoires
    /// et deux jeux de catégories à faire diverger : le motif que la surface du
    /// mood a refusé pour `StatusViewModel.moodOptions`.
    ///
    /// Il écrit dans `documentText`, et **jamais dans `moodEmoji`** : les deux
    /// sont des emojis et vivent à quelques lignes l'un de l'autre, mais l'un
    /// est un caractère glissé dans une phrase et l'autre est la matière
    /// DÉFINISSANTE d'un mood — celle sans laquelle `ComposerDocumentPublishGate`
    /// refuse de publier. Les confondre changerait ce qu'un mood EST à chaque
    /// frappe de son texte.
    var emojiPickerSheet: some View {
        EmojiPickerSheet(quickReactions: Self.quickEmojis, title: "composer.attach.emoji") { emoji in
            documentText += emoji
            showsEmojiPicker = false
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// **La porte STICKER de la scène** — et ce qu'elle ne fait PAS.
    ///
    /// Elle ne se confond pas avec `emojiPickerSheet`, sa voisine d'apparence :
    /// celle-là INSÈRE un glyphe dans le texte du document, celle-ci POSE un
    /// `StorySticker` sur la scène — un objet déplaçable, ordonnable et
    /// minutable, qui survit à la publication et au reader. Deux gestes, deux
    /// niveaux du modèle ; les confondre était le raccourci qui a tenu la porte
    /// fermée (« `showsEmojiPicker` insère dans le TEXTE, ce qui n'est pas la
    /// même chose » — la phrase était juste, la conclusion non).
    ///
    /// **La feuille reste OUVERTE après une pose**, comme sous l'atelier : on
    /// pose rarement un seul sticker, et refermer à chaque glyphe ferait payer
    /// une réouverture par objet. Le `swipe-down` natif la ferme.
    ///
    /// Les deux rappels vont au VIEWMODEL, jamais au canvas : muter par le
    /// modèle est ce qui garde publication, reader et export d'accord — et le
    /// meuble n'a aucune référence à la vue UIKit.
    var stickerPickerSheet: some View {
        StickerPickerView(onStickerSelected: { emoji in
            viewModel.addSticker(emoji: emoji)
            HapticFeedback.light()
        }, onLibraryStickerSelected: { item in
            // Le bitmap suffit à la pose : il vit sous l'id de l'ÉLÉMENT dans
            // `loadedImages` jusqu'à ce que la publication le téléverse et
            // remplisse `postMediaId`.
            viewModel.addSticker(image: item.thumbnail,
                                 provider: StoryStickerLibraryItem.provider)
            HapticFeedback.light()
        })
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    /// **La SECONDE porte pour nommer** — celle qui n'écrit pas.
    ///
    /// La première reste la frappe `@`, servie inline par la surface
    /// (`ComposerMentionControllerBox` → `ComposerMentionStrip`) : elle écrit le
    /// nom DANS le texte, pendant la saisie. Celle-ci cherche la personne
    /// correctement, puis laisse choisir COMMENT elle paraît — `INLINE`,
    /// `NOTE` (« Avec … » sous le contenu) ou `SILENT` (notifiée, invisible aux
    /// tiers). Le mode ne se choisit pas à la frappe, et c'est toute la raison
    /// d'être de cette feuille.
    ///
    /// `forCanvas: false` — un post n'a aucune couche de positionnement : lui
    /// proposer le badge `PINNED` promettrait un affichage qui n'arriverait
    /// jamais. C'est `StoryMentionPickerSheet` qui porte cette règle, on ne fait
    /// que lui dire de quelle matière il s'agit.
    ///
    /// Exactement la feuille que `ReferenceComposerBar` ouvre depuis le mood :
    /// une seconde aurait été une seconde vérité sur « comment on nomme ».
    var referencePickerSheet: some View {
        StoryMentionPickerSheet(
            references: composerReferences,
            modes: PostReferenceDisplay.declarable(forCanvas: false)
        ) { updated in
            composerReferences = updated
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// Les six emojis de tête, ceux que le composer du fil propose déjà. Écrits
    /// ici plutôt qu'en ligne pour que la liste reste une donnée nommée le jour
    /// où elle deviendra une mémoire de récents.
    static let quickEmojis = ["\u{1F600}", "\u{2764}\u{FE0F}", "\u{1F525}", "\u{1F44D}", "\u{1F602}", "\u{1F389}"]
}
