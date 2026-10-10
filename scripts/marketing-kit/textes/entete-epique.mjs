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
  // Le LIEN (#9904, précisé par le porteur) : sonder ses proches par un lien anonyme (une conversation, PAS un sondage),
  // une conversation de SAV et un lien par produit, et les clients qui y écrivent sans compte — le web les sert sans
  // installer l'app (`/chat/:link`).
  sonde: {
    titre: {
      fr: 'Sonde tes proches', en: 'Ask your loved ones', es: 'Pregunta a los tuyos', de: 'Frag deine Liebsten',
      it: 'Chiedi ai tuoi cari', pt: 'Pergunte aos seus', ar: 'اسأل أحبّاءك',
    },
    sousTitre: {
      fr: 'Un lien anonyme : chacun dit tout, dans sa langue', en: 'One anonymous link: everyone speaks freely, in their own language',
      es: 'Un enlace anónimo: cada uno lo dice todo, en su idioma', de: 'Ein anonymer Link: Jeder sagt alles, in seiner Sprache',
      it: 'Un link anonimo: ognuno dice tutto, nella sua lingua', pt: 'Um link anônimo: cada um diz tudo, no próprio idioma',
      ar: 'رابط مجهول: كلٌّ يقول ما يريد، بلغته',
    },
  },
  sav: {
    titre: {
      fr: 'Gère ton business', en: 'Run your business', es: 'Gestiona tu negocio', de: 'Führe dein Business',
      it: 'Gestisci il tuo business', pt: 'Gerencie seu negócio', ar: 'أدِر أعمالك',
    },
    sousTitre: {
      fr: 'Un SAV et un lien par produit', en: 'One support chat and one link per product', es: 'Un soporte y un enlace por producto',
      de: 'Ein Support-Chat und ein Link pro Produkt', it: 'Un’assistenza e un link per prodotto', pt: 'Um suporte e um link por produto',
      ar: 'دعم ورابط لكل منتج',
    },
  },
  invite: {
    titre: {
      fr: 'Tes clients écrivent', en: 'Your customers write in', es: 'Tus clientes escriben', de: 'Deine Kunden schreiben',
      it: 'I tuoi clienti scrivono', pt: 'Seus clientes escrevem', ar: 'عملاؤك يكتبون',
    },
    sousTitre: {
      fr: 'Sans compte, même depuis leur navigateur', en: 'No account, even from their browser', es: 'Sin cuenta, incluso desde su navegador',
      de: 'Ohne Konto, sogar im Browser', it: 'Senza account, anche dal browser', pt: 'Sem conta, até pelo navegador',
      ar: 'بدون حساب، حتى من المتصفح',
    },
  },
  liens: {
    titre: {
      fr: 'Suis tes liens', en: 'Track your links', es: 'Sigue tus enlaces', de: 'Behalte deine Links im Blick',
      it: 'Segui i tuoi link', pt: 'Acompanhe seus links', ar: 'تابع روابطك',
    },
    sousTitre: {
      fr: 'Clics, inscrits, affiliation', en: 'Clicks, sign-ups, affiliates', es: 'Clics, registros, afiliación',
      de: 'Klicks, Anmeldungen, Partnerlinks', it: 'Clic, iscritti, affiliazione', pt: 'Cliques, cadastros, afiliação',
      ar: 'النقرات والتسجيلات والإحالات',
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
