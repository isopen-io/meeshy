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

        // **Le SON ne fait pas de slide (#4052), et depuis #4657 il ne fait pas
        // non plus de BANDE-SON tout seul.**
        //
        // Cette ligne posait `applyContentAudio(…audio…)` : tout son de la liste
        // média du document devenait la bande-son de la scène. C'était juste
        // tant que la porte « Vocal » n'offrait aucun choix. Le commutateur de
        // placement a changé la donne, et la ligne s'est mise à contredire le
        // texte que l'app affiche elle-même : « Pièce jointe du post, avec son
        // lecteur » d'un côté, « Son de fond, 5 secondes » sur la pastille de
        // l'avatar de l'autre — pour le MÊME son. Mesuré au simulateur
        // `Meeshy-iOS26` le 2026-09-01, reproductible.
        //
        // Un son placé en FOND ne passe jamais par ici : `applyCreatedAudio`
        // l'envoie directement à la scène (`attachPastedAudio`), et
        // `ingestSoundFiles` fait de même. Ce qui reste dans
        // `documentContentMedia` est donc TOUJOURS du contenu — une pièce
        // jointe, qui se joue dans son lecteur et non sous la scène.
        //
        // > Une règle écrite avant le contrôle qui la contredit ne rougit
        // > nulle part : elle continue de s'appliquer, correctement, à une
        // > question que plus personne ne pose.

        for media in documentContentMedia where media.kind != .audio
            && slideIdByMediaURL[media.sourceURL] == nil {
            let target: String
            // **Ce que le RAIL a posé reste sur la scène COURANTE.** Une porte
            // du rail ajoute « en additif » ; créer une page est le geste de
            // `[+]`, et lui seul (directive porteur 2026-08-30). La rangée du
            // document, elle, garde la doctrine de la vue `1g` — en Post, une
            // slide est UN média.
            if railPosedMediaURLs.contains(media.sourceURL) {
                target = viewModel.currentSlide.id
            } else if slideIdByMediaURL.isEmpty,
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
            documentTranscriptions = [:]
            // Le contexte d'édition désigne une URL de `documentLocalMedia`
            // qu'on vient de vider : le laisser posé ferait remplacer une
            // entrée qui n'existe plus.
            editedForegroundSound = nil
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
            presentedPortal = .language
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
            // L'IDENTIFIANT, pas la phrase (#4621) : `"Langue du post"` était une
            // clé-PHRASE, retirée du catalogue quand les soixante et une phrases
            // françaises ont cessé de servir de clé. La feuille affichait donc sa
            // clé brute, en français, dans les sept locales. Le défaut était déjà
            // nommé douze lignes plus bas dans `ComposerDocumentRules.language` :
            // « sa clé contient des espaces et échappe au cliquet français ».
            title: "feed.post.language"
        )
    }

    /// Ce que le meuble sert — une PROJECTION de la règle, jamais une liste
    /// écrite ici. Le jour où un outil gagnera sa destination, il suffira de lui
    /// donner un `effect` : une énumération recopiée ici aurait exigé de penser
    /// aux DEUX endroits, et le second est celui qu'on oublie.
    /// La rangée SERVIE dépend du format : une story n'a pas de champ de
    /// contenu à outiller (`ComposerDocumentTool.servedRow(for:)`).
    var servedDocumentTools: [ComposerDocumentTool] {
        ComposerDocumentTool.servedRow(for: selectedFormat)
    }

    /// **Semer la première unité d'histoire.** Appelé au changement de format
    /// et au montage ; la règle décide, pas ce corps — c'est elle qui porte la
    /// raison de ne pas se fier à l'initialisation d'un autre module.
    func seedStoryCanvasIfNeeded() {
        guard ComposerStoryCanvas.needsSeedSlide(format: selectedFormat,
                                                 slideCount: viewModel.slides.count) else { return }
        viewModel.addSlide()
    }

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
        case .media:   railPosesNextMedia = true; presentMediaSources()
        case .sound:   presentSoundSources()
        case .mention: handleDocumentTool(.mention)
        case .place:   handleDocumentTool(.place)
        case .hashtag:
            // **La jumelle de `.mention`, et par le même mécanisme** (#4636) :
            // elle ouvre un sélecteur dont le résultat s'écrit dans le TEXTE de
            // la publication. Aucun objet n'est posé sur la scène — un hashtag
            // classe ce qui part, il ne s'y voit pas.
            HapticFeedback.light()
            presentedPortal = .hashtag
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
                viewModel.endDrawing()
            } else {
                // `beginDrawing()` et non `enterDrawingEditingMode()` : le
                // second n'ouvre que le mode LISTE de l'atelier, et laisse
                // `activeTool` intact — donc la couche de capture n'est jamais
                // montée et le doigt trace dans le vide. Défaut mesuré au
                // simulateur le 2026-08-30 : la bande paraissait, le trait
                // jamais.
                viewModel.beginDrawing()
                // **Les commandes de l'outil paraissent EN DIRECT** (#4633,
                // directive porteur 2026-08-31 : « la rangée canonique du bas
                // disparaît pour mettre en place les commandes d'outils
                // directement en direct »).
                //
                // `MeeshyToolOptionsPanel` ne rend quelque chose que si un outil
                // est DÉPLIÉ : ouvrir le dessin laissait la zone basse VIDE
                // jusqu'à ce qu'une bulle du rail soit tapée — un geste de plus
                // avant le premier réglage, sur un écran qui venait précisément
                // de libérer cette place. Le pinceau est le premier réglage de
                // tout tracé ; le déplier d'emblée ne devine rien.
                viewModel.setExpandedDrawingTool(.tool)
            }
        case .text:
            // **Poser PUIS ouvrir l'éditeur, dans le même geste.** `addText()`
            // crée une coquille vide : la laisser sans éditeur donnerait un
            // objet invisible que rien ne remplit — un contrôle sans effet.
            //
            // La coquille vide est supprimée si l'auteur referme sans écrire
            // (`exitTextEditingMode`), donc « poser » n'engage à rien.
            HapticFeedback.light()
            if let objet = viewModel.addText() {
                openObjectEditor(objet.id)
            }
        case .sticker:
            // **Le portail vit sur le MEUBLE** (#4120), comme les six autres :
            // la feuille est montée au-dessus de l'aiguillage des surfaces, pas
            // sur l'une d'elles. Poser le booléen ici et le lire ailleurs est
            // précisément la chaîne que l'inventaire de
            // `ComposerIntakePortalsTests` tient.
            HapticFeedback.light()
            presentedPortal = .sticker
        }
    }

    /// **Le rail délègue au VIEWMODEL, jamais au canvas.** Muter la slide par
    /// le modèle est ce qui garde publication, reader et export d'accord ; le
    /// meuble n'a d'ailleurs aucune référence à la vue UIKit.
    /// **Taper un jeton de l'inspecteur ouvre là où sa valeur se CHANGE**
    /// (#4073).
    ///
    /// Le geste n'existait pas : `onObjectChip` était au contrat de la surface
    /// et aucun meuble ne le remplissait. La rangée peignait donc six capsules
    /// qui s'annonçaient `.isButton`, vibraient sous le doigt, et n'ouvraient
    /// rien — un contrôle INERTE, ce qui coûte plus qu'un contrôle absent
    /// puisqu'il PROMET (loi 4).
    ///
    /// La destination est décidée par la RÈGLE, qui a déjà regardé le jeu des
    /// bandes ouvrables : ce meuble ne fait que poser le résultat. Un jeton
    /// sans destination rend la bande INCHANGÉE — la refermer ferait de
    /// « TAILLE 140 % », pendant un rognage, un bouton d'annulation déguisé.
    func handleObjectChip(_ chipId: String) {
        let suivante = ComposerObjectChips.toggled(chipId,
                                                   in: sceneObjectChips,
                                                   opened: requestedSceneBand)
        // Le retour haptique suit l'EFFET, jamais le doigt : faire vibrer
        // l'appareil pour un geste qui ne change rien est précisément le retour
        // trompeur que la loi 4 combat.
        guard suivante != requestedSceneBand else { return }
        requestedSceneBand = suivante
        HapticFeedback.light()
    }

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
        case .trim:
            // La bande BASCULE : re-toucher « Rogner » la referme. Un
            // contrôleur qui n'ouvre que dans un sens laisse l'auteur chercher
            // par où sortir, alors que le geste de sortie est celui d'entrée.
            requestedSceneBand = requestedSceneBand == .timeline ? nil : .timeline
            HapticFeedback.light()
        case .edit, .leaveScene:
            // Injoignables DEPUIS LE RAIL, et pour deux raisons distinctes que
            // le `switch` exhaustif oblige à relire quand on les sert.
            //
            // `edit` a désormais son chemin — l'appui long et l'action
            // VoiceOver « Modifier », câblés par `onItemEdit` (#4074) — mais
            // pas ici : le rail *trailing* règle les DIMENSIONS d'un objet et
            // l'histoire de la publication (directive porteur 2026-08-31).
            // « Modifier » n'est pas une dimension ; l'y ajouter donnerait deux
            // portes au même geste, ce que la règle « une porte n'a pas de
            // jumelle » interdit.
            //
            // `leaveScene` attend, elle, qu'une règle dise ce que l'objet
            // DEVIENT une fois dehors (#4038) — une décision produit, pas un
            // câblage.
            break
        }
    }

    func handleDocumentTool(_ tool: ComposerDocumentTool) {
        switch tool.effect {
        case .insertsEmojiIntoText:
            HapticFeedback.light()
            presentedPortal = .emoji
        case .opensReferencePicker:
            HapticFeedback.light()
            presentedPortal = .reference
        case .attachesLocalMedia(let intake):
            HapticFeedback.light()
            presentMediaIntake(intake)
        case .attachesLocation:
            HapticFeedback.light()
            presentedPortal = .location
        case .attachesTranscribedAudio:
            HapticFeedback.light()
            // **La MÊME feuille que « Ajouter un son » (#4657).** Ce qui
            // distinguait les deux portes n'était pas le geste — les deux
            // enregistrent, importent et empruntent — mais la DESTINATION du
            // résultat. Elle se choisit désormais dans la feuille ; l'entrée ne
            // fait plus que POSER le défaut qui lui correspond.
            openSoundSheet(placement: .foreground)
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
    /// **Un contrôleur d'outil a été tapé** — on déplie son panneau, ou on le
    /// replie s'il l'était déjà.
    ///
    /// L'identifiant porte sa famille en préfixe (`drawing.` / `text.`), et
    /// c'est ce qui permet à cette fonction de rester une seule : le rail ne
    /// connaît pas les deux énumérés du SDK, et le meuble n'a pas à se demander
    /// dans quel mode il est — l'identifiant le dit.
    func handleRailToolControl(_ control: ComposerToolControl) {
        HapticFeedback.light()
        if let brut = control.id.split(separator: ".", maxSplits: 1).last.map(String.init) {
            if control.id.hasPrefix("drawing."), let outil = DrawingEditTool(rawValue: brut) {
                // Régler le PINCEAU, jamais un trait déjà posé : la sélection
                // par-trait est un autre geste, et laisser les deux ouverts
                // ferait régler l'un en croyant régler l'autre.
                viewModel.selectStroke(nil)
                viewModel.setExpandedDrawingTool(control.isExpanded ? nil : outil)
            } else if control.id.hasPrefix("text."), let outil = TextEditTool(rawValue: brut) {
                viewModel.setExpandedTool(control.isExpanded ? nil : outil)
            }
        }
    }

    /// **Le `(x)`** — termine l'outil en cours, quel qu'il soit, et rend le rail
    /// à ses portes. Il ne détruit rien : ce qui a été posé reste sur la scène.
    func handleRailExitTool() {
        HapticFeedback.light()
        if viewModel.isDrawingActive {
            viewModel.endDrawing()
        } else if viewModel.textEditingMode.activeTextId != nil {
            viewModel.exitTextEditingMode()
        }
    }

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

    /// **Une porte, une feuille (#4483).** Elle ouvrait un choix à deux options
    /// dont les branches n'atterrissaient pas au même endroit : emprunter posait
    /// un son SUR LA SCÈNE, enregistrer le versait dans `documentLocalMedia` —
    /// la liste du DOCUMENT. Un vocal enregistré depuis une scène n'atteignait
    /// donc jamais cette scène.
    func presentSoundSources() {
        HapticFeedback.light()
        // La porte du rail n'a pas d'avis sur le placement : ce que l'auteur a
        // choisi la fois d'avant tient. `nil` le dit ; `.background` l'imposerait.
        openSoundSheet(placement: nil)
    }

    /// Les provenances SECONDAIRES, offertes sous le micro dans la feuille.
    /// `.record` n'y figure pas : c'est la surface principale, pas une porte.
    /// **La provenance décide du MÉCANISME de présentation, pas seulement de la
    /// destination** (#4632). `ComposerSoundHandoff` porte la règle : un portail
    /// se remplace, un sélecteur système exige que la feuille se ferme d'abord.
    ///
    /// La branche `.files` posait `showsFileImporter = true` en laissant
    /// `presentedPortal = .sound` monté — deux présentations sur le même corps de
    /// vue, dont iOS n'honore que la première. Le bouton était INERTE.
    func presentSoundSource(_ source: ComposerSoundSource) {
        switch ComposerSoundHandoff.handoff(for: source) {
        case .portal:
            presentedPortal = .soundLibrary
        case .systemImporterAfterDismiss:
            // Le son se pose sur la SCÈNE, pas dans la liste média du document :
            // `railPosesNextMedia` ne le concerne donc pas.
            fileImportIntent = .sound
            pendingFileImport = true
            presentedPortal = nil
        case .sheetSurface:
            break
        }
    }

    /// **La reprise, à la fermeture EFFECTIVE de la feuille** (#4632).
    ///
    /// Le drapeau retombe avant l'ouverture : un `pendingFileImport` resté vrai
    /// rouvrirait l'importateur à la prochaine fermeture de n'importe quel
    /// portail — la même classe de défaut que `railPosesNextMedia` documente
    /// deux cents lignes plus haut.
    ///
    /// **Elle sert DEUX présentations depuis #4636**, et c'est ce qui a motivé
    /// son nom actuel : la feuille d'audience doit elle aussi se fermer avant
    /// d'ouvrir le sélecteur de personnes, sous peine de reproduire à
    /// l'identique le défaut du bouton « Fichiers ». Une seule reprise, un seul
    /// `onDismiss`, aucune chance qu'une troisième s'en dispense en silence.
    /// **LA façon d'éditer un texte — une seule, quelle que soit la porte**
    /// (#4634, directive porteur : « il faut préserver la même façon d'éditer un
    /// texte que celle de le créer »).
    ///
    /// Créer un texte et modifier un texte existant passaient tous deux par
    /// `enterTextEditingMode`, mais aboutissaient à des écrans différents : la
    /// création ouvrait l'édition en ligne avec une zone basse VIDE (aucun outil
    /// déplié), la modification la même chose. Les dix-huit styles, eux,
    /// n'étaient atteignables qu'APRÈS avoir refermé l'éditeur.
    ///
    /// Ce site unique ouvre l'éditeur plein écran dans les deux cas — et ferme
    /// le portail d'abord : `fullScreenCover` et `.sheet` se disputent le même
    /// présentateur, et fermer l'état invalide chez l'ÉCRIVAIN vaut mieux que le
    /// garder chez le lecteur.
    func openObjectEditor(_ id: String) {
        presentedPortal = nil
        selectedSceneItemId = id
        selectedSceneItemKind = .text
        viewModel.enterTextEditingMode(textId: id)
        editedObject = ComposerEditedObject(id: id)
    }

    /// Fermer rend la scène au doigt ET sort du mode d'édition — les deux, sans
    /// quoi le rail continuerait d'afficher les contrôleurs d'un texte qu'on
    /// n'édite plus. C'est le modèle qui décide du sort d'une coquille vide : il
    /// la supprime.
    func closeObjectEditor() {
        viewModel.exitTextEditingMode()
        editedObject = nil
    }

    func resumePendingPresentation() {
        if pendingFileImport {
            pendingFileImport = false
            showsFileImporter = true
            return
        }
        if let mode = pendingAudiencePicker {
            pendingAudiencePicker = nil
            audiencePickerMode = mode
        }
    }


    func presentMediaIntake(_ intake: ComposerMediaIntake) {
        switch intake {
        case .photoLibrary:
            showsPhotoPicker = true
        case .camera:
            presentedPortal = .camera
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
    /// Marque les médias que l'ingestion va poser comme venant du RAIL, puis
    /// retombe. Un drapeau qui resterait vrai ferait poser sur la scène
    /// courante le média suivant, même arrivé par la rangée du document.
    func consumeRailPosing(_ urls: [URL]) {
        guard railPosesNextMedia else { return }
        railPosedMediaURLs.formUnion(urls)
        railPosesNextMedia = false
    }

    func ingestPhotoLibraryItems(_ items: [PhotosPickerItem]) async {
        var posees: [URL] = []
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
            posees.append(url)
        }
        consumeRailPosing(posees)
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
    /// **Ce qu'un COLLAGE pose** (#4092) — et il ne pose pas comme l'atelier.
    ///
    /// L'atelier a `posePastedItems`, qui route vers `addCapturedMedia` et
    /// `addRecordingToBackground` : deux helpers qui portent son état de
    /// CHARGEMENT (`isLoadingMedia`, `mediaLoadProgress`), une orchestration de
    /// vue que le meuble n'a pas et n'a pas à recopier.
    ///
    /// Le meuble a le sien, et il est déjà écrit : `ingestCameraCapture` pose
    /// une image ou une vidéo dans `documentLocalMedia`, en sondant le mime et
    /// la durée. Un collage d'image EST une capture, du point de vue de ce qui
    /// arrive dans le document — la seule différence est d'où viennent les
    /// octets.
    ///
    /// **Ce n'est donc pas une réécriture de `posePastedItems`, c'est le même
    /// geste branché sur l'ingestion de CE meuble.** Recopier les helpers de
    /// l'atelier aurait apporté avec eux un état de chargement dont rien ici ne
    /// se sert (leçon 336 : emprunter ce qui décide, pas ce qui orchestre).
    ///
    /// Le TEXTE, lui, garde sa règle partagée : `StoryPastePolicy` décide s'il
    /// devient la description ou un objet de scène, et cette question ne dépend
    /// pas de la surface qui colle.
    func handlePastedItems(_ items: [StoryPastedItem]) {
        for item in items {
            switch item {
            case .image(let image):
                Task { await ingestCameraCapture(.photo(image)) }
            case .video(let url):
                Task { await ingestCameraCapture(.video(url)) }
            case .audio(let url):
                // Un son collé rejoint la scène comme un son EMPRUNTÉ le ferait
                // — c'est le même objet, et `addAudioObject` en est le site
                // unique. Le fichier voyage par `loadedAudioURLs`.
                viewModel.attachPastedAudio(url: url)
            case .text(let contenu):
                switch StoryPastePolicy.placement(forText: contenu) {
                case .description(let texte):
                    documentText = texte
                case .textObject(let texte):
                    if let objet = viewModel.addText() {
                        viewModel.updateTextContent(id: objet.id, text: texte)
                        viewModel.exitTextEditingMode()
                    }
                case nil:
                    break   // coller le vide n'est pas une erreur, c'est un geste sans matière
                }
            }
        }
        HapticFeedback.light()
    }

    func ingestCameraCapture(_ result: CameraResult) async {
        switch result {
        case .photo(let image):
            guard let data = image.jpegData(compressionQuality: 0.9) else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_camera_\(UUID().uuidString).jpg")
            guard (try? data.write(to: url)) != nil else { return }
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(url: url, declaredMimeType: "image/jpeg"))
            consumeRailPosing([url])
        case .video(let url):
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "video/quicktime")
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: "video/quicktime",
                durationMs: duration
            ))
            consumeRailPosing([url])
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
        // **L'intention retombe dès la lecture** : elle vaut pour UNE ouverture.
        // Laissée à `.sound`, elle ferait poser sur la scène le fichier suivant,
        // même arrivé par la rangée du document.
        let intention = fileImportIntent
        fileImportIntent = .media
        if intention == .sound {
            await ingestSoundFiles(urls)
            return
        }
        var posees: [URL] = []
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
            posees.append(destination)
        }
        consumeRailPosing(posees)
        HapticFeedback.light()
    }

    var emojiPickerSheet: some View {
        EmojiPickerSheet(quickReactions: Self.quickEmojis, title: "composer.attach.emoji") { emoji in
            documentText += emoji
            presentedPortal = nil
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
    /// **La feuille se REFERME sur la pose** (directive porteur 2026-08-30).
    ///
    /// Elle restait ouverte, par emprunt à l'atelier : « on pose rarement un
    /// seul sticker ». C'était un raisonnement de PLANCHE de stickers, pas de
    /// scène — sur un plateau, poser un sticker et le PLACER sont un seul
    /// geste, et une feuille qui recouvre la moitié basse empêche la seconde
    /// moitié. Refermer rend la scène au doigt immédiatement.
    ///
    /// **Et le sticker se pose en GRAND.** Le défaut de la taille par défaut
    /// donne un glyphe minuscule au centre, que l'auteur doit agrandir avant de
    /// le placer — deux gestes pour un. `StorySticker.posedScale` le pose à la
    /// taille où il se voit.
    ///
    /// Les deux rappels vont au VIEWMODEL, jamais au canvas : muter par le
    /// modèle est ce qui garde publication, reader et export d'accord — et le
    /// meuble n'a aucune référence à la vue UIKit.
    var stickerPickerSheet: some View {
        StickerPickerView(onStickerSelected: { emoji in
            viewModel.addSticker(emoji: emoji, scale: StorySticker.posedScale)
            presentedPortal = nil
            HapticFeedback.light()
        }, onLibraryStickerSelected: { item in
            // Le bitmap suffit à la pose : il vit sous l'id de l'ÉLÉMENT dans
            // `loadedImages` jusqu'à ce que la publication le téléverse et
            // remplisse `postMediaId`.
            viewModel.addSticker(image: item.thumbnail,
                                 provider: StoryStickerLibraryItem.provider,
                                 scale: StorySticker.posedScale)
            presentedPortal = nil
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
