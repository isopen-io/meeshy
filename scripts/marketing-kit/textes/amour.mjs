// La conversation amoureuse à distance (#8825). Chaque vitrine montre SON lecteur et son
// partenaire : Min-jun (Séoul, coréen) pour une lectrice, Aiko (Osaka, japonais) pour un lecteur
// (`partenaireDe`, textes/demo.mjs). Une réplique du partenaire existe dans les DEUX langues et
// porte UNE table de traductions : elle est écrite sans marque de genre, pour qu'une même
// traduction serve les deux voix — sauf `vocalReaction`, qui nomme la langue et a deux tables.
// Ce que le lecteur écrit (`miens`) est dans sa langue, accordé à son genre et à celui de l'autre.

const contenu = (id, lang, text, translations) => ({ id, lang, text, translations })

const replique = (id, { ko, ja }, translations) => ({
  id,
  ko: contenu(`${id}.ko`, 'ko', ko, translations),
  ja: contenu(`${id}.ja`, 'ja', ja, translations),
})

const pense = replique('amour.pense', { ko: '점심시간인데… 계속 네 생각만 나 💭', ja: 'お昼休み…ずっと君のことばかり考えてる 💭' }, {
  fr: 'Pause déjeuner… je ne pense qu’à toi 💭', en: 'Lunch break… and all I think about is you 💭',
  es: 'Pausa para comer… y solo pienso en ti 💭', de: 'Mittagspause… und ich denk nur an dich 💭',
  it: 'Pausa pranzo… e penso solo a te 💭', pt: 'Hora do almoço… e só penso em você 💭',
  ar: 'استراحة الغداء… ولا أفكر إلا فيك 💭',
})

const vue = replique('amour.vue', { ko: '오늘 밤 야경… 너만 있으면 완벽할 텐데 ❤️', ja: '今夜の夜景…君がいれば完璧なのに ❤️' }, {
  fr: 'La vue ce soir… il ne manque que toi ❤️', en: 'Tonight’s view… the only thing missing is you ❤️',
  es: 'La vista de esta noche… solo faltas tú ❤️', de: 'Die Aussicht heute Abend… nur du fehlst ❤️',
  it: 'La vista di stasera… manchi solo tu ❤️', pt: 'A vista de hoje à noite… só falta você ❤️',
  ar: 'منظر الليلة… لا ينقصه إلا أنت ❤️',
})

const jours = replique('amour.jours', { ko: '이제 12일만 기다리면 돼 ❤️', ja: 'あと12日だね ❤️' }, {
  fr: 'Plus que 12 jours ❤️', en: 'Just 12 more days ❤️', es: 'Solo quedan 12 días ❤️',
  de: 'Nur noch 12 Tage ❤️', it: 'Mancano solo 12 giorni ❤️', pt: 'Só faltam 12 dias ❤️',
  ar: 'باقي 12 يومًا فقط ❤️',
})

const vocalReaction = {
  id: 'amour.vocal.reaction',
  ko: contenu('amour.vocal.reaction.ko', 'ko', '한국어로 온 음성 메시지… 나 완전 녹았어 🥹', {
    fr: 'Ton vocal en coréen… j’ai fondu 🥹', en: 'Your voice note in Korean… I melted 🥹',
    es: 'Tu audio en coreano… me derretí 🥹', de: 'Deine Sprachnachricht auf Koreanisch… ich schmelze dahin 🥹',
    it: 'Il tuo vocale in coreano… mi sono sciolto 🥹', pt: 'Seu áudio em coreano… derreti 🥹',
    ar: 'رسالتك الصوتية بالكورية… ذبت 🥹',
  }),
  ja: contenu('amour.vocal.reaction.ja', 'ja', '日本語のボイスメッセージ…とろけちゃった 🥹', {
    fr: 'Ton vocal en japonais… j’ai fondu 🥹', en: 'Your voice note in Japanese… I melted 🥹',
    es: 'Tu audio en japonés… me derretí 🥹', de: 'Deine Sprachnachricht auf Japanisch… ich schmelze dahin 🥹',
    it: 'Il tuo vocale in giapponese… mi sono sciolta 🥹', pt: 'Seu áudio em japonês… derreti 🥹',
    ar: 'رسالتك الصوتية باليابانية… ذبت 🥹',
  }),
}

const grandJour = replique('amour.grand-jour', { ko: '드디어 오늘이야!! 🥳', ja: 'ついに今日だね!! 🥳' }, {
  fr: 'C’est enfin le grand jour !! 🥳', en: 'It’s finally the day!! 🥳', es: '¡¡Por fin es el gran día!! 🥳',
  de: 'Endlich ist der große Tag da!! 🥳', it: 'Finalmente è il grande giorno!! 🥳', pt: 'Finalmente chegou o grande dia!! 🥳',
  ar: 'أخيرًا جاء اليوم الموعود!! 🥳',
})

const minutes = replique('amour.minutes', { ko: '벌써 분 단위로 세고 있어 🥹', ja: 'もう分単位で数えてる 🥹' }, {
  fr: 'Je compte les minutes 🥹', en: 'I’m counting the minutes 🥹', es: 'Estoy contando los minutos 🥹',
  de: 'Ich zähle die Minuten 🥹', it: 'Sto contando i minuti 🥹', pt: 'Tô contando os minutos 🥹',
  ar: 'أعدّ الدقائق 🥹',
})

const table = replique('amour.table', { ko: '우리 자리 예약해 뒀어… 이 꽃들도 너를 기다려 💐', ja: '二人の席、予約しておいたよ…この花たちも君を待ってる 💐' }, {
  fr: 'J’ai réservé notre table… et elles t’attendent 💐', en: 'I booked our table… and these are waiting for you 💐',
  es: 'Reservé nuestra mesa… y estas flores te esperan 💐', de: 'Ich hab unseren Tisch reserviert… und die hier warten auf dich 💐',
  it: 'Ho prenotato il nostro tavolo… e questi fiori ti aspettano 💐', pt: 'Reservei a nossa mesa… e essas flores estão te esperando 💐',
  ar: 'حجزت طاولتنا… وهذه الورود بانتظارك 💐',
})

const appel = replique('amour.appel', { ko: '빗소리 들려? 빨리 네가 여기 있었으면 좋겠다 ❤️', ja: '雨の音、聞こえる？早くここに来てほしいな ❤️' }, {
  fr: 'Tu entends la pluie ? J’ai hâte que tu sois là ❤️', en: 'Can you hear the rain? I can’t wait for you to be here ❤️',
  es: '¿Oyes la lluvia? Tengo tantas ganas de que estés aquí ❤️', de: 'Hörst du den Regen? Ich kann’s kaum erwarten, dass du hier bist ❤️',
  it: 'Senti la pioggia? Non vedo l’ora che tu sia qui ❤️', pt: 'Tá ouvindo a chuva? Não vejo a hora de você chegar ❤️',
  ar: 'هل تسمع صوت المطر؟ لا أطيق الانتظار حتى تكون هنا ❤️',
})

// Le vocal que le partenaire envoie au lecteur (vitrine #8855, scène 1) : joué dans la langue du
// lecteur, sa transcription défile. Sans marque de genre, comme les autres répliques. Trois phrases :
// la piste jouée doit durer assez pour que la photo la prenne en pleine lecture (DUREE_MIN_VOCAL_MS).
const vocalRecu = replique('amour.vocal.recu', {
  ko: '하루 종일 네 목소리가 듣고 싶었어. 오늘 밤 창밖으로 도시의 불빛을 보면서 네 생각만 했어, 우리가 함께 할 모든 것들도. 12일 뒤에 공항에서 기다릴게.',
  ja: '一日中、君の声が聞きたかった。今夜は窓から街の灯りを見ながら、君のことと、二人でやりたいことばかり考えてた。12日後、空港で待ってるね。',
}, {
  fr: 'Toute la journée, j’avais envie d’entendre ta voix. Ce soir, en regardant les lumières de la ville depuis ma fenêtre, je n’ai pensé qu’à toi et à tout ce qu’on va faire ensemble. Dans 12 jours, je t’attends à l’aéroport.',
  en: 'All day long, I wanted to hear your voice. Tonight, watching the city lights from my window, I could only think of you and everything we’ll do together. In 12 days, I’ll be waiting for you at the airport.',
  es: 'Todo el día quise oír tu voz. Esta noche, mirando las luces de la ciudad desde mi ventana, solo pensaba en ti y en todo lo que vamos a hacer juntos. En 12 días te espero en el aeropuerto.',
  de: 'Den ganzen Tag wollte ich deine Stimme hören. Heute Abend habe ich beim Blick auf die Lichter der Stadt nur an dich gedacht und an alles, was wir zusammen machen werden. In 12 Tagen warte ich am Flughafen auf dich.',
  it: 'Tutto il giorno ho voluto sentire la tua voce. Stasera, guardando le luci della città dalla finestra, ho pensato solo a te e a tutto quello che faremo insieme. Tra 12 giorni ti aspetto all’aeroporto.',
  pt: 'O dia todo eu quis ouvir a sua voz. Hoje à noite, olhando as luzes da cidade pela janela, só pensei em você e em tudo o que a gente vai fazer junto. Daqui a 12 dias te espero no aeroporto.',
  ar: 'طوال اليوم أردت أن أسمع صوتك. الليلة، وأنا أنظر إلى أضواء المدينة من نافذتي، لم أفكر إلا فيك وفي كل ما سنفعله معًا. بعد 12 يومًا سأنتظرك في المطار.',
})

// Messages écrits PAR le lecteur, accordés : une lectrice écrit à Min-jun, un lecteur à Aiko.
const miens = {
  vueDemandee: {
    fr: 'Moi aussi 🥰 Envoie-moi ta vue ce soir !', en: 'Me too 🥰 Send me your view tonight!', es: 'Yo también 🥰 ¡Mándame tu vista esta noche!',
    de: 'Ich auch 🥰 Schick mir heute Abend deine Aussicht!', it: 'Anch’io 🥰 Mandami la tua vista stasera!', pt: 'Eu também 🥰 Me manda a sua vista hoje à noite!',
    ar: 'وأنا أيضًا 🥰 أرسلي لي منظرك الليلة!',
  },
  manque: {
    fr: 'Magnifique 😍 Tu me manques tellement…', en: 'Gorgeous 😍 I miss you so much…', es: 'Preciosa 😍 Te echo muchísimo de menos…',
    de: 'Wunderschön 😍 Du fehlst mir so…', it: 'Bellissima 😍 Mi manchi tantissimo…', pt: 'Que linda 😍 Tô morrendo de saudade…',
    ar: 'رائع 😍 اشتقت إليك كثيرًا…',
  },
  dormi: {
    fr: 'J’ai à peine dormi 🙈 Trop hâte !', en: 'Barely slept 🙈 Too excited!', es: 'Casi no he dormido 🙈 ¡Qué ganas!',
    de: 'Hab kaum geschlafen 🙈 So aufgeregt!', it: 'Ho dormito pochissimo 🙈 Che emozione!', pt: 'Mal dormi 🙈 Tô muito ansioso!',
    ar: 'بالكاد نمت 🙈 متحمس جدًا!',
  },
  decolle: {
    fr: 'Je décolle ! ✈️ À ce soir ❤️', en: 'Taking off! ✈️ See you tonight ❤️', es: '¡Despego! ✈️ Nos vemos esta noche ❤️',
    de: 'Ich hebe ab! ✈️ Bis heute Abend ❤️', it: 'Decollo! ✈️ A stasera ❤️', pt: 'Decolando! ✈️ Até hoje à noite ❤️',
    ar: 'الطائرة تقلع! ✈️ أراك الليلة ❤️',
  },
  parfait: {
    fr: 'Tu es parfait 😭❤️', en: 'You’re perfect 😭❤️', es: 'Eres perfecto 😭❤️',
    de: 'Du bist perfekt 😭❤️', it: 'Sei perfetto 😭❤️', pt: 'Você é perfeita 😭❤️',
    ar: 'أنتِ رائعة 😭❤️',
  },
}

export const AMOUR = {
  repliques: [pense, vue, jours, vocalReaction, grandJour, minutes, table, appel, vocalRecu],
  pense,
  vue,
  jours,
  vocalReaction,
  grandJour,
  minutes,
  table,
  appel,
  vocalRecu,
  miens,
  // Le vocal du LECTEUR, joué dans la langue du partenaire : la piste active et sa transcription.
  vocal: { duree: '0:09', ecoule: '0:04', progression: 0.45, transcription: { ko: '사랑해. 빨리 보고 싶어.', ja: '愛してる。早く会いたい。' } },
  photos: {
    dejeuner: 'bol-ramen',
    cafe: 'cafe-coeur',
    vue: { ko: 'seoul-crepuscule', ja: 'osaka-nuit' },
    hublot: 'hublot-rose',
    table: ['diner-chandelle', 'bouquet-roses'],
    appel: 'pluie-vitre',
  },
}
