/**
 * LA COPIE DU PROFIL D'UN PARTICIPANT (§ 12.10.3) — vit sous `lib/` comme
 * `fil.ts` et `liste.ts` : un seul texte, servi par les TROIS hôtes
 * (`/chats/:cle`, `/chat/:lien`, `/chats`) depuis un seul module de vue
 * (`app/connecte/profil-vue.ts`).
 */
export const PROFIL = {
  fermer: 'Fermer le profil',
  pasEncoreAmis: 'Pas encore amis',
  ami: 'Ami',
  demandeEnvoyee: 'Demande envoyée',
  demandeRecue: 'Demande reçue',
  cEstVous: 'C’est vous',
  ecrire: (prenom: string): string => `Écrire à ${prenom}`,
  ajouterEnAmi: 'Ajouter en ami',
  bloquerOuSignaler: 'Bloquer ou signaler',
  confirmerLeBlocage: (nom: string): string => `Bloquer ${nom} ?`,
  confirmerLeBlocagePrecision: 'Cette personne ne pourra plus vous écrire ni voir votre profil.',
  confirmer: 'Confirmer le blocage',
  annuler: 'Annuler',
  ecritDansCeFil: (langue: string): string => `Écrit en ${langue} dans ce fil`,
  lecteurPrisme: (langue: string): string => `Vous la lisez en ${langue} — le Prisme traduit à l’arrivée.`,
  membreDepuis: (date: string): string => `Sur Meeshy depuis ${date}`,
  membreDuCompte: 'Membre du compte, pas un invité de lien.',
  participeA: (titre: string): string => `Participe à ${titre}`,
  conversationEnCommun: 'Vous avez cette conversation en commun.',
  introuvable: 'Profil introuvable',
  introuvablePrecision: 'Cette personne n’a pas — ou plus — de profil accessible.',
  limiteTitre: 'Patientez un instant',
  panneTitre: 'Profil indisponible',
  panne: 'Le profil n’a pas pu être chargé. Réessayez.',
  refus: 'Le geste n’a pas pu être enregistré. Réessayez.',
} as const;
