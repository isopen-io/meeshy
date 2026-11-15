## Leçon 361 — « La vue est-elle montée ? » a une jumelle : « quelle SURFACE est montée ? »

**2026-08-31, vue `3h` (#4098).** Carte de citation de story livrée, prouvée à
l'écran sur `Meeshy-iOS18` : carte de scène, bandeau, tap qui ouvre la story.
Conforme à sa planche.

Sur `Meeshy-iOS26`, la MÊME conversation, la MÊME donnée : **citation aplatie**,
vignette de 30 pt sur une ligne. Le simulateur y résout le mode de lecture en
**Focal**, dont la citation est rendue par `FocalQuotedReplyView` — un composant
natif, délibéré, qui n'a jamais entendu parler de mon lot.

Rien ne pouvait le signaler : les deux peaux compilent, chacune reste cohérente
avec elle-même, et aucune garde ne compare deux rendus d'une même donnée. La
seule chose qui l'a dit est **d'avoir changé de simulateur** — iOS 18
résolvait en Bulles, iOS 26 en Focal, parce que le programme bêta y est actif.

> Vérifier qu'une vue est MONTÉE ne suffit pas quand plusieurs SURFACES peuvent
> rendre la même donnée. La question complète est : **combien de peaux rendent
> cette chose, et laquelle ai-je regardée ?**

Le motif est le même à trois échelles, trouvées le même jour :
- la session voisine — un composer de story à fond COLORÉ monte une AUTRE
  surface que celle où le milestone pose ses vues ;
- moi — la citation a trois hôtes (bulle, conteneur média, lecteur audio) et
  #4518 en couvrait deux ;
- moi encore — et deux PEAUX (bulles, plate), d'où #4527.

**Ce n'est pas toujours un défaut** : `FocalQuotedReplyView` est dense par
conception, et poser une carte de 235 pt dans une rangée plate irait contre son
arbitrage écrit. D'où une issue `décision-produit` plutôt qu'un correctif —
mais la QUESTION devait être posée, et elle ne l'aurait pas été sans la seconde
capture.
