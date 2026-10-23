# Decisions - packages/MeeshySDK (Swift SDK)

> **Un fichier par décision, sous `packages/MeeshySDK/decisions/` (#7711).** Ce fichier garde son préambule et la CARTE des décisions prises avant le 2026-09-25 ; il ne reçoit plus de décision : la garde `journal-one-file-per-entry-guard` (passerelle) rougit sur tout titre `## ` posé ici.
>
> **Écrire une décision** : créer `packages/MeeshySDK/decisions/<AAAA-MM-JJ>-<slug>.md`, dont la première ligne est `## <AAAA-MM-JJ> : <titre>`. Aucune ligne à ajouter ici.

**Carte des décisions, dans l'ordre du fichier d'origine**

- [2026-08-16 : Le groupe d'aperçu se lit en TRI-ÉTAT, et son vidage est un geste unique](decisions/2026-08-16-le-groupe-d-apercu-se-lit-en-tri-etat-et-son-vidage-est-un-geste.md)
- [2026-08-10: Prisme de l'aperçu — deux chemins, une seule convention de clés](decisions/2026-08-10-prisme-de-l-apercu-deux-chemins-une-seule-convention-de-cles.md)
- [2025-02: Architecture - Dual-Target (MeeshySDK + MeeshyUI)](decisions/2025-02-architecture-dual-target-meeshysdk-meeshyui.md)
- [2025-02: Dpendance unique - Socket.IO Client](decisions/2025-02-dpendance-unique-socket-io-client.md)
- [2025-02: Networking - APIClient gnrique async/await](decisions/2025-02-networking-apiclient-gnrique-async-await.md)
- [2025-02: Sockets - Deux managers spars](decisions/2025-02-sockets-deux-managers-spars.md)
- [2025-02: Cache Mdia - Swift Actor](decisions/2025-02-cache-mdia-swift-actor.md)
- [2026-03: Unified Cache System - CacheCoordinator + typed stores](decisions/2026-03-unified-cache-system-cachecoordinator-typed-stores.md)
- [2025-02: Models - Decodable + toDomain() pattern](decisions/2025-02-models-decodable-todomain-pattern.md)
- [2025-02: Auth - UserDefaults (DETTE TECHNIQUE)](decisions/2025-02-auth-userdefaults-dette-technique.md)
- [2025-02: Events - Combine PassthroughSubject](decisions/2025-02-events-combine-passthroughsubject.md)
- [2025-02: Configuration - MeeshyConfig centralis](decisions/2025-02-configuration-meeshyconfig-centralis.md)
- [2026-05: Story Canvas — Cartographie GPU/Metal (NE PAS SUPPRIMER)](decisions/2026-05-story-canvas-cartographie-gpu-metal-ne-pas-supprimer.md)
- [2026-05-12: Story Publish Queue — Unification (StoryOfflineQueue → adapter)](decisions/2026-05-12-story-publish-queue-unification-storyofflinequeue-adapter.md)
- [2026-05-12: ThumbHash — alignement Wolt spec (encodeur + decodeur DCT complets)](decisions/2026-05-12-thumbhash-alignement-wolt-spec-encodeur-decodeur-dct-complets.md)
- [2026-08-09 : AudioPlayerView — l'audio suit la langue Prisme automatiquement (renversement du « B9 fix »)](decisions/2026-08-09-audioplayerview-l-audio-suit-la-langue-prisme-automatiquement.md)
- [2026-08-12: Delta de liste — le curseur n'avance que sur une page dont le serveur atteste la complétude](decisions/2026-08-12-delta-de-liste-le-curseur-n-avance-que-sur-une-page-dont-le-serveur.md)
- [2026-08-13: Delta de liste — les SORTIES de vue voyagent hors page, et iOS doit les lire](decisions/2026-08-13-delta-de-liste-les-sorties-de-vue-voyagent-hors-page-et-ios-doit-les.md)
- [2026-08-14 — La reconstruction du socket doit rendre compte de ce qu'elle a bâti](decisions/2026-08-14-la-reconstruction-du-socket-doit-rendre-compte-de-ce-qu-elle-a-bati.md)
- [Le groupe d'aperçu est atomique, y compris quand le payload n'en porte qu'une part](decisions/le-groupe-d-apercu-est-atomique-y-compris-quand-le-payload-n-en-porte-qu-une.md)
- [2026-08-16 : Le masquage PERSONNEL se purge, il ne se met pas en pierre tombale](decisions/2026-08-16-le-masquage-personnel-se-purge-il-ne-se-met-pas-en-pierre-tombale.md)
- [2026-08-21 : Le retour en vue PERSONNEL se relit ; il ne s'écrit pas localement](decisions/2026-08-21-le-retour-en-vue-personnel-se-relit-il-ne-s-ecrit-pas-localement.md)
- [2026-08-22 : Plan 2D — le STOP budget D4 est levé par DÉROGATION du porteur produit, la virtualisation restant le gage](decisions/2026-08-22-plan-2d-le-stop-budget-d4-est-leve-par-derogation-du-porteur-produit.md)
- [2026-10-05 : Le Jeu Meeshy — la loi dans le CŒUR, les briques dans l'UI, les routes écrites à la main](decisions/2026-10-05-le-jeu-meeshy-la-loi-au-coeur-les-briques-dans-l-ui-les-routes-a-la-main.md)
- [2026-10-11 : La loi du carnet vit dans le SDK (`GamePhotoCatchUpLaw`, enveloppe app inchangée) et se rejoue sur les vecteurs partagés `photo-catch-up`, `photo-offer`, `photo-standing` ; une loi du jeu livre TS + vecteurs + Swift + évaluateur dans la même PR (#10155)](decisions/2026-10-11-la-loi-du-carnet-vit-dans-le-sdk-et-se-rejoue-sur-les-vecteurs.md)
- [2026-10-17 : Chaque bundle de test du package est scellé au réseau dès son chargement — mécanisme `NetworkTransportSeal` au SDK, décision dans `MeeshyTestSupport` (#10854)](decisions/2026-10-17-chaque-bundle-de-test-du-package-est-scelle-au-reseau-des-son-chargement.md)
- [2026-10-19 : Quatre primitives de concurrence (`Locked`, `TeardownBox`, `CancellableWaiters`, `cancellableSleep`) remplacent verrous, teardowns et attentes annulables ; pas de task group pour `BoundedAsyncResolution` (#11050)](decisions/2026-10-19-quatre-primitives-de-concurrence-remplacent-verrous-teardowns-et-attentes-annulables.md)
- [2026-10-20 : Une migration GRDB est un type, son identifiant ne change jamais, l'ordre de la table est l'ordre historique (#11092)](decisions/2026-10-20-une-migration-grdb-est-un-type-et-son-identifiant-ne-change-jamais.md)
- [2026-10-22 : Un seul `AVAudioEngine` pour les canevas de lecture (`ReaderAudioEngineHost`), une loi de repos commune, le changement de sortie et la réinitialisation des services média observés, les fichiers ouverts hors du fil principal (#9878)](decisions/2026-10-22-un-seul-moteur-audio-pour-les-canevas-de-lecture.md)
- [2026-10-23 : Une vidéo se lit dans le transfert qui remplit le cache — `ProgressiveMediaDownload`, `ProgressiveURLAsset` (`meeshy-cache://`), une requête par URL (#9881)](decisions/2026-10-23-une-video-se-lit-dans-le-transfert-qui-remplit-le-cache.md)
- [2026-10-23 : La fenêtre lointaine des réels n'amorce que la tête du fichier — `prefetchHead`, reprise par plage à l'élection (#11288)](decisions/2026-10-23-la-fenetre-lointaine-des-reels-n-amorce-que-la-tete.md)
