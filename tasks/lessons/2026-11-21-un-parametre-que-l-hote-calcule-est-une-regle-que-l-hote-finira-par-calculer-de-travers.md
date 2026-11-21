## Un paramètre que l'HÔTE calcule est une règle que l'hôte finira par calculer de travers

**Date** : 2026-11-21. **Lot** : #20264 (cycle 209 de la routine temps réel).
**Famille** : source unique, loi 4 (« un contrôle existe s'il a un effet »).

**Ce qui s'est passé**

`useComposerAccess` prenait `rights: ParticipantPermissions | undefined` — une
valeur que son hôte devait composer. `thread.tsx` la composait ainsi :

```ts
const viewerParticipant = useMemo(() => conversation?.participants.find((p) => p.userId === viewer.id), …);
useComposerAccess({ …, rights: viewerParticipant?.permissions });
```

Une colonne. Or `viewer.id` porte un `User.id` pour un inscrit et un
`Participant.id` pour un invité de lien : la ligne d'un visiteur sans compte
était INTROUVABLE, `rights` arrivait `undefined`, et le contrat du composeur lit
cette absence « tout est autorisé ». Le tiroir offrait à un visiteur les tuiles
que l'hôte venait de lui retirer.

**Deux autres sites du même dépôt faisaient la lecture juste** — `menuViewerOf`
résolvait les deux colonnes, `selfSenderOf` branchait sur `isAnonymous`. La règle
était connue, écrite, et appliquée à côté. Elle manquait là où un HÔTE avait dû
la retaper.

**La règle**

**Un paramètre dont la valeur est une RÈGLE ne se demande pas à l'appelant : il
se résout là où vivent ses entrées.** `useComposerAccess` tenait déjà
`conversation` ; il lui manquait `viewer`, c'est-à-dire un paramètre de MOINS
que la forme d'avant. La question à poser à toute signature est :

> *Ce que je demande à mon appelant, est-ce une DONNÉE qu'il possède, ou un
> VERDICT qu'il doit calculer ?* Un verdict demandé à l'appelant est une règle
> dupliquée autant de fois qu'il y a d'appelants, et elle divergera chez celui
> qui la retape sans avoir lu les deux autres.

Corollaire, qui est la forme outillée du § « compter les appelants du helper »
(cycle 123 bis) vue de l'autre côté : **compter les sites qui COMPOSENT un
paramètre, pas seulement ceux qui appellent le helper.** Un helper à un seul
appelant ne garde pas une règle ; un paramètre à un seul compositeur ne la garde
pas davantage — et il est plus discret, parce qu'il n'a pas de nom qu'on puisse
chercher.

**Et la colonne se choisit, elle ne se disjoint pas**

`menuViewerOf` portait `p.userId === id || p.id === id`. En production, les deux
formes rendent le même verdict — un `Participant.id` ne vaut jamais un
`User.id`. La disjonction n'était donc pas un bug. Mais **elle ne DIT rien** :
elle se lit « la clé est d'une nature que je ne connais pas », quand la
passerelle, elle, l'épelle (`isAnonymous ? { id } : { userId }`). Le site unique
branche, et il le branche parce que c'est cette ignorance — pas une faute de
frappe — qui a laissé un troisième site écrire la lecture à une colonne.

> Devant deux formes équivalentes en production, préférer **celle qui nomme ce
> qu'elle sait**. La forme permissive survit à sa propre justesse et sert de
> modèle au site suivant, qui n'aura pas la même chance.
