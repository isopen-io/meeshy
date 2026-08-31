'use server';

import { redirect } from 'next/navigation';

import { lisLaPlaceServie, poseLEntreeDansLeFil } from '@/lib/api/session-invitee-cookie';

/**
 * « ENTRER DANS LA CONVERSATION » — le CTA que la cible `rights` dessine, et
 * qui n'avait aucun effet tant que le fil n'existait pas.
 *
 * La loi 4 interdit un contrôle SANS effet ; le doc-comment de `VueDesDroits`
 * l'avait donc écarté en attendant cet écran, en nommant le jour où il
 * reviendrait. C'est ce jour.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IL NE CHANGE PAS D'ADRESSE, ET C'EST LE POINT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le § 6.3 B pose `/chats/:lien` comme UNE route dans plusieurs états : « en
 * fabriquer une seconde aurait donné deux URL pour un seul lieu, et cassé le
 * retour arrière du navigateur ». Ce geste ne navigue donc pas ailleurs — il
 * pose le marqueur d'entrée et revient à la MÊME adresse, où l'écran suivant
 * est le fil.
 *
 * Il ne touche à AUCUNE porte de la passerelle : entrer dans le fil n'est pas
 * une admission, la place est déjà prise. C'est ce qui le rend sûr — un geste
 * qui ne coûte rien au serveur peut être refait autant de fois qu'on veut.
 *
 * Une place absente ne fait pas d'erreur : elle renvoie simplement à la même
 * adresse, où l'écran rend le formulaire d'entrée. C'est la seule réponse juste
 * quand le cookie a été effacé entre le rendu du bouton et son appui.
 */
export const entrerDansLeFil = async (segment: string): Promise<void> => {
  const place = await lisLaPlaceServie(segment);
  if (place !== null) await poseLEntreeDansLeFil(place.cle);

  redirect(`/chats/${encodeURIComponent(segment)}`);
};
