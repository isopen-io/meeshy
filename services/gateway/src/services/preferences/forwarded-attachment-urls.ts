/**
 * La deuxième porte de la réciprocité des sources de transfert : l'URL.
 *
 * `forward-source-visibility` tait le NOM de l'auteur d'origine. Il ne suffit
 * pas. Un transfert ne recopie pas le fichier — il réutilise le chemin de
 * stockage de l'original, et ce chemin est `AAAA/MM/<User.id>/<nom>`. La même
 * réponse qui refusait de nommer l'auteur livrait donc son identifiant dans
 * `fileUrl` et `thumbnailUrl`, en clair, quelles que soient les préférences des
 * deux parties. La fuite était STRUCTURELLE : elle ne dépendait d'aucun
 * réglage, et un client modifié n'avait qu'à lire l'URL.
 *
 * On ne recopie pas le fichier pour autant — ce serait payer en octets une
 * question d'ADRESSAGE. La gateway sert déjà les mêmes contenus par identifiant
 * (`GET /attachments/:id` et `/attachments/:id/thumbnail`, `download.ts`), une
 * forme qui ne porte aucun chemin. Quand la source doit être tue, c'est cette
 * forme-là qui est servie : mêmes octets, même autorisation, aucune identité.
 *
 * La racine publique est DÉRIVÉE de l'URL déjà stockée, jamais relue de
 * l'environnement : l'adresse réécrite reste ainsi exactement sur l'hôte qui
 * servait l'originale, y compris derrière un proxy ou sur un déploiement dont
 * `PUBLIC_URL` a changé depuis l'envoi.
 *
 * La réécriture ne vise QUE les pièces jointes transférées. Une pièce jointe
 * ordinaire porte le chemin de son propre auteur, qui est l'expéditeur déjà
 * nommé par le message : la masquer n'apprendrait rien à personne et coûterait
 * une redirection à chaque image du fil.
 */

import { apiPath } from '@meeshy/shared/api/prefix';

/** Ce que la réécriture a besoin de lire, et rien de plus. */
export type ForwardedAttachmentUrls = {
  readonly id?: string | null;
  readonly forwardedFromAttachmentId?: string | null;
  readonly isForwarded?: boolean | null;
  readonly fileUrl?: string | null;
  readonly thumbnailUrl?: string | null;
};

/**
 * Littéral DÉLIBÉRÉ, et non un oubli de la migration `apiPath()` (#4324).
 *
 * Ce chemin ne COMPOSE aucune adresse : il DÉCOUPE une URL déjà STOCKÉE en
 * base (`MessageAttachment.fileUrl`, 198 documents sur staging). Le passer à
 * `apiPath()` le ferait suivre `MEESHY_API_VERSION` — et le jour où la version
 * change, `originOf` cesserait de reconnaître les URL écrites sous l'ancienne,
 * donc rendrait `null` sur toute la population héritée.
 *
 * Un littéral qui LIT de la donnée écrite n'a pas la même règle qu'un littéral
 * qui ÉCRIT une adresse : le premier est daté par la DONNÉE, le second par la
 * CONFIGURATION.
 *
 * Le rapprochement avec `route-usage.service.ts`, écrit ici le 2026-08-31, était
 * FAUX et a été retiré : ses clés sont comparées à la route MONTÉE, donc datées
 * par la configuration — elles sont passées à `apiPath()` (`b6b0c82af5`). Les
 * deux littéraux se ressemblaient ; seule la question « d'où vient la chaîne
 * qu'on compare ? » les sépare.
 */
const FILE_ROUTE = '/api/v1/attachments/file/';

const isForwardedCopy = (attachment: ForwardedAttachmentUrls): boolean =>
  Boolean(attachment.isForwarded || attachment.forwardedFromAttachmentId);

/**
 * La racine publique telle que l'URL stockée la porte — `null` si l'URL n'a pas
 * la forme attendue (chemin relatif hérité, hôte externe), auquel cas on ne
 * fabrique pas d'adresse : on retire.
 */
const originOf = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const cut = url.indexOf(FILE_ROUTE);
  return cut > 0 ? url.slice(0, cut) : null;
};

/**
 * Rend la pièce jointe adressée par IDENTIFIANT si elle est une copie de
 * transfert, telle quelle sinon.
 *
 * Quand l'identifiant manque, ou que l'URL stockée n'expose pas de racine
 * exploitable, les adresses sont RETIRÉES plutôt que servies en clair : taire
 * vaut mieux que fuir. Le cas ne se produit pas sur une lecture Prisma, qui
 * sélectionne toujours l'identifiant.
 */
export const redactForwardedAttachmentUrls = <T extends ForwardedAttachmentUrls>(
  attachment: T,
): T => {
  if (!isForwardedCopy(attachment)) return attachment;

  // La racine n'est plus dérivable depuis le volet A de #4324 : ce qui est
  // stocké est la CLÉ (`2026/08/<User.id>/photo.png`), sans hôte ni route.
  // Exiger une racine faisait retomber `base` à `null` et partir la pièce
  // jointe transférée SANS AUCUNE adresse — le sens sûr, mais un média
  // invisible pour tout transfert depuis le 2026-08-29.
  //
  // Un chemin RELATIF suffit, et c'est la décision du porteur (2026-08-31,
  // « c'est le client qui décide quelle API attaquer ») : les trois résolveurs
  // préfixent déjà un chemin à barre initiale par leur origine. La racine
  // dérivée reste prioritaire quand elle EXISTE — une URL stockée sur un autre
  // hôte continue d'y pointer, contrat inchangé.
  const origin = originOf(attachment.fileUrl) ?? originOf(attachment.thumbnailUrl) ?? '';
  const base = attachment.id ? `${origin}${apiPath(`/attachments/${attachment.id}`)}` : null;

  return {
    ...attachment,
    fileUrl: base,
    thumbnailUrl: attachment.thumbnailUrl ? (base ? `${base}/thumbnail` : null) : attachment.thumbnailUrl ?? null,
  };
};

/** La même règle, appliquée à la liste d'un message. */
export const redactForwardedAttachmentUrlsIn = <T extends ForwardedAttachmentUrls>(
  attachments: ReadonlyArray<T> | null | undefined,
): ReadonlyArray<T> | null | undefined =>
  attachments ? attachments.map(redactForwardedAttachmentUrls) : attachments;
