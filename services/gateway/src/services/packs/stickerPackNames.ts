import { BUILTIN_STICKER_PACKS } from '@meeshy/shared/types/sticker-pack';

/**
 * Les noms et descriptions des packs de stickers INTÉGRÉS dans les sept langues
 * (#10738). Le domaine `sticker` ne sert que `name` / `description` à plat, en
 * français : la vitrine unique y ajoute ces `names`, comme les autres domaines,
 * pour que la description suive la langue de l'interface. Ajout au fil de la
 * vitrine seule — les réponses de `/sticker-packs` restent figées.
 */
type Text = { readonly name: string; readonly description: string };
type Names = Readonly<Record<'fr' | 'en' | 'es' | 'pt' | 'de' | 'it' | 'ar', Text>>;

const DESCRIPTIONS: Readonly<Record<string, Readonly<Record<keyof Names, string>>>> = {
  mee: {
    fr: 'Le colibri de Meeshy : ses humeurs, ses gestes et ses Instants qui écrivent ton message.',
    en: "Meeshy's hummingbird: its moods, gestures and Moments that write your message.",
    es: 'El colibrí de Meeshy: sus estados de ánimo, gestos e Instantes que escriben tu mensaje.',
    pt: 'O beija-flor do Meeshy: seus humores, gestos e Instantes que escrevem a sua mensagem.',
    de: 'Der Kolibri von Meeshy: seine Launen, Gesten und Momente, die deine Nachricht schreiben.',
    it: 'Il colibrì di Meeshy: i suoi stati d’animo, i gesti e gli Istanti che scrivono il tuo messaggio.',
    ar: 'طائر الطنان في Meeshy: مزاجاته وإيماءاته ولحظاته التي تكتب رسالتك.',
  },
  meo: {
    fr: 'Le complice de Mee, crête au vent : les mêmes envies de dire, avec son caractère.',
    en: "Mee's partner in crime, crest in the wind: the same urge to say it, with his own character.",
    es: 'El cómplice de Mee, con la cresta al viento: las mismas ganas de decir, con su carácter.',
    pt: 'O cúmplice de Mee, de crista ao vento: a mesma vontade de dizer, com o seu caráter.',
    de: 'Mees Komplize, Kamm im Wind: dieselbe Lust, etwas zu sagen, mit eigenem Charakter.',
    it: 'Il complice di Mee, cresta al vento: la stessa voglia di dire, col suo carattere.',
    ar: 'رفيق Mee بعرفه المتطاير مع الريح: الرغبة نفسها في التعبير، بطابعه الخاص.',
  },
  'mee-et-meo': {
    fr: 'Les deux ensemble : câlins, chamailleries et fêtes à deux.',
    en: 'Both together: cuddles, squabbles and parties for two.',
    es: 'Los dos juntos: abrazos, peleítas y fiestas a dos.',
    pt: 'Os dois juntos: carinhos, brigas e festas a dois.',
    de: 'Beide zusammen: Kuscheln, Zankereien und Feste zu zweit.',
    it: 'Tutti e due insieme: coccole, battibecchi e feste in due.',
    ar: 'الاثنان معًا: عناق ومشاكسات واحتفالات لشخصين.',
  },
};

export function builtinStickerPackNames(slug: string): Names | null {
  const pack = BUILTIN_STICKER_PACKS.find((candidate) => candidate.slug === slug);
  const descriptions = DESCRIPTIONS[slug];
  if (pack === undefined || descriptions === undefined) return null;
  return Object.fromEntries(Object.entries(descriptions).map(([language, description]) => [language, { name: pack.name, description }])) as unknown as Names;
}
