// La typographie de l'en-tête animé de la fiche App Store (#9904), dans les sept langues. Chaque ligne décrit le plan
// qu'elle accompagne, rien de plus : les réels, les stories et les vocaux se lisent dans la langue du lecteur (le Prisme),
// le jeu frappe des Meesh, ouvre un coffre et fait monter de niveau. « Découvre d'autres langues en jouant » dit ce que
// l'écran montre — chaque contenu garde son original, à un geste — sans promettre un cours de langue que l'app ne donne
// pas. Le vocabulaire du jeu est celui des aperçus (textes/apercus.mjs, repris du catalogue de l'app). L'arabe doit être
// relu par un locuteur natif avant l'envoi.
import { LEGENDES_APERCUS } from './apercus.mjs'

const sansPoint = (parLangue) => Object.fromEntries(Object.entries(parLangue).map(([l, t]) => [l, t.replace(/[.。]$/u, '')]))

export const TEXTES_ENTETE = {
  reels: {
    titre: {
      fr: 'Des réels qui font rire', en: 'Reels that make you laugh', es: 'Reels que te hacen reír', de: 'Reels zum Lachen',
      it: 'Reel che fanno ridere', pt: 'Reels que fazem rir', ar: 'مقاطع تُضحكك',
    },
    sousTitre: {
      fr: 'dans toutes les langues', en: 'in every language', es: 'en todos los idiomas', de: 'in jeder Sprache',
      it: 'in tutte le lingue', pt: 'em todos os idiomas', ar: 'بكل اللغات',
    },
  },
  story: {
    titre: { fr: 'Des stories', en: 'Stories', es: 'Stories', de: 'Storys', it: 'Storie', pt: 'Stories', ar: 'القصص' },
    sousTitre: {
      fr: 'lues dans ta langue', en: 'read in your language', es: 'leídas en tu idioma', de: 'in deiner Sprache gelesen',
      it: 'lette nella tua lingua', pt: 'lidos no seu idioma', ar: 'تقرؤها بلغتك',
    },
  },
  vocal: {
    titre: {
      fr: 'Des vocaux', en: 'Voice notes', es: 'Notas de voz', de: 'Sprachnachrichten', it: 'Vocali', pt: 'Áudios',
      ar: 'الرسائل الصوتية',
    },
    sousTitre: {
      fr: 'transcrits et traduits', en: 'transcribed and translated', es: 'transcritas y traducidas',
      de: 'transkribiert und übersetzt', it: 'trascritti e tradotti', pt: 'transcritos e traduzidos', ar: 'مكتوبة ومترجمة',
    },
  },
  frappe: { titre: sansPoint(LEGENDES_APERCUS['jeu-frappe']) },
  coffre: { titre: sansPoint(LEGENDES_APERCUS['jeu-coffre']) },
  niveau: { titre: sansPoint(LEGENDES_APERCUS['jeu-niveau']) },
  rang: {
    titre: sansPoint(LEGENDES_APERCUS['jeu-niveau']),
    sousTitre: {
      fr: 'Découvre d’autres langues en jouant', en: 'Discover new languages as you play',
      es: 'Descubre otros idiomas jugando', de: 'Entdecke beim Spielen neue Sprachen', it: 'Scopri altre lingue giocando',
      pt: 'Descubra outros idiomas jogando', ar: 'اكتشف لغات أخرى وأنت تلعب',
    },
  },
}
