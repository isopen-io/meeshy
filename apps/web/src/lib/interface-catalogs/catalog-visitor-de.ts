import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const de = {
  'visitor.title': 'Willkommen bei Meeshy',
  'visitor.sharedBy.reel': '{name} hat dieses Reel mit dir geteilt',
  'visitor.sharedBy.post': '{name} hat diesen Beitrag mit dir geteilt',
  'visitor.sharedBy.story': '{name} hat diese Story mit dir geteilt',
  'visitor.sharedBy.mood': '{name} hat diese Stimmung mit dir geteilt',
  'visitor.body': 'Erstelle dein Konto oder melde dich an, um zu reagieren, zu kommentieren und alles in deiner Sprache zu lesen.',
  'visitor.signup': 'Konto erstellen',
  'visitor.login': 'Anmelden',
  'visitor.later': 'Weiter ansehen',
  'visitor.refused.title': 'Dieser Inhalt ist nicht verfügbar',
  'visitor.refused.body': 'Er existiert nicht mehr oder ist nur für sein Publikum bestimmt. Melde dich an, um ihn zu sehen, falls er für dich gedacht ist.',
} satisfies VisitorCatalog;

export default de;
