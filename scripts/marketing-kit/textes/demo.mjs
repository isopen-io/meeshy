// Contenus de démo — docs/marketing/campagne-2026-09/captures-app-store.md § 6.
// Personnes FICTIVES, majeures (18-24 ans), aucune marque : le fandom est le « Nova Club »,
// fan-club d'un groupe inventé (« Nova »). Chaque texte porte sa langue d'origine et sa
// traduction dans les sept langues de lecture : le Prisme (lib/prism.mjs) sert au lecteur
// sa langue, et un texte sans traduction fait échouer le rendu.

const profils = [
  { pseudo: 'lea.mtn', prenom: 'Léa', nom: 'Martin', ville: 'Lyon', drapeau: '🇫🇷', lang: 'fr', regional: 'en', age: 21, teinte: '6366F1' },
  { pseudo: 'minjun.p', prenom: 'Min-jun', nom: 'Park', ville: 'Séoul', drapeau: '🇰🇷', lang: 'ko', regional: 'en', age: 22, teinte: 'C1292E' },
  { pseudo: 'sofi.romero', prenom: 'Sofía', nom: 'Romero', ville: 'Madrid', drapeau: '🇪🇸', lang: 'es', regional: 'en', age: 20, teinte: 'F4A261' },
  { pseudo: 'aiko.t', prenom: 'Aiko', nom: 'Tanaka', ville: 'Osaka', drapeau: '🇯🇵', lang: 'ja', regional: 'en', age: 19, teinte: 'F28482' },
  { pseudo: 'lucas.olv', prenom: 'Lucas', nom: 'Oliveira', ville: 'São Paulo', drapeau: '🇧🇷', lang: 'pt', regional: 'es', age: 23, teinte: '00B4D8' },
  { pseudo: 'amara.d', prenom: 'Amara', nom: 'Diallo', ville: 'Dakar', drapeau: '🇸🇳', lang: 'fr', regional: 'wo', age: 20, teinte: '34D399' },
  { pseudo: 'yusuf.h', prenom: 'Yusuf', nom: 'Haddad', ville: 'Amman', drapeau: '🇯🇴', lang: 'ar', regional: 'en', age: 22, teinte: 'E9C46A' },
  { pseudo: 'jonas.wb', prenom: 'Jonas', nom: 'Weber', ville: 'Berlin', drapeau: '🇩🇪', lang: 'de', regional: 'en', age: 24, teinte: '264653' },
  { pseudo: 'giulia.r', prenom: 'Giulia', nom: 'Rossi', ville: 'Bologne', drapeau: '🇮🇹', lang: 'it', regional: 'fr', age: 21, teinte: 'E76F51' },
  { pseudo: 'kwame.m', prenom: 'Kwame', nom: 'Mensah', ville: 'Accra', drapeau: '🇬🇭', lang: 'en', regional: 'tw', age: 23, teinte: '2A9D8F' },
  { pseudo: 'priya.n', prenom: 'Priya', nom: 'Nair', ville: 'Bangalore', drapeau: '🇮🇳', lang: 'en', regional: 'hi', age: 22, teinte: 'F4845F' },
  { pseudo: 'maya.chen', prenom: 'Maya', nom: 'Chen', ville: 'Toronto', drapeau: '🇨🇦', lang: 'en', regional: 'zh', age: 18, teinte: '818CF8' },
]

const lecteurs = {
  fr: 'lea.mtn',
  en: 'maya.chen',
  es: 'sofi.romero',
  de: 'jonas.wb',
  it: 'giulia.r',
  pt: 'lucas.olv',
  ar: 'yusuf.h',
}

const villes = {
  'Séoul': { fr: 'Séoul', en: 'Seoul', es: 'Seúl', de: 'Seoul', it: 'Seul', pt: 'Seul', ar: 'سيول' },
  'Lyon': { fr: 'Lyon', en: 'Lyon', es: 'Lyon', de: 'Lyon', it: 'Lione', pt: 'Lyon', ar: 'ليون' },
  'Madrid': { fr: 'Madrid', en: 'Madrid', es: 'Madrid', de: 'Madrid', it: 'Madrid', pt: 'Madri', ar: 'مدريد' },
  'Osaka': { fr: 'Osaka', en: 'Osaka', es: 'Osaka', de: 'Osaka', it: 'Osaka', pt: 'Osaka', ar: 'أوساكا' },
  'São Paulo': { fr: 'São Paulo', en: 'São Paulo', es: 'São Paulo', de: 'São Paulo', it: 'San Paolo', pt: 'São Paulo', ar: 'ساو باولو' },
  'Dakar': { fr: 'Dakar', en: 'Dakar', es: 'Dakar', de: 'Dakar', it: 'Dakar', pt: 'Dacar', ar: 'داكار' },
  'Amman': { fr: 'Amman', en: 'Amman', es: 'Amán', de: 'Amman', it: 'Amman', pt: 'Amã', ar: 'عمّان' },
  'Berlin': { fr: 'Berlin', en: 'Berlin', es: 'Berlín', de: 'Berlin', it: 'Berlino', pt: 'Berlim', ar: 'برلين' },
  'Bologne': { fr: 'Bologne', en: 'Bologna', es: 'Bolonia', de: 'Bologna', it: 'Bologna', pt: 'Bolonha', ar: 'بولونيا' },
  'Accra': { fr: 'Accra', en: 'Accra', es: 'Acra', de: 'Accra', it: 'Accra', pt: 'Acra', ar: 'أكرا' },
  'Bangalore': { fr: 'Bangalore', en: 'Bangalore', es: 'Bangalore', de: 'Bangalore', it: 'Bangalore', pt: 'Bangalore', ar: 'بنغالور' },
  'Toronto': { fr: 'Toronto', en: 'Toronto', es: 'Toronto', de: 'Toronto', it: 'Toronto', pt: 'Toronto', ar: 'تورونتو' },
}

// Messages écrits PAR le lecteur : il les écrit dans SA langue — `parLangue` en porte les sept versions.
const miens = {
  dmCri: {
    fr: 'J’ai hurlé en voyant l’annonce 😭', en: 'I screamed when I saw the announcement 😭', es: 'Grité al ver el anuncio 😭',
    de: 'Ich hab geschrien, als ich’s gesehen hab 😭', it: 'Ho urlato quando ho visto l’annuncio 😭', pt: 'Eu gritei quando vi o anúncio 😭',
    ar: 'صرخت لما شفت الإعلان 😭',
  },
  dmBillets: {
    fr: 'Je viens de prendre les miennes 🙌', en: 'Just got mine 🙌', es: 'Acabo de pillar las mías 🙌',
    de: 'Hab meine gerade geholt 🙌', it: 'Ho appena preso i miei 🙌', pt: 'Acabei de pegar os meus 🙌',
    ar: 'للتو حجزت تذاكري 🙌',
  },
  vocal: {
    fr: 'On se voit au concert samedi ?', en: 'See you at the concert on Saturday?', es: '¿Nos vemos en el concierto el sábado?',
    de: 'Sehen wir uns Samstag beim Konzert?', it: 'Ci vediamo al concerto sabato?', pt: 'A gente se vê no show no sábado?',
    ar: 'نلتقي في الحفلة يوم السبت؟',
  },
  groupe: {
    fr: 'Je m’occupe de la playlist 🎧', en: 'I’ve got the playlist 🎧', es: 'Yo me encargo de la playlist 🎧',
    de: 'Ich mach die Playlist 🎧', it: 'Alla playlist ci penso io 🎧', pt: 'Deixa a playlist comigo 🎧',
    ar: 'أنا عليّ قائمة الأغاني 🎧',
  },
}

const contenu = (id, lang, text, translations) => ({ id, lang, text, translations })

const dm = [
  contenu('dm.annonce', 'ko', '노바가 토요일에 공연한대!! 믿겨져? 🤯', {
    fr: 'Nova joue samedi !! Tu y crois ? 🤯', en: 'Nova is playing on Saturday!! Can you believe it? 🤯',
    es: '¡¡Nova toca el sábado!! ¿Te lo puedes creer? 🤯', de: 'Nova spielt am Samstag!! Kannst du das glauben? 🤯',
    it: 'Nova suona sabato!! Ci credi? 🤯', pt: 'O Nova vai tocar no sábado!! Dá pra acreditar? 🤯',
    ar: 'نوفا ستغني يوم السبت!! هل تصدق؟ 🤯',
  }),
  contenu('dm.billets', 'ko', '토요일 공연 티켓 떴어!! 🎟️', {
    fr: 'Les billets pour samedi sont sortis !! 🎟️', en: 'Tickets for Saturday are out!! 🎟️',
    es: '¡¡Ya salieron las entradas del sábado!! 🎟️', de: 'Die Tickets für Samstag sind raus!! 🎟️',
    it: 'Sono usciti i biglietti per sabato!! 🎟️', pt: 'Saíram os ingressos de sábado!! 🎟️',
    ar: 'نزلت تذاكر حفلة السبت!! 🎟️',
  }),
  contenu('dm.section', 'ko', '우리 같은 구역이야? 🤩', {
    fr: 'On est dans la même section ? 🤩', en: 'Are we in the same section? 🤩',
    es: '¿Estamos en la misma zona? 🤩', de: 'Sind wir im selben Block? 🤩',
    it: 'Siamo nello stesso settore? 🤩', pt: 'A gente tá no mesmo setor? 🤩',
    ar: 'هل نحن في نفس القسم؟ 🤩',
  }),
  contenu('dm.reponse', 'ko', '완전 좋아! 한국어 음성 너무 귀여워 😂 토요일에 봐!', {
    fr: 'Carrément ! Ton vocal en coréen est trop mignon 😂 À samedi !',
    en: 'Totally! Your voice note in Korean is so cute 😂 See you Saturday!',
    es: '¡Claro! Tu audio en coreano es monísimo 😂 ¡Nos vemos el sábado!',
    de: 'Auf jeden Fall! Deine Sprachnachricht auf Koreanisch ist so süß 😂 Bis Samstag!',
    it: 'Certo! Il tuo vocale in coreano è troppo carino 😂 A sabato!',
    pt: 'Com certeza! Seu áudio em coreano ficou fofo demais 😂 Até sábado!',
    ar: 'أكيد! رسالتك الصوتية بالكورية لطيفة جدًا 😂 نلتقي السبت!',
  }),
]

const vocalCoreen = '토요일에 콘서트에서 볼까?'

const groupe = [
  { auteur: 'sofi.romero', ...contenu('nova.heure', 'es', '¿Alguien sabe a qué hora empieza el directo? 🕖', {
    fr: 'Quelqu’un sait à quelle heure commence le live ? 🕖', en: 'Anyone know what time the livestream starts? 🕖',
    de: 'Weiß jemand, wann der Livestream anfängt? 🕖', it: 'Qualcuno sa a che ora inizia la diretta? 🕖',
    pt: 'Alguém sabe que horas começa a live? 🕖', ar: 'هل يعرف أحد متى يبدأ البث المباشر؟ 🕖',
  }) },
  { auteur: 'minjun.p', ...contenu('nova.concert', 'ko', '내일 콘서트 같이 볼 사람?', {
    fr: 'Qui regarde le concert avec moi demain ?', en: 'Who’s watching the concert with me tomorrow?',
    es: '¿Quién ve el concierto conmigo mañana?', de: 'Wer schaut morgen mit mir das Konzert?',
    it: 'Chi guarda il concerto con me domani?', pt: 'Quem vai ver o show comigo amanhã?',
    ar: 'مين سيشاهد الحفلة معي غدًا؟',
  }), reactions: '🔥 3' },
  { auteur: 'sofi.romero', ...contenu('nova.pancarte', 'es', '¡Yo! Llevo la pancarta 🙌', {
    fr: 'Moi ! J’apporte la banderole 🙌', en: 'Me! I’ll bring the banner 🙌',
    de: 'Ich! Ich bring das Banner mit 🙌', it: 'Io! Porto lo striscione 🙌',
    pt: 'Eu! Levo a faixa 🙌', ar: 'أنا! سأحضر اللافتة 🙌',
  }) },
  { auteur: 'aiko.t', ...contenu('nova.decalage', 'ja', '私も！時差は気にしない 😂', {
    fr: 'Moi aussi ! Le décalage horaire, on s’en fiche 😂', en: 'Me too! Who cares about the time difference 😂',
    es: '¡Yo también! La diferencia horaria da igual 😂', de: 'Ich auch! Zeitverschiebung ist mir egal 😂',
    it: 'Anch’io! Il fuso orario non conta 😂', pt: 'Eu também! Fuso horário não importa 😂',
    ar: 'وأنا أيضًا! فرق التوقيت لا يهم 😂',
  }) },
  { auteur: 'lea.mtn', ...contenu('nova.stickers', 'fr', 'Je fais les stickers pour tout le monde ✨', {
    en: 'I’m making stickers for everyone ✨', es: 'Yo hago los stickers para todos ✨',
    de: 'Ich mach Sticker für alle ✨', it: 'Faccio io gli sticker per tutti ✨',
    pt: 'Eu faço os stickers pra todo mundo ✨', ar: 'سأصمم الملصقات للجميع ✨',
  }) },
  { auteur: 'minjun.p', ...contenu('nova.rdv', 'ko', '좋아! 내일 저녁 7시에 여기 모이자 🎉', {
    fr: 'Parfait ! On se retrouve ici demain à 19 h 🎉', en: 'Perfect! Let’s meet here tomorrow at 7 pm 🎉',
    es: '¡Perfecto! Quedamos aquí mañana a las 19 h 🎉', de: 'Perfekt! Wir treffen uns morgen um 19 Uhr hier 🎉',
    it: 'Perfetto! Ci troviamo qui domani alle 19 🎉', pt: 'Perfeito! A gente se encontra aqui amanhã às 19h 🎉',
    ar: 'ممتاز! نلتقي هنا غدًا الساعة السابعة مساءً 🎉',
  }), reactions: '🎉 4' },
  { auteur: 'aiko.t', ...contenu('nova.aiko2', 'ja', 'ステッカー楽しみ！💜', {
    fr: 'Trop hâte de voir les stickers ! 💜', en: 'Can’t wait for the stickers! 💜',
    es: '¡Qué ganas de ver los stickers! 💜', de: 'Freu mich so auf die Sticker! 💜',
    it: 'Non vedo l’ora di vedere gli sticker! 💜', pt: 'Doida pra ver os stickers! 💜',
    ar: 'متحمسة جدًا لرؤية الملصقات! 💜',
  }) },
]

const global = [
  { type: 'arrivee', auteur: 'amara.d' },
  { auteur: 'amara.d', ...contenu('global.amara', 'fr', 'Salut tout le monde 👋 Bonjour de Dakar !', {
    en: 'Hi everyone 👋 Hello from Dakar!', es: '¡Hola a todos 👋 Saludos desde Dakar!',
    de: 'Hallo zusammen 👋 Grüße aus Dakar!', it: 'Ciao a tutti 👋 Un saluto da Dakar!',
    pt: 'Oi, pessoal 👋 Um salve de Dacar!', ar: 'مرحبًا بالجميع 👋 تحياتي من داكار!',
  }) },
  { type: 'arrivee', auteur: 'kwame.m' },
  { auteur: 'kwame.m', ...contenu('global.kwame', 'en', 'Hello from Accra 👋 Who else just landed here?', {
    fr: 'Salut depuis Accra 👋 Qui d’autre vient d’arriver ?', es: '¡Hola desde Acra 👋 ¿Quién más acaba de llegar?',
    de: 'Hallo aus Accra 👋 Wer ist noch neu hier?', it: 'Ciao da Accra 👋 Chi altro è appena arrivato?',
    pt: 'Oi de Acra 👋 Quem mais acabou de chegar?', ar: 'مرحبًا من أكرا 👋 مين وصل هنا للتو أيضًا؟',
  }) },
  { auteur: 'aiko.t', ...contenu('global.aiko', 'ja', 'みんなこんにちは！大阪から🌸', {
    fr: 'Coucou tout le monde ! Depuis Osaka 🌸', en: 'Hi everyone! From Osaka 🌸',
    es: '¡Hola a todos! Desde Osaka 🌸', de: 'Hallo alle! Aus Osaka 🌸',
    it: 'Ciao a tutti! Da Osaka 🌸', pt: 'Oi, gente! De Osaka 🌸', ar: 'مرحبًا يا جماعة! من أوساكا 🌸',
  }) },
  { type: 'arrivee', auteur: 'yusuf.h' },
  { auteur: 'yusuf.h', ...contenu('global.yusuf', 'ar', 'مرحبًا بالجميع! تحياتي من عمّان ☀️', {
    fr: 'Bonjour à tous ! Salutations d’Amman ☀️', en: 'Hello everyone! Greetings from Amman ☀️',
    es: '¡Hola a todos! Saludos desde Amán ☀️', de: 'Hallo zusammen! Grüße aus Amman ☀️',
    it: 'Ciao a tutti! Saluti da Amman ☀️', pt: 'Olá a todos! Saudações de Amã ☀️',
  }) },
  { auteur: 'lucas.olv', ...contenu('global.lucas', 'pt', 'Oi gente! Alguém de São Paulo? 🇧🇷', {
    fr: 'Salut ! Quelqu’un de São Paulo ? 🇧🇷', en: 'Hey all! Anyone from São Paulo? 🇧🇷',
    es: '¡Hola! ¿Alguien de São Paulo? 🇧🇷', de: 'Hey Leute! Jemand aus São Paulo? 🇧🇷',
    it: 'Ciao! Qualcuno di San Paolo? 🇧🇷', ar: 'أهلًا يا جماعة! أحد من ساو باولو؟ 🇧🇷',
  }) },
  { type: 'arrivee', auteur: 'priya.n' },
  { auteur: 'priya.n', ...contenu('global.priya', 'hi', 'नमस्ते सबको! बैंगलोर से 🙏', {
    fr: 'Bonjour à tous ! Depuis Bangalore 🙏', en: 'Hello everyone! From Bangalore 🙏',
    es: '¡Hola a todos! Desde Bangalore 🙏', de: 'Hallo zusammen! Aus Bangalore 🙏',
    it: 'Ciao a tutti! Da Bangalore 🙏', pt: 'Olá, pessoal! De Bangalore 🙏', ar: 'مرحبًا بالجميع! من بنغالور 🙏',
  }) },
  { auteur: 'minjun.p', ...contenu('global.minjun', 'ko', '안녕하세요! 서울에서 인사드려요 👋', {
    fr: 'Salut ! Un grand bonjour de Séoul 👋', en: 'Hi! Big hello from Seoul 👋',
    es: '¡Hola! Un saludo enorme desde Seúl 👋', de: 'Hi! Liebe Grüße aus Seoul 👋',
    it: 'Ciao! Un saluto da Seul 👋', pt: 'Oi! Um salve de Seul 👋', ar: 'أهلًا! تحية كبيرة من سيول 👋',
  }) },
]

const posts = [
  {
    auteur: 'aiko.t', photo: 'coucher-osaka', likes: 312, commentaires: 24,
    ...contenu('post.aiko', 'ja', '大阪の夕焼け、最高すぎる🌇 みんなの街の夕日も見せて！', {
      fr: 'Le coucher de soleil à Osaka, c’est trop beau 🌇 Montrez-moi celui de votre ville !',
      en: 'Osaka sunsets hit different 🌇 Show me the one in your city!',
      es: 'El atardecer en Osaka es lo más 🌇 ¡Enseñadme el de vuestra ciudad!',
      de: 'Sonnenuntergang in Osaka, einfach zu schön 🌇 Zeigt mir euren!',
      it: 'Il tramonto a Osaka è troppo bello 🌇 Fatemi vedere quello della vostra città!',
      pt: 'O pôr do sol em Osaka é demais 🌇 Me mostrem o da cidade de vocês!',
      ar: 'غروب الشمس في أوساكا رائع جدًا 🌇 أروني غروب مدينتكم!',
    }),
    apercu: [
      { auteur: 'lucas.olv', ...contenu('post.aiko.c1', 'pt', 'Que lindo! Aqui em SP tá chovendo 😅', {
        fr: 'Trop beau ! Ici à São Paulo il pleut 😅', en: 'So pretty! It’s raining here in São Paulo 😅',
        es: '¡Qué bonito! Aquí en São Paulo está lloviendo 😅', de: 'So schön! Hier in São Paulo regnet’s 😅',
        it: 'Che bello! Qui a San Paolo piove 😅', ar: 'جميل جدًا! هنا في ساو باولو تمطر 😅',
      }) },
      { auteur: 'giulia.r', ...contenu('post.aiko.c2', 'it', 'Bologna ti risponde con un tramonto rosa 💗', {
        fr: 'Bologne te répond avec un coucher de soleil rose 💗', en: 'Bologna answers with a pink sunset 💗',
        es: 'Bolonia te responde con un atardecer rosa 💗', de: 'Bologna antwortet mit einem rosa Sonnenuntergang 💗',
        pt: 'Bolonha responde com um pôr do sol rosa 💗', ar: 'بولونيا ترد عليك بغروب وردي 💗',
      }) },
    ],
  },
  {
    auteur: 'kwame.m', likes: 128, commentaires: 17,
    ...contenu('post.kwame', 'en', 'First week here: new friends in Seoul, Madrid and Lyon. Who’s next? 🌍', {
      fr: 'Première semaine ici : de nouveaux amis à Séoul, Madrid et Lyon. À qui le tour ? 🌍',
      es: 'Primera semana aquí: amigos nuevos en Seúl, Madrid y Lyon. ¿Quién sigue? 🌍',
      de: 'Erste Woche hier: neue Freunde in Seoul, Madrid und Lyon. Wer ist der Nächste? 🌍',
      it: 'Prima settimana qui: nuovi amici a Seul, Madrid e Lione. Chi è il prossimo? 🌍',
      pt: 'Primeira semana aqui: amigos novos em Seul, Madri e Lyon. Quem é o próximo? 🌍',
      ar: 'أول أسبوع هنا: أصدقاء جدد في سيول ومدريد وليون. مين التالي؟ 🌍',
    }),
  },
]

const story = [
  { auteur: 'lucas.olv', fond: 'paulista', ...contenu('story.lucas', 'pt', 'Pôr do sol na Paulista 🧡 Quem vem no sábado?', {
    fr: 'Coucher de soleil sur la Paulista 🧡 Qui vient samedi ?', en: 'Sunset on Paulista 🧡 Who’s coming Saturday?',
    es: 'Atardecer en la Paulista 🧡 ¿Quién viene el sábado?', de: 'Sonnenuntergang auf der Paulista 🧡 Wer kommt Samstag?',
    it: 'Tramonto sulla Paulista 🧡 Chi viene sabato?', ar: 'غروب الشمس في شارع باوليستا 🧡 مين جاي السبت؟',
  }) },
  { auteur: 'sofi.romero', fond: 'madrid', ...contenu('story.sofia', 'es', 'Ensayo de la coreo para el sábado 💃', {
    fr: 'Répétition de la choré pour samedi 💃', en: 'Rehearsing the dance for Saturday 💃',
    de: 'Probe der Choreo für Samstag 💃', it: 'Prove della coreografia per sabato 💃',
    pt: 'Ensaio da coreografia pra sábado 💃', ar: 'تمرين الرقصة ليوم السبت 💃',
  }) },
]

const appel = contenu('appel.minjun', 'ko', '거기 비 와? 서울은 벌써 추워 🥶', {
  fr: 'Il pleut chez toi ? À Séoul il fait déjà froid 🥶', en: 'Is it raining there? It’s already cold in Seoul 🥶',
  es: '¿Llueve ahí? En Seúl ya hace frío 🥶', de: 'Regnet’s bei dir? In Seoul ist es schon kalt 🥶',
  it: 'Piove lì? A Seul fa già freddo 🥶', pt: 'Tá chovendo aí? Em Seul já tá frio 🥶',
  ar: 'هل تمطر عندك؟ الجو بارد في سيول من الآن 🥶',
})

const bios = {
  'kwame.m': contenu('bio.kwame', 'en', 'Afrobeats, football and bad puns', {
    fr: 'Afrobeats, foot et mauvais jeux de mots', es: 'Afrobeats, fútbol y chistes malos',
    de: 'Afrobeats, Fußball und schlechte Wortwitze', it: 'Afrobeats, calcio e battute pessime',
    pt: 'Afrobeats, futebol e trocadilhos ruins', ar: 'أفروبيتس وكرة القدم ونكات سيئة',
  }),
  'giulia.r': contenu('bio.giulia', 'it', 'Illustratrice, fan del Nova Club dal primo giorno', {
    fr: 'Illustratrice, fan du Nova Club depuis le premier jour', en: 'Illustrator, Nova Club fan since day one',
    es: 'Ilustradora, fan del Nova Club desde el primer día', de: 'Illustratorin, Nova-Club-Fan seit Tag eins',
    pt: 'Ilustradora, fã do Nova Club desde o primeiro dia', ar: 'رسّامة، من معجبي Nova Club منذ اليوم الأول',
  }),
  'lucas.olv': contenu('bio.lucas', 'pt', 'Fotografia de rua e pão de queijo', {
    fr: 'Photo de rue et pão de queijo', en: 'Street photography and pão de queijo',
    es: 'Fotografía callejera y pão de queijo', de: 'Streetfotografie und Pão de Queijo',
    it: 'Fotografia di strada e pão de queijo', ar: 'تصوير الشوارع وخبز الجبن البرازيلي',
  }),
  'priya.n': contenu('bio.priya', 'en', 'Coding by day, dancing by night', {
    fr: 'Le code le jour, la danse la nuit', es: 'Programo de día, bailo de noche',
    de: 'Tagsüber Code, nachts Tanz', it: 'Di giorno programmo, di notte ballo',
    pt: 'Programo de dia, danço à noite', ar: 'برمجة في النهار ورقص في الليل',
  }),
  'jonas.wb': contenu('bio.jonas', 'de', 'Techno, Kaffee und Sprachen lernen', {
    fr: 'Techno, café et apprendre des langues', en: 'Techno, coffee and learning languages',
    es: 'Techno, café y aprender idiomas', it: 'Techno, caffè e imparare lingue',
    pt: 'Techno, café e aprender idiomas', ar: 'تكنو وقهوة وتعلّم اللغات',
  }),
  'maya.chen': contenu('bio.maya', 'en', 'Film student, always hungry', {
    fr: 'Étudiante en cinéma, toujours affamée', es: 'Estudiante de cine, siempre con hambre',
    de: 'Filmstudentin, immer hungrig', it: 'Studentessa di cinema, sempre affamata',
    pt: 'Estudante de cinema, sempre com fome', ar: 'طالبة سينما وجائعة دائمًا',
  }),
  'amara.d': contenu('bio.amara', 'fr', 'Danse, mode et thiéboudienne', {
    en: 'Dance, fashion and thieboudienne', es: 'Baile, moda y thieboudienne',
    de: 'Tanz, Mode und Thieboudienne', it: 'Danza, moda e thieboudienne',
    pt: 'Dança, moda e thieboudienne', ar: 'رقص وموضة وطبق تشيبوديان',
  }),
  'aiko.t': contenu('bio.aiko', 'ja', '写真と夕焼けが好き', {
    fr: 'J’aime la photo et les couchers de soleil', en: 'I love photos and sunsets',
    es: 'Me encantan las fotos y los atardeceres', de: 'Ich liebe Fotos und Sonnenuntergänge',
    it: 'Amo le foto e i tramonti', pt: 'Amo fotos e pores do sol', ar: 'أحب التصوير وغروب الشمس',
  }),
}

const progression = {
  niveau: 7,
  points: 486,
  pointsAvantNiveau: 64,
  meesh: 340,
  meeshFrappees: 352,
  meeshProgression: 0.62,
  meeshManquants: 38,
  serie: 12,
  record: 21,
  serieJalon: 14,
  elan: 3,
  elanFamilles: ['conversation', 'content', 'social'],
  elanFenetre: 7,
  dernierSucces: { cle: 'three_conversation_kinds', date: '2026-09-23' },
  badges: [9, 36],
  succes: [4, 5],
  revelation: { axe: 'social.friendship', seuil: 10 },
}

const lienInvitation = {
  groupe: 'Nova Club 🌍',
  identifiant: 'nova-club',
  url: 'meeshy.me/l/nova-club',
  clics: 1284,
  arrivees: 412,
  sansCompte: 157,
  langues: [['fr', 29], ['es', 21], ['ko', 18], ['ja', 14], ['pt', 11], ['ar', 7]],
  cree: '2026-09-02',
}

const contenus = () => [
  ...dm,
  ...groupe,
  ...global.filter((ligne) => ligne.id),
  ...posts.flatMap((p) => [p, ...(p.apercu ?? [])]),
  ...story,
  appel,
  ...Object.values(bios),
]

export const DEMO = {
  profils,
  lecteurs,
  villes,
  miens,
  dm,
  vocalCoreen,
  groupe,
  global,
  posts,
  story,
  appel,
  bios,
  progression,
  lienInvitation,
  contenus,
}

export const profilDe = (pseudo) => {
  const profil = profils.find((p) => p.pseudo === pseudo)
  if (!profil) throw new Error(`profil inconnu : ${pseudo}`)
  return profil
}

export const lecteurDe = (lang) => profilDe(lecteurs[lang])
