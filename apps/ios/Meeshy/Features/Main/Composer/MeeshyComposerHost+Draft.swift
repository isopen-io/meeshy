import SwiftUI
import MeeshySDK
import MeeshyUI

// **Le brouillon que la flèche remet** — extrait de `MeeshyComposerHost+Socle`
// au #6502. Le socle frôlait les 1 000 lignes au moment où la flèche gagnait son
// menu, et la règle du dépôt est d'extraire avant d'ajouter. La coupe suit une
// responsabilité : ce fichier COMPOSE ce qui part ; le socle PEINT et AIGUILLE.
// Le nom suit le motif `MeeshyComposerHost+*`, donc le fichier reste dans l'unité
// que lisent les gardes du meuble.

extension MeeshyComposerHost {

    /// **`identifiant d'objet → alternative` devient `URL source →
    /// alternative`** (2026-09-05).
    ///
    /// Le pont est `documentMediaObjectIdBySource`, alimenté par le retour
    /// d'`applyContentMedia` — le seul site qui ait jamais connu les deux bouts.
    ///
    /// **La projection elle-même est DESCENDUE sur `ComposerMediaPorters` au
    /// #6577** (`altsBySourceURL`), où le retrait d'un média peut se prouver sur
    /// ce que la charge porte vraiment. La réécrire dans un témoin en aurait
    /// fait une jumelle à faire diverger ; ce site la CONSULTE.
    var altsParURLSource: ComposerMediaCaptions { mediaPorters.altsBySourceURL }

    /// **Ce que la flèche remet au site de montage, pour le CHOIX du geste**
    /// (#6502). La surface est celle d'OUVERTURE ; le format et l'agencement
    /// sont ceux que l'auteur vient de choisir, et ils entrent en paramètre.
    ///
    /// Sous la scène, il n'est atteint que par « Post + agencement »
    /// (`ComposerPublishMenuRule.route`) — le seul canal qui transporte
    /// `canvasV3.layout` —, et le menu ne l'offre que si ce canal porte tous les
    /// fichiers du canevas (`documentCarriesEveryMedia`). Sans agencement, la
    /// scène publie par l'atelier, jamais par un second chemin d'envoi.
    func documentDraft(for choice: ComposerPublishChoice) -> ComposerDocumentDraft? {
        switch mountedSurface {
        case .mood:
            // `repostOfId` vient de la PORTE, pas de la graine : c'est la porte
            // qui sait quelle publication elle repartage
            // (`.repost(ofPostId:sourceFormat:)`), et le poser aussi dans la
            // graine aurait fait deux sources pour un même fait. `audioUrl`,
            // lui, vient de la graine — c'est une matière de la SOURCE, pas son
            // identité.
            return ComposerDocumentDraft.mood(
                emoji: moodEmoji,
                text: documentText,
                visibility: composerVisibility,
                visibilityUserIds: composerVisibilityUserIds,
                references: composerReferences,
                repostOfId: intent.origin.repostedPostId,
                audioUrl: moodSeed?.audioUrl
            )
        case .scene, .document:
            // L'audience est celle du SOCLE, jamais la graine de la porte.
            // `initialVisibility` la fournissait tant qu'`audienceChip` était un
            // témoin ; le lire encore ferait publier sous un réglage que
            // l'auteur vient de changer, en silence. Il ne reste qu'un lecteur :
            // l'atelier, à qui le SDK l'imposerait par défaut sans lui.
            //
            // `repostOfId` vient de la PORTE, exactement comme sous le mood —
            // et c'est ce qui fait de la bascule Mood → Post un ANCRAGE plutôt
            // qu'un post ordinaire. Le lire ailleurs (la graine, un drapeau du
            // site de montage) en ferait une seconde source pour « quelle
            // publication republie-t-on », alors que la porte le sait.
            //
            // `originalLanguage` vient du SOCLE (`documentLanguage`, T2.2) et
            // non plus d'un littéral `nil` : c'est la capsule qui l'écrit, la
            // porte qui la poste telle quelle.
            //
            // `forcePlainPost` valait TOUJOURS `true` ici (B3, #3926), et le
            // commentaire disait pourquoi : « ce publieur n'est atteint que
            // lorsque `mountedSurface == .document`, c'est-à-dire
            // `selectedFormat == .post` ». **Le routage du 2026-09-01 a rendu
            // cette phrase fausse** — la STORY descend désormais sur le
            // document, et le littéral aurait forcé en POST simple une
            // composition que l'auteur venait de déclarer story.
            //
            // > Un littéral justifié par un invariant de ROUTAGE est une bombe à
            // > retardement : le jour où la route change, rien ne rougit — le
            // > commentaire cesse simplement d'être vrai.
            //
            // Il porte donc désormais sa condition, qui dit exactement ce que le
            // commentaire affirmait. Ce qu'il garde de son sens d'origine : les
            // médias qualifiants d'un POST forment un carrousel, jamais un réel
            // promu en silence.
            //
            // `location` vient du SOCLE (`documentLocation`, T2.5, écrit par
            // `LocationPickerView`) — jamais d'un littéral `nil` : un littéral
            // jetterait le lieu que l'auteur vient de choisir.
            //
            // `discoverabilityPrecision` est le SECOND opt-in, gardé par
            // `documentOffersNearbyDiscoverability` — la MÊME garde que celle
            // qui peint le contrôle (`FeedNearbyDiscoverability.offers(`),
            // jamais recopiée : un contrôle absent de l'écran ne doit jamais
            // pouvoir peser sur ce qui part. Hors de cette garde, ou tant que
            // l'auteur n'a rien activé, `precisionToSend` vaut déjà `nil`
            // (`NearbyDiscoverabilityChoice`, off par défaut).
            //
            // `mobileTranscription` vient du SOCLE (`documentTranscription`,
            // T2.6, écrit par `AudioPostComposerView` au retour du sixième
            // outil) — jamais d'un littéral `nil` : un littéral ferait perdre
            // la transcription faite SUR L'APPAREIL, et le serveur
            // re-transcrirait ce travail en silence.
            return ComposerDocumentDraft.document(
                format: choice.format,
                forcePlainPost: choice.format == .post,
                text: documentText,
                visibility: composerVisibility,
                visibilityUserIds: composerVisibilityUserIds,
                repostOfId: intent.origin.repostedPostId,
                localMedia: documentLocalMedia,
                location: documentLocation,
                discoverabilityPrecision: documentOffersNearbyDiscoverability
                    ? documentDiscoverability.precisionToSend
                    : nil,
                originalLanguage: documentLanguage,
                mobileTranscription: documentTranscription,
                // Les personnes nommées par la feuille de l'outil `@`. Sans ce
                // passage, la feuille aurait laissé choisir des gens et un mode
                // puis le brouillon serait parti avec `mentions: nil` : un geste
                // complet pour une conséquence nulle.
                references: composerReferences,
                // **LE CANVAS de la slide courante** (#4756). Il est ici et
                // nulle part ailleurs : c'est le seul site qui compose le
                // brouillon d'un post, et le seul qui voie à la fois le format
                // choisi et l'atelier.
                //
                // `sceneIsPresent` — le MÊME prédicat que celui qui monte la
                // vue, jamais `documentHasScene` en direct : les deux
                // répondaient à la même question et divergeaient sur une story
                // vide (cf. `sceneIsPresent`). Sans scène à l'écran, aucun blob
                // ne part — un canvas vide encodé ferait croire à une scène
                // composée puis effacée.
                // **TOUTES les slides partent** (directive porteur 2026-09-06).
                // La règle vit dans `ComposerStoryCanvas`, où elle s'éprouve ;
                // ce site ne fait que la consulter, comme il consulte déjà
                // `sceneIsPresent`.
                storyEffects: ComposerStoryCanvas.publishedSlide(
                    format: choice.format,
                    sceneIsPresent: sceneIsPresent,
                    slides: viewModel.slides,
                    // **La disposition demandée voyage avec les scènes.** Sans
                    // cette ligne le contrôle serait un décor : l'auteur
                    // choisirait « en vague » et la publication partirait dans
                    // le repli.
                    layout: choice.layout),
                // **Les légendes du composer, enfin remises** (#4756). Cette
                // carte avait un écrivain et aucun lecteur sur cette voie : ce
                // qui manquait n'était pas la saisie, c'était ce passage-ci.
                mediaCaptions: documentMediaCaptions,
                // **La traduction de clé se fait ICI, et nulle part ailleurs.**
                //
                // L'éditeur d'objet écrit par identifiant d'OBJET — c'est ce
                // qu'il édite, et c'est la seule clé qui survive au
                // remplacement d'un fichier sur la même scène. Le chemin
                // durable, lui, réaligne par URL SOURCE, comme les légendes.
                //
                // Ce site est le seul qui tienne les DEUX : la carte des alts
                // et le pont `URL source → identifiant d'objet` qu'a rendu
                // `applyContentMedia`. Traduire plus tôt aurait accroché
                // l'alternative à un fichier plutôt qu'à l'objet ; plus tard,
                // le pont n'existe plus.
                mediaAlts: altsParURLSource,
                // Le pont que `applyContentMedia` a rendu, remis TEL QUEL : la
                // traduction en positions se fait un étage plus bas, là où
                // l'ORDRE des fichiers existe.
                mediaObjectIds: documentMediaObjectIdBySource,
                // **`nil`, honnêtement** (#3996). La surface `.document` (sans
                // scène) ne monte aucun `SoundExtractionToggle` — il ne vit
                // que dans l'atelier (`ComposerToolPanelHost` →
                // `ComposerBottomBand`), monté seulement sous `.scene`. Poser
                // autre chose que `nil` ici affirmerait une décision que
                // l'auteur n'a jamais pu exprimer sur cette surface. Le champ
                // voyage désormais de bout en bout (#3996) ; le jour où cette
                // surface gagne son propre contrôle, c'est cette ligne qui le
                // relaiera.
                allowSoundExtraction: nil
            )
        }
    }
}
