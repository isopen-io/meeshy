## Retirer du code mort retire les gardes qui ne vivaient que là

*Cycle 162 bis, #18115. Portée : tout retrait de jumelle, de flux sans collecteur, de module injoignable.*

`AttachmentUpdatedEvent` (Kotlin, miroir PLAT de `message:attachment-updated`) exposait un `SharedFlow` **public et nommé** que rien ne collectait — un décodage par trame, pour personne, et une jumelle divergente que le dépôt interdit. Son retrait est juste, et facile à instruire : `grep` rend la déclaration, l'exposition et la route, rien d'autre.

Mais le témoin de #18070 — « une trame qui ne nomme AUCUNE pièce décode » — ne vivait **que là**. Le miroir vivant couvrait « pas d'`attachmentId` mais une pièce jointe » (repli sur `attachment.id`), **pas** « ni l'un ni l'autre ». Retirer le miroir sans porter son témoin aurait rouvert, en nettoyant, le piège qu'un lot précédent avait fermé — et sans qu'aucun gate ne tombe, puisque le témoin partait avec le code qu'il gardait.

> **La question à poser avant de retirer du code mort n'est pas « qui le lit ? » mais « qu'est-ce que ses TÉMOINS sont les seuls à tenir ? ».** Porter la garde AVANT le retrait, dans le même lot, avec sa raison écrite sur place.

**Corollaire : un commentaire qui nomme un consommateur peut lui survivre DEUX fois.** Le contrat partagé justifiait `AttachmentUpdatedEventData.attachmentId` ainsi — « le décodeur Android natif (`AttachmentUpdatedEvent`) l'exige et rejetait l'événement entier sans lui ». Vrai quand c'était écrit ; faux depuis #18070 (l'exigence levée) ; sans objet depuis ce lot (le décodeur retiré). C'est la forme la plus discrète de la règle du cycle 114, parce qu'elle justifie un champ qui reste **parfaitement légitime** : il n'y a aucun symptôme à chercher, donc aucune raison d'ouvrir la phrase. Elle ne se corrige qu'en passant — et le lot qui retire le consommateur est le seul qui passe là.
