import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const it = {
  'visitor.title': 'Unisciti a Meeshy',
  'visitor.sharedBy.reel': '{name} ha condiviso con te questo reel',
  'visitor.sharedBy.post': '{name} ha condiviso con te questo post',
  'visitor.sharedBy.story': '{name} ha condiviso con te questa storia',
  'visitor.sharedBy.mood': '{name} ha condiviso con te questo stato d’animo',
  'visitor.body': 'Crea il tuo account o accedi per reagire, commentare e leggere tutto nella tua lingua.',
  'visitor.signup': 'Crea un account',
  'visitor.login': 'Accedi',
  'visitor.later': 'Continua a guardare',
  'visitor.refused.title': 'Questo contenuto non è disponibile',
  'visitor.refused.body': 'Non esiste più, oppure è riservato al suo pubblico. Accedi per vederlo se è destinato a te.',
} satisfies VisitorCatalog;

export default it;
