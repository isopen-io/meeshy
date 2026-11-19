# Une file de « pas encore fait » qui rate l'absence s'AUTO-ENTRETIENT

*2026-11-19, cycle 181 — tri de #19748, issues #19800, #19801, #19802, #19803.*

## Ce qui s'est passé

Le tri par colonne des 126 égalités nues a rendu deux familles de défauts, et
elles ne se réparent pas avec la même urgence :

| famille | la forme | ce qui arrive |
|---|---|---|
| une PORTE qui refuse | `findMany({ where: { …, champ: null } })` sur un gate | tout le monde est refusé — bruyant, et un chemin voisin finit par écrire la colonne |
| une FILE de « pas encore » | la même lecture sur « les lignes à traiter » | la file est vide, donc rien n'est traité, donc la colonne n'est jamais écrite, donc **la file reste vide pour toujours** |

Trois exemplaires de la seconde, tous mesurés :

- `Conversation.lastActivityAt` — son unique écrivain est gardé par
  `OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: at } }]`, dont **aucune
  branche n'apparie une clé absente**. Aucun créateur de conversation n'écrit la
  colonne : elle n'a donc **jamais été écrite une seule fois**, et l'axe
  « activité » du rang de la liste n'existe pas (#19800) ;
- `AccountDeletionRequest.lastReminderAt` — même `OR`, même verdict : **le
  PREMIER rappel hebdomadaire ne part jamais**, donc aucun (#19802) ;
- `PartnerProfile.verifiedAt` — `pending()` ne rend que les profils dont
  l'identité a changé APRÈS une vérification, jamais un profil neuf : aucun
  partenaire ne peut être vérifié une première fois (#19802).

## La règle

> **Devant une lecture qui compose une FILE, la question n'est pas seulement
> « apparie-t-elle l'absence ? » mais « qui écrit la colonne la PREMIÈRE
> fois ? »** Si la réponse est « le traitement que cette file déclenche », le
> défaut est un point fixe : il ne produit aucun signal, ne se dégrade pas, et ne
> guérit pas.

Et la réciproque est ce qui rend ces défauts si durables : **une file vide
ressemble à une file à jour.** Un balayage qui ne trouve rien à nettoyer
journalise un succès.

## Corollaire pour le correctif

Réparer une telle lecture **déclenche l'arriéré d'un coup**. Les trois issues
le portent dans leur critère de fin, parce que c'est la règle du cycle 84 :
réparer ce qui rendait une donnée invisible oblige à décider, dans le MÊME lot,
de ce que la visibilité déclenche — ici un envoi d'e-mails de masse
(`lastReminderAt`), une suppression de fichiers jamais mesurée (#19801), ou un
reclassement de toute la liste de conversations (#19800).
