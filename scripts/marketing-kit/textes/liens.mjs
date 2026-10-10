// Le LIEN dans l'en-tête de la fiche App Store (#9904), précisé par le porteur le 2026-10-10 :
// - « Sonder ses proches » = un lien ANONYME qu'on ne partage qu'à ses proches : chacun vient dire ce qu'il veut, sans
//   compte, dans sa langue. Ce n'est PAS un sondage (l'app n'en a pas) : c'est une conversation par lien.
// - « Gérer son business avec un seul lien » = une conversation de SAV par produit ou activité, chacune ouverte aux clients
//   par son lien ; ils y écrivent sans installer l'app (la page `/chat/:link` du web les sert sans compte).
// Personnes fictives. Chaque texte porte sa langue d'origine et sa traduction dans les sept langues de lecture. L'arabe
// doit être relu par un locuteur natif avant l'envoi.

export const SONDE = {
  titre: {
    fr: 'Dis-moi tout 🤫', en: 'Tell me anything 🤫', es: 'Cuéntame todo 🤫', de: 'Sag mir alles 🤫',
    it: 'Dimmi tutto 🤫', pt: 'Me conta tudo 🤫', ar: 'قل لي كل شيء 🤫',
  },
  // Les invités anonymes : un pseudo choisi en rejoignant, dans leur langue.
  messages: [
    {
      id: 'sonde.gateau', pseudo: 'Coruja 🦉', lang: 'pt', textes: {
        pt: 'Sinceramente? O bolo de domingo estava salgado demais 😅',
        fr: 'Franchement ? Le gâteau de dimanche était bien trop salé 😅', en: 'Honestly? Sunday’s cake was way too salty 😅',
        es: '¿Sinceramente? El pastel del domingo estaba demasiado salado 😅', de: 'Ehrlich? Der Sonntagskuchen war viel zu salzig 😅',
        it: 'Sinceramente? La torta di domenica era troppo salata 😅', ar: 'بصراحة؟ كعكة يوم الأحد كانت مالحة جدًا 😅',
      },
    },
    {
      id: 'sonde.mer', pseudo: '여우 🦊', lang: 'ko', textes: {
        ko: '솔직히 다음 가족 여행은 바다로 가고 싶어 🏖️',
        fr: 'Pour être honnête, le prochain voyage en famille, je le veux à la mer 🏖️',
        en: 'To be honest, I want the next family trip to be by the sea 🏖️',
        es: 'La verdad, quiero que el próximo viaje familiar sea a la playa 🏖️',
        de: 'Ehrlich gesagt will ich die nächste Familienreise ans Meer 🏖️',
        it: 'A dire il vero, il prossimo viaggio di famiglia lo voglio al mare 🏖️',
        pt: 'Pra ser sincero, quero a próxima viagem em família na praia 🏖️', ar: 'بصراحة، أريد رحلة العائلة القادمة إلى البحر 🏖️',
      },
    },
    {
      id: 'sonde.cuisine', pseudo: 'Panda 🐼', lang: 'es', textes: {
        es: 'Deberías abrir tu canal de cocina. ¡Lo petarías! 🍳',
        fr: 'Tu devrais lancer ta chaîne de cuisine. Tu cartonnerais ! 🍳', en: 'You should start your cooking channel. You’d smash it! 🍳',
        de: 'Du solltest deinen Kochkanal starten. Du würdest abräumen! 🍳', it: 'Dovresti aprire il tuo canale di cucina. Spaccheresti! 🍳',
        pt: 'Você devia abrir seu canal de culinária. Ia bombar! 🍳', ar: 'يجب أن تطلق قناة الطبخ الخاصة بك. ستنجح بقوة! 🍳',
      },
    },
    {
      id: 'sonde.jeux', pseudo: 'Koala 🐨', lang: 'de', textes: {
        de: 'Ich vermisse unsere Spieleabende. Freitag? 🎲',
        fr: 'Nos soirées jeux me manquent. Vendredi ? 🎲', en: 'I miss our game nights. Friday? 🎲',
        es: 'Echo de menos nuestras noches de juegos. ¿El viernes? 🎲', it: 'Mi mancano le nostre serate giochi. Venerdì? 🎲',
        pt: 'Sinto falta das nossas noites de jogos. Sexta? 🎲', ar: 'أشتاق إلى سهرات الألعاب. الجمعة؟ 🎲',
      },
    },
    {
      id: 'sonde.surprise', pseudo: 'うさぎ 🐰', lang: 'ja', textes: {
        ja: '誕生日パーティー、サプライズにしようよ 🤫🎂',
        fr: 'Et si on faisait de l’anniversaire une surprise ? 🤫🎂', en: 'Let’s make the birthday party a surprise 🤫🎂',
        es: '¿Y si hacemos la fiesta de cumpleaños sorpresa? 🤫🎂', de: 'Lass uns die Geburtstagsparty zur Überraschung machen 🤫🎂',
        it: 'Facciamo della festa di compleanno una sorpresa 🤫🎂', pt: 'Bora fazer a festa de aniversário surpresa? 🤫🎂',
        ar: 'ما رأيكم أن نجعل حفلة عيد الميلاد مفاجأة؟ 🤫🎂',
      },
    },
  ],
}

// Les conversations de SAV, une par produit ou activité ; la dernière question vient d'un client, sans compte.
export const SAV = [
  {
    cle: 'lampe', lien: 'sav-lampe-torche',
    titre: {
      fr: 'SAV Lampe torche', en: 'Support · Flashlight', es: 'Soporte · Linterna', de: 'Support · Taschenlampe',
      it: 'Assistenza · Torcia', pt: 'Suporte · Lanterna', ar: 'الدعم · مصباح يدوي',
    },
    client: 'Max', lang: 'de', textes: {
      de: 'Ist die Lampe wasserdicht? 🔦', fr: 'La lampe est-elle étanche ? 🔦', en: 'Is the flashlight waterproof? 🔦',
      es: '¿La linterna es resistente al agua? 🔦', it: 'La torcia è impermeabile? 🔦', pt: 'A lanterna é à prova d’água? 🔦',
      ar: 'هل المصباح مقاوم للماء؟ 🔦',
    },
  },
  {
    cle: 'portable', lien: 'sav-ordinateur-portable',
    titre: {
      fr: 'SAV Ordinateur portable', en: 'Support · Laptop', es: 'Soporte · Portátil', de: 'Support · Laptop',
      it: 'Assistenza · Portatile', pt: 'Suporte · Notebook', ar: 'الدعم · حاسوب محمول',
    },
    client: 'Yuki', lang: 'ja', textes: {
      ja: '保証は何年ですか？💻', fr: 'La garantie dure combien d’années ? 💻', en: 'How many years is the warranty? 💻',
      es: '¿Cuántos años de garantía tiene? 💻', de: 'Wie viele Jahre Garantie gibt es? 💻', it: 'Quanti anni dura la garanzia? 💻',
      pt: 'Quantos anos de garantia? 💻', ar: 'كم سنة مدة الضمان؟ 💻',
    },
  },
  {
    cle: 'sylorion', lien: 'sav-sylorion',
    titre: {
      fr: 'SAV Sylorion', en: 'Support · Sylorion', es: 'Soporte · Sylorion', de: 'Support · Sylorion',
      it: 'Assistenza · Sylorion', pt: 'Suporte · Sylorion', ar: 'الدعم · Sylorion',
    },
    client: 'Grace', lang: 'en', textes: {
      en: 'Do you ship to Ghana? 📦', fr: 'Vous livrez au Ghana ? 📦', es: '¿Envían a Ghana? 📦', de: 'Liefert ihr nach Ghana? 📦',
      it: 'Spedite in Ghana? 📦', pt: 'Vocês entregam em Gana? 📦', ar: 'هل تشحنون إلى غانا؟ 📦',
    },
  },
  {
    cle: 'services', lien: 'sav-services',
    titre: {
      fr: 'SAV Services', en: 'Support · Services', es: 'Soporte · Servicios', de: 'Support · Services',
      it: 'Assistenza · Servizi', pt: 'Suporte · Serviços', ar: 'الدعم · الخدمات',
    },
    client: 'Salma', lang: 'ar', textes: {
      ar: 'هل يمكنني حجز موعد يوم السبت؟ 📅', fr: 'Je peux réserver un rendez-vous samedi ? 📅',
      en: 'Can I book an appointment on Saturday? 📅', es: '¿Puedo reservar una cita el sábado? 📅',
      de: 'Kann ich einen Termin am Samstag buchen? 📅', it: 'Posso prenotare un appuntamento sabato? 📅',
      pt: 'Posso marcar um horário no sábado? 📅',
    },
  },
]

// « Mes liens » : les liens d'affiliation de l'activité du lecteur, chacun posé sur son canal, avec ses clics et ses inscrits.
export const AFFILIATION = [
  {
    cle: 'qr-boutique', clics: 1284, inscrits: 96, nom: {
      fr: 'QR en boutique', en: 'In-store QR', es: 'QR en tienda', de: 'QR im Laden', it: 'QR in negozio', pt: 'QR na loja',
      ar: 'رمز QR في المتجر',
    },
  },
  {
    cle: 'bio-instagram', clics: 642, inscrits: 41, nom: {
      fr: 'Bio Instagram', en: 'Instagram bio', es: 'Bio de Instagram', de: 'Instagram-Bio', it: 'Bio di Instagram',
      pt: 'Bio do Instagram', ar: 'نبذة إنستغرام',
    },
  },
  {
    cle: 'salon-lisbonne', clics: 219, inscrits: 18, nom: {
      fr: 'Salon de Lisbonne', en: 'Lisbon trade fair', es: 'Feria de Lisboa', de: 'Messe Lissabon', it: 'Fiera di Lisbona',
      pt: 'Feira de Lisboa', ar: 'معرض لشبونة',
    },
  },
]
