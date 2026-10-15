/**
 * LES PHRASES QUE PLUSIEURS ÉCRANS D'ENTRÉE DOIVENT DIRE À L'IDENTIQUE
 * (#6583, #6626).
 *
 * Une phrase recopiée dans deux écrans est une jumelle : elle diverge au
 * premier correctif, et c'est l'un des deux lecteurs qui paie. Ce module n'a
 * donc qu'une règle — n'y mettre que ce que PLUSIEURS hôtes disent, jamais la
 * copie d'un seul écran, qui vit chez lui.
 *
 * **Des TEXTES, pas des `InfoHint`.** Un `InfoHint` porte un TRACÉ
 * (`components/info-hint.tsx`), donc un import de composant ; le mettre ici
 * ferait descendre `lib/view` dans `components`, à contresens de la pile.
 * Chaque hôte compose son `InfoHint` à partir de ces chaînes — le glyphe est
 * son affaire, le MOT est commun.
 */

/* « Comment ça marche » et sa réponse vivent au catalogue d'interface
   (`magicLink.howItWorks*`, #10007) : la connexion se lit dans les sept
   langues, et le panneau du lien par e-mail en est l'unique hôte. */

export const NOTHING_RECEIVED_LABEL = 'Rien reçu ?';

/**
 * CE QUE LA PASSERELLE NE DIT PAS, ET QUE L'ÉCRAN DOIT DIRE (#6404, replié par
 * #6626, PARTAGÉ par #6583).
 *
 * `POST /auth/magic-link/request` rend 200 même pour une adresse inconnue
 * (`MagicLinkService.ts:133-137`, anti-énumération) et `POST /auth/forgot-password`
 * fait de même (`resolveForgotPasswordOutcome` rend le MÊME écran pour 200 et
 * 404) : ni l'un ni l'autre ne peut promettre que l'e-mail part, ni le
 * démentir. Ce qu'ils PEUVENT faire, c'est nommer la première cause d'un e-mail
 * « jamais reçu ». Les deux écrans attendent la même chose ; ils le disent donc
 * avec les mêmes mots.
 */
export const NOTHING_RECEIVED_TEXT = 'Regardez vos indésirables (spam) : le message peut y être tombé.';
