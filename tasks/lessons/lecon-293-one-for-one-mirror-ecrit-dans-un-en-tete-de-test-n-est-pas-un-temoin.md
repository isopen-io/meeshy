## Leçon 293 — « one-for-one mirror » écrit dans un en-tête de test n'est pas un témoin de parité (2026-08-26, itération 272)

> Coordination : suite directe des leçons 291/292 (couleur d'accent). Numérotée
> 293 pour éviter la collision au merge de `tasks/lessons.md`.

La leçon 292 a appliqué « quelles règles à N miroirs n'ont AUCUN témoin de
parité ? » à la couleur d'accent. L'itération 272 l'a appliquée à la règle
produit CENTRALE de Meeshy — la résolution du Prisme sur l'aperçu de dernier
message (`resolveLastMessagePreview`, trois miroirs TS/iOS/Android nommés source
de vérité par CLAUDE.md). Trou « zéro sur trois » : douze contrats de vecteurs
partagés vivent dans `fixtures/reading-modes/` (accent, bridge, sections, sort…),
mais AUCUN pour le Prisme.

Ce qui rendait le trou traître : **chacune des trois suites écrites à la main se
DÉCLARAIT « one-for-one mirror » des deux autres dans son en-tête.** Android :
« One-for-one mirror of `resolve-last-message-preview.test.ts` and of
`ConversationPrismeResolutionTests.swift` ». iOS pareil. La parité était donc
AFFIRMÉE, noir sur blanc, à trois endroits — et vérifiée par rien. Trois copies
parallèles de cas de test, entretenues à la main, qu'aucun build ne force à
couvrir le même espace ni à s'accorder sur les résultats.

> **Une phrase dans un en-tête de test qui AFFIRME la parité (« mirror of »,
> « kept in sync with », « same cases as ») est un aveu qu'il n'existe pas de
> témoin machine — sinon elle citerait le témoin, pas la copie sœur.** Cette
> phrase est un marqueur à chercher : là où trois fichiers se citent mutuellement
> comme miroirs, il y a trois copies et zéro contrat.

Contrairement à l'accent (cycle 271, où le site non couvert avait DÉJÀ dérivé en
un bug visible), les trois miroirs du Prisme s'accordaient réellement à la lecture
— la parité était vraie AUJOURD'HUI, il lui manquait sa garde. Le geste 292
(« rejouer le contrat sur le site non couvert et REGARDER ») reste obligatoire :
c'est lui qui distingue « parité réelle, garde manquante » (ajouter le témoin
suffit) de « parité rompue » (corriger d'abord). Ne jamais présumer l'un ou
l'autre.

Corollaire de méthode, tiré du même lot : **le contrat s'écrit sur l'INTERSECTION
vérifiée des miroirs, et ce qui diffère entre eux s'EXCLUT explicitement.** Ici,
une carte à deux clés canonisant vers la même langue (`{'pt', 'pt-BR'}`, prisme
`['pt']`) : TS retient la première entrée, Android/iOS la dernière. Cas impossible
en production (le gateway n'émet qu'une clé canonique par langue) — l'encoder
déclarerait un miroir « en faute » sur un cas qui n'arrive jamais. Un vecteur de
contrat ne doit jamais trancher un désaccord que la production ne produit pas ;
il le documente comme hors-périmètre.
