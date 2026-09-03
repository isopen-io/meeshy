/**
 * LA COPIE DES RÉGLAGES — ce que les six écrans DISENT.
 *
 * SIX, ET NON DIX. La matrice en dessine dix ; quatre n'ont aucune route pour
 * les servir, et le relevé est daté (2026-09-03, sur les routes assemblées) :
 *
 *   • `detail-notification` et `notifPrefs` — AUCUNE route de préférences de
 *     notification n'existe dans la passerelle ;
 *   • `detail-privacy`, `detail-media`, `detail-message` — idem.
 *
 * Les dessiner ferait des rangées qui n'ouvrent rien, c'est-à-dire exactement
 * ce que la charte règle 7 interdit (« un contrôle existe s'il a un EFFET »).
 * Le carrefour ne liste donc que les destinations qui MÈNENT quelque part, et
 * ce qui manque est dit dans la PR plutôt que grisé à l'écran.
 *
 * CE QUE LA PASSERELLE SERT, ET QUI DÉCIDE DE CE LOT :
 *
 *   | écran                       | route                                            |
 *   |-----------------------------|--------------------------------------------------|
 *   | `/settings`                 | aucune — un carrefour de liens                   |
 *   | `/settings/profile`         | `GET /auth/me`                                   |
 *   | `/settings/profile/edit`    | `PATCH /users/me` (`profile-updates.ts:41`)      |
 *   | `/settings/application`     | `PATCH /users/me` (les trois rangs du Prisme)    |
 *   | `/settings/security`        | `GET`/`DELETE /users/me/devices` (`push-tokens.ts:355`) |
 *   | `/settings/security/password` | `PATCH /users/me/password` (`profile-credentials.ts:32`) |
 */

export const REGLAGES = {
  titre: 'Réglages',
  retour: 'Retour',

  carrefour: {
    profil: { titre: 'Profil', phrase: 'Votre nom, votre bio, et les langues dans lesquelles vous lisez.' },
    securite: { titre: 'Sécurité', phrase: 'Votre mot de passe et les appareils connectés à votre compte.' },
    application: { titre: 'Application', phrase: 'Le thème et l’ordre de vos langues préférées.' },
  },

  profil: {
    titre: 'Profil',
    modifier: 'Modifier mon profil',
    nom: 'Nom affiché',
    prenom: 'Prénom',
    pseudonyme: 'Nom d’utilisateur',
    bio: 'Bio',
    sansBio: 'Vous n’avez pas encore écrit de bio.',
    /**
     * LES TROIS RANGS, NOMMÉS PAR LEUR RÔLE et non par leur champ. « Langue
     * principale » se comprend ; `systemLanguage` demande de connaître le
     * schéma. L'ordre EST le Prisme : la première servie gagne.
     */
    langues: 'Vos langues, dans l’ordre',
    languesPhrase: 'Un contenu vous est servi dans la première de ces langues qui le porte. À défaut, vous lisez l’original.',
    rang: (n: number): string => `Rang ${n}`,
    principale: 'Langue principale',
    secondaire: 'Langue secondaire',
    personnalisee: 'Langue de destination',
    aucune: 'Non définie',
  },

  edition: {
    titre: 'Modifier mon profil',
    enregistrer: 'Enregistrer',
    enregistre: 'Vos modifications sont enregistrées.',
    refuse: 'Vos modifications ne sont pas parties.',
    /** Le plafond de `bio` — `updateUserProfileSchema` (`packages/shared`). */
    bioMax: 500,
  },

  application: {
    titre: 'Application',
    theme: 'Thème',
    themePhrase: 'Le thème suit votre système ; ce choix le remplace sur cet appareil.',
    clair: 'Clair',
    sombre: 'Sombre',
    systeme: 'Système',
    /**
     * LE THÈME NE PASSE PAS PAR LA PASSERELLE, et il faut le dire : il vit
     * dans `localStorage` (`app/theme-script.tsx`), posé avant le premier
     * pixel pour qu'aucun éclair blanc ne précède un thème sombre. Un réglage
     * de compte le ferait voyager d'un appareil à l'autre — ce que personne
     * n'a demandé — au prix d'un aller-retour avant l'affichage.
     */
    themeLocal: 'Ce choix ne vaut que sur cet appareil.',
    langues: 'Vos langues',
    languesPhrase: 'Ces trois rangs décident dans quelle langue vous est servi chaque contenu.',
  },

  securite: {
    titre: 'Sécurité',
    motDePasse: 'Changer mon mot de passe',
    appareils: 'Appareils connectés',
    appareilsPhrase: 'Chaque appareil qui reçoit vos notifications. En retirer un le déconnecte des notifications, pas de votre compte.',
    aucunAppareil: 'Aucun appareil n’est enregistré pour les notifications.',
    retirer: 'Retirer',
    retire: 'L’appareil est retiré.',
    vuLe: (quand: string): string => `Vu ${quand}`,
  },

  motDePasse: {
    titre: 'Changer mon mot de passe',
    actuel: 'Mot de passe actuel',
    nouveau: 'Nouveau mot de passe',
    /**
     * LA RÈGLE EST CELLE DE LA PASSERELLE, lue et non devinée :
     * `changePasswordSchema` exige 8 caractères au minimum
     * (`routes/users/profile-credentials.ts`). L'annoncer AVANT la saisie
     * évite un refus qu'on aurait pu prévenir (dimension 8).
     */
    regle: 'Au moins 8 caractères.',
    minimum: 8,
    changer: 'Changer le mot de passe',
    change: 'Votre mot de passe est changé.',
    refuse: 'Votre mot de passe n’a pas été changé.',
    vide: 'Renseignez les deux champs.',
  },
} as const;
