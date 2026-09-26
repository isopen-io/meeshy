/**
 * LES LIENS D'E-MAIL À JETON, QUE LE SERVICE WORKER LAISSE AU RÉSEAU (#8053).
 *
 * `NavigationRoute` répond à toute navigation par la coquille PRÉCACHÉE. Sous
 * `registerType: 'prompt'` (#6936), un worker neuf attend qu'on clique
 * « Mettre à jour » : tant qu'un onglet reste ouvert, la coquille servie est
 * celle de la version PRÉCÉDENTE. Recette staging du 2026-09-26 : le lien
 * « Vérifier mon adresse » ouvrait l'écran du code — la coquille d'avant #8034,
 * qui ne lisait pas `?token=` — et nginx n'a jamais vu le document demandé.
 *
 * Un jeton d'e-mail est à usage unique et ne se consomme qu'en ligne : laisser
 * sa navigation au réseau ne retire rien au hors-ligne, et la page qui le
 * consomme est celle que le serveur sert maintenant. Seules les adresses qui
 * PORTENT `token=` sont visées ; l'écran nu reste à la coquille.
 *
 * Workbox confronte chaque motif à `pathname + search` ; aucun motif ne porte
 * `g` ni `y` (Workbox rejoue `test` sur la même instance).
 */
export const EMAIL_TOKEN_NAVIGATIONS: readonly RegExp[] = [
  /^\/(?:auth\/verify-email|auth\/magic-link(?:\/validate)?|reset-password|account\/deletion|settings\/verify-email-change)\/?\?(?:[^#]*&)?token=/,
];
