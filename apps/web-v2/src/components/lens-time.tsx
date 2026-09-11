import { useEffect, useState } from 'react';

import { relativeTimeTicks, shortRelativeTime } from '@/lib/relative-time';
import { minuteClock } from '@/lib/view/minute-clock';

/**
 * L'HEURE DE LA RANGÉE (#5694, écart 8) — miroir `LentilleRowTimestamp`
 * (`LentilleConversationRow.swift:854-870`) : relative, TOUJOURS tertiaire.
 *
 * `timestampColor` (`:458-471`) rend `MeeshyColors.textMuted` INCONDITIONNEL­
 * LEMENT — « le timestamp rouge sur non-lu est supprimé ». Ce composant ne
 * prend même pas de prop `unread` : la règle est STRUCTURELLE, pas
 * conditionnelle — rien ici ne PEUT la contourner.
 *
 * LE TICK NE VIT QUE TANT QUE LE LIBELLÉ CHANGE — miroir EXACT du portillon
 * `liveTickWindow` (`:861-869`), porté par `relativeTimeTicks` — DÉDUIT de
 * l'échelle, jamais un second seuil posé à côté d'elle. Une rangée de
 * « 3j » ou « 2sem » n'a rien à rafraîchir : l'abonner à l'horloge ferait
 * re-rendre, chaque minute, autant de nœuds que la liste compte de vieilles
 * conversations — pour un texte IDENTIQUE. Sur une Lentille de 200 lignes,
 * c'est la différence entre quelques abonnés et deux cents (dimensions 3
 * et 4). Le portillon se rouvre tout seul : tant que la rangée ticke, elle
 * se re-rend, et la minute où l'écart franchit l'heure, l'effet se démonte.
 *
 * L'horloge est PARTAGÉE (`minuteClock`) — un seul `setInterval` pour toute
 * la Lentille, jamais un par rangée.
 */
export function LensTime({ at }: { readonly at: Date | string }) {
  const [now, setNow] = useState(() => Date.now());

  const target = new Date(at);
  const live = relativeTimeTicks(target, new Date(now));

  useEffect(() => (live ? minuteClock.subscribe(setNow) : undefined), [live]);

  return (
    <time
      data-time
      dateTime={target.toISOString()}
      className="shrink-0 tabular-nums font-bold text-time"
      style={{ color: 'var(--color-ios-ink-3)' }}
    >
      {shortRelativeTime(target, new Date(now))}
    </time>
  );
}
