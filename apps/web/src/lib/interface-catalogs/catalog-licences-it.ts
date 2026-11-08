import type { LicencesCatalog } from '../i18n-licences-catalog';

/** L'écran Licences (#14628), ITALIANO. */
const it = {
  'licences.row': 'Licenze open source',
  'licences.title': 'Licenze',
  'licences.meeshy.title': 'Licenza di Meeshy',
  'licences.meeshy.body': 'Il codice sorgente di Meeshy è pubblicato con licenza MIT. Questa app include libsignal (Signal Messenger), pubblicato con licenza GNU AGPL-3.0: l’app distribuita è quindi un’opera concessa esclusivamente con licenza AGPL-3.0.',
  'licences.meeshy.body_mit': 'Il codice sorgente di Meeshy è pubblicato con licenza MIT.',
  'licences.source.title': 'Codice sorgente',
  'licences.source.body': 'Il codice sorgente di questa versione, script di compilazione inclusi, è disponibile gratuitamente.',
  'licences.source.commit': 'Revisione {commit}',
  'licences.source.open': 'Apri il codice sorgente',
  'licences.agpl.title': 'Testo della licenza AGPL-3.0',
  'licences.libsignal.title': 'Avvisi di libsignal',
  'licences.libsignal.body': 'libsignal e le librerie che include, con il testo delle loro licenze.',
  'licences.libsignal.open': 'Vedi gli avvisi pubblicati da Signal',
  'licences.legal_review': 'Queste informazioni sono in fase di revisione legale.',
} as const satisfies LicencesCatalog;

export default it;
