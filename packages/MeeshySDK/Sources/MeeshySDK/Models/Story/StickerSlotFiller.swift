import Foundation

// MARK: - Sticker Slot Filler

/// **Le remplissage des emplacements d'un gabarit — et le GEL de la donnée**
/// (#4716, décision D1 du 2026-09-01).
///
/// ## Pourquoi l'instant est un PARAMÈTRE
///
/// Aucune fonction d'ici ne lit l'horloge : elle la REÇOIT. C'est ce qui fait
/// du gel une propriété vérifiable plutôt qu'une intention — un témoin passe
/// deux instants et compare, et rien dans la chaîne de rendu n'a de quoi
/// re-résoudre.
///
/// La conséquence produit est celle qu'on voulait : **tout lecteur voit
/// exactement ce que l'auteur a composé**, sur les trois clients, sans appel
/// réseau ni permission — et une story archivée garde son sens, ce qu'une heure
/// recalculée chez le lecteur lui retirerait.
///
/// La LOCALE, elle, a un défaut : c'est celle de l'auteur au moment de poser,
/// et elle est figée avec le reste. Seule l'horloge est toujours injectée.
///
/// ## Pourquoi les noms d'emplacements vivent ici
///
/// Le catalogue les déclare, le remplisseur les remplit, le dessinateur les
/// lit. Trois sites, une seule orthographe possible : une chaîne littérale
/// recopiée aurait divergé au premier gabarit ajouté.
public enum StickerSlotFiller {

    // MARK: Les noms d'emplacements

    /// L'heure telle qu'elle s'AFFICHE, dans la locale de l'auteur — « 14:32 »
    /// en français, « 2:32 PM » en anglais.
    public static let timeSlot = "time"
    /// L'heure en NOMBRE (0–23), zéro-remplie sur deux chiffres.
    ///
    /// Le cadran analogique dessine des AIGUILLES : il lui faut un angle, donc
    /// un nombre. Le lui faire ré-analyser depuis la chaîne d'affichage le
    /// casserait à la première locale qui écrit « 2:32 PM ».
    public static let hourSlot = "hour"
    /// Les minutes en NOMBRE (0–59), zéro-remplies sur deux chiffres.
    public static let minuteSlot = "minute"

    /// La date telle qu'elle s'affiche, dans la locale de l'auteur.
    public static let dateSlot = "date"

    /// Le nom du lieu — ou, à défaut, son adresse (voir `placeSlots(for:)`).
    public static let placeNameSlot = "placeName"
    /// Le détail sous le nom. **Vide** quand le nom a déjà pris l'adresse.
    public static let placeDetailSlot = "placeDetail"

    // MARK: L'heure

    public static func timeSlots(at instant: Date,
                                 calendar: Calendar = Calendar(identifier: .gregorian),
                                 timeZone: TimeZone = .current,
                                 locale: Locale = .current) -> [String: String] {
        var calendrier = calendar
        calendrier.timeZone = timeZone
        calendrier.locale = locale

        let composantes = calendrier.dateComponents([.hour, .minute], from: instant)

        let formateur = DateFormatter()
        formateur.locale = locale
        formateur.timeZone = timeZone
        formateur.calendar = calendrier
        formateur.timeStyle = .short
        formateur.dateStyle = .none

        return [
            timeSlot: formateur.string(from: instant),
            hourSlot: deuxChiffres(composantes.hour),
            minuteSlot: deuxChiffres(composantes.minute),
        ]
    }

    // MARK: La date

    public static func dateSlots(at instant: Date,
                                 calendar: Calendar = Calendar(identifier: .gregorian),
                                 timeZone: TimeZone = .current,
                                 locale: Locale = .current) -> [String: String] {
        var calendrier = calendar
        calendrier.timeZone = timeZone
        calendrier.locale = locale

        let formateur = DateFormatter()
        formateur.locale = locale
        formateur.timeZone = timeZone
        formateur.calendar = calendrier
        formateur.dateStyle = .long
        formateur.timeStyle = .none

        return [dateSlot: formateur.string(from: instant)]
    }

    // MARK: Le lieu

    /// Dépouille un `SharedPlace` en emplacements — à UN endroit, pour les
    /// trois gabarits de lieu.
    ///
    /// **Un lieu peut n'avoir aucun nom** : `SharedPlace.name` est optionnel
    /// « pour un point posé à la main dont le géocodage inverse n'a rien rendu »
    /// (son propre doc-comment). Le cartouche prend alors l'adresse comme
    /// titre, et le détail reste VIDE — répéter l'adresse aux deux lignes
    /// donnerait une décoration qui bégaie.
    public static func placeSlots(for place: SharedPlace) -> [String: String] {
        let nom = nonVide(place.name)
        let adresse = nonVide(place.address)

        if let nom {
            return [placeNameSlot: nom, placeDetailSlot: adresse ?? ""]
        }
        return [placeNameSlot: adresse ?? "", placeDetailSlot: ""]
    }

    // MARK: -

    private static func deuxChiffres(_ valeur: Int?) -> String {
        String(format: "%02d", valeur ?? 0)
    }

    private static func nonVide(_ chaîne: String?) -> String? {
        guard let chaîne, !chaîne.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return chaîne
    }
}
