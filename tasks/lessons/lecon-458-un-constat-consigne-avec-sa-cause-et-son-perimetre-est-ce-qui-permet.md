## Leçon 458 — Un constat consigné avec sa CAUSE et son PÉRIMÈTRE est ce qui permet au lot suivant de ne pas reculer

Le témoin qui attendait `waveformSamples == []` portait ceci :

> ligne héritée de B8b, TRANCHÉE par B8f — **ni le golden partagé ni
> `storyEffectsV3.ts` ne le logent encore côté v3**, la reconstruction retombe
> donc à son défaut d'init. **Hors périmètre de B8d.**

Devant un témoin rouge, la question est toujours la même : **ai-je cassé un
comportement, ou ai-je rendu fausse une attente ?** Un `XCTAssertEqual(x, [])`
nu ne permet pas d'y répondre — et le réflexe prudent, respecter l'attente,
aurait ici été le mauvais choix : j'aurais retiré un correctif juste en croyant
respecter un arbitrage.

Ce commentaire répond en une lecture, parce qu'il porte **trois** choses :
1. **la cause** — les sites précis qui ne portaient pas la donnée ;
2. **le périmètre** — le lot qui a décidé de ne pas s'en occuper ;
3. **et donc, implicitement, la condition de levée** : que ces sites la portent.

Mon lot avait fermé les trois sites nommés. La condition était remplie, la levée
mécanique, et le témoin a retrouvé le sens que son nom promettait — il ne perd
RIEN.

> **Un « pas encore » vaut par ce qu'il NOMME.** « Hors périmètre » sans les
> sites est une excuse ; avec les sites, c'est une condition de levée, et le lot
> qui les ferme n'a plus à deviner s'il renverse une décision. Écrire les deux
> coûte une phrase et fait gagner une hésitation — ou une erreur.

---
