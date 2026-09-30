/**
 * LES CHUNKS DE L'APERÇU DE CONVERSATION (#8821) — l'hôte (monté par la
 * coquille) et l'écran du fil qu'il pose. Chargés à la DEMANDE, et préchauffés
 * dès que le doigt touche la bannière : quand le tirage aboutit, le fil est
 * déjà là, et son cache de messages aussi — l'aperçu s'ouvre sans squelette.
 */
export const loadConversationPreviewHost = () => import('./conversation-preview-host');

export const loadThreadScreen = () => import('@/routes/thread');

/** Un préchauffage raté ne coûte rien : l'ouverture rejoue le chargement et en montre l'échec, elle. */
export const preloadConversationPreview = (): Promise<unknown> =>
  Promise.all([loadConversationPreviewHost(), loadThreadScreen()]).catch(() => undefined);
