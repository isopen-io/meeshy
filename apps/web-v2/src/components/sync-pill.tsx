import { useEffect, useState } from 'react';
import { useStore } from 'zustand/react';

import { Glyph } from './glyph';
import { outboxStore } from '@/lib/send/outbox-store';
import { useOnline } from '@/lib/net/online';
import { nextSyncPillExpiry, resolveSyncPill, syncPillLabel } from '@/lib/view/sync-pill';

/**
 * **LA PASTILLE DE SYNCHRONISATION** (#6080) — miroir `SyncPill` /
 * `ConnectionBanner` (`apps/ios/Meeshy/Features/Main/Components/`).
 *
 * Elle dit CE QUI ATTEND : un envoi en vol, une file bloquée hors couverture,
 * un envoi qui a renoncé. La v3.1 ne le disait nulle part — l'outbox
 * (`lib/send/outbox-store.ts`) existait, peuplée, et n'avait aucune surface :
 * un message parti dans le métro restait invisible jusqu'à ce qu'on rouvre la
 * conversation où il vivait.
 *
 * **LA POSE — c'est la moitié du sujet, et iOS a déjà payé l'erreur.**
 * `ConnectionBanner.conversationTopPadding` porte la leçon en toutes lettres :
 * la pastille était posée à `y = 0`, « sur le chrome, qu'elle recouvrait. Le
 * bandeau masquait le bouton Mode de lecture, constaté à l'écran ». Et la
 * conclusion qui tranche l'arbitrage : « la remontée sous la Dynamic Island et
 * le respect du chrome sont INCOMPATIBLES ici. Il faut choisir, et c'est le
 * chrome qui gagne — un contrôle recouvert est un contrôle qu'on ne peut plus
 * lire, alors qu'une annonce posée 8 pt plus bas reste parfaitement visible. »
 *
 * D'où `--sync-pill-top` (`styles/app.css`), MESURÉ et non estimé : le bas du
 * plus haut chrome de l'application (64 px pour l'en-tête de liste, 60 pour
 * celui du fil — relevé au navigateur à 390 × 844), plus l'encoche, plus les
 * 8 px d'air qu'iOS pose entre les deux.
 *
 * **Elle vit dans la COQUILLE**, comme `RootChromeLayer` côté iOS : au-dessus
 * de tous les écrans, hors de chacun. C'est la seule exception à la minceur
 * revendiquée de `Shell` — et elle est justifiée par la même raison qui la
 * fonde : iOS n'a pas de barre commune, mais il a bien UNE couche de chrome
 * flottant au-dessus de tout.
 *
 * `pointer-events-none` : elle ANNONCE, elle ne prend aucun geste — le renvoi
 * d'un échec se fait dans le fil, sur la bulle, là où l'on voit ce qu'on
 * renvoie (iOS y attache un `onTap`, porte que la v3.1 n'a pas encore ; issue
 * compagnon plutôt qu'un contrôle qui ne mène nulle part, loi 4).
 */

const TEINTE = {
  failed: { fond: 'var(--color-error)', encre: '#fff', glyphe: 'warningCircle' },
  offline: { fond: 'var(--color-warn)', encre: 'var(--color-ios-ink)', glyphe: 'warningCircle' },
  syncing: { fond: 'var(--color-ios-card)', encre: 'var(--color-ios-ink-2)', glyphe: 'clock' },
} as const;

export function SyncPill() {
  const online = useOnline();
  const entries = useStore(outboxStore, (s) => s.entries);
  const [now, setNow] = useState(() => Date.now());

  /**
   * TOUTES LES CONVERSATIONS, jamais celle qui est ouverte : une pastille
   * globale annonce le travail global. `entries` est indexé par conversation
   * (`outbox-store.ts`) — c'est le seul endroit du web qui l'aplatit.
   */
  const toutes = Object.values(entries).flat();
  const state = resolveSyncPill({ entries: toutes, online, now });

  /**
   * LE RÉVEIL EST ARMÉ SUR LA PÉREMPTION, jamais sur un intervalle : rien ne
   * tourne tant qu'aucune ligne n'a d'échéance (`nextSyncPillExpiry`). Sans
   * lui, une pastille rouge resterait rouge jusqu'au prochain changement de la
   * file — la péremption est une transition que RIEN n'annonce.
   */
  const echeance = nextSyncPillExpiry({ entries: toutes, now });
  useEffect(() => {
    if (echeance === null) return undefined;
    const delai = Math.max(0, echeance - Date.now()) + 50;
    const t = setTimeout(() => setNow(Date.now()), delai);
    return () => clearTimeout(t);
  }, [echeance]);

  if (state.kind === 'hidden') return null;

  const teinte = TEINTE[state.kind];

  return (
    <div
      className="sync-pill pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      <span
        data-sync-pill={state.kind}
        className="flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-check font-semibold shadow-lg backdrop-blur-md"
        style={{ backgroundColor: teinte.fond, color: teinte.encre }}
      >
        <Glyph name={teinte.glyphe} size={11} />
        {syncPillLabel(state)}
      </span>
    </div>
  );
}
