## Borner les LIGNES LUES est plus sûr que borner les entités dérivées — et le journal doit l'être aussi

**#20109, 2026-11-20.** `announceCitedPostWithdrawal` lit les messages qui citent
un post, en dérive l'ensemble des conversations (`distinct` + `Set`), puis émet
une annonce par conversation — chacune précédée d'une lecture d'audience. Deux
coûts non majorés, en tâche détachée que personne n'attend.

La borne naturelle semble être « au plus N conversations ». Elle est **moins
sûre** que « au plus N lignes », et la différence est un cas :

> Un post cité **mille fois dans UNE conversation**, plus une fois dans une
> seconde. Une borne sur les conversations ne voit que deux entités : elle ne
> tronque pas, et pourtant la lecture est aussi lourde que si mille
> conversations citaient. Une borne sur les LIGNES tronque — et perd la seconde
> conversation.

Ce qui rend la borne sur les lignes préférable n'est pas qu'elle perde moins :
c'est qu'elle **sait** quand elle perd. Les entités dérivées sont un
sous-ensemble des lignes, donc :

- lignes lues ≤ plafond ⇒ on a TOUTES les lignes ⇒ toutes les entités : rien ne
  peut manquer, et la propriété est démontrée, pas espérée ;
- lignes lues > plafond ⇒ une entité a PU manquer ⇒ on journalise.

### Le corollaire sur le journal : il se mesure sur la grandeur BORNÉE

Le réflexe est de journaliser « j'ai annoncé N conversations, le plafond est N ».
Dans le cas ci-dessus, le nombre d'entités annoncées est **loin** du plafond
alors qu'une entité est perdue : le journal se serait TU précisément là où il
fallait parler. Le témoin qui attrape ça n'est pas un témoin de borne, c'est un
témoin de FORME :

```
cap + 1 lignes dans UNE conversation, plus une ligne ailleurs
⇒ une seule conversation annoncée, et le journal part quand même
```

### La règle
Quand une borne protège une lecture dont on DÉRIVE des entités (dédoublonnage,
regroupement, jointure en mémoire), borner la lecture, pas la dérivée ; et
mesurer la troncature sur ce qu'on a BORNÉ. Un journal indexé sur la grandeur
dérivée est muet sur le cas qui compte.

### Ce qui rend la troncature acceptable ici, et ne l'exporte pas
`servedPostReply.ts` sert `postReplyTo.deletedAt` à toute lecture : une
conversation non annoncée retrouve la vérité à son prochain chargement — le
verdict `reload-serves-truth` de `UNQUEUED_FAMILY_VERDICT` (#20045). **Tronquer
n'est légitime que là où une relecture sert la vérité**, et c'est une propriété
du site, jamais du plafond. Ailleurs, la réponse est de rendre le travail
incrémental, pas de le couper.
