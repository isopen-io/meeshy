## Leçon 514 — Une exemption lève exactement ce qu'elle a été relue pour lever

**Ce qui s'est passé.** Le brouillon du composer (#4966) est le SECOND fichier
de la v3 autorisé à toucher le stockage du navigateur. La liste des détenteurs
existait — un témoin (`zone-session-invitee.test.ts`) et une règle ESLint —, et
elle avait été écrite quand il n'y en avait qu'UN. Les deux moitiés du défaut
qu'elle garde — la CLÉ `meeshy.guest` composée ailleurs, et l'ACCÈS direct au
stockage — vivaient dans **une seule liste**, `restrictedStorageSyntax`, et
l'unique exemption (`lib/api/guest-session.ts`) les levait ensemble.

C'était sans conséquence tant qu'il n'y avait qu'un détenteur : le seul fichier
exempté était précisément celui dont la clé était le sujet. Ajouter le second
par le même geste lui aurait rendu **le droit d'écrire `meeshy.guest`**, qui ne
le concerne en rien — un défaut ouvert par une exemption, pas par du code.

**La règle.** *Une liste d'interdits fusionnée est une exemption fusionnée.*
Tant qu'un seul site est exempté, la fusion est invisible ; au second, elle
distribue des droits que personne n'a relus. La question à poser en ajoutant une
entrée à une liste d'exemptions est donc : **qu'est-ce que cette entrée lève, en
plus de ce que je viens d'y écrire ?** — et si la réponse dépasse le besoin,
c'est la liste des interdits qu'il faut scinder, pas l'exemption qu'il faut
élargir.

**Le témoin qui l'a rendu.** Aucun. Le gate a rougi sur le bon fait — « ce
fichier touche au stockage » — et la scission est venue de la lecture de
l'exemption qu'on s'apprêtait à écrire. C'est l'inverse du cas ordinaire : ici
le gate a fait son travail, et le risque était dans la **réparation**.

**La forme générale.** C'est la jumelle des cycles 123-125 appliquée aux
PERMISSIONS plutôt qu'aux charges : « que transporte cette garde à côté de ce
que je regarde ? » devient « qu'autorise cette exemption à côté de ce que je
veux autoriser ? ». Dans les deux cas, ce qui échappe est ce qui voyage avec.

Sites : `apps/web-v3/eslint.config.mjs` (`cleDuJetonInvite` / `accesAuStockage`,
scindés ; `DETENTEUR_DU_BROUILLON`, qui ne lève que le second),
`apps/web-v3/__tests__/zone-session-invitee.test.ts` (`DETENTEURS_DE_STOCKAGE`,
dont chaque entrée porte désormais sa raison de STOCKAGE et pas seulement sa
clé). Issue #4966.
