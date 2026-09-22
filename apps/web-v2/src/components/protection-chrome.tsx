import { memo, useEffect, useRef, useState } from 'react';

import type { EphemeralDeadline } from '@meeshy/shared/utils/ephemeral-deadline';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { formatRemaining } from '@/lib/reading-mode/protection';
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
 * ## LES DEUX PICTOGRAMMES, ET POURQUOI ILS DIFFÈRENT
 *
 * Le dépôt s'était contredit exactement comme iOS (#7452) : `flame` désignait
 * la VUE UNIQUE dans la liste des conversations (`lens-row.tsx`) pendant que
 * le même `flame` désignait l'ÉPHÉMÈRE dans la bulle. **Le vocabulaire retenu
 * est celui du COMPOSEUR** — là où l'utilisateur CHOISIT la protection :
 * `flameFill` pour l'éphémère (`composer-top-row.tsx:212`), `eye` pour la vue
 * unique (`:250`). Même pictogramme au choix et à l'affichage ; deux sens,
 * deux pictogrammes.
 *
 * Le LIBELLÉ suit la même discipline, et jusqu'à la CLÉ : la désignation lit
 * `composer.viewOnce.label`, la chaîne même que la bascule du composeur
 * affiche. Une clé jumelle `message.viewOnce` porterait aujourd'hui les mêmes
 * sept traductions et divergerait au premier lot qui n'en relit qu'une.
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
  isViewOnce,
  align = 'start',
  onExpired,
  clock = secondClock,
  now = Date.now,
}: {
  readonly deadline: EphemeralDeadline;
  readonly isViewOnce: boolean;
  readonly align?: 'start' | 'end';
  /** Absent ⇒ la surface ne retire pas ses rangées (lecture souveraine) — le décompte se peint quand même. */
  readonly onExpired?: (() => void) | undefined;
  readonly clock?: IntervalClock;
  readonly now?: () => number;
}) {
  if (deadline.state === 'none' && !isViewOnce) return null;

  return (
    <div
      data-protection-chrome
      className={`mb-1 flex flex-wrap items-center gap-1.5 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
    >
      {isViewOnce ? <ViewOnceMention /> : null}
      <EphemeralMention deadline={deadline} clock={clock} now={now} {...(onExpired === undefined ? {} : { onExpired })} />
    </div>
  );
}

/**
 * LA DÉSIGNATION D'UNE VUE UNIQUE — **même sans pièce jointe** (#7454,
 * travail 4). Le voile (`ProtectedContent`) ne nommait « Voir une fois » que
 * lorsqu'il y avait un média (`protected-content.tsx:279-283`) : un TEXTE à
 * vue unique était masqué sans que rien ne dise ce qu'il était, ni pourquoi le
 * toucher le consommerait.
 *
 * Elle vit dans le chrome, DEHORS du voile, pour une raison de fond : elle
 * reste vraie après la révélation, et un lecteur qui revient sur la rangée
 * doit pouvoir lire ce qui lui est arrivé.
 */
function ViewOnceMention() {
  const language = currentInterfaceLanguage();
  return (
    <span
      data-view-once
      data-glyph="eye"
      className="protected-view-once-badge rounded-chip inline-flex items-center gap-1"
      aria-label={translate(language, 'message.viewOnce.a11y')}
    >
      <Glyph name="eye" size={11} />
      <span className="font-bold text-chip">{translate(language, 'composer.viewOnce.label')}</span>
    </span>
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

  /**
   * L'ABONNEMENT SE DÉFAIT — `subscribe` rend sa propre fonction de retrait, et
   * l'horloge arrête son `setInterval` dès le dernier abonné parti : une liste
   * virtualisée qui recycle ses rangées ne laisse aucun minuteur derrière elle.
   */
  useEffect(() => {
    if (expiresAtMs === null) {
      setRemainingMs(null);
      return;
    }
    setRemainingMs(expiresAtMs - now());
    return clock.subscribe((tick) => setRemainingMs(expiresAtMs - tick));
  }, [expiresAtMs, clock, now]);

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

  const label = formatRemaining(Math.floor(remainingMs / 1000));
  return (
    <span
      data-ephemeral="running"
      data-glyph="flameFill"
      className="protected-ephemeral-badge rounded-chip inline-flex items-center gap-1"
      aria-label={translate(language, 'message.ephemeral.a11y', { remaining: label })}
    >
      <Glyph name="flameFill" size={11} />
      <span className="tabular-nums font-bold text-chip">{label}</span>
    </span>
  );
});
