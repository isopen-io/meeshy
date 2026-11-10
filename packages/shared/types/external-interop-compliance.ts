/**
 * LA CONFORMITÉ DE L'INTEROPÉRABILITÉ (#17120, chantier #17007, suite technique
 * de #16999) — ce qui voyage entre la passerelle et les trois clients pour :
 *  - l'INFORMATION sur ce qui part chez Meta, et sa version ;
 *  - le CONSENTEMENT de l'utilisateur Meeshy, donné sous cette version ;
 *  - le SIGNALEMENT d'un contenu reçu d'un réseau tiers (DSA art. 16 et 17,
 *    #16991 / #16992).
 *
 * Décision :
 * `services/gateway/decisions/2026-11-10-l-interoperabilite-a-son-consentement-sa-conservation-et-son-signalement.md`.
 *
 * Ce fichier ne tranche pas le droit : la version et la liste ci-dessous sont
 * PROVISOIRES, à confirmer par le juriste (#16999) et, pour la liste, par
 * l'offre de référence de Meta une fois l'accord signé. Une liste qui en dit
 * TROP vaut mieux qu'une liste qui omet : chaque entrée est ce qui PEUT partir.
 */

/**
 * La version de l'information sur ce qui part chez Meta. Changer le texte ou la
 * liste change cette version : un consentement donné sous une autre version ne
 * vaut plus, et le client redemande. À confirmer par le juriste (#16999).
 */
export const EXTERNAL_INTEROP_NOTICE_VERSION = '2026-11-10' as const;

/**
 * Ce qui part chez Meta quand un utilisateur Meeshy écrit à un ami WhatsApp,
 * dans l'ordre où les clients le disent. Chaque clé a son libellé localisé dans
 * les trois clients ; une clé inconnue d'un ancien client s'ignore.
 *
 * - `phone-number` : le numéro vérifié de l'utilisateur, qui l'adresse chez WhatsApp ;
 * - `profile-name` : le nom affiché (et, si l'offre de Meta l'exige, la photo) ;
 * - `public-keys` : les clés PUBLIQUES de chiffrement de chaque appareil ;
 * - `encrypted-content` : les messages et médias, chiffrés de bout en bout — Meta ne les lit pas ;
 * - `delivery-metadata` : qui écrit à qui, quand, la taille des envois, les accusés de réception.
 */
export const EXTERNAL_INTEROP_DISCLOSURES = [
  'phone-number',
  'profile-name',
  'public-keys',
  'encrypted-content',
  'delivery-metadata',
] as const;

export type ExternalInteropDisclosure = (typeof EXTERNAL_INTEROP_DISCLOSURES)[number];

/**
 * Où le signalant d'un contenu externe est orienté pour agir sur le compte
 * tiers : Meeshy ne peut agir que chez lui (blocage local, file de modération) ;
 * le retrait chez WhatsApp passe par le mécanisme de Meta. L'adresse exacte de
 * ce mécanisme est à confirmer (#16999) : les clients disent le chemin, sans lien.
 */
export const EXTERNAL_REPORT_ORIENTATION = 'meta-reporting' as const;

/** La longueur maximale de ce que le signalant choisit de transmettre (la même borne que `Report.reason`). */
export const EXTERNAL_REPORT_DISCLOSED_TEXT_MAX = 2000;

/** Ce que sert `GET /conversations/external/consent`. */
export type ExternalInteropConsentStatus = {
  readonly network: string;
  readonly noticeVersion: string;
  readonly disclosures: readonly ExternalInteropDisclosure[];
  readonly retentionDays: number;
  readonly consent: { readonly grantedAt: string; readonly noticeVersion: string } | null;
  readonly current: boolean;
};

/** L'accusé d'un signalement de contenu externe. */
export type ExternalReportAcknowledgement = {
  readonly reportId: string;
  readonly peerBlocked: boolean;
  readonly orientation: typeof EXTERNAL_REPORT_ORIENTATION;
};

/**
 * Un consentement vaut-il pour ouvrir une conversation externe ? Daté ET donné
 * sous la version EN VIGUEUR — un retrait (date nulle) ou une version périmée
 * ne vaut pas. La loi unique, côté passerelle comme côté clients.
 */
export function isInteropConsentCurrent(consent: {
  readonly grantedAt: Date | string | null | undefined;
  readonly noticeVersion: string | null | undefined;
}): boolean {
  return Boolean(consent.grantedAt) && consent.noticeVersion === EXTERNAL_INTEROP_NOTICE_VERSION;
}
