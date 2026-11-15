/**
 * La borne partagée des fan-outs de notification — extrait de
 * `NotificationService.ts` (#7093).
 */

/**
 * Borne appliquée à chaque lecture de graphe qui alimente un fan-out de
 * notification. Elle tient le coût sur un post viral ou un auteur à très grand
 * carnet — et elle est nommée pour que le seuil de saturation soit LE MÊME que
 * celui écrit dans le `take` : une constante partagée ne peut pas dériver du
 * test qui la surveille.
 *
 * Les requêtes prennent `FANOUT_ROW_CAP + 1`. La ligne excédentaire est un
 * TÉMOIN, jamais un destinataire : elle est lue, comptée, puis jetée par un
 * `slice`, de sorte que la borne de DIFFUSION reste à sa valeur pendant que sa
 * saturation devient dicible. Sans elle, il faudrait déduire la troncature de
 * « la requête a rendu autant de lignes que la borne » — ce qui déclare tronqué
 * un seau de très exactement `FANOUT_ROW_CAP` engagés, alors qu'il est complet,
 * et fait crier au loup à chaque publication d'un auteur à exactement 500 amis.
 *
 * Portée du témoin : sur une requête sans `distinct` (les amitiés) il est EXACT —
 * une 501e ligne existe si et seulement si la base en avait plus de 500. Sur une
 * requête `distinct` (commentaires, réactions) il reste un signal SUFFISANT : il
 * ne se déclenche jamais à tort, mais il peut se taire sur une troncature que la
 * déduplication a repliée en deçà de la borne. Le seau où la troncature est de
 * loin la plus probable — un auteur à plus de 500 amis est banal, un post à plus
 * de 500 commentateurs distincts ne l'est pas — est celui où le compte est exact.
 */
export const FANOUT_ROW_CAP = 500;
