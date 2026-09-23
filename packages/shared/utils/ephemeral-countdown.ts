/**
 * Le décompte d'un message éphémère, et les quatre dates qu'il fait naître.
 *
 * Directive porteur 2026-09-22 (#7451) : « les messages avec temps décompté ne
 * doivent décompter que lorsque l'utilisateur l'a reçu ! Le serveur rend le
 * message indisponible après le temps imparti + 1 h ».
 *
 * Avant ce lot, l'échéance était calculée par le CLIENT au moment de l'ENVOI
 * (`Date() + rawValue`, iOS `CoreModels.swift`), puis recopiée telle quelle par
 * la passerelle. Un destinataire hors ligne pendant toute la durée retrouvait un
 * message déjà mort sans l'avoir jamais vu, et deux destinataires du même
 * message partageaient une échéance qui n'avait de sens pour aucun des deux.
 *
 * ─── UNE DURÉE VOYAGE, UNE ÉCHÉANCE SE DÉRIVE ───────────────────────────────
 *
 * Ce qui part du client est une DURÉE (`ephemeralDuration`, en secondes). Elle
 * est la même pour tout le monde, donc elle voyage partout : REST, `message:new`
 * et push. Ce qui se calcule est une ÉCHÉANCE, et il y en a une PAR
 * DESTINATAIRE — `D(u) = première réception par u + durée` —, donc elle ne peut
 * pas voyager dans une diffusion de room.
 *
 * ─── LES QUATRE DATES ───────────────────────────────────────────────────────
 *
 * | date | qui la voit | ce qu'elle déclenche |
 * |---|---|---|
 * | `D(u)` | le destinataire `u` | la bulle disparaît de son écran (`message:expired` vers `user:<u>` SEUL) |
 * | `max D(u)` | l'expéditeur | son propre décompte, le plus tardif qu'il connaisse |
 * | `D(u) + 1 h` | personne | la passerelle cesse de SERVIR le message à `u` |
 * | destruction | personne | le contenu est effacé en base (`Message.expiresAt`) |
 *
 * La grâce d'une heure est la directive elle-même : entre `D(u)` et `D(u) + 1 h`
 * le message a disparu des écrans mais reste récupérable par un appareil qui
 * rattrape son retard — c'est la fenêtre qui permet à un second appareil du même
 * destinataire d'apprendre que le message a expiré plutôt que de ne jamais
 * savoir qu'il a existé.
 *
 * ─── LA DESTRUCTION SUIT LE DERNIER DÉCOMPTE LANCÉ, PAS LE PLAFOND ──────────
 *
 * {@link ephemeralDestructionAt} ne prend le plafond de rétention que dans UN
 * cas : personne n'a rien reçu. Dès qu'un seul décompte est lancé, la
 * destruction suit le PLUS TARDIF des décomptes connus — un destinataire qui
 * n'a toujours rien reçu à cet instant ne recevra jamais, et c'est exactement ce
 * que « le serveur rend le message indisponible » demande. Prendre le maximum
 * des deux aurait gardé sept jours en base un contenu dont tous les lecteurs
 * réels ont fini leur décompte ; prendre le minimum aurait détruit un contenu
 * dont un décompte court encore.
 */

/**
 * La grâce de la directive : le message a disparu des écrans à `D(u)`, la
 * passerelle cesse de le servir à `u` une heure plus tard.
 */
export const EPHEMERAL_UNAVAILABILITY_GRACE_MS = 60 * 60 * 1000;

/**
 * Plafond de rétention d'un éphémère que PERSONNE n'a jamais reçu.
 *
 * Sans lui, un message adressé à un destinataire qui ne se reconnecte plus ne
 * décompterait jamais et vivrait pour toujours — la fuite au repos exacte que
 * l'éphémère promet de fermer.
 *
 * La valeur est la DÉCISION PRODUIT #7450, en attente d'arbitrage du porteur :
 * sept jours par défaut. Un seul endroit nommé la porte, pour que l'arbitrage
 * soit une ligne à changer et non une chasse.
 *
 * @see https://github.com/isopen-io/meeshy/issues/7450
 */
export const EPHEMERAL_UNRECEIVED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Plancher d'une durée dérivée : une durée nulle ou négative n'est pas une durée. */
const MIN_DERIVED_DURATION_SECONDS = 1;

const asDate = (value: Date | string | null | undefined): Date | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * La durée qu'un envoi déclare, quel que soit l'âge du client.
 *
 * Un client à jour envoie `ephemeralDuration`. Un client déjà distribué n'envoie
 * qu'`expiresAt` — une ÉCHÉANCE calculée chez lui, que ce lot cesse d'honorer
 * telle quelle : on n'en garde que la DISTANCE au moment de l'envoi, qui est la
 * seule chose que le client voulait vraiment dire.
 *
 * @returns la durée en secondes entières, ou `null` quand le message n'est pas
 *   éphémère. Jamais zéro ni négatif : une échéance déjà passée à l'envoi vaut
 *   une seconde, pas « déjà mort ».
 */
export function normalizeEphemeralDuration(input: {
  readonly ephemeralDuration?: number | null;
  readonly expiresAt?: Date | string | null;
  readonly now: Date;
}): number | null {
  const declared = input.ephemeralDuration;
  if (typeof declared === 'number' && Number.isFinite(declared) && declared > 0) {
    return Math.floor(declared);
  }

  const expiresAt = asDate(input.expiresAt);
  if (!expiresAt) return null;

  const seconds = Math.round((expiresAt.getTime() - input.now.getTime()) / 1000);
  return Math.max(MIN_DERIVED_DURATION_SECONDS, seconds);
}

/**
 * `D(u)` — l'échéance d'UN destinataire, dérivée de SA première réception.
 *
 * Tant que `receivedAt` est nul, rien ne décompte pour lui : c'est toute la
 * directive, en une ligne.
 */
export function recipientEphemeralDeadline(input: {
  readonly receivedAt?: Date | string | null;
  readonly ephemeralDuration?: number | null;
}): Date | null {
  const duration = input.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;

  const receivedAt = asDate(input.receivedAt);
  if (!receivedAt) return null;

  return new Date(receivedAt.getTime() + Math.floor(duration) * 1000);
}

/**
 * L'heure à laquelle le CONTENU est effacé en base — `Message.expiresAt`, une
 * valeur interne recalculée à chaque première réception.
 *
 * @returns `null` pour un message non éphémère : le champ garde alors son autre
 *   écrivain (la grâce de la vue unique, {@link scheduleViewOnceBurn}).
 */
export function ephemeralDestructionAt(input: {
  readonly sentAt: Date;
  readonly ephemeralDuration?: number | null;
  readonly recipientDeadlines: readonly (Date | null | undefined)[];
}): Date | null {
  const duration = input.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;

  const known = input.recipientDeadlines
    .map((deadline) => asDate(deadline))
    .filter((deadline): deadline is Date => deadline !== null);

  if (known.length === 0) {
    return new Date(input.sentAt.getTime() + EPHEMERAL_UNRECEIVED_RETENTION_MS);
  }

  const latest = Math.max(...known.map((deadline) => deadline.getTime()));
  return new Date(latest + EPHEMERAL_UNAVAILABILITY_GRACE_MS);
}

/**
 * L'`expiresAt` SERVI à un lecteur — jamais la colonne brute pour un éphémère.
 *
 * Pour un message non éphémère (pas de durée), la colonne repart telle quelle :
 * c'est le chemin de la vue unique, que ce lot ne touche pas (#7451 §11).
 */
export function servedEphemeralExpiresAt(input: {
  readonly ephemeralDuration?: number | null;
  readonly rawExpiresAt?: Date | null;
  readonly isSender: boolean;
  /** `D(lecteur)`, pour un destinataire. */
  readonly readerDeadline?: Date | null;
  /** `max D(u)`, pour l'expéditeur. */
  readonly latestRecipientDeadline?: Date | null;
}): Date | null {
  const duration = input.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return input.rawExpiresAt ?? null;
  }
  return (input.isSender ? input.latestRecipientDeadline : input.readerDeadline) ?? null;
}

/**
 * Le message est-il encore SERVABLE à ce lecteur ?
 *
 * Un décompte non lancé reste servable : c'est précisément le message qu'il faut
 * livrer pour que le décompte démarre.
 */
export function isEphemeralServable(input: {
  readonly ephemeralDuration?: number | null;
  /** L'échéance SERVIE à ce lecteur — {@link servedEphemeralExpiresAt}. */
  readonly servedExpiresAt?: Date | null;
  readonly now: Date;
}): boolean {
  const duration = input.ephemeralDuration;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return true;

  const deadline = asDate(input.servedExpiresAt);
  if (!deadline) return true;

  return input.now.getTime() < deadline.getTime() + EPHEMERAL_UNAVAILABILITY_GRACE_MS;
}
