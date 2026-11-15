## Le rangement d'une catégorie est INJECTÉ, pas déduit de son nom (2026-08-16, cycle 49)

**Contexte** : `privacy` est la seule catégorie dont l'état ne tient pas dans son
document JSON — les lignes clé/valeur de janvier 2026 que les six portes de
diffusion obéissent toujours (cycle 46). Les routes ne lisaient que le document :
l'écran affichait « tout visible » pendant que le serveur taisait, et le `PATCH`
reconstruisait sa base sur ce défaut.

**Décision** : `createPreferenceRouter` accepte un `CategoryStorage<T>` optionnel
— `readStored` (ce que le serveur tient pour stocké) et `afterWrite` (ce qu'il
faut retirer une fois le document autoritatif). Le rangement de `privacy` est
composé au site d'enregistrement, dans `routes/me/preferences/index.ts`.

**Alternatives rejetées** :
- **`if (category === 'privacy')` dans la factory**, comme le fait déjà
  `invalidateServerCache`. Chaque catégorie à histoire ajouterait une branche à
  un module qui n'a aucune raison de connaître ces histoires.
- **Surcharger le `GET`/`PATCH` de `privacy` hors factory.** Deux implémentations
  des mêmes quatre verbes, dont une seule recevrait les correctifs suivants.
- **Mémoïser `resolveStoredPrivacyPreferences` dans le cache des portes.**
  Ce cache tolère 5 min de retard parce qu'une écriture le purge ; un écran de
  réglages qui affiche une valeur qu'un AUTRE processus vient de changer est
  exactement le défaut qu'on referme, sous un autre nom.
- **Garder les lignes de janvier après écriture.** Sans `afterWrite`, la remise à
  zéro repose le document à `null`, la lecture redescend sur janvier, et
  « réinitialiser » ne réinitialise rien tout en n'étant plus visible nulle part.
