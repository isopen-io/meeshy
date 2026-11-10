## 2026-11-10 : La coquille « ami WhatsApp » n'existe qu'au staging, derrière la porte pair externe et l'accès de l'équipe (#17116)

### Contexte
Chantier #17007, design `docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md` § 4 « Preuve de bout
en bout » : une coquille web joue l'ami WhatsApp contre le staging, chiffre avec le pont WASM libsignal (#17114)
et parle à la passerelle par la porte « pair externe » (#17115), qu'aucune route ne branchait encore.

### Décision
- **Routes de la porte** (`src/routes/external-peer.ts`, préfixe `/api/v1/external-peer/whatsapp/`) : publier un
  bundle, lire les bundles d'un utilisateur, remettre une enveloppe, relever, accuser réception. Elles ne sont
  MONTÉES que si `selectExternalPeer` ouvre la porte (`EXTERNAL_PEER_PROVIDER=fake-whatsapp` et staging déclaré,
  développement ou test) : en production, ni la porte ni la page n'existent, même si la variable était posée.
  Les pièces opaques restent hors de ces routes (lot « médias externes »).
- **Accès** : un compte de l'ÉQUIPE (`isPlatformTeam`, MODERATOR et au-dessus) seulement — `401` sans compte,
  `403 EXTERNAL_PEER_TEAM_ONLY` sinon. Un membre de l'équipe joue librement un numéro WhatsApp simulé ; il
  n'agit pour un appareil Meeshy (`side: 'meeshy'`) que si c'est le SIEN (`403 EXTERNAL_PEER_NOT_YOUR_DEVICE`).
  L'accès des comptes ordinaires se décidera avec la conversation externe (lot suivant).
- **Refus** : chaque appel passe par `admitExternalPeer` ; un `ExternalPeerError` sort sous son code
  (`422` clair refusé ou empreinte fausse, `400` contrat ou clé privée, `404` pair ou pièce inconnus) et un
  message fixe — jamais la requête ni le message de Zod. Une panne inattendue ne journalise que le nom de
  l'erreur. 120 appels par minute et par compte.
- **La page** (`GET …/coquille/`) est servie par la passerelle depuis `assets/dma-coquille/`, lue UNE fois au
  montage : seuls les fichiers de ce répertoire, par leur nom exact (`.html`, `.js`, `.wasm`). Politique de
  contenu propre : `script-src 'self' 'wasm-unsafe-eval'` (le minimum pour compiler un WASM),
  `connect-src 'self'`, `frame-ancestors 'none'`, `default-src 'none'` ; `no-store`, `noindex`. La page ne
  porte aucun secret : tout ce qu'elle fait passe par les routes réservées à l'équipe.
  L'adresse sans barre finale (`…/coquille`) renvoie (`308`) vers `…/coquille/` : la passerelle ne pose pas
  `ignoreTrailingSlash`, et la page charge son module et son WASM à côté d'elle.
- **Construction** : l'image de la passerelle construit la coquille avec bun depuis les sources du web
  (`apps/web/dma-coquille/`, hors de `src/` donc hors de l’application, et le pont `apps/web/src/lib/e2ee/`) — aucune copie du pont ni du WASM dans
  la passerelle, aucune dépendance installée. Les fichiers sont donc dans toute image ; seule la porte décide
  s'ils sont servis.
- **Staging** : `docker-compose.staging.yml` pose `EXTERNAL_PEER_PROVIDER=${EXTERNAL_PEER_PROVIDER:-fake-whatsapp}`
  sur `gateway-staging` ; toute autre valeur dans le `.env` de l'hôte ferme la porte. La composition de
  production n'en dit rien (garde `external-peer-staging-only-guard.test.ts`).

### Alternatives rejetées
- *Servir la coquille par l'image web* : la même image sert le staging et la production ; la page y serait
  publiée partout.
- *Un conteneur de staging dédié* : une image et un routeur Traefik de plus pour une page de recette, quand la
  passerelle sait déjà décider où la porte existe.
- *Recopier le pont libsignal ou son WASM dans la passerelle* : une jumelle à tenir à jour ; la construction lit
  la source unique du web.

### Conséquences et limites assumées
- Au staging, tout membre de l'équipe peut jouer n'importe quel numéro simulé et en lire les enveloppes : c'est un
  banc de recette, pas un service ; le faux ne tient que des clés publiques et des chiffrés.
- L'appareil Meeshy de la recette publie son bundle dans le FAUX (l'annuaire de « WhatsApp »), pas dans
  l'annuaire E2EE de Meeshy : relier la conversation externe à l'identité par appareil de Meeshy est l'affaire
  du lot « conversation externe ».
- Le refus d'un clair reste celui de la porte : il attrape le clair accidentel, pas un clair emballé dans un
  message libsignal bien formé.
