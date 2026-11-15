import type { LicencesCatalog } from '../i18n-licences-catalog';

/** L'écran Licences (#14628), DEUTSCH. */
const de = {
  'licences.row': 'Open-Source-Lizenzen',
  'licences.title': 'Lizenzen',
  'licences.meeshy.title': 'Lizenz von Meeshy',
  'licences.meeshy.body': 'Der Quellcode von Meeshy wird unter der MIT-Lizenz veröffentlicht. Diese App enthält libsignal (Signal Messenger), veröffentlicht unter der GNU AGPL-3.0: Die verteilte App ist daher ein Werk, das ausschließlich unter der AGPL-3.0 lizenziert ist.',
  'licences.meeshy.body_mit': 'Der Quellcode von Meeshy wird unter der MIT-Lizenz veröffentlicht.',
  'licences.source.title': 'Quellcode',
  'licences.source.body': 'Der Quellcode dieser Version, einschließlich der Build-Skripte, ist kostenlos verfügbar.',
  'licences.source.commit': 'Revision {commit}',
  'licences.source.open': 'Öffnen',
  'licences.agpl.title': 'Lizenztext der AGPL-3.0',
  'licences.libsignal.title': 'Hinweise zu libsignal',
  'licences.libsignal.body': 'libsignal und die enthaltenen Bibliotheken, mit dem Text ihrer Lizenzen.',
  'licences.libsignal.question': 'Was deckt dieser Hinweis ab?',
  'licences.libsignal.open': 'Öffnen',
  'licences.legal_review': 'Diese Angaben werden derzeit rechtlich geprüft.',
} as const satisfies LicencesCatalog;

export default de;
