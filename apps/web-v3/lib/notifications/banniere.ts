import {
  buildNotificationBanner,
  buildNotificationHeadline,
  notificationBannerFraming,
  type CadrageDeBanniere,
  type ConventionsDuClient,
  type TranslateFunction,
} from '@meeshy/shared/utils/notification-banner';
import type { Notification } from '@meeshy/shared/types/notification';

import { BANNIERE } from '@/lib/contenu/banniere';

/**
 * **La bannière de la v3 dit CE QUI vient d'arriver, jamais seulement QUI** —
 * et depuis #4454 elle le dit par la LOI PARTAGÉE, pas par une troisième
 * écriture d'elle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET POURQUOI CE FICHIER A MAIGRI DE 258 LIGNES À CELLES-CI
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ce module PORTAIT la loi : les trois ensembles de types, la règle du titre,
 * celle du corps, celle de la pastille, celle de la vignette — recopiés depuis
 * le web existant, dans une troisième formulation. Elle vit désormais dans
 * `@meeshy/shared/utils/notification-banner`, où iOS (#4452) et le web existant
 * (#4453) la lisent aussi. Ce fichier n'en garde que la LIAISON : les trois
 * conventions que la loi réclame de chaque client, et l'adaptateur qui rend à
 * ses appelants la forme française qu'ils connaissaient.
 *
 * L'argument qui justifiait la copie — « un import de VALEUR tirerait le module
 * entier dans le chunk de `(connected)`, que le § 8.3 plafonne » — ne tient pas
 * à la mesure : SEIZE fichiers de la v3 importent déjà des VALEURS de
 * `@meeshy/shared` (`resolvePrismTranslation`, `transcriptTranslationTexts`,
 * `notificationMatchesReadBulkScope`), dont `lib/realtime/notifs-etat.ts`, un
 * module de navigateur. Et la v3 n'expédie AUCUN JavaScript de page : il n'y a
 * pas de chunk `(connected)` à faire grossir — seulement des modules de
 * participation compilés à part, dont le poids est mesuré (`budgets-mesures.json`).
 *
 * Ce qui a été PERDU dans le passage : rien. Ce qui a été GAGNÉ, en plus de la
 * source unique : le corps d'un message à pièce jointe (« 📷 Photo · … », que
 * la copie locale ne composait pas) et le résumé média d'une publication sans
 * extrait (« Photo », que la copie locale rendait `null`).
 *
 * Ce qui a été porté DANS LA CONVENTION plutôt que perdu : le rang
 * `prénom nom`, que la loi partagée ne connaît pas — nommer un acteur est
 * précisément ce qu'elle laisse à chaque client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA V3 REFUSE TOUJOURS DE FABRIQUER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **LA PHRASE D'ACTION VIENT DU SERVEUR** (`buildNotificationDisplay`, composée
 * dans la langue RÉSOLUE du destinataire, #4451) et n'est jamais réécrite ici.
 * Le web existant garde un repli client de 115 lignes de phrases françaises
 * pour ses lignes ANCIENNES ; la v3 n'en a pas et ne s'en fabrique pas —
 * `titreDeRepli` rend le seul nom de l'acteur, et la CHAÎNE VIDE quand la
 * charge n'en porte aucun. C'est ce vide que `porteDeLaBanniere`
 * (`lib/realtime/banniere.ts`) lit comme « ne peins rien » : mieux vaut aucun
 * toast qu'un toast qui dit « Quelqu'un ».
 *
 * **La seule part CLIENT du texte est « X dans {groupe} »**, et pour une raison
 * qui n'est pas un oubli du serveur : le nom d'une conversation de groupe peut
 * être RENOMMÉ localement par chaque membre — il n'existe que sur l'appareil.
 * Elle reste INJECTÉE (`TraduireDansLaConversation`), comme avant.
 */

/**
 * Ce que ce module lit d'une notification servie. Tout est `unknown` : la
 * charge vient du réseau, et un `as` ici transformerait une valeur dont on ne
 * sait rien en `string` que le rendu croirait. La loi partagée valide chaque
 * champ pour son propre compte — c'est le contrat qu'elle tient.
 */
export type NotificationServie = {
  readonly type?: unknown;
  readonly title?: unknown;
  readonly subtitle?: unknown;
  readonly content?: unknown;
  readonly actor?: unknown;
  readonly context?: unknown;
  readonly metadata?: unknown;
};

/** La seule chaîne que l'appelant traduit — voir le doc-comment ci-dessus. */
export type TraduireDansLaConversation = (parts: {
  readonly acteur: string;
  readonly groupe: string;
}) => string;

export type BanniereDeNotification = {
  /** Ligne 1 : QUI, et QUOI. VIDE quand la charge n'est pas lisible. */
  readonly titre: string;
  /** Ligne 2 : la charge. `null` quand la ligne 1 se suffit. */
  readonly corps: string | null;
  /** La réaction, rendue COMME une réaction — `null` si la phrase la porte déjà. */
  readonly reaction: string | null;
  /** Vignette du contenu visé. `null` ⇒ la bannière pose son icône typée. */
  readonly vignette: string | null;
};

export type { CadrageDeBanniere };

const texte = (valeur: unknown): string | null => {
  if (typeof valeur !== 'string') return null;
  const net = valeur.trim();
  return net.length > 0 ? net : null;
};

const champTexte = (source: unknown, cle: string): string | null => {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  return texte((source as Record<string, unknown>)[cle]);
};

/**
 * Le nom affichable de l'acteur — `displayName` > `prénom nom` > `username`,
 * puis la CHAÎNE VIDE. Ce dernier rang est ce qui distingue la v3 des deux
 * autres clients : elle ne fabrique pas de « Un utilisateur ».
 */
export const nomDeLActeur = (acteur: unknown): string => {
  const affiche = champTexte(acteur, 'displayName');
  if (affiche !== null) return affiche;
  const prenom = champTexte(acteur, 'firstName');
  const nom = champTexte(acteur, 'lastName');
  const complet = [prenom, nom].filter((part): part is string => part !== null).join(' ');
  if (complet.length > 0) return complet;
  return champTexte(acteur, 'username') ?? '';
};

/**
 * LES TROIS CONVENTIONS DE LA V3 — liées UNE fois, ici, et nulle part ailleurs.
 *
 * `apercuDeMessage` marque la pièce jointe AVANT l'extrait : sur une ligne
 * tronquée par le CSS, le lecteur voit d'abord de QUOI il s'agit.
 */
export const CONVENTIONS_DE_LA_V3: ConventionsDuClient = {
  nomDeLActeur: (acteur) => nomDeLActeur(acteur),
  apercuDeMessage: (contenu, piecesJointes) => {
    if (piecesJointes === undefined || piecesJointes.length === 0) return contenu;
    const mime = champTexte(piecesJointes[0], 'mimeType') ?? '';
    const marque = mime.startsWith('image/') ? BANNIERE.photo : BANNIERE.fichier;
    return contenu === '' ? marque : `${marque} · ${contenu}`;
  },
  titreDeRepli: (notification) => nomDeLActeur(notification.actor),
};

/**
 * `t` DE LA V3 — les quatre clés que la loi interroge, et pas une de plus.
 *
 * Un `t` qui rendrait sa CLÉ pour tout le reste ferait paraître
 * « titles.inConversation » à l'écran le jour où la loi en interroge une
 * cinquième ; il rend donc la chaîne VIDE, que la loi traite comme une absence.
 */
export const traducteurDeLaBanniere =
  (traduire: TraduireDansLaConversation): TranslateFunction =>
  (cle, params) => {
    if (cle === 'titles.inConversation') {
      return traduire({ acteur: params?.sender ?? '', groupe: params?.title ?? '' });
    }
    return (BANNIERE.media as Readonly<Record<string, string>>)[cle] ?? '';
  };

/**
 * Le cadrage — DÉLÉGUÉ à la loi partagée, qui lit `NotificationTypeEnum`
 * directement. La copie locale transcrivait treize littéraux et avait besoin
 * d'une garde qui relise le fichier de l'énumération pour prouver qu'ils n'en
 * avaient pas dérivé ; il n'y a plus rien à transcrire, donc plus rien à garder.
 */
export const cadrageDeBanniere = (notification: NotificationServie): CadrageDeBanniere =>
  notificationBannerFraming(notification as Notification);

export const titreDeBanniere = (
  notification: NotificationServie,
  traduire: TraduireDansLaConversation,
  nomLocalDuGroupe?: string | null,
): string =>
  buildNotificationHeadline(
    notification as Notification,
    traducteurDeLaBanniere(traduire),
    CONVENTIONS_DE_LA_V3,
    nomLocalDuGroupe,
  );

export const banniereDeNotification = (
  notification: NotificationServie,
  traduire: TraduireDansLaConversation,
  nomLocalDuGroupe?: string | null,
): BanniereDeNotification => {
  const rendue = buildNotificationBanner(
    notification as Notification,
    traducteurDeLaBanniere(traduire),
    CONVENTIONS_DE_LA_V3,
    { groupName: nomLocalDuGroupe },
  );
  return {
    titre: rendue.headline,
    corps: rendue.body,
    reaction: rendue.reactionBadge,
    vignette: rendue.thumbnailUrl,
  };
};
