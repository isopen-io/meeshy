/**
 * Les packs de CADRES ILLUSTRÉS (#13960), dans leur ordre de boutique, avec leurs noms dans les sept
 * langues — ceux du pack et ceux de chaque cadre. Installés d'office, retirables, comme les packs animés.
 */
import type { IllustratedFrame } from './frame.js';
import { AILES_ANGE, AILES_DEMON } from './vitrine-ailes.js';
import { MASQUE_FELIN, TOILE_ARAIGNEE } from './vitrine-masque-toile.js';
import { CERCLE_RUNIQUE, GRIFFES_OS } from './vitrine-runes-griffes.js';

export const LANGUAGES = ['fr', 'en', 'es', 'pt', 'de', 'it', 'ar'] as const;
export type Language = (typeof LANGUAGES)[number];
type Named = Readonly<Record<Language, string>>;

export type IllustratedPack = {
  readonly slug: string;
  readonly order: number;
  readonly names: Readonly<Record<Language, { readonly name: string; readonly description: string }>>;
  readonly frames: readonly (IllustratedFrame & { readonly names: Named })[];
};

export const ILLUSTRATED_PACKS: readonly IllustratedPack[] = [
  {
    slug: 'cadres-illustres',
    order: 9,
    names: {
      fr: { name: 'Cadres illustrés', description: 'Six cadres qui débordent de l’avatar : un masque aux yeux qui rougissent, une toile et son araignée, des ailes d’ange, un cercle runique, des griffes d’os, des ailes de démon.' },
      en: { name: 'Illustrated frames', description: 'Six frames that spill past your avatar: a mask whose eyes turn red, a web and its spider, angel wings, a runic circle, bone claws and demon wings.' },
      es: { name: 'Marcos ilustrados', description: 'Seis marcos que desbordan tu avatar: una máscara de ojos que enrojecen, una telaraña con su araña, alas de ángel, un círculo rúnico, garras de hueso y alas de demonio.' },
      pt: { name: 'Molduras ilustradas', description: 'Seis molduras que transbordam do teu avatar: uma máscara de olhos que ficam vermelhos, uma teia e a sua aranha, asas de anjo, um círculo rúnico, garras de osso e asas de demônio.' },
      de: { name: 'Illustrierte Rahmen', description: 'Sechs Rahmen, die über deinen Avatar hinausragen: eine Maske mit rot glühenden Augen, ein Netz samt Spinne, Engelsflügel, ein Runenkreis, Knochenkrallen und Dämonenflügel.' },
      it: { name: 'Cornici illustrate', description: 'Sei cornici che escono dal tuo avatar: una maschera dagli occhi che diventano rossi, una ragnatela col suo ragno, ali d’angelo, un cerchio runico, artigli d’osso e ali di demone.' },
      ar: { name: 'إطارات مرسومة', description: 'ستة إطارات تتجاوز صورتك الرمزية: قناع تحمرّ عيناه، وشبكة وعنكبوتها، وجناحا ملاك، ودائرة رموز، ومخالب عظمية، وجناحا شيطان.' },
    },
    frames: [
      { ...MASQUE_FELIN, names: { fr: 'Masque félin', en: 'Feline mask', es: 'Máscara felina', pt: 'Máscara felina', de: 'Katzenmaske', it: 'Maschera felina', ar: 'قناع سنّوري' } },
      { ...TOILE_ARAIGNEE, names: { fr: 'Toile d’araignée', en: 'Spider web', es: 'Telaraña', pt: 'Teia de aranha', de: 'Spinnennetz', it: 'Ragnatela', ar: 'شبكة عنكبوت' } },
      { ...AILES_ANGE, names: { fr: 'Ailes d’ange', en: 'Angel wings', es: 'Alas de ángel', pt: 'Asas de anjo', de: 'Engelsflügel', it: 'Ali d’angelo', ar: 'جناحا ملاك' } },
      { ...CERCLE_RUNIQUE, names: { fr: 'Cercle runique', en: 'Runic circle', es: 'Círculo rúnico', pt: 'Círculo rúnico', de: 'Runenkreis', it: 'Cerchio runico', ar: 'دائرة الرموز' } },
      { ...GRIFFES_OS, names: { fr: 'Griffes d’os', en: 'Bone claws', es: 'Garras de hueso', pt: 'Garras de osso', de: 'Knochenkrallen', it: 'Artigli d’osso', ar: 'مخالب العظم' } },
      { ...AILES_DEMON, names: { fr: 'Ailes de démon', en: 'Demon wings', es: 'Alas de demonio', pt: 'Asas de demônio', de: 'Dämonenflügel', it: 'Ali di demone', ar: 'جناحا شيطان' } },
    ],
  },
];
