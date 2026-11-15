## Leçon 501 — Un magasin qu'on ALIMENTE ne se vide pas en effaçant son aliment

**Le fait.** `/settings/application` (web v3, #5065) offre trois choix de thème : clair, sombre,
« comme mon système ». Le magasin est un COOKIE — le seul qu'un formulaire sans JavaScript puisse
écrire — et le script inline de la tête le lit avant le premier pixel, puis le RECOPIE dans
`localStorage['meeshy-theme']`, la clé PROPRE de la v3, qui n'avait jusque-là aucun écrivain
(#4477).

La première version écrivait `light` ou `dark`, et **EFFAÇAIT** le cookie pour « comme mon
système » : ne rien garder semblait la façon la plus honnête de ne rien imposer. Le témoin
navigateur a montré l'inverse. Un lecteur qui choisit « Clair » puis « comme mon système » **restait
clair** : la recopie avait déjà posé `light` dans `localStorage`, et le repli du script — « pas de
cookie ⇒ relis `localStorage` » — y retrouvait exactement ce qu'on venait d'effacer.

**Ce qui rend le défaut invisible.** Chaque moitié est juste isolément. La recopie est juste (elle
donne un écrivain à une clé qui n'en avait pas, et garde le choix quand seuls les cookies sont
effacés). Le repli est juste (il fait survivre un choix que cette clé porterait déjà).
L'effacement est juste **si le cookie est le seul magasin**. Il ne l'est plus dès qu'on ALIMENTE le
second, et c'est le lot lui-même qui l'a fait, dix lignes plus haut.

> **Effacer une valeur ne la retire du système que si rien d'autre ne la porte.** Dès qu'un site
> RECOPIE une valeur ailleurs — cache, miroir, magasin hérité, ligne dénormalisée —, l'effacement
> devient un ordre AMBIGU : « oublie » et « reviens au repli » ne se distinguent plus, et le repli
> rend l'ancienne valeur. Il faut alors une valeur qui DIT l'absence (ici `system`), distincte de
> l'absence elle-même : ABSENT veut dire « rien n'a été choisi ici », `system` veut dire
> « je choisis de ne rien fixer ». Trois états, pas deux.

**La question à poser.** Devant tout correctif qui EFFACE : *qu'est-ce qui, dans ce système, porte
encore cette valeur — et que va lire le repli ?* Si la réponse est « le magasin que je viens
d'alimenter », l'effacement n'efface rien.

**Et le témoin qui l'attrape n'est pas en jsdom.** Il faut DEUX documents successifs — celui qui
pose le choix, celui qui le relit — et le script inline qui court entre les deux. Un témoin de
rendu voit un `<input checked>` conforme ; un témoin de porte voit un `set-cookie` conforme ; seul
le navigateur voit que la classe de `<html>` n'a pas bougé. **Un magasin qui se lit au chargement
suivant se juge au chargement suivant.**

Sites : `apps/web-v3/app/theme-script.tsx` (les trois valeurs et la recopie),
`apps/web-v3/lib/api/cookies.ts` (`COOKIE_DE_THEME`), `apps/web-v3/app/connecte/reglages-porte.ts`
(`cookieDuTheme`). Témoins : `__tests__/theme-script.test.ts` § « `system` l'emporte sur ce que le
miroir a laissé », `e2e/visual/v3-reglages-a11y.spec.ts` § « choisir un thème CHANGE l'apparence ».
