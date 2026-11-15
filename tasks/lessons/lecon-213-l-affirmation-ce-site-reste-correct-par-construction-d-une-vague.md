## Leçon 213 — l'affirmation « ce site reste correct par construction » d'une vague antérieure doit être re-tracée, jamais héritée (2026-08-16, routine calling, cycle 138)

**Le constat.** La Vague 137 a fixé 3 des 6 sites d'appel à `clearBufferedOffer` (balayage total
sur `callId`) pour un nettoyage scopé par destinataire, et a explicitement classé les 3 autres
comme « corrects par construction » dans sa section Non-fait-volontairement — dont, mot pour mot,
« purge d'une offre bufferisée dont l'émetteur s'est avéré parti au moment du replay `call:join` ».
Cette classification n'était appuyée par AUCUNE trace de code dans le texte de la Vague 137 — une
affirmation de clôture, pas une preuve. Le site en question était en réalité affecté du MÊME bug
que les 3 corrigés : `call:join` retrouve l'offre bufferisée pour LE JOINER (une seule clé connue
avec certitude via `bufferedOfferFor`), découvre que son émetteur est parti, puis droppait via
`clearBufferedOffer(callId)` — un balayage total qui embarque toute offre SŒUR d'un tiers sans
rapport.

**Pourquoi cette classification a été acceptée sans preuve.** La Vague 137 avait déjà produit trois
fixes réels dans le même cycle ; le quatrième candidat ressemblait, en lecture rapide, à un site
« terminal » légitime (un nettoyage après une négociation avortée) plutôt qu'à un nettoyage
« participant part ». La frontière entre « ce site sweepe correctement TOUT le call » et « ce site
ne devrait nettoyer QU'une clé qu'il vient de prouver stale » ne se lit pas dans le NOM de la
fonction appelée ni dans le commentaire qui l'entoure — elle se lit dans la question : *combien de
clés le code vient-il de démontrer périmées avant cet appel ?* Ici : exactement une
(`bufferedOfferFor` a renvoyé UNE entrée, pour UN destinataire). Un balayage total est un sur-dosage
chaque fois que la réponse est « moins que tout le scope parent ».

**La règle.** Quand une vague de routine liste des sites « laissés intacts, corrects par
construction » dans sa section Non-fait-volontairement, cette classification est une HYPOTHÈSE non
vérifiée jusqu'à preuve du contraire, pas un fait acquis pour les vagues suivantes — au même titre
que n'importe quelle description du fichier historique (cf. règle méthodologique déjà en vigueur :
« ne pas faire confiance aux descriptions du todo, toujours auditer le code actuel »). Un audit de
routine qui rencontre une telle liste doit retracer AU MOINS un des candidats non retenus avant de
chercher un bug entièrement nouveau ailleurs — c'est souvent là que se trouve le prochain correctif
chirurgical légitime, avec le contexte et le patron de fix déjà entièrement établis par la vague
précédente.
