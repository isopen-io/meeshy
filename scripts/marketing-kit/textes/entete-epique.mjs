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
  // Le LIEN (#9904) : rejoindre sans compte, voir qui arrive par son lien, gérer ses liens. Aucun sondage : l'app n'en a pas.
  invite: {
    titre: {
      fr: 'Rejoins sans compte', en: 'Join without an account', es: 'Únete sin cuenta', de: 'Ohne Konto beitreten',
      it: 'Entra senza account', pt: 'Entre sem conta', ar: 'انضم بدون حساب',
    },
    sousTitre: {
      fr: 'Un lien suffit', en: 'One link is all it takes', es: 'Basta con un enlace', de: 'Ein Link genügt',
      it: 'Basta un link', pt: 'Basta um link', ar: 'رابط واحد يكفي',
    },
  },
  arrivees: {
    titre: {
      fr: 'Vois qui arrive', en: 'See who’s coming', es: 'Mira quién llega', de: 'Sieh, wer kommt',
      it: 'Guarda chi arriva', pt: 'Veja quem chega', ar: 'شاهد من يصل',
    },
    sousTitre: {
      fr: 'Sans compte, dans sa langue', en: 'No account, in their own language', es: 'Sin cuenta, en su idioma',
      de: 'Ohne Konto, in seiner Sprache', it: 'Senza account, nella sua lingua', pt: 'Sem conta, no próprio idioma',
      ar: 'بدون حساب، وبلغته',
    },
  },
  business: {
    titre: {
      fr: 'Gère ton business', en: 'Run your business', es: 'Gestiona tu negocio', de: 'Führe dein Business',
      it: 'Gestisci il tuo business', pt: 'Gerencie seu negócio', ar: 'أدِر أعمالك',
    },
    sousTitre: {
      fr: 'avec un seul lien', en: 'with a single link', es: 'con un solo enlace', de: 'mit einem einzigen Link',
      it: 'con un solo link', pt: 'com um único link', ar: 'برابط واحد',
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
