import { memo, useEffect, useRef, useState } from 'react';

import {
  EPHEMERAL_COUNTER_WINDOW_SECONDS,
  ephemeralCounterVisible,
  type EphemeralDeadline,
} from '@meeshy/shared/utils/ephemeral-deadline';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { countdownDigits, formatRemaining } from '@/lib/reading-mode/protection';
import { secondClock, type IntervalClock } from '@/lib/view/interval-clock';

import { Glyph } from './glyph';

/**
 * LE CHROME DE PROTECTION — **le point d'entrée par lequel passent TOUS les
 * modes** (#7454, travail 2). Directive porteur 2026-09-22 : « il est
 * important de s'assurer que cette feature a un décompte en Script, Focal ou
 * bulle **ou tout autre affichage plus tard** ».
 *
 * Avant ce lot, `EphemeralBadge` était monté par `focal-row.tsx` ET par
 * `bubble.tsx`, chacune câblant son minuteur et sa condition ; la vue unique
 * n'était NOMMÉE nulle part sans pièce jointe. Un mode ajouté demain aurait eu
 * un fil complet et aucun des deux. Ici, une seule surface les rend, et
 * `thread-modes-protection-chrome.test.tsx` échoue si un mode ne la monte pas.
 *
 * ## LA VUE UNIQUE N'EST PLUS ICI (#7580)
 *
 * Le chrome la DÉSIGNAIT au-dessus de la bulle (« 👁 Vue unique ») pendant que
 * le voile, dessous, disait « Voir une fois » : deux puces pour un état. La
 * règle porteur du 2026-09-23 en veut UNE, à la place du contenu —
 * `ViewOnceChip` (`protected-content.tsx`), que tous les modes montent par
 * `ProtectedContent`. Ce chrome ne porte plus que l'éphémère.
 *
 * ## UNE HORLOGE, PAS UNE MINUTERIE PAR BULLE (#7454, travail 5)
 *
 * `secondClock` (`lib/view/interval-clock.ts`) existe déjà et porte UN seul
 * `setInterval` pour toute l'application, arrêté dès le dernier désabonnement.
 * `EphemeralBadge` en ouvrait un PAR message affiché — vingt rangées visibles,
 * vingt minuteurs qui se réveillaient à vingt instants différents.
 */

export function ProtectionChrome({
  deadline,
  align = 'start',
  onExpired,
  clock = secondClock,
  now = Date.now,
}: {
  readonly deadline: EphemeralDeadline;
  readonly align?: 'start' | 'end';
  /** Absent ⇒ la surface ne retire pas ses rangées (lecture souveraine) — le décompte se peint quand même. */
  readonly onExpired?: (() => void) | undefined;
  readonly clock?: IntervalClock;
  readonly now?: () => number;
}) {
  if (deadline.state === 'none') return null;

  return (
    <div
      data-protection-chrome
      className={`mb-1 flex flex-wrap items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
    >
      <EphemeralMention deadline={deadline} clock={clock} now={now} {...(onExpired === undefined ? {} : { onExpired })} />
    </div>
  );
}

/**
 * LE DÉCOMPTE — ou son absence.
 *
 * `awaiting` n'est pas un état de chargement : c'est ce que voit l'expéditeur
 * d'un message que personne n'a encore reçu (contrat #7451, point 6). Sa durée
 * s'affiche, rien ne descend. Le dire autrement — masquer le badge, ou le
 * faire décompter depuis l'envoi — serait précisément le défaut que la
 * directive corrige.
 */
const EphemeralMention = memo(function EphemeralMention({
  deadline,
  onExpired,
  clock,
  now,
}: {
  readonly deadline: EphemeralDeadline;
  readonly onExpired?: (() => void) | undefined;
  readonly clock: IntervalClock;
  readonly now: () => number;
}) {
  const expiresAtMs = deadline.state === 'scheduled' ? deadline.expiresAtMs : null;
  const [remainingMs, setRemainingMs] = useState(() => (expiresAtMs === null ? null : expiresAtMs - now()));

  /** La fenêtre de la loi partagée, lue du reste COURANT — voir l'effet ci-dessous. */
  const withinCounterWindow = remainingMs !== null && ephemeralCounterVisible(remainingMs);

  /**
   * **DEUX RÉGIMES, ET UN SEUL À LA FOIS** (#7468, conséquence de fluidité).
   *
   * Au-delà de la dernière minute, rien à rafraîchir : la puce ne montre que
   * la flamme, et un abonnement à l'horloge réveillerait la rangée soixante
   * fois par minute pour repeindre un pixel identique. Un SEUL `setTimeout`
   * dort jusqu'au franchissement du seuil.
   *
   * Sous le seuil, l'horloge PARTAGÉE reprend — un `setInterval` pour toute
   * l'application, jamais un par bulle (D-108).
   *
   * Le passage de l'un à l'autre se fait tout seul : le minuteur repose
   * `remainingMs`, `withinCounterWindow` bascule, et cet effet se rejoue dans
   * l'autre régime. `subscribe` rend sa propre fonction de retrait, et
   * l'horloge arrête son `setInterval` dès le dernier abonné parti : une liste
   * virtualisée qui recycle ses rangées ne laisse aucun minuteur derrière elle.
   */
  useEffect(() => {
    if (expiresAtMs === null) {
      setRemainingMs(null);
      return;
    }
    const current = expiresAtMs - now();
    setRemainingMs(current);
    if (!ephemeralCounterVisible(current)) {
      const delay = Math.max(0, current - EPHEMERAL_COUNTER_WINDOW_SECONDS * 1000);
      const timer = setTimeout(() => setRemainingMs(expiresAtMs - now()), delay);
      return () => clearTimeout(timer);
    }
    return clock.subscribe((tick) => setRemainingMs(expiresAtMs - tick));
  }, [expiresAtMs, withinCounterWindow, clock, now]);

  /**
   * L'ÉCHÉANCE REMONTE UNE FOIS — par une `ref`, pour que changer de
   * gestionnaire ne rejoue pas l'annonce, et depuis un EFFET plutôt que depuis
   * le rendu : prévenir l'hôte pendant qu'il se rend le ferait se rendre en
   * boucle.
   */
  const expiredRef = useRef(false);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;
  useEffect(() => {
    expiredRef.current = false;
  }, [expiresAtMs]);
  useEffect(() => {
    if (remainingMs === null || remainingMs > 0 || expiredRef.current) return;
    expiredRef.current = true;
    onExpiredRef.current?.();
  }, [remainingMs]);

  const language = currentInterfaceLanguage();

  if (deadline.state === 'awaiting-reception') {
    const duration = formatRemaining(deadline.durationSeconds);
    return (
      <span
        data-ephemeral="awaiting"
        data-glyph="flameFill"
        className="protected-ephemeral-badge rounded-chip inline-flex items-center gap-1"
        aria-label={translate(language, 'message.ephemeral.awaiting.a11y', { duration })}
      >
        <Glyph name="flameFill" size={11} />
        <span className="tabular-nums font-bold text-chip">{duration}</span>
        <span className="text-chip opacity-80">{translate(language, 'message.ephemeral.awaiting')}</span>
      </span>
    );
  }

  if (remainingMs === null || remainingMs <= 0) return null;

  const seconds = Math.floor(remainingMs / 1000);
  /**
   * **L'ŒIL EST SOULAGÉ, JAMAIS L'OREILLE** (#7468). Le compteur disparaît
   * au-delà de la dernière minute ; le libellé accessible, lui, donne TOUJOURS
   * le temps restant. Privé des chiffres, un lecteur d'écran n'aurait aucun
   * autre chemin vers l'échéance — et la flamme seule ne dit pas « dans douze
   * minutes ».
   */
  return (
    <span
      data-ephemeral="running"
      data-counter={withinCounterWindow ? 'on' : 'off'}
      data-glyph="flameFill"
      className="protected-ephemeral-badge rounded-chip inline-flex items-center gap-1"
      aria-label={translate(language, 'message.ephemeral.a11y', { remaining: formatRemaining(seconds) })}
    >
      <Glyph name="flameFill" size={11} />
      {withinCounterWindow ? (
        <span className="tabular-nums font-bold text-chip">{countdownDigits(seconds)}</span>
      ) : null}
    </span>
  );
});
