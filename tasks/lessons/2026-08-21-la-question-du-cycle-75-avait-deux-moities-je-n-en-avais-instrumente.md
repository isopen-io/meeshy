## 2026-08-21 — La question du cycle 75 avait DEUX moitiés ; je n'en avais instrumenté qu'une

Cycle 76. Le cycle 75 s'était clos sur une règle juste :

> pour tout événement serveur→client du contrat partagé, la question « qui
> l'ÉMET ? » se pose séparément de « qui l'écoute ? »

J'avais retenu le cas qu'elle venait d'illustrer — *personne n'émet* — et pas
sa moitié symétrique : *quelqu'un émet, un client n'écoute pas*. Écrire la
matrice complète (124 événements × 4 corpus) a pris dix minutes et a sorti le
défaut du jour immédiatement.

**La leçon n'est pas « faire la matrice ». C'est : quand une règle se formule
comme deux questions indépendantes, les DEUX se posent, et une règle qu'on
n'applique que du côté où on l'a apprise n'est appliquée qu'à moitié.**

### Trois pièges de l'instrument lui-même

**1. Chercher les deux formes, littéral ET constante.** Ma première passe ne
cherchait que `'message:restored-for-me'`. Elle a rendu 40 « trous » dont la
plupart étaient faux : le web s'abonne via `SERVER_EVENTS.X`, jamais via la
chaîne. J'ai failli ouvrir un défaut sur `participant:rights-updated`, que le
web honore parfaitement. **Un instrument qui sur-signale ne vaut pas mieux que
pas d'instrument — il coûte la confiance qu'on lui accorde au signal suivant.**

**2. Exclure les tests des corpus.** Un test qui cite le nom d'un événement
fait passer un client pour abonné.

**3. Un `0` est une question, pas un défaut.** Beaucoup sont légitimes
(fonction absente d'une plateforme). Le signal exploitable n'est pas le zéro :
c'est **un verbe présent et son INVERSE absent, sur le même client**. Personne
n'implémente à moitié une paire volontairement — l'asymétrie dénonce l'oubli
là où le zéro seul ne prouve rien.

### Le corollaire qui a failli me faire écrire un no-op vert

Le délégué exposait déjà un verbe qui ressemblait à la solution :
`syncMissedMessages()`. Il est **strictement en avant** (`listAfter(after:
newestLocal)`), alors qu'un message rendu est presque toujours PLUS VIEUX que
le dernier détenu.

Le brancher là aurait produit un correctif parfaitement vert : aucune erreur,
aucun log, aucun test rouge — et aucun message rendu.

> **Avant de réutiliser un verbe de synchronisation existant, lire sa DIRECTION
> et son ANCRE, pas son nom.** « Sync », « refresh », « reload » ne disent rien
> de la région de l'historique réellement couverte. Un backfill par watermark
> ne remonte JAMAIS le temps, et son no-op est silencieux par construction —
> c'est exactement le genre de correctif qui passe la revue et ne corrige rien.

### Et un rappel sur la description d'un défaut

J'allais écrire « le message ne revient jamais ». Faux : il revient si le
lecteur repasse par cette région de l'historique (le REST `listBefore` la
re-couvre). Le vrai reproche est plus embarrassant à formuler et tout aussi
grave : **le retour a lieu à une date qui dépend d'un geste de défilement sans
rapport.** Ne pas durcir un symptôme pour le rendre vendable — l'événement
existe pour que le retour ne soit pas remis au hasard, et c'est déjà tout le
défaut.

---
