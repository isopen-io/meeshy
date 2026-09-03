import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

/// **Le SON du composer — sa feuille, son rôle de mixage, et ce qu'un fichier
/// devient** (#4632).
///
/// Extrait de `MeeshyComposerHost+Intake.swift` le 2026-09-01, qui franchissait
/// le plafond de 1 100 lignes. Le nom suit le motif `MeeshyComposerHost+*` :
/// c'est ce qui garde le fichier DANS l'unité que `AppSourceGuard` lit, donc les
/// gardes qui ancrent sur ces membres restent vivantes.
extension MeeshyComposerHost {

    // MARK: - Ce que le meuble RÉSOUT à propos des sons

    /// **Le son que la ligne de l'avatar affiche** — la loi convoquée, jamais
    /// réécrite (#4670).
    ///
    /// L'URL locale vient de la session (`loadedAudioURLs`), seul handle commun
    /// entre un objet de scène et un média de document. Elle manque pour un son
    /// EMPRUNTÉ, qui n'a pas de fichier : la loi lit cette absence comme une
    /// preuve, et non comme une lacune.
    ///
    /// **Les trois résolutions ci-dessous ont quitté `+Surfaces`** le
    /// 2026-09-01 : ce fichier-là franchissait les 1 100 lignes, et la
    /// directive du 2026-08-28 exige d'extraire AVANT d'ajouter. L'extraction
    /// suit la responsabilité, pas la tranche — « ce que le meuble sait des
    /// sons » vit avec le son, et la surface continue de RECEVOIR ces valeurs
    /// sans jamais les chercher.
    var avatarBadgeSound: StoryAudioPlayerObject? {
        let fond = viewModel.currentEffects.resolvedBackgroundAudio
        return ComposerSoundColumn.avatarBadge(
            background: fond,
            backgroundLocalURL: fond.flatMap { viewModel.loadedAudioURLs[$0.id] },
            contentMediaURLs: documentLocalMedia.map(\.url)
        )
    }

    /// **Retirer le son de FOND depuis sa trace** (#4930).
    ///
    /// `nil` ⇒ aucun menu, et les deux cas qui rendent `nil` ne sont pas le
    /// même :
    ///
    /// - **aucun fond** — il n'y a rien à retirer ;
    /// - un fond **LEGACY**, que `resolvedBackgroundAudio` synthétise depuis
    ///   `backgroundAudioId` : il n'existe dans aucun tableau, et `deleteElement`
    ///   sur son identifiant fabriqué passerait pour un retrait qui n'a pas eu
    ///   lieu. `ComposerBackgroundSoundReplacement.supersededId` porte déjà
    ///   cette distinction — la relire ici en ferait un second site.
    ///
    /// ## Pourquoi un appui long, et non un bouton sur la trace
    ///
    /// #4696 a établi l'appui long comme « la seconde porte de la suppression »
    /// pour le son de CONTENU, et le même menu la sert. Ce n'est donc pas une
    /// quatrième loi : c'est le geste que l'auteur connaît déjà, appliqué au
    /// plan qui en manquait.
    ///
    /// Le défaut que ça ferme : `opensEditor` refuse d'ouvrir la feuille pour un
    /// son EMPRUNTÉ — à juste titre, pour protéger le crédit (#4668) — et le
    /// retrait vivait DANS cette feuille. Fermer la porte avait donc emporté le
    /// retrait avec elle, sans que personne le décide.
    var deleteBackgroundSoundAction: (() -> Void)? {
        guard let son = avatarBadgeSound,
              ComposerBackgroundSoundReplacement.supersededId(
                background: son,
                audioObjects: viewModel.currentEffects.audioPlayerObjects ?? []) != nil
        else { return nil }
        return { deleteBackgroundSound(son) }
    }

    func deleteBackgroundSound(_ sound: StoryAudioPlayerObject) {
        guard let id = ComposerBackgroundSoundReplacement.supersededId(
            background: sound,
            audioObjects: viewModel.currentEffects.audioPlayerObjects ?? []) else { return }
        viewModel.deleteElement(id: id)
        HapticFeedback.medium()
    }

    /// **Faire sortir le son du FOND pour le poser sur la scène** (#5018).
    ///
    /// `nil` quand il n'y a rien à promouvoir — pas de fond, ou un fond LEGACY
    /// qui n'a aucun objet derrière lui. L'entrée de menu disparaît alors au
    /// lieu de griser : un contrôle existe s'il a un effet.
    var promoteBackgroundSoundAction: (() -> Void)? {
        guard let son = avatarBadgeSound,
              ComposerSoundPromotion.promotableId(
                background: son,
                audioObjects: viewModel.currentEffects.audioPlayerObjects ?? []) != nil
        else { return nil }
        return { promoteBackgroundSound(son) }
    }

    /// La promotion en deux temps, et l'ordre n'est pas indifférent.
    ///
    /// `toggleBackground` d'abord : c'est LUI qui tient les invariants du plan
    /// — un seul fond par slide, et le nettoyage des champs legacy
    /// (`backgroundAudioId` et sa suite) qu'un objet promu laisserait sinon
    /// derrière lui, à jouer en parallèle. La place ensuite, parce qu'elle n'a
    /// aucun invariant à tenir. Le SDK n'exposait AUCUN déplacement hors
    /// glissement — `beginDrag`/`updateDrag`/`endDrag` ne portent qu'un état
    /// éphémère, et `endDrag()` ne commite rien — d'où le verbe `moveElement`
    /// ajouté pour ce lot. L'app ne force pas la porte de `currentEffects`,
    /// qui est `public internal(set)` et le reste.
    ///
    /// > Sans la seconde moitié, la promotion « marcherait » et serait
    /// > invisible : un fond n'a pas de position utile, donc deux sons promus
    /// > l'un après l'autre se poseraient au même point. L'auteur verrait UNE
    /// > puce là où le compte en annonce deux — le défaut que
    /// > `StoryObjectPlacement` existe pour empêcher.
    func promoteBackgroundSound(_ sound: StoryAudioPlayerObject) {
        guard let id = ComposerSoundPromotion.promotableId(
            background: sound,
            audioObjects: viewModel.currentEffects.audioPlayerObjects ?? []) else { return }
        let place = ComposerSoundPromotion.landing(on: viewModel.currentSlide, promoting: id)
        viewModel.toggleBackground(id: id)
        viewModel.moveElement(id: id, to: place)
        HapticFeedback.medium()
    }

    /// **Ce que le doigt fait de la pastille** — `nil` quand la loi refuse
    /// d'ouvrir (#4668), et la pastille redevient alors une lecture pure.
    var editBackgroundSoundAction: (() -> Void)? {
        guard let son = avatarBadgeSound, ComposerSoundColumn.opensEditor(son) else { return nil }
        return { editBackgroundSound(son) }
    }

    /// Les sons placés en CONTENU, résolus depuis l'état du meuble — la surface
    /// les reçoit, elle ne les cherche pas (#4672).
    var foregroundSounds: [ComposerForegroundSound] {
        ComposerForegroundSound.resolveAll(localMedia: documentLocalMedia,
                                           transcriptions: documentTranscriptions)
    }

    /// **La transcription qui PART avec la publication.**
    ///
    /// `PublishIntent.document` n'en porte qu'une : le fil ne modélise pas
    /// encore une transcription par pièce jointe. Celle du DERNIER son posé est
    /// servie — le même choix qu'avant #4672, désormais nommé au lieu d'être
    /// une conséquence de l'écrasement.
    ///
    /// **La limite est du CÔTÉ FIL, pas du composer** : l'écran montre bien N
    /// cartes, chacune avec son texte ; c'est la charge d'envoi qui n'en
    /// transporte qu'un. Elle a son issue.
    /// Le DERNIER son qui en a une — pas le dernier son. Depuis que le fond
    /// remplacé DESCEND en contenu (#4695), la dernière carte peut être un son
    /// muet ; servir sa transcription vide effacerait celle qu'un son précédent
    /// portait, sans qu'aucun écran ne le dise.
    var documentTranscription: MobileTranscriptionPayload? {
        foregroundSounds.reversed().compactMap { documentTranscriptions[$0.url] }.first
    }

    /// **LA feuille du son.** L'enregistreur du SDK en est la surface — il porte
    /// déjà ses deux entrées « Fichiers » et « Bibliothèque », que le composer
    /// ne lui passait simplement jamais — et le rôle de mixage se pose SOUS le
    /// bouton, à la place que le porteur a nommée.
    ///
    /// Le résultat va sur la SCÈNE (`attachPastedAudio`), jamais dans la liste
    /// média du document : c'est tout le correctif.
    var composerSoundSheet: some View {
        AudioPostComposerView(
            onPublish: { url, mimeType, durationMs, transcription in
                applyCreatedAudio(url: url, mimeType: mimeType,
                                  durationMs: durationMs, transcription: transcription)
            },
            onPublishBorrowed: { sound, rognage in
                // Le crédit survit au découpage : `addBorrowedSound` garde le
                // `soundId`, et l'intervalle se pose en `sourceStart`/`sourceEnd`
                // plutôt que d'être gravé dans un fichier ré-uploadé (#4657).
                attachBorrowedBackgroundSound(sound, trim: rognage)
                presentedPortal = nil
                HapticFeedback.light()
            },
            // **Pas de commutateur pour une pastille du canvas** (#4671) :
            // ses deux moitiés désignent le fond de la slide et la pièce jointe
            // du post, or une pastille n'est ni l'un ni l'autre. `nil` retire la
            // section — la feuille ne rend alors aucun choix qu'elle ne saurait
            // honorer.
            placement: editedSceneChipId == nil ? $chosenSoundPlacement : nil,
            // **Ce que « premier plan » VA devenir, pour que le libellé le
            // dise** (#4722). Le rôle envoyé au modèle est le même partout ; sur
            // une scène il pose une puce, sur un document une pièce jointe. La
            // feuille ne le décide pas — elle le reçoit pour nommer juste, et un
            // interrupteur qui décrit ce que son option fait ailleurs est
            // vérifiable ET faux.
            foregroundDestination: ComposerSoundDestination.forForeground(on: mountedComposerView),
            // **Éditer, c'est rouvrir la MÊME vue sur le son déjà posé**
            // (directive porteur 2026-09-01). Aucune seconde surface d'édition
            // n'est écrite : `AudioPostComposerView` a été rendue réutilisable
            // pour exactement ça, et une vue jumelle aurait divergé au premier
            // réglage.
            initialAudio: editedSoundTrack,
            // **Supprimer n'est offert qu'en ÉDITION** — voir
            // `deleteEditedSoundAction`, dont le `nil` retire le bouton.
            onDelete: deleteEditedSoundAction
        )
        // **Une ouverture, une feuille NEUVE** (#4684). Voir
        // `soundSheetSession` : sans identité renouvelée, SwiftUI réutilise la
        // vue — et son `@State` — d'une ouverture à la suivante.
        .id(soundSheetSession)
    }

    /// **LA façon d'ouvrir « Création audio »** (#4684) — les quatre entrées y
    /// passent, et c'est ce qui rend l'inventaire structurel.
    ///
    /// Elles faisaient chacune leurs deux ou trois lignes : poser le placement,
    /// poser le portail. Un cinquième site aurait pu naître en oubliant la
    /// troisième — renouveler l'identité de la feuille — sans qu'aucun témoin ne
    /// rougisse, puisque le défaut ne se voit qu'à la SECONDE ouverture.
    ///
    /// `placement` à `nil` ⇒ la porte n'a pas d'avis, et ce que l'auteur avait
    /// choisi la fois d'avant tient. C'est le cas de la porte du rail, qui ouvre
    /// la feuille sans rien présumer.
    func openSoundSheet(placement: ComposerAudioRole?) {
        if let placement { chosenSoundPlacement = placement }
        soundSheetSession = UUID()
        presentedPortal = .sound
    }

    /// **La piste que la feuille rouvre** — de CONTENU ou de FOND, un seul site.
    ///
    /// Les deux surfaces d'édition (#4657 pour le contenu, #4668 pour le fond)
    /// remettent la même chose à la feuille : une URL, une durée, un type. Les
    /// composer en deux endroits aurait donné deux façons d'ouvrir la même vue,
    /// et la seconde aurait divergé au premier champ ajouté à `ExistingAudio`.
    var editedSoundTrack: AudioPostComposerView.ExistingAudio? {
        if let son = editedForegroundSound {
            // **Le texte VOYAGE avec la piste** (#4697, directive porteur 2026-09-01 :
            // « toujours la possibilité de rédiger la description »). Sans lui,
            // la feuille rouverte s'ouvrait MUETTE sur un son qui avait pourtant
            // sa transcription : l'auteur ne pouvait ni la relire, ni la
            // corriger — et un rognage la perdait, `survivingTranscription` ne
            // gardant l'ancienne que si l'URL ne change pas.
            return AudioPostComposerView.ExistingAudio(
                url: son.url, duration: son.duration, mimeType: son.mimeType,
                transcription: documentTranscriptions[son.url])
        }
        guard let id = editedBackgroundSoundId ?? editedSceneChipId,
              let url = viewModel.loadedAudioURLs[id],
              let objet = viewModel.currentEffects.audioPlayerObjects?.first(where: { $0.id == id })
        else { return nil }
        // La durée de l'OBJET, pas celle du fichier : elle porte déjà le
        // rognage précédent. La feuille relit de toute façon la durée réelle de
        // l'asset et corrige — ce qui compte est de ne pas rendre 0, qui ferait
        // disparaître la zone de rognage.
        return AudioPostComposerView.ExistingAudio(
            url: url,
            duration: objet.duration.map(TimeInterval.init) ?? 0,
            mimeType: "audio/mp4",
            // **Le fond aussi garde sa description** (#4697). Sa piste a une URL
            // locale, donc une clé dans la même carte que les sons de contenu —
            // sans quoi « Rédiger » sur un fond aurait été un contrôle qui écrit
            // dans le vide, le texte disparaissant à la validation.
            transcription: documentTranscriptions[url])
    }

    // MARK: - Poser un son en FOND

    /// **Un son posé en FOND REMPLACE celui qui y est** (#4676).
    ///
    /// Défaut trouvé à la vérification simulateur du 2026-09-01, et il perdait
    /// des données en silence. Trois gestes, trois no-op :
    ///
    /// | fond en place | son proposé | ce qui arrivait |
    /// |---|---|---|
    /// | vocal 0:04 | un son de l'étagère | la pastille ne bougeait pas |
    /// | son de l'étagère | un autre son de l'étagère | idem |
    /// | son de l'étagère | un vocal enregistré | idem, **et l'enregistrement était perdu** |
    ///
    /// Deux causes distinctes, un seul symptôme :
    ///
    /// - `addAudioObject(role: .background)` AJOUTE un second objet
    ///   `isBackground == true`, et `resolvedBackgroundAudio` sert le
    ///   **premier** de la liste. Le nouveau existe, personne ne le regarde.
    /// - `addBorrowedSound` applique sa règle automatique
    ///   (`hasExistingBackgroundAudio ? nil : true`) : en présence d'un fond, le
    ///   son emprunté devient un objet de PREMIER PLAN, invisible sur une
    ///   surface document qui n'a pas de canvas.
    ///
    /// > Un choix EXPLICITE de l'auteur ne se fait pas arbitrer par une règle
    /// > écrite pour le cas où il n'a rien dit. « Fond de la slide » est une
    /// > phrase, pas une préférence : elle doit produire un fond, quel qu'en soit
    /// > le prix pour l'occupant.
    ///
    /// Limite assumée : un fond LEGACY (`backgroundAudioId`, synthétisé par
    /// `resolvedBackgroundAudio` sous l'identifiant `legacy-bg-audio`) n'a pas
    /// d'objet à supprimer. `deleteElement` y est un no-op, et le composer de
    /// publication ne produit pas cette forme — seule une reprise de story
    /// ancienne le ferait.
    func retireLeSonDeFondActuel() {
        let effets = viewModel.currentEffects
        let fond = effets.resolvedBackgroundAudio
        switch ComposerSupersededBackground.fate(
            background: fond,
            audioObjects: effets.audioPlayerObjects ?? [],
            localURL: fond.flatMap { viewModel.loadedAudioURLs[$0.id] },
            contentMediaURLs: documentLocalMedia.map(\.url)
        ) {
        case .none:
            return
        case .discard(let id):
            viewModel.deleteElement(id: id)
        case .demoteToContent(let id, let url):
            // L'objet de scène part, la carte le reprend — dans cet ordre : la
            // pastille de l'avatar et la carte de contenu lisent la MÊME URL, et
            // `ComposerSoundColumn.avatarBadge` masque la première dès que la
            // seconde existe. L'inverse ferait clignoter la pastille.
            let duree = fond?.duration.map { Int($0 * 1000) }
            viewModel.deleteElement(id: id)
            documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                url: url, declaredMimeType: "audio/mp4", durationMs: duree))
        }
    }

    /// Le fichier devient LE fond — l'ancien part d'abord.
    func attachBackgroundSound(url: URL) {
        retireLeSonDeFondActuel()
        viewModel.attachPastedAudio(url: url, role: .background)
    }

    /// La piste empruntée devient LE fond, crédit intact.
    ///
    /// L'ordre compte : `addBorrowedSound` lit `resolvedBackgroundAudio` pour
    /// décider de son propre `isBackground`. Retirer d'abord lui fait donc
    /// répondre « aucun fond », et elle pose `true` — sans qu'on ait à lui
    /// passer un rôle qu'elle n'accepte pas.
    func attachBorrowedBackgroundSound(_ sound: APISound, trim: ClosedRange<TimeInterval>?) {
        retireLeSonDeFondActuel()
        viewModel.addBorrowedSound(sound, trim: trim)
    }

    /// **Oublier ce qu'on éditait — les DEUX contextes, en un geste** (#4668).
    ///
    /// Le portail se ferme par « Valider », par « Annuler » et par un
    /// glissement ; un seul de ces trois chemins repasse par `applyCreatedAudio`.
    /// C'est donc la FERMETURE qui doit éteindre, et elle doit éteindre les deux
    /// : un contexte survivant ferait supprimer, au prochain retour de feuille,
    /// un son que l'auteur n'avait pas ouvert.
    func forgetEditedSound() {
        editedForegroundSound = nil
        editedBackgroundSoundId = nil
        editedSceneChipId = nil
    }

    /// **Supprimer le son qu'on est en train d'éditer** (#4696, directive
    /// porteur 2026-09-01 : « lors de l'édition mettre un (x) pour supprimer »).
    ///
    /// Poser un son était jusqu'ici IRRÉVERSIBLE : aucune surface n'offrait de
    /// le retirer, ni la carte, ni la pastille, ni le canvas. La seule façon
    /// d'en défaire un était d'en poser un autre par-dessus — c'est-à-dire d'en
    /// perdre un pour en perdre un autre.
    ///
    /// Le geste vit dans la FEUILLE et nulle part ailleurs, parce que c'est le
    /// seul endroit que les trois contextes traversent : carte de contenu,
    /// pastille de l'avatar, pastille du canvas y arrivent par le même
    /// `openSoundSheet`. Trois boutons dispersés auraient été trois lois.
    func deleteEditedSound() {
        if let edite = editedForegroundSound {
            documentLocalMedia = ComposerMediaOrder.removing(documentLocalMedia, at: edite.url)
            documentTranscriptions[edite.url] = nil
        }
        if let fond = editedBackgroundSoundId { viewModel.deleteElement(id: fond) }
        if let pastille = editedSceneChipId { viewModel.deleteElement(id: pastille) }
        forgetEditedSound()
        presentedPortal = nil
        HapticFeedback.medium()
    }

    /// **Retirer un son de contenu depuis SA carte** (#4696).
    ///
    /// L'appui long est la seconde porte de la suppression, et la plus courte :
    /// ouvrir la feuille pour supprimer coûte trois gestes là où poser en a
    /// coûté un. Elle passe par le même retrait que la feuille — le
    /// dictionnaire de transcriptions doit perdre sa clé en même temps que la
    /// liste perd sa pièce, sinon un son posé plus tard sous la même URL
    /// temporaire hériterait d'un texte qui n'est pas le sien.
    func deleteForegroundSound(_ son: ComposerForegroundSound) {
        documentLocalMedia = ComposerMediaOrder.removing(documentLocalMedia, at: son.url)
        documentTranscriptions[son.url] = nil
        // Le son supprimé pouvait être celui que la feuille tenait ouvert.
        if editedForegroundSound?.url == son.url { editedForegroundSound = nil }
        HapticFeedback.medium()
    }

    /// **`nil` quand la feuille ne fait que CRÉER** — une création n'a rien à
    /// supprimer, et un bouton de suppression posé là serait un contrôle sans
    /// effet. L'absence est structurelle : la feuille ne reçoit pas la fermeture,
    /// donc elle ne rend pas le bouton.
    var deleteEditedSoundAction: (() -> Void)? {
        guard editedForegroundSound != nil
                || editedBackgroundSoundId != nil
                || editedSceneChipId != nil
        else { return nil }
        return { deleteEditedSound() }
    }

    /// **Toucher une pastille audio du canvas la rouvre** (#4671, directive
    /// porteur 2026-09-01 : « Toucher le chips sur le canvas ouvre la vue de
    /// création audio »).
    ///
    /// Deux refus, et ils ne se valent pas :
    ///
    /// - **un son EMPRUNTÉ** ne s'ouvre pas — rouvrir passe par un fichier, ce
    ///   qui le détacherait de son `soundId` et du crédit de son auteur. C'est
    ///   la même loi que pour la pastille de l'avatar (`opensEditor`) ;
    /// - **une piste dont la session ignore le fichier local** ne s'ouvre pas
    ///   davantage : la feuille n'aurait rien à faire écouter, donc rien à
    ///   faire viser.
    ///
    /// Dans les deux cas le tap reste ce qu'il était — une SÉLECTION. Il ne
    /// promet rien qu'il ne tienne : c'est un geste qui fait moins, jamais un
    /// bouton muet.
    func editSceneSound(_ id: String) {
        guard let objet = viewModel.currentEffects.audioPlayerObjects?
                .first(where: { $0.id == id }),
              ComposerSoundColumn.opensEditor(objet),
              viewModel.loadedAudioURLs[id] != nil else { return }
        editedForegroundSound = nil
        editedBackgroundSoundId = nil
        editedSceneChipId = id
        openSoundSheet(placement: nil)
        HapticFeedback.light()
    }

    /// **Toucher la pastille du son de fond rouvre « Création audio » DESSUS**
    /// (#4668).
    ///
    /// Le placement est forcé à `.background` — comme son jumeau de contenu
    /// force `.foreground` : ouvrir la feuille sur l'autre moitié du
    /// commutateur ferait mentir le geste qu'on vient de faire. L'auteur peut
    /// toujours en changer DANS la feuille, ce qui fait alors passer le son du
    /// fond au contenu ; `applyCreatedAudio` retire l'ancien objet dans les
    /// deux cas.
    func editBackgroundSound(_ sound: StoryAudioPlayerObject) {
        editedForegroundSound = nil
        editedBackgroundSoundId = sound.id
        openSoundSheet(placement: .background)
        HapticFeedback.light()
    }

    /// **Toucher la carte du son de contenu rouvre « Création audio » DESSUS.**
    ///
    /// Le placement est forcé à `.foreground` : la carte n'existe QUE pour un
    /// son de contenu, et ouvrir la feuille sur l'autre moitié du commutateur
    /// ferait mentir le geste qui vient d'être fait.
    func editForegroundSound(_ son: ComposerForegroundSound) {
        editedBackgroundSoundId = nil
        editedForegroundSound = son
        openSoundSheet(placement: .foreground)
        HapticFeedback.light()
    }

    /// **Ce que le PLACEMENT décide** (#4657) — la seule chose qui distinguait
    /// les deux portes d'hier.
    ///
    /// | placement | destination |
    /// |---|---|
    /// | premier plan | la liste média du DOCUMENT — le vocal de la publication |
    /// | fond | la scène, sous tout le reste (`attachPastedAudio`) |
    ///
    /// La transcription ne suit QUE le premier plan : elle décrit ce que la
    /// publication DIT, et une bande-son n'est pas un propos. La poser sur un
    /// son de fond ferait parler la publication à la place de son auteur.
    ///
    /// Trois points hérités de la feuille que #4657 remplace, et qui valent
    /// toujours :
    ///
    /// - **L'enregistrement rejoint `documentLocalMedia` comme un média
    ///   ORDINAIRE** — il part par la file durable, comme tout média local
    ///   (T2.3). La transcription voyage À CÔTÉ, jamais fondue dans le texte.
    /// - **La capsule de langue est SEMÉE, jamais imposée.** Poser
    ///   `documentLanguage` au retour rend le contrôle RÉEL (loi 4) et évite
    ///   qu'une voix parte étiquetée par la langue de démarrage du meuble —
    ///   mais la garantie qui compte reste le `??` de `PublishIntent.document`,
    ///   qui élit la langue PARLÉE même si l'auteur rouvre la capsule ensuite.
    /// - **Un son EMPRUNTÉ à la bibliothèque reste hors périmètre** : il
    ///   référence un `soundId` déjà côté serveur, sans fichier local ni
    ///   transcription — une matière que `ComposerDocumentDraft` ne modélise
    ///   pas. Fermer la feuille sans effet est le choix assumé, plutôt qu'un
    ///   second chemin d'envoi pour un cas que la rangée n'offre nulle part.
    func applyCreatedAudio(url: URL,
                           mimeType: String,
                           durationMs: Int,
                           transcription: MobileTranscriptionPayload?) {
        // **Une ÉDITION remplace, elle n'ajoute pas** (directive porteur
        // 2026-09-01). Le retrait précède le `switch` — et non l'une de ses
        // branches — parce que l'auteur peut aussi avoir fait passer le son en
        // FOND depuis la feuille : l'entrée éditée doit alors quitter la liste
        // média du document quand même. Le mettre dans la branche « premier
        // plan » aurait laissé le son en double, une fois sur la scène et une
        // fois sous le texte.
        // **La piste éditée se lit AVANT que les contextes ne s'éteignent** —
        // `editedSoundTrack` les interroge tous les trois, et c'est elle qui
        // porte l'URL d'origine ET le texte déjà écrit, quelle que soit la
        // colonne d'où le son vient.
        let pisteEditee = editedSoundTrack
        let edite = editedForegroundSound
        editedForegroundSound = nil
        // **Et le son de FOND se remplace de la même façon** (#4668). Le
        // retrait précède le `switch` pour la raison qui vaut déjà pour son
        // jumeau : l'auteur peut avoir fait passer le son du fond au CONTENU
        // depuis la feuille, et l'objet de scène doit disparaître dans ce cas
        // aussi. Le mettre dans la branche `.background` aurait laissé le son
        // en double — une fois sur la scène, une fois sous le texte.
        if let ancienFond = editedBackgroundSoundId {
            viewModel.deleteElement(id: ancienFond)
            editedBackgroundSoundId = nil
        }
        // **Rouvrir la feuille pour rogner ne doit pas EFFACER la
        // transcription.** La feuille ne re-transcrit pas un son déjà acquis —
        // c'est délibéré, une reconnaissance non demandée est du travail chaud
        // pour rien — donc elle rend `nil`, et l'écrire tel quel aurait perdu
        // le texte au premier réglage de poignée. La règle qui décide vit à
        // côté du type, pas ici : c'est elle qu'un témoin peut convoquer.
        let transcriptionServie = ComposerForegroundSound.survivingTranscription(
            returned: transcription,
            previous: pisteEditee?.transcription,
            editedURL: pisteEditee?.url,
            returnedURL: url
        )
        // **Une pastille du canvas se remplace À SA PLACE** (#4671) — avant le
        // `switch`, qu'elle ne concerne pas : la feuille ne lui a offert aucun
        // placement, donc `chosenSoundPlacement` porte ici le choix d'une AUTRE
        // ouverture. L'appliquer ferait déménager l'objet sans que rien ne
        // l'ait demandé.
        if let pastille = editedSceneChipId {
            viewModel.deleteElement(id: pastille)
            editedSceneChipId = nil
            viewModel.attachPastedAudio(url: url, role: .foreground)
            presentedPortal = nil
            HapticFeedback.light()
            return
        }
        switch chosenSoundPlacement {
        case .foreground:
            // **Où « premier plan » atterrit dépend de la SURFACE** (#4722).
            // Sur une scène, c'est une puce posée sur la toile ; sur un
            // document sans scène, une carte sous le texte. La carte n'est
            // rendue que par `textOnlyContent` — la poser depuis la scène
            // laissait un son qui part à la publication et qu'aucun écran ne
            // montre.
            switch ComposerSoundDestination.forForeground(on: mountedComposerView) {
            case .sceneChip:
                // L'entrée éditée quitte la colonne contenu : l'auteur peut
                // avoir fait passer une carte en puce depuis la feuille, et le
                // son se verrait alors en double — une fois sous le texte, une
                // fois sur la scène. Même raison que la branche `.background`.
                if let edite {
                    documentLocalMedia = ComposerMediaOrder.removing(documentLocalMedia, at: edite.url)
                }
                viewModel.attachPastedAudio(url: url, role: .foreground)
            case .contentCard:
                // **À SA place, jamais au bout** : `removeAll` + `append` disaient
                // « supprime et repose » là où l'auteur avait dit « modifie », et la
                // carte rouverte sautait en dernière position sans qu'un geste l'ait
                // demandé. Mesuré au simulateur le 2026-09-01 (#4698).
                documentLocalMedia = ComposerMediaOrder.replacing(
                    documentLocalMedia,
                    at: edite?.url,
                    with: ComposerDocumentMediaFactory.media(
                        url: url,
                        declaredMimeType: mimeType,
                        durationMs: durationMs
                    )
                )
            }
            // **Sous la clé du fichier SERVI**, jamais sous celle du fichier
            // édité : `AudioSegmentExporter` rend une URL NEUVE dès qu'un
            // rognage a lieu, et la poser sous l'ancienne clé donnerait une
            // carte muette à côté d'une transcription orpheline.
            //
            // La description suit le son dans les DEUX destinations : une puce
            // de scène a une URL locale, donc une clé dans la même carte, et
            // c'est ce qui la fera réapparaître si la puce redevient un jour
            // une carte de contenu.
            documentTranscriptions[url] = transcriptionServie
            oublierLaTranscriptionDe(pisteEditee, saufSi: url)
            if let transcriptionServie {
                documentLanguage = transcriptionServie.language
            }
        case .background:
            // Le son PART de la colonne contenu quand l'auteur le fait passer en
            // fond depuis la feuille — sinon il s'y verrait en double, une fois
            // sur la scène et une fois sous le texte.
            if let edite {
                documentLocalMedia = ComposerMediaOrder.removing(documentLocalMedia, at: edite.url)
            }
            attachBackgroundSound(url: url)
            // Le fond range sa description sous SA piste — même carte, même clé
            // que les sons de contenu. C'est ce qui la fera réapparaître si ce
            // fond redescend un jour en contenu (#4695).
            documentTranscriptions[url] = transcriptionServie
            oublierLaTranscriptionDe(pisteEditee, saufSi: url)
        }
        presentedPortal = nil
        HapticFeedback.light()
    }

    /// **Une piste rognée change d'URL, donc de clé.** L'ancienne entrée doit
    /// partir : sans quoi une transcription orpheline reste dans le
    /// dictionnaire, et c'est elle qui ressortirait au prochain son posé sous la
    /// même URL temporaire.
    private func oublierLaTranscriptionDe(_ piste: AudioPostComposerView.ExistingAudio?,
                                          saufSi urlServie: URL) {
        guard let ancienne = piste?.url, ancienne != urlServie else { return }
        documentTranscriptions[ancienne] = nil
    }

    /// Fond ou premier plan — le choix appliqué à ce que la feuille va poser.
    ///
    /// La sélection affichée est le rôle qui s'appliquerait SANS choix : tant
    /// que l'auteur n'a rien dit, la pastille montre ce que la règle
    /// automatique ferait, et non un défaut arbitraire qui la contredirait.
    @ViewBuilder
    var soundRolePicker: some View {
        let effectif = chosenSoundRole ?? automaticSoundRole
        VStack(alignment: .leading, spacing: 6) {
            Text(ComposerSoundRoleCopy.title)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                ForEach(ComposerAudioRole.allCases, id: \.self) { role in
                    Button {
                        chosenSoundRole = role
                        HapticFeedback.light()
                    } label: {
                        Text(ComposerSoundRoleCopy.label(role))
                            .font(MeeshyFont.relative(13, weight: .medium))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule().fill(role == effectif
                                               ? Color.accentColor.opacity(0.22)
                                               : Color.primary.opacity(0.07))
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(ComposerSoundRoleCopy.label(role))
                    .accessibilityAddTraits(role == effectif ? [.isSelected] : [])
                }
            }
        }
        .padding(.top, 10)
    }

    /// Ce que la règle ferait si l'auteur ne disait rien — la source unique,
    /// APPELÉE et jamais recopiée.
    var automaticSoundRole: ComposerAudioRole {
        ComposerAudioPlacement.isBackground(
            sceneAlreadyHasBackgroundAudio: viewModel.currentEffects.resolvedBackgroundAudio != nil
        ) == true ? .background : .foreground
    }

    /// L'étagère des sons. Le picker vient du SDK — le meuble ne fait que le
    /// présenter et remettre son résultat au viewModel, seul site qui sait ce
    /// qu'un son EMPRUNTÉ vaut (`soundId` renseigné, `postMediaId` vide : c'est
    /// ce couple qui dit au serveur « enregistre un usage, ne capture rien »).
    var soundLibrarySheet: some View {
        SoundLibraryPicker(
            onPick: { sound in
                viewModel.addBorrowedSound(sound)
                presentedPortal = nil
                HapticFeedback.light()
            },
            onCancel: { presentedPortal = nil }
        )
    }

    /// **Un fichier audio arrive sur la SCÈNE, avec son rôle** (#4632).
    ///
    /// C'est la seconde moitié du correctif, et celle qui ne se voyait pas tant
    /// que la première tenait le sélecteur fermé : `ingestFileImporterResult`
    /// versait TOUT dans `documentLocalMedia`, la liste média du document. Un
    /// audio choisi depuis la porte du son n'y devenait donc jamais un son —
    /// exactement le défaut que #4483 a fermé pour l'enregistrement, resté
    /// ouvert sur la branche fichier.
    ///
    /// Le rôle est celui que l'auteur a posé DANS la feuille (`chosenSoundRole`),
    /// et il survit à sa fermeture : c'est un état du meuble, pas de la feuille.
    /// `nil` ⇒ `attachPastedAudio` applique sa règle automatique, la même que
    /// pour un enregistrement.
    ///
    /// La copie suit le motif de l'ingestion voisine : `start…SecurityScoped…`
    /// rend `false` pour un fichier qui n'est pas *scoped* — ce n'est pas un
    /// échec, la copie est tentée quel que soit ce retour, et `stop…` n'est
    /// appelé que si `start` a rendu `true`.
    func ingestSoundFiles(_ urls: [URL]) async {
        for sourceURL in urls {
            let scoped = sourceURL.startAccessingSecurityScopedResource()
            defer { if scoped { sourceURL.stopAccessingSecurityScopedResource() } }
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_sound_\(UUID().uuidString)_\(sourceURL.lastPathComponent)")
            guard (try? FileManager.default.copyItem(at: sourceURL, to: destination)) != nil else { continue }
            switch chosenSoundPlacement {
            case .background:
                attachBackgroundSound(url: destination)
            case .foreground:
                // **La MÊME règle que l'enregistrement** (#4722). Ce chemin
                // posait un objet de scène quoi qu'il arrive, là où le chemin
                // voisin posait toujours une carte de contenu : deux réponses
                // pour une intention, et chacune fausse sur la surface de
                // l'autre. Un fichier importé sur un post sans scène
                // disparaissait de l'écran sans quitter la publication.
                switch ComposerSoundDestination.forForeground(on: mountedComposerView) {
                case .sceneChip:
                    viewModel.attachPastedAudio(url: destination, role: .foreground)
                case .contentCard:
                    documentLocalMedia.append(ComposerDocumentMediaFactory.media(
                        url: destination, declaredMimeType: "audio/mp4"))
                }
            }
            HapticFeedback.light()
        }
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
}
