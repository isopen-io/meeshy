import type { LicencesCatalog } from '../i18n-licences-catalog';

/** L'écran Licences (#14628), ENGLISH. */
const en = {
  'licences.row': 'Open source licenses',
  'licences.title': 'Licenses',
  'licences.meeshy.title': 'Meeshy’s license',
  'licences.meeshy.body': 'Meeshy’s source code is published under the MIT license. This app includes libsignal (Signal Messenger), published under the GNU AGPL-3.0: the distributed app is therefore a work licensed under the AGPL-3.0 only.',
  'licences.meeshy.body_mit': 'Meeshy’s source code is published under the MIT license.',
  'licences.source.title': 'Source code',
  'licences.source.body': 'The source code for this version, build scripts included, is available free of charge.',
  'licences.source.commit': 'Revision {commit}',
  'licences.source.open': 'Open',
  'licences.agpl.title': 'AGPL-3.0 license text',
  'licences.libsignal.title': 'libsignal notices',
  'licences.libsignal.body': 'libsignal and the libraries it includes, with the text of their licenses.',
  'licences.libsignal.question': 'What does this notice cover?',
  'licences.libsignal.open': 'Open',
  'licences.legal_review': 'This information is under legal review.',
} as const satisfies LicencesCatalog;

export default en;
