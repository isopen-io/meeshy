import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Le chrome de PUBLICATION** — le socle qui ne bouge jamais (loi 5), son
// audience, sa flèche, et le brouillon qu'ils remettent.

extension MeeshyComposerHost {

    // MARK: - Le socle — jamais conditionnel à la PORTE

    /// Le point fixe du composer : ce qui varie n'est pas la porte, c'est la
    /// SURFACE.
    ///
    /// La loi 5 interdit qu'il se réorganise selon la porte d'entrée. Il ne peint
    /// pas pour autant une commande sans objet : l'audience n'est pas peinte là où
    /// la surface porte son propre sélecteur (le mood), et l'œil n'est pas au
    /// socle — l'aperçu est servi par le `⋯`.
    ///
    /// Ce qui est peint tient : l'audience est un vrai sélecteur avec sa mémoire,
    /// la flèche un vrai bouton avec son gate de matière. Un socle qui nomme sans
    /// faire est le motif que ce chantier retire, pas celui qu'il installe.
    ///
    /// Ce choix appartient à `ComposerChromeOwnership.socleZones`, une règle
    /// PURE et éprouvée. Aucun `if` sur `profile`, sur `origin` ni sur `intent`
    /// n'entre ici : ce serait la loi 5 défaite, et une condition écrite dans un
    /// `body` est invisible aux tests.
    /// L'unique lecture de la règle de densité — la recopier au second site
    /// donnerait deux seuils à faire diverger, et l'un des deux se casserait en
    /// syllabes sans que rien ne le dise.
    var socleShowsLabels: Bool {
        ComposerSocleDensity.showsLabels(dynamicTypeSize)
    }

    var socle: some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            if paintedSocleZones.contains(.audience) { audienceChip }
            Spacer()
            if socleServesPostText { postTextButton }
            if !socleHasNothingToPublish { publishButton }
        }
        // Grand écran : la marge de la maquette iPad/Mac, alignée sur les rails.
        .padding(.horizontal, horizontalSizeClass == .regular ? ComposerRailGeometry.roomyMargin : 14)
        // **Plus bas, sous la scène** : il
        // frôle la zone du geste d'accueil au lieu de mordre sur le dessin.
        .padding(.top, MeeshySpacing.xs)
        .padding(.bottom, MeeshySpacing.xxs)
    }

    /// **Le texte du post, au socle.** Ce n'est pas un nouveau chemin : c'est la
    /// PORTE `.content`, qui quitte la rangée basse
    /// (`ComposerSceneFloatingRail.lowRow`) et garde son unique aiguillage,
    /// `handleRailDoor`. Peinte seulement sous la scène d'un post — la surface
    /// document écrit son corps en place.
    ///
    /// **Le format lu est celui que la flèche PUBLIERA** (`armedChoice`), pas
    /// celui de la porte d'entrée : une story armée « Post » par le chevron publie
    /// un post, et doit offrir le bouton pour en écrire le contenu.
    var socleServesPostText: Bool {
        mountedComposerView == .scene
            && ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                        format: armedChoice.format,
                                        allowsCapture: profile.allowsCapture)
                .contains(ComposerSceneFloatingRail.socleDoor)
    }

    var postTextButton: some View {
        Button {
            handleRailDoor(ComposerSceneFloatingRail.socleDoor)
        } label: {
            Image(systemName: ComposerSceneFloatingRail.socleDoor.symbolName)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.textPrimary(isDark: true))
                .frame(width: 44, height: 44)
                .contentShape(Circle())
                .adaptiveLiquidGlass(in: Circle(), tint: tint.color.opacity(0.55), interactive: true)
        }
        .accessibilityLabel(Text(ComposerRailCopy.label(ComposerSceneFloatingRail.socleDoor)))
    }


    // **La pastille de son n'est pas au socle.**
    //
    // Le socle ne porte que ce qui décide de l'ENVOI. Deux niveaux du modèle ne
    // vivent pas dans une même rangée : l'audience et « Publier » décident de ce
    // qui PART, une entrée de son décide de ce qu'on COMPOSE, et le doigt ne
    // pourrait pas les distinguer. La feuille du son a ses propres chemins :
    // l'outil micro de la rangée du document, la porte son du rail de la scène, et
    // la pastille près de l'avatar, qui est le bouton d'édition du son de fond. Une
    // pastille au socle serait un doublon posé sur la rangée de l'ENVOI, et le
    // socle déborderait du viewport dès qu'un son porte un vrai crédit — c'est sa
    // seule zone à largeur non bornée.
    //
    // Le crédit d'un son (titre · @auteur · durée) suit le son jusqu'à la
    // pastille de l'avatar, qui le rend : sans cette composition, l'attribution
    // d'un son emprunté disparaîtrait partout, en silence. Il tient en DEUX
    // morceaux, séparés par ce dont chacun dépend : `StoryAudioIdentity.attribution`
    // (SDK) pour ce qui dépend de la PISTE — titre et crédit, servis seulement à un
    // emprunt — et `ComposerSoundCredit` pour ce qui dépend du LECTEUR, sa durée
    // écrite pour l'œil ou dite à voix haute.

    // **L'historique n'est pas au socle.**
    //
    // Ce qu'il défait, ce sont des gestes sur les OBJETS — poser un texte,
    // déplacer un média, tracer. Undo/redo vit dans le rail de droite, qui agit
    // sur les dimensions des objets ; au socle il voisinerait avec l'audience et
    // le bouton publier, qui décident de l'ENVOI : la zone dit « ce qui part »,
    // l'historique dit « ce que j'ai fait ». Deux niveaux du modèle dans une
    // seule rangée, et le doigt ne pourrait pas les distinguer. Le socle y gagne
    // en largeur : il déborde du viewport dès que la pastille de son porte un vrai
    // crédit.
    //
    // `ComposerHistoryService.servesHistory` est le juge unique de « cet écran
    // sert-il l'historique ? » — seule la PLACE est décidée ailleurs, jamais la
    // question. Elle est posée par `MeeshyComposerHost+Surfaces`.

    /// **L'aperçu — voir le post COMME IL SERA LU, avant de le publier.** Servi
    /// par l'entrée `⋯ › Aperçu`.
    ///
    /// Il ne rend rien lui-même : il remet les slides composées au rappel
    /// `onPreview`, que la PORTE branche sur `StoryViewerView` — le lecteur
    /// réel, celui qui rendra la publication. C'est la loi 6 tenue à la
    /// lettre : un aperçu maison serait un quatrième chemin de rendu, et il
    /// mentirait le premier jour où le lecteur changerait sans lui.
    ///
    /// **Ce que le meuble remet vient du ViewModel, pas d'un instantané de
    /// vue.** L'atelier passe par `snapshotAllSlides()` parce que sa slide
    /// COURANTE vit dans un état de vue (`buildEffects()`) qu'il doit d'abord
    /// replier dans le tableau. Ici la scène incrustée édite
    /// `viewModel.currentSlide` en direct par un `Binding` : le tableau EST
    /// déjà à jour, et le replier une seconde fois écraserait la slide courante
    /// par une copie plus ancienne.
    ///
    /// Aucun `NotificationCenter.storyComposerMuteCanvas` n'est posté, à la
    /// différence de l'atelier : la scène incrustée ne joue aucun son, il n'y a
    /// donc rien à faire taire — poster quand même laisserait un canvas MUET
    /// derrière l'aperçu, sans personne pour le rallumer sur cette surface.
    /// **Sous la SCÈNE, l'aperçu est EXÉCUTÉ par l'atelier** — le meuble ne
    /// fait que presser. La raison est mesurée : l'atelier replie d'abord les
    /// effets du canvas courant (`snapshotAllSlides`) et rend l'aperçu avec ses
    /// médias PRÉCHARGÉS ; un aperçu peint et exécuté ici les ignorerait et
    /// montrerait une scène amputée — ce qu'interdit la loi 6.
    ///
    /// Sous le DOCUMENT, rien ne change : la scène incrustée édite
    /// `viewModel.currentSlide` en direct par un `Binding`, le tableau EST à
    /// jour, et le replier une seconde fois écraserait la slide courante par une
    /// copie plus ancienne.
    func performSoclePreview() {
        switch mountedSurface {
        case .scene:
            publishTrigger.requestPreview()
        case .document, .mood:
            onPreview(
                viewModel.slides,
                viewModel.slideImages,
                viewModel.loadedImages,
                viewModel.loadedVideoURLs,
                viewModel.loadedAudioURLs
            )
        }
    }


    /// **L'audience du socle CHOISIT — elle ne témoigne pas.**
    ///
    /// Un `Label` — un pictogramme et un mot que rien n'écrit — laisserait
    /// partir le brouillon sur la visibilité semée par la PORTE, sans moyen pour
    /// l'auteur d'en changer sous cette surface : de l'UI morte au sens strict de
    /// la loi 4, puisqu'elle NOMMERAIT un réglage qu'elle ne règle pas.
    ///
    /// **La FORME est celle de l'atelier** (`StoryComposerView+TopBar.visibilityMenu`),
    /// pas celle du mood : un menu qui se replie en une capsule. Le socle est une
    /// RANGÉE — le ruban de six chips du mood y mangerait toute la largeur et
    /// repousserait la flèche hors de l'écran. Les deux surfaces ne sont jamais
    /// peintes ensemble (`ComposerChromeOwnership.socleZones`), il n'y a donc pas
    /// deux contrôles pour un réglage : il y a deux FORMES, une par surface, et
    /// une seule règle de relecture (`ComposerAudienceMemory`).
    ///
    /// Il n'est peint que là où il a un objet, et il n'en a qu'un : le DOCUMENT.
    /// Sous la scène l'atelier peint le sien ; sous le mood, le ruban du bloc 3.
    ///
    /// **La pastille ouvre la vue `2l`, en feuille**, et non un `Menu` :
    ///
    /// > Un menu contextuel peut lister des CHOIX ; il ne peut pas montrer leurs
    /// > CONSÉQUENCES — combien de personnes, qui est mentionné et sous quel
    /// > mode, quels hashtags partent avec, et le fait que l'audience appartient
    /// > à la publication et non à une slide. Or ces conséquences sont tout ce
    /// > que l'écran a à dire ; le choix lui-même tient en un mot.
    var audienceChip: some View {
        Button {
            HapticFeedback.light()
            presentedPortal = .audience
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: composerVisibility.icon)
                    .accessibilityHidden(true)
                // Le mot s'efface aux paliers d'accessibilité ; le nom
                // accessible, lui, ne bouge pas (voir `ComposerSocleDensity`).
                if socleShowsLabels {
                    Text(audienceTitle)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(MeeshyColors.textPrimary(isDark: true))
            // **Une pastille de verre** (maquette `iOS.dc.html`) : le
            // socle flotte sur la scène, et le mot doit se lire sur n'importe
            // quel média. Sans mot (palier d'accessibilité), la capsule de
            // 44 pt redevient un disque. TEINTÉ du plateau : nu, le verre
            // d'iOS 26 vire au clair sous le libellé blanc.
            .padding(.horizontal, socleShowsLabels ? 14 : 0)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .contentShape(Capsule())
            .adaptiveLiquidGlass(in: Capsule(), tint: tint.color.opacity(0.55), interactive: true)
        }
        // Le LIBELLÉ reste « Audience » et ne s'échange pas contre la valeur —
        // c'est la faute que la flèche évite déjà : un contrôle qui perd son nom
        // accessible dès qu'il porte un état. La valeur est annoncée comme
        // valeur, ce que VoiceOver sait lire séparément.
        .buttonStyle(.plain)
        .accessibilityLabel(Text("composer.socle.audience", bundle: .main))
        .accessibilityValue(Text(composerVisibility.label))
        .anchoredPicker(item: $audiencePickerMode) { mode in
            AudienceUserPickerView(mode: mode, initialSelection: composerVisibilityUserIds) { ids in
                composerVisibilityUserIds = ids
            }
        }
    }

    /// Le compte ne s'affiche que là où il VEUT dire quelque chose : sous un
    /// `ONLY`/`EXCEPT` déjà renseigné. Partout ailleurs il ferait lire
    /// « Public (0) », ce qui n'est pas une audience mais une erreur apparente.
    var audienceTitle: String {
        guard composerVisibility.requiresUserSelection, !composerVisibilityUserIds.isEmpty else {
            return composerVisibility.label
        }
        return "\(composerVisibility.label) (\(composerVisibilityUserIds.count))"
    }

    /// **Choisir écrit la MÉMOIRE dans le même geste** (loi 10). Séparer les deux
    /// écritures, c'est l'occasion d'oublier la seconde — et l'audience
    /// repartirait à zéro à chaque ouverture, sans qu'aucun écran ne le dise.
    ///
    /// Un mode qui exige une liste nominative ouvre le sélecteur dans la foulée :
    /// un `ONLY` sans personne est rejeté par le gateway, et le laisser partir
    /// produirait un refus que rien à l'écran n'annonçait. L'écran historique le
    /// faisait déjà ; le meuble ne le redécouvre pas.
    ///
    /// **Ce refus est réel, et il faut le chercher au bon étage** : il n'est pas
    /// dans `PostService.createPost` — qui écrit `data.visibilityUserIds ?? []`
    /// sans rien vérifier — mais UNE COUCHE plus haut, au schéma de la route
    /// (`CreatePostSchema`, « EXCEPT and ONLY visibility require at least one
    /// userId in visibilityUserIds », 400 `VALIDATION_ERROR`). Le dire ici évite
    /// qu'une lecture du seul service conclue que la phrase ci-dessus est fausse.
    ///
    /// **L'ouverture ne SUFFIT pas, et c'est ce qui manquait.** Elle ne couvre
    /// que le chemin INTERACTIF, et même là qu'à moitié : toucher « Annuler »
    /// dans `AudienceUserPickerView` ne rappelle rien — son en-tête n'appelle
    /// `onDone` que sur « OK » — et laissait l'audience nominative debout avec
    /// une liste vide. Le chemin de RELECTURE la court-circuitait entièrement.
    /// Les deux sont fermés depuis le même lot, chacun à sa place :
    /// `ComposerAudienceMemory.remembered` ne restaure plus un mode dont la
    /// portée est une liste qu'elle ne porte pas, et
    /// `ComposerDocumentPublishGate` refuse d'armer la flèche sur une audience
    /// nominative vide.
    ///
    /// La liste n'est PAS vidée quand l'audience cesse de l'exiger : c'est la
    /// fabrique du brouillon qui l'écarte (loi 3), et la garder ici laisse
    /// l'auteur revenir sur `ONLY` sans avoir à re-sélectionner ses personnes.
    func chooseAudience(_ candidate: PostVisibility) {
        composerVisibility = candidate
        lastDocumentVisibility = candidate.rawValue
        // **Parité vie privée (T2.5).** Le consentement de trouvabilité porte
        // sur UNE publication ET UNE audience : quitter PUBLIC réarme l'opt-in
        // de découvrabilité. Sans lui, un opt-in armé en PUBLIC survivrait à un
        // resserrement puis à un ré-élargissement — le contrôle réapparaîtrait
        // DÉJÀ ON et publierait sur un consentement PÉRIMÉ que personne n'a
        // réexaminé. Le composer inline de référence le fait pour cette raison
        // exacte (`FeedView+Attachments`), et le même meuble l'applique déjà à
        // `forcePlainPost` (T2.4). `reset()` pose `isDiscoverable = false`, ce
        // qui rend `precisionToSend == nil`.
        if candidate != .public { documentDiscoverability.reset() }
        if candidate.requiresUserSelection { audiencePickerMode = candidate }
    }

    // **Le socle ne porte pas d'œil.** Le rebrancher croirait réparer un oubli :
    // l'œil montait `MeeshyScenePlayer(mode: .preview)` sur
    // `CanvasV3(migrating: viewModel.currentEffects)`, et rien ne remplit
    // `currentEffects` sous les deux surfaces où le socle est peint : le mood n'a
    // pas de canvas, le document n'a AUCUN outil d'ingestion servi (la rangée
    // n'en peint qu'un, l'emoji, qui écrit du texte et ne rapporte aucun média —
    // `ComposerDocumentTool.effect`). Il ouvrirait donc une scène VIDE — de l'UI
    // morte au sens de la loi 4, qu'aucune dette consignée n'excuse. La loi 6
    // ferme l'autre issue : un aperçu maison du texte serait un quatrième
    // chemin de rendu.
    //
    // CONDITION DE RETOUR : que la surface qui le peint ait quelque chose à
    // lire — un média ingéré côté document, un canvas côté mood. Il reviendrait
    // alors ENTRE l'audience et la flèche, rang que
    // `test_socle_peintSesZones_dansLOrdreCanonique` tient déjà pour lui, et
    // `test_lOeilEtSonLecteur_vivent_etMeurent_ensemble` exige que le lecteur
    // revienne dans le MÊME commit.

    /// **La flèche du socle PUBLIE.**
    ///
    /// Un `Label` — un témoin qui nomme la publication sans la piloter — serait de
    /// l'UI morte.
    ///
    /// **Ce que la flèche ne peut pas supposer sous la SCÈNE.** Deux blocages de la
    /// scène, tous deux dans `MeeshyUI`, fixent la forme de l'appel :
    ///
    /// - **la télécommande de l'atelier n'a pas de gate de matière.**
    ///   `ComposerPublishTrigger` entre dans `publishAllSlides()` sans repasser
    ///   par `canPublish`, `internal` à `MeeshyUI` : une pression sur une page
    ///   blanche partirait en publication. Le gate de matière est donc évalué ICI,
    ///   sur la matière que la télécommande relaie ;
    /// - **le sélecteur de l'atelier est l'UNIQUE écrivain de son audience.**
    ///   `visibilityMenu` écrit `StoryComposerView.visibility`, un `@State` privé
    ///   semé à la construction. L'audience choisie au socle voyage donc AVEC le
    ///   geste (`ComposerPublishTrigger.requestedVisibility`), jamais par un état
    ///   que l'atelier ne lirait pas.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : pas de
    /// télécommande à armer. Le gate est app-side et pur
    /// (`ComposerDocumentPublishGate`), l'audience est celle de la surface.
    /// **Ce n'est PAS un second chemin d'envoi.** Le bouton n'appelle ni
    /// service, ni file, ni endpoint : il assemble un `ComposerDocumentDraft` et
    /// le tend à `onPublishDocument`, la fermeture que le site de montage a
    /// fournie — comme `onPublishAllInBackground` pour la scène. Le meuble
    /// transmet ; il ne publie pas.
    ///
    /// **Le libellé ne s'échange pas contre un `ProgressView`** pendant l'envoi :
    /// le bouton perdrait son nom accessible à l'instant précis où il est occupé.
    /// L'état en vol est porté par `accessibilityValue`, et l'auteur le voit à la
    /// teinte qui retombe.
    /// **Ce que la flèche du socle PRESSE, selon le CHOIX du geste.**
    ///
    /// La surface est celle d'OUVERTURE ; le format et l'agencement arrivent du
    /// geste — une entrée du menu de la flèche, ou le format d'ouverture quand la
    /// composition n'appelle aucun choix. Le canal est une RÈGLE éprouvée
    /// (`ComposerPublishMenuRule.route`), plus un `switch` écrit ici.
    ///
    /// Sous l'atelier, la flèche presse la télécommande en lui apportant le
    /// format ET l'audience choisis AU MOMENT DU GESTE : c'est l'atelier qui
    /// publie. L'audience voyage avec ses personnes nommées, jamais seule.
    ///
    /// Une STORY part par le canal de la SCÈNE, jamais par le brouillon :
    /// `ComposerDocumentDraft` ne porte pas de slides. Un RÉEL part par le
    /// document : le canal de la scène publie un post PAR SLIDE, et un réel de deux
    /// photos y ferait deux posts.
    func performSoclePublish(_ choice: ComposerPublishChoice) {
        // La frise ouverte rend ses pistes à la slide AVANT l'envoi :
        // sinon un timing réglé à l'instant partirait sans elle.
        if viewModel.timelineIsOpen { viewModel.closeTimelinePanel() }
        // Le texte du post ARMÉ depuis une scène part avec elle :
        // l'atelier publie le contenu de la slide, pas `documentText`.
        if let texte = ComposerPublishMenuRule.atelierCarriedPostText(
            route: ComposerPublishMenuRule.route(surface: mountedSurface, choice: choice),
            choice: choice, documentText: documentText) {
            viewModel.applyContentText(texte)
        }
        switch ComposerPublishMenuRule.dispatch(surface: mountedSurface, choice: choice) {
        case .atelier(let type, let alsoAsReel):
            publishTrigger.requestPublish(
                as: type,
                visibility: composerVisibility.rawValue,
                visibilityUserIds: composerVisibilityUserIds,
                alsoAsReel: alsoAsReel
            )
        case .storyScene(let format, let alsoAsReel): publishStoryScene(as: format, alsoAsReel: alsoAsReel)
        case .document(let choice): publishDocument(choice)
        case .unsupported: refuseUnsupportedFormat()
        }
    }

    /// **Publier les unités d'histoire** — le canal que l'atelier utilisait,
    /// pressé par le meuble puisque l'atelier n'est plus monté.
    ///
    /// Les treize arguments sont ceux que `StoryComposerView+Publication`
    /// assemble, lus sur le MÊME modèle de vue : le meuble ne recalcule rien,
    /// il relaie.
    ///
    /// ## L'accessibilité VOYAGE par ici
    ///
    /// La remise du meuble porte les deux cartes d'accessibilité du meuble :
    /// l'éditeur de LÉGENDE (`documentMediaCaptions`) et l'éditeur de TEXTE
    /// ALTERNATIF (`documentMediaAlts`). La greffe est câblée sur les DEUX bouches
    /// du même entonnoir : ce site et la remise à l'ATELIER
    /// (`MeeshyComposerHost+Surfaces`). Une seule des deux ferait partir une story
    /// publiée depuis le socle sans l'une ni l'autre carte, silencieusement,
    /// pendant que les deux champs s'affichent, se valident et se relisent à
    /// l'écran.
    ///
    /// > **Un commentaire qui justifie une valeur PAR une absence se périme
    /// > quand l'absence se comble — et il se périme en SILENCE**, puisque
    /// > combler l'absence se fait ailleurs, dans le fichier qui ouvre la porte.
    /// > La question à poser en ouvrant une porte de saisie n'est pas « où
    /// > est-ce lu ? » mais « **quels sites remettent cette charge, et les
    /// > ai-je TOUS visités ?** ». Ils étaient deux ; un seul avait la greffe.
    ///
    /// `accessibilityCarryingComposerCaptions` est le site UNIQUE de la greffe : ce
    /// qui change ici est la BASE qu'on lui donne — `.empty`, parce que le meuble
    /// n'a pas de magasin d'atelier à relayer sur ce chemin, et c'est honnête.
    func publishStoryScene(as format: ComposerFormat, alsoAsReel: Bool = false) {
        guard canPublishDocument(as: format) else { return }
        isPublishingDocument = true
        let accepted = onPublishAllInBackground(
            viewModel.slides,
            viewModel.slideImages,
            viewModel.loadedImages,
            viewModel.loadedVideoURLs,
            viewModel.loadedAudioURLs,
            viewModel.loadedStickerAnimations,
            documentLanguage,
            composerVisibility.rawValue,
            composerVisibilityUserIds,
            viewModel.draftId,
            composerReferences,
            accessibilityCarryingComposerCaptions(.empty, slides: viewModel.slides)
                .carryingAlsoAsReel(ComposerPublishTrigger.publishedAlsoAsReel(requested: alsoAsReel,
                                                                               served: format.postType)),
            format.postType
        )
        isPublishingDocument = false
        if accepted { discardAutosavedDraft(); onDismiss() }
    }

    /// **Le refus d'un format qu'aucun canal ne sait porter.**
    ///
    /// Il DIT, là où la flèche ne ferait rien : un réel composé depuis le Feed
    /// atteint `DocumentComposerDoor`, qui le refuse à juste titre — son
    /// brouillon ne porte pas de slides — et l'auteur n'en verrait rien.
    ///
    /// La sortie est NOMMÉE plutôt que repliée dans un `default` muet : c'est
    /// elle qui rend le trou visible dans le code comme à l'écran, et elle
    /// disparaîtra avec le canal du réel, pas avant.
    func refuseUnsupportedFormat() {
        HapticFeedback.error()
        FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishFormatUnsupported)
    }

    /// **Le LIBELLÉ de « Publier » — écrit une fois, habillé deux fois**.
    ///
    /// Le socle et l'en-tête du mood peignent le MÊME geste avec deux actions
    /// différentes (`performSoclePublish` / `publishDocument`) : c'est l'ACTION
    /// qui diffère, jamais ce que le bouton DIT. Deux compositions du même
    /// libellé divergeraient au premier ajustement — une icône `arrow.up.circle`
    /// d'un côté, `arrow.up` de l'autre, sur un écran que l'auteur croit unique.
    ///
    /// La réduction aux paliers d'accessibilité vit donc ici aussi :
    /// sans elle, en allemand à `accessibility-XXXL`, « Veröffentlichen » se
    /// casse en syllabes empilées — l'action TERMINALE du composer devenue une
    /// colonne de fragments.
    var publishCapsuleLabel: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "arrow.up")
                .accessibilityHidden(true)
            if socleShowsLabels {
                // La partie principale NOMME le format qui partira si
                // l'auteur ne touche pas au chevron ; le mood garde « Publier ».
                if let titre = ComposerPublishMenuCopy.publishTitle(for: armedChoice) {
                    Text(titre)
                        .lineLimit(1)
                } else {
                    Text("composer.socle.publish", bundle: .main)
                        .lineLimit(1)
                }
            }
        }
        .font(.footnote.weight(.bold))
        .foregroundColor(.white)
        .padding(.horizontal, MeeshySpacing.mdPlus)
        // Plancher HIG de 44 pt, comme sa jumelle — pas
        // `ComposerControlMetrics.visualDiameter` (36 pt), qui dimensionne le
        // CERCLE de la croix et dont le complément de contact est `internal` à
        // `MeeshyUI`.
        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
    }

    /// **La capsule PROÉMINENTE — l'habillage commun des deux flèches.**
    ///
    /// « Publier » est plus gras, couleur primaire de l'application, dans un
    /// liquidglass : peint en `indigo400` nu, le geste terminal du composer se
    /// lirait comme un lien. Le socle et l'en-tête du mood portent le MÊME
    /// traitement.
    ///
    /// `brandPrimary`, pas `indigo500` en dur : c'est le MÊME jeton (alias), et
    /// celui que la flèche de `StoryComposerView+TopBar` utilise déjà — un seul
    /// nom pour un même fond de bouton proéminent à travers le composer.
    /// `.opacity` marque le refus du gate : un remplissage plein aurait l'air
    /// armé même quand rien ne peut partir.
    func publishCapsule<Contenu: View>(_ contenu: Contenu) -> some View {
        // **L'indice de blocage se VOIT, il ne s'entend pas seulement.** Voir
        // `publishBlockedNotice`.
        //
        // Un EMPILEMENT, et non un `.overlay` : mesuré au simulateur, un overlay
        // — même avec `.alignmentGuide(.top)` calé sur le bas du texte — reste
        // CENTRÉ sur la capsule et rend l'indice illisible PAR-DESSUS le mot
        // « Publier ». `alignmentGuide` gouverne l'alignement dans une PILE ;
        // `.overlay` ne le consulte pas. La pile, elle, n'a rien à supposer :
        // elle place l'un au-dessus de l'autre quelle que soit la hauteur du
        // texte — deux lignes en français, trois en allemand.
        VStack(alignment: .trailing, spacing: MeeshySpacing.xsPlus) {
            publishBlockedNotice
            contenu
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
                .opacity(canPublishDocument ? 1 : 0.45)
                .disabled(!canPublishDocument)
                // Le nom accessible est posé EXPLICITEMENT : sans le `Text`, la
                // flèche perdrait son nom à l'instant même où elle devient
                // compacte — le défaut que `StatusComposerView` a dû corriger,
                // dans l'autre sens.
                .accessibilityLabel(Text("composer.socle.publish", bundle: .main))
                .accessibilityValue(isPublishingDocument ? ComposerSocleCopy.publishInProgress : "")
                .accessibilityHint(publishArrowHint)
        }
    }

    /// **Pourquoi la flèche est grise — DIT à l'œil.**
    ///
    /// ## Le défaut à éviter
    ///
    /// Photo posée, texte tapé, flèche grise et pressée : **rien**. Ni post, ni
    /// mot, ni mouvement. `publishBlockedHint` est calculée, traduite en sept
    /// langues, et sait distinguer les surfaces — mais servie seulement à
    /// **`.accessibilityHint`**, un utilisateur de VoiceOver s'entend expliquer
    /// pourquoi la flèche ne part pas, et **un utilisateur voyant voit une flèche
    /// grise et rien d'autre.**
    ///
    /// > **Une explication réservée à VoiceOver n'est pas une explication, c'est
    /// > une asymétrie.** La règle, la phrase et les traductions ne suffisent pas :
    /// > il faut le pixel. C'est la forme du « qui AFFICHE ce que tu résous ? » du
    /// > Prisme, appliquée à un texte qu'on croirait rendu parce qu'il est PASSÉ à
    /// > un modificateur.
    ///
    /// ## Pourquoi un overlay, et pas un toast au tap
    ///
    /// La capsule est `.disabled` : aucun tap ne l'atteint, donc aucun geste ne
    /// peut déclencher un message. L'explication doit être là AVANT qu'on
    /// essaie — c'est d'ailleurs mieux : elle évite l'essai plutôt que de le
    /// commenter.
    ///
    /// Vide quand il n'y a rien à dire (`publishBlockedHint` rend `""` dès que
    /// la flèche est armée, ou quand l'indice serait FAUX — audience nominative
    /// incomplète). Un `EmptyView` alors, jamais une bulle vide : la règle de
    /// l'indice décide déjà, cette vue ne la re-décide pas.
    @ViewBuilder
    var publishBlockedNotice: some View {
        if !publishBlockedHint.isEmpty {
            Text(publishBlockedHint)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundStyle(MeeshyColors.textSecondary(isDark: true))
                // TROIS lignes, pas deux : à 190 pt la phrase française se
                // coupait sur « une photo ou u… », mesuré au simulateur. Le
                // nombre de lignes se règle sur la langue la PLUS longue —
                // l'allemand — jamais sur celle qu'on a sous les yeux.
                .lineLimit(3)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 240, alignment: .trailing)
                .allowsHitTesting(false)
                // VoiceOver l'entend déjà par `accessibilityHint` sur la
                // capsule ; le lire une seconde fois ici ferait entendre la
                // même phrase deux fois pour un seul fait.
                .accessibilityHidden(true)
        }
    }

    /// **La flèche du socle — une capsule SCINDÉE `[↑ Publier la story | ⌄]`**
    /// La partie principale publie ce
    /// qu'elle nomme — le format de la porte tant que le chevron n'a rien armé ;
    /// le chevron ouvre « Publier comme » pour CHOISIR un autre format (et, pour
    /// un post à plusieurs scènes, l'agencement) SANS publier : seul l'appui sur
    /// Publier envoie. Sans autre format à
    /// offrir, la capsule reste entière. Les deux passent par le MÊME habillage,
    /// qui porte le gate.
    var publishButton: some View {
        reelOfferPresented(publishCapsule(
            HStack(spacing: 0) {
                Button {
                    // Un post à une seule vidéo demande d'abord « Publier en
                    // réel ? » ; tout le reste part directement.
                    requestSoclePublish(armedChoice)
                } label: {
                    publishCapsuleLabel
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerPublishMenuCopy.publishTitle(for: armedChoice)
                                    ?? String(localized: "composer.socle.publish", bundle: .main))
                if let entries = publishMenuEntries {
                    Rectangle()
                        .fill(Color.white.opacity(0.35))
                        .frame(width: 1, height: 20)
                        .accessibilityHidden(true)
                    ComposerPublishMenu(entries: entries, armed: armedChoice,
                                        companionReelOffered: companionReelOffered,
                                        onChoose: { chooseArmedPublish($0) }) {
                        publishChevronLabel
                    }
                    .accessibilityLabel(ComposerPublishMenuCopy.title)
                    .accessibilityHint(ComposerPublishMenuCopy.hint)
                }
            }
            .accessibilityElement(children: .contain)
        ))
    }

    /// **Ce que la partie principale publie** — la lecture de
    /// `ComposerPublishMenuRule.armed`, jamais une condition écrite dans le corps.
    var armedChoice: ComposerPublishChoice {
        ComposerPublishMenuRule.armed(chosen: armedPublishChoice,
                                      defaultFormat: selectedFormat,
                                      entries: publishMenuEntries,
                                      companionReelOffered: companionReelOffered)
    }

    /// **La story peut-elle partir AUSSI en réel ?** — la lecture de
    /// `ComposerPublishMenuRule.companionReelOffered` sur le menu du moment.
    var companionReelOffered: Bool {
        ComposerPublishMenuRule.companionReelOffered(entries: publishMenuEntries,
                                                     slideCount: viewModel.slides.count,
                                                     isRepost: intent.origin.repostedPostId != nil)
    }

    /// Le chevron — 44 pt de cible, comme la partie principale.
    var publishChevronLabel: some View {
        Image(systemName: "chevron.down")
            .font(.footnote.weight(.bold))
            .foregroundColor(.white)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .contentShape(Rectangle())
    }

    /// **Les entrées du menu, ou `nil`** — la LECTURE de
    /// `ComposerPublishMenuRule.menu`, jamais une condition écrite dans le corps.
    ///
    /// Les candidats sont l'offre de la porte AVEC le réel ouvert : un réel que
    /// la composition ne qualifie pas encore reste au menu, grisé avec sa raison.
    /// Les médias se comptent sur TOUTES les slides — `reelGate`, lui, ne lit que
    /// la slide courante.
    var publishMenuEntries: [ComposerPublishMenuRule.Entry]? {
        let fonds = Set(viewModel.slideImages.keys)
        return ComposerPublishMenuRule.menu(
            candidates: ComposerProfile.profile(
                for: intent.origin,
                compositionQualifiesAsReel: true,
                compositionQualifiesAsMood: moodGate
            ).offeredFormats,
            offered: profile.offeredFormats,
            carriesMoreThanText: !documentLocalMedia.isEmpty || documentHasScene,
            slideCount: viewModel.slides.count,
            layoutsTravel: ComposerPublishMenuRule.documentCarriesEveryMedia(
                slides: viewModel.slides,
                slideImageIds: fonds,
                bridgedObjectIds: Set(documentMediaObjectIdBySource.values))
        )
    }

    /// **Ce que VoiceOver entend sur la flèche** — l'indice de blocage quand elle
    /// refuse, l'annonce du choix quand elle ouvre le menu. Un seul site :
    /// deux `accessibilityHint` empilés laisseraient le système trancher.
    var publishArrowHint: String {
        guard publishBlockedHint.isEmpty, publishMenuEntries != nil else { return publishBlockedHint }
        return ComposerPublishMenuCopy.hint
    }

    /// **La flèche PUBLIER de l'en-tête du mood** — même geste, même gate, même
    /// accessibilité que `publishButton` ci-dessus (`publishDocument()`,
    /// `canPublishDocument`, `publishBlockedHint`) : SEUL l'endroit change.
    /// Deux écritures d'un même bouton diverger­aient au premier ajustement du
    /// gate, donc les trois propriétés partagées restent l'UNIQUE source —
    /// cette vue ne fait qu'habiller la même action en pastille de verre.
    ///
    /// **Verre PROÉMINENT (`.adaptiveGlassProminent`), pas régulier** : c'est
    /// l'action TERMINALE de la feuille — le même traitement que la flèche de
    /// `StoryComposerView+TopBar` (`adaptiveGlassProminent(in:tint:)`), pour
    /// que le geste « publier depuis l'en-tête d'un composer » ait partout le
    /// même relief. `.opacity` marque l'état désactivé : un remplissage plein
    /// aurait l'air armé même quand le gate refuse.
    ///
    /// **Pas de `.composerHitTarget()`** — `internal` à `MeeshyUI`,
    /// inatteignable depuis l'app. Sans objet de toute façon : la capsule fait
    /// déjà `ComposerControlMetrics.visualDiameter` (36 pt) de haut, et le
    /// texte + les deux paddings horizontaux de 14 pt la portent bien au-delà
    /// des 44 pt HIG en largeur.
    ///
    /// **Sans un mot, la flèche DEMANDE avant de publier** :
    /// `ComposerMoodPublishGate` reçoit le geste ci-dessus tel quel et ne
    /// décide que du moment où il part — il n'ouvre aucun second chemin.
    var moodHeaderPublishButton: some View {
        publishCapsule(
            ComposerMoodPublishGate(
                text: documentText,
                isRepublication: intent.origin.repostedPostId != nil,
                publish: { publishDocument(ComposerPublishChoice(format: selectedFormat, layout: nil)) }
            ) {
                publishCapsuleLabel
            }
        )
    }

    /// Le gate de MATIÈRE, lu deux fois — pour teindre la flèche et pour la
    /// désactiver. UNE source : l'écran historique du mood écrivait la même règle
    /// deux fois (`guard let emoji` dans l'action, `.disabled(selectedEmoji == nil
    /// || isPublishing)` sur le bouton), et deux écritures d'une règle sont deux
    /// occasions de la corriger à moitié.
    var canPublishDocument: Bool {
        canPublishDocument(as: selectedFormat)
    }

    /// Le même gate, pour le format que le GESTE publie : le menu peut
    /// publier en post une composition ouverte en story, et une story compte un
    /// fond choisi comme matière là où un post exige un objet.
    func canPublishDocument(as format: ComposerFormat) -> Bool {
        ComposerDocumentPublishGate.canPublish(
            surface: mountedSurface,
            emoji: moodEmoji,
            text: documentText,
            visibility: composerVisibility,
            visibilityUserIds: composerVisibilityUserIds,
            isPublishing: isPublishingDocument,
            repostOfId: intent.origin.repostedPostId,
            // Sous la scène, la matière est celle de l'ATELIER, relayée par la
            // télécommande. Le meuble ne la recalcule pas : il ne voit
            // ni le son de fond ni les traits de dessin.
            atelierHasMatter: publishTrigger.canPublish,
            // La matière que le MEUBLE voit, lui — celle que l'écran montre
            // déjà en vignettes et en chip de lieu.
            //
            // **Et, pour une STORY, ce que ses canvas portent.** Le gate mesure les trois
            // choses qu'un POST compose — texte, médias joints, lieu — dont une story ne
            // remplit aucune : elle se compose EN POSANT des objets sur ses unités
            // d'histoire. Sans ce terme, la flèche refuserait en silence sur un écran
            // plein de travail.
            //
            // La règle est appelée, jamais réécrite ici : c'est elle qui sait que la slide
            // SEMÉE au montage ne compte pas comme de la matière.
            //
            // **Ce terme couvre la STORY et le POST.** Il existe pour ne pas armer une
            // flèche dont le canal refuserait ensuite, et le canal accepte les deux :
            // `POST /posts` accepte un corps dont `content` est vide, sans aucun média,
            // porté par son seul `storyEffects.canvasV3`, et rend le canvas intact
            // (mesuré contre la passerelle de staging).
            //
            // > **Une restriction survit à la condition qui la justifiait.** Aucun témoin
            // > ne relie une garde de CLIENT à ce que le SERVEUR accepte : une garde plus
            // > étroite que le serveur laisse la flèche éteinte sur un canvas de texte,
            // > de dessin ou à fond de couleur — un écran plein de travail.
            //
            // Le RÉEL reste dehors : son canal est `.unsupported`
            // (`ComposerPublishChannel`). L'y faire entrer armerait une flèche qui promet
            // ce que rien ne livre.
            //
            // **Et la matière se mesure comme le PLAN la mesure.** Un post exige un OBJET
            // — un fond de couleur nu ne suffit pas ; une story garde sa règle, où un fond
            // CHOISI est de la matière. Servir la même règle aux deux ferait mentir la
            // flèche chez l'un des deux : armée sur un post que le plan refuse, ou éteinte
            // sur une story qu'il accepte.
            hasMedia: !documentLocalMedia.isEmpty
                || (ComposerPublishChannel.channel(for: format) != .unsupported
                    && ComposerStoryCanvas.hasPublishableCanvas(
                        format: format,
                        slides: viewModel.slides,
                        // L'image de fond ne vit pas dans `effects` : sans elle
                        // une story-photo n'armerait pas la flèche.
                        slideImageIds: Set(viewModel.slideImages.keys))),
            hasLocation: documentLocation != nil
        )
    }

    /// Ce que VoiceOver annonce quand la flèche refuse. Vide pendant l'envoi :
    /// « choisissez un emoji » serait faux d'un mood qui en a un et qui part.
    ///
    /// **Et vide aussi quand c'est l'AUDIENCE qui retient**, pour la même
    /// raison, une phrase plus loin : un mood peut avoir son emoji et rester
    /// bloqué par un `ONLY` sans personne. Dicter « choisissez un emoji » y
    /// prescrirait un geste qui ne débloque rien — un indice FAUX coûte plus
    /// qu'un indice absent. La condition n'est pas réécrite ici : c'est la même
    /// règle que le gate lit, `ComposerDocumentPublishGate.audienceIsComplete`.
    ///
    /// **Aucune clé neuve, et c'est une contrainte, pas une paresse** : le
    /// catalogue est à SEPT langues avec un cliquet français à zéro tolérance,
    /// et aucune phrase existante ne dit « nommez au moins une personne ». Elle
    /// s'écrira dans le lot qui possède le catalogue.
    /// **Rien à publier ⇒ pas de bouton**, et aucune phrase « ajoutez au moins un
    /// élément » : c'est un fait connu de tous. Une
    /// audience incomplète, elle, garde la capsule et son indice : rien d'autre
    /// à l'écran ne la signale.
    var socleHasNothingToPublish: Bool {
        !canPublishDocument && !isPublishingDocument
            && ComposerDocumentPublishGate.audienceIsComplete(composerVisibility,
                                                              userIds: composerVisibilityUserIds)
    }

    var publishBlockedHint: String {
        guard !canPublishDocument, !isPublishingDocument else { return "" }
        // L'audience passe AVANT la surface, et l'ordre porte la règle : les
        // deux causes peuvent être vraies ensemble (composer vide ET personne
        // choisie), et c'est l'audience qu'il faut dire — elle seule n'est
        // signalée par rien d'autre à l'écran. Un composer vide, lui, se voit.
        guard ComposerDocumentPublishGate.audienceIsComplete(
            composerVisibility,
            userIds: composerVisibilityUserIds
        ) else { return ComposerSocleCopy.publishBlockedAudienceHint }
        return ""
    }

    /// Le meuble TRANSMET : il ne connaît ni service, ni file, ni endpoint.
    ///
    /// Il referme le composer sur une ACCEPTATION et le laisse ouvert sur un
    /// refus. Fermer sur un `false` jetterait ce que l'auteur vient d'écrire, et
    /// c'est le seul geste de cette méthode qu'aucune garde de source ne pourrait
    /// rattraper — un composer refermé sur un envoi perdu reste PLAUSIBLE : il se
    /// ferme exactement comme quand tout va bien.
    ///
    /// **Un refus EXISTE depuis le lot 4.10, et il faut lire lequel au mot près.**
    /// Le `Bool` de `onPublishDocument` a été documenté comme une ACCEPTATION
    /// pendant deux lots sans qu'aucun écrivain n'émette jamais `false` : un
    /// commentaire qui annonce ce que le code ne tient pas devient la loi que
    /// lira la session suivante. Ce n'est plus le cas —
    /// `DocumentComposerDoor.publish` en émet trois : un plan qui refuse (format
    /// non-post, brouillon sans matière, chemin non durable), un publieur qui
    /// refuse la ligne, un publieur MUET. La branche du refus est donc
    /// atteignable, et `test_lEnvoiDuSocle_neFermeQueSurUneAcceptation_etNeJettePasLaSaisie`
    /// la garde.
    ///
    /// **`MoodComposerDoor` en émet sur UNE de ses deux branches**, et il faut
    /// lire laquelle : son ANCRAGE remonte le refus (`anchorStatusAsPost` rend
    /// un `Bool` — 403 `REPOST_AUDIENCE_WIDENING`, coupure, hors-ligne), son
    /// MIROIR se tait. `StatusViewModel.setStatus` ne rend rien — elle avale
    /// l'erreur réseau dans un `catch` qui se contente d'un toast —, et sa file
    /// durable n'est atteinte que si `isOffline()` répond oui. Un gateway qui
    /// répond 500 referme donc le composer sur cette branche-là et perd l'emoji,
    /// la phrase, l'audience et les mentions. **Dette CONSIGNÉE, condition de
    /// levée nommée** : que `setStatus` rende un résultat, comme `createPost` le
    /// fait déjà par `publishSuccess` / `publishError`.
    func publishDocument(_ choice: ComposerPublishChoice) {
        // **Un refus qui SE DIT.**
        //
        // Ce `guard` rendrait la main SANS un mot : photo posée, texte tapé par la
        // porte CONTENU, flèche pressée — **aucun post créé, et le composer reste
        // ouvert**. L'auteur ne verrait rien qui distingue « ça part » de « ça n'est
        // pas parti » ; il presserait encore, et composerait peut-être une seconde
        // fois ce qu'il vient d'écrire.
        //
        // > **Un refus muet est PIRE qu'une donnée perdue.** Une publication
        // > incomplète laisse quelque chose à réparer ; une publication qui
        // > n'a pas eu lieu et ne le dit pas laisse l'auteur croire qu'elle a
        // > eu lieu. L'étage du dessous l'applique déjà DEUX fois —
        // > `ComposerDocumentDurablePublisher.refuse()` et
        // > `DocumentComposerDoor.refuse()` peignent tous deux un toast — et elle
        // > vaut aussi pour l'étage qui les APPELLE.
        //
        // Les deux branches sont distinctes : `canPublishDocument`
        // faux est un état NORMAL (rien à publier — pas de texte, pas de
        // média), que la flèche grisée dit déjà. Un brouillon NUL, lui, est une
        // anomalie : la flèche est armée et rien n'est parti.
        guard canPublishDocument(as: choice.format) else { return }
        guard let draft = documentDraft(for: choice) else {
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ComposerDocumentCopy.publishError)
            return
        }
        // Le palier RETENU pour la PROCHAINE publication est écrit ICI, au
        // moment où il SERT (`FeedNearbyDiscoverability.remember(nearbyDiscoverability)`) :
        // la spec parle du dernier choix « utilisé », pas du dernier survolé.
        if documentOffersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(documentDiscoverability)
        }
        isPublishingDocument = true
        Task {
            let accepted = await onPublishDocument(draft)
            isPublishingDocument = false
            if accepted { discardAutosavedDraft(); onDismiss() }
        }
    }
}
