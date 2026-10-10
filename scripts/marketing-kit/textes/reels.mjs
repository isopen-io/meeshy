// Les réels drôles et la story de l'en-tête de la fiche App Store (#9904). Chaque réel est légendé par son auteur
// dans SA langue, et le lecteur le lit dans la sienne (le Prisme). Une légende décrit ce que la vidéo montre, sans
// rien promettre. Quand l'auteur parle la langue du lecteur, son remplaçant prend la parole : le spectateur voit
// toujours une légende TRADUITE. L'arabe doit être relu par un locuteur natif avant l'envoi.

// `textes` porte la légende dans la langue de chaque auteur possible ET dans les sept langues de lecture.
export const REELS_DROLES = [
  {
    id: 'reel.miroir',
    video: 'miroir-brosse',
    auteurs: ['minjun.p'],
    textes: {
      ko: '아침 7시, 욕실 단독 콘서트 🎤🪥 오늘도 매진!',
      fr: '7 h du matin, concert privé dans la salle de bain 🎤🪥 Encore complet !',
      en: '7 a.m., private bathroom concert 🎤🪥 Sold out again!',
      es: '7 de la mañana, concierto privado en el baño 🎤🪥 ¡Otra vez agotado!',
      de: '7 Uhr morgens, Privatkonzert im Bad 🎤🪥 Wieder ausverkauft!',
      it: 'Le 7 del mattino, concerto privato in bagno 🎤🪥 Di nuovo sold out!',
      pt: '7 da manhã, show particular no banheiro 🎤🪥 Esgotado de novo!',
      ar: 'السابعة صباحًا، حفلة خاصة في الحمّام 🎤🪥 نفدت التذاكر مجددًا!',
    },
  },
  {
    id: 'reel.louche',
    video: 'louche-micro',
    auteurs: ['aiko.t'],
    textes: {
      ja: 'お玉マイクで熱唱中🎤 観客はスープだけ🍲',
      fr: 'En plein concert à la louche 🎤 Mon seul public : la soupe 🍲',
      en: 'Belting it out on the ladle mic 🎤 My only audience: the soup 🍲',
      es: 'Cantando a todo pulmón con el cucharón 🎤 Mi único público: la sopa 🍲',
      de: 'Volle Power ins Schöpfkellen-Mikro 🎤 Mein einziges Publikum: die Suppe 🍲',
      it: 'A squarciagola col mestolo 🎤 Il mio unico pubblico: la zuppa 🍲',
      pt: 'Cantando com tudo no microfone-concha 🎤 Minha única plateia: a sopa 🍲',
      ar: 'أغني بكل قوتي في ميكروفون المغرفة 🎤 جمهوري الوحيد: الحساء 🍲',
    },
  },
  {
    id: 'reel.reunion',
    video: 'emoji-reunion',
    auteurs: ['sofi.romero', 'lucas.olv'],
    textes: {
      fr: 'Quand le chef dit « réunion rapide » 😂',
      en: 'When the boss says “quick meeting” 😂',
      es: 'Cuando el jefe dice «reunión rápida» 😂',
      de: 'Wenn der Chef „kurzes Meeting“ sagt 😂',
      it: 'Quando il capo dice «riunione veloce» 😂',
      pt: 'Quando o chefe diz “reunião rápida” 😂',
      ar: 'عندما يقول المدير «اجتماع سريع» 😂',
    },
  },
  {
    id: 'reel.menage',
    video: 'menage-danse',
    auteurs: ['yusuf.h', 'jonas.wb'],
    textes: {
      fr: 'Le ménage : 5 minutes. La danse : une heure 🧹💃',
      en: 'Cleaning: 5 minutes. Dancing: one hour 🧹💃',
      es: 'Limpiar: 5 minutos. Bailar: una hora 🧹💃',
      de: 'Putzen: 5 Minuten. Tanzen: eine Stunde 🧹💃',
      it: 'Pulizie: 5 minuti. Ballo: un’ora 🧹💃',
      pt: 'Faxina: 5 minutos. Dança: uma hora 🧹💃',
      ar: 'التنظيف: ٥ دقائق. الرقص: ساعة كاملة 🧹💃',
    },
  },
]

// La story que la scène `interaction-story` ouvre : celle de Lucas, ou celle de Sofía quand Lucas est le lecteur.
export const STORIES_DE_L_ENTETE = ['story.lucas', 'story.sofia']
