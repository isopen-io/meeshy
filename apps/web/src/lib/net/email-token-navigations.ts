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
 *
 * #10859 — les liens neufs portent leur jeton dans le FRAGMENT, que Workbox ne
 * voit pas : la passerelle y joint `via=email`, sans rien de secret, et c'est
 * ce marqueur qui envoie la page au réseau. Une coquille précachée d'avant ce
 * lot ne saurait pas lire le fragment. `token=` reste reconnu pour les e-mails
 * déjà partis — et pour le `token=` VIDE que les liens neufs portent à
 * l'intention d'un service worker d'avant ce lot encore actif. Les ALIAS
 * `/auth/email-link/…` (liens magiques et de vérification, hors de portée des
 * applications publiées) sont ramenés à leur adresse canonique par la page.
 */
const EMAIL_TOKEN_PAGES =
  'auth\\/verify-email|auth\\/magic-link(?:\\/validate)?|auth\\/email-link\\/(?:magic-link|verify-email|reset-password)|auth\\/revoke-sessions|reset-password|account\\/deletion|settings\\/verify-email-change';

export const EMAIL_TOKEN_NAVIGATIONS: readonly RegExp[] = [
  new RegExp(`^\\/(?:${EMAIL_TOKEN_PAGES})\\/?\\?(?:[^#]*&)?(?:token=|via=email(?:&|#|$))`),
];
