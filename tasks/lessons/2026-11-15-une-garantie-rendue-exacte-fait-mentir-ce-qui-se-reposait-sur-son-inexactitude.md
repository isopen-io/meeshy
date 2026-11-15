# Une garantie rendue EXACTE fait mentir ce qui se reposait sur son INEXACTITUDE

*2026-11-15 — #18701, cycle 171. Gateway, statut de livraison servi.*

## Le fait

Le lot du 2026-07-24 a écrit, dans sa spécification et dans le commentaire de
son bloc de témoins :

> « `deliveredAt` reste géré par fenêtre temporelle, et c'est correct : tout
> message récupéré par le client a bien été livré. »

C'était **vrai à sa date**, et pour une raison qui n'est écrite nulle part :
`freezeMessageStatus` gravait une entrée pour TOUT message de la fenêtre, livré
ou non. Le repli sur `ConversationReadCursor.lastDeliveredAt` ne servait donc
jamais sur un message récent — une entrée figée gagnait toujours avant lui.

#18614 a rétréci le gel aux messages **réellement** livrés. Il a rendu juste ce
qui était gravé — et, du même geste, il a mis le repli en première ligne pour
exactement les messages que le gel venait, à raison, de laisser de côté. La
phrase ci-dessus est devenue fausse le jour où son voisin est devenu vrai.

## Ce qui rend la classe difficile à voir

Le repli **existait parce que** la garantie était inexacte. Personne ne l'a
écrit ainsi : on a écrit qu'il était correct. Une justification qui tient par
une propriété d'un AUTRE module, sans la nommer, ne peut pas rougir quand cette
propriété change — et le lot qui change la propriété ne cherche pas, par
construction, ce qui se reposait sur son ancienne mollesse.

La question à poser au lot qui RESSERRE quoi que ce soit n'est donc pas « ai-je
cassé quelqu'un ? » (les témoins le disent) mais :

> **« qui tirait profit de l'imprécision que je viens de retirer ? »**

Ici : quatre lecteurs de statut, un repli, et une phrase de spécification.

## Le corollaire qui a failli coûter la moitié du correctif

Un témoin existant affirmait `expect(result.statuses[0].deliveredAt).not.toBeNull()`
sous l'intitulé « readAt falls back to null, **deliveredAt survives** ». Un
témoin qui nomme correctement la moitié qu'il garde gèle l'autre : l'intitulé
disait vrai de la lecture, et sa seconde assertion se relisait comme la suite de
la phrase plutôt que comme une affirmation à instruire. Quatre témoins de ce
bloc tenaient la prémisse périmée, tous verts, tous justes à leur date.

**Un témoin qui tombe sur un correctif juste est un document, pas un obstacle.**
Il faut lire ce qu'il affirmait, et pourquoi c'était vrai — puis l'écrire. Les
inverser en silence aurait effacé la seule trace de la raison.

## La règle

- Un lot qui rend une garantie EXACTE relit ce qui se reposait sur son
  INEXACTITUDE, et il le cherche par la DONNÉE (qui lit cette colonne ?), pas
  par le mot (qui parle de livraison ?).
- Une justification qui tient par une propriété d'un autre module la NOMME,
  faute de quoi elle devient un piège daté.
- Une prémisse périmée se corrige avec sa DATE et sa RAISON — amendement daté
  dans la spécification, pas réécriture.
