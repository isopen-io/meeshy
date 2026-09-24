// Carrousels 4:5 (§ 2), visuels X / Threads (§ 3), miniatures YouTube (§ 4) et libellés
// du kit social — contenu-par-format.md. Aucune valeur monétaire, aucun don de Meesh, aucune
// marque tierce, « 76 langues traduisibles » seulement (stratégie § 2).
import { t } from './langues.mjs'

export const CARROUSELS = {
  C1: [
    t('Tu écris dans ta langue.', 'You type in your language.', 'Escribes en tu idioma.', 'Du schreibst in deiner Sprache.', 'Scrivi nella tua lingua.', 'Você escreve na sua língua.', 'تكتب بلغتك.'),
    t('Il lit dans la sienne.', 'He reads it in his.', 'Él lo lee en el suyo.', 'Er liest es in seiner.', 'Lui legge nella sua.', 'Ele lê na dele.', 'وهو يقرأ بلغته.'),
    t('Tu parles. Il t’entend dans sa langue.', 'You talk. He hears you in his language.', 'Hablas. Él te oye en su idioma.', 'Du sprichst. Er hört dich in seiner Sprache.', 'Parli. Lui ti sente nella sua lingua.', 'Você fala. Ele te ouve na língua dele.', 'تتكلم. وهو يسمعك بلغته.'),
    t(
      'Avec une voix qui ressemble à la tienne (si tu l’actives).',
      'In a voice that sounds like yours (if you turn it on).',
      'Con una voz que se parece a la tuya (si la activas).',
      'Mit einer Stimme, die wie deine klingt (wenn du willst).',
      'Con una voce che somiglia alla tua (se la attivi).',
      'Com uma voz parecida com a sua (se você ativar).',
      'بصوت يشبه صوتك (إذا فعّلته).',
    ),
    t('76 langues traduisibles.', '76 translatable languages.', '76 idiomas traducibles.', '76 übersetzbare Sprachen.', '76 lingue traducibili.', '76 línguas traduzíveis.', '76 لغة قابلة للترجمة.'),
    t('Le monde entier devient ton groupe.', 'The whole world becomes your group.', 'El mundo entero se vuelve tu grupo.', 'Die ganze Welt wird deine Gruppe.', 'Il mondo intero diventa il tuo gruppo.', 'O mundo inteiro vira o seu grupo.', 'العالم كله يصبح مجموعتك.'),
  ],
  C2: [
    t('Jour 1. Tu arrives dans Meeshy Global.', 'Day 1. You land in Meeshy Global.', 'Día 1. Llegas a Meeshy Global.', 'Tag 1. Du landest in Meeshy Global.', 'Giorno 1. Arrivi in Meeshy Global.', 'Dia 1. Você chega no Meeshy Global.', 'اليوم 1. تصل إلى Meeshy Global.'),
    t('Tu dis bonjour. Sans pression.', 'You say hi. No pressure.', 'Saludas. Sin presión.', 'Du sagst Hallo. Ganz entspannt.', 'Saluti. Senza pressione.', 'Você diz oi. Sem pressão.', 'تقول مرحبًا. بلا ضغط.'),
    t('Le monde répond. Dans ta langue.', 'The world replies. In your language.', 'El mundo responde. En tu idioma.', 'Die Welt antwortet. In deiner Sprache.', 'Il mondo risponde. Nella tua lingua.', 'O mundo responde. Na sua língua.', 'العالم يرد. بلغتك.'),
    t('Ton premier succès se révèle.', 'Your first achievement unlocks.', 'Tu primer logro se revela.', 'Dein erster Erfolg erscheint.', 'Il tuo primo traguardo si svela.', 'Sua primeira conquista aparece.', 'أول إنجاز لك يظهر.'),
    t('Ta série commence.', 'Your streak begins.', 'Tu racha empieza.', 'Deine Serie beginnt.', 'La tua serie comincia.', 'Sua sequência começa.', 'سلسلتك تبدأ.'),
    t('À demain ?', 'See you tomorrow?', '¿Hasta mañana?', 'Bis morgen?', 'A domani?', 'Até amanhã?', 'نلتقي غدًا؟'),
  ],
  C3: [
    t('5 façons de se faire des amis à l’étranger', '5 ways to make friends abroad', '5 formas de hacer amigos en el extranjero', '5 Wege, Freunde im Ausland zu finden', '5 modi per farsi amici all’estero', '5 jeitos de fazer amigos lá fora', '5 طرق لتكوين أصدقاء في الخارج'),
    t('Dire bonjour dans Global', 'Say hi in Global', 'Saluda en Global', 'Sag Hallo in Global', 'Saluta in Global', 'Diga oi no Global', 'قل مرحبًا في Global'),
    t('Poster une story de ta ville', 'Post a story of your city', 'Publica una story de tu ciudad', 'Poste eine Story aus deiner Stadt', 'Posta una storia della tua città', 'Poste um story da sua cidade', 'انشر قصة من مدينتك'),
    t('Commenter en vocal', 'Comment with a voice note', 'Comenta con un audio', 'Kommentiere per Sprachnachricht', 'Commenta con un vocale', 'Comente com um áudio', 'علّق برسالة صوتية'),
    t('Rejoindre une communauté de ton fandom', 'Join a community for your fandom', 'Únete a una comunidad de tu fandom', 'Tritt einer Community deines Fandoms bei', 'Entra in una community del tuo fandom', 'Entre numa comunidade do seu fandom', 'انضم إلى مجتمع معجبين يشبهك'),
    t('Partager ton lien : pas besoin de compte pour entrer', 'Share your link: no account needed to join', 'Comparte tu enlace: no hace falta cuenta', 'Teile deinen Link: Kein Konto nötig', 'Condividi il tuo link: niente account per entrare', 'Compartilhe seu link: não precisa de conta', 'شارك رابطك: لا حاجة لحساب للدخول'),
    t('Lequel tu testes en premier ?', 'Which one will you try first?', '¿Cuál pruebas primero?', 'Was probierst du zuerst?', 'Quale provi per primo?', 'Qual você testa primeiro?', 'أيّها ستجرب أولًا؟'),
  ],
  C4: [
    t('Chaque conversation compte.', 'Every conversation counts.', 'Cada conversación cuenta.', 'Jedes Gespräch zählt.', 'Ogni conversazione conta.', 'Cada conversa conta.', 'كل محادثة لها قيمة.'),
    t('Séries : combien de jours d’affilée ?', 'Streaks: how many days in a row?', 'Rachas: ¿cuántos días seguidos?', 'Serien: wie viele Tage am Stück?', 'Serie: quanti giorni di fila?', 'Sequências: quantos dias seguidos?', 'السلاسل: كم يومًا متتاليًا؟'),
    t('Badges : vocaux, stories, amitiés nouées.', 'Badges: voice notes, stories, new friends.', 'Insignias: audios, stories, amistades.', 'Abzeichen: Sprachnachrichten, Stories, Freundschaften.', 'Badge: vocali, storie, amicizie nate.', 'Emblemas: áudios, stories, amizades.', 'الشارات: رسائل صوتية وقصص وصداقات.'),
    t('Succès cachés : ils se révèlent quand tu les atteins.', 'Hidden achievements: they show up when you reach them.', 'Logros ocultos: aparecen cuando los alcanzas.', 'Versteckte Erfolge: Sie erscheinen, wenn du sie erreichst.', 'Traguardi nascosti: si svelano quando li raggiungi.', 'Conquistas ocultas: aparecem quando você chega lá.', 'إنجازات مخفية: تظهر عندما تبلغها.'),
    t('Meesh : frappe-les avec tes points.', 'Meesh: mint them with your points.', 'Meesh: acúñalos con tus puntos.', 'Meesh: Präge sie mit deinen Punkten.', 'Meesh: coniali con i tuoi punti.', 'Meesh: cunhe com seus pontos.', 'Meesh: اسكّها بنقاطك.'),
    t('Montre ta série en story.', 'Show your streak in a story.', 'Enseña tu racha en una story.', 'Zeig deine Serie in einer Story.', 'Mostra la tua serie in una storia.', 'Mostre sua sequência num story.', 'اعرض سلسلتك في قصة.'),
  ],
}

export const CARROUSEL_TITRES = {
  C1: t('Comment Meeshy marche', 'How Meeshy works', 'Cómo funciona Meeshy', 'So funktioniert Meeshy', 'Come funziona Meeshy', 'Como o Meeshy funciona', 'كيف يعمل Meeshy'),
  C2: t('Ton premier jour', 'Your first day', 'Tu primer día', 'Dein erster Tag', 'Il tuo primo giorno', 'Seu primeiro dia', 'يومك الأول'),
  C3: t('5 façons de se faire des amis', '5 ways to make friends', '5 formas de hacer amigos', '5 Wege zu neuen Freunden', '5 modi per farsi amici', '5 jeitos de fazer amigos', '5 طرق لتكوين أصدقاء'),
  C4: t('Ce que tes Meesh racontent', 'What your Meesh say', 'Lo que cuentan tus Meesh', 'Was deine Meesh erzählen', 'Cosa raccontano i tuoi Meesh', 'O que seus Meesh contam', 'ما تحكيه عملات Meesh'),
}

// X / Threads : le titre posé SUR le visuel, et le texte du post qui l'accompagne (§ 3).
export const ANNONCES = {
  X1: {
    titre: t('Ta voix. Leur langue.', 'Your voice. Their language.', 'Tu voz. Su idioma.', 'Deine Stimme. Ihre Sprache.', 'La tua voce. La loro lingua.', 'Sua voz. A língua deles.', 'صوتك. بلغتهم.'),
    post: t(
      'Tu envoies un vocal en français. Ton ami à Séoul l’écoute en coréen, avec une voix qui ressemble à la tienne si tu l’actives. Meeshy est disponible.',
      'You send a voice note in English. Your friend in Seoul hears it in Korean, in a voice that sounds like yours if you turn it on. Meeshy is out now.',
      'Mandas un audio en español. Tu amigo en Seúl lo escucha en coreano, con una voz que se parece a la tuya si la activas. Meeshy ya está disponible.',
      'Du schickst eine Sprachnachricht auf Deutsch. Dein Freund in Seoul hört sie auf Koreanisch, mit einer Stimme, die wie deine klingt, wenn du das aktivierst. Meeshy ist da.',
      'Mandi un vocale in italiano. Il tuo amico a Seul lo ascolta in coreano, con una voce che somiglia alla tua se la attivi. Meeshy è disponibile.',
      'Você manda um áudio em português. Seu amigo em Seul ouve em coreano, com uma voz parecida com a sua se você ativar. O Meeshy já está disponível.',
      'ترسل رسالة صوتية بالعربية. صديقك في سيول يسمعها بالكورية، بصوت يشبه صوتك إذا فعّلته. Meeshy متاح الآن.',
    ),
  },
  X2: {
    titre: t('4 pays, 4 langues, un seul groupe.', '4 countries, 4 languages, one group.', '4 países, 4 idiomas, un solo grupo.', '4 Länder, 4 Sprachen, eine Gruppe.', '4 paesi, 4 lingue, un solo gruppo.', '4 países, 4 línguas, um só grupo.', '4 بلدان، 4 لغات، مجموعة واحدة.'),
    post: t(
      '4 pays, 4 langues, un seul groupe. Chacun écrit dans la sienne, tout le monde se comprend.',
      '4 countries, 4 languages, one group. Everyone writes in their own, everyone gets it.',
      '4 países, 4 idiomas, un solo grupo. Cada uno escribe en el suyo y todos se entienden.',
      '4 Länder, 4 Sprachen, eine Gruppe. Jeder schreibt in seiner, alle verstehen sich.',
      '4 paesi, 4 lingue, un solo gruppo. Ognuno scrive nella sua, tutti si capiscono.',
      '4 países, 4 línguas, um só grupo. Cada um escreve na sua, todo mundo se entende.',
      '4 بلدان، 4 لغات، مجموعة واحدة. كل واحد يكتب بلغته، والكل يفهم.',
    ),
  },
  X3: {
    titre: t('Dis bonjour au monde entier.', 'Say hi to the whole world.', 'Saluda al mundo entero.', 'Sag der ganzen Welt Hallo.', 'Saluta il mondo intero.', 'Diga oi pro mundo inteiro.', 'قل مرحبًا للعالم كله.'),
    post: t(
      'Chaque nouveau compte arrive dans Meeshy Global. Dis bonjour au monde entier, il te répond dans ta langue.',
      'Every new account lands in Meeshy Global. Say hi to the whole world, it answers in your language.',
      'Cada cuenta nueva llega a Meeshy Global. Saluda al mundo entero y te responde en tu idioma.',
      'Jedes neue Konto landet in Meeshy Global. Sag der ganzen Welt Hallo, sie antwortet in deiner Sprache.',
      'Ogni nuovo account arriva in Meeshy Global. Saluta il mondo intero, ti risponde nella tua lingua.',
      'Toda conta nova chega no Meeshy Global. Diga oi pro mundo inteiro, ele responde na sua língua.',
      'كل حساب جديد يصل إلى Meeshy Global. قل مرحبًا للعالم كله، وسيرد عليك بلغتك.',
    ),
  },
  X4: {
    titre: t('76 langues traduisibles.', '76 translatable languages.', '76 idiomas traducibles.', '76 übersetzbare Sprachen.', '76 lingue traducibili.', '76 línguas traduzíveis.', '76 لغة قابلة للترجمة.'),
    sous: t('Ta langue compte.', 'Your language counts.', 'Tu idioma cuenta.', 'Deine Sprache zählt.', 'La tua lingua conta.', 'Sua língua conta.', 'لغتك لها مكان.'),
    post: t(
      '76 langues traduisibles, dont lingala, wolof, bambara, twi, swahili. Ta langue compte.',
      '76 translatable languages, including Lingala, Wolof, Bambara, Twi and Swahili. Your language counts.',
      '76 idiomas traducibles, entre ellos lingala, wolof, bambara, twi y suajili. Tu idioma cuenta.',
      '76 übersetzbare Sprachen, darunter Lingala, Wolof, Bambara, Twi und Swahili. Deine Sprache zählt.',
      '76 lingue traducibili, tra cui lingala, wolof, bambara, twi e swahili. La tua lingua conta.',
      '76 línguas traduzíveis, incluindo lingala, wolof, bambara, twi e suaíli. Sua língua conta.',
      '76 لغة قابلة للترجمة، منها اللينغالا والولوف والبامبارا والتوي والسواحيلية. لغتك لها مكان.',
    ),
  },
  X5: {
    titre: t('Jour 1 ou jour 100 ?', 'Day 1 or day 100?', '¿Día 1 o día 100?', 'Tag 1 oder Tag 100?', 'Giorno 1 o giorno 100?', 'Dia 1 ou dia 100?', 'اليوم 1 أم اليوم 100؟'),
    post: t(
      'Jour 1 ou jour 100 ? Montre ta série en réponse.',
      'Day 1 or day 100? Show your streak in the replies.',
      '¿Día 1 o día 100? Enseña tu racha en las respuestas.',
      'Tag 1 oder Tag 100? Zeig deine Serie in den Antworten.',
      'Giorno 1 o giorno 100? Mostra la tua serie nelle risposte.',
      'Dia 1 ou dia 100? Mostra sua sequência nas respostas.',
      'اليوم 1 أم اليوم 100؟ اعرض سلسلتك في الردود.',
    ),
  },
  X6: {
    titre: t('Appelle Séoul. Lis chaque mot.', 'Call Seoul. Read every word.', 'Llama a Seúl. Lee cada palabra.', 'Ruf Seoul an. Lies jedes Wort.', 'Chiama Seul. Leggi ogni parola.', 'Ligue para Seul. Leia cada palavra.', 'اتصل بسيول. واقرأ كل كلمة.'),
    post: t(
      'Appelle quelqu’un qui ne parle pas ta langue. Les sous-titres traduits suivent en direct.',
      'Call someone who doesn’t speak your language. Translated captions follow live.',
      'Llama a alguien que no habla tu idioma. Los subtítulos traducidos siguen en directo.',
      'Ruf jemanden an, der deine Sprache nicht spricht. Übersetzte Untertitel laufen live mit.',
      'Chiama qualcuno che non parla la tua lingua. I sottotitoli tradotti seguono in diretta.',
      'Ligue para alguém que não fala sua língua. As legendas traduzidas acompanham ao vivo.',
      'اتصل بشخص لا يتكلم لغتك. الترجمة النصية تتبع المكالمة مباشرة.',
    ),
  },
}

export const THREADS_QUESTION = t(
  'Tu parlerais à qui en premier ?',
  'Who would you talk to first?',
  '¿Con quién hablarías primero?',
  'Mit wem würdest du zuerst reden?',
  'Con chi parleresti per primo?',
  'Com quem você falaria primeiro?',
  'مع من ستتحدث أولًا؟',
)

export const YOUTUBE = {
  Y1: {
    titre: t(
      '7 jours à ne parler QUE français à des Coréens',
      '7 days speaking ONLY English to Koreans',
      '7 días hablando SOLO español con coreanos',
      '7 Tage NUR Deutsch mit Koreanern',
      '7 giorni a parlare SOLO italiano con dei coreani',
      '7 dias falando SÓ português com coreanos',
      '7 أيام لا أتكلم فيها إلا العربية مع كوريين',
    ),
    jours: t('7 JOURS', '7 DAYS', '7 DÍAS', '7 TAGE', '7 GIORNI', '7 DIAS', '7 أيام'),
    salut: t('Salut !', 'Hi!', '¡Hola!', 'Hallo!', 'Ciao!', 'Oi!', 'مرحبًا!'),
  },
  Y2: {
    titre: t(
      'Un groupe de 6 pays organise un voyage sans langue commune',
      '6 countries plan a trip with no shared language',
      '6 países organizan un viaje sin idioma en común',
      '6 Länder planen eine Reise ohne gemeinsame Sprache',
      '6 paesi organizzano un viaggio senza una lingua in comune',
      '6 países organizam uma viagem sem língua em comum',
      '6 بلدان تخطط لرحلة بلا لغة مشتركة',
    ),
    accroche: t('6 PAYS. 0 LANGUE COMMUNE.', '6 COUNTRIES. NO SHARED LANGUAGE.', '6 PAÍSES. NINGÚN IDIOMA EN COMÚN.', '6 LÄNDER. KEINE GEMEINSAME SPRACHE.', '6 PAESI. 0 LINGUE IN COMUNE.', '6 PAÍSES. NENHUMA LÍNGUA EM COMUM.', '6 بلدان. ولا لغة مشتركة.'),
  },
}

// Libellés du kit social qui ne sont PAS des écrans de l'app.
export const LIBELLES = {
  langues76: t('76 langues traduisibles', '76 translatable languages', '76 idiomas traducibles', '76 übersetzbare Sprachen', '76 lingue traducibili', '76 línguas traduzíveis', '76 لغة قابلة للترجمة'),
  telecharger: t('Disponible sur l’App Store', 'Available on the App Store', 'Disponible en la App Store', 'Jetzt im App Store', 'Disponibile su App Store', 'Disponível na App Store', 'متوفر على App Store'),
  glisse: t('Glisse', 'Swipe', 'Desliza', 'Wischen', 'Scorri', 'Arrasta', 'اسحب'),
  promesse: t('Le monde entier devient ton groupe.', 'The whole world becomes your group.', 'El mundo entero se vuelve tu grupo.', 'Die ganze Welt wird deine Gruppe.', 'Il mondo intero diventa il tuo gruppo.', 'O mundo inteiro vira o seu grupo.', 'العالم كله يصبح مجموعتك.'),
  jour: t('Jour', 'Day', 'Día', 'Tag', 'Giorno', 'Dia', 'اليوم'),
  original: t('Original', 'Original', 'Original', 'Original', 'Originale', 'Original', 'الأصل'),
  traduit: t('Traduit', 'Translated', 'Traducido', 'Übersetzt', 'Tradotto', 'Traduzido', 'مترجم'),
  commentaire: t('Commentaire', 'Comment', 'Comentario', 'Kommentar', 'Commento', 'Comentário', 'تعليق'),
  compteOfficiel: t('Compte officiel', 'Official account', 'Cuenta oficial', 'Offizieller Account', 'Account ufficiale', 'Conta oficial', 'الحساب الرسمي'),
}
