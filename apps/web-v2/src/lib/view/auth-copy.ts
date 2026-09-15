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
 *
 * **Et le même texte n'est pas toujours rendu de la même façon.** `/login` rend
 * `HOW_IT_WORKS_TEXT` en CLAIR (le porteur y veut la phrase visible sous la
 * baguette, sans titre) et `/auth/magic-link` le replie derrière son (i). C'est
 * exactement pourquoi ce module tient le TEXTE et pas sa mise en scène.
 */

/** La question que le (i) répond — jamais « Plus d'infos » (§ `InfoHint.label`). */
export const HOW_IT_WORKS_LABEL = 'Comment ça marche';

/**
 * CE QUE L'UTILISATEUR A BESOIN DE SAVOIR (#6626).
 *
 * Directive porteur 2026-09-15 : « l'utilisateur a besoin de savoir qu'il va se
 * connecter par e-mail et non de savoir que c'est magic-mail… garder la
 * baguette mais être clair et simple ». Le mot « magique » ne paraît nulle part
 * à l'écran — la BAGUETTE reste l'icône de la connexion par e-mail.
 */
export const HOW_IT_WORKS_TEXT =
  'Pas de mot de passe à retenir : nous vous envoyons un lien par e-mail. Ouvrez-le et vous êtes connecté.';

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
