/**
 * Textes lus à voix haute pour construire un profil vocal.
 *
 * ## Pourquoi plusieurs textes, et pas un
 *
 * Un profil vocal sert à re-synthétiser la voix de quelqu'un : il lui faut la
 * PROSODIE, pas seulement le timbre. Les textes historiques
 * (`READING_TEXTS`) sont tous purement déclaratifs — aucune question, aucune
 * exclamation. Le modèle apprend alors une voix plate, et toute traduction
 * vocale sonne comme une annonce de gare.
 *
 * ## Ce que chaque série couvre
 *
 * Les cinq textes d'une langue ne sont pas interchangeables : chacun vise un
 * contour différent.
 *
 * 1. **Présentation posée** — débit neutre, contour descendant.
 * 2. **Question puis réponse** — contour montant, le grand absent d'avant.
 * 3. **Enthousiasme** — amplitude et registre haut.
 * 4. **Énumération** — pauses internes, rythme scandé.
 * 5. **Rendez-vous chiffré** — nombres et emphase, articulation différente.
 *
 * ## Portée
 *
 * Une série par langue d'INTERFACE de l'application. Les autres langues de
 * `READING_TEXTS` (swahili, amharique, haoussa, yoruba, zoulou, lingala, russe,
 * chinois, japonais, coréen, néerlandais) gardent leur texte unique : mieux vaut
 * un texte juste que cinq écrits sans pouvoir en vérifier le naturel.
 *
 * Miroir Swift, mêmes textes :
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/VoiceProfilePrompts.swift`.
 * Les deux plateformes doivent faire lire la MÊME chose — un profil enregistré
 * sur l'une doit être comparable à un profil enregistré sur l'autre.
 */

/** Langues d'interface de l'application, miroir de `LanguageData.interfaceLanguageCodes`. */
export const PROMPT_LANGUAGES = ['en', 'es', 'fr', 'pt', 'de', 'it', 'ar'] as const;

export type PromptLanguage = (typeof PROMPT_LANGUAGES)[number];

/** Langues dont le texte se lit de droite à gauche. */
const RIGHT_TO_LEFT = new Set(['ar', 'he', 'fa', 'ur']);

export const VOICE_PROFILE_PROMPTS: Record<PromptLanguage, readonly string[]> = {
  fr: [
    "Bonjour ! Voici ma voix, telle qu'elle sonne au quotidien. Je lis ce texte tranquillement, comme si je parlais à quelqu'un que je connais bien.",
    "Est-ce que tu m'entends correctement ? Le son est clair de ton côté ? Si c'est bon, on continue : j'ai encore pas mal de choses à te raconter.",
    "Franchement, c'est incroyable ! Je n'aurais jamais imaginé qu'on puisse se comprendre aussi facilement d'un bout à l'autre du monde. Quelle époque !",
    "Il me faudrait trois choses pour bien démarrer : un café serré, un peu de calme autour de moi, et une connexion qui tienne la route. Après ça, je suis prêt.",
    "On se retrouve jeudi à dix-huit heures trente, juste devant la gare. N'oublie surtout pas ton billet : la dernière fois, on a failli rater le train.",
  ],
  en: [
    "Hello there! This is my voice, just the way it sounds day to day. I'm reading this calmly, as if I were talking to someone I know well.",
    "Can you hear me clearly? Is the sound coming through on your end? If it is, let's keep going: I still have quite a lot to tell you.",
    "Honestly, this is incredible! I never imagined we could understand each other so easily from opposite sides of the world. What a time to be alive!",
    "I need three things to get started properly: a strong coffee, a bit of quiet around me, and a connection that actually holds. After that, I'm ready.",
    "Let's meet on Thursday at half past six, right in front of the station. Whatever you do, don't forget your ticket: last time we almost missed the train.",
  ],
  es: [
    "¡Hola! Esta es mi voz, tal y como suena en el día a día. Estoy leyendo esto con calma, como si hablara con alguien de confianza.",
    "¿Me oyes bien? ¿Se escucha claro por tu lado? Si es así, seguimos adelante: todavía tengo bastantes cosas que contarte.",
    "¡La verdad es que es increíble! Nunca imaginé que pudiéramos entendernos tan fácilmente desde extremos opuestos del mundo. ¡Qué maravilla!",
    "Necesito tres cosas para empezar bien: un café cargado, un poco de silencio a mi alrededor y una conexión que aguante. Después de eso, ya estoy listo.",
    "Nos vemos el jueves a las seis y media, justo delante de la estación. Y sobre todo no olvides el billete: la última vez casi perdimos el tren.",
  ],
  pt: [
    "Olá! Esta é a minha voz, do jeito que ela soa no dia a dia. Estou lendo isto com calma, como se estivesse conversando com alguém que conheço bem.",
    "Você está me ouvindo bem? O som está chegando claro aí do seu lado? Se estiver, vamos continuar: ainda tenho bastante coisa para te contar.",
    "Sinceramente, isso é incrível! Eu nunca imaginei que a gente pudesse se entender tão facilmente de um lado ao outro do mundo. Que época!",
    "Preciso de três coisas para começar direito: um café forte, um pouco de silêncio ao meu redor e uma conexão que aguente. Depois disso, estou pronto.",
    "A gente se encontra na quinta-feira, às seis e meia, bem na frente da estação. E não esqueça a passagem: da última vez quase perdemos o trem.",
  ],
  de: [
    "Hallo! Das ist meine Stimme, so wie sie im Alltag klingt. Ich lese das hier ganz ruhig vor, als würde ich mit jemandem sprechen, den ich gut kenne.",
    "Hörst du mich gut? Kommt der Ton bei dir klar an? Wenn ja, machen wir weiter: ich habe dir noch einiges zu erzählen.",
    "Ehrlich gesagt, das ist unglaublich! Ich hätte nie gedacht, dass wir uns von zwei Enden der Welt so leicht verstehen können. Was für eine Zeit!",
    "Ich brauche drei Dinge, um richtig anzufangen: einen starken Kaffee, ein bisschen Ruhe um mich herum und eine Verbindung, die auch hält. Danach bin ich bereit.",
    "Wir treffen uns am Donnerstag um halb sieben, direkt vor dem Bahnhof. Und vergiss bloß deine Fahrkarte nicht: letztes Mal hätten wir den Zug fast verpasst.",
  ],
  it: [
    "Ciao! Questa è la mia voce, così come suona tutti i giorni. Sto leggendo con calma, come se stessi parlando con una persona che conosco bene.",
    "Mi senti bene? Il suono arriva chiaro dalla tua parte? Se è così, andiamo avanti: ho ancora parecchie cose da raccontarti.",
    "Sinceramente, è incredibile! Non avrei mai immaginato che potessimo capirci così facilmente da due parti opposte del mondo. Che epoca!",
    "Mi servono tre cose per partire bene: un caffè forte, un po' di silenzio intorno a me e una connessione che regga davvero. Dopo di che, sono pronto.",
    "Ci vediamo giovedì alle sei e mezza, proprio davanti alla stazione. E soprattutto non dimenticare il biglietto: l'ultima volta abbiamo quasi perso il treno.",
  ],
  ar: [
    "مرحبًا! هذا هو صوتي كما يبدو في حياتي اليومية. أقرأ هذا النص بهدوء، كأنني أتحدث إلى شخص أعرفه جيدًا منذ زمن.",
    "هل تسمعني جيدًا؟ هل يصل الصوت واضحًا من جهتك؟ إذا كان كذلك، فلنكمل: ما زال لدي الكثير مما أريد أن أرويه لك.",
    "بصراحة، هذا شيء لا يُصدَّق! لم أتخيل يومًا أن نفهم بعضنا بهذه السهولة من طرفَي العالم. يا له من زمن نعيش فيه!",
    "أحتاج إلى ثلاثة أشياء كي أبدأ يومي كما ينبغي: فنجان قهوة قوي، وقليل من الهدوء من حولي، واتصال ثابت لا ينقطع. بعد ذلك أكون جاهزًا.",
    "نلتقي يوم الخميس في السادسة والنصف، أمام المحطة تمامًا. ولا تنسَ التذكرة أبدًا: في المرة الماضية كدنا نفوت القطار.",
  ],
};

export type VoicePrompt = {
  readonly text: string;
  /** Langue RÉSOLUE, pas celle demandée. */
  readonly language: string;
  readonly isRightToLeft: boolean;
};

function normalize(language: string | null | undefined): string | null {
  if (typeof language !== 'string') return null;
  const primary = language.trim().split(/[-_]/)[0]?.toLowerCase();
  return primary && primary.length >= 2 ? primary : null;
}

function isPromptLanguage(code: string | null): code is PromptLanguage {
  return code !== null && (PROMPT_LANGUAGES as readonly string[]).includes(code);
}

/**
 * Série complète pour une langue. Vide quand la langue n'a pas de série
 * multi-texte — l'appelant retombe alors sur `READING_TEXTS`, qui couvre bien
 * plus de langues avec un texte unique.
 */
export function voicePromptsFor(language: string | null | undefined): VoicePrompt[] {
  const code = normalize(language);
  if (!isPromptLanguage(code)) return [];
  const isRightToLeft = RIGHT_TO_LEFT.has(code);
  return VOICE_PROFILE_PROMPTS[code].map(text => ({ text, language: code, isRightToLeft }));
}

/**
 * Texte à lire pour le n-ième enregistrement.
 *
 * `rotation` décale le point de départ : relu d'une session à l'autre, un texte
 * est récité de mémoire — donc à plat, sans l'intonation qu'on cherche. L'aléa
 * reste au choix de l'appelant ; cette fonction est déterministe et testable.
 *
 * L'index boucle plutôt que de buter sur le dernier texte.
 */
export function voicePromptAt(
  language: string | null | undefined,
  index: number,
  rotation = 0
): VoicePrompt | null {
  const series = voicePromptsFor(language);
  if (series.length === 0) return null;
  const position = (((index + rotation) % series.length) + series.length) % series.length;
  return series[position];
}
