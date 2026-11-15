## Leçon 530 — Deux familles de résolveurs, neuf sites, trois régimes pour un même geste

**Directive porteur (2026-09-05)** : « déclencher la remontée après `@` avec
les amis/contacts (normalement existant en local et en cache) ; ensuite
lorsqu'on tape la première lettre ça filtre parmi ses amis et contacts
LOCALEMENT ; c'est au bout de la DEUXIÈME lettre qu'on recherche via API. **Ce
système doit être général pour tous les emplacements où on doit mentionner un
utilisateur.** »

Recensé avant d'agir — et c'est le recensement qui a rendu le lot juste :

| famille | sites | seuil AVANT |
|---|---|---|
| `MentionComposerController` | conversation, commentaires de post, feuille de commentaires du feed, brouillon du composer (×3 surfaces) | `minQueryLengthForAPI = 0` → appel dès le `@` NU |
| `MentionSuggestionsModel` (SDK) | mood, éditeur de texte de story, sélecteur de mention, composer unifié | `guard !trimmed.isEmpty` → appel dès la 1ʳᵉ lettre |

Neuf sites, deux seuils — donc **trois régimes** pour un même geste selon
l'écran où le doigt se trouvait (et mon correctif du matin en ajoutait un
quatrième, en branchant l'annuaire dès le premier caractère).

> **Une constante recopiée dans deux familles n'est pas une règle partagée :
> c'est deux règles qui se ressemblent AUJOURD'HUI.** Le jour où l'une bouge,
> rien ne rougit — les deux compilent, les deux ont l'air délibérées, et
> l'écart ne se voit qu'en passant d'un écran à l'autre avec le même geste.

Loi unique : `MentionLookupRule` (`packages/MeeshySDK/.../Story/ComposerMentionQuery.swift`,
posée à côté de `ComposerMentionQuery` qui découpe déjà le handle — même
question, deux moitiés). Les deux familles l'appellent.

**La raison du seuil n'est pas l'économie d'octets.** `@a` rend des dizaines de
comptes sans rapport et les pousse DEVANT les amis de l'auteur, dans une bande
qui n'en montre que trois ou quatre. Le premier caractère utile est le second.

**Corollaire cache-first, et le piège qu'il porte.** La source locale
(`ComposerMentionFriendsSource`) était réseau seule : le `@` nu attendait un
aller-retour, et son échec (404 en prod) était avalé en liste vide. La rendre
cache-first se fait en deux écritures sur la même propriété — cache, puis
réseau — et **la seconde peut être vide**. Sans garde, servir le cache puis
échouer EFFACE ce qu'on venait de servir : deux écritures dont la seconde peut
être vide sont un REMPLACEMENT, pas une mise à jour.
