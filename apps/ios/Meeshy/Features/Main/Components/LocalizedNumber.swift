import Foundation

/// Les nombres que l'application **dit** et **montre** — une règle de locale,
/// un site.
///
/// ## Le défaut qu'il corrige
///
/// Dix valeurs d'accessibilité interpolaient leur nombre à la main :
///
/// ```swift
/// .accessibilityValue("\(likeCount)")          // chiffres latins en arabe
/// .accessibilityValue("\(player.percentInt) %") // …et un « % » gravé
/// ```
///
/// `"\(n)"` grave les **chiffres latins**. L'arabe s'écrit en chiffres
/// arabo-indiens : une interface arabe mêlait donc deux systèmes d'écriture,
/// exactement la régression que 238i puis 239i ont soldée sur les compteurs
/// visibles et les compteurs de portée. Ce type ferme la même famille du côté
/// des valeurs d'accessibilité.
///
/// ## Le pourcentage avait DEUX orthographes dans un même composant
///
/// `MessageOverlayMenu` rendait le même nombre deux fois, à quatre lignes
/// d'écart, avec deux espacements différents :
///
/// | ligne | rendu | forme |
/// |---|---|---|
/// | 974 / 1076 | `"\(player.percentInt) %"` | **avec** espace (usage français) |
/// | 977 / 1104 | `"\(player.percentInt)%"` | **sans** espace (usage anglais) |
///
/// Aucune des deux n'était juste partout : le français veut une espace
/// insécable avant `%`, l'anglais n'en veut pas. Graver l'une ou l'autre, c'est
/// se tromper dans une locale sur deux — et ici, se tromper dans les deux à la
/// fois, puisque la valeur PARLÉE et la valeur AFFICHÉE ne s'accordaient même
/// pas entre elles.
///
/// Le glyphe `%`, son espacement et le système de chiffres appartiennent tous
/// les trois à la **locale**, pas au code. `FormatStyle` les porte déjà.
///
/// ## `exact` — et jamais l'abrégé
///
/// La règle de 239i est conservée telle quelle : ce qu'un lecteur d'écran
/// entend n'est **jamais** l'abrégé affiché (`CompactCountLabel`, « 1,2 k »).
/// L'écran manque de place, pas l'oreille — et « 1,2 k » vaut aussi bien pour
/// 1 200 que pour 1 249. `ReachMetricLabel.spokenCount` délègue désormais ici :
/// la règle ne change pas d'énoncé, seulement d'adresse.
enum LocalizedNumber {

    /// Le compte **exact**, groupé et écrit dans le système de chiffres du
    /// lecteur — « 1 234 » (fr), « 1,234 » (en), « ١٢٣٤ » (ar).
    ///
    /// `locale` est un paramètre plutôt qu'une valeur en dur pour la raison
    /// devenue idiomatique depuis 234i : sans elle, une suite jugerait la locale
    /// du SIMULATEUR — verte en local, rouge en CI.
    nonisolated static func exact(_ value: Int, locale: Locale = .current) -> String {
        IntegerFormatStyle<Int>(locale: locale).format(value)
    }

    /// Un pourcentage **entier** rendu par la locale — glyphe et espacement
    /// compris : « 50 % » (fr), « 50% » (en), chiffres arabo-indiens en arabe.
    ///
    /// L'entrée est le pourcentage lui-même (`50` pour 50 %), pas la fraction :
    /// c'est ce que portent les deux appelants (`percentInt`,
    /// `Int((progress * 100).rounded())`). La division interne existe parce que
    /// seul le style flottant applique l'échelle de pourcentage.
    nonisolated static func percent(_ value: Int, locale: Locale = .current) -> String {
        (Double(value) / 100).formatted(
            .percent.locale(locale).precision(.fractionLength(0))
        )
    }

    // MARK: - Durées

    /// L'orthographe d'horloge d'une durée. Les deux premières formes
    /// coexistaient **déjà** dans l'app, chacune juste dans son contexte : ce
    /// type les NOMME au lieu de les laisser se contredire.
    ///
    /// | forme | rendu | précédent Apple |
    /// |---|---|---|
    /// | `minuteSecond` | « 2:05 » | Dictaphone, lecteur média |
    /// | `paddedMinuteSecond` | « 02:05 » | minuterie d'appel (Téléphone) |
    /// | `hourMinuteSecond` | « 1:05:00 » | appel d'une heure et plus |
    ///
    /// Aucune ne promeut les heures d'elle-même : `minuteSecond` accumule les
    /// minutes (« 61:35 »), exactement comme les douze formateurs privés
    /// qu'elle remplace. Promouvoir serait un changement de comportement, et il
    /// appartient à l'appelant — `CallManager` est le seul à le vouloir.
    enum DurationClock {
        case minuteSecond
        case paddedMinuteSecond
        case hourMinuteSecond
    }

    /// La durée **montrée** — « 2:05 » (fr/en), « ٢:٠٥ » (ar).
    ///
    /// ## Le défaut qu'elle corrige
    ///
    /// Douze fichiers portaient leur propre copie de :
    ///
    /// ```swift
    /// private func formatDuration(_ seconds: TimeInterval) -> String {
    ///     String(format: "%d:%02d", Int(seconds) / 60, Int(seconds) % 60)
    /// }
    /// ```
    ///
    /// sous six noms différents (`formatDuration`, `formatDur`,
    /// `formatDurationMs`, `formatTime`, `formattedDuration`,
    /// `formattedCountdown`). `String(format:)` sans locale grave les
    /// **chiffres latins** : c'est le défaut que 238i, 239i et 241i ont soldé
    /// sur les compteurs, resté intact sur les durées parce qu'un `String`
    /// rendu par une fonction n'a pas la forme qu'une garde de littéral
    /// reconnaît.
    ///
    /// `Duration.TimeFormatStyle` est la réponse native — elle porte le
    /// système de chiffres, le séparateur et le remplissage à zéro.
    nonisolated static func duration(
        seconds: Int,
        clock: DurationClock = .minuteSecond,
        locale: Locale = .current
    ) -> String {
        let span = Duration.seconds(max(0, seconds))
        switch clock {
        case .minuteSecond:
            return span.formatted(.time(pattern: .minuteSecond).locale(locale))
        case .paddedMinuteSecond:
            return span.formatted(
                .time(pattern: .minuteSecond(padMinuteToLength: 2)).locale(locale)
            )
        case .hourMinuteSecond:
            return span.formatted(.time(pattern: .hourMinuteSecond).locale(locale))
        }
    }

    /// Variante seconde-flottante — même règle, pour les appelants qui tiennent
    /// une `TimeInterval` (durée d'enregistrement, position de lecture).
    ///
    /// `AVPlayer` rend `.nan` avant que l'élément soit prêt, et `.infinity`
    /// pour un flux sans durée : `MessageOverlayMenu.formatTime` portait déjà
    /// un `guard seconds.isFinite && seconds >= 0`. Le repli vit ici, une fois,
    /// borné : `Int(1e30)` **piège** à l'exécution, un `isFinite` seul ne suffit
    /// donc pas.
    nonisolated static func duration(
        seconds: TimeInterval,
        clock: DurationClock = .minuteSecond,
        locale: Locale = .current
    ) -> String {
        duration(seconds: wholeSeconds(from: seconds), clock: clock, locale: locale)
    }

    /// Secondes entières, positives et bornées — le seul pont `TimeInterval` →
    /// `Int` du domaine des durées. Exposé (plutôt que privé) parce qu'un
    /// appelant qui doit CHOISIR son horloge selon la valeur — `CallManager`
    /// promeut les heures à partir de 3600 s — a besoin du même entier que
    /// celui qui sera formaté ; le recalculer à côté rouvrirait le piège.
    nonisolated static func wholeSeconds(from seconds: TimeInterval) -> Int {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return Int(min(seconds.rounded(.towardZero), Double(Int32.max)))
    }

    /// La durée **dite** — « 2 minutes 5 secondes », jamais « 2:05 ».
    ///
    /// ## Pourquoi l'horloge ne peut pas servir les deux
    ///
    /// Onze sites passaient leur horloge telle quelle à `.accessibilityValue` :
    ///
    /// ```swift
    /// .accessibilityLabel(String(localized: "auth.magiclink.countdown.a11yLabel"))
    /// .accessibilityValue(formattedCountdown)   // « 4:32 »
    /// ```
    ///
    /// « 4:32 » est l'orthographe d'une **heure**. Le synthétiseur français le
    /// lit « 4 heures 32 » — donc « Le lien expire dans 4 heures 32 » pour un
    /// compte à rebours de **quatre minutes et demie**. Ce n'est pas une nuance
    /// de phrasé : l'annonce est fausse d'un facteur soixante.
    ///
    /// 206i/210i/211i avaient traité la MOITIÉ du défaut sur ces mêmes vues, en
    /// ajoutant le libellé qui manquait (« Durée de l'appel ») à une valeur
    /// jusque-là nue. Le libellé donne le contexte ; il ne corrige pas la forme
    /// de la valeur qu'il introduit.
    ///
    /// La doctrine existait déjà dans le dépôt —
    /// `MessageTranscriptionDetailView.spokenDuration`, privée, utilisée par un
    /// seul écran. Elle est ici, et `Duration.UnitsFormatStyle` remplace le
    /// `DateComponentsFormatter` qu'elle utilisait : ce dernier tient sa locale
    /// de son calendrier, donc une suite le jugerait sur celle du simulateur
    /// (leçon 234i).
    nonisolated static func spokenDuration(
        seconds: Int,
        locale: Locale = .current
    ) -> String {
        Duration.seconds(max(0, seconds)).formatted(
            .units(
                allowed: [.hours, .minutes, .seconds],
                width: .wide,
                zeroValueUnits: .hide
            )
            .locale(locale)
        )
    }

    nonisolated static func spokenDuration(
        seconds: TimeInterval,
        locale: Locale = .current
    ) -> String {
        spokenDuration(seconds: wholeSeconds(from: seconds), locale: locale)
    }
}
