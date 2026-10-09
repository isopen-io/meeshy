/**
 * « MES SONS » (#9848) — tranche du catalogue (`catalog-fr.ts` et ses six
 * jumeaux), extraite pour tenir le budget de taille. L'écran `/me/sounds`
 * (Réglages › Outils) : la bibliothèque de l'auteur et le retrait d'un son.
 */
const frSoundsMine = {
  'settings.tools.sounds': 'Mes sons',
  'soundsMine.title': 'Mes sons',
  'soundsMine.back': 'Retour aux réglages',
  'soundsMine.empty.title': 'Aucun son dans votre bibliothèque',
  'soundsMine.empty.subtitle': 'Les sons que vous importez ou qui sont extraits de vos vidéos apparaîtront ici.',
  'soundsMine.error.title': 'Impossible de charger vos sons',
  'soundsMine.untitled': 'Son original',
  'soundsMine.posts.one': '{count} publication',
  'soundsMine.posts.other': '{count} publications',
  'soundsMine.action.remove': 'Retirer de ma bibliothèque',
  'soundsMine.remove.title': 'Retirer ce son de votre bibliothèque ?',
  'soundsMine.remove.confirm': 'Retirer',
  'soundsMine.remove.body.unused': 'Ce son disparaîtra de votre bibliothèque et ne pourra plus être ajouté à une publication.',
  'soundsMine.remove.body.one': '{count} publication l’utilise encore : elle continuera de le jouer. Il disparaîtra de votre bibliothèque et ne pourra plus être ajouté à une nouvelle publication.',
  'soundsMine.remove.body.other': '{count} publications l’utilisent encore : elles continueront de le jouer. Il disparaîtra de votre bibliothèque et ne pourra plus être ajouté à une nouvelle publication.',
  'soundsMine.remove.success': 'Son retiré de votre bibliothèque',
  'soundsMine.remove.failure': 'Le son n’a pas pu être retiré. Réessayez.',
  'soundsMine.offline': 'Hors ligne — le retrait sera possible au retour du réseau.',
} as const;

export default frSoundsMine;
