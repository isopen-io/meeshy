import SwiftUI
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Ce que le meuble monte pour un DOCUMENT** — la surface post/réel, sa feuille
// caméra, et les deux projections de média qu'elles servent.
//
// Les cinq membres ci-dessous forment la surface DOCUMENT entière, et n'ont
// aucun appelant commun avec la scène ni avec l'humeur — seules les trois
// `var …Surface` se répondent, depuis le `body` du meuble. **La coupe suit une
// RESPONSABILITÉ, pas une tranche** : la scène, l'humeur, le calque de
// description et ses constantes vivent dans `MeeshyComposerHost+Surfaces.swift`.
// `descriptionLayerHeaderClearance` voisine le dernier membre ci-dessous sans
// lui appartenir — une coupe par numéro de ligne l'aurait emporté, une coupe
// par responsabilité le laisse.

extension MeeshyComposerHost {


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
            slideRailSlot: slideRailSlot,
            onPickBackground: { hex in
                // Choisir un fond pose la couleur SUR la slide
                // courante et fait apparaître la scène INCRUSTÉE dans l'écran
                // document (via `showsScene` ci-dessous), SANS basculer sur
                // l'atelier plein écran. Le report du contenu reste géré ailleurs.
                documentBackground = hex
                viewModel.applyBackground(hex: hex)
            },
            // La scène 9:16 s'incruste EN HAUT de l'écran
            // document dès qu'un fond est choisi. Elle édite la slide courante
            // de l'atelier (source de vérité unique) ; son ratio suit le fond
            // (portrait par défaut, paysage si image de fond paysage).
            sceneSlide: Binding(
                get: { viewModel.currentSlide },
                set: { viewModel.currentSlide = $0 }
            ),
            // **Le MÊME prédicat que la vue montée** — `sceneIsPresent`,
            // jamais `documentHasScene` en direct. Les deux répondent à la même question
            // et divergeraient sur une story vide : la vue dirait « il y a une scène »,
            // cette branche « non », et l'écran n'en montrerait aucune.
            showsScene: sceneIsPresent,
            sceneAspectRatio: viewModel.currentCanvasRatio,
            onSceneItemTapped: { _, kind in selectedSceneItemKind = kind },
            // **Taper la scène quand son FOND est un média le SÉLECTIONNE.** Sans cette
            // ligne l'inspecteur serait INATTEIGNABLE sur l'écran document : en profil
            // Post, une slide ne porte QU'UN média et la règle 4 en fait son FOND ; or
            // `hitTestItem` n'itère que `itemsContainer`, où un fond ne vit pas — le tap
            // retomberait sur `onBackgroundTapped`, qui EFFACERAIT la sélection : écran
            // identique au bit près.
            //
            // La correction est APP-SIDE et non dans le geste du SDK : y
            // rendre le fond « hit-testable » changerait la manipulation de
            // l'atelier plein écran, qu'il faut laisser intact. Le SDK dit
            // ce qui a été touché, l'app décide ce que cela sélectionne.
            onSceneBackgroundTapped: { handleSceneBackgroundTap() },
            onSceneBackgroundLongPressed: { handleSceneCaptureLongPress() },
            // La rangée de l'avatar montre le son de fond : la note,
            // l'onde et la durée à côté du visage, et le texte descend.
            // **Ce qu'elle a le DROIT de montrer est une loi**, pas la
            // propriété du site qui écrit : la place dit le FOND, et un son de
            // contenu n'y paraît jamais.
            backgroundSound: avatarBadgeSound,
            // Et le toucher l'OUVRE, comme la carte du son de contenu.
            onEditBackgroundSound: editBackgroundSoundAction,
            onDeleteBackgroundSound: deleteBackgroundSoundAction,
            // Un son de CONTENU se joue sous la
            // zone de texte, transcription défilante, et se rouvre au toucher.
            onEditForegroundSound: { son in editForegroundSound(son) },
            onDeleteForegroundSound: { son in deleteForegroundSound(son) },
            foregroundSounds: foregroundSounds,
            // …et le rail DIT laquelle est à l'écran. La résolution est
            // ici parce que la carte `média → slide` et la slide courante
            // vivent ici : demander à la surface de la refaire l'obligerait à
            // lire le ViewModel, donc à cesser d'être sans état.
            // Le `⋯` au bout de la barre. Le meuble décide des ENTRÉES
            // par la règle, jamais par un `if` écrit dans un `body` ; aucune
            // entrée ⇒ `nil` ⇒ aucun bouton (loi 4).
            overflowMenu: documentOverflowEntries.isEmpty
                ? nil : AnyView(overflowMenu),
            // L'occultation de la rangée défilante se peint de la teinte
            // que le meuble applique DÉJÀ à tout l'écran, jamais d'une couleur
            // re-choisie.
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
            sceneStickerAnimations: viewModel.loadedStickerAnimations,
            sceneImagesVersion: viewModel.loadedImagesVersion,
            // **La tuile de lieu** ne voyage pas en `.overlay(alignment: .bottomLeading)`
            // sur TOUTE la surface : c'est le point où `toolRow` peint sa première icône
            // (elle aussi calée au bord de tête). Un overlay et le premier enfant d'un
            // `HStack` occupent le MÊME z-niveau : rien n'empêcherait le chevauchement, à
            // aucune taille d'écran ni palier de Dynamic Type. Elle voyage par
            // `toolRowLeadingAccessory`, un slot rendu DANS le `HStack` de `toolRow` — deux
            // enfants d'un `HStack` ne se superposent jamais, par construction.
            // **Le chip de lieu n'est pas dans la rangée** : le nom du lieu, son réglage
            // et sa croix vivent dans l'entête du composant Position, en bas. Deux moitiés
            // d'une même information à deux endroits de l'écran, c'est ce que cette règle
            // évite.
            //
            // Le SLOT reste, et ce n'est pas de la dette : il est le jumeau symétrique de
            // `toolRowTrailingAccessory`, et c'est LUI qui tient l'invariant
            // anti-chevauchement — tout futur chip de tête doit passer par là plutôt que
            // par un `.overlay`.
            toolRowLeadingAccessory: nil,
            // **La capsule de langue n'est pas dans la rangée canonique.** Posée en
            // `.overlay(alignment: .bottomTrailing)` sur TOUTE la surface, elle
            // recouvrirait la moitié de la bande de mentions ; un slot l'accueillerait
            // faute d'un meilleur endroit — pas parce que sa place sémantique y serait. La
            // rangée canonique porte ce qu'on ATTACHE à un texte ; la langue le QUALIFIE.
            //
            // > Une place choisie pour éviter un défaut n'est pas la place JUSTE — et rien
            // > ne rougit quand on la garde.
            //
            // Le slot reste, vide, avec son jumeau de tête : c'est LUI qui tient
            // l'invariant anti-chevauchement pour tout futur accessoire.
            toolRowTrailingAccessory: nil,
            // …et la capsule descend au PIED du champ de contenu, la place
            // qu'elle occupe déjà sur la scène (au-dessus de la coche du calque
            // de description). Même capsule, même portail, une seule
            // `documentLanguage`.
            contentLanguageAccessory: AnyView(documentLanguageCapsule)
        )
    }

    /// La capture caméra du document : le viseur du composeur, servi
    /// SEUL en plein écran — un statut n'a pas de scène où l'armer.
    /// C'est le même viseur que la page blanche emprunte par environnement.
    var documentCameraSheet: some View {
        ComposerViewfinder(initialMode: pendingCameraMode) { result in
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

    /// **Le média du document, traduit pour la scène.** Ne porte
    /// que l'IMAGE et la VIDÉO : un son ou un document joint n'a pas de place de
    /// fond sur un canvas. `applyContentMedia` est idempotent (clé = `sourceURL`),
    /// donc câbler cette liste à chaque bascule ne duplique rien. Le média VISUEL
    /// est aussi, par construction, ce qui fait qu'une composition qualifie comme
    /// scène — le texte, lui, suit par `applyContentText`.
    ///
    /// **Le classement image/vidéo passe par `ComposerIngestRouter.route(mime:)`**,
    /// le SEUL classeur MIME du dépôt (six sites de production) — jamais un
    /// `hasPrefix` recopié, qui divergerait de la casse et des repli qu'il gère.
    /// **Ce que la rangée haute montre — les FONDS, et rien d'autre.**
    ///
    /// Les deux barres hautes ne reçoivent pas `documentLocalMedia`, la liste
    /// ENTIÈRE : une tuile paraîtrait pour tout ce qui entre — une image posée SUR
    /// la scène, un vocal qui a déjà sa carte sous le texte, un PDF qui n'est
    /// aucune page. Le carrousel grossirait sans qu'on ait ajouté de page, et
    /// taper la tuile ne mènerait nulle part — l'hôte ne sait naviguer que vers une
    /// slide, et ces médias n'en fondent aucune.
    ///
    /// La règle lit l'index des FONDATIONS, jamais une seconde vérité :
    /// `slideIdByMediaURL` dit déjà « ce média a fondé cette slide », ce qui est
    /// exactement l'ensemble des fonds.
    /// **Le rail des scènes, monté UNE fois pour les deux surfaces.**
    ///
    /// Il montre une mini-preview par SCÈNE — y compris celle qui n'a aucun
    /// média, née d'un fond coloré : une rangée qui compterait les médias
    /// fondateurs ne produirait aucun retour à la création d'une scène, tant
    /// qu'on ne lui a pas donné de photo.
    ///
    /// Chaque tuile EST la vignette de sa scène ; le rail se
    /// monte dès qu'une scène existe et est montée (`showsRail`) — une scène
    /// neuve y paraît donc tout de suite, noire parce qu'elle est vide.
    var slideRailSlot: AnyView? {
        let scenes = ComposerHeaderTiles.tiles(for: viewModel.slides)
        guard ComposerHeaderTiles.showsRail(sceneCount: scenes.count, scenePresent: sceneIsPresent) else {
            return nil
        }
        return AnyView(ComposerSlideRail(
            slides: scenes,
            currentIndex: viewModel.currentSlideIndex,
            slideImages: viewModel.slideImages,
            loadedImages: viewModel.loadedImages,
            onSelect: { viewModel.selectSlide(at: $0) },
            onDelete: { retractScene(at: $0) }))
    }

    /// **L'outil Texte du document : la scène, le texte posé, le clavier — un
    /// seul geste**. Le fond suit le chemin de la palette, la saisie
    /// celui de la porte Texte de la scène (`handleRailDoor(.text)`).
    func openTextScene() {
        guard let fond = ComposerTextSceneDoor.background(
            chosen: documentBackground, palette: StoryBackgroundPalette.colors
        ) else { return }
        HapticFeedback.light()
        textSceneImplicitBackground = ComposerTextSceneDoor.implicitBackground(
            chosen: documentBackground, posed: fond)
        documentBackground = fond
        viewModel.applyBackground(hex: fond)
        // Le texte se pose au tour suivant : la scène vient d'être montée, et un
        // canvas sans taille ni fenêtre ouvrirait une saisie invisible, sans
        // clavier — mesuré au simulateur.
        DispatchQueue.main.async {
            guard documentBackground == fond, let objet = viewModel.addText() else { return }
            beginSceneTextEditing(objet.id)
        }
    }

    /// La saisie se ferme : une scène restée nue rend le document — le texte
    /// vide est déjà retiré par `exitTextEditingMode`, le fond implicite part.
    func settleTextSceneAfterEditing() {
        guard let implicite = textSceneImplicitBackground else { return }
        textSceneImplicitBackground = nil
        guard ComposerTextSceneDoor.returnsToDocument(
            implicitBackground: implicite,
            currentBackground: documentBackground,
            foundedSlides: slideIdByMediaURL.count,
            sceneObjectCount: viewModel.currentSlide.sceneObjects.count,
            slideCount: viewModel.slides.count
        ) else { return }
        documentBackground = nil
        viewModel.clearBackground()
        selectedSceneItemId = nil
        selectedSceneItemKind = nil
    }

    var documentContentMedia: [ComposerContentMedia] {
        documentLocalMedia.compactMap { media in
            switch ComposerIngestRouter.route(mime: media.mimeType) {
            // **Le mime DÉCLARÉ voyage avec le média** — jamais
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
            // **Le son rejoint la scène.** Il ne devient PAS une slide
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

    /// **La COUCHE D'ÉCRITURE.**
    ///
    /// Ce que l'auteur écrit ici part comme `slide.content` (via
    /// `applyContentText`, le même canal que B1) et le reader l'affiche
    /// par-dessus le canvas composé — la légende `content` des viewers
    /// existants. C'est la surface d'ÉDITION, côté scène, du contenu que B1
    /// préserve entre les modes ; jamais un second champ.
    ///
    /// ## Une couche, pas une barre
    ///
    /// Une **barre repliable à chevron** serait trois éléments de chrome pour dire
    /// ce que le lecteur verrait, et qui ne le montreraient pas. Un **calque de
    /// lecture** le montrerait — mais depuis le bas de l'écran, en permanence,
    /// alors que la scène est CENTRÉE et marginée : cette place permanente est
    /// précisément celle qu'il faut lui rendre.
    ///
    /// Elle est donc une **couche**, ouverte par l'icône de la rangée haute. Le
    /// calque de lecture est ce que la couche contient — même composant, mêmes
    /// mentions, même rendu par le renderer du lecteur.
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
    /// 44 pt de cible + 32 pt d'air. À 52 pt la rangée serait
    /// coupée en deux par le bord du matériau — la réserve doit couvrir la
    /// CIBLE tactile entière, pas la seule pastille visible (36 pt).
}
