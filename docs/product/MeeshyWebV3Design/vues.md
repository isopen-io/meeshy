# Meeshy web v3 — les vues cibles

> **Ce fichier est une SOURCE, pas un tableau de bord.** L'etat d'implementation de chaque vue vit
> dans son issue GitHub, jamais ici. Regenere par `capture-cibles.js` — ne pas editer a la main.

La planche `MeeshyWebV3.dc.html` porte **38 ecrans**, chacun avec sa route web.

## SITE

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Vitrine | `/` |  | ![vitrine](cible/vitrine.png) |

## ENTRÉE PUBLIQUE

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Ouverture du lien | `/l/:token` | Ouverture du lien | ![linkRedirect](cible/linkRedirect.png) |
| Rejoindre | `/chat/:lien` | Équipe Lagos | ![join](cible/join.png) |
| Droits du lien | `/chat/:lien` | Équipe Lagos | ![rights](cible/rights.png) |
| Se connecter | `/login?returnUrl=/chat/:lien` | Se connecter | ![login](cible/login.png) |
| Créer un compte | `/signup?returnUrl=/chat/:lien` | Créer un compte | ![signup](cible/signup.png) |
| Lien expiré | `/l/:token` | Lien expiré | ![linkExpired](cible/linkExpired.png) |

## MEMBRE — PRINCIPAL

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Bonjour Amina | `/` | Bonjour Amina | ![home](cible/home.png) |
| Chats | `/chats` | Chats | ![chats](cible/chats.png) |
| Équipe Lagos | `/chats/:cle` | Équipe Lagos | ![thread](cible/thread.png) |
| Types de messages | `/chats/:id` | Types de messages | ![rich](cible/rich.png) |
| Médias partagés | `/chats/:id/medias` | Médias partagés | ![media](cible/media.png) |
| Recherche | `/search` | Recherche | ![search](cible/search.png) |

## APPELS

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Appel audio | `/calls/:id` |  | ![callAudio](cible/callAudio.png) |
| Appel vidéo | `/calls/:id?video` |  | ![callVideo](cible/callVideo.png) |
| Appels | `/calls` | Appels | ![calls](cible/calls.png) |

## SOCIAL

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Fil | `/feed` | Fil | ![feed](cible/feed.png) |
| Réels | `/feed/reels` |  | ![reels](cible/reels.png) |
| Composer | `/composer` | Composer | ![composer](cible/composer.png) |
| Commentaires | `/post/:id` | Commentaires | ![comments](cible/comments.png) |
| Story | `/stories/:id` |  | ![story](cible/story.png) |
| Nouvelle story | `/stories/new` | Nouvelle story | ![storyCreate](cible/storyCreate.png) |
| Story | `/stories/:id` | Story | ![storyFail](cible/storyFail.png) |

## ESPACE MEMBRE

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Notifications | `/notifications` | Notifications | ![notifs](cible/notifs.png) |
| Contacts | `/contacts` | Contacts | ![contacts](cible/contacts.png) |
| Communautés | `/communities` | Communautés | ![communities](cible/communities.png) |
| Mes liens | `/links` | Mes liens | ![links](cible/links.png) |
| Paramètres | `/settings` | Paramètres | ![settings](cible/settings.png) |
| Notifications | `/notifications/preferences` | Notifications | ![notifPrefs](cible/notifPrefs.png) |
| Modifier le profil | `/settings/profile/edit` | Modifier le profil | ![profileEdit](cible/profileEdit.png) |
| Mot de passe | `/settings/security/password` | Mot de passe | ![password](cible/password.png) |

## ESPACE MEMBRE — FICHES DE REGLAGES

| Vue | Route | Titre | Capture |
|---|---|---|---|
| Profil | `/settings/profile` | Profil | ![detail-profile](cible/detail-profile.png) |
| Confidentialité | `/settings/privacy` | Confidentialité | ![detail-privacy](cible/detail-privacy.png) |
| Sécurité | `/settings/security` | Sécurité | ![detail-security](cible/detail-security.png) |
| Médias | `/settings/media` | Médias | ![detail-media](cible/detail-media.png) |
| Messages | `/settings/message` | Messages | ![detail-message](cible/detail-message.png) |
| Notifications | `/settings/notification` | Notifications | ![detail-notification](cible/detail-notification.png) |
| Application | `/settings/application` | Application | ![detail-application](cible/detail-application.png) |
