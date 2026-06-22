# Plan — Itération 63w (web)

## Contexte
Itération web. Base = `main` HEAD `d63c4a5` (post-merge iter-61w #835/#818, iter-62w #840).
Contention forte des agents parallèles sur l'anti-pattern `t()||fallback` (message-bubble #842/#843,
layout chrome #840 mergé, conversation header #835 mergé, image dialogs #814 mergé) et sur les variants
Badge (#847 ouvert). → Cible **orthogonale** non touchée.

## Découverte (revue d'optimisation Prisme)
`app/(connected)/me/page.tsx` — la page **profil `/me`** (« Mon profil »), destination de navigation
**primaire** (raccourci depuis le menu utilisateur, hero + stats + langues + actions), consomme
**`useI18n('settings')`** pour ses toasts (`v2me.*`) MAIS affiche **28 chaînes FR codées en dur** dans
TOUTES les langues — rupture Prisme majeure sur une surface d'entrée :

- **EditProfileModal** : titre `Modifier le profil`, labels `Nom`/`Bio`, placeholders `Votre nom`/`Parlez-nous de vous...`, boutons `Annuler`/`Enregistrement...`/`Enregistrer`
- **LogoutConfirmModal** : titre `Se déconnecter ?`, message de confirmation, `Annuler`, `Déconnexion...`/`Se déconnecter`
- **Chrome page** : `DashboardLayout title="Mon profil"`, état erreur `Profil non trouvé` + `Retour aux conversations`
- **Stats** : `aria-label="Statistiques"` + labels `Conversations`/`Messages`/`Contacts`
- **Langues** : `aria-label`/`<h2>` `Mes langues`/`Langues`, niveaux `Natif`/`Courant`/`Apprentissage`
- **Raccourcis** : `aria-label="Raccourcis"`, `Mes liens de partage`, `Mes contacts`, `Notifications`, bouton `Se déconnecter`, `Envoyer un message`
- **Anti-pattern** : `label={t('title') || 'Paramètres'}` (dead-code + flash-of-raw-key)

## Plan
1. Câbler `useI18n('settings')` dans les 3 sous-composants (`EditProfileModal`, `LogoutConfirmModal`, `ProfileShell`) — `ProfilePage` l'a déjà.
2. Remplacer les 28 chaînes par `t('v2me.<clé>', '<EN fallback>')` (signature fallback native, anti-flash, leçon 50w).
3. Corriger l'anti-pattern `t('title') || 'Paramètres'` → `t('title', 'Settings')`.
4. Étendre le bloc `settings.v2me` (déjà existant, 5 clés) avec **28 nouvelles clés ×4 locales** (en/fr/es/pt) — parité stricte.
5. `Pro` (badge tier produit) conservé non-localisé (marque universelle, comme l'existant).

## Validation
- Parité ×4 (33 clés chacune), JSON valide round-trip.
- Grep FR résiduel = 0 (hors `Pro`).
- Aucun test n'asserte ces chaînes (vérifié).
- Diff confiné : 1 composant + 4 locales (bloc `v2me`).

## Hors périmètre / différé
- Poursuite anti-pattern `t()||fallback` (~270 occ) — laissée aux lots parallèles bornés.
- `app/settings/loading.tsx` (server component — exclusion documentée, ne pas re-flagger).
