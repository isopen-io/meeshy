/**
 * L'ÉCHÉANCE D'UN MESSAGE ÉPHÉMÈRE — **le point 6 du contrat du fil (#7451)**,
 * écrit UNE fois pour les clients TypeScript.
 *
 * Directive porteur 2026-09-22 : « les messages avec temps décompté ne doivent
 * décompter que lorsque l'utilisateur l'a reçu ». Jusqu'ici le client calculait
 * l'échéance à l'ENVOI (`CoreModels.swift:982-984`, recopiée telle quelle par
 * la passerelle) : un message envoyé à quelqu'un de hors ligne avait déjà brûlé
 * la moitié de sa vie quand il arrivait.
 *
 * ## LES DEUX SOURCES, ET POURQUOI ON PREND LA PLUS PROCHE
 *
 * 1. **L'échéance SERVIE** — `expiresAt` par lecteur sur REST (contrat point 3)
 *    ou l'événement `message:countdown-started` (point 5). Elle fait autorité :
 *    c'est l'heure à laquelle le serveur CESSERA de servir le message à ce
 *    lecteur.
 * 2. **La RÉCEPTION LOCALE + `ephemeralDuration`** — le repli, et le cas
 *    NOMINAL du temps réel : `message:new` ne porte plus d'`expiresAt` pour un
 *    éphémère (point 4), une diffusion en room ne pouvant pas être différente
 *    pour chaque lecteur.
 *
 * On retient la **plus proche**, jamais la plus tardive : les deux horloges
 * (celle du serveur, celle de l'appareil) dérivent l'une de l'autre, et de ces
 * deux erreurs possibles une seule est acceptable — montrer le message un
 * instant de moins que promis, jamais un instant de plus.
 *
 * ## `awaiting-reception` N'EST PAS `none`
 *
 * Un expéditeur dont personne n'a encore reçu le message n'a AUCUNE échéance :
 * la sienne se pose quand la première réception remonte (point 5, la room
 * `user:<expéditeur>`). Le dire « pas d'éphémère » (`none`) effacerait de son
 * écran la protection qu'il vient de choisir ; le dire « échu » l'effacerait
 * tout court. Il voit donc sa DURÉE, sans décompte — exactement ce que le
 * contrat appelle « en attente de réception ».
 *
 * Rien de ce fichier ne lit l'horloge : il rend une ÉCHÉANCE, jamais un
 * « reste-t-il du temps ». C'est ce qui permet à une horloge partagée (web) ou
 * à un `Text(timerInterval:)` (iOS) de rendre le décompte sans qu'aucune
 * minuterie n'appartienne à ce calcul.
 */

export type EphemeralDeadlineInput = {
  /** Secondes entières, > 0 — `Message.ephemeralDuration`, servi par REST, `message:new` et push. */
  readonly ephemeralDuration?: number | null;
  /** L'échéance SERVIE pour CE lecteur : `expiresAt` (REST) ou `message:countdown-started`. */
  readonly servedExpiresAt?: Date | string | number | null;
  /** L'instant, horloge LOCALE, où ce client a vu le message pour la première fois. */
  readonly receivedAtMs?: number | null;
  /** L'expéditeur n'a pas de « réception » : son échéance ne peut venir que du serveur. */
  readonly isMine: boolean;
};

export type EphemeralDeadline =
  | { readonly state: 'none' }
  | { readonly state: 'awaiting-reception'; readonly durationSeconds: number }
  | { readonly state: 'scheduled'; readonly expiresAtMs: number };

function durationSecondsOf(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw)) return null;
  const seconds = Math.floor(raw);
  return seconds > 0 ? seconds : null;
}

function servedMsOf(raw: Date | string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const ms = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function ephemeralDeadline(input: EphemeralDeadlineInput): EphemeralDeadline {
  const durationSeconds = durationSecondsOf(input.ephemeralDuration);
  const served = servedMsOf(input.servedExpiresAt);

  /**
   * LA RÉCEPTION NE VAUT QUE POUR UN DESTINATAIRE. Lire l'horloge locale de
   * l'expéditeur donnerait « envoi + durée » — précisément le calcul que la
   * directive retire.
   */
  const receivedAtMs = input.receivedAtMs;
  const local =
    input.isMine || durationSeconds === null || receivedAtMs === null || receivedAtMs === undefined
      ? null
      : receivedAtMs + durationSeconds * 1000;

  if (served !== null && local !== null) {
    return { state: 'scheduled', expiresAtMs: Math.min(served, local) };
  }
  if (served !== null) return { state: 'scheduled', expiresAtMs: served };
  if (local !== null) return { state: 'scheduled', expiresAtMs: local };
  if (durationSeconds !== null) return { state: 'awaiting-reception', durationSeconds };
  return { state: 'none' };
}

/**
 * LA DERNIÈRE MINUTE — **le compteur n'apparaît que là** (#7468 web, #7467 iOS).
 *
 * Précision du porteur, 2026-09-22 : « l'éphémère est la flamme avec la
 * configuration de durée par défaut ! Ce qu'il faudrait c'est d'afficher le
 * compteur de l'éphémère dans la conversation uniquement quand on est déjà à
 * 1 min et moins de sa destruction. »
 *
 * La valeur vit ICI, avec la règle d'échéance, parce qu'elle en est la SUITE :
 * l'échéance dit QUAND, celle-ci dit à partir de quand on l'ÉCRIT. Les deux
 * clients la partagent — un seuil recopié dans deux peaux divergerait au
 * premier ajustement.
 */
export const EPHEMERAL_COUNTER_WINDOW_SECONDS = 60;

/**
 * `true` dès que le compteur doit se peindre — et il gouverne DEUX choses que
 * rien d'autre ne relie : ce que l'œil voit (des chiffres, ou la seule flamme)
 * et ce qui s'abonne à l'horloge. Au-delà de la fenêtre, AUCUNE horloge ne bat
 * pour ce message : il n'y a rien à rafraîchir, et vingt rangées éphémères
 * réveillaient vingt fois par seconde un écran qui n'en montrait rien.
 *
 * Un reste NÉGATIF rend `true` : une échéance passée n'est pas « au-delà de la
 * minute » — c'est un message en train de disparaître, et lui remettre la
 * flamme nue serait un pas en arrière au pire moment.
 */
export function ephemeralCounterVisible(remainingMs: number): boolean {
  return remainingMs <= EPHEMERAL_COUNTER_WINDOW_SECONDS * 1000;
}
