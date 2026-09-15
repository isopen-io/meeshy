/**
 * LES PHRASES QUE DEUX ÉCRANS D'AUTHENTIFICATION DOIVENT DIRE À L'IDENTIQUE
 * (#6583).
 *
 * Une phrase recopiée dans deux écrans est une jumelle : elle diverge au
 * premier correctif, et c'est l'un des deux lecteurs qui paie. Ce module n'a
 * donc qu'une règle — n'y mettre que ce que PLUSIEURS hôtes disent, jamais la
 * copie d'un seul écran, qui vit chez lui.
 */

/**
 * CE QUE LA PASSERELLE NE DIT PAS, ET QUE L'ÉCRAN DOIT DIRE (#6404, étendu par
 * #6583).
 *
 * `POST /auth/magic-link/request` rend 200 même pour une adresse inconnue
 * (`MagicLinkService.ts:133-137`, anti-énumération) et `POST /auth/forgot-password`
 * fait de même (`password-reset.ts`, `resolveForgotPasswordOutcome` rend le
 * MÊME écran pour 200 et 404) : ni l'un ni l'autre écran ne peut promettre que
 * l'e-mail part, ni le démentir. Ce qu'ils PEUVENT faire, c'est nommer la
 * première cause d'un e-mail « jamais reçu » — le dossier indésirables — et
 * dire au bout de combien de temps s'inquiéter. La directive porteur
 * 2026-09-13 le demande mot pour mot : « préciser dans l'interface de regarder
 * les spams si aucun e-mail ne parvient dans la minute » ; celle du 2026-09-14
 * range `/forgot-password` avec `/login`, et cette attente-là est la même.
 */
export const SPAM_HINT = 'Rien reçu après une minute ? Regardez vos indésirables (spam) — le message peut y être tombé.';
