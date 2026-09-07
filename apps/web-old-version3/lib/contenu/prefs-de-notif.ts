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

import { libelleDuDecalage } from '@/lib/decalage-utc';

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
 * LA PLAGE « NE PAS DÉRANGER » SE MODIFIE (cycle 124, `notification-dnd.ts:53`
 * — la loi qui la fait RESPECTER par la passerelle, déjà en place, sans elle
 * la bascule seule ne réglait qu'un horaire par défaut que personne ne pouvait
 * changer). Le format est celui du schéma : `HH:MM` sur 24 h
 * (`packages/shared/types/preferences/notification.ts:44-45`).
 */
export const HEURE_DND_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * LA TABLE FERMÉE DES FUSEAUX — les décalages UTC usuels, en minutes (bornes
 * du schéma : −720…840, `notification.ts:52`). Fermée, comme `CLES_DE_PREFS` :
 * un décalage soumis hors de cette liste est un 400, jamais une écriture.
 * `'auto'` est un sentinelle CLIENT, jamais envoyé au serveur — la valeur déjà
 * stockée survit (§ 3 témoin 7 de la spécification).
 */
export const FUSEAU_AUTO = 'auto';

/** Les décalages UTC réellement en usage (demi-heures et quarts d'heure compris). */
const MINUTES_DES_FUSEAUX: readonly number[] = [
  -720, -660, -600, -570, -540, -480, -420, -360, -300, -270, -240, -210, -180, -120, -60, 0, 60, 120, 180, 210, 240,
  270, 300, 330, 345, 360, 390, 420, 480, 525, 540, 570, 600, 630, 660, 720, 765, 780, 840,
];

export type OptionDeFuseau = { readonly valeur: string; readonly libelle: string; readonly minutes: number };

export const FUSEAUX_DND: readonly OptionDeFuseau[] = MINUTES_DES_FUSEAUX.map((minutes) => ({
  valeur: String(minutes),
  libelle: libelleDuDecalage(minutes),
  minutes,
}));

export const estUnFuseauDnd = (valeur: string): boolean =>
  valeur === FUSEAU_AUTO || FUSEAUX_DND.some((fuseau) => fuseau.valeur === valeur);

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
  fenetre: (debut: string, fin: string): string => `${debut} – ${fin}`,
  /** L'ÉDITION DE LA PLAGE (`detail-notification`, ce lot) — un `<details>`, pas un `<a>` : elle vit dans la même rangée. */
  fenetreModifier: 'Modifier la plage',
  fenetreDebut: 'Début',
  fenetreFin: 'Fin',
  fenetreFuseau: 'Fuseau',
  /**
   * L'OPTION « CET APPAREIL » DIT CE QU'ELLE FERA, jamais ce qu'on aimerait
   * qu'elle fasse (défaut relevé en revue). Le décalage vient du cookie de
   * fuseau (`lib/temps.ts` › `decalageDuFuseau`, la SEULE source de l'heure
   * locale du lecteur dans la v3) : mesuré, il se NOMME — « Fuseau de cet
   * appareil (UTC+02:00) » —, et le POST écrit `dndUtcOffsetMinutes`.
   * Non mesuré (première visite, cookie purgé, fuseau refusé par l'ICU),
   * choisir cette option ne change RIEN au décalage enregistré : elle le
   * DIT, plutôt que de promettre une détection qui n'aura pas lieu. Sans
   * cela, une plage 22:00–08:00 posée depuis Paris silençait de 00 h à 10 h,
   * l'évaluation restant en UTC (`notification-dnd.ts:56`).
   */
  fenetreFuseauAuto: (decalage: number | null): string =>
    decalage === null ? 'Ne pas changer le fuseau' : `Fuseau de cet appareil (${libelleDuDecalage(decalage)})`,
  fenetreEnregistrer: 'Enregistrer la plage',
  fenetreRegle: 'Plage horaire enregistrée.',
  fenetreHeureInvalide: 'Une heure au format HH:MM est requise pour le début et la fin.',
  /** La réussite, révélée par la région de statut au retour du POST/redirect/GET. */
  regle: (libelle: string): string => `${libelle} : réglage enregistré.`,
  /** Le refus — POST échoué (sans JS) ou fetch échoué (avec JS) : l'état affiché reste celui du serveur. */
  echec: 'Le réglage n’a pas été enregistré. Réessayez.',
  panne: 'Vos préférences de notification n’ont pas pu être chargées',
  panneePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
  /**
   * UN 401 EN COURS DE SESSION N'EST PAS UN ÉCHEC RÉSEAU : le rollback est le
   * même, le MESSAGE ne l'est pas — un « réessayez » sur une session qui n'est
   * plus valide ferait boucler le lecteur sans jamais lui dire ce qu'il doit
   * faire. Même bandeau, même loi que le fil (`lib/contenu/fil.ts` ›
   * `BANDEAUX.sessionExpiree`) : ce que vous avez réglé reste à l'écran,
   * reconnectez-vous pour continuer à le modifier.
   */
  bandeauSessionExpiree: {
    titre: 'Votre session a expiré',
    corps: 'Ce réglage n’a pas été enregistré. Reconnectez-vous pour continuer à modifier vos préférences.',
    action: 'Se reconnecter',
  },
  /**
   * LE PUSH WEB (#5391) — la rangée « Sur cet appareil ». PAS une
   * quatorzième bascule de `BASCULES_DE_PREFS` : un geste `push` distinct
   * (§ 3.2 de la spécification), parce que l'abonnement vit sur LE
   * NAVIGATEUR, jamais dans les treize colonnes de `NotificationPreference`.
   */
  push: {
    titreSection: 'Sur cet appareil',
    libelle: 'Notifications push sur cet appareil',
    abonne: 'Abonné',
    nonAbonne: 'Non abonné',
    indisponible: 'Indisponible',
    detailResume: 'Ce que cet appareil recevra',
    detailCorps:
      'Un abonnement crée un lien entre ce navigateur et votre compte : les notifications que vos réglages autorisent ci-dessus (messages, mentions, réactions…) s’affichent alors même quand l’onglet est fermé. Vous pouvez retirer cet abonnement à tout moment, sans toucher aux autres appareils.',
    motifEnvManquant: 'Le service de notifications n’est pas configuré pour ce déploiement.',
    motifSansJavascript: 'S’abonner exige JavaScript — seul le navigateur peut créer l’abonnement.',
    motifAucunAbonnementConnu: 'Aucun abonnement connu sur cet appareil.',
    motifEchecAbonnement: 'L’abonnement n’a pas pu être créé. Réessayez.',
    motifEchecDesabonnement: 'L’abonnement n’a pas pu être retiré. Réessayez.',
    motifNavigateurIncompatible: 'Ce navigateur ne prend pas en charge les notifications push.',
    motifPermissionRefusee: 'La permission de notification a été refusée.',
    regleAbonne: 'Notifications sur cet appareil : abonnement activé.',
    regleDesabonne: 'Notifications sur cet appareil : abonnement retiré.',
  },
} as const;
