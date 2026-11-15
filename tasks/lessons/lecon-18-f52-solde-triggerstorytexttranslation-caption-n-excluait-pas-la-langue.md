## Leçon 18 — F52 soldé : `triggerStoryTextTranslation` (caption) n'excluait pas la langue source, contrairement à son sibling `triggerStoryTextObjectTranslation` (2026-07-04, itération 90)

Résidu explicitement reporté à l'issue de l'itération 89 (« F52 »), même famille sibling-drift que
#40/#42/#45/#50/#55/#56/#57/#59 (« garde/règle appliquée à UNE méthode mais pas à son sibling
structurellement identique »). `PostService` a deux pipelines de traduction de story qui partagent
`resolveAudienceTargetLanguages(authorId)` : le pipeline `textObjects` (overlays,
`triggerStoryTextObjectTranslation`) filtre déjà `allTargetLanguages.filter(l => l !== sourceLanguage)`
avant d'envoyer le job ZMQ ; le pipeline `content` (légende, `triggerStoryTextTranslation`) ne le
faisait PAS — il passait la liste d'audience brute (source incluse) à
`zmqClient.translateToMultipleLanguages`. Conséquence concrète : un auteur francophone dont l'audience
inclut au moins un contact `systemLanguage: 'fr'` déclenchait un aller-retour NLLB `fr→fr` sur CHAQUE
story avec légende, et le handler de résultat (`$runCommandRaw` sur `translations.fr`) écrasait le champ
avec une **paraphrase** de la légende originale au lieu de la laisser intacte — violation directe de la
règle Prisme « le contenu déjà dans la langue préférée du viewer doit rester l'original, jamais une
resucée machine ». Fix : recalculer `sourceLanguage` AVANT de résoudre l'audience (au lieu d'après), puis
filtrer `allTargetLanguages.filter(l => l !== sourceLanguage)` — mirror exact du sibling, mêmes noms de
variables (`allTargetLanguages` / `targetLanguages`) pour que la divergence future soit visuellement
évidente en diff. Aucune signature changée, zéro requête supplémentaire, comportement inchangé pour toute
audience ne partageant pas la langue source. Tests : nouveau fichier
`PostService.storyCaptionSourceFilter.test.ts` (3 cas : filtre appliqué, plus aucun call ZMQ quand
l'audience entière == source, comportement inchangé quand aucune langue cible ne matche) — RED prouvé
(le mock capture `targetLanguages: ['fr','es']` non filtré avant le fix), GREEN après. Suites
`posts|Post` : 1128/1128 tests verts (51/52 suites ; le seul échec, `core.story-translation.test.ts`,
est un TS2305 préexistant sur `SequenceService.ts` important `PrismaClient` depuis `'@prisma/client'` —
confirmé identique sur `git stash`, même classe que le résidu documenté Leçon 17/itération 87). **Piège
de test à noter : `triggerStoryTextTranslation` enregistre un listener ZMQ (`zmqClient.on`/`.off`) et un
`setTimeout(60_000)` de cleanup — contrairement à son sibling fire-and-forget
`triggerStoryTextObjectTranslation`, le mock `ZMQSingleton.getInstanceSync` doit donc fournir `on`/`off`
(sinon l'appel jette et le test observe silencieusement 0 call — pas une erreur explicite), et le test
doit activer `jest.useFakeTimers()` pour ne pas laisser un timer réel de 60s ouvert après la fin du test
(sinon Jest force-exit après un délai, `--detectOpenHandles` visible dans les logs CI).**
