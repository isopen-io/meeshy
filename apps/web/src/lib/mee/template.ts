/** Le préfixe des gabarits de ce catalogue dans le `templateId` d'un message (#9034) — sans charger le catalogue. */
export const MEE_TEMPLATE_PREFIX = 'mee.';

export const isMeeTemplate = (templateId: string | undefined): templateId is string =>
  templateId !== undefined && templateId.startsWith(MEE_TEMPLATE_PREFIX);
