## Leçon 492 — Un témoin qui porte une date ABSOLUE dans le futur est vert le jour où on l'écrit et rouge un jour que personne n'a choisi

`__tests__/story.test.ts` posait, dans le corps de sa story de référence,
`expiresAt: '2026-09-03T05:00:00.000Z'` — une échéance dans le futur le jour où
le témoin a été écrit. `lisLaStory` lit l'horloge RÉELLE (`porte.ts:100`,
`Date.now()`), et `publicationLue` rend `null` pour une story échue. À 05:00 UTC
le lendemain, **deux témoins verts sont devenus rouges sans qu'une ligne du
dépôt ait changé** : la CI de la veille avait raison, celle du matin aussi, et
elles se contredisaient.

Le tell est reconnaissable entre tous : **`dev` rougit alors que `git diff` sur
la zone concernée ne rend RIEN.** Devant un test qui échoue sans changement,
la première question n'est pas « qui a cassé ça ? » mais **« qu'est-ce qui a
bougé sans être commité ? »** — et la seule chose qui bouge toute seule est
l'horloge.

La faute n'est pas la date : c'est le DÉCALAGE entre ce que le témoin veut dire
et ce qu'il écrit. Il voulait dire « une story qui n'a PAS échu » et il écrivait
« une story qui échoit à cinq heures ». Écrire l'intention — `Date.now() +
3_600_000` — la rend vraie pour toujours ; et sa réciproque, « une story ÉCHUE »,
s'écrit avec une date absolue PASSÉE, qui, elle, ne peut pas se périmer.

Le critère n'est donc pas « absolu ou relatif » mais **le SENS de la borne par
rapport à l'horloge que le code lit** :

| Le témoin veut dire | S'écrit | Pourquoi c'est stable |
|---|---|---|
| « pas encore échu » | `Date.now() + delta` | vrai à toute heure |
| « échu » | date absolue PASSÉE | le passé ne redevient pas futur |
| « cette date-là s'affiche ainsi » | date absolue, futur compris | rien ne la compare à l'horloge |

La troisième ligne compte : les quatre autres dates futures du dépôt
(`carnet-de-liens.test.ts`, `liens-porte.test.ts`, `bouchon-compte.ts`, toutes
au 2026-12-31) ne sont PAS des bombes — la vue des liens rend « Expire le … »
sans jamais comparer à `Date.now()`. Les corriger par réflexe aurait été du
bruit. **Une date absolue n'est dangereuse que si quelque chose la COMPARE au
présent** ; le balayage se fait donc sur le consommateur, pas sur la constante.
