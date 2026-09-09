/**
 * **Partager Meeshy — le seul démarrage que la v3.1 sache VRAIMENT offrir.**
 *
 * L'état vide de la liste récite depuis toujours « Un message, une story, un
 * mood, un post — ou invitez vos amis » et n'offre AUCUN de ces gestes : la
 * v3.1 n'a ni composeur, ni contacts, ni découverte. Des quatre promesses, une
 * seule peut être tenue aujourd'hui sans route ni écran neuf, et c'est la
 * dernière — inviter quelqu'un.
 *
 * C'est exactement l'« effet minimal » que la revue #5559 avait nommé en
 * retirant les deux boutons sans porte de l'en-tête : « une copie
 * presse-papier avec retour visible ». On ne repeint donc pas un contrôle qui
 * ment : on lui donne sa porte.
 *
 * `navigator.share` d'abord (c'est le geste natif sur mobile, et il ouvre la
 * vraie feuille de partage du système), le presse-papier ensuite. **Une
 * annulation n'est pas un échec** : l'utilisateur qui ferme la feuille de
 * partage a décidé, et lui copier le lien dans le dos serait un effet qu'il
 * n'a pas demandé.
 */
export type ResultatInvitation = 'partage' | 'copie' | 'annule' | 'indisponible';

export type PortailPartage = {
  readonly share?: (donnees: { title: string; text: string; url: string }) => Promise<void>;
  readonly copier?: (texte: string) => Promise<void>;
};

export const TEXTE_INVITATION = 'Rejoins-moi sur Meeshy — on s’y écrit dans nos langues.';

/**
 * Le portail est INJECTÉ plutôt que lu depuis `navigator` : c'est ce qui rend
 * les quatre issues mesurables sans navigateur, et ce qui empêche le témoin de
 * se contenter d'affirmer que la fonction existe.
 */
export function portailDuNavigateur(): PortailPartage {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as Navigator & {
    share?: (donnees: ShareData) => Promise<void>;
    clipboard?: { writeText: (texte: string) => Promise<void> };
  };
  // `exactOptionalPropertyTypes` : une clé optionnelle s'OMET, elle ne se pose
  // pas à `undefined` — d'où la composition par épandage conditionnel.
  const partage = typeof nav.share === 'function'
    ? { share: (d: { title: string; text: string; url: string }) => nav.share!(d) }
    : {};
  const copie = nav.clipboard && typeof nav.clipboard.writeText === 'function'
    ? { copier: (t: string) => nav.clipboard!.writeText(t) }
    : {};
  return { ...partage, ...copie };
}

export async function partagerInvitation(
  lien: string,
  portail: PortailPartage = portailDuNavigateur(),
): Promise<ResultatInvitation> {
  if (portail.share) {
    try {
      await portail.share({ title: 'Meeshy', text: TEXTE_INVITATION, url: lien });
      return 'partage';
    } catch (erreur) {
      // Fermer la feuille de partage est une DÉCISION, pas une panne : on ne
      // retombe pas sur le presse-papier, sinon annuler produirait quand même
      // un effet — le contraire de ce que le geste demandait.
      if (erreur instanceof Error && erreur.name === 'AbortError') return 'annule';
    }
  }
  if (portail.copier) {
    try {
      await portail.copier(lien);
      return 'copie';
    } catch {
      return 'indisponible';
    }
  }
  return 'indisponible';
}

/**
 * Ce que l'utilisateur DOIT s'entendre dire — et ce qu'il ne doit pas.
 *
 * `partage` et `annule` rendent `null` : la feuille du système a déjà parlé
 * dans les deux cas, et redoubler d'un message par-dessus est du bruit. Restent
 * les deux issues MUETTES, celles où rien n'a bougé à l'écran — c'est
 * exactement là qu'un retour est dû.
 */
export const RETOUR_INVITATION: Record<ResultatInvitation, string | null> = {
  partage: null,
  annule: null,
  copie: 'Lien copié — il ne reste qu’à le coller.',
  indisponible: 'Impossible de partager ici. Copiez l’adresse de cette page.',
};
