## Un refactor qui élargit l'API de production pour garder un test vert

**2026-11-22, cycle 222 (#20440).** En sortant le socle d'un handler arrivé à
996 lignes pour un plafond dur de 1000, un accesseur public est apparu sur le
handler :

```ts
get friendsCache(): Map<string, { ids: string[]; expiresAt: number }> {
  return this.core.friendsCache;
}
```

Il n'était pas négligent, il était **contraint** : un témoin existant atteint ce
cache par `(handler as any).friendsCache` pour observer l'éviction au plafond,
et `noUnusedLocals: true` refuse un membre privé que le fichier ne lit jamais.
Le `public` était la sortie la plus courte.

**Mesuré : son seul lecteur de tout le dépôt était ce témoin.** C'était donc du
**code mort en production**, dont l'unique raison d'exister était un test qui
atteint des internes. Le dépôt avait déjà tranché ce cas exact, et dans l'autre
sens que l'intuition : `users/profile.ts|permissions|200` a été **RETIRÉ plutôt
que déclaré**, au motif que le champ n'avait aucun producteur.

> La question n'est pas **« comment garder ce test vert ? »** mais **« ce membre
> a-t-il un lecteur en PRODUCTION ? »**. S'il n'en a pas, c'est le TEST qui suit
> le code : il atteint le collaborateur (`core`), son assertion inchangée, et le
> collaborateur reste privé — la surface de production ne s'élargit de rien.

Le signal est repérable à l'œil nu, et c'est ce qui rend la leçon utilisable :
**un membre qu'on rend `public` sans qu'aucun appelant ne le demande.** Dans un
diff de refactor, il se lit comme une conséquence mécanique du découpage ; il est
en réalité une décision de conception, prise par le compilateur à la place de
l'auteur.

### La moitié qui porte au-delà du refactor

Le cycle précédent (#20429) avait porté ce même fichier à **1019 lignes** avec
les doc-comments qui portaient ses décisions mesurées — « `keep` nomme l'acteur
et lui seul », « `cached: false` », « on ne diffuse pas en excluant » — puis les
avait **resserrés** pour repasser sous 1000. Autrement dit : **un lot de
SÉCURITÉ a rogné sa propre preuve pour tenir un budget de lignes.**

> **Un plafond atteint ne se paie pas en documentation.** Devant un fichier au
> seuil, un lot a deux issues : découper, ou abréger ce qui prouve. La seconde
> est **invisible en revue**, parce qu'elle ressemble à de la concision — et elle
> coûte précisément ce que le dépôt protège ailleurs avec le plus de soin, la
> trace écrite d'une mesure. Le découpage doit donc être un lot À LUI, livré
> AVANT celui qui a besoin de la place.
