// Les deux groupes de la vitrine (#8825) : un fou rire autour d'une photo, puis un débat
// acharné. Chacun écrit dans SA langue ; le lecteur lit tout dans la sienne. Un lecteur membre
// du groupe voit ses propres messages de son côté (le rendu compare l'auteur au lecteur).

const contenu = (id, lang, text, translations) => ({ id, lang, text, translations })

const message = (auteur, id, lang, text, translations, extra = {}) => ({ auteur, ...contenu(id, lang, text, translations), ...extra })

// « Lisboa ✈️ » — la veille du départ, le chat d'Aiko s'est installé dans la valise (et le chien
// de Lucas a tenté le même coup, sur l'iPad).
export const DROLE = {
  titre: 'Lisboa ✈️',
  membres: ['aiko.t', 'lucas.olv', 'kwame.m', 'minjun.p', 'sofi.romero'],
  valise: message('aiko.t', 'drole.valise', 'ja', '明日の旅行、ちょっと問題発生… 😭', {
    fr: 'Petit problème pour demain… 😭', en: 'Slight problem for tomorrow… 😭', es: 'Pequeño problema para mañana… 😭',
    de: 'Kleines Problem für morgen… 😭', it: 'Piccolo problema per domani… 😭', pt: 'Probleminha pra amanhã… 😭',
    ar: 'مشكلة صغيرة بخصوص الغد… 😭',
  }, { photos: ['chat-valise'], reactions: '😂 12' }),
  bagage: message('lucas.olv', 'drole.bagage', 'pt', 'Pelo menos ele já fez a mala 😂', {
    fr: 'Lui, au moins, il a fait sa valise 😂', en: 'At least he’s already packed 😂', es: 'Al menos él ya hizo la maleta 😂',
    de: 'Er hat wenigstens schon gepackt 😂', it: 'Almeno lui la valigia l’ha già fatta 😂', ar: 'على الأقل هو جهّز حقيبته 😂',
  }),
  chien: message('lucas.olv', 'drole.chien', 'pt', 'Meu cachorro tentou a mesma coisa 😂', {
    fr: 'Mon chien a tenté le même coup 😂', en: 'My dog tried the same trick 😂', es: 'Mi perro intentó lo mismo 😂',
    de: 'Mein Hund hat’s auch versucht 😂', it: 'Il mio cane ci ha provato uguale 😂', ar: 'كلبي حاول الشيء نفسه 😂',
  }, { photos: ['chien-sac'] }),
  hublot: message('sofi.romero', 'drole.hublot', 'es', 'Reservadle un asiento de ventanilla 🪟😹', {
    fr: 'Réservez-lui un siège côté hublot 🪟😹', en: 'Book him a window seat 🪟😹', de: 'Bucht ihm einen Fensterplatz 🪟😹',
    it: 'Prenotategli un posto al finestrino 🪟😹', pt: 'Reservem uma janelinha pra ele 🪟😹', ar: 'احجزوا له مقعدًا بجانب النافذة 🪟😹',
  }),
  // Le vocal de Min-jun : sa transcription, servie dans la langue du lecteur.
  vocal: message('minjun.p', 'drole.vocal', 'ko', '엄마한테 사진 보여줬더니 입양하고 싶대.', {
    fr: 'J’ai montré la photo à ma mère, elle veut l’adopter.', en: 'I showed my mom the photo, she wants to adopt him.',
    es: 'Le enseñé la foto a mi madre y quiere adoptarlo.', de: 'Hab Mama das Foto gezeigt, sie will ihn adoptieren.',
    it: 'Ho fatto vedere la foto a mia madre, vuole adottarlo.', pt: 'Mostrei a foto pra minha mãe, ela quer adotar ele.',
    ar: 'أريت الصورة لأمي، وتريد أن تتبناه.',
  }, { duree: '0:06', ecoule: '0:03', progression: 0.55 }),
  mien: {
    fr: 'Il vient avec nous, point final 😂🐾', en: 'He’s coming with us, end of story 😂🐾', es: 'Se viene con nosotros y punto 😂🐾',
    de: 'Er kommt mit. Punkt. 😂🐾', it: 'Viene con noi, punto e basta 😂🐾', pt: 'Ele vem com a gente e ponto final 😂🐾',
    ar: 'سيأتي معنا، وانتهى النقاش 😂🐾',
  },
}

// « Pizza Night 🍕 » — Kwame poste une pizza à l'ananas, l'Italie s'embrase.
export const DEBAT = {
  titre: 'Pizza Night 🍕',
  membres: ['kwame.m', 'giulia.r', 'lucas.olv', 'jonas.wb', 'minjun.p'],
  messages: [
    message('kwame.m', 'debat.diner', 'en', 'Tonight’s dinner 😇🍍', {
      fr: 'Le dîner de ce soir 😇🍍', es: 'La cena de esta noche 😇🍍', de: 'Das Abendessen heute 😇🍍',
      it: 'La cena di stasera 😇🍍', pt: 'O jantar de hoje 😇🍍', ar: 'عشاء الليلة 😇🍍',
    }, { photos: ['pizza-ananas'] }),
    message('giulia.r', 'debat.crime', 'it', 'NO. L’ananas sulla pizza è un crimine 😤🇮🇹', {
      fr: 'NON. L’ananas sur une pizza, c’est un crime 😤🇮🇹', en: 'NO. Pineapple on pizza is a crime 😤🇮🇹',
      es: 'NO. La piña en la pizza es un crimen 😤🇮🇹', de: 'NEIN. Ananas auf Pizza ist ein Verbrechen 😤🇮🇹',
      pt: 'NÃO. Abacaxi na pizza é crime 😤🇮🇹', ar: 'لا. الأناناس على البيتزا جريمة 😤🇮🇹',
    }, { reactions: '🔥 8' }),
    message('lucas.olv', 'debat.chocolat', 'pt', 'No Brasil a gente põe chocolate na pizza e tá tudo bem 🍫', {
      fr: 'Au Brésil, pizza au chocolat. Et tout va bien 🍫', en: 'In Brazil we put chocolate on pizza and we’re fine 🍫',
      es: 'En Brasil hay pizza de chocolate y no pasa nada 🍫', de: 'In Brasilien kommt Schokolade auf die Pizza, und uns geht’s gut 🍫',
      it: 'In Brasile mettiamo il cioccolato sulla pizza e stiamo benissimo 🍫', ar: 'في البرازيل نضع الشوكولاتة على البيتزا ولا مشكلة 🍫',
    }, { photosLong: ['pizza-chocolat'] }),
    message('giulia.r', 'debat.quitte', 'it', 'Esco da questo gruppo. 🙅‍♀️', {
      fr: 'Je quitte ce groupe. 🙅‍♀️', en: 'I’m leaving this group. 🙅‍♀️', es: 'Me salgo de este grupo. 🙅‍♀️',
      de: 'Ich verlasse diese Gruppe. 🙅‍♀️', pt: 'Tô saindo deste grupo. 🙅‍♀️', ar: 'سأغادر هذه المجموعة. 🙅‍♀️',
    }),
    message('jonas.wb', 'debat.popcorn', 'de', 'Ich hol schon mal Popcorn 🍿', {
      fr: 'Je vais chercher le pop-corn 🍿', en: 'Getting the popcorn 🍿', es: 'Voy a por palomitas 🍿',
      it: 'Vado a prendere i popcorn 🍿', pt: 'Vou pegar a pipoca 🍿', ar: 'سأحضر الفشار 🍿',
    }),
  ],
  // L'iPad a la hauteur d'une réplique de plus : la Corée entre dans le débat.
  patateDouce: message('minjun.p', 'debat.patate-douce', 'ko', '한국에선 피자에 고구마 올려 먹어 🍠', {
    fr: 'En Corée, on met de la patate douce sur la pizza 🍠', en: 'In Korea we put sweet potato on pizza 🍠',
    es: 'En Corea le ponemos boniato a la pizza 🍠', de: 'In Korea kommt Süßkartoffel auf die Pizza 🍠',
    it: 'In Corea mettiamo la patata dolce sulla pizza 🍠', pt: 'Na Coreia a gente põe batata-doce na pizza 🍠',
    ar: 'في كوريا نضع البطاطا الحلوة على البيتزا 🍠',
  }),
  // Le lecteur hors du groupe prend parti ; un lecteur membre a déjà parlé.
  mien: {
    fr: 'Honnêtement… l’ananas, c’est bon 🙈', en: 'Honestly… pineapple is good 🙈', es: 'Sinceramente… la piña está buena 🙈',
    de: 'Ehrlich gesagt… Ananas ist lecker 🙈', it: 'Sinceramente… l’ananas è buono 🙈', pt: 'Sinceramente… abacaxi é bom 🙈',
    ar: 'بصراحة… الأناناس لذيذ 🙈',
  },
}
