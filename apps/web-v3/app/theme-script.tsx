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
 */
export const themeScriptSource =
  `!function(){var s=null;try{s=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(_){}` +
  `try{var d=s==='dark'||s!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches,` +
  `e=document.documentElement;e.classList.add(d?'dark':'light');` +
  `e.classList.remove(d?'light':'dark')}catch(_){}}()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScriptSource }} />;
}
