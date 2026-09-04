/**
 * LES ADRESSES DU FIL — l'ANCRE d'un message, la TRANCHE qui le contient, et
 * l'ÉTAT « plein écran » d'une pièce. Trois règles minuscules, un seul site :
 * elles sont écrites par le serveur (`app/connecte/fil-lignes.ts`,
 * `plein-vue.ts`, les deux portes) ET par le module de participation
 * (`lib/realtime/fil-peinture.ts`), et la ligne peinte doit mener EXACTEMENT
 * où mène la ligne servie.
 *
 * L'ANCRE est le seul mécanisme de SAUT du fil (§ 12.10.1) : un lien de
 * fragment, que le navigateur suit sans un octet de JavaScript et que `:target`
 * met en évidence. Elle sert déjà au Post/Redirect/Get, qui cadre la bulle
 * envoyée (`app/connecte/fil-porte.ts`) — trois écritures de la même chaîne,
 * désormais une.
 *
 * LE PLEIN ÉCRAN est un ÉTAT DE L'ADRESSE HÔTE, pas une adresse à lui : c'est
 * ce qui permet de l'ouvrir et de le fermer par un `<a href>` — donc sans un
 * octet de JavaScript (§ 12.10.6) — et ce qui lui interdit d'ajouter un motif
 * de budget, un état de la même adresse étant servi par le même document. C'est
 * la forme que le porteur a tranchée pour le profil d'un participant
 * (§ 12.10.3 point 2), et elle vaut ici pour la même raison.
 *
 * ET IL NOMME SON MESSAGE (`autour=`), PAS SEULEMENT SA PIÈCE. Une adresse qui
 * ne portait que `?media=<pièce>` désignait une pièce dans une tranche que rien
 * ne nommait : la porte re-servait alors la tranche PAR DÉFAUT (les 40 derniers
 * messages), où la pièce d'un message plus ancien n'est pas — donc AUCUNE
 * surimpression, et la page d'historique perdue par-dessus le marché. Le geste
 * était mort sur tout ce qui n'était pas récent : sur la page `?avant=` (sans
 * JavaScript) comme sur l'historique chargé EN PLACE par le module
 * (`participate.ts`, `plusAncien`), c'est-à-dire sur la quasi-totalité des
 * médias d'une conversation vivante.
 *
 * `autour` est donc porté par le lien lui-même, et la porte sert la tranche
 * AUTOUR de ce message (`around=` de `GET /conversations/:id/messages`,
 * `services/gateway/src/routes/conversations/messages-list.ts:400-450`). Trois
 * conséquences :
 *
 *   1. le lien SERVI et le lien PEINT se composent de la même façon — le
 *      serveur connaît sa tranche, le module ne la connaît pas, et ni l'un ni
 *      l'autre n'a besoin de la connaître ;
 *   2. l'adresse d'un média est SUFFISANTE : elle s'ouvre à n'importe quelle
 *      profondeur d'historique, collée dans une autre fenêtre comme suivie
 *      depuis la page ;
 *   3. le RETOUR de la croix rend la tranche autour du même message, cadrée sur
 *      lui : on revient là où l'on regardait, jamais au bas du fil.
 */

/** Le paramètre qui porte l'état « plein écran » — lu par les deux portes du fil. */
export const PARAM_DU_PLEIN = 'media';

/** Le paramètre qui porte la TRANCHE — le message autour duquel la porte sert le fil. */
export const PARAM_DE_L_ANCRE = 'autour';

/** L'identifiant DOM d'une ligne — ce que `id=` porte et ce que l'ancre vise. */
export const identifiantDuMessage = (id: string): string => `m-${id}`;

export const ancreDuMessage = (id: string): string => `#${encodeURIComponent(identifiantDuMessage(id))}`;

/** L'adresse de la porte, cadrée sur un message — la cible du Post/Redirect/Get. */
export const adresseDuMessage = (adresse: string, id: string): string => `${adresse}${ancreDuMessage(id)}`;

/**
 * L'adresse de la porte, servie AUTOUR d'un message — la tranche qui le
 * contient, à coup sûr. `adresse` est en général NUE (`adresseDeLaPorte`,
 * sans `?`), mais la galerie des médias (`app/connecte/medias-vue.ts`) y
 * passe sa propre adresse déjà FILTRÉE (`?genre=…`, `lib/api/medias.ts`) : le
 * séparateur s'adapte, sous peine du bogue mesuré une fois — un second `?`
 * dans la chaîne, que `URL().searchParams` ne coupe QUE sur `&`, si bien que
 * `autour=` finissait comme une queue collée à la valeur de `genre=` et
 * n'était jamais lu.
 */
export const adresseAutourDuMessage = (adresse: string, messageId: string): string =>
  `${adresse}${adresse.includes('?') ? '&' : '?'}${PARAM_DE_L_ANCRE}=${encodeURIComponent(messageId)}`;

/** L'ouverture : la tranche qui porte la pièce, et la pièce. */
export const adresseDuPlein = (adresse: string, messageId: string, pieceId: string): string =>
  `${adresseAutourDuMessage(adresse, messageId)}&${PARAM_DU_PLEIN}=${encodeURIComponent(pieceId)}`;

/** La fermeture : la MÊME tranche, cadrée sur le message d'où la pièce vient. */
export const adresseDuRetourDuPlein = (adresse: string, messageId: string): string =>
  adresseDuMessage(adresseAutourDuMessage(adresse, messageId), messageId);
