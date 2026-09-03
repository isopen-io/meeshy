import { COOKIE_DE_THEME } from '@/lib/api/cookies';

export const THEME_STORAGE_KEY = 'meeshy-theme';

/**
 * Le thème servi quand rien n'a encore été décidé — c'est-à-dire quand le
 * SERVEUR rend la page, où ni `localStorage` ni la préférence de l'OS
 * n'existent.
 *
 * SITE UNIQUE, et il en fallait un : la coquille racine le pose dans `class`
 * de `<html>`, `packages/design-tokens/dark.css` le porte sur `:root` nu, et
 * le script ci-dessous s'en sert comme point de départ à corriger. Trois sites
 * pour une seule décision, dont deux l'écrivaient en dur — la définition d'une
 * jumelle. Témoin : `__tests__/jetons.test.ts` § « le thème par défaut ».
 */
export const THEME_PAR_DEFAUT = 'dark';

/**
 * Le script ne fait plus que CORRIGER la classe rendue par le serveur.
 *
 * Il ne touche PLUS à `style.colorScheme` : `color-scheme` est déclaré dans la
 * table, à côté des jetons qu'il accompagne (`packages/design-tokens/dark.css`
 * et `light.css`), donc il suit la CLASSE — sans JavaScript, comme la
 * conception § 2 le demande (« color-scheme suit la classe »). Le poser ici le
 * rendait au JS seul : sans JS, la page peignait des jetons SOMBRES sous un
 * agent utilisateur en `color-scheme: normal`, donc ascenseurs, contrôles de
 * formulaire et canevas de surdéfilement BLANCS — sur le rôle PREMIER, qui est
 * justement le lecteur sans compte et sans JS lourd.
 *
 * `prefers-color-scheme` ne gouverne toujours QUE la valeur par défaut de la
 * classe, jamais un jeton : il n'entre en jeu qu'en l'absence de préférence
 * stockée.
 *
 * LE COOKIE PASSE AVANT `localStorage`, ET IL EST RECOPIÉ DEDANS.
 *
 * L'ordre n'est pas une préférence de goût : le cookie est le SEUL magasin que
 * `/settings/application` peut écrire, puisque cet écran n'a pas une ligne de
 * JavaScript et que son formulaire ne fait rien d'autre que poster (charte
 * règle 7 — un contrôle existe s'il a un effet). Lire `localStorage` d'abord
 * ferait perdre le choix au rechargement suivant : le lecteur aurait cliqué
 * « Clair » et serait revenu sombre.
 *
 * LE COOKIE PORTE TROIS VALEURS, ET « system » EN EST UNE. C'est une leçon de
 * ce lot, trouvée par le témoin navigateur : la première version EFFAÇAIT le
 * cookie pour « comme mon système », en croyant que ne rien garder suffisait à
 * ne rien imposer. Le miroir de la ligne suivante avait déjà écrit « light »
 * dans `localStorage` — le repli le relisait, et « comme mon système » ne
 * rendait RIEN. Un magasin qu'on alimente ne se vide pas en effaçant SON
 * ALIMENT. ABSENT et « system » disent donc deux choses différentes : le
 * premier « rien n'a été choisi ICI » (on suit alors le legacy, puis l'OS), le
 * second « je choisis de suivre mon système » (`localStorage` reçoit la même
 * valeur, que la webapp legacy comprend déjà — c'est le troisième cas de son
 * propre témoin).
 *
 * La recopie n'est pas une seconde vérité : elle porte le choix jusqu'à la
 * webapp legacy, qui ne lit que `localStorage`. Sans cookie, rien n'est écrit —
 * un lecteur qui n'a jamais réglé son thème ici ne se voit rien imposer.
 *
 * La lecture tolère `light`, `dark`, `system` et RIEN d'autre. Une valeur
 * inconnue — un cookie forgé, un reste d'une version future — retombe sur
 * `localStorage` puis sur le système, jamais sur une classe que la table de
 * jetons ne connaît pas.
 */
export const themeScriptSource =
  `!function(){try{var k='${THEME_STORAGE_KEY}',` +
  `c=(document.cookie.match(/(^|;) *${COOKIE_DE_THEME}=(light|dark|system)/)||[])[2],s=c;` +
  `try{if(c)localStorage.setItem(k,c);else s=localStorage.getItem(k)}catch(_){}` +
  `var d=s==='dark'||s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches,` +
  `e=document.documentElement;e.classList.add(d?'dark':'light');` +
  `e.classList.remove(d?'light':'dark')}catch(_){}}()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}
