## Leçon 594 — Une CONSTANTE qui n'existe que pour décrire un écart à la référence rend cet écart permanent, et invisible

**Le fait.** Le porteur signale, capture à l'appui (2026-09-12, #6213), que le fil de `apps/web-v2` COUPE son contenu : arête basse de l'en-tête en haut, pilule de langue du composeur en bas, dernière ligne du dernier message tranchée en deux. Sous iOS, « le défilement est visible du haut de l'écran au bas de l'écran, avec de l'espace vers le bas ».

**La cause n'était pas cachée. Elle était ÉCRITE, et promue en constante.** `src/lib/reading-mode/metrics.ts` portait ceci depuis #5774 :

```
/**
 * L'EN-TÊTE DE LA v3.1 EST EN FLUX — celui d'iOS FLOTTE au-dessus de la
 * liste, et c'est toute la différence : `topOffset` y est mesuré depuis le
 * haut du CADRE [...] ici l'enveloppe du défileur COMMENCE déjà au bord bas
 * du header, cette hauteur est donc DÉJÀ DÉPENSÉE.
 */
export const DAY_PILL_MARGIN = DAY_PILL_TOP - DAY_PILL_HEADER_PADDING - DAY_PILL_HEADER_ROW;
```

Le commentaire est juste. Le calcul est juste. La pilule de jour tombait au bon pixel, et son gate le mesurait en vert. **Tout ce qui touchait cette constante était correct** — c'est bien pour ça qu'elle a tenu trois lots.

Ce qu'elle faisait, en revanche, c'est **transformer un écart de POSE en donnée de référence**. Écrite comme une soustraction dérivée de la cote iOS, elle avait l'air d'une dérivation de plus, au milieu de quarante autres qui, elles, RAPPROCHENT le web d'iOS. Le fichier entier proclame « aucune valeur numérique ici, chaque cote arrive d'iOS » ; celle-ci arrivait d'iOS **moins** ce qu'iOS ne faisait pas. Une fois posée, plus personne n'a de raison d'y revenir : elle est cohérente, testée, commentée.

**Le fond.** Deux façons de traiter un écart connu à la référence :

| | ce qu'on écrit | ce qui arrive |
|---|---|---|
| l'écart devient une **constante** | `DAY_PILL_MARGIN = TOP − 8 − 44` | il est absorbé, tout redevient vert, plus rien ne le signale — il se livre |
| l'écart devient une **issue** | « l'en-tête est en flux, iOS le fait flotter » | il reste visible, il se planifie, il se ferme |

La constante ne ment pas : elle **compense**. Et une compensation correcte est exactement ce qui empêche un défaut de se manifester ailleurs que là où il fait mal — ici, à l'œil du porteur, six semaines plus tard, sur la seule dimension qu'aucun témoin ne regardait.

**Le signe qui l'attrape**, et il est lisible sans rien connaître du domaine : *une constante dont le doc-comment explique pourquoi la plateforme de RÉFÉRENCE fait autrement*. Pas « d'où vient cette valeur » — ça, c'est une dérivation saine — mais « pourquoi la nôtre diffère ». Le second n'est pas une dérivation, c'est **une dette qui a pris la forme d'un nombre**.

**Le corollaire de rangement.** Quand la cause tombe, la compensation se RETIRE, elle ne se garde pas « au cas où » : le lot #6213 a fait flotter le chrome, et `DAY_PILL_MARGIN` maintenue aurait remonté la pilule de 52 px. Une compensation survit toujours à ce qu'elle compensait — c'est sa nature d'être posée une fois et de ne plus se relire.

**Deux traces du même motif, trouvées dans le même lot** (elles ne sont pas des coïncidences, elles sont ce que ce motif produit) :

1. **L'habillage sans la pose.** `thread-header.tsx` portait `backdrop-blur-xl` et un fond à 80 % — l'habit d'une bande flottante — sur un élément posé `shrink-0` dans une colonne flex. Un flou qui n'avait rien à flouter, pendant trois lots. **Un composant peut être HABILLÉ pour un rôle qu'il ne tient pas** ; le style est l'intention, la pose est le fait, et rien ne les confronte.
2. **Le témoin vert par la prose.** `routes/safe-area.test.ts` vérifie `source.includes('pt-safe')`. Retirer `pt-safe` de la racine du fil l'a laissé VERT — parce que le commentaire que je venais d'écrire pour expliquer son retrait contient la chaîne `pt-safe`. **Un témoin qui cherche une chaîne dans un fichier trouve les commentaires qui parlent de la règle aussi bien que la règle.** Rendu honnête par une exemption motivée, jamais par un `pt-safe` reposé ailleurs pour faire taire le rouge.

**La question à poser**, quand un écran de portage ne ressemble pas à sa référence : ne pas chercher d'abord ce qui MANQUE, mais **ce qui a été écrit pour rendre l'écart supportable**. Le code qui compense est toujours plus facile à trouver que le code absent — il porte un nom, il a des lecteurs, et son commentaire dit exactement quel écart il sert.
