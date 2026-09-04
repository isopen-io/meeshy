import SwiftUI
import AVFoundation
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Ce que le meuble monte pour un DOCUMENT** — la surface post/réel, sa feuille
// caméra, et les deux projections de média qu'elles servent.
//
// Extrait de `MeeshyComposerHost+Surfaces.swift` au #5069, qui portait 1248
// lignes contre un plafond dur de 1200. **La coupe suit une RESPONSABILITÉ, pas
// une tranche** : les cinq membres ci-dessous forment la surface DOCUMENT
// entière, et n'ont aucun appelant commun avec la scène ni avec l'humeur —
// seules les trois `var …Surface` se répondent, depuis le `body` du meuble.
//
// Ce qui RESTE dans le fichier d'origine, et pourquoi : la scène, l'humeur, le
// calque de description et ses constantes. `descriptionLayerHeaderClearance`
// voisine le dernier membre extrait sans lui appartenir — une coupe par numéro
// de ligne l'aurait emporté, une coupe par responsabilité le laisse.

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
}
