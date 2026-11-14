/**
 * L'ÉCRAN LICENCES (#14628), FRANÇAIS — la SOURCE des clés `licences.*` : la ligne
 * de Réglages › À propos et le volet `?volet=licences`. Hors du catalogue
 * d'interface, arrivé à son plafond : chargé à la demande
 * (`i18n-licences-catalog.ts`), jamais au démarrage. Mêmes textes que les clés
 * `about.licenses.*` d'iOS et d'Android. Rédaction à valider par l'avocat (#11548).
 */
const fr = {
  'licences.row': 'Licences open source',
  'licences.title': 'Licences',
  'licences.meeshy.title': 'Licence de Meeshy',
  'licences.meeshy.body': 'Le code source de Meeshy est publié sous licence MIT. Cette application intègre libsignal (Signal Messenger), publié sous licence GNU AGPL-3.0 : l’application distribuée est donc une œuvre sous licence AGPL-3.0 uniquement.',
  'licences.meeshy.body_mit': 'Le code source de Meeshy est publié sous licence MIT.',
  'licences.source.title': 'Code source',
  'licences.source.body': 'Le code source correspondant à cette version, scripts de construction compris, est disponible gratuitement.',
  'licences.source.commit': 'Révision {commit}',
  'licences.source.open': 'Ouvrir',
  'licences.agpl.title': 'Texte de la licence AGPL-3.0',
  'licences.libsignal.title': 'Avis de libsignal',
  'licences.libsignal.body': 'libsignal et les bibliothèques qu’il intègre, avec le texte de leurs licences.',
  'licences.libsignal.question': 'Que couvre cet avis ?',
  'licences.libsignal.open': 'Ouvrir',
  'licences.legal_review': 'Ces informations sont en cours de validation juridique.',
} as const;

export default fr;
