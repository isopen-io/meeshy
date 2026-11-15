## « Qui a vu » est une fonctionnalité : une lecture garde son lecteur, seule la télémétrie sans fonction visible attend le consentement (2026-10-16, #10785)

**Supplante en partie** [2026-10-16, #10771](2026-10-16-une-lecture-sans-consentement-ne-laisse-qu-une-empreinte-et-trois-drapeaux-10771.md) : ses points 3, 4 et 5 (forme réduite, empreinte, 8 jours) ne s'appliquent plus aux écritures ; ses points 1, 2, 6 et 7 restent.

**Contexte.**

Le lot #10771 / #10773 remplaçait l'identifiant du compte par une empreinte HMAC (`readerKey`) sur `PostEngagement` et `PostImpression` dès que l'analyse n'était pas consentie. Le porteur a tranché le 2026-10-16 :

> « ceci n'est pas un système ads ou publicitaire mais des fonctionnalités de la plateforme : pouvoir afficher plus tard qui a vu son contenu, et non à des fins publicitaires ou de tracking, ce sont des features de la plateforme »

**Décision.**

1. **Les vues, ouvertures, lectures et impressions NOMINATIVES relèvent de l'exécution du service** (RGPD art. 6.1.b), comme le « Vu par » d'une story. `PostEngagement` et `PostImpression` portent `userId` quel que soit le statut d'analyse, sous leur régime de conservation d'avant le lot : 90 jours.
2. **Ce qui reste sous consentement, c'est la télémétrie sans fonctionnalité visible** : les micro-actions (`actions`) et les échantillons de lecture (`watchSamples`) d'une session, rangés vides par la passerelle hors `granted`. Les durées (`dwellMs`, `watchMs`, `mediaDurationMs`, `completed`) restent : un auteur peut vouloir savoir qu'on a regardé jusqu'au bout. Sur une impression, la mesure suit #10483 inchangé : session d'application sous consentement seulement, ni visibilité ni plateforme sous refus.
3. **Restent en place** : le statut établi par la passerelle (`readAnalyticsStanding`, C2 — le client refuse, il n'accorde pas ; `consent` range le statut établi), le contrôle d'audience des sessions (c2564caa49), le cloisonnement des sessions entre comptes (a2176cfd0c), la liste fermée des lecteurs de `PostEngagement` (C4), le vidage de la trace au retrait du consentement (`detachBehaviourOf`), les drapeaux `creditedOpen` / `creditedPlay` / `creditedQualified` (désormais rangés sur chaque ligne), la fusion premier contact → mesure, la déduplication à 10 s et l'invariant vue ⇒ impression.
4. **Compatibilité** : les lignes réduites écrites entre 111c74768d et ce lot (staging, 8 jours) restent LUES — déduplication à 10 s, impression déjà montrée, remplacement de l'impression déduite, export, effacement — par `accountReaderKeyOf`, qui n'est plus appelé par aucune écriture. Une session dont le premier contact a laissé une ligne réduite et dont la mesure arrive ensuite redevient nominative, sans recréditer ce qui l'a été. Schéma : rien de destructif, les champs facultatifs et l'index partiel `(readerKey, postId)` restent jusqu'à extinction des lignes ; jamais de `prisma db push`.

**Conséquences.**

- #10778 (réduction des lignes antérieures) et #10779 (empreinte par compte ou par post) sont caducs.
- La politique de confidentialité doit dire que les auteurs voient qui a vu leur contenu (#10775). Le mode discret « ne pas apparaître dans les vues » est une option produit (#10777), pas une obligation d'opposition.
- Témoins : `posts-engagement-unconsented.test.ts`, `services/social/__tests__/unconsentedImpressions.test.ts`.
