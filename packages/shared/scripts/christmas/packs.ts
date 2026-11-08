/**
 * Les packs de NOËL de la boutique (#15553) — trois packs de contours d'avatar animés, chacun avec son
 * pack de bannière assorti (`assorted-banners/packs.ts`). Proposés par la boutique, jamais installés
 * d'office, retirables.
 */
import type { IllustratedPack } from '../illustrated-rings/packs.js';
import { BONNET_DU_PERE_NOEL, COURONNE_DE_HOUX, ETOILE_DU_SAPIN, FLOCONS_TOMBANTS, GUIRLANDE_LUMINEUSE, SUCRE_D_ORGE } from './rings.js';

export const NOEL_ENNEIGE: IllustratedPack = {
  slug: 'noel-enneige',
  order: 19,
  names: {
    fr: { name: 'Noël enneigé', description: 'Deux contours animés pour l’hiver : des flocons qui tombent doucement autour de l’avatar, et une couronne de houx aux baies qui brillent.' },
    en: { name: 'Snowy Christmas', description: 'Two animated rings for winter: snowflakes drifting gently around your avatar, and a holly wreath with shining berries.' },
    es: { name: 'Navidad nevada', description: 'Dos contornos animados para el invierno: copos que caen suavemente alrededor del avatar y una corona de acebo con bayas que brillan.' },
    pt: { name: 'Natal com neve', description: 'Dois contornos animados para o inverno: flocos que caem suavemente à volta do avatar e uma coroa de azevinho com bagas que brilham.' },
    de: { name: 'Verschneite Weihnacht', description: 'Zwei animierte Rahmen für den Winter: Schneeflocken, die sanft um deinen Avatar fallen, und ein Stechpalmenkranz mit leuchtenden Beeren.' },
    it: { name: 'Natale innevato', description: 'Due contorni animati per l’inverno: fiocchi che cadono piano intorno all’avatar e una corona di agrifoglio con bacche che brillano.' },
    ar: { name: 'عيد ميلاد مثلج', description: 'إطاران متحركان للشتاء: ندف ثلج تتساقط بهدوء حول صورتك الرمزية، وإكليل من البهشية بتوت يلمع.' },
  },
  frames: [
    { ...FLOCONS_TOMBANTS, names: { fr: 'Flocons qui tombent', en: 'Falling snowflakes', es: 'Copos que caen', pt: 'Flocos a cair', de: 'Fallende Flocken', it: 'Fiocchi che cadono', ar: 'ندف متساقطة' } },
    { ...COURONNE_DE_HOUX, names: { fr: 'Couronne de houx', en: 'Holly wreath', es: 'Corona de acebo', pt: 'Coroa de azevinho', de: 'Stechpalmenkranz', it: 'Corona di agrifoglio', ar: 'إكليل البهشية' } },
  ],
};

export const LUMIERES_DE_NOEL: IllustratedPack = {
  slug: 'lumieres-de-noel',
  order: 20,
  names: {
    fr: { name: 'Lumières de Noël', description: 'Deux contours animés qui s’allument pour les fêtes : une guirlande d’ampoules qui clignotent tour à tour, et l’étoile du sapin qui rayonne.' },
    en: { name: 'Christmas lights', description: 'Two animated rings that light up for the holidays: a string of bulbs blinking in turn, and a tree-top star that shines.' },
    es: { name: 'Luces de Navidad', description: 'Dos contornos animados que se encienden en las fiestas: una guirnalda de bombillas que parpadean por turnos y la estrella del árbol que resplandece.' },
    pt: { name: 'Luzes de Natal', description: 'Dois contornos animados que se acendem nas festas: uma grinalda de lâmpadas que piscam à vez e a estrela da árvore que brilha.' },
    de: { name: 'Weihnachtslichter', description: 'Zwei animierte Rahmen, die zum Fest leuchten: eine Lichterkette, deren Birnen abwechselnd blinken, und der strahlende Stern auf der Tanne.' },
    it: { name: 'Luci di Natale', description: 'Due contorni animati che si accendono per le feste: una ghirlanda di lampadine che lampeggiano a turno e la stella dell’albero che risplende.' },
    ar: { name: 'أضواء الميلاد', description: 'إطاران متحركان يضيئان في الأعياد: سلسلة مصابيح تومض بالتناوب، ونجمة الشجرة المتألقة.' },
  },
  frames: [
    { ...GUIRLANDE_LUMINEUSE, names: { fr: 'Guirlande lumineuse', en: 'String lights', es: 'Guirnalda de luces', pt: 'Grinalda de luzes', de: 'Lichterkette', it: 'Ghirlanda luminosa', ar: 'سلسلة أضواء' } },
    { ...ETOILE_DU_SAPIN, names: { fr: 'Étoile du sapin', en: 'Tree-top star', es: 'Estrella del árbol', pt: 'Estrela da árvore', de: 'Tannenstern', it: 'Stella dell’albero', ar: 'نجمة الشجرة' } },
  ],
};

export const ATELIER_DU_PERE_NOEL: IllustratedPack = {
  slug: 'atelier-du-pere-noel',
  order: 21,
  names: {
    fr: { name: 'Atelier du Père Noël', description: 'Deux contours animés tout droit sortis de l’atelier : un bonnet rouge dont le pompon se balance, et un sucre d’orge qui tourne, noué d’un ruban vert.' },
    en: { name: 'Santa’s workshop', description: 'Two animated rings straight from the workshop: a red hat with a swinging pompom, and a spinning candy cane tied with a green ribbon.' },
    es: { name: 'Taller de Papá Noel', description: 'Dos contornos animados recién salidos del taller: un gorro rojo con un pompón que se balancea y un bastón de caramelo que gira, atado con una cinta verde.' },
    pt: { name: 'Oficina do Pai Natal', description: 'Dois contornos animados acabados de sair da oficina: um gorro vermelho cujo pompom balança e um bastão de doce que gira, atado com uma fita verde.' },
    de: { name: 'Werkstatt des Weihnachtsmanns', description: 'Zwei animierte Rahmen frisch aus der Werkstatt: eine rote Mütze mit schaukelndem Bommel und eine kreisende Zuckerstange mit grüner Schleife.' },
    it: { name: 'Laboratorio di Babbo Natale', description: 'Due contorni animati appena usciti dal laboratorio: un berretto rosso con il pompon che dondola e un bastoncino di zucchero che gira, legato da un nastro verde.' },
    ar: { name: 'ورشة بابا نويل', description: 'إطاران متحركان من الورشة مباشرة: قبعة حمراء تتأرجح كرتها، وعصا حلوى تدور معقودة بشريط أخضر.' },
  },
  frames: [
    { ...BONNET_DU_PERE_NOEL, names: { fr: 'Bonnet du Père Noël', en: 'Santa hat', es: 'Gorro de Papá Noel', pt: 'Gorro do Pai Natal', de: 'Weihnachtsmütze', it: 'Berretto di Babbo Natale', ar: 'قبعة بابا نويل' } },
    { ...SUCRE_D_ORGE, names: { fr: 'Sucre d’orge', en: 'Candy cane', es: 'Bastón de caramelo', pt: 'Bastão de doce', de: 'Zuckerstange', it: 'Bastoncino di zucchero', ar: 'عصا الحلوى' } },
  ],
};

export const CHRISTMAS_RING_PACKS: readonly IllustratedPack[] = [NOEL_ENNEIGE, LUMIERES_DE_NOEL, ATELIER_DU_PERE_NOEL];
