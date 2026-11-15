## Leçon 54 — un fast-path "perf" qui diffuse un effet observable AVANT le contrôle d'autorisation reste risqué même quand le contrôle d'autorisation lui-même est correct (routine calling-feature, Vague 35, 2026-07-10)

`CallEventsHandler.ts`'s `call:end` handler avait un fast-path de perf (2026-07-04) qui diffusait
`call:ended` à la room dès que `socket.rooms.has(ROOMS.call(callId))` était vrai, avec le commentaire
« l'appartenance à la room EST l'autorisation — rejoindre a exigé un `call:join` vérifié en DB ». Cette
affirmation était vraie AU MOMENT du join, pas un invariant permanent : rien n'évince un socket de la call
room si l'autorisation sous-jacente est révoquée plus tard (retrait de la conversation en cours d'appel).
Un fix sécurité du même jour (2026-07-10) avait déjà corrigé le SYMPTÔME visible côté écriture DB
(`resolveParticipantIdFromCall` échouant refuse maintenant de force-end la session) — mais le broadcast
fast-path, place AVANT ce contrôle dans le code, avait déjà notifié la room par le temps que le rejet
s'exécute. Le contrôle d'autorisation lui-même était correct ; seul son PLACEMENT après un effet de bord
déjà émis le rendait inefficace pour ce cas précis.

**Signature du bug** : un commentaire justifie un fast-path/raccourci par "X a déjà été vérifié à l'étape Y
(join/login/attribution initiale)", mais le fast-path s'exécute à une étape Z ultérieure sans revalider —
et rien dans le système ne garantit que la condition vraie en Y reste vraie en Z (pas d'éviction de room,
pas de TTL, pas de re-check périodique). Un fix de sécurité qui corrige le contrôle d'autorisation
LUI-MÊME sans auditer TOUT ce qui s'exécute avant lui dans le même handler laisse le trou ouvert pour
n'importe quel effet de bord placé plus tôt (broadcast, écriture cache, notification push, etc.) — cf.
Leçon 52 (garde placé avant un `await` qui peut throw) pour le même symptôme côté écriture, mais ici
côté diffusion réseau observable par un tiers, pas côté état interne.

**Règle réutilisable** : quand un fix corrige un contrôle d'autorisation dans un handler, lire le handler
ENTIER de haut en bas et lister chaque effet de bord observable par un tiers (broadcast socket, écriture
DB, notification push, log visible côté client) qui s'exécute AVANT ce contrôle — pas seulement APRÈS,
là où le contrôle corrigé s'applique déjà. Un fast-path "perf" ajouté pour la latence perçue est le
site le plus probable d'un tel effet de bord prématuré, précisément parce qu'il existe pour COURT-CIRCUITER
le chemin qui contient le contrôle d'autorisation complet.

---
