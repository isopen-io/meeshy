## 2026-10-09 : Un lien de conversation se déplie chez les robots d'aperçu par la passerelle, jamais par l'image web (#9712)

### Le constat

`curl -A WhatsApp https://staging.meeshy.me/chat/<lien>` rendait la coquille de l'application à page unique : titre « Meeshy », description « Messagerie multilingue temps reel » (sans accents), aucune balise Open Graph. Le lien de conversation EST le canal d'acquisition : son aperçu, dans WhatsApp, iMessage, Telegram, Messenger, Slack ou X, est la première chose que voit la personne invitée. Les robots d'aperçu n'exécutent pas de JavaScript : ce que l'application écrit dans le `<head>` après démarrage ne les atteint pas.

### La décision

**Traefik route les robots d'aperçu de `/chat/<lien>` vers la passerelle, qui sert une page HTML minimale portant les balises ; nginx reste un serveur de fichiers statiques, et les humains reçoivent l'application inchangée.**

- **Porte** : `GET /api/v1/links/:identifier/og` (`routes/links/unfurl.ts`), publique, sans authentification. Elle répond TOUJOURS 200 en `text/html` : un lien inconnu, inactif, échu, épuisé ou dont la conversation est close rend l'aperçu GÉNÉRIQUE de Meeshy — le même octet pour octet, qui ne dit pas si le lien a existé. Une erreur de lecture rend aussi le générique : un aperçu raté ne doit jamais devenir une page d'erreur dans la conversation de l'invité.
- **Routage** : un routeur Traefik dédié (`frontend-staging-unfurl` en staging, `frontend-unfurl` en production), posé sur le conteneur de la passerelle : `Host(<domaine web>) && PathRegexp(^/chat/[^/]+/?$) && HeaderRegexp(User-Agent, <robots d'aperçu>)`, avec une réécriture de chemin `/chat/<lien>` → `/api/v1/links/<lien>/og`. Plus spécifique que le routeur de l'application, il passe devant lui. La liste des robots ne nomme que des agents qui NE SONT PAS des navigateurs (`facebookexternalhit`, `WhatsApp`, `Twitterbot`, `Slackbot`, `TelegramBot`, `Discordbot`, `LinkedInBot`, `SkypeUriPreview`…) : un humain dans le navigateur intégré d'une application (Facebook, Instagram, LinkedIn) n'y correspond pas et reçoit l'application.
- **Contenu, et rien d'autre** : `og:title`/`twitter:title` = « <hôte> t'invite à « <titre> » » ; `og:description` = la promesse (« Écris dans ta langue, lis dans la tienne — sans compte, sans installation. ») ; `og:image` = une image de marque STATIQUE 1200×630 (`apps/web/public/og/invitation-v1.png`, générée une fois par `apps/web/scripts/generate-og-image.py`), avec ses dimensions et son texte alternatif ; `og:url`, `og:type=website`, `og:site_name=Meeshy`, `og:locale`, `twitter:card=summary_large_image`, `robots: noindex`. **Aucun message, aucun participant hormis l'hôte qui invite, aucun décompte, aucune description de groupe, aucun message d'invitation** (règle de #5561 : rien de la conversation ne part avant le choix). L'hôte et le titre sont déjà ce que l'aperçu public `GET /anonymous/link/:identifier` sert à quiconque tient le lien.
- **Langue** : celle de l'HÔTE — sa langue de CADRAGE, la descente du Prisme de `utils/recipient-language.ts` (`recipientLanguages`), au premier rang que le catalogue sert (sept langues : fr, en, es, pt, de, it, ar). Un hôte dont le rang 1 n'est pas servi est adressé à son rang suivant, jamais au repli. Sans hôte nommable ni langue servie, l'aperçu suit l'`Accept-Language` de la requête, puis le français.

### La loi n'est pas redoublée

La lecture du lien et le verdict « ouvert » sont ceux de la carte de conversation (`services/conversationCard.ts`) : `shareLinkWhereByIdentifier` (les trois adresses d'un lien), `isShareLinkOpen` (actif, non échu, non épuisé — les trois refus de l'aperçu anonyme), `shareLinkInviterOf` (l'hôte n'est nommé que s'il est actif). S'y ajoutent `isConversationClosed` (la loi d'écriture, `services/messaging/conversationWriteAdmission.ts`) et un compte supprimé (`deletedAt`) qui ne nomme personne.

### Ce que la page ne fait pas

- **Elle ne compte pas de visite.** Le dépliage d'un robot n'est pas une personne qui ouvre l'invitation : l'aperçu anonyme compte ses visites (`recordShareLinkVisit`), celle-ci jamais.
- **Elle ne redirige pas.** Aucune `meta refresh` : un robot qui la suivrait reviendrait sur la même adresse, donc sur la même page. Le lien du corps pointe l'adresse canonique pour qui l'ouvrirait à la main.
- **Elle n'écrit aucune valeur sans l'échapper.** Titre et nom sont saisis par des utilisateurs : chaque valeur insérée passe par l'échappement HTML strict (`& < > " '`), après le retrait des caractères de contrôle et des marques de direction (U+202A–U+202E, U+2066–U+2069, qui retourneraient l'affichage d'un aperçu), et une troncature. L'en-tête `Content-Security-Policy: default-src 'none'` interdit en plus tout script et toute ressource à la page.

### Débit et cache

- **Cache court en mémoire** : la ligne lue (lien trouvé OU absent) est gardée 5 minutes par identifiant dans un `BoundedTtlCache` borné (2 000 entrées), propre à l'instance ; le verdict d'ouverture se recalcule à chaque requête sur cette ligne. Conséquence assumée : un lien désactivé peut encore se déplier jusqu'à 5 minutes. La réponse porte `Cache-Control: public, max-age=300`.
- **Plafond** : 60 requêtes par minute et par adresse, compté à `onRequest`, en échec OUVERT — une panne du magasin de compteurs ne doit pas éteindre les aperçus, et la lecture servie est bornée par le cache. Le routeur Traefik garde en plus `rate-limit@file`.

### Ce qui reste hors de ce lot

- Une carte DYNAMIQUE (titre et hôte dessinés dans l'image) : l'image statique suffit à rendre l'aperçu engageant ; une carte par lien demanderait un rendu d'image côté serveur, à décider sur mesure d'usage.
- Les robots qui ne s'annoncent pas (agent générique) reçoivent la coquille de l'application, dont la description est désormais correctement accentuée.
- Le routeur de production vit sur l'hôte (`/opt/meeshy/production/docker-compose.yml` diverge du dépôt) : il s'y pose à la main, au moment de la promotion.
