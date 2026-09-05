/**
 * LA COPIE DU FIL DE RÉELS CONNECTÉ (`/feed/reels`, #5032).
 *
 * ELLE NE PORTE QUE L'ÉTAT VIDE. Tout le reste — l'en-tête, la scène, la puce
 * du Prisme, « Réel suivant », le formulaire de réponse — vient de `REEL`
 * (`lib/contenu/partage.ts`), la copie que `/reels/:id` sert déjà. Recopier ici
 * « Réel suivant » ou « Changer la langue » aurait fait deux vocabulaires pour
 * un seul lecteur : le même écran dirait deux mots selon l'adresse par laquelle
 * on y arrive.
 */
export const REELS_DU_FIL = {
  videTitre: 'Rien à découvrir pour l’instant',
  videCorps:
    'Les réels de vos contacts et des personnes que vous suivez apparaissent ici. Il n’y en a aucun de neuf — revenez plus tard.',
  versLeFil: 'Voir le fil',
  versLAccueil: 'Retour à l’accueil',
} as const;
