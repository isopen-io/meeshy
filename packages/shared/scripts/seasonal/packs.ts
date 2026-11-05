/**
 * Les packs des OFFRES SAISONNIÈRES (#16270, #16271), dans leur ordre de boutique, avec leurs noms dans les
 * sept langues — ceux du pack (nom et description) et ceux de chaque objet. Gratuits, signés « Meeshy » (l'auteur
 * de tout pack intégré), proposés par la boutique dans leur fenêtre (`slugs.ts`), jamais installés d'office.
 */
import { ASSORTED_BANNER_PACKS } from '../assorted-banners/packs.js';
import type { AssortedBanner } from '../assorted-banners/draw.js';
import { CHRISTMAS_RING_PACKS } from '../christmas/packs.js';
import type { IllustratedFrame } from '../illustrated-rings/frame.js';
import type { RingStill } from '../illustrated-rings/kit.js';
import { LANGUAGES, type Language } from '../illustrated-rings/packs.js';
import * as D from './designs.js';
import type { SeasonalDesign } from './designs.js';
import { NEW_YEAR_ANIMATED_FRAMES, NEW_YEAR_STILL_FRAMES } from './frames.js';
import { NEW_YEAR_ANIMATED_RINGS, NEW_YEAR_STILL_RINGS } from './rings.js';
import { CHRISTMAS_FRAME_SLUGS } from './slugs.js';

export { LANGUAGES, type Language };

export type Named = Readonly<Record<Language, string>>;
export type PackNames = Readonly<Record<Language, { readonly name: string; readonly description: string }>>;

const n = (fr: string, en: string, es: string, pt: string, de: string, it: string, ar: string): Named => ({ fr, en, es, pt, de, it, ar });

type Base = { readonly slug: string; readonly names: PackNames; readonly themes: readonly string[] };
export type RingSource = Base & { readonly domain: 'avatar-ring'; readonly stills: readonly (RingStill & { readonly key: string; readonly names: Named })[]; readonly animated: readonly (IllustratedFrame & { readonly names: Named })[] };
export type DesignSource = Base & { readonly domain: 'wallpaper' | 'banner'; readonly items: readonly (SeasonalDesign & { readonly names: Named })[] };
export type FrameSource = Base & { readonly domain: 'banner-frame'; readonly frames: readonly (AssortedBanner & { readonly names: Named })[] };
export type SeasonalSource = RingSource | DesignSource | FrameSource;

const NY_THEMES = ['artifice', 'confettis', 'minuit', 'champagne'];
const XMAS_THEMES = ['noel-enneige', 'lumieres-de-noel', 'atelier-du-pere-noel'];

// ── Les noms des objets du Nouvel An, un jeu par thème ──────────────────

const NY_STILL_RING_NAMES: readonly Named[] = [
  n('Feux d’artifice', 'Fireworks', 'Fuegos artificiales', 'Fogo de artifício', 'Feuerwerk', 'Fuochi d’artificio', 'ألعاب نارية'),
  n('Pluie de confettis', 'Confetti shower', 'Lluvia de confeti', 'Chuva de confetes', 'Konfettiregen', 'Pioggia di coriandoli', 'مطر القصاصات'),
  n('Cadran de minuit', 'Midnight dial', 'Esfera de medianoche', 'Mostrador da meia-noite', 'Mitternachtszifferblatt', 'Quadrante di mezzanotte', 'ميناء منتصف الليل'),
  n('Coupe de champagne', 'Champagne coupe', 'Copa de champán', 'Taça de champanhe', 'Sektschale', 'Coppa di champagne', 'كأس الشمبانيا'),
];

const NY_ANIMATED_RING_NAMES: readonly Named[] = [
  n('Bouquet final', 'Grand finale', 'Gran final', 'Grande final', 'Großes Finale', 'Gran finale', 'الختام الكبير'),
  n('Envol de confettis', 'Confetti flurry', 'Vuelo de confeti', 'Voo de confetes', 'Konfettiwirbel', 'Volo di coriandoli', 'تطاير القصاصات'),
  n('Minuit sonne', 'Midnight strikes', 'Suenan las doce', 'Soa a meia-noite', 'Mitternacht schlägt', 'Scocca la mezzanotte', 'دقّت منتصف الليل'),
  n('Champagne pétillant', 'Sparkling champagne', 'Champán burbujeante', 'Champanhe espumante', 'Prickelnder Sekt', 'Champagne frizzante', 'شمبانيا فوّارة'),
];

const NY_STILL_WALLPAPER_NAMES: readonly Named[] = [
  n('Ciel d’artifice', 'Firework sky', 'Cielo de fuegos', 'Céu de artifício', 'Feuerwerkshimmel', 'Cielo di fuochi', 'سماء الألعاب النارية'),
  n('Confettis', 'Confetti', 'Confeti', 'Confetes', 'Konfetti', 'Coriandoli', 'قصاصات'),
  n('Heure de minuit', 'Midnight hour', 'Hora de medianoche', 'Hora da meia-noite', 'Mitternachtsstunde', 'Ora di mezzanotte', 'ساعة منتصف الليل'),
  n('Bulles dorées', 'Golden bubbles', 'Burbujas doradas', 'Bolhas douradas', 'Goldene Perlen', 'Bollicine dorate', 'فقاعات ذهبية'),
];

const NY_ANIMATED_WALLPAPER_NAMES: readonly Named[] = [
  n('Gerbes lointaines', 'Distant bursts', 'Destellos lejanos', 'Explosões ao longe', 'Ferne Funken', 'Scoppi lontani', 'شرارات بعيدة'),
  n('Confettis qui tombent', 'Falling confetti', 'Confeti que cae', 'Confetes a cair', 'Fallendes Konfetti', 'Coriandoli che cadono', 'قصاصات متساقطة'),
  n('Nuit étoilée de minuit', 'Starry midnight', 'Medianoche estrellada', 'Meia-noite estrelada', 'Sternenklare Mitternacht', 'Mezzanotte stellata', 'منتصف ليل مرصّع'),
  n('Bulles qui montent', 'Rising bubbles', 'Burbujas que suben', 'Bolhas a subir', 'Aufsteigende Perlen', 'Bollicine che salgono', 'فقاعات صاعدة'),
];

const NY_STILL_BANNER_NAMES: readonly Named[] = [
  n('Nuit d’artifice', 'Firework night', 'Noche de fuegos', 'Noite de artifício', 'Feuerwerksnacht', 'Notte di fuochi', 'ليلة الألعاب النارية'),
  n('Fête des confettis', 'Confetti party', 'Fiesta de confeti', 'Festa dos confetes', 'Konfettifest', 'Festa dei coriandoli', 'حفلة القصاصات'),
  n('Douze coups', 'Twelve strokes', 'Doce campanadas', 'Doze badaladas', 'Zwölf Schläge', 'Dodici rintocchi', 'اثنتا عشرة دقة'),
  n('Champagne doré', 'Golden champagne', 'Champán dorado', 'Champanhe dourado', 'Goldener Sekt', 'Champagne dorato', 'شمبانيا ذهبية'),
];

const NY_ANIMATED_BANNER_NAMES: readonly Named[] = [
  n('Feu d’artifice vivant', 'Live fireworks', 'Fuegos en vivo', 'Fogo de artifício vivo', 'Lebendiges Feuerwerk', 'Fuochi vivi', 'ألعاب نارية حيّة'),
  n('Averse de confettis', 'Confetti burst', 'Chaparrón de confeti', 'Aguaceiro de confetes', 'Konfettischauer', 'Acquazzone di coriandoli', 'وابل القصاصات'),
  n('Compte à rebours', 'Countdown', 'Cuenta atrás', 'Contagem decrescente', 'Countdown', 'Conto alla rovescia', 'العدّ التنازلي'),
  n('Bulles de champagne', 'Champagne bubbles', 'Burbujas de champán', 'Bolhas de champanhe', 'Sektperlen', 'Bollicine di champagne', 'فقاعات الشمبانيا'),
];

const withNames = <T>(items: readonly T[], names: readonly Named[]): readonly (T & { readonly names: Named })[] => items.map((item, index) => ({ ...item, names: names[index]! }));

// ── Le Nouvel An ────────────────────────────────────────────────────────

export const NEW_YEAR_SOURCES: readonly SeasonalSource[] = [
  {
    domain: 'avatar-ring',
    slug: 'nouvel-an-contours',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Nouvel An', description: 'Quatre contours pour fêter la nouvelle année : feux d’artifice, pluie de confettis, cadran de minuit et coupe de champagne doré.' },
      en: { name: 'New Year', description: 'Four rings to celebrate the new year: fireworks, a confetti shower, a midnight dial and a golden champagne coupe.' },
      es: { name: 'Año Nuevo', description: 'Cuatro contornos para celebrar el año nuevo: fuegos artificiales, lluvia de confeti, esfera de medianoche y copa de champán dorado.' },
      pt: { name: 'Ano Novo', description: 'Quatro contornos para celebrar o novo ano: fogo de artifício, chuva de confetes, mostrador da meia-noite e taça de champanhe dourado.' },
      de: { name: 'Neujahr', description: 'Vier Rahmen zum Feiern des neuen Jahres: Feuerwerk, Konfettiregen, Mitternachtszifferblatt und eine goldene Sektschale.' },
      it: { name: 'Capodanno', description: 'Quattro contorni per festeggiare il nuovo anno: fuochi d’artificio, pioggia di coriandoli, quadrante di mezzanotte e coppa di champagne dorato.' },
      ar: { name: 'رأس السنة', description: 'أربعة أطر للاحتفال بالعام الجديد: ألعاب نارية، ومطر القصاصات، وميناء منتصف الليل، وكأس شمبانيا ذهبية.' },
    },
    stills: withNames(NEW_YEAR_STILL_RINGS, NY_STILL_RING_NAMES),
    animated: [],
  },
  {
    domain: 'avatar-ring',
    slug: 'nouvel-an-contours-vifs',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Nouvel An vivant', description: 'Quatre contours animés pour le passage à la nouvelle année : un bouquet final, un envol de confettis, l’horloge qui sonne minuit et des bulles de champagne.' },
      en: { name: 'Living New Year', description: 'Four animated rings for the turn of the year: a grand finale, a confetti flurry, a clock striking midnight and champagne bubbles.' },
      es: { name: 'Año Nuevo vivo', description: 'Cuatro contornos animados para el cambio de año: un gran final, un vuelo de confeti, el reloj que da las doce y burbujas de champán.' },
      pt: { name: 'Ano Novo vivo', description: 'Quatro contornos animados para a passagem de ano: um grande final, um voo de confetes, o relógio a dar a meia-noite e bolhas de champanhe.' },
      de: { name: 'Lebendiges Neujahr', description: 'Vier animierte Rahmen für den Jahreswechsel: ein großes Finale, ein Konfettiwirbel, die Uhr, die Mitternacht schlägt, und Sektperlen.' },
      it: { name: 'Capodanno vivo', description: 'Quattro contorni animati per il passaggio al nuovo anno: un gran finale, un volo di coriandoli, l’orologio che batte la mezzanotte e bollicine di champagne.' },
      ar: { name: 'رأس السنة الحي', description: 'أربعة أطر متحركة لاستقبال العام الجديد: ختام كبير، وتطاير القصاصات، وساعة تدق منتصف الليل، وفقاعات الشمبانيا.' },
    },
    stills: [],
    animated: withNames(NEW_YEAR_ANIMATED_RINGS, NY_ANIMATED_RING_NAMES),
  },
  {
    domain: 'banner',
    slug: 'nouvel-an-images',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Bannières du Nouvel An', description: 'Quatre images de bannière pour la nouvelle année : une nuit d’artifice, une fête de confettis, les douze coups de minuit et un champagne doré.' },
      en: { name: 'New Year banners', description: 'Four banner images for the new year: a firework night, a confetti party, the twelve strokes of midnight and golden champagne.' },
      es: { name: 'Banners de Año Nuevo', description: 'Cuatro imágenes de banner para el año nuevo: una noche de fuegos, una fiesta de confeti, las doce campanadas y un champán dorado.' },
      pt: { name: 'Banners de Ano Novo', description: 'Quatro imagens de banner para o novo ano: uma noite de artifício, uma festa de confetes, as doze badaladas e um champanhe dourado.' },
      de: { name: 'Neujahrsbanner', description: 'Vier Bannerbilder für das neue Jahr: eine Feuerwerksnacht, ein Konfettifest, die zwölf Schläge um Mitternacht und goldener Sekt.' },
      it: { name: 'Banner di Capodanno', description: 'Quattro immagini di banner per il nuovo anno: una notte di fuochi, una festa di coriandoli, i dodici rintocchi e uno champagne dorato.' },
      ar: { name: 'لافتات رأس السنة', description: 'أربع صور لافتة للعام الجديد: ليلة ألعاب نارية، وحفلة قصاصات، ودقات منتصف الليل الاثنتا عشرة، وشمبانيا ذهبية.' },
    },
    items: withNames([D.BANNIERE_ARTIFICE, D.BANNIERE_CONFETTIS, D.BANNIERE_MINUIT, D.BANNIERE_CHAMPAGNE], NY_STILL_BANNER_NAMES),
  },
  {
    domain: 'banner',
    slug: 'nouvel-an-images-vives',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Bannières du Nouvel An animées', description: 'Quatre images de bannière animées : des gerbes qui éclatent, une averse de confettis, le compte à rebours de minuit et des bulles de champagne. Animations réduites : une image fixe.' },
      en: { name: 'Animated New Year banners', description: 'Four animated banner images: bursting fireworks, a confetti shower, the midnight countdown and champagne bubbles. With reduced motion: a still image.' },
      es: { name: 'Banners animados de Año Nuevo', description: 'Cuatro imágenes de banner animadas: fuegos que estallan, un chaparrón de confeti, la cuenta atrás de medianoche y burbujas de champán. Con movimiento reducido: una imagen fija.' },
      pt: { name: 'Banners animados de Ano Novo', description: 'Quatro imagens de banner animadas: fogo de artifício a rebentar, um aguaceiro de confetes, a contagem decrescente da meia-noite e bolhas de champanhe. Com movimento reduzido: uma imagem fixa.' },
      de: { name: 'Animierte Neujahrsbanner', description: 'Vier animierte Bannerbilder: aufblühendes Feuerwerk, ein Konfettischauer, der Countdown bis Mitternacht und Sektperlen. Bei reduzierter Bewegung: ein ruhiges Bild.' },
      it: { name: 'Banner animati di Capodanno', description: 'Quattro immagini di banner animate: fuochi che esplodono, un acquazzone di coriandoli, il conto alla rovescia di mezzanotte e bollicine di champagne. Con movimento ridotto: un’immagine fissa.' },
      ar: { name: 'لافتات رأس السنة المتحركة', description: 'أربع صور لافتة متحركة: ألعاب نارية تتفجر، ووابل من القصاصات، والعدّ التنازلي لمنتصف الليل، وفقاعات الشمبانيا. مع تقليل الحركة: صورة ثابتة.' },
    },
    items: withNames([D.BANNIERE_ARTIFICE_VIVE, D.BANNIERE_CONFETTIS_VIVE, D.BANNIERE_MINUIT_VIVE, D.BANNIERE_CHAMPAGNE_VIVE], NY_ANIMATED_BANNER_NAMES),
  },
  {
    domain: 'banner-frame',
    slug: 'nouvel-an-cadres',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Cadres du Nouvel An', description: 'Quatre cadres de bannière assortis aux contours du Nouvel An : feux d’artifice, confettis, cadran de minuit et coupes de champagne.' },
      en: { name: 'New Year frames', description: 'Four banner frames to match the New Year rings: fireworks, confetti, a midnight dial and champagne coupes.' },
      es: { name: 'Marcos de Año Nuevo', description: 'Cuatro marcos de banner a juego con los contornos de Año Nuevo: fuegos artificiales, confeti, esfera de medianoche y copas de champán.' },
      pt: { name: 'Molduras de Ano Novo', description: 'Quatro molduras de banner a condizer com os contornos de Ano Novo: fogo de artifício, confetes, mostrador da meia-noite e taças de champanhe.' },
      de: { name: 'Neujahrsrahmen', description: 'Vier Bannerrahmen passend zu den Neujahrsrahmen fürs Avatar: Feuerwerk, Konfetti, Mitternachtszifferblatt und Sektschalen.' },
      it: { name: 'Cornici di Capodanno', description: 'Quattro cornici di banner abbinate ai contorni di Capodanno: fuochi d’artificio, coriandoli, quadrante di mezzanotte e coppe di champagne.' },
      ar: { name: 'إطارات رأس السنة', description: 'أربعة إطارات لافتة تُناسب أطر رأس السنة: ألعاب نارية، وقصاصات، وميناء منتصف الليل، وكؤوس الشمبانيا.' },
    },
    frames: withNames(NEW_YEAR_STILL_FRAMES, NY_STILL_RING_NAMES),
  },
  {
    domain: 'banner-frame',
    slug: 'nouvel-an-cadres-vifs',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Cadres du Nouvel An animés', description: 'Quatre cadres de bannière animés, assortis aux contours vivants : un bouquet qui éclate, des confettis qui volent, l’aiguille de minuit qui tourne et des coupes qui trinquent.' },
      en: { name: 'Animated New Year frames', description: 'Four animated banner frames to match the living rings: a bursting bouquet, flying confetti, the midnight hand turning and coupes clinking.' },
      es: { name: 'Marcos animados de Año Nuevo', description: 'Cuatro marcos de banner animados, a juego con los contornos vivos: un ramillete que estalla, confeti que vuela, la aguja de medianoche que gira y copas que brindan.' },
      pt: { name: 'Molduras animadas de Ano Novo', description: 'Quatro molduras de banner animadas, a condizer com os contornos vivos: um ramo que rebenta, confetes a voar, o ponteiro da meia-noite a girar e taças a brindar.' },
      de: { name: 'Animierte Neujahrsrahmen', description: 'Vier animierte Bannerrahmen passend zu den lebendigen Rahmen: ein aufblühendes Feuerwerk, fliegendes Konfetti, der kreisende Mitternachtszeiger und anstoßende Schalen.' },
      it: { name: 'Cornici animate di Capodanno', description: 'Quattro cornici di banner animate, abbinate ai contorni vivi: un bouquet che esplode, coriandoli che volano, la lancetta di mezzanotte che gira e coppe che brindano.' },
      ar: { name: 'إطارات رأس السنة المتحركة', description: 'أربعة إطارات لافتة متحركة تُناسب الأطر الحية: باقة تتفجر، وقصاصات تتطاير، وعقرب منتصف الليل يدور، وكؤوس تتلاقى.' },
    },
    frames: withNames(NEW_YEAR_ANIMATED_FRAMES, NY_ANIMATED_RING_NAMES),
  },
  {
    domain: 'wallpaper',
    slug: 'nouvel-an-fonds',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Fonds du Nouvel An', description: 'Quatre fonds de conversation pour la nouvelle année : ciel d’artifice, confettis, heure de minuit et bulles dorées, assez discrets pour laisser lire chaque bulle.' },
      en: { name: 'New Year backgrounds', description: 'Four chat backgrounds for the new year: a firework sky, confetti, the midnight hour and golden bubbles, subtle enough to keep every bubble readable.' },
      es: { name: 'Fondos de Año Nuevo', description: 'Cuatro fondos de conversación para el año nuevo: cielo de fuegos, confeti, hora de medianoche y burbujas doradas, discretos para que cada burbuja se lea bien.' },
      pt: { name: 'Fundos de Ano Novo', description: 'Quatro fundos de conversa para o novo ano: céu de artifício, confetes, hora da meia-noite e bolhas douradas, discretos para que cada balão se leia bem.' },
      de: { name: 'Neujahrshintergründe', description: 'Vier Chat-Hintergründe für das neue Jahr: Feuerwerkshimmel, Konfetti, Mitternachtsstunde und goldene Perlen, dezent genug, damit jede Blase lesbar bleibt.' },
      it: { name: 'Sfondi di Capodanno', description: 'Quattro sfondi di conversazione per il nuovo anno: cielo di fuochi, coriandoli, ora di mezzanotte e bollicine dorate, discreti perché ogni fumetto resti leggibile.' },
      ar: { name: 'خلفيات رأس السنة', description: 'أربع خلفيات للمحادثة للعام الجديد: سماء الألعاب النارية، وقصاصات، وساعة منتصف الليل، وفقاعات ذهبية، هادئة بما يكفي لتبقى كل فقاعة مقروءة.' },
    },
    items: withNames([D.FOND_ARTIFICE, D.FOND_CONFETTIS, D.FOND_MINUIT, D.FOND_CHAMPAGNE], NY_STILL_WALLPAPER_NAMES),
  },
  {
    domain: 'wallpaper',
    slug: 'nouvel-an-fonds-vifs',
    themes: NY_THEMES,
    names: {
      fr: { name: 'Nouvel An vivant · fonds', description: 'Quatre fonds animés pour la nouvelle année : des gerbes lointaines, des confettis qui tombent, une nuit étoilée et des bulles qui montent. Animations réduites : un dégradé fixe.' },
      en: { name: 'Living New Year · backgrounds', description: 'Four animated backgrounds for the new year: distant bursts, falling confetti, a starry night and rising bubbles. With reduced motion: a still gradient.' },
      es: { name: 'Año Nuevo vivo · fondos', description: 'Cuatro fondos animados para el año nuevo: destellos lejanos, confeti que cae, una noche estrellada y burbujas que suben. Con movimiento reducido: un degradado fijo.' },
      pt: { name: 'Ano Novo vivo · fundos', description: 'Quatro fundos animados para o novo ano: explosões ao longe, confetes a cair, uma noite estrelada e bolhas a subir. Com movimento reduzido: um degradê fixo.' },
      de: { name: 'Lebendiges Neujahr · Hintergründe', description: 'Vier animierte Hintergründe für das neue Jahr: ferne Funken, fallendes Konfetti, eine Sternennacht und aufsteigende Perlen. Bei reduzierter Bewegung: ein ruhiger Verlauf.' },
      it: { name: 'Capodanno vivo · sfondi', description: 'Quattro sfondi animati per il nuovo anno: scoppi lontani, coriandoli che cadono, una notte stellata e bollicine che salgono. Con movimento ridotto: una sfumatura fissa.' },
      ar: { name: 'رأس السنة الحي · خلفيات', description: 'أربع خلفيات متحركة للعام الجديد: شرارات بعيدة، وقصاصات متساقطة، وليلة مرصعة بالنجوم، وفقاعات صاعدة. مع تقليل الحركة: تدرّج ثابت.' },
    },
    items: withNames([D.FOND_ARTIFICE_VIF, D.FOND_CONFETTIS_VIF, D.FOND_MINUIT_VIF, D.FOND_CHAMPAGNE_VIF], NY_ANIMATED_WALLPAPER_NAMES),
  },
];

// ── Noël : les images de bannière et la paire fixe ──────────────────────

const STILL_TAG: Named = n('fixe', 'still', 'fijo', 'fixo', 'ruhig', 'fisso', 'ثابت');
const tagged = (names: Named): Named => Object.fromEntries(LANGUAGES.map((language) => [language, `${names[language]} · ${STILL_TAG[language]}`])) as Named;

const christmasRings = CHRISTMAS_RING_PACKS.flatMap((pack) => pack.frames);
const christmasFrames = ASSORTED_BANNER_PACKS.filter((pack) => CHRISTMAS_FRAME_SLUGS.includes(pack.slug)).flatMap((pack) => pack.frames);
const ringNames = (key: string): Named => {
  const frame = christmasRings.find((ring) => ring.key === key);
  if (frame === undefined) throw new Error(`${key} : aucun contour de Noël de ce nom`);
  return frame.names;
};

export const CHRISTMAS_SOURCES: readonly SeasonalSource[] = [
  {
    domain: 'banner',
    slug: 'noel-bannieres',
    themes: [...XMAS_THEMES, ...XMAS_THEMES],
    names: {
      fr: { name: 'Bannières de Noël', description: 'Six images de bannière assorties aux packs de Noël : givre, guirlande et papier cadeau, puis une tempête de neige, des lumières qui scintillent et les étincelles de l’atelier.' },
      en: { name: 'Christmas banners', description: 'Six banner images to match the Christmas packs: frost, garland and gift wrap, then a snowstorm, twinkling lights and sparks from the workshop.' },
      es: { name: 'Banners de Navidad', description: 'Seis imágenes de banner a juego con los packs de Navidad: escarcha, guirnalda y papel de regalo, luego una nevada, luces que titilan y las chispas del taller.' },
      pt: { name: 'Banners de Natal', description: 'Seis imagens de banner a condizer com os packs de Natal: geada, grinalda e papel de embrulho, depois um nevão, luzes que cintilam e as faíscas da oficina.' },
      de: { name: 'Weihnachtsbanner', description: 'Sechs Bannerbilder passend zu den Weihnachtspaketen: Raureif, Girlande und Geschenkpapier, dann Schneegestöber, funkelnde Lichter und Funken aus der Werkstatt.' },
      it: { name: 'Banner di Natale', description: 'Sei immagini di banner abbinate ai pacchetti di Natale: brina, ghirlanda e carta regalo, poi una nevicata, luci che brillano e le scintille del laboratorio.' },
      ar: { name: 'لافتات الميلاد', description: 'ست صور لافتة تُناسب حزم الميلاد: الصقيع والإكليل وورق الهدايا، ثم عاصفة ثلجية وأضواء متلألئة وشرارات الورشة.' },
    },
    items: withNames(
      [D.BANNIERE_NOEL_GIVRE, D.BANNIERE_NOEL_GUIRLANDE, D.BANNIERE_NOEL_CADEAU, D.BANNIERE_NOEL_NEIGE, D.BANNIERE_NOEL_LUMIERES, D.BANNIERE_NOEL_ETINCELLES],
      [
        n('Givre', 'Frost', 'Escarcha', 'Geada', 'Raureif', 'Brina', 'الصقيع'),
        n('Guirlande', 'Garland', 'Guirnalda', 'Grinalda', 'Girlande', 'Ghirlanda', 'الإكليل'),
        n('Papier cadeau', 'Gift wrap', 'Papel de regalo', 'Papel de embrulho', 'Geschenkpapier', 'Carta regalo', 'ورق الهدايا'),
        n('Tempête de neige', 'Snowstorm', 'Nevada', 'Nevão', 'Schneegestöber', 'Nevicata', 'عاصفة ثلجية'),
        n('Lumières scintillantes', 'Twinkling lights', 'Luces que titilan', 'Luzes cintilantes', 'Funkelnde Lichter', 'Luci scintillanti', 'أضواء متلألئة'),
        n('Étincelles de Noël', 'Christmas sparks', 'Chispas de Navidad', 'Faíscas de Natal', 'Weihnachtsfunken', 'Scintille di Natale', 'شرارات الميلاد'),
      ],
    ),
  },
  {
    domain: 'avatar-ring',
    slug: 'noel-contours-fixes',
    themes: XMAS_THEMES.flatMap((theme) => [theme, theme]),
    names: {
      fr: { name: 'Noël · contours fixes', description: 'Les six contours de Noël sans animation : flocons, houx, guirlande, étoile, bonnet et sucre d’orge, pour qui préfère un avatar immobile.' },
      en: { name: 'Christmas · still rings', description: 'The six Christmas rings without animation: snowflakes, holly, string lights, star, Santa hat and candy cane, for a calm avatar.' },
      es: { name: 'Navidad · contornos fijos', description: 'Los seis contornos de Navidad sin animación: copos, acebo, guirnalda, estrella, gorro y bastón de caramelo, para un avatar tranquilo.' },
      pt: { name: 'Natal · contornos fixos', description: 'Os seis contornos de Natal sem animação: flocos, azevinho, grinalda, estrela, gorro e bastão de doce, para um avatar tranquilo.' },
      de: { name: 'Weihnachten · ruhige Rahmen', description: 'Die sechs Weihnachtsrahmen ohne Animation: Flocken, Stechpalme, Lichterkette, Stern, Mütze und Zuckerstange, für einen ruhigen Avatar.' },
      it: { name: 'Natale · contorni fissi', description: 'I sei contorni di Natale senza animazione: fiocchi, agrifoglio, ghirlanda, stella, berretto e bastoncino di zucchero, per un avatar tranquillo.' },
      ar: { name: 'الميلاد · أطر ثابتة', description: 'أطر الميلاد الستة بلا حركة: ندف الثلج، والبهشية، وسلسلة الأضواء، والنجمة، والقبعة، وعصا الحلوى، لصورة رمزية هادئة.' },
    },
    stills: christmasRings.map((frame) => ({ key: `${frame.key}-fixe`, ...frame.still, names: tagged(frame.names) })),
    animated: [],
  },
  {
    domain: 'banner-frame',
    slug: 'noel-cadres-fixes',
    themes: XMAS_THEMES.flatMap((theme) => [theme, theme]),
    names: {
      fr: { name: 'Noël · cadres fixes', description: 'Les six cadres de bannière de Noël sans animation, assortis aux contours fixes : flocons, houx, guirlande, étoile, bonnet et sucre d’orge.' },
      en: { name: 'Christmas · still frames', description: 'The six Christmas banner frames without animation, to match the still rings: snowflakes, holly, string lights, star, Santa hat and candy cane.' },
      es: { name: 'Navidad · marcos fijos', description: 'Los seis marcos de banner de Navidad sin animación, a juego con los contornos fijos: copos, acebo, guirnalda, estrella, gorro y bastón de caramelo.' },
      pt: { name: 'Natal · molduras fixas', description: 'As seis molduras de banner de Natal sem animação, a condizer com os contornos fixos: flocos, azevinho, grinalda, estrela, gorro e bastão de doce.' },
      de: { name: 'Weihnachten · ruhige Bannerrahmen', description: 'Die sechs Weihnachts-Bannerrahmen ohne Animation, passend zu den ruhigen Rahmen: Flocken, Stechpalme, Lichterkette, Stern, Mütze und Zuckerstange.' },
      it: { name: 'Natale · cornici fisse', description: 'Le sei cornici di banner di Natale senza animazione, abbinate ai contorni fissi: fiocchi, agrifoglio, ghirlanda, stella, berretto e bastoncino di zucchero.' },
      ar: { name: 'الميلاد · إطارات لافتة ثابتة', description: 'إطارات لافتة الميلاد الستة بلا حركة، تُناسب الأطر الثابتة: ندف الثلج، والبهشية، وسلسلة الأضواء، والنجمة، والقبعة، وعصا الحلوى.' },
    },
    frames: christmasFrames.map(({ motion: _motion, ...frame }) => ({ ...frame, key: `${frame.key}-fixe`, names: tagged(ringNames(frame.key)) })),
  },
];
