// Les 10 publications à poster DANS Meeshy au lancement — contenu-par-format.md § 5.
// Écrites en français par le compte officiel ; les six autres versions sont celles que le
// Prisme servira (et le texte à poster si l'équipe publie par langue).
import { HASHTAG, t } from './langues.mjs'

const avecHashtag = (gabarit) => Object.fromEntries(Object.entries(gabarit).map(([l, s]) => [l, s.replace('{#}', HASHTAG[l])]))

export const PUBLICATIONS = [
  {
    n: 1, lieu: 'global',
    texte: t(
      'Bienvenue à tous ceux qui arrivent aujourd’hui ! Dites-nous d’où vous écrivez 🌍',
      'Welcome to everyone joining today! Tell us where you’re writing from 🌍',
      '¡Bienvenidos a todos los que llegan hoy! Contadnos desde dónde escribís 🌍',
      'Willkommen an alle, die heute dazukommen! Erzählt uns, von wo ihr schreibt 🌍',
      'Benvenuti a tutti quelli che arrivano oggi! Diteci da dove scrivete 🌍',
      'Boas-vindas a todo mundo que chega hoje! Contem de onde vocês estão escrevendo 🌍',
      'أهلًا بكل من يصل اليوم! أخبرونا من أين تكتبون 🌍',
    ),
  },
  {
    n: 2, lieu: 'global',
    texte: t(
      'Question du jour : quel mot de ta langue n’existe dans aucune autre ?',
      'Question of the day: which word in your language doesn’t exist in any other?',
      'Pregunta del día: ¿qué palabra de tu idioma no existe en ningún otro?',
      'Frage des Tages: Welches Wort deiner Sprache gibt es in keiner anderen?',
      'Domanda del giorno: quale parola della tua lingua non esiste in nessun’altra?',
      'Pergunta do dia: qual palavra da sua língua não existe em nenhuma outra?',
      'سؤال اليوم: ما الكلمة في لغتك التي لا توجد في أي لغة أخرى؟',
    ),
  },
  {
    n: 3, lieu: 'global',
    texte: t(
      'Premier vocal ? Envoie juste « salut » ici, le monde l’entendra dans sa langue.',
      'First voice note? Just send “hi” here, the world will hear it in its own language.',
      '¿Primer audio? Manda solo «hola» aquí, el mundo lo oirá en su idioma.',
      'Erste Sprachnachricht? Schick hier einfach „Hallo“, die Welt hört es in ihrer Sprache.',
      'Primo vocale? Manda solo «ciao» qui, il mondo lo sentirà nella sua lingua.',
      'Primeiro áudio? Manda só um “oi” aqui, o mundo vai ouvir na língua de cada um.',
      'أول رسالة صوتية؟ أرسل «مرحبًا» هنا فقط، وسيسمعها العالم بلغته.',
    ),
  },
  {
    n: 4, lieu: 'story', note: 'sticker question — visuel : 9x16-S1',
    texte: t(
      'Il est quelle heure chez toi ? Ici 21 h à Paris 🌙',
      'What time is it where you are? It’s 9 pm here in Paris 🌙',
      '¿Qué hora es donde estás? Aquí son las 21 h en París 🌙',
      'Wie spät ist es bei dir? Hier in Paris ist es 21 Uhr 🌙',
      'Che ore sono da te? Qui a Parigi sono le 21 🌙',
      'Que horas são aí? Aqui em Paris são 21h 🌙',
      'كم الساعة عندك؟ هنا في باريس الساعة 9 مساءً 🌙',
    ),
  },
  {
    n: 5, lieu: 'story', note: 'visuel : 9x16-S2',
    texte: t(
      'Jour 1 de ma série. Qui me suit jusqu’à 7 ?',
      'Day 1 of my streak. Who’s with me till day 7?',
      'Día 1 de mi racha. ¿Quién me sigue hasta el 7?',
      'Tag 1 meiner Serie. Wer hält mit bis Tag 7?',
      'Giorno 1 della mia serie. Chi mi segue fino al 7?',
      'Dia 1 da minha sequência. Quem me acompanha até o 7?',
      'اليوم 1 من سلسلتي. مين يكمل معي حتى اليوم 7؟',
    ),
  },
  {
    n: 6, lieu: 'post',
    texte: t(
      'Montrez votre vue depuis la fenêtre. On fait le tour du monde en photos.',
      'Show us the view from your window. Let’s go around the world in photos.',
      'Enseñadnos la vista desde vuestra ventana. Demos la vuelta al mundo en fotos.',
      'Zeigt uns den Blick aus eurem Fenster. Wir reisen in Fotos um die Welt.',
      'Mostrateci la vista dalla vostra finestra. Facciamo il giro del mondo in foto.',
      'Mostrem a vista da janela de vocês. Vamos dar a volta ao mundo em fotos.',
      'أرونا المنظر من نافذتكم. لنطُف حول العالم بالصور.',
    ),
  },
  {
    n: 7, lieu: 'post',
    texte: t(
      'Recommande une chanson dans ta langue. Les autres l’écouteront, toi tu liras leurs avis dans la tienne.',
      'Recommend a song in your language. Others will listen, and you’ll read their thoughts in yours.',
      'Recomienda una canción en tu idioma. Los demás la escucharán y tú leerás sus opiniones en el tuyo.',
      'Empfiehl einen Song in deiner Sprache. Die anderen hören ihn, und du liest ihre Meinung in deiner.',
      'Consiglia una canzone nella tua lingua. Gli altri la ascolteranno, tu leggerai i loro commenti nella tua.',
      'Recomende uma música na sua língua. Os outros vão ouvir, e você lê a opinião deles na sua.',
      'اقترح أغنية بلغتك. سيستمع إليها الآخرون، وستقرأ آراءهم بلغتك.',
    ),
  },
  {
    n: 8, lieu: 'reel', note: 'le hero V1 posté natif — visuels : 9x16-V1-*',
    texte: t('Ta voix. Leur langue.', 'Your voice. Their language.', 'Tu voz. Su idioma.', 'Deine Stimme. Ihre Sprache.', 'La tua voce. La loro lingua.', 'Sua voz. A língua deles.', 'صوتك. بلغتهم.'),
  },
  {
    n: 9, lieu: 'global',
    texte: t(
      'Petit rappel : ici on est gentils. Personne ne juge ton niveau, tout le monde écrit dans sa langue.',
      'Friendly reminder: we’re kind here. Nobody judges your level, everyone writes in their own language.',
      'Recordatorio: aquí somos amables. Nadie juzga tu nivel, cada uno escribe en su idioma.',
      'Kleine Erinnerung: Hier sind wir nett zueinander. Niemand bewertet dein Niveau, jeder schreibt in seiner Sprache.',
      'Piccolo promemoria: qui siamo gentili. Nessuno giudica il tuo livello, ognuno scrive nella sua lingua.',
      'Lembrete: aqui a gente é gentil. Ninguém julga seu nível, cada um escreve na sua língua.',
      'تذكير صغير: هنا نتعامل بلطف. لا أحد يحكم على مستواك، والكل يكتب بلغته.',
    ),
  },
  {
    n: 10, lieu: 'post', note: 'défi de CAMPAGNE (aucun défi n’existe dans l’app) — visuel : 9x16-S4',
    texte: avecHashtag(t(
      'Défi de la semaine : {#}. Poste ton bonjour et fais-toi un ami dans un pays où tu n’es jamais allé.',
      'Challenge of the week: {#}. Post your hello and make a friend in a country you’ve never been to.',
      'Reto de la semana: {#}. Publica tu hola y hazte amigo de alguien de un país que no conoces.',
      'Challenge der Woche: {#}. Poste dein Hallo und finde einen Freund in einem Land, in dem du nie warst.',
      'Sfida della settimana: {#}. Posta il tuo ciao e fatti un amico in un paese dove non sei mai stato.',
      'Desafio da semana: {#}. Poste seu oi e faça um amigo num país onde você nunca foi.',
      'تحدي الأسبوع: {#}. انشر تحيتك وكوّن صديقًا في بلد لم تزره من قبل.',
    )),
  },
]

export const LIEUX = {
  global: 'Meeshy Global',
  story: 'Story du compte officiel',
  post: 'Post public du compte officiel',
  reel: 'Reel du compte officiel',
}
