import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const es = {
  'visitor.title': 'Únete a Meeshy',
  'visitor.sharedBy.reel': '{name} te ha compartido este reel',
  'visitor.sharedBy.post': '{name} te ha compartido esta publicación',
  'visitor.sharedBy.story': '{name} te ha compartido esta historia',
  'visitor.sharedBy.mood': '{name} te ha compartido este estado de ánimo',
  'visitor.body': 'Crea tu cuenta o inicia sesión para reaccionar, comentar y leerlo todo en tu idioma.',
  'visitor.signup': 'Crear una cuenta',
  'visitor.login': 'Iniciar sesión',
  'visitor.later': 'Seguir viendo',
  'visitor.refused.title': 'Este contenido no está disponible',
  'visitor.refused.body': 'Ya no existe, o está reservado a su audiencia. Inicia sesión para verlo si va dirigido a ti.',
} satisfies VisitorCatalog;

export default es;
