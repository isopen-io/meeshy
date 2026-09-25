## Leçon 267 — « correct mais pas rang-conscient » peut cacher une surface qui AFFIRME une langue qu'elle ne sert pas (2026-08-24, cycle 123)

> **Jumelle de la 266, un étage plus haut.** La 266 a mesuré qu'un contenu RÉSOLU côté serveur
> n'atteignait aucun lecteur (le champ transporté que personne ne lit). Celle-ci mesure la même
> chose côté CLIENT : le résolveur élit la bonne langue, l'hôte rend l'original. Les deux passes
> l'ont trouvée indépendamment, sur deux couches, dans la même journée — c'est un indice sur la
> forme du défaut, pas une coïncidence : **partout où la résolution et le rendu sont séparés par
> une frontière, la frontière est l'endroit où le Prisme se perd.**

Le suivi hérité des cycles 120/122 nommait trois surfaces web restées au rang 1 —
commentaires, stories, status — et les qualifiait : « CORRECTES, seulement pas encore
rang-conscientes ». Le cycle 123 devait donc être mécanique : câbler
`usePreferredLanguages()` → prop `preferredLanguages`, trois fois, même patron que les posts.

Deux des trois l'étaient. La troisième ne l'était pas.

### Le défaut : le Prisme ANNONCÉ sans être APPLIQUÉ

Sur le chemin legacy de `StoryViewer` (`apps/web/components/v2/StoryViewer.tsx`), le corps de
la story se rendait ainsi :

```tsx
<p className={cn(textStyleClass, 'text-center leading-relaxed')}>
  {story.content}          {/* l'ORIGINAL, toujours */}
</p>

<TranslationToggle
  originalContent={story.content}
  translations={story.translations}
  userLanguage={userLanguage}
  showContent={false}      {/* la puce ne rend PAS le texte */}
/>                         {/* ...et personne ne branche onDisplayedChange */}
```

La puce annonçait « Français » au-dessus d'un paragraphe resté en anglais. Ce n'est pas une
surface « correcte mais tronquée au rang 1 » : c'est une surface qui **ment**, et qui ment
d'autant plus fort que le lecteur a configuré ses langues. Une surface non câblée sert
l'original sans rien prétendre ; celle-ci affirmait.

Le relais existait — `onDisplayedChange`, et sa propre documentation nommait EXACTEMENT ce
risque :

> « Les hôtes qui rendent le texte eux-mêmes (`showContent=false`) en ont besoin : sans lui,
> la rangée dit « Français » pendant que l'hôte rend l'original, et le Prisme ment. »

Un seul hôte du dépôt le branchait (`PostDetail`). L'autre porteur de `showContent={false}`
ne le branchait pas. La documentation avait décrit le piège sans que rien ne vérifie qu'on
l'évitait.

> **`showContent={false}` est une DETTE CONTRACTÉE, pas une option d'affichage.** L'hôte qui
> la pose promet de rendre lui-même ce que le résolveur annonce. Chercher le motif
> — `showContent={false}` **sans** `onDisplayedChange` — est une requête d'une ligne, et c'est
> le seul contrôle qui existe : rien dans le type ne les apparie.

### Ce que le qualificatif de suivi a coûté

La leçon 265 a établi qu'un suivi mesuré se solde en entier. Le cycle 123 ajoute l'arête
d'à côté : **la MESURE d'un suivi doit porter sur le défaut, pas sur sa forme supposée.**
Le suivi des cycles 120/122 avait mesuré la bonne chose (« ces surfaces ne passent que
`userLanguage` » — vrai, vérifiable, vérifié) puis y avait attaché un diagnostic non mesuré
(« donc elles sont correctes »). Le premier fait était une observation d'APPEL ; le second
une affirmation de COMPORTEMENT, et rien ne les relie : une surface qui passe une seule
langue peut aussi bien la servir correctement (comme `CommentItem` et `StatusBar`) que ne
jamais l'appliquer du tout.

> **Un suivi qui qualifie la gravité d'un reste-à-faire affirme deux choses, et la seconde
> est presque toujours déduite de la première.** « Ces sites ne passent que le rang 1 » se
> vérifie en lisant les sites d'appel. « Donc ils sont corrects » exige d'ouvrir ce qu'ils
> RENDENT. C'est la leçon 261 déplacée du recensement vers le triage : la liste était juste,
> son adjectif ne l'était pas.

### Le corollaire technique : un tableau de langues en prop est une bombe à boucle

Brancher le relais a fait BOUCLER le rendu sans fin, immédiatement. La chaîne :

1. `preferredLanguages` est un `string[]` construit en ligne par l'hôte → nouvelle identité à
   chaque rendu.
2. `autoResolved` (`useMemo`) en dépend → nouvel objet.
3. `displayedVersion` en dépend → nouvel objet.
4. L'effet de notification dépendait de `displayedVersion` → repart.
5. L'hôte pose son état → rendu → retour au point 1.

Le correctif n'est pas de mémoïser chez l'hôte — ça ne corrige qu'un site d'appel, et le type
`string[]` autorise le littéral partout. L'effet dépend désormais des **trois primitives
servies** (`languageCode`, `content`, `isOriginal`), jamais de l'objet qui les porte : deux
rendus qui servent le même texte ne notifient qu'une fois, quel que soit l'hôte.

> **Un composant qui accepte un tableau en prop ET notifie son hôte par effet doit comparer
> des VALEURS, pas l'objet dérivé.** Le contrat « mémoïsez vos props » est réel mais
> invérifiable à la frontière ; le contrat « je ne renotifie que si ce que je sers change »
> se tient tout seul. La mémoïsation chez l'hôte reste souhaitable — elle n'est plus la
> seule chose qui empêche l'écran de figer.

Corollaire de forme, payé dans le même lot : la chaîne mémoïsée est devenue un **hook**, donc
elle a dû remonter **au-dessus des retours anticipés** du composant (`if (!story) return`,
`if (referenceAccessBlocked) return`). Un fichier qui porte le commentaire « All hooks are
declared above — safe to early-return here » dit où est la frontière ; encore faut-il la
relire avant d'introduire un `useMemo` cent lignes plus bas.

### Le second câblage, plus discret : `resolvePrismeText`

Les overlays de texte de la même story avaient leur PROPRE descente, locale au fichier :

```ts
const exact = obj.translations[preferredLanguage];       // rang 1 seul
const prefix = preferredLanguage.split('-')[0];          // rattrapage maison
```

Deux défauts en un — aveugle aux rangs inférieurs, et un préfixe qui sur-matche (`fry`
Frisian pour une préférence `fr`). La fonction délègue maintenant à `resolvePrismTranslation`,
la SSOT nommée par la leçon 264. C'est la même issue par défaut que celle-ci dénonce (« quand
un consommateur a besoin de ce que rend un résolveur existant, l'issue par défaut est de
réécrire la boucle »), retrouvée ici DEUX FOIS dans le même fichier : la boucle réécrite pour
les overlays, et le relais non branché pour le corps.

> Un fichier qui contient déjà une descente maison est l'endroit le plus probable pour en
> trouver une seconde. La divergence ne se répand pas par contagion entre fichiers — elle se
> répand par **habitude locale**.

### La suite immédiate : le motif prescrit a rendu une QUATRIÈME surface, la plus vue de toutes

La leçon ci-dessus prescrit une requête d'une ligne : chercher `showContent={false}` **sans**
`onDisplayedChange`. Elle a été lancée dans le même cycle, et elle a rendu `PostCard` — le
corps d'un post dans le FIL.

```tsx
<TranslationToggle … variant="block" showContent={false} />   {/* pas de relais */}
<PostContentText content={content} … />                        {/* l'ORIGINAL, toujours */}
```

Le fil est la surface la plus vue du produit, et son défaut était PIRE que celui de la story :
la variante `block` rend une zone « traductions disponibles » cliquable. Cliquer y changeait
la sélection interne de la puce — donc la composition de la liste — **sans jamais changer une
ligne du texte lu**. Le contrôle n'était pas seulement trompeur, il était INERTE.

Deux choses à en retenir, au-delà du correctif :

1. **Le cycle 120 avait câblé `preferredLanguages` sur `PostCard` et l'avait rangé dans
   « fait ».** Il l'était : la descente arrivait bien jusqu'à la puce. Ce qui manquait est en
   AVAL du résolveur — entre ce qu'il conclut et ce que l'écran rend. Un audit qui suit une
   donnée jusqu'à son consommateur s'arrête un cran trop tôt : **il faut la suivre jusqu'au
   PIXEL.** Les surfaces « posts » ont ainsi figuré trois cycles durant dans la colonne des
   sites conformes, en en-tête de la table du Prisme dans `CLAUDE.md`.
2. **Le témoin qui l'attrape n'est pas un témoin de rang.** Les deux premiers de ce lot
   (rang 2 servi, original quand rien ne matche) passaient déjà sur `PostCard` AVANT le
   correctif — parce qu'ils interrogeaient la puce. Celui qui tombe interroge le CORPS, et le
   plus net des trois est le témoin d'INERTIE : « cliquer une traduction change le texte lu ».
   Il ne parle ni de rang ni de prisme — seulement du fait qu'un contrôle a un effet.

> **La leçon 4 du dépôt (« un contrôle existe s'il a un effet ») est un test de PRISME
> déguisé.** Partout où un résolveur annonce une langue que l'hôte doit rendre, la question
> « ce contrôle change-t-il ce que je lis ? » attrape la classe entière de défauts — y compris
> ceux qu'aucune assertion sur la langue résolue ne peut voir, puisque le résolveur, lui, a
> raison.

Note d'outillage : ces témoins ont exigé d'ancrer l'assertion sur le CORPS
(`data-testid="post-content-text"` sur `PostContentText`), car la zone « traductions
disponibles » liste légitimement l'original en tant qu'autre version consultable — un
`queryByText('Hello')).toBeNull()` global y tombe pour la mauvaise raison. **Un témoin qui
distingue deux rendus du même texte doit nommer LEQUEL il regarde.**
