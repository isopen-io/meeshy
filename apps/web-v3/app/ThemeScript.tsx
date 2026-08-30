/**
 * Le moteur de theme de la zone v3 — resolution AVANT le premier pixel.
 *
 * AVANCE SUR L0 (« Le socle ne peut plus diverger »). Le lot L-0.5 ne devait que
 * BRANCHER l'emplacement ; la resolution elle-meme releve de L0. Elle est ecrite
 * ici parce qu'un script branche sans resolution AFFIRME un theme qu'il ne sert
 * pas — le defaut du cycle 123 — et parce que la premiere route de L1 en depend.
 * Son issue L0 (#4413) porte la suite : selecteur clair/sombre/systeme,
 * `tokens.css` sans `@media prefers-color-scheme`, `darkMode: ["class"]`. La CLE
 * et ses valeurs restent arbitrees par la decision-produit #4411 — ce fichier
 * repond a sa question 3 (« lit-on les deux cles legacy ? » ⇒ oui, en repli seul)
 * et laisse les questions 1 et 2 au porteur.
 *
 * C'est un RESOLVEUR ORDONNE, comme le Prisme : la premiere cle PRESENTE gagne,
 * et sa valeur est ensuite normalisee (`dark` / `light` s'appliquent, tout le
 * reste — `system`, `auto`, une valeur inconnue — retombe sur l'OS). La descente
 * porte donc sur la PRESENCE, pas sur la validite : une cle presente appartient a
 * un moteur qui a deja parle, et un moteur de rang inferieur ne le contredit pas.
 * Les deux cles suivantes sont des lectures de MIGRATION, jamais des ecritures —
 * la v3 reste seule a ecrire `meeshy-theme`, donc aucun second moteur n'est
 * instancie :
 *
 *   1. `meeshy-theme`   — la cle de la v3 (`light` | `dark` | `system`)
 *   2. `gp-theme-mode`  — `apps/web/components/v2/ThemeProvider.tsx` : ecrite
 *                         UNIQUEMENT sur un choix explicite (son effet de montage
 *                         ne fait que LIRE), donc signal fort
 *   3. `meeshy-app`     — `apps/web/stores/app-store.ts` : blob zustand persiste,
 *                         `state.theme` valant `light` | `dark` | `auto`. Ecrit a
 *                         chaque hydratation du store, donc signal plus faible :
 *                         il vient apres. `auto` retombe sur l'OS, comme `system`.
 *
 * Sans cette descente, un utilisateur ayant choisi CLAIR dans le legacy sur un OS
 * SOMBRE quitte `/conversations` en clair et ouvre `/l/<token>` en SOMBRE pendant
 * toute la fenetre de bascule (§ 4.9 de la conception, etapes 2 a 6) — le cas
 * `explicit-light-on-dark` que le § 9 nomme « le seul qui attrape une jumelle ».
 *
 * Le retrait des deux replis est date : etape 7 du § 4.9 (le legacy ne sert plus
 * rien), porte par l'issue de decommissionnement L8.
 *
 * Le blob `meeshy-app` n'est lu QUE si les deux cles precedentes sont absentes
 * (court-circuit `||`) : un blob illisible ne peut donc jamais faire perdre un
 * choix deja exprime. Budget mesure par le gate : 360 o sur 400.
 */
export const THEME_STORAGE_KEY = 'meeshy-theme';

export const LEGACY_THEME_STORAGE_KEYS = ['gp-theme-mode', 'meeshy-app'] as const;

const RESOLVE_BEFORE_FIRST_PIXEL = `(function(){var t;try{var s=localStorage;t=s.getItem('${THEME_STORAGE_KEY}')||s.getItem('${LEGACY_THEME_STORAGE_KEYS[0]}')||JSON.parse(s.getItem('${LEGACY_THEME_STORAGE_KEYS[1]}')||'{}').state.theme}catch(e){}try{if(t!='dark'&&t!='light')t=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';var r=document.documentElement;r.classList.add(t);r.style.setProperty('color-scheme',t)}catch(e){}})()`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: RESOLVE_BEFORE_FIRST_PIXEL }} />;
}
