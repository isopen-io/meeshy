import type { PrivacyPreference } from '@meeshy/shared/types/preferences';

/**
 * LES QUATRE RÉGLAGES-DÉTAILS — `/settings/privacy`, `/settings/media`,
 * `/settings/message`, `/settings/notification` (travail `reglages-details`).
 *
 * §0 DE LA SPÉCIFICATION CORRIGE `lib/contenu/reglages.ts` : ce dernier disait
 * ces trois routes SANS lecture ni écriture dans la passerelle — un relevé
 * daté du 2026-09-04, avant que le système unifié de préférences (#4181,
 * #4589) ne soit vu ici. `GET`/`PATCH /api/v1/me/preferences` SERT sept
 * catégories, dont `privacy`, `message` et `document` — trois des quatre
 * écrans de ce lot s'y branchent.
 *
 * CE QUI RESTE VRAI, ET QUI BORNE L'ÉCRAN : une préférence STOCKÉE n'est pas
 * une préférence OBÉIE. Mesuré le 2026-09-06 (grep de `src/` hors
 * `preferences/`, `__tests__`) : `hideProfileFromSearch` et
 * `allowContactRequests` n'ont AUCUN lecteur serveur. Les dessiner ferait des
 * bascules qui MENTENT une protection qu'aucun code n'applique (cycle 124) —
 * elles ne sont donc PAS rendues, régime 3 de dégradation.
 */
export const CLES_DE_CONFIDENTIALITE_EXPOSEES = [
  'showOnlineStatus',
  'showLastSeen',
  'showReadReceipts',
  'showTypingIndicator',
] as const;

export type CleDeConfidentialite = (typeof CLES_DE_CONFIDENTIALITE_EXPOSEES)[number];

// Un renommage dans le schéma fait ROUGIR cette ligne plutôt que de servir un champ mort.
const _verifieLesCles: readonly (keyof PrivacyPreference)[] = CLES_DE_CONFIDENTIALITE_EXPOSEES;
void _verifieLesCles;

export type BasculeDeConfidentialite = { readonly cle: CleDeConfidentialite; readonly libelle: string };

export const BASCULES_DE_CONFIDENTIALITE: readonly BasculeDeConfidentialite[] = [
  { cle: 'showOnlineStatus', libelle: 'Afficher mon statut en ligne' },
  { cle: 'showLastSeen', libelle: 'Afficher ma dernière connexion' },
  { cle: 'showReadReceipts', libelle: 'Accusés de lecture' },
  { cle: 'showTypingIndicator', libelle: 'Indicateur de frappe' },
];

export const estUneCleDeConfidentialite = (valeur: string): valeur is CleDeConfidentialite =>
  (CLES_DE_CONFIDENTIALITE_EXPOSEES as readonly string[]).includes(valeur);

export const REGLAGES_DETAILS = {
  privacy: {
    titre: 'Confidentialité',
    sousTitre: 'Paramètres',
    retour: 'Retour aux réglages',
    visibilite: 'Visibilité',
    activee: 'Activé',
    desactivee: 'Désactivé',
    regle: (libelle: string): string => `${libelle} : réglage enregistré.`,
    echec: 'Le réglage n’a pas été enregistré. Réessayez.',
    mesDonnees: 'Mes données',
    exporter: 'Exporter mes données',
    exporterPhrase: 'Archive JSON : profil, messages, contacts',
    exporterBouton: 'Exporter',
    supprimer: 'Supprimer toutes mes données',
    supprimerPhrase: 'Irréversible',
    legal: 'Légal',
    politique: 'Politique de confidentialité',
    conditions: 'Conditions d’utilisation',
    panne: 'Vos réglages de confidentialité n’ont pas pu être chargés',
  },
  export: {
    titre: 'Exporter mes données',
    retour: 'Retour à la confidentialité',
    corps: 'Une archive JSON de votre profil, de vos messages et de vos contacts.',
    bouton: 'Télécharger l’archive',
    nomDeFichier: 'meeshy-export.json',
    panne: 'L’export n’a pas pu être préparé. Réessayez dans un instant.',
  },
  suppression: {
    titre: 'Supprimer toutes mes données',
    retour: 'Retour à la confidentialité',
    avertissement: 'Cette action est IRRÉVERSIBLE. Toutes vos données seront supprimées après confirmation par e-mail.',
    phraseAConfirmer: 'SUPPRIMER MON COMPTE',
    champPhrase: 'Tapez « SUPPRIMER MON COMPTE » pour confirmer',
    champMotDePasse: 'Votre mot de passe',
    bouton: 'Demander la suppression',
    demandee: 'Un e-mail de confirmation vous a été envoyé. Votre compte n’est pas encore supprimé.',
    motDePasseInvalide: 'Votre mot de passe est incorrect.',
    phraseInvalide: 'Recopiez exactement la phrase demandée.',
    sansEmail: 'Ajoutez et vérifiez une adresse e-mail avant de demander la suppression.',
    dejaEnCours: 'Une demande de suppression est déjà en cours — vérifiez vos e-mails.',
    panne: 'La demande n’a pas pu être envoyée. Réessayez dans un instant.',
  },
  media: {
    titre: 'Médias',
    sousTitre: 'Paramètres',
    retour: 'Retour aux réglages',
    sections: 'Sections',
    audio: { titre: 'Audio et transcription', phrase: 'Messages vocaux, transcription, TTS, clonage de voix' },
    video: { titre: 'Vidéo et appels', phrase: 'Qualité vidéo, effets, réglages d’appel' },
    document: { titre: 'Documents et fichiers', phrase: 'Téléchargement, aperçu, stockage' },
    aDefinir: 'À DÉFINIR',
    sansReglage: 'Cette section n’a pas encore de réglage que la v3 puisse appliquer.',
    panne: 'Vos réglages de médias n’ont pas pu être chargés',
  },
  document: {
    titre: 'Documents et fichiers',
    retour: 'Retour aux médias',
    telechargements: 'Téléchargements',
    autoDownload: 'Téléchargement automatique',
    autoDownloadPhrase: 'Télécharge les images et vidéos dès leur réception, dans la galerie de la conversation.',
    activee: 'Activé',
    desactivee: 'Désactivé',
    regle: 'Réglage enregistré.',
    echec: 'Le réglage n’a pas été enregistré. Réessayez.',
    panne: 'Ce réglage n’a pas pu être chargé',
  },
  message: {
    titre: 'Messages',
    sousTitre: 'Paramètres',
    retour: 'Retour aux réglages',
    aDefinir: 'À DÉFINIR',
    titreCarte: 'Réglages de messages',
    phraseCarte: 'Section existante côté produit, contenu à arbitrer avec vous.',
  },
} as const;
