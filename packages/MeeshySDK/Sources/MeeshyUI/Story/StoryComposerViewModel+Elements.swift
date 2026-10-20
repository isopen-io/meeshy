import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - StoryComposerViewModel + Elements

extension StoryComposerViewModel {
    /// Langue source par défaut d'un élément de story fraîchement créé (texte,
    /// média, audio) et de la story elle-même à l'ouverture du composer.
    ///
    /// Directive produit 2026-07-30 (public cible premier : la France) : le
    /// composer démarre TOUJOURS en français, à parité avec la barre
    /// universelle (`DefaultComposerLanguage` côté app). Ni la locale
    /// appareil, ni le clavier actif (`UITextInputMode` — premier clavier
    /// ACTIVÉ, pas celui de la frappe), ni la langue de LECTURE
    /// (`systemLanguage`/`regionalLanguage`, des préférences de CONSOMMATION)
    /// ne pilotent ce défaut : chacun de ces signaux a déjà mal étiqueté du
    /// contenu français. La pastille langue de l'éditeur de texte reste le
    /// choix EXPLICITE de l'auteur (directive 2026-07-25) et prime toujours
    /// sur ce défaut via `updateElementLanguage`.
    nonisolated public static var defaultSourceLanguage: String { "fr" }

    /// Réduit un identifiant de clavier à un code de langue exploitable, ou
    /// `nil` quand ce n'en est pas un.
    ///
    /// `UITextInputMode.primaryLanguage` ne renvoie pas QUE des langues : le
    /// clavier emoji annonce `emoji`, la dictée `dictation`. Les prendre pour
    /// argent comptant produirait une story dont la langue source est « emoji »
    /// — intraduisible, et absente du sélecteur de langues.
    nonisolated static func normalisedWritingLanguage(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        // Même réduction que `StoryPrismeMatch.base` côté SDK, désormais le SSOT
        // PUBLIC `MeeshyUser.normalizeLanguageForDedup` : normalisation officielle,
        // puis repli qui rabote la région et la casse (`pt-BR` → `pt`). Ce site
        // ré-inlinait la boucle parce que `StoryPrismeMatch` est interne à
        // MeeshySDK ; le helper de dedup est public, donc plus de troisième jumelle.
        let base = MeeshyUser.normalizeLanguageForDedup(trimmed)
        guard !base.isEmpty, base != "emoji", base != "dictation" else { return nil }
        return base
    }

    /// L'état de composition COURANT, en lecture publique : le host du composer
    /// (`MeeshyComposerHost`, app-side) le migre en `CanvasV3` pour l'aperçu, et
    /// depuis la règle d'encodage B7 c'est PAR CONSTRUCTION ce que la
    /// publication enverra — même fonction, même instant, donc un aperçu qui ne
    /// peut pas mentir.
    ///
    /// Seule la LECTURE franchit la frontière du module : l'écriture reste
    /// interne. L'app orchestre l'atelier, elle ne mute pas son état.
    public internal(set) var currentEffects: StoryEffects {
        get { currentSlide.effects }
        set {
            var slide = currentSlide
            slide.effects = newValue
            currentSlide = slide
        }
    }

    /// Ratio (largeur / hauteur) du canvas courant, piloté par l'image de fond :
    /// paysage → 16:9 horizontal, sinon 9:16 vertical par défaut. Lu par le
    /// cadrage du canvas composer (`StoryComposerView+Canvas`) — réactif car
    /// `currentEffects` dérive de `slides` (@Published).
    ///
    /// `public` (Phase 2, #3939) : le meuble app-side cadre `EmbeddedSceneCanvas`
    /// incrusté à ce ratio (portrait par défaut, paysage si fond paysage).
    public var currentCanvasRatio: CGFloat {
        CGFloat(currentEffects.canvasAspect.ratio)
    }

    /// Vrai si un média d'arrière-plan REMPLIT tout le canvas (aspectFill : mode
    /// `nil`/auto ou `"fill"`). Faux sans média visuel de fond, ou en mode
    /// `"fit"` (letterbox) : dans ces cas le fond ne couvre pas le canvas et on
    /// matérialise ses contours (directive user 2026-07-14).
    var backgroundFillsCanvas: Bool {
        Self.backgroundFillsCanvas(for: currentEffects)
    }

    /// Résolution pure (testable) : un fond visuel remplit le canvas sauf en
    /// mode `"fit"`. Le double-tap du fond cycle `nil` (auto = aspectFill) →
    /// `"fit"` (aspectFit) → `"fill"` (aspectFill) — seul `"fit"` laisse des
    /// bandes vides. Le fit-mode du fond vit sur `backgroundTransform`.
    static func backgroundFillsCanvas(for effects: StoryEffects) -> Bool {
        guard effects.resolvedBackgroundMedia != nil else { return false }
        return effects.backgroundTransform?.videoFitMode != "fit"
    }

    /// **La SCÈNE est figée en 9:16 — le fond n'impose plus sa forme
    /// (directive porteur, 2026-08-31).**
    ///
    /// Elle suivait le ratio CONTINU du fond, clampé à [9/21, 21/9] : « l'import
    /// du fond impose le cadre et forme du Canvas » (directive du 2026-07-14).
    /// Une photo paysage donnait donc un canvas 16:9 — ce que le porteur a
    /// mesuré sur capture, là où toutes les planches du document montrent une
    /// scène verticale.
    ///
    /// **Ce que la règle d'avant coûtait, au-delà de la forme** : le canvas
    /// changeait de proportion SOUS la composition. Un texte posé sur une scène
    /// verticale se retrouvait ailleurs dès qu'on ajoutait un fond paysage, et
    /// l'outil de dessin traçait sur un cadre qui n'était plus celui de la carte
    /// (#4515). Une scène qui change de forme n'est plus une scène : c'est un
    /// cadre qui suit son contenu, quand c'est au contenu de trouver sa place
    /// dans le cadre.
    ///
    /// `nil` veut dire « portrait 9:16 » — la valeur par défaut de
    /// `StoryCanvasAspect.from(ratio:)`. On n'écrit donc pas un nombre : **on
    /// s'abstient d'en imposer un**, ce qui laisse le défaut du modèle décider.
    ///
    /// Ce qui est déjà PUBLIÉ garde son ratio : cette règle ne gouverne que ce
    /// qui se compose maintenant. Et le média qui ne remplit pas la scène laisse
    /// des bandes — elles se peignent, elles ne restent pas noires.
    static func canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double? {
        nil
    }

    var isContentToolActive: Bool {
        guard let tool = activeTool else { return false }
        switch tool {
        case .media, .audio, .drawing, .text, .texture: return true
        case .filters, .timeline: return false
        }
    }

    /// `public` : l'hôte lit ce drapeau pour DEUX décisions distinctes — monter
    /// ou non la surface de capture, et savoir dans quel sens la porte bascule.
    public var isDrawingActive: Bool { activeTool == .drawing }

    func saveBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else { return }
        backgroundTransformCache[id] = backgroundTransform
    }

    func restoreBackgroundTransform() {
        guard let id = slides[safe: currentSlideIndex]?.id else {
            backgroundTransform = BackgroundTransform()
            return
        }
        backgroundTransform = backgroundTransformCache[id] ?? BackgroundTransform()
    }

    /// The current slide's background bitmap used as the base for filter-tile
    /// previews. Resolves the background media object (modern unified path,
    /// `loadedImages[bgMedia.id]`) first, then falls back to the legacy
    /// slide-level `slideImages` entry. `nil` for colour/gradient-only slides
    /// (the grid then shows its gradient placeholders). Mirrors how
    /// `SlideMiniPreview` and the canvas resolve the background image — passing
    /// only `slideImages[slide.id]` left every photo-backed slide's tiles blank
    /// because modern photos live in `mediaObjects`, not `slideImages`.
    /// **`public` depuis #5041** : l'éditeur d'objet plein écran (app) monte la
    /// même `StoryFilterGridView` que `EmbeddedSceneInspector` (SDK) et lui doit
    /// le même aperçu. Servir `nil` depuis l'app aurait montré les tuiles en
    /// dégradé de repli — un aperçu qui ne ressemble pas à ce qui va changer.
    public var currentSlideBackgroundImage: UIImage? {
        if let bgId = currentSlide.effects.resolvedBackgroundMedia?.id,
           let img = loadedImages[bgId] {
            return img
        }
        return slideImages[currentSlide.id]
    }

    func setAspectRatio(_ ratio: CGFloat, for mediaId: String) {
        guard ratio.isFinite, ratio > 0 else { return }
        mediaAspectRatios[mediaId] = ratio
    }

    func beginDrag(elementId: String, position: CGPoint, size: CGSize) {
        activeDrag = ActiveDrag(elementId: elementId, position: position, size: size)
    }

    func updateDrag(position: CGPoint) {
        guard var current = activeDrag, current.position != position else { return }
        current.position = position
        activeDrag = current
    }

    func endDrag() {
        activeDrag = nil
    }

    func applyFilter(_ name: String?) {
        selectedFilter = name
        var effects = currentEffects
        effects.filter = name
        effects.filterIntensity = name != nil ? filterIntensity : nil
        currentEffects = effects
    }

    func updateFilterIntensity(_ value: Double) {
        filterIntensity = value
        var effects = currentEffects
        effects.filterIntensity = value
        currentEffects = effects
    }

    var isCanvasZoomed: Bool { canvasScale != 1.0 }

    func resetCanvasZoom() {
        canvasScale = 1.0
        canvasOffset = .zero
    }

    /// Returns the normalized (0-1) canvas position corresponding to the current viewport center.
    /// When zoomed/panned, new elements should appear at the visible center, not at (0.5, 0.5).
    func viewportCenter() -> CGPoint {
        guard canvasSize.width > 0, canvasSize.height > 0, canvasScale > 0 else {
            return CGPoint(x: 0.5, y: 0.5)
        }
        let nx = 0.5 - canvasOffset.width / (canvasScale * canvasSize.width)
        let ny = 0.5 - canvasOffset.height / (canvasScale * canvasSize.height)
        return CGPoint(
            x: max(0.05, min(0.95, nx)),
            y: max(0.05, min(0.95, ny))
        )
    }

    var textCount: Int { currentEffects.textObjects.count }

    var mediaCount: Int {
        (currentEffects.mediaObjects?.count ?? 0) +
        (currentEffects.audioPlayerObjects?.count ?? 0)
    }

    var canAddText: Bool { textCount < 5 }

    /// `public` : le bouton « Coller » du rail s'éteint quand la scène est
    /// pleine — dix médias. Sans ce plafond lu de l'extérieur, il proposerait un
    /// collage que la pose refuserait ensuite en silence.
    public var canAddMedia: Bool { mediaCount < 10 }

    var canAddImage: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.kind == .image }.count ?? 0) < 5
    }

    var canAddVideo: Bool {
        canAddMedia &&
        (currentEffects.mediaObjects?.filter { $0.kind == .video }.count ?? 0) < 4
    }

    var canAddAudio: Bool {
        canAddMedia &&
        (currentEffects.audioPlayerObjects?.count ?? 0) < 5
    }

    @discardableResult
    /// `public` : la porte TEXTE du composer unifié pose l'objet (#4401). Elle
    /// crée une coquille VIDE — c'est l'éditeur qui la remplit —, et une
    /// coquille restée vide est supprimée à la sortie de l'éditeur
    /// (`exitTextEditingMode`). Un texte annulé ne laisse donc rien.
    /// **Où poser un objet NEUF** (#4939) — jamais sur le précédent.
    ///
    /// Les trois sites qui posent écrivaient chacun `CGPoint(x: 0.5, y: 0.5)`,
    /// le centre exact et sans condition. Deux textes se superposaient au pixel
    /// près et se lisaient comme un seul texte cassé, pendant que la flèche de
    /// l'éditeur annonçait « 2 objets ».
    ///
    /// Les FONDS sont écartés : ils occupent toute la scène et n'ont pas de
    /// position — les compter ferait cascader le premier objet posé sur une
    /// slide qui a un fond, sans raison.
    func nextObjectPosition(in effects: StoryEffects) -> CGPoint {
        StoryObjectPlacement.next(avoiding: effects.sceneObjects
            .filter { !$0.isBackground }
            .map { CGPoint(x: $0.x, y: $0.y) })
    }

    public func addText() -> StoryTextObject? {
        guard canAddText else { return nil }
        let center = nextObjectPosition(in: currentEffects)
        // fontSize en design units (référentiel 1080-px). 96 design ≈ 36 pt
        // sur iPhone 16 Pro (scaleFactor ≈ 0.38) — taille parfaitement
        // lisible. La valeur précédente de 24 produisait du 9 pt rendu
        // (et un editor inline minuscule au moment de saisir).
        let obj = StoryTextObject(
            text: "",
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            fontSize: 96,
            textStyle: "classic",
            textColor: "FFFFFF",
            textAlign: "center",
            sourceLanguage: declaredContentLanguage
        )
        var effects = currentEffects
        var texts = effects.textObjects
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        activeTool = .text
        // `bringToFront` persists a new `zIndex` onto the stored object — return
        // the post-mutation copy so callers never see a stale `zIndex`.
        return currentEffects.textObjects.first { $0.id == obj.id } ?? obj
    }

    /// Public depuis #4063 : le rail *trailing* de l'app agit sur le MODÈLE,
    /// jamais sur la vue UIKit — c'est lui qui garde publication, reader et
    /// export d'accord sur ce qu'est la slide.
    public func deleteElement(id: String) {
        // Defensive guard : a locked text object (e.g. the repost-attribution
        // badge from `init(reposting:authorHandle:)`) cannot be deleted from
        // any path — context menu, timeline panel, contextual toolbar, etc.
        // The UI already hides these affordances on locked elements, but a
        // central refusal here closes any future call site we might miss.
        if currentEffects.textObjects.first(where: { $0.id == id })?.isLocked == true {
            return
        }
        // Supprimer la pastille au doigt RETIRE la référence : sans cette
        // boucle, l'auteur notifie quelqu'un dont plus rien ne témoigne dans la
        // story. Lu AVANT la suppression, seule fenêtre où l'objet existe
        // encore — et par `referenceUserId`, que retoucher l'étiquette ne touche
        // pas, là où son texte identifiait la mauvaise personne, ou personne.
        if let badgeUserId = currentEffects.textObjects.first(where: { $0.id == id })?.referenceUserId {
            references = references.filter { $0.userId != badgeUserId }
        }
        var effects = currentEffects
        effects.textObjects.removeAll { $0.id == id }
        effects.mediaObjects?.removeAll { $0.id == id }
        effects.audioPlayerObjects?.removeAll { $0.id == id }
        effects.stickerObjects?.removeAll { $0.id == id }
        // Retirer l'image de fond rend au canvas sa forme verticale par défaut.
        effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
        // Si on supprime le texte en cours d'édition flottante, sortir du mode.
        if textEditingMode.activeTextId == id { textEditingMode = .inactive }
        // C9 Inc.3 — retrait PARESSEUX : l'historique global peut restaurer
        // cet élément ; ses ressources partent en staging, pas à la poubelle.
        if let img = loadedImages.removeValue(forKey: id) { retiredImages[id] = img }
        if let url = loadedVideoURLs.removeValue(forKey: id) { retiredVideoURLs[id] = url }
        if let url = loadedAudioURLs.removeValue(forKey: id) { retiredAudioURLs[id] = url }
        // Les octets animés suivent leur bitmap (#3956) : les laisser derrière
        // ferait grossir le composer d'un GIF par sticker supprimé, et l'undo
        // ramènerait un sticker figé.
        if let bytes = loadedStickerAnimations.removeValue(forKey: id) {
            retiredStickerAnimations[id] = bytes
        }
        mediaAspectRatios.removeValue(forKey: id)
        zIndexMap.removeValue(forKey: id)
    }

    /// **E3 (#3888) — l'élément NON-TEXTE sélectionné supporte-t-il le choix de
    /// langue ?** Le texte a déjà sa pastille dans l'éditeur inline ; média,
    /// audio, sticker et lieu passent par le contrôle overlay. `nil` sélection
    /// ⇒ `false`.
    var selectedElementSupportsLanguage: Bool {
        guard let id = selectedElementId else { return false }
        let fx = currentEffects
        if fx.mediaObjects?.contains(where: { $0.id == id }) == true { return true }
        if fx.audioPlayerObjects?.contains(where: { $0.id == id }) == true { return true }
        if fx.stickerObjects?.contains(where: { $0.id == id }) == true { return true }
        if fx.locationObjects.contains(where: { $0.id == id }) { return true }
        return false
    }

    /// La langue d'origine de l'élément non-texte sélectionné, ou `nil`.
    var selectedElementSourceLanguage: String? {
        guard let id = selectedElementId else { return nil }
        let fx = currentEffects
        if let m = fx.mediaObjects?.first(where: { $0.id == id }) { return m.sourceLanguage }
        if let a = fx.audioPlayerObjects?.first(where: { $0.id == id }) { return a.sourceLanguage }
        if let st = fx.stickerObjects?.first(where: { $0.id == id }) { return st.sourceLanguage }
        if let l = fx.locationObjects.first(where: { $0.id == id }) { return l.sourceLanguage }
        return nil
    }

    /// Écrit le CONTENU d'un objet texte déjà posé (#4378).
    ///
    /// Elle rejoint la famille des updaters d'élément — celle de
    /// `updateElementLanguage` juste dessous — plutôt que d'ouvrir un troisième
    /// site de CRÉATION. Le collage n'a pas à fabriquer un chemin d'insertion :
    /// il emprunte `addText()`, qui existe et est éprouvé, puis remplit.
    ///
    /// Pourquoi ne pas passer par l'éditeur : `addText()` crée un objet vide ET
    /// ouvre l'éditeur, ce qui est juste pour l'auteur qui écrit. Un collage
    /// apporte déjà son texte ; le faire transiter par l'éditeur obligerait
    /// l'auteur à valider ce qu'il vient de coller.
    public func updateTextContent(id: String, text: String) {
        var effects = currentEffects
        var texts = effects.textObjects
        guard let index = texts.firstIndex(where: { $0.id == id }) else { return }
        texts[index].text = text
        effects.textObjects = texts
        currentEffects = effects
    }

    /// **La famille typographique d'un texte de la scène** (#4083, vue `2e`).
    ///
    /// `TextEditToolOptions` l'écrit par un `@Binding var textObject` — ce qui
    /// convient à un panneau qui POSSÈDE l'objet le temps d'une édition, et pas
    /// du tout à une bande qui n'a qu'un identifiant. Sans ce site, le spécimen
    /// aurait dû se fabriquer un binding, c'est-à-dire une SECONDE écriture du
    /// même champ, à faire diverger au premier ajout d'effet de bord.
    ///
    /// Même forme que `updateTextContent` juste au-dessus, délibérément : deux
    /// écritures du même tableau qui ne se ressemblent pas se relisent deux
    /// fois.
    public func updateTextStyle(id: String, style: StoryTextStyle) {
        var effects = currentEffects
        var texts = effects.textObjects
        guard let index = texts.firstIndex(where: { $0.id == id }) else { return }
        texts[index].textStyle = style.rawValue
        effects.textObjects = texts
        currentEffects = effects
    }

    func updateElementLanguage(elementId: String, language: String) {
        var effects = currentEffects

        if let idx = effects.textObjects.firstIndex(where: { $0.id == elementId }) {
            effects.textObjects[idx].sourceLanguage = language
        }

        if var medias = effects.mediaObjects,
           let idx = medias.firstIndex(where: { $0.id == elementId }) {
            medias[idx].sourceLanguage = language
            effects.mediaObjects = medias
        }

        if var audios = effects.audioPlayerObjects,
           let idx = audios.firstIndex(where: { $0.id == elementId }) {
            audios[idx].sourceLanguage = language
            effects.audioPlayerObjects = audios
        }

        if var stickers = effects.stickerObjects,
           let idx = stickers.firstIndex(where: { $0.id == elementId }) {
            stickers[idx].sourceLanguage = language
            effects.stickerObjects = stickers
        }

        if let idx = effects.locationObjects.firstIndex(where: { $0.id == elementId }) {
            effects.locationObjects[idx].sourceLanguage = language
        }

        currentEffects = effects
    }

    /// Public depuis #4063 — même raison que `deleteElement`.
    public func duplicateElement(id: String) {
        var effects = currentEffects
        if var text = effects.textObjects.first(where: { $0.id == id }) {
            // Locked text objects (repost-attribution badge) are not duplicable —
            // duplicating would create a second editable copy that strips intent.
            if text.isLocked == true { return }
            guard canAddText else { return }
            text.id = UUID().uuidString
            // Offset is 20 design pixels in the 1080x1920 canvas (≈2% x, ≈1% y).
            // Small enough that the clone visibly overlaps its source so the
            // user sees the duplication happened, large enough to be selectable
            // independently. The previous 0.05 (54 design px) was too wide and
            // jumped the clone outside the source's selection rect.
            text.x = min(1.0, text.x + 20.0 / 1080.0)
            text.y = min(1.0, text.y + 20.0 / 1920.0)
            effects.textObjects.append(text)
            selectedElementId = text.id
        } else if var media = effects.mediaObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            media.id = newId
            // Le clone est TOUJOURS un foreground : dupliquer un média de fond
            // créait un 2e background (invariant « au plus 1 background / slide »
            // violé) qui remplit tout le canvas en ignorant l'offset → clone
            // invisible (l'utilisateur ne voyait rien). Bug 2026-06-01.
            media.isBackground = false
            media.x = min(1.0, media.x + 0.05)
            media.y = min(1.0, media.y + 0.05)
            effects.mediaObjects?.append(media)
            if let img = loadedImages[id] { loadedImages[newId] = img }
            if let url = loadedVideoURLs[id] { loadedVideoURLs[newId] = url }
            selectedElementId = media.id
        } else if var audio = effects.audioPlayerObjects?.first(where: { $0.id == id }) {
            guard canAddMedia else { return }
            let newId = UUID().uuidString
            audio.id = newId
            // Idem média : le clone est foreground, sinon dupliquer l'audio de
            // fond créait un 2e background audio (invariant « 1 audio de fond /
            // slide » violé). Bug 2026-06-01.
            audio.isBackground = false
            audio.x = min(1.0, audio.x + 0.05)
            audio.y = min(1.0, audio.y + 0.05)
            effects.audioPlayerObjects?.append(audio)
            if let url = loadedAudioURLs[id] { loadedAudioURLs[newId] = url }
            selectedElementId = audio.id
        }
        currentEffects = effects
    }

    /// Bascule le statut background pour un media visuel OU un audio.
    /// Contrainte : au plus 1 media visuel en background + 1 audio en background par slide.
    /// Toggle ON sur un élément → les autres du même type sont repassés en foreground.
    /// Toggle OFF → l'élément redevient foreground (aucun autre n'est promu automatiquement).
    public func toggleBackground(id: String) {
        var effects = currentEffects

        if let idx = effects.mediaObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.mediaObjects![idx].isBackground == true
                // Si le media est le background implicite (pas de flag explicite mais
                // positionné par la règle legacy), on considère qu'il est déjà en bg.
                || effects.resolvedBackgroundMedia?.id == id
            let newValue = !current
            if newValue {
                for i in effects.mediaObjects!.indices {
                    effects.mediaObjects![i].isBackground = (i == idx) ? true : false
                }
            } else {
                // Matérialise le flag à `false` pour neutraliser la règle legacy.
                effects.mediaObjects![idx].isBackground = false
            }
            // Promotion → le canvas épouse la forme du nouveau fond ; rétrogradation
            // → retour au canvas vertical par défaut (plus aucune image de fond).
            effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
            currentEffects = effects
            refreshStaleCropPreviews(of: effects.mediaObjects ?? [])   // fond ⇄ posé : le bitmap suit (#9499)
            return
        }

        if let idx = effects.audioPlayerObjects?.firstIndex(where: { $0.id == id }) {
            let current = effects.audioPlayerObjects![idx].isBackground == true
            let newValue = !current
            if newValue {
                for i in effects.audioPlayerObjects!.indices {
                    effects.audioPlayerObjects![i].isBackground = (i == idx) ? true : false
                }
                // Toggle ON sur un audio foreground → on retire aussi le bg legacy pour
                // éviter d'avoir 2 audios bg qui jouent en parallèle.
                effects.backgroundAudioId = nil
                effects.backgroundAudioVolume = nil
                effects.backgroundAudioStart = nil
                effects.backgroundAudioEnd = nil
                effects.backgroundAudioVariants = nil
            } else {
                effects.audioPlayerObjects![idx].isBackground = false
            }
            currentEffects = effects
        }
    }

    /// True si l'élément (media ou audio) est actuellement résolu comme background.
    func isBackground(id: String) -> Bool {
        if currentEffects.resolvedBackgroundMedia?.id == id { return true }
        if currentEffects.resolvedBackgroundAudio?.id == id { return true }
        return false
    }

    /// Volume d'un audio (clamp [0, 1]). No-op si l'id ne match aucun audio.
    /// Passe par le mémento : glisser le slider à 0 vaut mute un-bouton, et
    /// l'unmute suivant restaurera le niveau quitté.
    func setAudioVolume(audioId: String, volume: Float) {
        var effects = currentEffects
        guard var audios = effects.audioPlayerObjects,
              let i = audios.firstIndex(where: { $0.id == audioId }) else { return }
        audios[i].setVolumePreservingMuteMemento(min(1, volume))
        effects.audioPlayerObjects = audios
        currentEffects = effects
    }

    /// Mute un-bouton d'une piste AUDIO (chip canvas, cellule du panneau Son).
    /// Persisté via `volume` (0 = muet) + mémento de restauration — le reader
    /// d'un autre utilisateur n'entend donc jamais une piste mutée par l'auteur.
    func toggleAudioMute(id: String) {
        var effects = currentEffects
        guard var audios = effects.audioPlayerObjects,
              let i = audios.firstIndex(where: { $0.id == id }) else { return }
        audios[i].toggleMute()
        effects.audioPlayerObjects = audios
        currentEffects = effects
    }

    /// **Le quart de tour d'un média** (#4082, vue `2d`). La règle vit dans
    /// `StoryMediaRotation` : elle normalise, et elle porte le SENS du glyphe.
    ///
    /// Contrairement au muet, ce geste vaut pour une IMAGE autant que pour une
    /// vidéo — une photo prise de travers est le cas nominal, pas l'exception.
    public func rotateMedia(id: String) {
        var effects = currentEffects
        guard var medias = effects.mediaObjects,
              let i = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[i].rotation = StoryMediaRotation.turned(medias[i].rotation)
        effects.mediaObjects = medias
        currentEffects = effects
    }

    /// Mute un-bouton d'une piste VIDÉO (bouton canvas, rangée du panneau
    /// Médias). No-op pour une image — rien à couper.
    public func toggleMediaMute(id: String) {
        var effects = currentEffects
        guard var medias = effects.mediaObjects,
              let i = medias.firstIndex(where: { $0.id == id }),
              medias[i].kind == .video else { return }
        medias[i].toggleMute()
        effects.mediaObjects = medias
        currentEffects = effects
    }

    func selectTool(_ tool: StoryToolMode?) {
        if activeTool == tool {
            activeTool = nil
        } else {
            activeTool = tool
        }
        if tool == .drawing {
            selectedElementId = nil
        }
    }

    func deselectAll() {
        selectedElementId = nil
        activeTool = nil
    }
}
