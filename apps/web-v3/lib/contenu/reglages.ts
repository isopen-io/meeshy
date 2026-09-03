/**
 * LA COPIE DES RÉGLAGES — ce que les six écrans DISENT.
 *
 * SIX, ET NON DIX. La matrice en dessine dix ; quatre n'ont aucune route pour
 * les servir, et le relevé est daté (2026-09-03, sur les routes assemblées) :
 * `detail-privacy`, `detail-media`, `detail-message` et `detail-notification`
 * n'ont, dans la passerelle, ni lecture ni écriture. Les dessiner ferait des
 * rangées qui n'ouvrent rien, c'est-à-dire exactement ce que la charte règle 7
 * interdit (« un contrôle existe s'il a un EFFET »). Le carrefour ne liste donc
 * que les destinations qui MÈNENT quelque part, et ce qui manque est dit dans
 * la PR plutôt que grisé à l'écran.
 *
 * CE QUE LA PASSERELLE SERT, ET QUI DÉCIDE DE CE LOT :
 *
 *   | écran                         | route                                                    |
 *   |-------------------------------|----------------------------------------------------------|
 *   | `/settings`                   | aucune — un carrefour de liens                           |
 *   | `/settings/profile`           | `GET /auth/me`                                           |
 *   | `/settings/profile/edit`      | `PATCH /users/me` (`profile-updates.ts:41`)              |
 *   | `/settings/application`       | aucune — le thème est un cookie de cet appareil          |
 *   | `/settings/security`          | `GET`/`DELETE /users/me/devices` (`push-tokens.ts:355`)  |
 *   | `/settings/security/password` | `PATCH /users/me/password` (`profile-credentials.ts:32`) |
 *
 * CE QUE LES CIBLES DESSINENT ET QUE LA V3 NE SERT PAS, écran par écran —
 * parce qu'un silence non motivé se relit comme un oubli :
 *
 *   • `detail-profile` — BANNIÈRE et PHOTO. `PATCH /users/me` n'accepte ni
 *     `avatar` ni `banner` : ce sont des téléversements, une surface qui a sa
 *     propre route et son propre lot. TÉLÉPHONE et E-MAIL sont MONTRÉS et ne
 *     s'éditent pas : ils demandent une preuve de possession et passent par
 *     `change-email` / `change-phone` (#4184) ;
 *   • `detail-security` — le CHIFFREMENT est un réglage de CONVERSATION, pas de
 *     compte : il n'a pas sa place ici et vit au fil. La DOUBLE
 *     AUTHENTIFICATION demande un enrôlement (secret, QR, vérification) qu'un
 *     interrupteur ne peut pas porter ;
 *   • `detail-application` — la LANGUE DE L'INTERFACE : la v3 rend en français
 *     et en français seul (`app/document-language.ts`). Un sélecteur y serait
 *     inerte.
 */

export const REGLAGES = {
  titre: 'Réglages',
  sousTitre: 'Compte et application',
  retour: 'Retour',
  auxReglages: 'Retour aux réglages',

  carrefour: {
    liste: 'Vos réglages',
    profil: { titre: 'Profil', phrase: 'Votre identité et les langues dans lesquelles vous lisez.' },
    securite: { titre: 'Sécurité', phrase: 'Votre mot de passe et vos appareils.' },
    application: { titre: 'Application', phrase: 'Le thème de Meeshy sur cet appareil.' },
  },

  profil: {
    titre: 'Profil',
    modifier: 'Modifier mon profil',
    identite: 'Identité',
    coordonnees: 'Coordonnées',
    nomAffiche: 'Nom affiché',
    prenom: 'Prénom',
    nom: 'Nom',
    pseudonyme: 'Identifiant',
    bio: 'Bio',
    bioAide: 'Deux lignes visibles sur votre profil.',
    email: 'Adresse e-mail',
    telephone: 'Numéro de téléphone',
    /**
     * CE QUI NE S'ÉDITE PAS LE DIT, ET DIT PAR OÙ ÇA PASSE. Une valeur montrée
     * sans un mot laisserait croire à un oubli ; « depuis l'application » situe
     * le geste sans promettre un écran que la v3 ne sert pas.
     */
    ailleurs: 'Se change depuis l’application Meeshy.',
    absent: 'Non renseigné',
    /**
     * LES TROIS RANGS, NOMMÉS PAR LEUR RÔLE et non par leur champ. « Langue
     * principale » se comprend ; `systemLanguage` demande de connaître le
     * schéma. L'ordre EST le Prisme : la première servie gagne.
     */
    langues: 'Langues',
    languesPhrase:
      'Un contenu vous est servi dans la première de ces langues qui le porte. À défaut, vous lisez l’original.',
    rang: (n: number): string => `Rang ${n}`,
    principale: 'Langue principale',
    secondaire: 'Langue régionale',
    personnalisee: 'Langue de destination',
    aucune: 'Aucune',
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
    apparence: 'Apparence',
    theme: 'Thème',
    clair: 'Clair',
    sombre: 'Sombre',
    systeme: 'Comme mon système',
    /**
     * LE THÈME NE PASSE PAS PAR LA PASSERELLE, et il faut le dire : aucune
     * route de compte ne le porte. Il vit dans un cookie de cet appareil, que
     * le script de tête relit avant le premier pixel — un réglage de COMPTE le
     * ferait voyager d'un appareil à l'autre, ce que personne n'a demandé, au
     * prix d'un aller-retour avant l'affichage.
     */
    themeLocal: 'Ce choix ne vaut que sur cet appareil.',
    applique: 'Le thème est appliqué.',
    langue: 'Langue de l’interface',
    /**
     * `DOCUMENT_LANGUAGE` est le français, et une seule langue est SERVIE. Un
     * sélecteur serait un contrôle sans effet ; la ligne est un CONSTAT.
     */
    langueUnique: 'Meeshy se lit en français. D’autres langues d’interface viendront.',
  },

  securite: {
    titre: 'Sécurité',
    acces: 'Accès',
    motDePasse: 'Changer mon mot de passe',
    appareils: 'Appareils connectés',
    appareilsPhrase:
      'Chaque appareil qui reçoit vos notifications. En retirer un le coupe des notifications, pas de votre compte.',
    aucunAppareil: 'Aucun appareil ne reçoit vos notifications.',
    aucunAppareilPrecision:
      'Un appareil s’inscrit ici la première fois que vous acceptez d’y recevoir des notifications.',
    retirer: 'Retirer',
    retire: 'L’appareil est retiré.',
    refuse: 'L’appareil n’a pas été retiré.',
    vuLe: (quand: string): string => `Vu ${quand}`,
  },

  motDePasse: {
    titre: 'Changer mon mot de passe',
    actuel: 'Mot de passe actuel',
    nouveau: 'Nouveau mot de passe',
    /**
     * LA RÈGLE EST CELLE DE LA PASSERELLE, lue et non devinée :
     * `changePasswordSchema` exige 8 caractères au minimum
     * (`routes/users/profile-credentials.ts`). L'annoncer AVANT la saisie évite
     * un refus qu'on aurait pu prévenir (dimension 8).
     */
    regle: 'Au moins 8 caractères.',
    minimum: 8,
    changer: 'Changer le mot de passe',
    change: 'Votre mot de passe est changé.',
    refuse: 'Votre mot de passe n’a pas été changé.',
    vide: 'Renseignez les deux champs.',
  },
} as const;
