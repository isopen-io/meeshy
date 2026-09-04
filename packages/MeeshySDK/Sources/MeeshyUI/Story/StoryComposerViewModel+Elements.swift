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

    /// Nomme quelqu'un, dans le mode choisi.
    ///
    /// PINNED pose un `StoryTextObject` portant `@pseudo` et son
    /// `referenceUserId` ; les trois autres modes ne posent RIEN sur le
    /// canevas — ils vivent dans `references`, que la publication déclare.
    ///
    /// Changer de mode et en choisir un sont le MÊME geste : cette méthode est
    /// donc aussi celle qui change un mode, et c'est elle qui retire le badge
    /// quand on quitte PINNED (le laisser afficherait une étiquette que plus
    /// rien ne justifie).
    func addReference(_ reference: ComposerReference) {
        let key = reference.username.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !key.isEmpty else { return }

        // **La mention naît attachée à la publication COURANTE** (#4068).
        // En profil Story, une slide EST une publication : c'est son id qui
        // fait la portée. L'appelant n'a pas à la fournir — il ne sait pas
        // toujours dans quel profil il est, et une clé qu'on peut oublier de
        // passer est une portée qui se perd en silence.
        var attachée = reference
        if attachée.publicationKey == nil { attachée.publicationKey = currentSlide.id }

        let previous = references.first {
            $0.username.lowercased() == key && $0.publicationKey == attachée.publicationKey
        }
        references = ComposerReferences.upsert(attachée, into: references)

        if previous?.display == .pinned, attachée.display != .pinned {
            removeBadge(of: previous ?? attachée)
        }
        if attachée.display == .pinned, previous?.display != .pinned {
            poseBadge(for: attachée)
        }
    }

    /// Adopte l'ensemble rendu par la feuille de sélection.
    ///
    /// La feuille pilote l'ensemble sans rien savoir du canevas : c'est ICI que
    /// l'écart se traduit en badges posés ou retirés. Les retraits d'abord —
    /// sinon un mode changé reposerait le badge qu'on vient d'enlever.
    func applyReferences(_ updated: [ComposerReference]) {
        let kept = Set(updated.map { $0.username.lowercased() })
        for gone in references where !kept.contains(gone.username.lowercased()) {
            removeReference(username: gone.username)
        }
        for reference in updated { addReference(reference) }
    }

    /// Retire une personne — et le badge qui la portait, s'il y en avait un.
    ///
    /// La référence est lue AVANT le retrait : c'est elle qui porte le `userId`
    /// par lequel son badge se reconnaît.
    func removeReference(username: String) {
        let key = username.lowercased()
        let departing = references.first { $0.username.lowercased() == key }
        references = ComposerReferences.remove(username: username, from: references)
        removeBadge(of: departing ?? ComposerReference(username: username, display: .pinned))
    }

    /// Retire du canevas le badge d'une personne, sans toucher à sa référence :
    /// c'est le mode qui vient de changer, pas la décision de la nommer.
    ///
    /// Un badge se reconnaît à son `referenceUserId`, jamais à son texte : la
    /// pastille est un `StoryTextObject` ordinaire, que l'auteur peut retoucher
    /// au doigt. Comparé au texte, un badge renommé survivait à son propre
    /// retrait — et la règle d'union du canevas le redéclarait PINNED à la
    /// publication, annulant en silence le mode choisi. Le repli sur le texte ne
    /// sert qu'aux références sans `userId`, qui ne peuvent pas avoir de badge.
    private func removeBadge(of reference: ComposerReference) {
        let key = "@\(reference.username.lowercased())"
        var effects = currentEffects
        let doomed = effects.textObjects.filter { object in
            guard let badgeUserId = object.referenceUserId else { return false }
            guard let userId = reference.userId else { return object.text.lowercased() == key }
            return badgeUserId == userId
        }
        guard !doomed.isEmpty else { return }
        let ids = Set(doomed.map(\.id))
        effects.textObjects.removeAll { ids.contains($0.id) }
        currentEffects = effects
        if let selected = selectedElementId, ids.contains(selected) { selectedElementId = nil }
        for id in ids { zIndexMap.removeValue(forKey: id) }
    }

    /// Épingle quelqu'un sur la slide SANS l'écrire dans une phrase (directive
    /// user 2026-08-18). La pastille EST un `StoryTextObject` portant `@pseudo` :
    /// elle hérite ainsi, gratuitement, de tout ce que le texte sait déjà faire —
    /// déplacement, rotation, z-order, timeline, rendu à l'export, persistance
    /// dans `StoryEffects` (la seule unité que le dépôt enregistre et envoie).
    /// Un type d'élément neuf aurait réclamé les six chemins, et en aurait
    /// silencieusement raté un.
    ///
    /// `referenceUserId` est ce qui la distingue d'une phrase : sans lui, la
    /// dérivation INLINE côté serveur relirait le badge comme une mention de
    /// texte et écraserait le mode choisi par l'auteur. C'est aussi lui qui la
    /// rend publiable après une reprise de brouillon, quand la liste des
    /// références n'existe plus mais que le canevas, lui, a survécu — d'où le
    /// refus de poser un badge dont on ne connaît pas la personne.
    ///
    /// Le fond plein est ce qui la fait LIRE comme une étiquette et non comme du
    /// texte libre — c'est la seule chose qui la distingue à l'œil.
    ///
    /// Décalage en cascade comme les lieux et les stickers : deux mentions
    /// successives ne doivent pas se superposer exactement.
    @discardableResult
    private func poseBadge(for reference: ComposerReference) -> StoryTextObject? {
        let handle = reference.username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !handle.isEmpty, let userId = reference.userId, canAddText else { return nil }
        let existing = currentEffects.textObjects.filter { $0.text.hasPrefix("@") }.count
        var obj = StoryTextObject(
            text: "@" + handle,
            x: 0.5,
            y: 0.62 + Double(existing % 5) * 0.06,
            scale: 1.0,
            rotation: 0,
            fontSize: 64,
            textStyle: "bold",
            textColor: "FFFFFF",
            textAlign: "center",
            backgroundStyle: .solid(hex: MeeshyColors.brandPrimaryHex),
            sourceLanguage: declaredContentLanguage
        )
        obj.referenceUserId = userId
        var effects = currentEffects
        var texts = effects.textObjects
        texts.append(obj)
        effects.textObjects = texts
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        // Pas de bascule vers l'outil texte : le geste s'achève à la pose. Un
        // panneau d'édition qui s'ouvre sur une étiquette qu'on vient de choisir
        // demanderait de la refermer pour en poser une seconde.
        return currentEffects.textObjects.first { $0.id == obj.id } ?? obj
    }

    /// Pose une pastille de lieu en BAS de slide, centrée (brief T20) — hors
    /// timeline : elle reste visible tant que la slide l'est. Écrit dans
    /// `currentEffects`, la seule source de vérité (et la seule unité persistée
    /// / envoyée au serveur). Décalage en cascade comme les stickers pour que
    /// deux lieux successifs ne se superposent pas exactement.
    /// - Parameter styleId: le gabarit qui DÉCORE la pastille (#4717). `nil`
    ///   rend la pastille d'origine, au pixel près — c'est le cas de la porte
    ///   canonique du lieu, qui n'a pas à choisir une décoration.
    /// `public` depuis le #4579 : la palette de constructions du composer
    /// unifié — qui vit dans l'APP — pose des lieux décorés. Son voisin
    /// `addSticker` l'était déjà pour la même raison.
    @discardableResult
    public func addLocation(place: SharedPlace, styleId: String? = nil) -> StoryLocationObject {
        let offset = Double(currentEffects.locationObjects.count % 5) * 0.04
        let badge = StoryLocationObject(place: place, x: 0.5, y: 0.8 - offset,
                                        sourceLanguage: declaredContentLanguage,
                                        styleId: styleId)
        var effects = currentEffects
        effects.locationObjects.append(badge)
        currentEffects = effects
        selectedElementId = badge.id
        bringToFront(id: badge.id)
        return currentEffects.locationObjects.first { $0.id == badge.id } ?? badge
    }

    func removeLocation(id: String) {
        var effects = currentEffects
        effects.locationObjects.removeAll { $0.id == id }
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
    }

    /// C13 — les stickers suivent le modèle moderne : `currentEffects` est la
    /// SEULE source de vérité (parité addText). L'ancien chemin @State View
    /// canvas-authored révertait les mutations VM/canvas au sync suivant.
    /// Décalage en cascade pour que des ajouts successifs ne s'empilent pas
    /// exactement au même point.
    @discardableResult
    /// - Parameter scale: l'échelle de POSE. `nil` garde le défaut du modèle
    ///   (taille de référence) ; les surfaces qui posent sur une scène passent
    ///   `StorySticker.posedScale`, à laquelle le sticker se voit d'emblée.
    public func addSticker(emoji: String,
                           provider: String? = nil,
                           scale: Double? = nil) -> StorySticker {
        let count = currentEffects.stickerObjects?.count ?? 0
        let offset = Double(count % 5) * 0.04
        var sticker = StorySticker(emoji: emoji, provider: provider,
                                   sourceLanguage: declaredContentLanguage,
                                   x: 0.5 + offset, y: 0.5 + offset)
        if let scale { sticker.scale = scale }
        var effects = currentEffects
        var stickers = effects.stickerObjects ?? []
        stickers.append(sticker)
        effects.stickerObjects = stickers
        currentEffects = effects
        // Sélectionné à la pose, comme une décoration (#4824) : la feuille se
        // referme sur le geste, et l'auteur doit retrouver ce qu'il vient de
        // poser sous ses poignées, pas le chercher.
        selectedElementId = sticker.id
        bringToFront(id: sticker.id)
        return currentEffects.stickerObjects?.first { $0.id == sticker.id } ?? sticker
    }

    /// **Pose une DÉCORATION** — un gabarit et ses emplacements déjà figés
    /// (#4716).
    ///
    /// Le placement, la cascade et le z-order sont ceux de `addSticker(emoji:)` :
    /// une décoration est un sticker, pas une sixième famille de scène.
    ///
    /// Deux choses lui sont propres :
    /// - **l'échelle vient du GABARIT**, jamais de `StorySticker.posedScale` —
    ///   ce 2,2 agrandit un glyphe nu, et ferait déborder un cartouche qui
    ///   mesure déjà son contenu ;
    /// - **l'emoji de repli est écrit ICI**, pas à la publication : un brouillon
    ///   relu par une version antérieure — qui ne sait rien du gabarit — doit
    ///   déjà montrer un glyphe. Même règle que le sticker image juste en
    ///   dessous.
    @discardableResult
    public func addSticker(template: StickerTemplate,
                           slots: [String: String]) -> StorySticker {
        let count = currentEffects.stickerObjects?.count ?? 0
        let offset = Double(count % 5) * 0.04
        var sticker = StorySticker(emoji: template.fallbackEmoji,
                                   templateId: template.id,
                                   slots: slots,
                                   sourceLanguage: declaredContentLanguage,
                                   x: 0.5 + offset, y: 0.5 + offset)
        sticker.scale = template.posedScale
        sticker.animation = template.animation
        var effects = currentEffects
        var stickers = effects.stickerObjects ?? []
        stickers.append(sticker)
        effects.stickerObjects = stickers
        currentEffects = effects
        selectedElementId = sticker.id
        bringToFront(id: sticker.id)
        return currentEffects.stickerObjects?.first { $0.id == sticker.id } ?? sticker
    }

    /// Pose une image de « Mes stickers ». Le placement, la cascade et le
    /// z-order restent ceux de `addSticker(emoji:)` — seule la charge diffère.
    ///
    /// Le bitmap est retenu sous l'id de l'ÉLÉMENT, dans `loadedImages` : c'est
    /// là que le composer tient tout média importé qu'aucun upload n'a encore
    /// adressé (`StoryMediaObject` naît avec un `postMediaId` vide et son
    /// bitmap sous `loadedImages[obj.id]`). Écrire un identifiant local dans
    /// `postMediaId` publierait une référence morte : la publication lit
    /// justement `postMediaId.isEmpty` pour savoir ce qui reste à téléverser.
    ///
    /// L'emoji de repli est écrit ICI, pas à la publication : un brouillon relu
    /// par une version antérieure — qui ne sait rien de l'image — doit déjà
    /// montrer un glyphe.
    /// - Parameter animatedData: les octets d'un GIF/APNG/WebP/HEICS collé
    ///   (#3956) — `nil` pour une image fixe, qui ne paie donc rien. Ils sont
    ///   retenus sous le MÊME id que le bitmap : la couche du canvas essaie les
    ///   octets d'abord et retombe sur l'image fixe quand il n'y en a pas.
    @discardableResult
    public func addSticker(image: UIImage,
                           provider: String,
                           scale: Double? = nil,
                           animatedData: Data? = nil) -> StorySticker {
        let sticker = addSticker(emoji: StorySticker.imageFallbackEmoji,
                                 provider: provider, scale: scale)
        registerLoadedImage(image, for: sticker.id)
        if let animatedData {
            registerLoadedStickerAnimation(animatedData, for: sticker.id)
        }
        return sticker
    }

    @discardableResult
    /// Point d'entrée protocolaire (`StoryComposerProviding`) : génère un id
    /// frais et délègue à la variante `id`-explicite.
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil) -> StoryMediaObject? {
        addMediaObject(kind: kind, toSlideId: toSlideId, id: UUID().uuidString)
    }

    /// Variante avec id explicite. Le composer passe l'`objectId` qui a servi à
    /// nommer le fichier temp `{objectId}.{ext}` : ainsi `obj.id` == nom-de-fichier
    /// == `composerKey` dérivé par `StoryBackgroundLayer.configure`. Sans cet
    /// alignement, le bitmap du fond (stocké sous `obj.id` dans `loadedImages`)
    /// n'est jamais retrouvé par la clé issue du fichier → fond `.clear` →
    /// canvas noir (bug user 2026-07-20).
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil, id: String) -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        // Resolve the target slide. If the caller pinned a specific id (e.g., the
        // PhotosPicker started on slide 0 and the user switched to slide 1 mid-load),
        // honour it — without this guard, the new media object would be appended to
        // whichever slide happened to be active when the async task resolved.
        let targetSlideIndex: Int = {
            if let id = toSlideId, let idx = slides.firstIndex(where: { $0.id == id }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetSlideIndex) else { return nil }

        // La slide CIBLE, pas la courante : ce site peut poser sur une autre
        // slide, et cascader d'après les objets de la mauvaise donnerait un
        // décalage sans rapport avec ce que l'auteur voit.
        let center = nextObjectPosition(in: slides[targetSlideIndex].effects)
        var targetEffects = slides[targetSlideIndex].effects
        // Auto-background uniquement si la slide n'a aucun media visuel (pre-migration
        // inclus : resolvedBackgroundMedia retombe sur le 1er existant). Un fond
        // statique stocké dans `slideImages` (slide-level bg image) compte aussi
        // comme background — sans ce check, un media ajouté APRÈS un setImage(...)
        // serait incorrectement marqué bg, masquerait l'image, et briserait le
        // synthetic-clip injecté par loadCurrentSlideIntoTimeline.
        let hasSlideLevelBgImage = slideImages[slides[targetSlideIndex].id] != nil
        let shouldBeBackground = targetEffects.resolvedBackgroundMedia == nil && !hasSlideLevelBgImage
        let obj = StoryMediaObject(
            id: id,
            postMediaId: "",
            kind: kind,
            placement: "media",
            // **`nil`, et c'est la correction du #5100.** Ce site posait `1.0`
            // avec un TODO « compute real aspectRatio from asset » : la valeur
            // était donc une SENTINELLE qui se lisait comme un carré. Les
            // appelants mesurent ensuite (`setMediaAspectRatio`) ; jusque-là
            // l'objet doit DIRE qu'il ne sait pas, sans quoi un recadrage tapé
            // pendant cette fenêtre pose une borne calculée contre 1:1 —
            // enregistrée, publiée, et impossible à distinguer d'un choix.
            aspectRatio: nil,
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0,
            // Bg media loops by default so a short video/asset covers the
            // full slide duration. Without this, `StoryMediaObject.loop`
            // defaults to false → `bgVideo.loop ?? true` in StoryRenderer
            // never falls back to true → AVPlayerLooper never armed → video
            // stops at its native end while the slide progress bar continues
            // (user report 2026-05-27).
            isBackground: shouldBeBackground,
            loop: shouldBeBackground,
            sourceLanguage: declaredContentLanguage
        )
        var medias = targetEffects.mediaObjects ?? []
        medias.append(obj)
        targetEffects.mediaObjects = medias
        slides[targetSlideIndex].effects = targetEffects
        // Selection / z-index state is composer-global; only mutate it when we're
        // actually adding to the currently-visible slide so the UI doesn't jump.
        if targetSlideIndex == currentSlideIndex {
            selectedElementId = obj.id
            bringToFront(id: obj.id)
        }
        return obj
    }

    /// Pin the natural asset duration on a media object so the reader's
    /// visibility window matches the actual playback length. Idempotent: a
    /// later trim from the timeline editor overwrites this baseline.
    func setMediaDuration(id: String, duration: Float, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].duration = Double(duration)
        // Fige la durée NATIVE de l'asset à la première pose (= import). Sert de
        // borne au rognage (on ne peut pas étendre un clip au-delà du média
        // source). Les changements de fenêtre ultérieurs (timeline editor) ne
        // l'écrasent pas.
        if medias[mediaIdx].intrinsicDuration == nil {
            medias[mediaIdx].intrinsicDuration = Double(duration)
        }
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Set the `mediaURL` on a `StoryMediaObject`. Called after persisting
    /// a composer-loaded UIImage to a temp file so the CALayer canvas
    /// (`StoryMediaLayer.configureImage`) can load it via `file://` URL.
    /// Without this bridge the media object's `mediaURL` stays `nil` and the
    /// layer renders a black rectangle.
    func setMediaURL(id: String, url: String, slideId: String? = nil) {
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].mediaURL = url
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// **Adopte une PRÉ-MONTÉE** — l'asset est déjà chez le serveur, l'objet
    /// cesse d'être local (#5086, vue `4c`).
    ///
    /// La recherche se fait par URL LOCALE et non par identifiant d'objet, et
    /// balaie TOUTES les slides. Deux raisons, chacune décisive :
    ///
    /// - la montée est lancée à la POSE, et l'auteur peut déplacer l'objet
    ///   d'une slide à l'autre pendant qu'elle voyage ; un index de slide
    ///   capturé au départ désignerait la mauvaise à l'arrivée ;
    /// - le registre de pré-montée est indexé par FICHIER, parce que c'est le
    ///   fichier qui monte. Lui faire tenir des identifiants d'objet
    ///   l'obligerait à suivre les créations et suppressions du document.
    ///
    /// Les deux champs se posent ENSEMBLE, et c'est ce qui rend l'adoption
    /// sûre : la boucle de publication saute tout objet dont `postMediaId` est
    /// non vide, donc un objet qui porterait l'identifiant sans l'URL distante
    /// serait publié avec un `file://` que personne ne peut lire.
    ///
    /// - Returns: `true` si un objet a été adopté. `false` — l'auteur a retiré
    ///   le média pendant la montée — n'est pas une erreur : l'appelant y lit
    ///   qu'il peut oublier cette pré-montée.
    @discardableResult
    func adoptPreUploadedMedia(localURL: String, postMediaId: String, remoteURL: String) -> Bool {
        for slideIdx in slides.indices {
            var effects = slides[slideIdx].effects
            guard var medias = effects.mediaObjects,
                  let mediaIdx = medias.firstIndex(where: { $0.mediaURL == localURL })
            else { continue }
            medias[mediaIdx].postMediaId = postMediaId
            medias[mediaIdx].mediaURL = remoteURL
            effects.mediaObjects = medias
            slides[slideIdx].effects = effects
            return true
        }
        return false
    }

    /// Met à jour l'aspectRatio (width/height) d'un media. Appelé après le
    /// pick PhotosPicker / record une fois que l'asset natural size est
    /// mesurée via `UIImage.size` (image) ou `AVAssetTrack.naturalSize` +
    /// `preferredTransform` (vidéo). Sans ça, l'aspectRatio reste à 1.0 et
    /// la layer est rendue en carré 540x540 (cf. `baseMediaDesignSize`).
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String? = nil) {
        guard aspectRatio.isFinite, aspectRatio > 0 else { return }
        let targetIndex: Int = {
            if let slideId, let idx = slides.firstIndex(where: { $0.id == slideId }) {
                return idx
            }
            return currentSlideIndex
        }()
        guard slides.indices.contains(targetIndex) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].aspectRatio = aspectRatio
        effects.mediaObjects = medias
        // « L'import de l'image de fond impose le cadre et forme du Canvas » : dès
        // que la forme réelle du fond est connue (mesure asset après import, ou
        // recadrage), le ratio du canvas suit — paysage → 16:9, sinon 9:16.
        effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
        slides[targetIndex].effects = effects
        // Miroir dans le side-cache si d'autres surfaces le lisent.
        mediaAspectRatios[id] = CGFloat(aspectRatio)
    }

    /// Insère une piste EMPRUNTÉE à la bibliothèque de sons.
    ///
    /// Se distingue d'`addAudioObject` sur deux points, et les deux comptent :
    /// - `soundId` est renseigné et `postMediaId` reste vide — c'est ce couple
    ///   qui dit au serveur « enregistre un usage, ne capture rien, ne crédite
    ///   personne d'autre » ;
    /// - `mediaURL` porte l'URL distante, sans quoi ni le lecteur ni l'export ne
    ///   sauraient retrouver le son (l'export ne reçoit qu'un `StorySlide`).
    /// **`public` parce que l'étagère des sons s'ouvre aussi depuis le MEUBLE.**
    /// Le composer unifié n'avait aucun chemin vers elle : sa porte « son »
    /// n'enregistrait qu'un vocal, alors que la doctrine de la vue `2c` sépare
    /// justement les deux provenances — un son EMPRUNTÉ devient le fond, une
    /// note vocale ne l'est jamais. C'est cette fonction, et elle seule, qui
    /// pose le premier.
    /// **Un son emprunté, éventuellement ROGNÉ** (#4657).
    ///
    /// `trim` porte l'intervalle conservé, en secondes depuis le début de la
    /// piste. Il se pose en `sourceStart`/`sourceEnd` — **jamais** en découpant
    /// un fichier : un son de la bibliothèque garde son `soundId`, et le crédit
    /// de son auteur avec lui. Ré-encoder une copie rognée en ferait un fichier
    /// anonyme, ce que la doctrine du crédit interdit.
    ///
    /// `nil` ⇒ la piste entière, comme avant ce lot.
    @discardableResult
    public func addBorrowedSound(_ sound: APISound,
                                 trim: ClosedRange<TimeInterval>? = nil) -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        let hasExistingBackgroundAudio = currentEffects.resolvedBackgroundAudio != nil
        var obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: 0.5,
            y: 0.65,
            volume: 1.0,
            waveformSamples: sound.waveform,
            isBackground: hasExistingBackgroundAudio ? nil : true,
            duration: sound.durationSeconds.map { Float($0) },
            sourceLanguage: declaredContentLanguage,
            // Le titre de l'auteur, quand il existe, sert de nom de piste dans
            // la timeline. Sans titre on laisse `nil` : le libellé par défaut se
            // compose à l'affichage, dans la langue du lecteur.
            name: sound.hasAuthoredTitle ? sound.title : nil,
            mediaURL: sound.fileUrl,
            soundId: sound.id,
            soundAuthorUsername: sound.uploader?.username
        )
        // Le rognage se pose sur la SOURCE, pas sur un fichier : c'est ce qui
        // laisse `soundId` intact, donc le crédit de l'auteur (#4657).
        // `duration` suit l'intervalle — sans quoi la piste annoncerait sa
        // longueur entière et le lecteur attendrait après la fin du segment.
        if let trim {
            obj.sourceStart = trim.lowerBound
            obj.sourceEnd = trim.upperBound
            obj.duration = Float(trim.upperBound - trim.lowerBound)
        }
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        if let seconds = sound.durationSeconds {
            autoExtendDuration(forElementEnd: Float(seconds))
        }
        return obj
    }

    @discardableResult
    /// `role` nil ⇒ la règle automatique s'applique telle quelle : aucun site
    /// d'appel existant ne change de comportement (#4483).
    func addAudioObject(role: ComposerAudioRole?) -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        // La cascade est SANS EFFET sur un son qui bascule en fond juste après
        // — un fond n'a pas de position. La calculer quand même coûte un
        // parcours et évite une branche qui devrait deviner, avant la bascule,
        // ce que la règle d'auto-fond décidera après.
        let center = nextObjectPosition(in: currentEffects)
        // Auto-bascule en background si aucun audio n'est déjà en background
        // (ni via isBackground=true, ni via le champ legacy backgroundAudioId).
        let obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: center.x,
            y: min(0.9, center.y + 0.15),
            volume: 1.0,
            waveformSamples: [],
            // Règle EXTRAITE au #4052 : elle vivait ici en clair, et le second
            // site qui en avait besoin (le son porté depuis l'écran document)
            // l'aurait recopiée. Un `enum` pur la rend éprouvable sans monter
            // de vue, et interdit qu'un jour les deux divergent sur « un audio
            // écrase-t-il celui qui est déjà en fond ? ».
            isBackground: ComposerAudioPlacement.isBackground(
                chosen: role,
                sceneAlreadyHasBackgroundAudio: currentEffects.resolvedBackgroundAudio != nil
            ),
            sourceLanguage: declaredContentLanguage
        )
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        return obj
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
