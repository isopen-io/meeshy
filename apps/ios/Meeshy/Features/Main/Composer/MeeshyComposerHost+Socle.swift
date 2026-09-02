import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Le chrome de PUBLICATION** — le socle qui ne bouge jamais (loi 5), son
// audience, son œil, sa flèche, et le brouillon qu'ils remettent.
// Extrait de `MeeshyComposerHost.swift` au #4102.

extension MeeshyComposerHost {

    // MARK: - Le socle — jamais conditionnel à la PORTE

    /// Le point fixe du composer, et il l'est resté : ce qui varie n'est pas la
    /// porte, c'est la SURFACE.
    ///
    /// La loi 5 interdit qu'il se réorganise selon la porte d'entrée. Elle n'a
    /// jamais dit qu'il peignait une commande sans objet — il s'efface déjà
    /// devant l'atelier, qui peint les mêmes zones (`body`, plus haut). Le lot 4
    /// tient la même phrase jusqu'au bout : l'audience n'est pas peinte là où la
    /// surface porte son propre sélecteur, et l'œil ne l'est que là où il a un
    /// canvas à lire — le DOCUMENT, depuis que chaque média du post y est une
    /// slide (#4038). Sous le mood il n'y a toujours aucun canvas, et il n'y
    /// est donc toujours pas peint.
    ///
    /// Ce qui RESTE peint, en revanche, tient : l'audience est un vrai
    /// sélecteur avec sa mémoire, la flèche un vrai bouton avec son gate de
    /// matière. Un socle qui nomme sans faire est le motif que ce chantier
    /// retire, pas celui qu'il installe.
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
        HStack(spacing: 10) {
            if paintedSocleZones.contains(.audience) { audienceChip }
            Spacer()
            if paintedSocleZones.contains(.preview) { previewButton }
            publishButton
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }


    // **LA PASTILLE DE SON A QUITTÉ LE SOCLE** (#4669, directive porteur
    // 2026-09-01).
    //
    // > « On n'a plus besoin du bouton ajouter un son en bas. »
    //
    // Elle y était entrée pour une bonne raison — la porte du son était
    // INATTEIGNABLE depuis le document, un défaut de chemin établi au
    // simulateur le 2026-08-30. #4657 a ouvert deux autres chemins vers la MÊME
    // feuille (l'outil micro de la rangée du document, la porte son du rail de
    // la scène), et #4668 a fait de la pastille près de l'avatar le bouton
    // d'édition du son de fond. La raison d'être de celle-ci a donc disparu, et
    // ce qui restait était un doublon posé sur la rangée de l'ENVOI.
    //
    // Deux niveaux du modèle vivaient dans une seule rangée : l'audience et
    // « Publier » décident de ce qui PART, une entrée de son décide de ce qu'on
    // COMPOSE. Le doigt ne pouvait pas les distinguer.
    //
    // Bénéfice mesuré au passage : le socle cesse de déborder du viewport dès
    // qu'un son porte un vrai crédit (#4582) — c'était sa seule zone à largeur
    // non bornée.
    //
    // Ce que la pastille SAVAIT ne s'est pas perdu avec elle : sa composition
    // de crédit (titre · @auteur · durée) a suivi le son jusqu'à la pastille de
    // l'avatar, qui la rend. Le retirer sans emporter cette moitié aurait fait
    // disparaître l'attribution d'un son emprunté partout, en silence.
    //
    // Elle vit depuis la fusion du 2026-09-01 en DEUX morceaux, séparés par ce
    // dont chacun dépend : `StoryAudioIdentity.attribution` (SDK) pour ce qui
    // dépend de la PISTE — titre et crédit, servis seulement à un emprunt — et
    // `ComposerSoundCredit` pour ce qui dépend du LECTEUR, sa durée écrite pour
    // l'œil ou dite à voix haute.

    // **L'HISTORIQUE A QUITTÉ LE SOCLE** (#4586, directive porteur 2026-08-31).
    //
    // > « À droite, ça agit sur les dimensions des objets, + undo/redo devrait
    // > y être. »
    //
    // Ce qu'il défait, ce sont des gestes sur les OBJETS — poser un texte,
    // déplacer un média, tracer. Ici il voisinait avec l'audience et le bouton
    // publier, qui décident de l'ENVOI : la zone dit « ce qui part »,
    // l'historique dit « ce que j'ai fait ». Deux niveaux du modèle dans une
    // seule rangée, et le doigt ne pouvait pas les distinguer.
    //
    // Bénéfice mesurable au passage : le socle perd deux entrées, et c'est lui
    // qui déborde du viewport dès que la pastille de son porte un vrai crédit
    // (#4582).
    //
    // `ComposerHistoryService.servesHistory` reste le juge unique de « cet
    // écran sert-il l'historique ? » — seule la PLACE a changé, jamais la
    // question. Elle est posée par `MeeshyComposerHost+Surfaces`.

    /// **L'œil — voir le post COMME IL SERA LU, avant de le publier.**
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
    /// **Sous la SCÈNE, l'œil est EXÉCUTÉ par l'atelier** (#4135) — le meuble ne
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

    var previewButton: some View {
        Button {
            performSoclePreview()
        } label: {
            Image(systemName: "eye")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(String(
            localized: "composer.a11y.preview",
            defaultValue: "Aperçu", bundle: .main
        )))
    }

    /// **L'audience du socle CHOISIT — elle ne témoigne plus.**
    ///
    /// Elle fut un `Label` : un pictogramme et un mot, que rien n'écrivait. Le
    /// brouillon partait alors sur la visibilité semée par la PORTE, et l'auteur
    /// n'avait aucun moyen d'en changer sous cette surface. C'était la première
    /// des deux affordances sans objet qui retenaient l'éventail au lot 4.7 —
    /// et de l'UI morte au sens strict de la loi 4, puisqu'elle NOMMAIT un
    /// réglage qu'elle ne réglait pas.
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
    /// **Ce n'est plus un `Menu` depuis le 2026-08-31** (#4636, directive
    /// porteur) : la pastille ouvre la vue `2l`, en feuille.
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
            HStack(spacing: 4) {
                Image(systemName: composerVisibility.icon)
                    .accessibilityHidden(true)
                // #4057 — le mot s'efface aux paliers d'accessibilité ; le nom
                // accessible, lui, ne bouge pas (voir `ComposerSocleDensity`).
                if socleShowsLabels {
                    Text(audienceTitle)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.semibold))
            .foregroundColor(MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: 44, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        // Le LIBELLÉ reste « Audience » et ne s'échange pas contre la valeur —
        // c'est la faute que la flèche évite déjà : un contrôle qui perd son nom
        // accessible dès qu'il porte un état. La valeur est annoncée comme
        // valeur, ce que VoiceOver sait lire séparément.
        .buttonStyle(.plain)
        .accessibilityLabel(Text("composer.socle.audience", bundle: .main))
        .accessibilityValue(Text(composerVisibility.label))
        .sheet(item: $audiencePickerMode) { mode in
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

    // L'ŒIL DU SOCLE A ÉTÉ RETIRÉ le 2026-08-24 (lot 4.9), avec son lecteur, son
    // document migré et ses trois états de lecture. Il est écrit ici parce
    // qu'une session le rebrancherait sinon en croyant réparer un oubli.
    //
    // Il montait `MeeshyScenePlayer(mode: .preview)` sur
    // `CanvasV3(migrating: viewModel.currentEffects)`, et rien ne remplit
    // `currentEffects` sous les deux surfaces où le socle est peint : le mood n'a
    // pas de canvas, le document n'a AUCUN outil d'ingestion servi (la rangée
    // n'en peint qu'un, l'emoji, qui écrit du texte et ne rapporte aucun média —
    // `ComposerDocumentTool.effect`). L'œil ouvrait donc une scène VIDE — de l'UI
    // morte au sens de la loi 4, qu'aucune dette consignée n'excuse. La loi 6
    // fermait l'autre issue : un aperçu maison du texte serait un quatrième
    // chemin de rendu.
    //
    // CONDITION DE RETOUR : que la surface qui le peint ait quelque chose à
    // lire — un média ingéré côté document, un canvas côté mood. Il revient
    // alors ENTRE l'audience et la flèche, rang que
    // `test_socle_peintSesZones_dansLOrdreCanonique` tient déjà pour lui, et
    // `test_lOeilEtSonLecteur_vivent_etMeurent_ensemble` exige que le lecteur
    // revienne dans le MÊME commit.

    /// **La flèche du socle PUBLIE — sous les surfaces qui n'ont pas d'atelier.**
    ///
    /// Elle fut un `Label` : un témoin qui nommait la publication sans la
    /// piloter. Ce n'était pas un provisoire mou mais l'état exact où V3-2 avait
    /// dû s'arrêter, et le lot 4 ne le lève que là où les raisons de s'arrêter
    /// n'ont pas d'objet.
    ///
    /// **Ce qui a changé, et ce qui n'a PAS changé.** Les deux blocages mesurés
    /// sont des blocages de la SCÈNE, et ils tiennent toujours pour elle :
    ///
    /// - **la télécommande de l'atelier n'a pas de gate de matière.**
    ///   `ComposerPublishTrigger` entre dans `publishAllSlides()` sans repasser
    ///   par `canPublish`, `internal` à `MeeshyUI` : une pression sur une page
    ///   blanche partirait en publication. **Levée** : que l'armement suive ce
    ///   gate, ou que le gate devienne lisible app-side ;
    /// - **le socle ne sait pas CHOISIR l'audience de l'atelier.**
    ///   `visibilityMenu` en est l'unique écrivain, et le sélecteur que le socle
    ///   a gagné au lot 4.9 écrit `composerVisibility`, que l'atelier ne lit
    ///   jamais (`StoryComposerView.visibility` est un `@State` privé semé à la
    ///   construction). Passer `chromeOwner: .host` sous la scène retirerait
    ///   donc `visibilityMenu` en échange d'un contrôle qui ne gouverne rien.
    ///   **Levée** : que l'atelier prenne son audience en `@Binding`.
    ///
    /// Sous le document et sous le mood, **il n'y a pas d'atelier** : pas de
    /// télécommande à armer, pas de `visibilityMenu` à retirer. Le gate est
    /// app-side et pur (`ComposerDocumentPublishGate`), l'audience est celle de
    /// la surface. Les deux raisons ne s'appliquent pas, et une constante qui les
    /// faisait valoir pour les trois surfaces était une constante mal placée.
    ///
    /// **Ce n'est toujours PAS un second chemin d'envoi.** Le bouton n'appelle ni
    /// service, ni file, ni endpoint : il assemble un `ComposerDocumentDraft` et
    /// le tend à `onPublishDocument`, la fermeture que le site de montage a
    /// fournie — comme `onPublishAllInBackground` pour la scène. Le meuble
    /// transmet ; il ne publie pas.
    ///
    /// **Le libellé ne s'échange pas contre un `ProgressView`** pendant l'envoi.
    /// C'est le défaut que `StatusComposerView` a dû corriger : le bouton perdait
    /// son nom accessible à l'instant précis où il était occupé. L'état en vol
    /// est porté par `accessibilityValue`, et l'auteur le voit à la teinte qui
    /// retombe.
    /// **Ce que la flèche du socle PRESSE, selon la surface** (#4135).
    ///
    /// Sous la scène, elle ne fabrique aucun brouillon : elle presse la
    /// télécommande, en lui apportant le format ET l'audience choisis AU MOMENT
    /// DU GESTE. C'est l'atelier qui publie — un second chemin d'envoi côté
    /// meuble est ce que la doctrine, C2 et le lot 7 interdisent tous les trois.
    ///
    /// L'audience voyage avec ses personnes nommées, jamais seule : un mode sans
    /// sa liste publierait vers un ensemble que personne n'a choisi.
    func performSoclePublish() {
        switch mountedSurface {
        case .scene:
            publishTrigger.requestPublish(
                as: selectedFormat.postType,
                visibility: composerVisibility.rawValue,
                visibilityUserIds: composerVisibilityUserIds
            )
        case .document, .mood:
            // **Une story part par le canal de la SCÈNE, pas par le brouillon**
            // (directive porteur 2026-09-01). Elle est routée sur `.document`
            // depuis que le nouveau composer ne charge plus l'atelier — mais
            // `ComposerDocumentDraft` porte du texte, des pièces jointes et un
            // lieu, jamais des slides. L'y faire passer publierait une story
            // VIDE de tout ce que l'auteur a composé.
            //
            // > Router une surface et router sa PUBLICATION sont deux gestes.
            // > Le premier se voit à l'écran ; le second ne se voit qu'à
            // > l'arrivée, sur un contenu qu'on ne peut plus rattraper.
            if selectedFormat == .story {
                publishStoryScene()
            } else {
                publishDocument()
            }
        }
    }

    /// **Publier les unités d'histoire** — le canal que l'atelier utilisait,
    /// pressé par le meuble puisque l'atelier n'est plus monté.
    ///
    /// Les douze arguments sont ceux que `StoryComposerView+Publication`
    /// assemble, lus sur le MÊME modèle de vue : le meuble ne recalcule rien,
    /// il relaie. `ComposerMediaAccessibility.empty` est le seul écart, et il
    /// est honnête — la surface de scène du meuble n'offre pas encore d'éditeur
    /// d'alternative textuelle, donc il n'y a rien à transmettre. Fabriquer un
    /// dictionnaire vide plutôt que de lire un magasin absent dit la vérité ;
    /// lire un magasin par défaut aurait fait croire à un relais.
    func publishStoryScene() {
        guard canPublishDocument else { return }
        isPublishingDocument = true
        let accepted = onPublishAllInBackground(
            viewModel.slides,
            viewModel.slideImages,
            viewModel.loadedImages,
            viewModel.loadedVideoURLs,
            viewModel.loadedAudioURLs,
            documentLanguage,
            composerVisibility.rawValue,
            composerVisibilityUserIds,
            viewModel.draftId,
            composerReferences,
            ComposerMediaAccessibility.empty,
            selectedFormat.postType
        )
        isPublishingDocument = false
        if accepted { onDismiss() }
    }

    var publishButton: some View {
        Button {
            performSoclePublish()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.circle")
                    .accessibilityHidden(true)
                // #4057 — même réduction que l'audience. Sans elle, en allemand
                // à `accessibility-XXXL`, « Veröffentlichen » se cassait en
                // syllabes empilées : l'action TERMINALE du composer devenait
                // une colonne de fragments.
                if socleShowsLabels {
                    Text("composer.socle.publish", bundle: .main)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.bold))
            .foregroundColor(canPublishDocument ? MeeshyColors.indigo400 : MeeshyColors.textSecondary(isDark: true))
            .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
            .contentShape(Rectangle())
        }
        .disabled(!canPublishDocument)
        // Le nom accessible est posé EXPLICITEMENT : sans le `Text`, le `Label`
        // n'en dérive plus aucun, et la flèche perdrait son nom à l'instant même
        // où elle devient compacte — le défaut que `StatusComposerView` a dû
        // corriger, dans l'autre sens.
        .accessibilityLabel(Text("composer.socle.publish", bundle: .main))
        .accessibilityValue(isPublishingDocument ? ComposerSocleCopy.publishInProgress : "")
        .accessibilityHint(publishBlockedHint)
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
    var moodHeaderPublishButton: some View {
        Button {
            publishDocument()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up")
                    .accessibilityHidden(true)
                // Même réduction qu'ailleurs (#4057) : à `accessibility-XXXL`
                // un libellé collé à l'icône se casserait en syllabes empilées
                // dans une pastille qui n'a pas la largeur d'une rangée.
                if socleShowsLabels {
                    Text("composer.socle.publish", bundle: .main)
                        .lineLimit(1)
                }
            }
            .font(.footnote.weight(.bold))
            .foregroundColor(.white)
            .padding(.horizontal, 14)
            // Même plancher que `publishButton` (#4057, cible ≥ 44 pt HIG) —
            // pas `ComposerControlMetrics.visualDiameter` (36 pt) : ce jeton
            // dimensionne le CERCLE de la croix, et son complément
            // (`.composerHitTarget()`, qui élargit la zone de CONTACT sans
            // grossir le rendu) est `internal` à `MeeshyUI`, inatteignable
            // depuis l'app.
            .frame(minWidth: 44, minHeight: 44)
        }
        // `brandPrimary`, pas `indigo500` en dur : c'est le MÊME jeton (alias),
        // et c'est celui que la flèche jumelle de `StoryComposerView+TopBar`
        // utilise déjà pour le même traitement — un seul nom pour un même fond
        // de bouton prominent à travers le composer, jamais deux orthographes.
        // Blanc sur `brandPrimary` est aussi la paire déjà mesurée par le chip
        // d'audience SÉLECTIONNÉ de cette même surface (`brandGradient`, dont
        // `brandPrimary` est le premier arrêt) — pas une paire neuve.
        .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
        .opacity(canPublishDocument ? 1 : 0.45)
        .disabled(!canPublishDocument)
        .accessibilityLabel(Text("composer.socle.publish", bundle: .main))
        .accessibilityValue(isPublishingDocument ? ComposerSocleCopy.publishInProgress : "")
        .accessibilityHint(publishBlockedHint)
    }

    /// Le gate de MATIÈRE, lu deux fois — pour teindre la flèche et pour la
    /// désactiver. UNE source : l'écran historique du mood écrivait la même règle
    /// deux fois (`guard let emoji` dans l'action, `.disabled(selectedEmoji == nil
    /// || isPublishing)` sur le bouton), et deux écritures d'une règle sont deux
    /// occasions de la corriger à moitié.
    var canPublishDocument: Bool {
        ComposerDocumentPublishGate.canPublish(
            surface: mountedSurface,
            emoji: moodEmoji,
            text: documentText,
            visibility: composerVisibility,
            visibilityUserIds: composerVisibilityUserIds,
            isPublishing: isPublishingDocument,
            repostOfId: intent.origin.repostedPostId,
            // Sous la scène, la matière est celle de l'ATELIER, relayée par la
            // télécommande (#4135). Le meuble ne la recalcule pas : il ne voit
            // ni le son de fond ni les traits de dessin.
            atelierHasMatter: publishTrigger.canPublish,
            // La matière que le MEUBLE voit, lui — celle que l'écran montre
            // déjà en vignettes et en chip de lieu (#4514).
            //
            // **Et, pour une STORY, ce que ses canvas portent** (directive
            // porteur 2026-09-01). Le gate mesure les trois choses qu'un POST
            // compose — texte, médias joints, lieu — dont une story ne remplit
            // aucune : elle se compose EN POSANT des objets sur ses unités
            // d'histoire. Sans ce terme, la flèche refuserait en silence sur un
            // écran plein de travail.
            //
            // La règle est appelée, jamais réécrite ici : c'est elle qui sait
            // que la slide SEMÉE au montage ne compte pas comme de la matière.
            hasMedia: !documentLocalMedia.isEmpty
                || (selectedFormat == .story
                    && ComposerStoryCanvas.hasMatter(
                        slides: viewModel.slides,
                        // L'image de fond ne vit pas dans `effects` : sans elle
                        // une story-photo n'armerait pas la flèche (#4741).
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
    var publishBlockedHint: String {
        guard !canPublishDocument, !isPublishingDocument else { return "" }
        guard ComposerDocumentPublishGate.audienceIsComplete(
            composerVisibility,
            userIds: composerVisibilityUserIds
        ) else { return "" }
        return ComposerSocleCopy.publishBlockedHint(surface: mountedSurface) ?? ""
    }

    /// Ce que la flèche remet au site de montage.
    ///
    /// `nil` sous la scène — le socle n'y est pas peint, et fabriquer un
    /// brouillon pour une surface qui publie par l'atelier aurait été le second
    /// chemin d'envoi que la doctrine, C2 et le lot 7 interdisent tous les trois.
    var documentDraft: ComposerDocumentDraft? {
        switch mountedSurface {
        case .scene:
            return nil
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
        case .document:
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
                format: selectedFormat,
                forcePlainPost: selectedFormat == .post,
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
                references: composerReferences
            )
        }
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
    func publishDocument() {
        guard canPublishDocument, let draft = documentDraft else { return }
        // Le palier RETENU pour la PROCHAINE publication est écrit ICI, au
        // moment où il SERT — même geste que
        // `FeedView+Attachments.publishPostWithAttachments`
        // (`FeedNearbyDiscoverability.remember(nearbyDiscoverability)`) : la
        // spec parle du dernier choix « utilisé », pas du dernier survolé.
        if documentOffersNearbyDiscoverability {
            FeedNearbyDiscoverability.remember(documentDiscoverability)
        }
        isPublishingDocument = true
        Task {
            let accepted = await onPublishDocument(draft)
            isPublishingDocument = false
            if accepted { onDismiss() }
        }
    }
}
