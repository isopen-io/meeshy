## Leçon 139 — Un TEST est un lecteur CIRCULAIRE : il ne prouve pas un contrat, il prouve une production

Suite directe des leçons 137 et 138. La colonne « lecteurs » qui décide du geste doit **exclure les
tests**. Un test qui lit un champ ne démontre pas qu'un consommateur en dépend — il démontre
seulement que le producteur le produit, ce qu'on savait déjà.

`MessageResponse.metadata` avait six sections, dont trois purement fabriquées (`deliveryStatus` à
`{recipientCount: 1, deliveredCount: 1, readCount: 1}` en dur, `performance` à des fractions
arbitraires du temps total, `context` payé par deux balayages du contenu). Aucun transport ne le
transmettait : `_sendResponse` remplace la réponse entière par `buildMessageAckData(data)`. Ses
seuls lecteurs sur toute la durée de vie du champ étaient **six assertions Jest**.

**Le symptôme à reconnaître — ce que le test ÉVITE d'affirmer.** L'assertion s'appelait
`should include delivery status in metadata` et vérifiait `status === 'sent'`. Elle s'arrêtait là :
jamais `deliveredCount`, jamais `readCount`. Écrire `expect(...deliveredCount).toBe(1)` aurait sauté
aux yeux comme absurde dans un groupe de douze. **Le test savait, et a contourné sans le dire.**

**La méthode** : devant un champ que seuls des tests lisent, lire les assertions AVANT de conclure au
contrat, et regarder ce qu'elles n'affirment pas. Le sous-ensemble du champ qu'aucune assertion ne
touche est précisément celui que son auteur savait déjà faux.

**Corollaire de vérification** : quand le geste est un RETRAIT, la mutation-proof consiste à
RÉINTRODUIRE la chose sous sa forme la plus creuse (`metadata: {}` suffit contre `toBeUndefined()`).
Si le compte de témoins qui rougissent n'est pas exactement le compte de témoins ajoutés, un
d'entre eux ne tient rien.
