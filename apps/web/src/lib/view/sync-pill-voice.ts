/**
 * **UNE SEULE VOIX POUR L'ÉTAT RÉSEAU** (revue #7083, défaut majeur 5 — D-11,
 * « jamais deux notifications pour un même événement »).
 *
 * MESURE du défaut, au navigateur sur le `dist`, schéma clair, 390 × 844,
 * réseau coupé : sur `/u/<pseudo>` la pastille globale occupe
 * `[149, 72, 92, 27]` et la carte `[data-profile-offline]` de l'écran
 * `[16, 73, 358, 75]` — elles se CHEVAUCHENT, et le mot « Hors ligne » se lit
 * deux fois, dont une moitié recouverte par l'autre. `/me` porte exactement la
 * même paire (`[149, 72, 92, 27]` contre `[16, 72, 358, 96]`).
 *
 * **QUI SE TAIT, ET POURQUOI C'EST LA PASTILLE.** La carte de l'écran dit ce
 * que la coupure change ICI — « Le profil s'affichera à la reconnexion » —,
 * elle vit dans le flux de la page, et elle survit au défilement du lecteur.
 * La pastille, elle, ne peut dire que « Hors ligne » : sur ces routes son
 * texte est un SOUS-ENSEMBLE strict de celui qu'elle recouvre. Entre deux
 * voix qui disent la même chose, on garde la plus riche.
 *
 * **CE QUI NE SE TAIT JAMAIS** : `failed` et `syncing`. Ils parlent de
 * l'OUTBOX, pas du réseau — aucun écran ne les double, et `failed` est
 * précisément l'état qui doit survivre à un changement d'écran (doctrine de
 * priorité de `sync-pill.ts`). Seul `offline` se tait, et seulement ici.
 *
 * **CE QUE CE SILENCE COÛTE, dit à voix haute** : hors ligne avec des envois
 * en file, la pastille aurait ajouté « — 2 en attente ». Sur une route de
 * PROFIL, ce décompte n'a ni geste ni contexte ; il revient intact dès que le
 * lecteur retourne sur une surface qui envoie, et un envoi qui RENONCE reste
 * annoncé partout par `failed`.
 *
 * **LA LISTE EST FERMÉE**, comme celle de `sync-pill-offset.ts` et de
 * `floating-gate.ts` : une route n'entre ici qu'avec sa MESURE de
 * chevauchement. Six autres écrans peignent aussi leur propre carte hors ligne
 * (`settings-sections`, `discover-parts`, `calls-parts`, `communities-parts`,
 * `status-compose`, `links-parts`) — leur carte ne vit pas forcément sous la
 * pastille, et les inscrire sans mesure ferait taire la pastille là où elle ne
 * recouvre rien. Chacun entre quand son chevauchement est relevé ; le
 * MÉCANISME, lui, est posé une fois pour toutes, ici.
 *
 * **`storiesMine` a rejoint la liste en revue-correction de #6149** : le
 * bandeau `[data-my-stories-offline]` de « Mes stories »
 * (« Hors ligne — la suppression sera possible au retour du réseau. »)
 * mesurait le MÊME chevauchement que `/u/` et `/me` — la pastille globale
 * posée par-dessus, aux deux schémas — pour la même raison : sa carte dit un
 * sur-ensemble strict de ce que la pastille dirait seule.
 */
const ROUTES_WITH_OWN_OFFLINE_CARD: ReadonlySet<string> = new Set(['profile', 'userProfile', 'storiesMine']);

/** `false` ⇒ la pastille se tait sur l'état `offline` de cette route : l'écran
 * porte déjà cette voix, en plus riche. */
export const pillAnnouncesOffline = (routeKey: string): boolean => !ROUTES_WITH_OWN_OFFLINE_CARD.has(routeKey);
