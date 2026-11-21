## Une file de « pas encore fait » qui rate l'absence s'AUTO-ENTRETIENT (cycle 181, #19748)

Le tri par colonne des 126 égalités nues de #19748 a rendu deux familles de
défauts, et elles ne se réparent pas avec la même urgence. Une PORTE qui refuse
(`findMany({ where: { …, champ: null } })` sur un gate) refuse tout le monde,
bruyamment, et un chemin voisin finit par écrire la colonne. Une FILE de « pas
encore » — la même lecture, posée sur « les lignes à traiter » — est vide, donc
rien n'est traité, donc la colonne n'est jamais écrite, donc **la file reste vide
pour toujours.**

Trois exemplaires, tous mesurés le 2026-11-19 :

- `Conversation.lastActivityAt` — son unique écrivain est gardé par
  `OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }]`, dont **aucune
  branche n'apparie une clé absente**. Aucun créateur de conversation n'écrit la
  colonne : elle n'a donc **jamais été écrite une seule fois**, et l'axe
  « activité » du rang de la liste de conversations n'existe pas (#19800) ;
- `AccountDeletionRequest.lastReminderAt` — même `OR`, même verdict : **le PREMIER
  rappel hebdomadaire ne part jamais**, donc aucun (#19802) ;
- `PartnerProfile.verifiedAt` — `pending()` ne rend que les profils dont l'identité
  a changé APRÈS une vérification, jamais un profil neuf : aucun partenaire ne peut
  être vérifié une première fois (#19802).

> **Devant une lecture qui compose une FILE, la question n'est pas seulement
> « apparie-t-elle l'absence ? » mais « qui écrit la colonne la PREMIÈRE
> fois ? »** Si la réponse est « le traitement que cette file déclenche », le
> défaut est un point fixe : il ne produit aucun signal, ne se dégrade pas, et ne
> guérit pas. Et ce qui le rend durable est sa ressemblance avec la santé : **une
> file vide ressemble à une file à jour**, et un balayage qui ne trouve rien à
> nettoyer journalise un succès.

Corollaire pour le correctif : réparer une telle lecture **déclenche l'arriéré
d'un coup** — un envoi d'e-mails de masse (`lastReminderAt`), une suppression de
fichiers jamais mesurée (#19801), un reclassement de toute la liste de
conversations (#19800). C'est la règle du cycle 84 : réparer ce qui rendait une
donnée invisible oblige à décider, dans le MÊME lot, de ce que la visibilité
déclenche.
