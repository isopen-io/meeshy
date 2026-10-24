import Combine
import CoreGraphics
import Foundation
import MeeshySDK
import MeeshyUI

// **Le texte de la retouche, avec les outils de texte du composer** (#12591) — la retouche
// de la caméra ne réinvente rien : une planche de texte, c'est un `StoryComposerViewModel` à une
// slide sans fond. `addText`, la saisie en ligne, le plafond de cinq, la suppression d'une
// coquille vide, le canvas qui déplace, pince et tourne : tout est le composer, rien n'est copié.

/// Les décisions de la planche, pures.
nonisolated enum ComposerRetouchTextRule {

    /// Le plafond du composer : cinq textes.
    static let cap = 5

    enum Entry: Equatable {
        /// L'outil est montré sans texte : on en pose un neuf et la saisie s'ouvre.
        case createAndType
        /// Des textes sont là : on n'en crée pas, on les rend manipulables.
        case reveal
    }

    static func entry(textCount: Int) -> Entry {
        textCount == 0 ? .createAndType : .reveal
    }

    enum BackgroundTap: Equatable {
        /// Toucher le fond pendant la saisie la termine.
        case endTyping
        /// Hors saisie, toucher la scène vide pose un nouveau texte.
        case addText
        /// Au plafond, rien.
        case none
    }

    static func backgroundTap(typing: Bool, textCount: Int) -> BackgroundTap {
        if typing { return .endTyping }
        return textCount < cap ? .addText : .none
    }
}

/// **La planche de texte de la retouche.** Possède son modèle de scène — créé au premier besoin,
/// libéré à la sortie de la retouche : une prise sans texte ne coûte rien.
@MainActor
final class ComposerRetouchTextBoard: ObservableObject {

    private var model: StoryComposerViewModel?
    private var forwarding: AnyCancellable?
    private var glassMemo: (key: String, overlay: ComposerTextOverlay?)?

    nonisolated deinit {}

    /// Le modèle, créé à la première demande.
    var scene: StoryComposerViewModel {
        if let model { return model }
        let neuf = StoryComposerViewModel()
        model = neuf
        forwarding = neuf.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        return neuf
    }

    var texts: [StoryTextObject] {
        model?.currentSlide.effects.textObjects ?? []
    }

    var isEmpty: Bool {
        !texts.contains { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    /// Le texte en cours de saisie, s'il y en a un.
    var typingId: String? {
        model?.textEditingMode.activeTextId
    }

    /// L'empreinte du contenu, du style et de la position : elle change dès qu'un texte change.
    var fingerprint: String {
        texts.filter { !$0.text.isEmpty }.map(Self.signature).joined(separator: "|")
    }

    /// Ce qui se VOIT d'un texte, champ par champ : l'identité du modèle (z, ancre) ou l'ordre d'un
    /// dictionnaire n'entrent pas dans l'empreinte, sans quoi la flèche reviendrait sans geste.
    private static func signature(_ t: StoryTextObject) -> String {
        var champs: [String] = [t.text, String(t.x), String(t.y), String(t.scale), String(t.rotation), String(t.fontSize)]
        champs += [t.fontFamily, t.textStyle ?? "", t.textColor ?? "", t.textAlign ?? "", t.textBg ?? "", t.textEffect ?? ""]
        champs += [String(describing: t.backgroundStyle), t.frameShape ?? "", t.frameBorderColor ?? "", t.borderColor ?? ""]
        champs += [t.fontWeight ?? "", String(t.framePaddingScale ?? 0), String(t.frameBorderWidth ?? 0), String(t.borderWidth ?? 0)]
        return champs.joined(separator: ",")
    }

    /// L'outil Texte est montré : un texte neuf s'ouvre en saisie quand la planche est vide.
    func begin() {
        objectWillChange.send()
        guard ComposerRetouchTextRule.entry(textCount: texts.count) == .createAndType else { return }
        addAndType()
    }

    /// L'action VoiceOver « Ajouter un texte » : la saisie en cours se termine, un texte neuf s'ouvre.
    func addText() {
        endTyping()
        guard texts.count < ComposerRetouchTextRule.cap else { return }
        addAndType()
    }

    func tapBackground() {
        objectWillChange.send()
        switch ComposerRetouchTextRule.backgroundTap(typing: typingId != nil, textCount: texts.count) {
        case .endTyping: endTyping()
        case .addText: addAndType()
        case .none: break
        }
    }

    /// Toucher un texte le rouvre en saisie.
    func tap(_ id: String) {
        objectWillChange.send()
        scene.enterTextEditingMode(textId: id)
    }

    func write(_ text: String, in id: String) {
        scene.updateTextContent(id: id, text: text)
        objectWillChange.send()
    }

    /// La saisie se termine ; une coquille restée vide disparaît (la règle du composer).
    func endTyping() {
        guard model != nil else { return }
        scene.exitTextEditingMode()
        objectWillChange.send()
    }

    /// La retouche quitte : plus de texte pour la prise suivante, plus de modèle en mémoire.
    func reset() {
        guard model != nil else { return }
        forwarding = nil
        model = nil
        glassMemo = nil
        objectWillChange.send()
    }

    /// Les textes cuits sur fond transparent à la définition de sortie, avec leurs vitres (#12602) ;
    /// `nil` sans texte.
    func overlay(canvas: CGSize) -> ComposerTextOverlay? {
        guard let slide = bakedSlide, canvas.width >= 1, canvas.height >= 1,
              let encre = StoryStaticSnapshot.foreground(slide: slide, size: canvas) else { return nil }
        return ComposerTextOverlay(ink: encre, glass: StoryStaticSnapshot.glassPanes(slide: slide, size: canvas))
    }

    /// **Les vitres de l'aperçu** (#12602) : la prise se floute sous chaque texte Verre pendant que
    /// le canvas peint l'encre. Cuites à la moitié de la toile — un geste en recuit une par image —,
    /// et seulement quand un texte ou la toile change : le même calque revient sinon, l'aperçu ne
    /// se repeint pas. `nil` sans verre.
    func previewGlass(canvas: CGSize) -> ComposerTextOverlay? {
        let cle = "\(fingerprint)@\(Int(canvas.width))x\(Int(canvas.height))"
        if let glassMemo, glassMemo.key == cle { return glassMemo.overlay }
        let demi = CGSize(width: (canvas.width / 2).rounded(), height: (canvas.height / 2).rounded())
        let vitres = bakedSlide.map { StoryStaticSnapshot.glassPanes(slide: $0, size: demi) } ?? []
        let calque = vitres.isEmpty ? nil : ComposerTextOverlay(ink: nil, glass: vitres)
        glassMemo = (cle, calque)
        return calque
    }

    /// La slide qui se cuit : les seuls textes écrits.
    private var bakedSlide: StorySlide? {
        guard let model, !isEmpty else { return nil }
        var slide = model.currentSlide
        slide.effects.textObjects = texts.filter { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return slide
    }

    private func addAndType() {
        guard let neuf = scene.addText() else { return }
        scene.enterTextEditingMode(textId: neuf.id)
    }
}
