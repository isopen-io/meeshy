## Un schéma OUVERT publie tout ce qu'un `select` élargi ramène (2026-11-21, #20163)

Le dépôt a une loi très écrite sur les schémas de réponse : **un objet sans `properties` EFFACE**, et un champ servi mais non déclaré est supprimé par `fast-json-stringify`. Elle protège contre la perte. Son miroir n'était écrit nulle part, et il protège contre la FUITE :

> **`additionalProperties: true` fait de tout élargissement de `select` une publication.** Sur un schéma fermé, ajouter une colonne à la requête ne change rien jusqu'à ce qu'on la déclare — on a deux gestes, donc une occasion de réfléchir. Sur un schéma ouvert, le premier geste suffit.

Mesuré sur la section `messages` de l'export RGPD, déclarée `items: { type: 'object', additionalProperties: true }`. Le correctif de #20163 ajoutait les cinq colonnes de l'enveloppe au repos pour pouvoir ouvrir le sceau ; deux d'entre elles sont le CHIFFRÉ (`encryptedContent`, `encryptionMetadata`). Servies telles quelles, elles entraient dans l'archive. La variante `revealAtRestRowsForWire` existe précisément pour les retirer — et le choix entre elle et `revealAtRestRows` n'est pas une préférence de style : c'est la différence entre un correctif et une fuite.

**La question est celle du cycle 125, retournée contre son propre correctif** : « la charge que ce site remet contient-elle autre chose que ce que je viens de corriger ? » — à poser non seulement à une garde, mais à tout lot qui ÉLARGIT une lecture. Et elle se répond en lisant le SCHÉMA de la section, pas la fonction.

### Corollaire mesuré dans le même lot : une forme nominale se vérifie PAR MODÈLE

#19909 a appris au dépôt que `deletedAt: null` dans un `where` Prisma + MongoDB est une ÉGALITÉ qui exige la clé PRÉSENTE, et que les créateurs de `Post` et de `PostComment` ne l'écrivent pas — les trois sections de publication de l'export n'appariaient donc aucune ligne. La leçon est juste, et **elle ne se transporte pas**.

J'ai failli ouvrir un second défaut sur le `deletedAt: null` de la section `messages`, qui aurait été faux. `services/messaging/liveMessage.ts` porte `LIVE_MESSAGE_MARK = { deletedAt: null }`, que **tous** les créateurs de `Message` répandent — `MessageProcessor`, `CallService`, `conversationNotice`, `MessageTranslationService`. La clé est présente, l'égalité apparie, le filtre est juste. Le dépôt le savait déjà : le cliquet `soft-state-equality-filter-guard` nomme cette discipline d'écriture en toutes lettres, et son inventaire de sites nus est VIDE.

> **Avant de rejouer sur un modèle une loi apprise sur un autre, chercher sa discipline d'ÉCRITURE.** Un filtre identique est juste ici et faux là, pour une raison qui ne vit ni dans le filtre ni dans le schéma mais chez les producteurs de la ligne. Et le dépôt a souvent déjà répondu : un cliquet qui EXEMPTE un champ dit pourquoi il l'exempte.

Ce qui a évité l'erreur n'est pas une intuition : c'est d'avoir cherché à MESURER avant d'écrire, faute d'une base de données sous la main — puis d'être tombé sur le cliquet qui portait la réponse. Un défaut annoncé et faux coûte plus cher qu'un défaut tardif : il envoie tout le monde chercher là où il n'y a rien.

Preuve : `services/gateway/decisions/2026-11-21-l-export-rgpd-ouvre-le-sceau-au-repos-de-ses-messages-20163.md`, `src/__tests__/unit/export-rgpd-messages-sceles-au-repos.test.ts`.
