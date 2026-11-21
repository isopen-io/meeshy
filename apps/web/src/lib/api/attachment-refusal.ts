/**
 * LE REFUS D'UN ENVOI DONT LA PIÈCE JOINTE N'EXISTE PLUS (#19865).
 *
 * `admitMessageAttachments`
 * (`services/gateway/src/services/messaging/attachmentSendAdmission.ts`) refuse
 * un envoi dont un `attachmentId` ne désigne plus une pièce VIVANTE de
 * l'expéditeur. Le transport REST sert alors ce code sur son 404
 * (`routes/conversations/messages-send.ts`), et c'est la SEULE chose qui dit à
 * un client que le chemin de réparation est de RE-TÉLÉVERSER depuis le fichier
 * qu'il a gardé, plutôt que d'abandonner l'envoi.
 *
 * **Le code est SURCHARGÉ, et le doc-comment doit le dire** — la route en
 * énumère quatre causes, dont une pour laquelle re-téléverser est un gâchis :
 *
 * | la cause | re-téléverser est |
 * |---|---|
 * | la pièce a été balayée (24–48 h sans message porteur) | **le seul chemin** |
 * | l'id est inconnu, ou appartient à quelqu'un d'autre | juste — la copie naît sous l'identité courante |
 * | elle est déjà portée par un AUTRE message | juste — celle-là ne se déplacera pas |
 * | « pas encore visible par ce chemin » (lecture en retard) | **du gâchis** : un rejeu à l'identique aurait abouti |
 *
 * Le dernier cas coûte un second téléversement du lot entier et une copie
 * orpheline de plus ; il n'est pas FAUX (la reprise aboutit), et le distinguer
 * demande un code au serveur — c'est #19918, pas une devinette ici.
 *
 * **La chaîne est GARDÉE DES DEUX CÔTÉS.** La passerelle la fige par
 * `__tests__/unit/routes/conversations/messages-send-attachment-admission.test.ts`
 * (`expect(res.json().code).toBe('ATTACHMENT_NOT_FOUND')`, deux sites) : la
 * renommer là-bas fait rougir chez elle, et c'est ce qui autorise le web à
 * déclarer la constante plutôt qu'à la partager par `@meeshy/shared` — même
 * discipline que son voisin `ATTACHMENT_RIGHT_NOT_PERMITTED`.
 *
 * **Il vit dans son propre module, et pas à côté du port d'upload** : trois
 * sites le lisent, dans deux couches — la règle de PERMANENCE
 * (`api/outcome.ts`), le chemin d'envoi (`send/perform-send.ts`) et la phrase
 * servie (`send/failure-reason.ts`). `api/outcome.ts` est le prédicat
 * GÉNÉRIQUE de l'issue d'un appel : lui faire importer le port d'upload
 * (`api/attachments.ts`, et par lui `api/conversations.ts` et `api/fixtures.ts`)
 * lui ferait porter une couche entière pour une chaîne. *(Ce commentaire a
 * d'abord invoqué un CYCLE d'imports — mesuré faux : la dépendance
 * d'`attachments.ts` vers `conversations.ts` est un `import type`, effacé à la
 * compilation, et `conversations.ts` n'importe pas `outcome.ts`. La décision
 * tient, sa raison d'alors non.)*
 *
 * **Ce que ce code NE dit pas.** Un refus de DROIT
 * (`ATTACHMENT_RIGHT_NOT_PERMITTED`, `attachmentKindAdmission.ts`) porte sur le
 * TYPE de la pièce dans cette conversation : re-téléverser n'y changerait rien,
 * et la phrase à l'utilisateur est autre. Les deux ne se confondent jamais.
 */
export const ATTACHMENT_NOT_FOUND = 'ATTACHMENT_NOT_FOUND';

/**
 * LE REFUS QUE LE CLIENT RÉPARE LUI-MÊME — vrai quand l'entrée d'envoi porte
 * encore de quoi recommencer (le `File`, conservé par la file durable), et que
 * la seule chose à jeter est l'identifiant mémorisé.
 *
 * **Le STATUT est exigé autant que le code.** `ATTACHMENT_NOT_FOUND` est servi
 * ailleurs dans le dépôt (`routes/posts/core.ts`, `AttachmentTranslateService`)
 * et rien n'interdit qu'une route future le pose sur un 403 ou un 409, où
 * oublier des ids n'aurait aucun sens. Un prédicat qui ne regarde que le code
 * est une porte ouverte sur tout ce qui portera ce mot.
 */
export const isStaleAttachmentRefusal = (
  failure: { readonly status: number; readonly code?: string } | undefined,
): boolean => failure?.status === 404 && failure.code === ATTACHMENT_NOT_FOUND;
