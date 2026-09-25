## Leçon 609 — Un résolveur « site unique » ne l'est que pour les appelants qui l'APPELLENT : la question n'est pas « la règle existe-t-elle ? » mais « quelles surfaces la contournent ? » (2026-09-13)

**Cas.** Retour porteur : sur `staging.meeshy.me/notifications`,
`GET https://gate.meeshy.me/2026/09/<id>/harbor_<uuid>.png net::ERR_FAILED`,
puis `workbox … no-response`. `apps/web-v2` avait pourtant DEUX lots consacrés
à cette règle (#5668, #5805), un site unique déclaré (`attachmentSrc`,
`media-url.ts`) et un doc-comment de quarante lignes qui l'énonce.

1. **Le site unique servait les PIÈCES JOINTES, et l'identité lui échappait.**
   `attachmentSrc` était appelé par les huit surfaces qui rendent un média de
   message ou de post. L'AVATAR (`Avatar src`, dix appelants), la VIGNETTE
   d'une notification, la BANNIÈRE d'une communauté et celle d'un profil
   posaient la valeur brute. Rien ne les distinguait à la relecture : ce sont
   des `<img src={…}>` comme les autres, et le champ s'appelle `avatar`, pas
   `fileUrl` — **le nom du champ avait masqué la nature de la donnée.** La
   requête qui les trouve n'interroge pas le résolveur mais son COMPLÉMENT :
   `grep "src={"` moins les appels à `attachmentSrc`.
2. **La règle vit DANS le composant partagé, pas chez ses dix appelants.** Le
   legacy avait déjà tranché ainsi (`AvatarImage`,
   `apps/web/components/ui/avatar.tsx`, « point de passage unique ») ; le
   chantier avait recopié le composant sans recopier la règle. Demander à
   chaque appelant de se souvenir, c'est la voir oubliée au onzième.
3. **Le résolveur lui-même testait la FORME au lieu de la CIBLE.** Une chaîne
   `https://…` y valait « déjà résolue » — vrai pour un CDN, faux pour
   `https://gate.meeshy.me/2026/09/…`, qui porte un hôte et une clé mais
   AUCUNE route (la racine de la passerelle ne sert rien). Idem pour
   `/2026/09/…` : une barre initiale n'est pas une route. La question juste
   n'est pas « cette chaîne a-t-elle la forme d'une adresse ? » mais **« la
   route qu'elle désigne existe-t-elle ? »**
4. **Une migration qui reconnaît un SEGMENT laisse tout ce qui ne le porte
   pas.** La 013 réécrit les valeurs contenant `/attachments/file/` ; l'adresse
   héritée sans segment de service lui a échappé — non comptée, non
   sauvegardée, toujours servie. Un inventaire de migration énonce deux
   affirmations, et la seconde (« ce sont là toutes les formes ») n'est presque
   jamais vérifiée (leçon 261, rejouée sur des données au lieu de résolveurs).
5. **L'hôte que porte une donnée héritée est à JETER, pas à honorer.** Sur
   staging, la valeur en base nommait la passerelle de PRODUCTION (un dump
   restauré — le risque que le doc-comment de la 013 énonce mot pour mot). La
   réparation vise la base CONFIGURÉE : la clé identifie le fichier, l'hôte est
   une décision de déploiement (#4324).
6. **Et l'échec était MUET.** `onError` masque l'`<img>`, le dégradé
   d'initiales réapparaît : « photo introuvable » se lit exactement comme
   « compte sans photo ». Seule la console le disait, et seulement sur le web —
   iOS et Android portent les deux mêmes trous (#6389) sans même une console
   pour les dire.

Correctif : #6388 (web). Suivis ouverts : #6389 (iOS/Android), #6390 (les
lignes héritées en base), #6391 (le magasin `static:`, que le chantier ne
connaît pas du tout).
