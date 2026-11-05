/**
 * Les COLLECTIONS MEESHY de la boutique (#15158), dans leur ordre, avec leurs noms dans les sept langues —
 * ceux du pack (nom et description) et ceux de chaque élément. Ni installées d'office ni payantes : la
 * boutique les propose, signées « Meeshy » (l'auteur de tout pack intégré), et on les ajoute d'un geste.
 */
import { LANGUAGES, type Language } from '../illustrated-rings/packs.js';
import { SIGNATURE_FRAMES, VIVANT_FRAMES, type BannerFrame } from './banner-frames.js';
import { SIGNATURE_RINGS, type StillRing } from './rings-signature.js';
import { VIVANT_RINGS, type VivantRing } from './rings-vivants.js';
import { SIGNATURE_WALLPAPERS, VIVANT_WALLPAPERS, type AnimatedWallpaper, type WallpaperDesign } from './wallpapers.js';

export { LANGUAGES, type Language };

type Named = Readonly<Record<Language, string>>;
type PackNames = Readonly<Record<Language, { readonly name: string; readonly description: string }>>;

export type Collection<Item> = {
  readonly slug: string;
  readonly names: PackNames;
  readonly items: readonly (Item & { readonly names: Named })[];
};

const named = <Item extends { readonly key: string }>(items: readonly Item[], table: Readonly<Record<string, Named>>): readonly (Item & { readonly names: Named })[] =>
  items.map((item) => {
    const names = table[item.key];
    if (names === undefined) throw new Error(`${item.key} : aucun nom`);
    return { ...item, names };
  });

const n = (fr: string, en: string, es: string, pt: string, de: string, it: string, ar: string): Named => ({ fr, en, es, pt, de, it, ar });

// ── Contours d'avatar ───────────────────────────────────────────────────

export const RINGS_SIGNATURE: Collection<StillRing> = {
  slug: 'meeshy-signature',
  names: {
    fr: { name: 'Signature Meeshy', description: 'Six contours par Meeshy, sobres et lisibles à toute taille : fil d’or, perles de nacre, éclipse, rosace, nuit étoilée et facettes.' },
    en: { name: 'Meeshy Signature', description: 'Six rings by Meeshy, understated and legible at any size: gold thread, mother-of-pearl beads, eclipse, rosette, starry night and facets.' },
    es: { name: 'Firma Meeshy', description: 'Seis contornos de Meeshy, sobrios y legibles a cualquier tamaño: hilo de oro, perlas de nácar, eclipse, rosetón, noche estrellada y facetas.' },
    pt: { name: 'Assinatura Meeshy', description: 'Seis contornos da Meeshy, sóbrios e legíveis em qualquer tamanho: fio de ouro, pérolas de nácar, eclipse, rosácea, noite estrelada e facetas.' },
    de: { name: 'Meeshy Signatur', description: 'Sechs Rahmen von Meeshy, schlicht und in jeder Größe lesbar: Goldfaden, Perlmuttperlen, Finsternis, Rosette, Sternennacht und Facetten.' },
    it: { name: 'Firma Meeshy', description: 'Sei contorni di Meeshy, sobri e leggibili a ogni dimensione: filo d’oro, perle di madreperla, eclissi, rosone, notte stellata e sfaccettature.' },
    ar: { name: 'توقيع Meeshy', description: 'ستة أطر من Meeshy، رصينة وواضحة بأي حجم: خيط ذهبي، ولآلئ صدفية، وكسوف، ووردة، وليلة مرصّعة بالنجوم، وأوجه مصقولة.' },
  },
  items: named(SIGNATURE_RINGS, {
    'fil-d-or': n('Fil d’or', 'Gold thread', 'Hilo de oro', 'Fio de ouro', 'Goldfaden', 'Filo d’oro', 'خيط ذهبي'),
    'perles-de-nacre': n('Perles de nacre', 'Mother-of-pearl', 'Perlas de nácar', 'Pérolas de nácar', 'Perlmuttperlen', 'Perle di madreperla', 'لآلئ صدفية'),
    eclipse: n('Éclipse', 'Eclipse', 'Eclipse', 'Eclipse', 'Finsternis', 'Eclissi', 'كسوف'),
    rosace: n('Rosace', 'Rosette', 'Rosetón', 'Rosácea', 'Rosette', 'Rosone', 'وردة'),
    'nuit-etoilee': n('Nuit étoilée', 'Starry night', 'Noche estrellada', 'Noite estrelada', 'Sternennacht', 'Notte stellata', 'ليلة مرصّعة'),
    facettes: n('Facettes', 'Facets', 'Facetas', 'Facetas', 'Facetten', 'Sfaccettature', 'أوجه مصقولة'),
  }),
};

export const RINGS_VIVANTS: Collection<VivantRing> = {
  slug: 'meeshy-vivants',
  names: {
    fr: { name: 'Vivants par Meeshy', description: 'Six contours animés par Meeshy, qui débordent à peine de l’avatar : une orbite, un halo d’aurore, une pulsation, des étincelles, une comète et une houle.' },
    en: { name: 'Alive by Meeshy', description: 'Six animated rings by Meeshy that barely spill past your avatar: an orbit, an aurora halo, a pulse, sparkles, a comet and a swell.' },
    es: { name: 'Vivos de Meeshy', description: 'Seis contornos animados de Meeshy que apenas desbordan tu avatar: una órbita, un halo de aurora, un pulso, destellos, un cometa y un oleaje.' },
    pt: { name: 'Vivos da Meeshy', description: 'Seis contornos animados da Meeshy que mal transbordam do teu avatar: uma órbita, um halo de aurora, uma pulsação, faíscas, um cometa e uma ondulação.' },
    de: { name: 'Lebendig von Meeshy', description: 'Sechs animierte Rahmen von Meeshy, die kaum über deinen Avatar hinausragen: eine Umlaufbahn, ein Polarlicht-Halo, ein Puls, Funken, ein Komet und eine Dünung.' },
    it: { name: 'Vivi di Meeshy', description: 'Sei contorni animati di Meeshy che escono appena dal tuo avatar: un’orbita, un alone d’aurora, una pulsazione, scintille, una cometa e un’onda lunga.' },
    ar: { name: 'نابضة من Meeshy', description: 'ستة أطر متحركة من Meeshy تتجاوز صورتك الرمزية بالكاد: مدار، وهالة شفق، ونبض، وشرارات، ومذنّب، وموج.' },
  },
  items: named(VIVANT_RINGS, {
    orbite: n('Orbite', 'Orbit', 'Órbita', 'Órbita', 'Umlaufbahn', 'Orbita', 'مدار'),
    'halo-aurore': n('Halo d’aurore', 'Aurora halo', 'Halo de aurora', 'Halo de aurora', 'Polarlicht-Halo', 'Alone d’aurora', 'هالة الشفق'),
    pulsation: n('Pulsation', 'Pulse', 'Pulso', 'Pulsação', 'Puls', 'Pulsazione', 'نبض'),
    scintillement: n('Scintillement', 'Twinkle', 'Destello', 'Cintilação', 'Funkeln', 'Scintillio', 'تلألؤ'),
    comete: n('Comète', 'Comet', 'Cometa', 'Cometa', 'Komet', 'Cometa', 'مذنّب'),
    houle: n('Houle', 'Swell', 'Oleaje', 'Ondulação', 'Dünung', 'Onda lunga', 'موج'),
  }),
};

// ── Fonds de conversation ───────────────────────────────────────────────

export const WALLPAPERS_SIGNATURE: Collection<WallpaperDesign> = {
  slug: 'meeshy-fonds',
  names: {
    fr: { name: 'Fonds signature', description: 'Six fonds par Meeshy, discrets sous les bulles, en clair comme en sombre : soie, pointillé, vagues fines, cannage, terrazzo et crépuscule.' },
    en: { name: 'Signature wallpapers', description: 'Six wallpapers by Meeshy that stay quiet under your bubbles, light or dark: silk, dots, fine waves, cane weave, terrazzo and dusk.' },
    es: { name: 'Fondos de firma', description: 'Seis fondos de Meeshy, discretos bajo las burbujas, en claro y en oscuro: seda, punteado, olas finas, rejilla, terrazo y crepúsculo.' },
    pt: { name: 'Fundos assinatura', description: 'Seis fundos da Meeshy, discretos sob os balões, no claro e no escuro: seda, pontilhado, ondas finas, palhinha, terrazzo e crepúsculo.' },
    de: { name: 'Signatur-Hintergründe', description: 'Sechs Hintergründe von Meeshy, zurückhaltend unter den Blasen, hell wie dunkel: Seide, Punkte, feine Wellen, Wiener Geflecht, Terrazzo und Dämmerung.' },
    it: { name: 'Sfondi firma', description: 'Sei sfondi di Meeshy, discreti sotto le bolle, in chiaro e in scuro: seta, puntinato, onde sottili, paglia di Vienna, terrazzo e crepuscolo.' },
    ar: { name: 'خلفيات مميّزة', description: 'ست خلفيات من Meeshy، هادئة تحت الفقاعات في الوضعين الفاتح والداكن: حرير، ونقاط، وأمواج رقيقة، وخيزران، وتيرازو، وغسق.' },
  },
  items: named(SIGNATURE_WALLPAPERS, {
    soie: n('Soie', 'Silk', 'Seda', 'Seda', 'Seide', 'Seta', 'حرير'),
    pointille: n('Pointillé', 'Dots', 'Punteado', 'Pontilhado', 'Punkte', 'Puntinato', 'نقاط'),
    'vagues-fines': n('Vagues fines', 'Fine waves', 'Olas finas', 'Ondas finas', 'Feine Wellen', 'Onde sottili', 'أمواج رقيقة'),
    cannage: n('Cannage', 'Cane weave', 'Rejilla', 'Palhinha', 'Wiener Geflecht', 'Paglia di Vienna', 'خيزران'),
    terrazzo: n('Terrazzo', 'Terrazzo', 'Terrazo', 'Terrazzo', 'Terrazzo', 'Terrazzo', 'تيرازو'),
    crepuscule: n('Crépuscule', 'Dusk', 'Crepúsculo', 'Crepúsculo', 'Dämmerung', 'Crepuscolo', 'غسق'),
  }),
};

export const WALLPAPERS_VIVANTS: Collection<AnimatedWallpaper> = {
  slug: 'meeshy-fonds-vivants',
  names: {
    fr: { name: 'Fonds vivants', description: 'Quatre fonds animés par Meeshy, tout en douceur derrière vos messages : lucioles, voile d’aurore, neige douce et ondes.' },
    en: { name: 'Living wallpapers', description: 'Four animated wallpapers by Meeshy, gently moving behind your messages: fireflies, aurora veil, soft snow and ripples.' },
    es: { name: 'Fondos vivos', description: 'Cuatro fondos animados de Meeshy, que se mueven suavemente detrás de tus mensajes: luciérnagas, velo de aurora, nieve suave y ondas.' },
    pt: { name: 'Fundos vivos', description: 'Quatro fundos animados da Meeshy, que se movem com suavidade atrás das tuas mensagens: pirilampos, véu de aurora, neve suave e ondas.' },
    de: { name: 'Lebendige Hintergründe', description: 'Vier animierte Hintergründe von Meeshy, die sich sanft hinter deinen Nachrichten bewegen: Glühwürmchen, Polarlichtschleier, sanfter Schnee und Wellenringe.' },
    it: { name: 'Sfondi vivi', description: 'Quattro sfondi animati di Meeshy, che si muovono piano dietro i tuoi messaggi: lucciole, velo d’aurora, neve leggera e onde.' },
    ar: { name: 'خلفيات حيّة', description: 'أربع خلفيات متحركة من Meeshy تتحرك بهدوء خلف رسائلك: يراعات، وستار الشفق، وثلج ناعم، وتموّجات.' },
  },
  items: named(VIVANT_WALLPAPERS, {
    lucioles: n('Lucioles', 'Fireflies', 'Luciérnagas', 'Pirilampos', 'Glühwürmchen', 'Lucciole', 'يراعات'),
    'voile-aurore': n('Voile d’aurore', 'Aurora veil', 'Velo de aurora', 'Véu de aurora', 'Polarlichtschleier', 'Velo d’aurora', 'ستار الشفق'),
    'neige-douce': n('Neige douce', 'Soft snow', 'Nieve suave', 'Neve suave', 'Sanfter Schnee', 'Neve leggera', 'ثلج ناعم'),
    ondes: n('Ondes', 'Ripples', 'Ondas', 'Ondas', 'Wellenringe', 'Onde', 'تموّجات'),
  }),
};

// ── Cadres de bannière ──────────────────────────────────────────────────

export const FRAMES_SIGNATURE: Collection<BannerFrame> = {
  slug: 'meeshy-bordures',
  names: {
    fr: { name: 'Encadrements signature', description: 'Six cadres de bannière par Meeshy, posés à la lisière pour laisser voir votre niveau et vos compteurs : liseré d’or, volutes, rang de perles, onyx, marqueterie et minuit.' },
    en: { name: 'Signature borders', description: 'Six banner frames by Meeshy, kept to the edge so your level and counters stay in view: gold piping, scrolls, pearl string, onyx, marquetry and midnight.' },
    es: { name: 'Marcos de firma', description: 'Seis marcos de portada de Meeshy, en el borde para que tu nivel y tus contadores sigan a la vista: ribete de oro, volutas, hilera de perlas, ónix, marquetería y medianoche.' },
    pt: { name: 'Molduras assinatura', description: 'Seis molduras de capa da Meeshy, na borda para que o teu nível e os teus contadores fiquem à vista: debrum de ouro, volutas, fio de pérolas, ónix, marchetaria e meia-noite.' },
    de: { name: 'Signatur-Rahmen', description: 'Sechs Bannerrahmen von Meeshy, nur am Rand, damit Level und Zähler sichtbar bleiben: Goldpaspel, Voluten, Perlenschnur, Onyx, Intarsie und Mitternacht.' },
    it: { name: 'Cornici firma', description: 'Sei cornici per il banner di Meeshy, al bordo perché livello e contatori restino visibili: filetto d’oro, volute, filo di perle, onice, intarsio e mezzanotte.' },
    ar: { name: 'أطر مميّزة', description: 'ستة أطر للافتة من Meeshy، عند الحافة كي يبقى مستواك وعدّاداتك ظاهرة: حاشية ذهبية، ولفائف، وعقد لؤلؤ، وجزع، وترصيع، ومنتصف الليل.' },
  },
  items: named(SIGNATURE_FRAMES, {
    'liseret-or': n('Liseré d’or', 'Gold piping', 'Ribete de oro', 'Debrum de ouro', 'Goldpaspel', 'Filetto d’oro', 'حاشية ذهبية'),
    volutes: n('Volutes', 'Scrolls', 'Volutas', 'Volutas', 'Voluten', 'Volute', 'لفائف'),
    'rang-de-perles': n('Rang de perles', 'Pearl string', 'Hilera de perlas', 'Fio de pérolas', 'Perlenschnur', 'Filo di perle', 'عقد لؤلؤ'),
    onyx: n('Onyx', 'Onyx', 'Ónix', 'Ónix', 'Onyx', 'Onice', 'جزع'),
    marqueterie: n('Marqueterie', 'Marquetry', 'Marquetería', 'Marchetaria', 'Intarsie', 'Intarsio', 'ترصيع'),
    minuit: n('Minuit', 'Midnight', 'Medianoche', 'Meia-noite', 'Mitternacht', 'Mezzanotte', 'منتصف الليل'),
  }),
};

export const FRAMES_VIVANTS: Collection<BannerFrame> = {
  slug: 'meeshy-bordures-vivantes',
  names: {
    fr: { name: 'Encadrements vivants', description: 'Quatre cadres de bannière animés par Meeshy : un reflet qui glisse sur l’or, des perles qui brillent, une nuit qui scintille et un néon.' },
    en: { name: 'Living borders', description: 'Four animated banner frames by Meeshy: a glint gliding over gold, shining pearls, a twinkling night and a neon light.' },
    es: { name: 'Marcos vivos', description: 'Cuatro marcos de portada animados de Meeshy: un reflejo que se desliza sobre el oro, perlas que brillan, una noche que centellea y un neón.' },
    pt: { name: 'Molduras vivas', description: 'Quatro molduras de capa animadas da Meeshy: um reflexo que desliza sobre o ouro, pérolas que brilham, uma noite que cintila e um néon.' },
    de: { name: 'Lebendige Rahmen', description: 'Vier animierte Bannerrahmen von Meeshy: ein Glanz, der über Gold gleitet, schimmernde Perlen, eine funkelnde Nacht und ein Neonlicht.' },
    it: { name: 'Cornici vive', description: 'Quattro cornici animate per il banner di Meeshy: un riflesso che scorre sull’oro, perle che brillano, una notte che scintilla e un neon.' },
    ar: { name: 'أطر حيّة', description: 'أربعة أطر متحركة للافتة من Meeshy: لمعة تنزلق على الذهب، ولآلئ تتلألأ، وليل يومض، وضوء نيون.' },
  },
  items: named(VIVANT_FRAMES, {
    'liseret-lumiere': n('Liseré de lumière', 'Light piping', 'Ribete de luz', 'Debrum de luz', 'Lichtpaspel', 'Filetto di luce', 'حاشية من نور'),
    'perles-vives': n('Perles vives', 'Shining pearls', 'Perlas vivas', 'Pérolas vivas', 'Schimmerperlen', 'Perle vive', 'لآلئ متلألئة'),
    'nuit-vive': n('Nuit scintillante', 'Twinkling night', 'Noche centelleante', 'Noite cintilante', 'Funkelnde Nacht', 'Notte scintillante', 'ليل يومض'),
    neon: n('Néon', 'Neon', 'Neón', 'Néon', 'Neon', 'Neon', 'نيون'),
  }),
};
