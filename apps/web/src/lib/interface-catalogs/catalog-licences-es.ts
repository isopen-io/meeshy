import type { LicencesCatalog } from '../i18n-licences-catalog';

/** L'écran Licences (#14628), ESPAÑOL. */
const es = {
  'licences.row': 'Licencias de código abierto',
  'licences.title': 'Licencias',
  'licences.meeshy.title': 'Licencia de Meeshy',
  'licences.meeshy.body': 'El código fuente de Meeshy se publica bajo la licencia MIT. Esta aplicación incluye libsignal (Signal Messenger), publicado bajo la licencia GNU AGPL-3.0: la aplicación distribuida es, por tanto, una obra bajo la licencia AGPL-3.0 únicamente.',
  'licences.meeshy.body_mit': 'El código fuente de Meeshy se publica bajo la licencia MIT.',
  'licences.source.title': 'Código fuente',
  'licences.source.body': 'El código fuente de esta versión, scripts de compilación incluidos, está disponible de forma gratuita.',
  'licences.source.commit': 'Revisión {commit}',
  'licences.source.open': 'Abrir el código fuente',
  'licences.agpl.title': 'Texto de la licencia AGPL-3.0',
  'licences.libsignal.title': 'Avisos de libsignal',
  'licences.libsignal.body': 'libsignal y las bibliotecas que incluye, con el texto de sus licencias.',
  'licences.libsignal.open': 'Ver los avisos publicados por Signal',
  'licences.legal_review': 'Esta información está en revisión jurídica.',
} as const satisfies LicencesCatalog;

export default es;
