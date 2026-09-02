import Testing
import Foundation
import CoreGraphics
@testable import MeeshySDK

/// #4833 — **le pont v1⇄v3 prouve son EXHAUSTIVITÉ, et ne nomme aucune clé.**
///
/// `CanvasV3(migrating:)` et `StoryEffects(rendering:)` ne TRANSPORTENT pas une
/// charge : ils la **RECOMPOSENT champ par champ**. Chaque branche est donc un
/// inventaire humain, et toute clé ajoutée en amont s'y perd **en silence**.
/// Quatre morsures en deux jours, toutes sur ce fichier :
/// `postMediaId`/`provider`, puis `templateId`/`slots`, puis `styleId`, puis la
/// FENÊTRE TEMPORELLE d'un lieu (#4840).
///
/// Les correctifs ont chaque fois livré un témoin PAR CLÉ. Ces témoins sont
/// justes, ils sont verts, et aucun ne pouvait attraper le suivant :
///
/// > Un témoin par clé ne parle que des clés auxquelles on a déjà pensé. La
/// > troisième morsure est arrivée sous un témoin neuf, écrit le matin même.
///
/// **Pourquoi ce témoin lit le TYPE et pas le code.** Un balayage statique des
/// clés émises (`grep 'payload\["…"\]'`) est impossible ici : `textPayload`
/// compose les siennes depuis des TABLES de tuples, donc aucune de ses seize
/// clés n'apparaît littéralement à côté d'un `payload[…]`. Seule une mesure à
/// l'EXÉCUTION — peupler, traverser le pont, comparer — voit ce qui part.
///
/// La source de vérité est donc le TYPE lui-même, jamais une liste recopiée
/// ici : `Mirror` énumère les propriétés stockées, `JSONEncoder` rend les clés
/// que le modèle persiste. Ajouter une propriété à une famille, sans toucher au
/// pont, fait tomber ce témoin — en la NOMMANT.
struct CanvasV3ExhaustivityTests {

    // MARK: - L'inventaire se REFLÈTE, il ne se recopie pas

    private func storedProperties(of value: Any) -> Set<String> {
        Set(Mirror(reflecting: value).children.compactMap(\.label))
    }

    private func encoded(_ value: some Encodable) throws -> [String: Any] {
        let data = try JSONEncoder().encode(value)
        return try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? [:]
    }

    /// Comparaison JSON d'une valeur — `NSObject.isEqual` couvre chaîne,
    /// nombre, booléen, tableau et dictionnaire d'un coup.
    private func same(_ a: Any?, _ b: Any?) -> Bool {
        guard let a = normalise(a) as? NSObject,
              let b = normalise(b) as? NSObject else { return a == nil && b == nil }
        return a.isEqual(b)
    }

    /// **L'identité LOCALE d'un keyframe n'est pas sa valeur.**
    ///
    /// `KeyframeV3` ne porte pas d'`id` — le contrat partagé n'en déclare pas —
    /// et `StoryKeyframe(rendering:)` en génère un à la relecture plutôt que de
    /// jeter l'objet porteur (décision documentée sur son `init`). Comparer
    /// l'`id` ferait donc rougir ce témoin sur un comportement VOULU, et le
    /// premier réflexe devant un tel rouge serait de l'exempter EN BLOC — on
    /// perdrait alors la surveillance de `time`, `x`, `y`, `scale`, `opacity`,
    /// `volume` et `easing`, c'est-à-dire tout ce qui compte.
    ///
    /// La normalisation est donc CHIRURGICALE : elle retire une clé nommée,
    /// pour la raison écrite ici, et laisse le reste sous garde.
    private func normalise(_ value: Any?) -> Any? {
        guard let tableau = value as? [[String: Any]] else { return value }
        return tableau.map { element in
            var copie = element
            copie.removeValue(forKey: "id")
            return copie
        }
    }

    // MARK: - Les cinq familles, PLEINEMENT peuplées
    //
    // Chaque champ porte une valeur DISTINCTE de son défaut de décodage : un
    // champ laissé à son défaut ne peut rien prouver, puisque son absence sur
    // le fil le restitue à l'identique. C'est la même raison qui fait écrire un
    // témoin de gabarit sur autre chose que `location.pill` (#4832).

    private func fullText() -> StoryTextObject {
        var text = StoryTextObject(
            id: "tx-1", text: "Tessalit",
            x: 0.31, y: 0.72, scale: 1.4, rotation: 12,
            zIndex: 7, anchor: CGPoint(x: 0.2, y: 0.3),
            fontSize: 48, fontFamily: "serif",
            textStyle: "neon", textColor: "FF00AA", textAlign: "leading",
            textBg: "000000",
            backgroundStyle: .glass(radius: 24),
            fontWeight: "heavy", frameShape: "capsule",
            framePaddingScale: 1.3, frameBorderWidth: 2.5, frameBorderColor: "AABBCC",
            borderColor: "DDEEFF", borderWidth: 1.5,
            textEffect: "glow",
            translations: ["en": "Tessalit town"], sourceLanguage: "fr",
            startTime: 1.5, duration: 4.25, fadeIn: 0.3, fadeOut: 0.6,
            isLocked: true,
            keyframes: [StoryKeyframe(id: "kf-tx", time: 2, x: 0.4, y: 0.5, scale: 1.1,
                                      opacity: 0.9, easing: .easeIn)],
            name: "titre")
        text.referenceUserId = "user-42"
        return text
    }

    private func fullMedia() -> StoryMediaObject {
        var media = StoryMediaObject(
            id: "md-1", postMediaId: "pm-1", mediaURL: "https://cdn/x.mp4",
            mediaType: "video", placement: "media", aspectRatio: 1.7778,
            x: 0.42, y: 0.58, scale: 1.2, rotation: 8,
            anchor: CGPoint(x: 0.1, y: 0.9),
            volume: 0.65, isBackground: true, loop: true, zIndex: 3,
            intrinsicDuration: 12.5,
            startTime: 0.75, duration: 6.5, fadeIn: 0.2, fadeOut: 0.4,
            sourceLanguage: "fr",
            keyframes: [StoryKeyframe(id: "kf-md", time: 1, x: 0.3, y: 0.6, scale: 1.05,
                                      opacity: 0.8, easing: .easeOut)],
            thumbHash: "abc123", name: "plan large",
            isDuckingDisabled: true, sourceStart: 2.5, sourceEnd: 9)
        media.mutedVolumeMemento = 0.9
        return media
    }

    private func fullAudio() -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(
            id: "au-1", postMediaId: "pm-2", placement: "chip",
            x: 0.25, y: 0.65, volume: 0.55, waveformSamples: [0.1, 0.9, 0.4],
            isBackground: true,
            backgroundAudioVariants: [StoryAudioVariant(postMediaId: "pm-en", language: "en",
                                                        isAutoGenerated: false)],
            startTime: 1.25, duration: 8, loop: true, fadeIn: 0.35, fadeOut: 0.45,
            sourceLanguage: "fr", name: "ambiance",
            keyframes: [StoryKeyframe(id: "kf-au", time: 3, volume: 0.4, easing: .linear)],
            mediaURL: "https://cdn/a.m4a",
            soundId: "snd-9", soundAuthorUsername: "amina",
            sourceStart: 1, sourceEnd: 7)
        audio.zIndex = 5
        audio.scale = 1.15
        audio.rotation = 4
        audio.mutedVolumeMemento = 0.8
        return audio
    }

    private func fullSticker() -> StorySticker {
        StorySticker(
            id: "st-1", emoji: "🕐", postMediaId: "pm-3", provider: "giphy",
            templateId: "time.analog", slots: ["hour": "14"],
            animation: .pulse, sourceLanguage: "fr",
            x: 0.66, y: 0.34, scale: 1.3, rotation: 15, zIndex: 9,
            baseSize: 180, anchor: CGPoint(x: 0.4, y: 0.6),
            startTime: 2, duration: 5, fadeIn: 0.25, fadeOut: 0.5)
    }

    private func fullPlace() -> StoryLocationObject {
        StoryLocationObject(
            id: "pl-1",
            place: SharedPlace(latitude: 20.20, longitude: 1.01, name: "Tessalit"),
            x: 0.28, y: 0.82, scale: 1.1, rotation: 6, zIndex: 4,
            anchor: CGPoint(x: 0.3, y: 0.7), sourceLanguage: "fr",
            styleId: "location.stamp",
            startTime: 2.5, duration: 3.5, fadeIn: 0.15, fadeOut: 0.35)
    }

    private func fullEffects() -> StoryEffects {
        var effects = StoryEffects()
        effects.textObjects = [fullText()]
        effects.mediaObjects = [fullMedia()]
        effects.audioPlayerObjects = [fullAudio()]
        effects.stickerObjects = [fullSticker()]
        effects.locationObjects = [fullPlace()]
        return effects
    }

    // MARK: - Étape 1 — le PEUPLEMENT est complet

    /// Sans ce témoin, l'étape 2 serait aveugle par construction : un champ que
    /// j'ai oublié de peupler n'est pas encodé, donc ne peut pas manquer à
    /// l'arrivée. **C'est ce témoin qui rend l'inventaire auto-entretenu** —
    /// ajouter une propriété à une famille le fait rougir en la nommant, avant
    /// même que la question du transport se pose.
    ///
    /// Les propriétés CALCULÉES ne sont pas concernées : `Mirror` n'énumère que
    /// le stockage.
    @Test func everyStoredProperty_ofEveryFamily_isPopulatedAndPersisted() throws {
        let familles: [(String, Any, [String: Any])] = [
            ("text", fullText(), try encoded(fullText())),
            ("media", fullMedia(), try encoded(fullMedia())),
            ("audio", fullAudio(), try encoded(fullAudio())),
            ("sticker", fullSticker(), try encoded(fullSticker())),
            ("place", fullPlace(), try encoded(fullPlace())),
        ]
        for (nom, instance, dict) in familles {
            let manquantes = storedProperties(of: instance)
                .subtracting(dict.keys)
                .subtracting(Self.nonPersistedProperties[nom] ?? [])
            #expect(manquantes.isEmpty,
                    """
                    Famille « \(nom) » : \(manquantes.sorted().joined(separator: ", ")) \
                    n'est pas peuplée ou pas persistée. Peupler le champ avec une valeur \
                    DISTINCTE de son défaut, ou l'inscrire dans `nonPersistedProperties` \
                    avec sa raison.
                    """)
        }
    }

    // MARK: - Étape 2 — le PONT ne perd rien

    /// L'aller-retour complet, famille par famille, clé par clé. Ce que ce
    /// témoin mesure n'est pas « telle clé voyage » mais « AUCUNE clé ne
    /// disparaît » — c'est la seule forme qui attrape la clé à laquelle
    /// personne n'a pensé.
    @Test func theBridge_dropsNoPersistedField_ofAnyFamily() throws {
        let source = fullEffects()
        let back = StoryEffects(rendering: CanvasV3(migrating: source), sceneIndex: 0)

        try compare(famille: "text", source.textObjects.first, back.textObjects.first)
        try compare(famille: "media", source.mediaObjects?.first, back.mediaObjects?.first)
        try compare(famille: "audio", source.audioPlayerObjects?.first, back.audioPlayerObjects?.first)
        try compare(famille: "sticker", source.stickerObjects?.first, back.stickerObjects?.first)
        try compare(famille: "place", source.locationObjects.first, back.locationObjects.first)
    }

    private func compare<T: Encodable>(famille: String, _ avant: T?, _ apres: T?) throws {
        let avant = try #require(avant, "La famille « \(famille) » a disparu ENTIÈRE du pont.")
        let apres = try #require(apres, "La famille « \(famille) » n'est pas revenue du pont.")
        let source = try encoded(avant)
        let retour = try encoded(apres)
        let exemptes = Self.untransportedKeys[famille] ?? [:]

        for (cle, valeur) in source where exemptes[cle] == nil {
            #expect(same(retour[cle], valeur),
                    """
                    Famille « \(famille) », clé « \(cle) » : le pont ne la rend pas \
                    (\(String(describing: retour[cle])) au lieu de \(valeur)). Soit la \
                    brancher dans `CanvasV3Migration` — ALLER et RETOUR —, soit \
                    l'inscrire dans `untransportedKeys` avec sa raison.
                    """)
        }
    }

    // MARK: - Les exemptions, NOMMÉES et motivées

    /// Propriétés stockées qui ne sont volontairement pas persistées : elles
    /// n'ont donc pas de clé au JSON, et l'étape 1 ne peut pas les y trouver.
    ///
    /// **Vide, et c'est un résultat** : les cinq familles persistent tout leur
    /// stockage.
    private static let nonPersistedProperties: [String: Set<String>] = [:]

    /// Clés persistées que le pont ne transporte PAS, chacune avec sa raison.
    /// Une exemption est une DÉCISION, pas un constat — la remplir sans raison
    /// ferait de ce témoin le troisième inventaire à tenir à jour.
    ///
    /// **Vide, et c'est le résultat qui compte** : au premier tour, ce témoin a
    /// nommé quatre pertes réelles — `scale` et `rotation` de la puce audio (que
    /// l'auteur PINCE et TOURNE), sa forme d'onde (sans laquelle le lecteur
    /// dessinait une bande vide), et `textEffect` qu'un lot voisin venait
    /// d'ajouter. Les quatre sont branchées plutôt qu'exemptées. Une exemption
    /// écrite ici serait une perte qu'on choisit ; il n'y en a aucune.
    private static let untransportedKeys: [String: [String: String]] = [:]
}
