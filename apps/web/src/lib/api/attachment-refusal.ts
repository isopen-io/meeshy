/**
 * LE REFUS D'UN ENVOI DONT LA PIÈCE JOINTE N'EXISTE PLUS (#19865).
 *
 * `admitMessageAttachments`
 * (`services/gateway/src/services/messaging/attachmentSendAdmission.ts`) refuse
 * un envoi dont un `attachmentId` ne désigne plus une pièce VIVANTE de
 * l'expéditeur — inconnue, déjà balayée faute d'avoir rejoint un message en
 * 24 h, ou déjà portée par un autre message. Le transport REST sert alors ce
 * code sur son 404 (`routes/conversations/messages-send.ts`), et c'est la SEULE
 * chose qui dit à un client que le chemin de réparation est de RE-TÉLÉVERSER
 * depuis le fichier qu'il a gardé, et non d'abandonner l'envoi.
 *
 * **La chaîne est GARDÉE DES DEUX CÔTÉS.** La passerelle la fige par
 * `__tests__/unit/routes/conversations/messages-send-attachment-admission.test.ts`
 * (`expect(res.json().code).toBe('ATTACHMENT_NOT_FOUND')`, deux sites) : la
 * renommer là-bas fait rougir chez elle, et c'est ce qui autorise le web à
 * déclarer la constante plutôt qu'à la partager par `@meeshy/shared` — même
 * discipline que son voisin `ATTACHMENT_RIGHT_NOT_PERMITTED`.
 *
 * **Il vit dans son propre module, et pas à côté du port d'upload** : la règle
 * de PERMANENCE (`api/outcome.ts`) le lit autant que le chemin d'envoi
 * (`send/perform-send.ts`) et la phrase servie (`send/failure-reason.ts`) ;
 * `api/attachments.ts` dépend d'`api/conversations.ts`, qui ramènerait un cycle
 * jusqu'ici.
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
 */
export const isStaleAttachmentRefusal = (failure: { readonly code?: string } | undefined): boolean =>
  failure?.code === ATTACHMENT_NOT_FOUND;
