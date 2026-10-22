/**
 * L'INACTIVITÉ DU NAVIGATEUR — `requestIdleCallback`, ou un délai court là où il manque (Safari). Module
 * MINUSCULE à dessein : la bande du haut (dans l'entrée) l'importe pour monter l'hôte des invitations au repos
 * (#10174) ; l'importer depuis `screen-preload.ts` faisait entrer la table de préchargement des écrans dans la
 * première peinture (+0,5 Ko gzip mesurés). `screen-preload.ts` le ré-exporte : ses lecteurs ne changent pas.
 */
export type IdleScheduler = (run: () => void) => void;

export const browserIdle: IdleScheduler = (run) => {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => run(), { timeout: 2_000 });
  else setTimeout(run, 200);
};
