// Vidéos 9:16 V1-V8 et stories Meeshy — contenu-par-format.md § 1.
// `hook` = texte de la couverture ; `sous` = sous-titres incrustés des deux plans clés ;
// `cta` = carte de fin (le logo n'apparaît qu'à la fin, § 1).
// Écarts assumés au plan, pour tenir le § 2 de la stratégie :
//   V1 — « Ta voix parle 76 langues » confondait traduction (76) et voix (≈ 25, sur
//        consentement) : la carte de fin dit « Ta voix. Leur langue. » + « 76 langues traduisibles ».
//   V7 — « Teste avec ta propre voix » se lit « avec ta voix » : « Teste-le toi-même, en vocal. »
import { HASHTAG, t } from './langues.mjs'

export const VIDEOS = {
  V1: {
    titre: t('Ta voix. Leur langue.', 'Your voice. Their language.', 'Tu voz. Su idioma.', 'Deine Stimme. Ihre Sprache.', 'La tua voce. La loro lingua.', 'Sua voz. A língua deles.', 'صوتك. بلغتهم.'),
    hook: t(
      'Je parle français. Elle m’entend en coréen.',
      'I speak English. She hears me in Korean.',
      'Hablo español. Ella me oye en coreano.',
      'Ich spreche Deutsch. Sie hört mich auf Koreanisch.',
      'Parlo italiano. Lei mi sente in coreano.',
      'Eu falo português. Ela me ouve em coreano.',
      'أتكلم العربية. وهي تسمعني بالكورية.',
    ),
    sous: [
      t(
        'J’enregistre un vocal… en français.',
        'I record a voice note… in English.',
        'Grabo un audio… en español.',
        'Ich nehme eine Sprachnachricht auf… auf Deutsch.',
        'Registro un vocale… in italiano.',
        'Gravo um áudio… em português.',
        'أسجّل رسالة صوتية… بالعربية.',
      ),
      t(
        'À Séoul, elle l’écoute en coréen.',
        'In Seoul, she plays it in Korean.',
        'En Seúl, ella lo escucha en coreano.',
        'In Seoul hört sie es auf Koreanisch.',
        'A Seul, lei lo ascolta in coreano.',
        'Em Seul, ela ouve em coreano.',
        'في سيول، تسمعها بالكورية.',
      ),
    ],
    cta: t('Ta voix. Leur langue.', 'Your voice. Their language.', 'Tu voz. Su idioma.', 'Deine Stimme. Ihre Sprache.', 'La tua voce. La loro lingua.', 'Sua voz. A língua deles.', 'صوتك. بلغتهم.'),
  },
  V2: {
    titre: t('Bonjour au monde entier', 'Hello to the whole world', 'Hola al mundo entero', 'Hallo an die ganze Welt', 'Ciao al mondo intero', 'Oi pro mundo inteiro', 'مرحبًا للعالم كله'),
    hook: t(
      'J’ai dit bonjour à tout le monde. En même temps.',
      'I said hi to the whole world. At the same time.',
      'Saludé a todo el mundo. A la vez.',
      'Ich hab der ganzen Welt Hallo gesagt. Gleichzeitig.',
      'Ho salutato tutto il mondo. Nello stesso momento.',
      'Dei oi pro mundo inteiro. Ao mesmo tempo.',
      'قلت مرحبًا للعالم كله. في الوقت نفسه.',
    ),
    sous: [
      t(
        'Nouveau compte. Direct dans Meeshy Global.',
        'New account. Straight into Meeshy Global.',
        'Cuenta nueva. Directo a Meeshy Global.',
        'Neues Konto. Direkt in Meeshy Global.',
        'Account nuovo. Dritto in Meeshy Global.',
        'Conta nova. Direto no Meeshy Global.',
        'حساب جديد. مباشرة إلى Meeshy Global.',
      ),
      t(
        'Les réponses tombent… toutes en français.',
        'The replies roll in… all in English.',
        'Llueven respuestas… todas en español.',
        'Die Antworten kommen… alle auf Deutsch.',
        'Arrivano le risposte… tutte in italiano.',
        'As respostas chegam… todas em português.',
        'تنهال الردود… كلها بالعربية.',
      ),
    ],
    cta: t(
      'Ton premier bonjour t’attend dans Global.',
      'Your first hello is waiting in Global.',
      'Tu primer hola te espera en Global.',
      'Dein erstes Hallo wartet in Global.',
      'Il tuo primo ciao ti aspetta in Global.',
      'Seu primeiro oi te espera no Global.',
      'تحيتك الأولى بانتظارك في Global.',
    ),
  },
  V3: {
    titre: t('La série', 'The streak', 'La racha', 'Die Serie', 'La serie', 'A sequência', 'السلسلة'),
    hook: t(
      'Jour 30 à parler à des inconnus du monde entier.',
      'Day 30 of talking to strangers all over the world.',
      'Día 30 hablando con desconocidos de todo el mundo.',
      'Tag 30: Ich rede mit Fremden aus aller Welt.',
      'Giorno 30 a parlare con sconosciuti da tutto il mondo.',
      'Dia 30 falando com desconhecidos do mundo todo.',
      'اليوم 30 من الحديث مع غرباء من كل العالم.',
    ),
    sous: [
      t('30 jours d’affilée. Record battu.', '30 days in a row. New record.', '30 días seguidos. Récord batido.', '30 Tage am Stück. Neuer Rekord.', '30 giorni di fila. Record battuto.', '30 dias seguidos. Recorde batido.', '30 يومًا متتالية. رقم قياسي جديد.'),
      t(
        'Un drapeau par personne rencontrée.',
        'One flag for every person I met.',
        'Una bandera por cada persona que conocí.',
        'Eine Flagge für jede neue Bekanntschaft.',
        'Una bandiera per ogni persona conosciuta.',
        'Uma bandeira pra cada pessoa que conheci.',
        'علم لكل شخص تعرّفت عليه.',
      ),
    ],
    cta: t('Commence ta série aujourd’hui.', 'Start your streak today.', 'Empieza tu racha hoy.', 'Starte deine Serie heute.', 'Inizia la tua serie oggi.', 'Comece sua sequência hoje.', 'ابدأ سلسلتك اليوم.'),
  },
  V4: {
    titre: t('Le groupe impossible', 'The impossible group', 'El grupo imposible', 'Die unmögliche Gruppe', 'Il gruppo impossibile', 'O grupo impossível', 'المجموعة المستحيلة'),
    hook: t(
      '4 pays. 4 langues. 0 traducteur ouvert.',
      '4 countries. 4 languages. 0 translator apps open.',
      '4 países. 4 idiomas. 0 traductores abiertos.',
      '4 Länder. 4 Sprachen. 0 Übersetzer offen.',
      '4 paesi. 4 lingue. 0 traduttori aperti.',
      '4 países. 4 línguas. 0 tradutor aberto.',
      '4 بلدان. 4 لغات. ولا مترجم مفتوح.',
    ),
    sous: [
      t('Chacun écrit dans sa langue.', 'Everyone types in their own language.', 'Cada uno escribe en su idioma.', 'Jeder schreibt in seiner Sprache.', 'Ognuno scrive nella sua lingua.', 'Cada um escreve na sua língua.', 'كل واحد يكتب بلغته.'),
      t(
        'Même conversation. 4 téléphones. 4 langues.',
        'Same chat. 4 phones. 4 languages.',
        'La misma conversación. 4 móviles. 4 idiomas.',
        'Derselbe Chat. 4 Handys. 4 Sprachen.',
        'Stessa chat. 4 telefoni. 4 lingue.',
        'A mesma conversa. 4 celulares. 4 línguas.',
        'المحادثة نفسها. 4 هواتف. 4 لغات.',
      ),
    ],
    cta: t(
      'Chacun sa langue. Tout le monde se comprend.',
      'Everyone their own language. Everyone gets it.',
      'Cada uno su idioma. Todos se entienden.',
      'Jeder seine Sprache. Alle verstehen sich.',
      'Ognuno la sua lingua. Tutti si capiscono.',
      'Cada um na sua língua. Todo mundo se entende.',
      'لكلٍّ لغته. والكل يفهم.',
    ),
  },
  V5: {
    titre: t('J’ai posté ma ville', 'I posted my city', 'Publiqué mi ciudad', 'Ich hab meine Stadt gepostet', 'Ho postato la mia città', 'Postei minha cidade', 'نشرت مدينتي'),
    hook: t(
      'J’ai posté ma ville. 12 personnes de 9 pays m’ont écrit.',
      'I posted my city. 12 people from 9 countries wrote to me.',
      'Publiqué mi ciudad. Me escribieron 12 personas de 9 países.',
      'Ich hab meine Stadt gepostet. 12 Leute aus 9 Ländern haben geschrieben.',
      'Ho postato la mia città. Mi hanno scritto 12 persone da 9 paesi.',
      'Postei minha cidade. 12 pessoas de 9 países me escreveram.',
      'نشرت مدينتي. فكتب لي 12 شخصًا من 9 بلدان.',
    ),
    sous: [
      t('Une story de mon quartier, en public.', 'A story of my neighborhood, in public.', 'Una story de mi barrio, en público.', 'Eine Story aus meinem Viertel, öffentlich.', 'Una storia del mio quartiere, in pubblico.', 'Um story do meu bairro, em público.', 'قصة من حيّي، للعامة.'),
      t(
        'Les commentaires arrivent. Je les lis en français.',
        'Comments pour in. I read them in English.',
        'Llegan comentarios. Los leo en español.',
        'Kommentare kommen rein. Ich lese sie auf Deutsch.',
        'Arrivano i commenti. Li leggo in italiano.',
        'Chegam comentários. Leio tudo em português.',
        'تصل التعليقات. وأقرؤها بالعربية.',
      ),
    ],
    cta: t(
      'Poste. Le monde répond. Dans ta langue.',
      'Post. The world replies. In your language.',
      'Publica. El mundo responde. En tu idioma.',
      'Poste. Die Welt antwortet. In deiner Sprache.',
      'Pubblica. Il mondo risponde. Nella tua lingua.',
      'Poste. O mundo responde. Na sua língua.',
      'انشر. والعالم يرد. بلغتك.',
    ),
  },
  V6: {
    titre: t('L’appel sous-titré', 'The captioned call', 'La llamada subtitulada', 'Der untertitelte Anruf', 'La chiamata sottotitolata', 'A chamada legendada', 'المكالمة المترجمة'),
    hook: t(
      'On s’appelle. On ne parle pas la même langue. Aucun souci.',
      'We call. We don’t speak the same language. No problem.',
      'Nos llamamos. No hablamos el mismo idioma. Sin problema.',
      'Wir telefonieren. Wir sprechen nicht dieselbe Sprache. Kein Problem.',
      'Ci chiamiamo. Non parliamo la stessa lingua. Nessun problema.',
      'A gente se liga. Não falamos a mesma língua. Sem problema.',
      'نتصل ببعض. لا نتكلم اللغة نفسها. ولا مشكلة.',
    ),
    sous: [
      t(
        'Les sous-titres traduits suivent en direct.',
        'Translated captions follow live.',
        'Los subtítulos traducidos siguen en directo.',
        'Übersetzte Untertitel laufen live mit.',
        'I sottotitoli tradotti seguono in diretta.',
        'As legendas traduzidas acompanham ao vivo.',
        'الترجمة النصية تتبع المكالمة مباشرة.',
      ),
      t('Et on rit de la même blague.', 'And we laugh at the same joke.', 'Y nos reímos del mismo chiste.', 'Und wir lachen über denselben Witz.', 'E ridiamo della stessa battuta.', 'E a gente ri da mesma piada.', 'ونضحك على النكتة نفسها.'),
    ],
    cta: t('Appelle Séoul. Lis chaque mot.', 'Call Seoul. Read every word.', 'Llama a Seúl. Lee cada palabra.', 'Ruf Seoul an. Lies jedes Wort.', 'Chiama Seul. Leggi ogni parola.', 'Ligue para Seul. Leia cada palavra.', 'اتصل بسيول. واقرأ كل كلمة.'),
  },
  V7: {
    titre: t('Réponse aux sceptiques', 'Reply to the skeptics', 'Respuesta a los escépticos', 'Antwort an die Skeptiker', 'Risposta agli scettici', 'Resposta aos céticos', 'ردّ على المشككين'),
    commentaire: t('Ça va sonner robot.', 'It’ll sound robotic.', 'Va a sonar a robot.', 'Das klingt doch nach Roboter.', 'Sembrerà un robot.', 'Vai soar robótico.', 'سيبدو كصوت روبوت.'),
    ecoute: t('Écoute.', 'Listen.', 'Escucha.', 'Hör zu.', 'Ascolta.', 'Escuta.', 'استمع.'),
    hook: t('« Ça va sonner robot. » Écoute.', '“It’ll sound robotic.” Listen.', '«Va a sonar a robot». Escucha.', '„Das klingt doch nach Roboter.“ Hör zu.', '«Sembrerà un robot». Ascolta.', '“Vai soar robótico.” Escuta.', '«سيبدو كصوت روبوت». استمع.'),
    sous: [
      t(
        'L’original. Puis la version traduite. Sans coupe.',
        'The original. Then the translated version. No cuts.',
        'El original. Luego la versión traducida. Sin cortes.',
        'Das Original. Dann die Übersetzung. Ohne Schnitt.',
        'L’originale. Poi la versione tradotta. Senza tagli.',
        'O original. Depois a versão traduzida. Sem cortes.',
        'الأصل. ثم النسخة المترجمة. بلا قطع.',
      ),
      t(
        'Une voix qui ressemble à la tienne, seulement si tu l’actives.',
        'A voice that sounds like yours, only if you turn it on.',
        'Una voz que se parece a la tuya, solo si la activas.',
        'Eine Stimme, die wie deine klingt – nur wenn du sie aktivierst.',
        'Una voce che somiglia alla tua, solo se la attivi.',
        'Uma voz parecida com a sua, só se você ativar.',
        'صوت يشبه صوتك، فقط إذا فعّلته.',
      ),
    ],
    cta: t('Teste-le toi-même, en vocal.', 'Try it yourself. Send a voice note.', 'Pruébalo tú. Manda un audio.', 'Probier’s selbst. Schick eine Sprachnachricht.', 'Provalo tu. Manda un vocale.', 'Testa você mesmo. Manda um áudio.', 'جرّبه بنفسك. أرسل رسالة صوتية.'),
  },
  V8: {
    titre: HASHTAG,
    hook: t(
      'Défi : dis bonjour dans Global et montre qui te répond.',
      'Challenge: say hi in Global and show who answers.',
      'Reto: saluda en Global y enseña quién te responde.',
      'Challenge: Sag Hallo in Global und zeig, wer antwortet.',
      'Sfida: saluta in Global e mostra chi ti risponde.',
      'Desafio: diga oi no Global e mostre quem responde.',
      'تحدٍّ: قل مرحبًا في Global وأرِنا من يرد عليك.',
    ),
    sous: [
      t('J’ouvre Global. Je poste mon bonjour.', 'I open Global. I post my hello.', 'Abro Global. Publico mi hola.', 'Ich öffne Global. Ich poste mein Hallo.', 'Apro Global. Posto il mio ciao.', 'Abro o Global. Posto meu oi.', 'أفتح Global. وأنشر تحيتي.'),
      t('Et le monde répond.', 'And the world answers.', 'Y el mundo responde.', 'Und die Welt antwortet.', 'E il mondo risponde.', 'E o mundo responde.', 'والعالم يرد.'),
    ],
    cta: t('Ton tour.', 'Your turn.', 'Tu turno.', 'Du bist dran.', 'Tocca a te.', 'Sua vez.', 'دورك.'),
  },
}

// Stories à publier par le compte officiel dans Meeshy (§ 5, publications 4 et 5 ; V2 et V8 recoupés).
export const STORIES = {
  S1: {
    question: t('Il est quelle heure chez toi ?', 'What time is it where you are?', '¿Qué hora es donde estás?', 'Wie spät ist es bei dir?', 'Che ore sono da te?', 'Que horas são aí?', 'كم الساعة عندك؟'),
    ligne: t('Ici 21 h à Paris', 'It’s 9 pm here in Paris', 'Aquí son las 21 h en París', 'Hier in Paris ist es 21 Uhr', 'Qui a Parigi sono le 21', 'Aqui em Paris são 21h', 'هنا في باريس الساعة 9 مساءً'),
    champ: t('Réponds ici…', 'Reply here…', 'Responde aquí…', 'Hier antworten…', 'Rispondi qui…', 'Responda aqui…', 'ردّ هنا…'),
  },
  S2: {
    jour: t('Jour 1 de ma série.', 'Day 1 of my streak.', 'Día 1 de mi racha.', 'Tag 1 meiner Serie.', 'Giorno 1 della mia serie.', 'Dia 1 da minha sequência.', 'اليوم 1 من سلسلتي.'),
    question: t('Qui me suit jusqu’à 7 ?', 'Who’s with me till day 7?', '¿Quién me sigue hasta el 7?', 'Wer hält mit bis Tag 7?', 'Chi mi segue fino al 7?', 'Quem me acompanha até o 7?', 'مين يكمل معي حتى اليوم 7؟'),
  },
  S3: {
    titre: VIDEOS.V2.cta,
    ligne: t('Chaque nouveau compte y arrive.', 'Every new account lands there.', 'Cada cuenta nueva llega ahí.', 'Jedes neue Konto landet dort.', 'Ogni nuovo account arriva lì.', 'Toda conta nova chega lá.', 'كل حساب جديد يصل إلى هناك.'),
  },
  S4: {
    surtitre: t('Défi de la semaine', 'Challenge of the week', 'Reto de la semana', 'Challenge der Woche', 'Sfida della settimana', 'Desafio da semana', 'تحدي الأسبوع'),
    etapes: [
      t('Poste ton bonjour dans Global', 'Post your hello in Global', 'Publica tu hola en Global', 'Poste dein Hallo in Global', 'Posta il tuo ciao in Global', 'Poste seu oi no Global', 'انشر تحيتك في Global'),
      t('Lis les réponses dans ta langue', 'Read the replies in your language', 'Lee las respuestas en tu idioma', 'Lies die Antworten in deiner Sprache', 'Leggi le risposte nella tua lingua', 'Leia as respostas na sua língua', 'اقرأ الردود بلغتك'),
      t(
        'Fais-toi un ami dans un pays où tu n’es jamais allé',
        'Make a friend in a country you’ve never been to',
        'Hazte amigo de alguien de un país que no conoces',
        'Finde einen Freund in einem Land, in dem du nie warst',
        'Fatti un amico in un paese dove non sei mai stato',
        'Faça um amigo num país onde você nunca foi',
        'كوّن صديقًا في بلد لم تزره من قبل',
      ),
    ],
  },
}
