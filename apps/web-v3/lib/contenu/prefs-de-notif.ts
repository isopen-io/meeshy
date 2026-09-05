/**
 * LA TABLE DES TREIZE BASCULES DE `/notifications/preferences` — site UNIQUE
 * (spécification § 1, § 7). La vue la REND, la porte la VALIDE (fail-closed :
 * une `cle` postée hors de cette table est un 400, jamais une écriture), le
 * module de participation la PEINT et les témoins l'ÉNUMÈRENT — quatre
 * lecteurs, une table.
 *
 * TREIZE, PAS ONZE. La planche (`MeeshyWebV3.dc.html`, `DETAILS.notification`
 * lignes 750-776) en dessine treize ; le compte de la matrice était un
 * plancher daté, écrit avant la section APPELS ET SYSTÈME (§ 9 question 1 de
 * la spécification). `callsEnabled` (appels ENTRANTS) N'Y EST PAS : la
 * planche ne le dessine pas, et le schéma le déclare catégorie produit
 * distincte — `pushEnabled:false` ne coupe jamais les appels
 * (`packages/shared/types/preferences/notification.ts:18-21`).
 *
 * LES CLÉS SONT CELLES DU SCHÉMA, jamais recopiées : `CleDePreference` est
 * une restriction de `keyof NotificationPreference`, de sorte qu'une clé
 * renommée là-bas fait ROUGIR ce fichier au lieu de servir un champ mort.
 */

import type { NotificationPreference } from '@meeshy/shared/types/preferences';

export type CleDePreference = Extract<
  keyof NotificationPreference,
  | 'pushEnabled'
  | 'emailEnabled'
  | 'soundEnabled'
  | 'newMessageEnabled'
  | 'replyEnabled'
  | 'conversationEnabled'
  | 'mentionEnabled'
  | 'reactionEnabled'
  | 'contactRequestEnabled'
  | 'memberJoinedEnabled'
  | 'missedCallEnabled'
  | 'systemEnabled'
  | 'dndEnabled'
>;

export type BasculeDePrefs = {
  readonly cle: CleDePreference;
  readonly libelle: string;
};

export type SectionDePrefs = {
  readonly titre: string;
  readonly bascules: readonly BasculeDePrefs[];
};

/**
 * SIX SECTIONS, DANS L'ORDRE DE LA PLANCHE — l'ordre EST la disposition
 * (règle de conformité § « Conformité = disposition, hiérarchie, états et
 * gestes »), pas un détail qu'on pourrait trier autrement.
 */
export const SECTIONS_DE_PREFS: readonly SectionDePrefs[] = [
  {
    titre: 'Canaux',
    bascules: [
      { cle: 'pushEnabled', libelle: 'Notifications push' },
      { cle: 'emailEnabled', libelle: 'Email' },
      { cle: 'soundEnabled', libelle: 'Son' },
    ],
  },
  {
    titre: 'Messages',
    bascules: [
      { cle: 'newMessageEnabled', libelle: 'Nouveau message' },
      { cle: 'replyEnabled', libelle: 'Réponses' },
      { cle: 'conversationEnabled', libelle: 'Activité de conversation' },
    ],
  },
  {
    titre: 'Interactions',
    bascules: [
      { cle: 'mentionEnabled', libelle: 'Mentions' },
      { cle: 'reactionEnabled', libelle: 'Réactions' },
    ],
  },
  {
    titre: 'Contacts et membres',
    bascules: [
      { cle: 'contactRequestEnabled', libelle: 'Demandes de contact' },
      { cle: 'memberJoinedEnabled', libelle: 'Nouveau membre' },
    ],
  },
  {
    titre: 'Appels et système',
    bascules: [
      { cle: 'missedCallEnabled', libelle: 'Appels manqués' },
      { cle: 'systemEnabled', libelle: 'Système' },
    ],
  },
  {
    titre: 'Ne pas déranger',
    bascules: [{ cle: 'dndEnabled', libelle: 'Activer' }],
  },
];

/**
 * LA TABLE À PLAT — ce que les témoins BOUCLENT (spécification § 3, témoin
 * e2e 1 : « un témoin qui énumère à la main se périme »), et ce que la porte
 * oppose à une `cle` postée.
 */
export const BASCULES_DE_PREFS: readonly BasculeDePrefs[] = SECTIONS_DE_PREFS.flatMap(
  (section) => section.bascules,
);

export const CLES_DE_PREFS: readonly CleDePreference[] = BASCULES_DE_PREFS.map((b) => b.cle);

export const estUneCleDePrefs = (valeur: string): valeur is CleDePreference =>
  (CLES_DE_PREFS as readonly string[]).includes(valeur);

/**
 * LA COPIE DE L'ÉCRAN — ce qu'il DIT hors des treize libellés ci-dessus, qui
 * sont la disposition et non de la prose.
 */
export const PREFS = {
  titre: 'Notifications',
  sousTitre: 'Réglages',
  retour: 'Retour aux notifications',
  actionDepuisLaBoite: 'Réglages de notification',
  activee: 'Activé',
  desactivee: 'Désactivé',
  /** La fenêtre DND — affichée, jamais éditée (§ 9 question 2 : hors périmètre). */
  fenetre: (debut: string, fin: string): string => `${debut} – ${fin}`,
  /** La réussite, révélée par la région de statut au retour du POST/redirect/GET. */
  regle: (libelle: string): string => `${libelle} : réglage enregistré.`,
  /** Le refus — POST échoué (sans JS) ou fetch échoué (avec JS) : l'état affiché reste celui du serveur. */
  echec: 'Le réglage n’a pas été enregistré. Réessayez.',
  panne: 'Vos préférences de notification n’ont pas pu être chargées',
  panneePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
} as const;
