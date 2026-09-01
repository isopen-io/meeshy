import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

/// **Les présentations du meuble — une feuille nommée, et les sélecteurs
/// système qui n'en sont pas.**
///
/// Extrait de `MeeshyComposerHost.swift` le 2026-08-31 (#4632), qui franchissait
/// le plafond de 1 100 lignes. Le nom suit le motif `MeeshyComposerHost+*` :
/// c'est ce qui garde le fichier DANS l'unité que `AppSourceGuard` lit, et donc
/// l'inventaire des portails vivant.
extension MeeshyComposerHost {

    /// **Les PORTAILS d'ingestion appartiennent au MEUBLE, jamais à une
    /// surface** (#4120).
    ///
    /// Ils vécurent attachés à l'expression `documentSurface` — et le
    /// doc-comment du bloc affirmait déjà la bonne règle sans que le code la
    /// tienne : « trois sélecteurs montés ICI, **sur le meuble**, jamais dans
    /// `ComposerDocumentSurface` ». « Ici » désignait la surface, pas le meuble,
    /// et la différence n'a coûté RIEN tant qu'il n'y eut qu'une vue à monter.
    ///
    /// #4070 en a monté quatre. Les quatre portes du rail *leading* posaient
    /// alors `showsPhotoPicker = true` / `showsLocationPicker` /
    /// `showsAudioComposer` / `showsReferencePicker` **sans qu'aucune vue à
    /// l'écran ne les lise** : chaque maillon correct, et la chaîne ne
    /// transportait personne.
    ///
    /// La règle est donc géographique, et c'est ce qui la rend gardable : un
    /// portail se monte **au-dessus de l'aiguillage**, là où les quatre vues
    /// passent. `ComposerIntakePortalsTests` en tient l'INVENTAIRE — tout
    /// `@State private var shows…` du meuble doit avoir son lecteur ici, sans
    /// quoi le contrôle qui l'écrit est inerte sur trois surfaces sur quatre.
    ///
    /// Le contrôle de découvrabilité y est aussi, et pour la même raison : un
    /// lieu posé depuis la scène doit pouvoir se retirer.
    var surfaceWithIntakePortals: some View {
        surface
        // document : c'est l'ÉVENTAIL (le plateau, en tête), seul sélecteur de
        // mode. Le média qui qualifie fait respirer son offre (`reelGate` lit
        // `documentComposesReel`), et choisir RÉEL/STORY route vers la scène.
        // **Le SECOND opt-in (T2.5)**, en `safeAreaInset` et non en overlay :
        // `NearbyDiscoverabilityControl` porte un titre, un sélecteur de grain
        // et des notices — bien plus large qu'une capsule, il ne doit
        // recouvrir ni le texte ni la rangée d'outils. Gaté sur
        // `documentOffersNearbyDiscoverability`, jamais sur `documentLocation
        // != nil` seul : l'audience compte autant que le lieu.
        .safeAreaInset(edge: .bottom) {
            // **#4034 — le composant se monte sur le LIEU, plus sur l'opt-in.**
            // Il était gaté par `documentOffersNearbyDiscoverability` (lieu ET
            // audience publique) à l'époque où le nom du lieu vivait ailleurs,
            // dans un chip de la rangée d'outils. Ce chip est retiré — l'info
            // vit dans l'entête du composant —, si bien que garder l'ancienne
            // garde aurait fait DISPARAÎTRE de l'écran le lieu d'un post privé,
            // avec le seul moyen de le retirer. La découvrabilité, elle, reste
            // gouvernée par sa règle : c'est `offersDiscoverability` qui la
            // porte À L'INTÉRIEUR du composant.
            if let place = documentLocation {
                NearbyDiscoverabilityControl(
                    choice: $documentDiscoverability,
                    accentColor: MeeshyColors.brandPrimaryHex,
                    placeName: MediaKindLabel.placeTitle(name: place.name, address: place.address),
                    offersDiscoverability: documentOffersNearbyDiscoverability,
                    onRemovePlace: { documentLocation = nil }
                )
                .padding(.horizontal, 16)
                .padding(.bottom, 10)
            }
        }
        // **Le sixième outil (T2.6)**, même patron que le lieu juste au-dessus.
        .confirmationDialog(ComposerMediaSourcePolicy.chooserTitle,
                            isPresented: $showsMediaSourceChooser,
                            titleVisibility: .visible) {
            // Les boutons SORTENT de la règle : les écrire à la main ferait de
            // ce bloc une seconde liste, que `allowsCapture` cesserait de
            // gouverner au premier oubli.
            ForEach(ComposerMediaSourcePolicy.offered(allowsCapture: profile.allowsCapture),
                    id: \.self) { source in
                Button(ComposerDocumentCopy.label(ComposerMediaSourcePolicy.namingTool(source))) {
                    presentMediaIntake(source)
                }
            }
            Button(ComposerMediaSourcePolicy.cancel, role: .cancel) { }
        }
        // **L'historique se remplit AU-DESSUS de l'aiguillage** (#4402), pas
        // sur la surface qui l'affiche. Un instantané pris seulement pendant
        // que la scène est montée perdrait tout ce que le document a posé
        // avant elle — un fond choisi, un média attaché —, si bien que le
        // premier « annuler » sauterait par-dessus les gestes que l'auteur
        // vient de faire. Ce qui est SCÈNE-seul, c'est le CONTRÔLE, pas la
        // collecte.
        //
        // `historyTrigger` est déjà débouncé côté SDK ; la dédup du store fait
        // qu'un cycle sans changement réel des slides est un no-op.
        .onReceive(viewModel.historyTrigger) { _ in
            viewModel.pushHistorySnapshot()
        }
        // La trajectoire part de l'état d'OUVERTURE : sans ce premier
        // instantané, le plus ancien « annuler » ramènerait au premier geste
        // et non à l'écran vierge — l'utilisateur perdrait la possibilité de
        // tout défaire.
        .task { viewModel.seedHistory() }
        // **Les personnes à proposer, chargées UNE fois** (#4475) — mêmes amis
        // acceptés que la bande du document, par la même source. Deux
        // chargements auraient donné deux listes à faire diverger, et deux
        // moments où « aucun ami » se lit différemment.
        .task { sceneMentionBox.candidates = await ComposerMentionFriendsSource.acceptedFriends() }
        // **L'ingestion de fichiers LOCAUX (T2.3).** Le commentaire qui vivait
        // ici disait « montés ICI, sur le meuble, jamais dans
        // `ComposerDocumentSurface` » — et « ici » désignait l'expression
        // `documentSurface`. La phrase était juste, le placement ne l'était
        // pas : c'est ce demi-pas qui a rendu les quatre portes du rail
        // inertes (#4120). Ils sont désormais où la phrase les mettait.
        // **LA feuille du meuble — une seule, et c'est le correctif de #4467.**
        //
        // Le `switch` est exhaustif : un neuvième portail ne compile pas tant
        // qu'il n'a pas dit ce qu'il montre. C'est la même discipline que les
        // portes du rail, appliquée à la présentation — et elle remplace huit
        // modificateurs que rien n'empêchait de s'activer ensemble.
        // **`onDismiss` est le point de reprise d'un sélecteur SYSTÈME** (#4632).
        // Un `.fileImporter` ne peut pas s'ouvrir tant que cette feuille occupe
        // le présentateur ; la porte « Fichiers » ferme donc le portail et pose
        // son intention, que la fermeture EFFECTIVE consomme ici. Poser les deux
        // dans la même transaction est exactement ce qui rendait le bouton
        // inerte — sans crash ni trace, l'état invalide n'étant pas représentable
        // côté `ComposerPortal` mais parfaitement représentable en travers de lui.
        .sheet(item: $presentedPortal, onDismiss: { resumePendingPresentation() }) { portail in
            switch portail {
            case .location:     documentLocationPickerSheet
            case .emoji:        emojiPickerSheet
            case .sticker:      stickerPickerSheet
            case .sound:        composerSoundSheet
            case .soundLibrary: soundLibrarySheet
            case .reference:    referencePickerSheet
            case .language:     documentLanguagePickerSheet
            case .camera:       documentCameraSheet
            case .hashtag:      composerHashtagSheet
            case .audience:     composerAudienceSheet
            }
        }
        // **L'éditeur d'objet plein écran** (#4634). Il vit AU-DESSUS de
        // l'aiguillage pour la même raison que les portails : ouvert depuis la
        // scène, il doit survivre à un changement de surface.
        //
        // `fullScreenCover` et `.sheet` sont deux présentations du MÊME
        // présentateur — SwiftUI n'en honore qu'une. L'exclusion est tenue à la
        // SOURCE (`openObjectEditor` ferme le portail avant d'ouvrir) plutôt
        // qu'ici : une garde posée sur le lecteur laisserait l'état invalide se
        // former, quand la fermer chez l'écrivain le rend impossible.
        .fullScreenCover(item: $editedObject) { objet in
            ComposerObjectEditorView(
                viewModel: viewModel,
                objectId: objet.id,
                aspectRatio: viewModel.currentCanvasRatio,
                plateauTint: tint.color,
                sceneImages: viewModel.loadedImages,
                sceneImagesVersion: viewModel.loadedImagesVersion,
                onClose: { closeObjectEditor() },
                // Le plan 2D peut désigner un autre objet : c'est le MEUBLE qui
                // possède « quel objet est ouvert », et deux sources pour ce
                // fait divergeraient au premier tap sur une barre voisine.
                onSelectObject: { id in editedObject = ComposerEditedObject(id: id) }
            )
        }
        .photosPicker(
            isPresented: $showsPhotoPicker,
            selection: $pickedPhotoLibraryItems,
            maxSelectionCount: 10,
            matching: .any(of: [.images, .videos])
        )
        .adaptiveOnChange(of: pickedPhotoLibraryItems) { _, items in
            guard !items.isEmpty else { return }
            let picked = items
            pickedPhotoLibraryItems = []
            Task { await ingestPhotoLibraryItems(picked) }
        }
        .fileImporter(
            isPresented: $showsFileImporter,
            // **Le filtre et la destination suivent l'INTENTION** (#4632). Un
            // `.item` figé laissait choisir un PDF pour un son de fond, et
            // l'ingestion versait tout dans la liste média du document — un
            // audio choisi pour la scène n'y arrivait jamais comme son.
            allowedContentTypes: fileImportIntent.contentTypes,
            allowsMultipleSelection: fileImportIntent.allowsMultipleSelection
        ) { result in
            Task { await ingestFileImporterResult(result) }
        }
    }
}
