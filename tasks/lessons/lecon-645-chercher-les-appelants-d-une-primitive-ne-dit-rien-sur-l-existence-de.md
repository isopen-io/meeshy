## Leçon 645 — chercher les appelants d'une PRIMITIVE ne dit rien sur l'existence de la FEATURE : le module intermédiaire est invisible aux deux bouts

**Le fait.** Ouvrant #6278 (« Le Flux a ses interactions »), j'ai mesuré les
appelants de `togglePost` et `applyPostToggle` (`apps/web-v2/src/lib/feed/interactions.ts`),
n'en ai trouvé aucun hors témoins, constaté que la rangée de statistiques d'une
carte ne portait qu'UN `<button>` (partager), et conclu — dans un commit de
réservation — que « aimer » et « enregistrer » manquaient.

Ils étaient livrés depuis `65ed235b94`, **jusqu'au bouton** : `performPostGesture`
(`lib/api/feed-gestures.ts`) → `query.ts` → `usePostGesture` → six routes, et
`FeedActionsRow` rend bien des `<button>` à bascule avec `aria-pressed` et le
glyphe rempli. Ce que j'avais pris pour l'absence de la feature était sa
CONFORMITÉ à la loi 4 : sans hôte porteur de `onGesture`, la carte rend un
`<span>` — un bouton sans effet mentirait.

**Pourquoi la mesure a menti.** Elle interrogeait les deux BOUTS d'une chaîne —
la primitive pure en bas, le pixel en haut — sur une surface (le fil monté sans
hôte) où le haut est légitimement muet. Entre les deux vivait un module
INTERMÉDIAIRE que ni l'un ni l'autre ne nomme : `feed-gestures.ts` importe les
primitives, et les écrans importent un hook qui l'appelle. Un `grep` des
appelants d'une primitive s'arrête au premier relais ; un coup d'œil au rendu
s'arrête au premier montage sans hôte.

**La règle.** Pour savoir si une feature EXISTE, on n'interroge ni sa primitive
ni son pixel : **on interroge son PORT** — la fonction qui parle à la passerelle
— puis on descend. Le port se trouve par l'ADRESSE, pas par le nom :
`grep "posts/.*\/like"` rendait `feed-gestures.ts` immédiatement, là où
`grep togglePost` ne rendait que des témoins. Et le doc-comment du port dit
d'ordinaire le reste, y compris le numéro d'issue : celui de `performPostGesture`
commence par « LE PORT DES GESTES D'UNE PUBLICATION (#6278) ».

**Le contre-exemple qui rend la règle utile.** La même méthode, appliquée le
même jour à `post:created`, a rendu le verdict INVERSE et JUSTE : le port existe
(`SocialEventsHandler.ts:322` diffuse l'événement), les types sont déclarés,
les constantes aussi — et `grep "POST_CREATED" apps/web-v2/src` est VIDE. Là,
l'absence est réelle, et elle est réelle parce qu'on a cherché du côté du port,
pas du côté du pixel. Parent : leçon 261 (une énumération de sites porte deux
affirmations, et la seconde n'est presque jamais vérifiée).

**Corollaire sur la conduite.** Une branche de réservation fondée sur une
mesure fausse se SUPPRIME, à distance comprise, et sans attendre : une
réservation vivante sur du travail déjà livré n'est pas un déchet inerte, c'est
un faux signal que la doctrine de la branche poussée tôt (#5243) demande
justement aux autres sessions de croire.
