/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const frAccountDeletionGuide = {
  'accountDeletion.guide.title': 'Supprimer votre compte Meeshy',
  'accountDeletion.guide.intro': 'Cette page concerne l’application Meeshy, sur Android, iOS et le web. Elle explique comment supprimer votre compte et ce que deviennent vos données.',
  'accountDeletion.guide.steps.title': 'Comment faire',
  'accountDeletion.guide.step.signIn': 'Connectez-vous avec le bouton ci-dessous. Dans l’application, la même demande se trouve dans Réglages, Supprimer le compte.',
  'accountDeletion.guide.step.confirm': 'Tapez la phrase de confirmation et votre mot de passe, puis demandez la suppression.',
  'accountDeletion.guide.step.email': 'Ouvrez l’e-mail que nous vous envoyons et confirmez la suppression.',
  'accountDeletion.guide.step.wait': 'Votre compte est supprimé 30 jours plus tard. Vous n’avez rien d’autre à faire.',
  'accountDeletion.guide.signIn': 'Se connecter pour supprimer mon compte',
  'accountDeletion.guide.deleted.title': 'Ce qui est supprimé',
  'accountDeletion.guide.deleted.profile': 'Votre profil : nom, pseudo, e-mail, numéro de téléphone, photo, bannière, biographie et date de naissance.',
  'accountDeletion.guide.deleted.access': 'Votre mot de passe, vos sessions et vos clés de chiffrement.',
  'accountDeletion.guide.deleted.messages': 'Le texte de vos messages et leurs traductions, vos photos, vidéos et messages vocaux.',
  'accountDeletion.guide.deleted.other': 'Votre profil vocal, votre carnet d’adresses, vos notifications, vos liens de partage, votre progression de jeu et vos stickers.',
  'accountDeletion.guide.kept.title': 'Ce qui est conservé',
  'accountDeletion.guide.kept.messages': 'Dans les conversations des autres, vos messages restent à leur place, vides et marqués comme supprimés.',
  'accountDeletion.guide.kept.posts': 'Le texte de vos publications et commentaires reste visible sous le nom « Compte supprimé ». Pour les retirer, supprimez-les dans l’application avant votre demande.',
  'accountDeletion.guide.kept.packs': 'Les packs de stickers que vous avez publiés restent disponibles, sans votre nom.',
  'accountDeletion.guide.kept.stats': 'Un identifiant de compte anonyme et des statistiques d’usage qui ne permettent pas de vous identifier.',
  'accountDeletion.guide.delay.title': 'Délai',
  'accountDeletion.guide.delay.body': 'Votre compte est supprimé 30 jours après votre confirmation. D’ici là, vous pouvez annuler avec le lien reçu par e-mail.',
  'accountDeletion.guide.noAccess.title': 'Vous ne pouvez plus vous connecter ?',
  'accountDeletion.guide.noAccess.body': 'Écrivez-nous depuis l’adresse e-mail de votre compte en demandant sa suppression. Nous répondons sous 30 jours.',
} as const;

export default frAccountDeletionGuide;
