import CoreGraphics
import CoreMedia
import MeeshySDK
import UIKit

/// **Le mode édition** (#9352, spec § 3.3) : même interface, la source change.
///
/// La photo prise par la scène ne part plus aussitôt : elle se FIGE, debout, et
/// devient la source du peintre unique — le look et le cadrage se règlent sur
/// elle, et rien n'est remis à l'hôte avant « Terminé ». L'objectif, lui, se
/// repose : l'édition ne lit plus aucune trame.
extension ComposerCaptureSession {

    /// La photo s'ouvre en édition, avec les octets de sa prise : leur EXIF
    /// suivra le rendu final. Une image sans pixels n'ouvre rien.
    func beginEditing(photo image: UIImage, data: Data? = nil) {
        guard let debout = ComposerPhotoLookSource.upright(image) else { return }
        screenFlashBurst = false
        editPhoto = debout
        editPhotoData = data
        editSource = ComposerStillSource(debout)
        framing = .identity
        openFamily = nil
        editAspect = ComposerEditScene.clampedAspect(canvasAspect)
        phase = .editing(.photo)
        camera.pauseRunning()
    }

    /// La vidéo assemblée s'ouvre en édition, en boucle : le peintre la lit comme
    /// il lisait l'objectif, à la cadence du palier et dans l'espace de l'aperçu.
    /// Une vidéo qui ne se lit pas part telle quelle plutôt que d'être perdue ;
    /// un viseur fermé pendant le chargement n'ouvre rien, et son fichier part.
    func beginEditing(video url: URL) async {
        let generation = renderGeneration
        let charge = await loopPlayerFactory(url)
        guard generation == renderGeneration else {
            discardTake(url, context: "vidéo assemblée pour un viseur fermé")
            return
        }
        guard let lecteur = charge else {
            onDeliver?(.video(url))
            return
        }
        loopPlayer = lecteur
        editSource = lecteur
        framing = .identity
        trim = ComposerTrimRule.initialRange(duration: lecteur.duration)
        loopedTrim = trim
        openFamily = nil
        editAspect = ComposerEditScene.clampedAspect(canvasAspect)
        phase = .editing(.video(url))
        camera.pauseRunning()
        lecteur.configure(fps: ComposerCaptureSurfaceRule.editFPS(thermalBudget),
                          declaredSpace: camera.liveFeed.declaredSpace)
        lecteur.play()
    }

    /// « Fermer » en édition : on revient viser ; la prise est abandonnée, et un
    /// rendu en vol avec elle — la croix reste vivante pendant « Terminé » (#8653).
    func cancelEditing() {
        isRenderingLook = false
        abandonEditing()
        camera.resumeRunning()
    }

    /// La retouche abandonnée — par la croix ou par le viseur qui se ferme —
    /// emporte le fichier de sa vidéo assemblée : personne ne le lira plus. Une
    /// écriture de la flèche en cours le lit encore : il part après elle, et
    /// elle va jusqu'au bout (#9684 — aucune prise ne se perd).
    func abandonEditing() {
        let abandonnee = phase
        let ecriture = takeWrite
        leaveEditing()
        guard case .editing(.video(let url)) = abandonnee else { return }
        guard let ecriture else { return discardTake(url, context: "vidéo abandonnée en retouche") }
        Task { @MainActor [weak self] in
            _ = await ecriture.value
            guard let self else {
                return FileManager.default.removeItemLogging(at: url, context: "vidéo abandonnée après son enregistrement",
                                                             logger: .media)
            }
            self.discardTake(url, context: "vidéo abandonnée après son enregistrement")
        }
    }

    // MARK: - ✓ Terminé

    /// **✓ Terminé** (spec § 3.3 / § 3.4) : le rendu final — effet et cadrage —
    /// part vers l'hôte, et en galerie si `CaptureSavePolicy` le veut et que la
    /// flèche ne l'y a pas déjà mis (#9684). Un second toucher pendant le rendu ne
    /// remet rien ; un enregistrement en cours se laisse finir.
    func finishEditing() {
        guard !isRenderingLook, takeSaveState != .saving else { return }
        switch phase {
        case .capturing: return
        case .editing(.photo): finishPhoto()
        case .editing(.video(let url)): finishVideo(url)
        }
    }

    /// La photo à sa définition native, encodée avec les métadonnées de la prise.
    /// Un cadre qui ne se peint pas laisse la retouche ouverte plutôt que de
    /// remettre une photo sans lui.
    private func finishPhoto() {
        guard let photo = editPhoto, let source = editSource else { return }
        let regard = look
        let cadrage = framing
        let auteur = lookPerson
        let date = lookDate
        let cache = scenes
        let galerie = gallery
        let prise = editPhotoData
        let proportions = canvasAspect
        let enregistre = savePolicy().savesRenderOnFinish(alreadySaved: takeSaveState != .idle)
        isRenderingLook = true
        Task { @MainActor in
            guard isStillEditing(source) else { return }
            let peinte = await ComposerLookPainter.renderPhoto(photo, look: regard, framing: cadrage,
                                                               aspect: proportions, person: auteur, date: date, scenes: cache)
            guard isStillEditing(source) else { return }
            guard let rendu = peinte else {
                isRenderingLook = false
                HapticFeedback.error()
                return
            }
            let octets = await ComposerPhotoEncoding.encode(rendu, like: prise)
            guard isStillEditing(source) else { return }
            if let octets, enregistre { _ = await galerie.saveImage(octets) }
            guard isStillEditing(source) else { return }
            deliverEdited(.photo(UIImage(cgImage: rendu), data: octets))
        }
    }

    /// La vidéo part avec le look, le cadrage et la découpe qu'on voyait en la
    /// retouchant, lue dans l'espace où la boucle la lisait. Sans effet, sans
    /// cadrage ni découpe, le rendu EST le brut : il ne part en galerie que s'il
    /// n'y est pas déjà (`CaptureSavePolicy.writesUntouchedTake`). **Un rendu qui échoue ne remet RIEN** : le brut porte ce que la
    /// découpe et le cadrage ont retiré, et le remettre à sa place enverrait à
    /// l'hôte un passage que l'auteur a coupé. La retouche reste ouverte, comme
    /// pour une photo dont le cadre ne se peint pas — la prise n'est pas perdue.
    /// La boucle joue jusqu'à la remise, et le brut qu'un rendu remplace quitte
    /// le dossier temporaire.
    private func finishVideo(_ url: URL) {
        guard let source = editSource else { return }
        let regard = look
        let cadrage = framing
        let auteur = lookPerson
        let date = lookDate
        let galerie = gallery
        let espace = loopPlayer?.declaredSpace?.name as String?
        let plage = ComposerTrimRule.timeRange(trim, duration: loopPlayer?.duration ?? 0)
        let proportions = canvasAspect
        let politique = savePolicy()
        let enregistre = politique.savesRenderOnFinish(alreadySaved: takeSaveState != .idle)
        isRenderingLook = true
        Task { @MainActor in
            guard isStillEditing(source) else { return }
            let rendue = await ComposerLookVideoExporter.export(url, look: regard, framing: cadrage, timeRange: plage,
                                                                aspect: proportions, person: auteur, date: date,
                                                                declaredSpaceName: espace)
            guard let rendue else {
                guard isStillEditing(source) else { return }
                isRenderingLook = false
                HapticFeedback.error()
                return
            }
            let neuve = rendue == url ? nil : rendue
            if enregistre, isStillEditing(source) {
                _ = await Self.writeVideo(rendue, original: url, policy: politique, gallery: galerie)
            }
            guard isStillEditing(source) else {
                if let neuve {
                    FileManager.default.removeItemLogging(at: neuve, context: "rendu d'une retouche abandonnée",
                                                          logger: .media)
                }
                return
            }
            if neuve != nil { discardTake(url, context: "brut remplacé par son rendu") }
            deliverEdited(.video(rendue))
        }
    }

    /// La retouche validée est-elle encore celle de l'écran ? La croix et la
    /// fermeture du viseur relâchent sa source : un rendu en vol ne remet plus rien.
    private func isStillEditing(_ source: any ComposerFrameSourcing) -> Bool {
        editSource === source
    }

    /// La retouche quitte l'édition PUIS part : l'hôte retire le viseur sans
    /// boucle à arrêter. Un hôte qui le garde retrouve l'objectif.
    private func deliverEdited(_ result: CameraResult) {
        isRenderingLook = false
        leaveEditing()
        onDeliver?(result)
        guard stage == .armed else { return }
        camera.resumeRunning()
    }

    /// La phase revient à la capture et la source éditée est relâchée — la
    /// boucle s'arrête, une fois — sans toucher à l'objectif : qui désarme le
    /// ferme, qui annule le relance.
    func leaveEditing() {
        let lecteur = loopPlayer
        loopPlayer = nil
        lecteur?.stop()
        trim = nil
        loopedTrim = nil
        phase = .capturing
        editPhoto = nil
        editPhotoData = nil
        editSource = nil
        framing = .identity
        editAspect = nil
        cropPresetsOpen = false
        takeSaveState = .idle
    }

    // MARK: - ⬇︎ Enregistrer dans Photos (#9684)

    /// **La flèche ⬇︎** : la prise retouchée rejoint Photos telle qu'on la voit —
    /// effet, cadre, cadrage et découpe ; l'original s'il n'y a rien de tout
    /// cela. UNE fois par prise : ensuite la flèche devient ✓. On reste en
    /// retouche ; un refus de Photos se dit et laisse la flèche disponible.
    func saveTakeToPhotos() {
        guard phase.isEditing, !isRenderingLook, takeSaveState.offersSave, let source = editSource else { return }
        let regard = look
        let cadrage = framing
        let auteur = lookPerson
        let date = lookDate
        let cache = scenes
        let galerie = gallery
        let proportions = canvasAspect
        let politique = savePolicy()
        let ecriture: @MainActor () async -> Bool?
        switch phase {
        case .capturing:
            return
        case .editing(.photo):
            guard let photo = editPhoto else { return }
            let prise = editPhotoData
            ecriture = {
                guard let rendu = await ComposerLookPainter.renderPhoto(photo, look: regard, framing: cadrage,
                                                                        aspect: proportions, person: auteur,
                                                                        date: date, scenes: cache),
                      let octets = await ComposerPhotoEncoding.encode(rendu, like: prise) else { return nil }
                return await galerie.saveImage(octets)
            }
        case .editing(.video(let url)):
            let espace = loopPlayer?.declaredSpace?.name as String?
            let plage = ComposerTrimRule.timeRange(trim, duration: loopPlayer?.duration ?? 0)
            ecriture = {
                guard let rendue = await ComposerLookVideoExporter.export(url, look: regard, framing: cadrage,
                                                                          timeRange: plage, aspect: proportions,
                                                                          person: auteur, date: date,
                                                                          declaredSpaceName: espace)
                else { return nil }
                let enregistree = await Self.writeVideo(rendue, original: url, policy: politique, gallery: galerie)
                if rendue != url {
                    FileManager.default.removeItemLogging(at: rendue, context: "rendu enregistré par la flèche",
                                                          logger: .media)
                }
                return enregistree
            }
        }
        takeSaveState = .saving
        let tache = Task { @MainActor in await ecriture() }
        takeWrite = tache
        Task { @MainActor [weak self] in
            let verdict = await tache.value
            self?.takeWriteEnded(tache, verdict: verdict, source: source)
        }
    }

    /// **Le verdict se dit toujours** : sur la flèche si la retouche est encore là,
    /// par un bandeau sinon — jamais un échec silencieux. Un refus de Photos s'est
    /// déjà dit (`reportPhotoLibraryRefusal`) ; un rendu impossible se dit ici.
    private func takeWriteEnded(_ tache: Task<Bool?, Never>, verdict: Bool?, source: any ComposerFrameSourcing) {
        if takeWrite == tache { takeWrite = nil }
        let enregistree = verdict == true
        if isStillEditing(source) { takeSaveState = enregistree ? .saved : .idle }
        guard enregistree else {
            HapticFeedback.error()
            if verdict == nil { FeedbackToastManager.shared.showError(ComposerCaptureCopy.saveToPhotosFailed) }
            return
        }
        HapticFeedback.success()
        guard isStillEditing(source) else {
            return FeedbackToastManager.shared.showSuccess(ComposerCaptureCopy.savedToPhotos)
        }
        UIAccessibility.post(notification: .announcement, argument: ComposerCaptureCopy.savedToPhotos)
    }

    // MARK: - Le recadrage (#9567)

    /// Ce qui s'ouvre sous la scène de retouche.
    var editPanel: ComposerEditPanel {
        guard phase.isEditing else { return .none }
        return ComposerEditScene.panel(isVideo: loopPlayer != nil, familyOpen: openFamily != nil,
                                       presetsOpen: cropPresetsOpen)
    }

    /// **La scène prend ces proportions** — par un crochet tiré ou par un
    /// preset ; ce qui part les garde. Pendant le rendu de « Terminé », plus
    /// rien ne bouge.
    func setEditAspect(_ aspect: CGFloat) {
        guard phase.isEditing, !isRenderingLook else { return }
        editAspect = ComposerEditScene.clampedAspect(aspect)
    }

    func applyCropPreset(_ preset: ComposerCropPreset) {
        setEditAspect(preset.aspect(source: editExtent?.size ?? .zero))
    }

    /// Le preset que la scène réalise ; `nil` pour un recadrage libre.
    var cropPreset: ComposerCropPreset? {
        editAspect.flatMap { ComposerCropPreset.matching($0, source: editExtent?.size ?? .zero) }
    }

    /// Les proportions s'ouvrent à la place de la bande, jamais avec elle.
    func toggleCropPresets() {
        guard phase.isEditing, !isRenderingLook else { return }
        cropPresetsOpen.toggle()
        if cropPresetsOpen { openFamily = nil }
        HapticFeedback.light()
    }

    // MARK: - La découpe (#9353)

    /// **La plage gardée suit le geste ; la boucle ne repart qu'à sa fin.**
    /// Reconstruire la boucle à chaque image du glissé la ferait bégayer : pendant
    /// le geste seule la piste bouge, et le geste fini la boucle joue ce qui
    /// partira. Pendant le rendu de « Terminé », plus rien ne bouge.
    func setTrim(_ range: ClosedRange<TimeInterval>, committed: Bool) {
        guard !isRenderingLook, let lecteur = loopPlayer else { return }
        trim = range
        guard committed, loopedTrim != range else { return }
        loopedTrim = range
        lecteur.setRange(range)
    }

    /// Toucher la piste y place la tête, dans la plage gardée ; la boucle repart
    /// de là.
    func seekPlayhead(to time: TimeInterval) {
        guard !isRenderingLook, let trim, let lecteur = loopPlayer else { return }
        lecteur.seek(to: ComposerTrimRule.playhead(time, in: trim))
    }

    /// L'étendue de la source éditée ; `nil` hors édition. Une vidéo la connaît
    /// avant sa première trame : le cadrage n'attend pas la lecture.
    var editExtent: CGRect? {
        if let lecteur = loopPlayer { return CGRect(origin: .zero, size: lecteur.uprightSize) }
        return editSource?.latestImage()?.extent
    }

    /// Les proportions de la case où le média se pose : la découpe du cadre, la
    /// toile du viseur sinon. La scène de l'aperçu sert si elle est cuite ; sinon
    /// une toile de sonde, aux mêmes proportions et de la taille d'une miniature
    /// (une milliseconde), se cuit ici — un cache froid ne doit jamais faire
    /// cadrer plein viseur un média qui part dans une case 4:5.
    var framingAspect: CGFloat {
        let neutre = canvasAspect
        guard look.frame != ComposerPhotoFrame.none else { return neutre }
        let sonde = ComposerLookPainter.canvas(for: ComposerLookPainter.thumbnailCanvas, aspect: neutre)
        let cles = [ComposerLookPainter.previewCanvas(aspect: neutre), sonde].map {
            ComposerLookSceneKey(look: look, canvas: $0, date: lookDate, person: lookPerson)
        }
        let scene = cles.lazy.compactMap { self.scenes.cached($0) }.first ?? ComposerLookPainter.scene(for: cles[1])
        guard let photo = scene?.slots.first?.photo, photo.height > 0 else { return neutre }
        return photo.width / photo.height
    }

    /// Le doigt glisse : le média le suit, sans jamais sortir de sa case. Pendant
    /// le rendu de « Terminé », plus rien ne bouge : ce qui part est ce qu'on
    /// voyait en validant.
    func reframe(from anchor: ComposerFraming, translation: CGSize, viewSize: CGSize) {
        guard !isRenderingLook, let source = editExtent else { return }
        framing = anchor.panned(by: translation, viewSize: viewSize, source: source, aspect: framingAspect)
    }

    /// Les doigts s'écartent : le média se rapproche, borné par `ComposerFraming.scaleRange`.
    func rezoom(from anchor: ComposerFraming, scale: CGFloat) {
        guard !isRenderingLook, let source = editExtent else { return }
        framing = anchor.zoomed(by: scale, source: source, aspect: framingAspect)
    }
}
