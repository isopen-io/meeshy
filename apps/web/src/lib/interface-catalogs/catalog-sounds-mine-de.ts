import type { SoundsMineCatalog } from '@/lib/i18n-sounds-mine-catalog';

/** « MES SONS » (#9848) — voir le doc-comment de `catalog-sounds-mine-fr.ts`. */
const de = {
  'soundsMine.title': 'Meine Sounds',
  'soundsMine.back': 'Zurück zu den Einstellungen',
  'soundsMine.empty.title': 'Keine Sounds in deiner Bibliothek',
  'soundsMine.empty.subtitle': 'Sounds, die du hochlädst oder die aus deinen Videos extrahiert werden, erscheinen hier.',
  'soundsMine.error.title': 'Deine Sounds konnten nicht geladen werden',
  'soundsMine.untitled': 'Originalsound',
  'soundsMine.posts.one': '{count} Beitrag',
  'soundsMine.posts.other': '{count} Beiträge',
  'soundsMine.action.remove': 'Aus meiner Bibliothek entfernen',
  'soundsMine.remove.title': 'Diesen Sound aus deiner Bibliothek entfernen?',
  'soundsMine.remove.confirm': 'Entfernen',
  'soundsMine.remove.body.unused': 'Dieser Sound verschwindet aus deiner Bibliothek und kann keinem Beitrag mehr hinzugefügt werden.',
  'soundsMine.remove.body.one': '{count} Beitrag verwendet ihn noch und spielt ihn weiter ab. Er verschwindet aus deiner Bibliothek und kann keinem neuen Beitrag mehr hinzugefügt werden.',
  'soundsMine.remove.body.other': '{count} Beiträge verwenden ihn noch und spielen ihn weiter ab. Er verschwindet aus deiner Bibliothek und kann keinem neuen Beitrag mehr hinzugefügt werden.',
  'soundsMine.remove.success': 'Sound aus deiner Bibliothek entfernt',
  'soundsMine.remove.failure': 'Der Sound konnte nicht entfernt werden. Versuche es erneut.',
  'soundsMine.offline': 'Offline – du kannst ihn entfernen, sobald du wieder online bist.',
} satisfies SoundsMineCatalog;

export default de;
