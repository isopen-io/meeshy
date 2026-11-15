package me.meeshy.sdk.model.voice

import me.meeshy.sdk.model.composer.sound.SoundLanguageChoices

/**
 * Textes lus à voix haute pour construire un profil vocal — miroir de `VoiceProfilePrompts` (iOS,
 * `packages/MeeshySDK/.../Models/VoiceProfilePrompts.swift`).
 *
 * Cinq séries de deux à trois phrases par langue, chacune visant un contour prosodique différent :
 * déclaratif, interrogatif, exclamatif, énumératif, chiffré. Une phrase unique n'apprend au modèle
 * qu'une voix plate, et se lit en moins de dix secondes. Les textes sont écrits à la main, jamais
 * traduits automatiquement. La langue est celle qu'on PARLE, pas celle de l'interface.
 */
object VoiceProfilePrompts {

    /** [languageCode] est la langue RÉSOLUE, [isRightToLeft] le sens de lecture du texte (pas de l'interface). */
    data class Prompt(val text: String, val languageCode: String, val isRightToLeft: Boolean)

    const val FALLBACK_LANGUAGE: String = "en"

    private val rightToLeftLanguages: Set<String> = setOf("ar", "he", "fa", "ur")

    /** Les langues proposées, dans l'ordre d'iOS (`LanguageData.interfaceLanguageCodes`). */
    val supportedLanguageCodes: List<String> = listOf("en", "es", "fr", "pt", "de", "it", "ar")

    /** Série complète pour une langue, repli anglais compris. */
    fun prompts(language: String?): List<Prompt> {
        val code = resolve(language)
        val isRightToLeft = code in rightToLeftLanguages
        return catalogue.getValue(code).map { Prompt(it, code, isRightToLeft) }
    }

    /** Texte du n-ième échantillon : [rotation] décale le départ, l'index boucle (jamais négatif). */
    fun prompt(language: String?, index: Int, rotation: Int = 0): Prompt? {
        val series = prompts(language)
        if (series.isEmpty()) return null
        return series[Math.floorMod(index + rotation, series.size)]
    }

    /** La langue réellement lue pour [language] : celle du catalogue, sinon l'anglais. */
    fun resolve(language: String?): String =
        SoundLanguageChoices.normalized(language)?.takeIf { it in catalogue } ?: FALLBACK_LANGUAGE

    private val catalogue: Map<String, List<String>> = mapOf(
        "fr" to listOf(
            "Bonjour ! Voici ma voix, telle qu'elle sonne au quotidien. Je lis ce texte tranquillement, comme si je parlais à quelqu'un que je connais bien.",
            "Est-ce que tu m'entends correctement ? Le son est clair de ton côté ? Si c'est bon, on continue : j'ai encore pas mal de choses à te raconter.",
            "Franchement, c'est incroyable ! Je n'aurais jamais imaginé qu'on puisse se comprendre aussi facilement d'un bout à l'autre du monde. Quelle époque !",
            "Il me faudrait trois choses pour bien démarrer : un café serré, un peu de calme autour de moi, et une connexion qui tienne la route. Après ça, je suis prêt.",
            "On se retrouve jeudi à dix-huit heures trente, juste devant la gare. N'oublie surtout pas ton billet : la dernière fois, on a failli rater le train.",
        ),
        "en" to listOf(
            "Hello there! This is my voice, just the way it sounds day to day. I'm reading this calmly, as if I were talking to someone I know well.",
            "Can you hear me clearly? Is the sound coming through on your end? If it is, let's keep going: I still have quite a lot to tell you.",
            "Honestly, this is incredible! I never imagined we could understand each other so easily from opposite sides of the world. What a time to be alive!",
            "I need three things to get started properly: a strong coffee, a bit of quiet around me, and a connection that actually holds. After that, I'm ready.",
            "Let's meet on Thursday at half past six, right in front of the station. Whatever you do, don't forget your ticket: last time we almost missed the train.",
        ),
        "es" to listOf(
            "¡Hola! Esta es mi voz, tal y como suena en el día a día. Estoy leyendo esto con calma, como si hablara con alguien de confianza.",
            "¿Me oyes bien? ¿Se escucha claro por tu lado? Si es así, seguimos adelante: todavía tengo bastantes cosas que contarte.",
            "¡La verdad es que es increíble! Nunca imaginé que pudiéramos entendernos tan fácilmente desde extremos opuestos del mundo. ¡Qué maravilla!",
            "Necesito tres cosas para empezar bien: un café cargado, un poco de silencio a mi alrededor y una conexión que aguante. Después de eso, ya estoy listo.",
            "Nos vemos el jueves a las seis y media, justo delante de la estación. Y sobre todo no olvides el billete: la última vez casi perdimos el tren.",
        ),
        "pt" to listOf(
            "Olá! Esta é a minha voz, do jeito que ela soa no dia a dia. Estou lendo isto com calma, como se estivesse conversando com alguém que conheço bem.",
            "Você está me ouvindo bem? O som está chegando claro aí do seu lado? Se estiver, vamos continuar: ainda tenho bastante coisa para te contar.",
            "Sinceramente, isso é incrível! Eu nunca imaginei que a gente pudesse se entender tão facilmente de um lado ao outro do mundo. Que época!",
            "Preciso de três coisas para começar direito: um café forte, um pouco de silêncio ao meu redor e uma conexão que aguente. Depois disso, estou pronto.",
            "A gente se encontra na quinta-feira, às seis e meia, bem na frente da estação. E não esqueça a passagem: da última vez quase perdemos o trem.",
        ),
        "de" to listOf(
            "Hallo! Das ist meine Stimme, so wie sie im Alltag klingt. Ich lese das hier ganz ruhig vor, als würde ich mit jemandem sprechen, den ich gut kenne.",
            "Hörst du mich gut? Kommt der Ton bei dir klar an? Wenn ja, machen wir weiter: ich habe dir noch einiges zu erzählen.",
            "Ehrlich gesagt, das ist unglaublich! Ich hätte nie gedacht, dass wir uns von zwei Enden der Welt so leicht verstehen können. Was für eine Zeit!",
            "Ich brauche drei Dinge, um richtig anzufangen: einen starken Kaffee, ein bisschen Ruhe um mich herum und eine Verbindung, die auch hält. Danach bin ich bereit.",
            "Wir treffen uns am Donnerstag um halb sieben, direkt vor dem Bahnhof. Und vergiss bloß deine Fahrkarte nicht: letztes Mal hätten wir den Zug fast verpasst.",
        ),
        "it" to listOf(
            "Ciao! Questa è la mia voce, così come suona tutti i giorni. Sto leggendo con calma, come se stessi parlando con una persona che conosco bene.",
            "Mi senti bene? Il suono arriva chiaro dalla tua parte? Se è così, andiamo avanti: ho ancora parecchie cose da raccontarti.",
            "Sinceramente, è incredibile! Non avrei mai immaginato che potessimo capirci così facilmente da due parti opposte del mondo. Che epoca!",
            "Mi servono tre cose per partire bene: un caffè forte, un po' di silenzio intorno a me e una connessione che regga davvero. Dopo di che, sono pronto.",
            "Ci vediamo giovedì alle sei e mezza, proprio davanti alla stazione. E soprattutto non dimenticare il biglietto: l'ultima volta abbiamo quasi perso il treno.",
        ),
        "ar" to listOf(
            "مرحبًا! هذا هو صوتي كما يبدو في حياتي اليومية. أقرأ هذا النص بهدوء، كأنني أتحدث إلى شخص أعرفه جيدًا منذ زمن.",
            "هل تسمعني جيدًا؟ هل يصل الصوت واضحًا من جهتك؟ إذا كان كذلك، فلنكمل: ما زال لدي الكثير مما أريد أن أرويه لك.",
            "بصراحة، هذا شيء لا يُصدَّق! لم أتخيل يومًا أن نفهم بعضنا بهذه السهولة من طرفَي العالم. يا له من زمن نعيش فيه!",
            "أحتاج إلى ثلاثة أشياء كي أبدأ يومي كما ينبغي: فنجان قهوة قوي، وقليل من الهدوء من حولي، واتصال ثابت لا ينقطع. بعد ذلك أكون جاهزًا.",
            "نلتقي يوم الخميس في السادسة والنصف، أمام المحطة تمامًا. ولا تنسَ التذكرة أبدًا: في المرة الماضية كدنا نفوت القطار.",
        ),
    )
}
