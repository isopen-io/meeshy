// Formes plurielles arabes des compteurs de jours — le catalogue iOS n'en porte que « one » et
// « other » (« 12 أيام », « 2 أيام » : fautes). L'arabe accorde le nom compté : 2 ⇒ duel,
// 3-10 ⇒ pluriel, 11-99 ⇒ singulier accusatif, 100+ ⇒ singulier. Correctif en attente du
// catalogue (#7772) : il s'efface de lui-même dès que la clé y porte ses propres formes.
// `compte` désigne l'argument qui porte le nombre accordé quand ce n'est pas le premier.
const suite = 'تستمر السلسلة ما دمت تكتب.'
const elan = (fin) => `الزخم ×%1$lld — %2$@ خلال ${fin}`

export const ACCORDS_ARABES = {
  'progression.streak.days': {
    zero: '%lld يوم متتالٍ', one: 'يوم واحد متتالٍ', two: 'يومان متتاليان',
    few: '%lld أيام متتالية', many: '%lld يومًا متتاليًا', other: '%lld يوم متتالٍ',
  },
  'progression.streak.record': {
    zero: 'الرقم القياسي: %lld يوم', one: 'الرقم القياسي: يوم واحد', two: 'الرقم القياسي: يومان',
    few: 'الرقم القياسي: %lld أيام', many: 'الرقم القياسي: %lld يومًا', other: 'الرقم القياسي: %lld يوم',
  },
  'progression.next.streak': {
    zero: '%lld يوم متبقٍ قبل معلم %lld', one: 'يوم واحد متبقٍ قبل معلم %2$lld', two: 'يومان متبقيان قبل معلم %2$lld',
    few: '%lld أيام متبقية قبل معلم %lld', many: '%lld يومًا متبقيًا قبل معلم %lld', other: '%lld يوم متبقٍ قبل معلم %lld',
  },
  'reveal.streak.subtitle': {
    zero: `%lld يوم متتالٍ. ${suite}`, one: `يوم واحد متتالٍ. ${suite}`, two: `يومان متتاليان. ${suite}`,
    few: `%lld أيام متتالية. ${suite}`, many: `%lld يومًا متتاليًا. ${suite}`, other: `%lld يوم متتالٍ. ${suite}`,
  },
  'progression.elan.base': {
    compte: 2,
    zero: elan('%3$lld يوم'), one: elan('يوم واحد'), two: elan('يومين'),
    few: elan('%3$lld أيام'), many: elan('%3$lld يومًا'), other: elan('%3$lld يوم'),
  },
}
