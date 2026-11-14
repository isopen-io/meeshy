import { relationLevelIfAtLeast } from '@meeshy/shared/types/relation';
import { useQuery } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { useStore } from 'zustand/react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { relationRaiseGateQueryOptions } from '@/lib/api/relations';
import {
  bringAvailabilityQueryKey,
  bringSendOutcomeOf,
  loadBringAvailability,
  sendBring,
  stopBring,
  type BringAvailabilityView,
  type BringDeps,
} from '@/lib/bring/bring-api';
import { bringStore, type BringStoreApi } from '@/lib/bring/bring-live';
import { translate } from '@/lib/i18n-catalog';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';

import { FOCUS, INK, INK_2 } from './user-profile-style';

/**
 * **LE BRING SUR LA FICHE D'UNE PERSONNE** (#13936, sous-lot `proche-bring@web`,
 * spec cercles § 5 « Bring ») — « Bring » expliqué (« pour une urgence extrême »,
 * et ce qui l'en empêche chez le destinataire — #17442), compteur « Restants aujourd'hui », absent si
 * le serveur ne l'ouvre pas.
 *
 * - **Le serveur décide de tout** : niveau (dès Ami), quota du jour du
 *   destinataire, blocage, service coupé. `available: false` ⇒ RIEN — ni
 *   bouton grisé, ni raison : un blocage ne se devine pas.
 * - **Confirmé avant de partir** : le quota d'un Ami est d'UN Bring par jour, et
 *   le son est forcé chez l'autre ; un geste accidentel coûterait les deux.
 * - **Tant que ça sonne** : « Ça sonne chez X » et « Annuler » (`DELETE`, au
 *   geste), jusqu'à `bring:stopped` ou `expiresAt` (`bring-live.ts`).
 * - Le compteur se met à jour depuis la réponse de l'envoi, sans relire.
 */

const DANGER = 'var(--color-error)';

export const BRING_AVAILABILITY_STALE_TIME = 30_000;

export const ProfileBringRowView = memo(function ProfileBringRowView({
  language,
  name,
  availability,
  ringing,
  busy,
  onBring,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly availability: BringAvailabilityView | null;
  readonly ringing: boolean;
  readonly busy: boolean;
  readonly onBring: () => void;
  readonly onCancel: () => void;
}) {
  if (availability === null || !availability.available) return null;
  const exhausted = availability.remainingToday === 0;
  const counter =
    availability.remainingToday === null
      ? translateCircles(language, 'bring.unlimited')
      : translateCircles(language, 'bring.remaining', { count: String(availability.remainingToday) });
  return (
    <div data-bring-row="" className="grid gap-2 rounded-card px-3.5 py-3" style={{ backgroundColor: `color-mix(in srgb, ${DANGER} 8%, transparent)` }}>
      <p className="text-caption" style={{ color: INK_2 }}>
        {translateCircles(language, 'bring.explain')}
      </p>
      {ringing ? (
        <div className="flex items-center gap-3">
          <span role="status" className="min-w-0 flex-1 text-body font-semibold" style={{ color: INK }}>
            <span aria-hidden="true">🔔 </span>
            {translateCircles(language, 'bring.ringing', { name })}
          </span>
          <button
            type="button"
            data-bring-cancel=""
            onClick={onCancel}
            className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold ${FOCUS}`}
            style={{ minHeight: 44, color: DANGER, border: `1.5px solid color-mix(in srgb, ${DANGER} 45%, transparent)`, outlineColor: DANGER }}
          >
            {translateCircles(language, 'bring.cancel')}
          </button>
        </div>
      ) : exhausted ? (
        <p data-bring-exhausted="" className="text-body font-semibold" style={{ color: INK }}>
          {translateCircles(language, 'bring.quota', { name })}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <span data-bring-remaining="" className="min-w-0 flex-1 text-caption" style={{ color: INK_2 }}>
            {counter}
          </span>
          <button
            type="button"
            data-bring-send=""
            disabled={busy}
            aria-busy={busy}
            onClick={onBring}
            className={`grid shrink-0 place-items-center rounded-chip px-4 text-body font-bold ${FOCUS}`}
            style={{ minHeight: 44, color: 'var(--color-on-state)', backgroundColor: DANGER, outlineColor: DANGER, opacity: busy ? 0.6 : 1 }}
          >
            <span>
              <span aria-hidden="true">🔔 </span>
              {translateCircles(language, 'bring.action')}
            </span>
          </button>
        </div>
      )}
    </div>
  );
});

export function bringAvailabilityQueryOptions(deps: BringDeps, userId: string) {
  return {
    queryKey: bringAvailabilityQueryKey(userId),
    staleTime: BRING_AVAILABILITY_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadBringAvailability(deps, userId, signal)),
  };
}

/**
 * LE BRING VERS UNE PERSONNE, partagé par la fiche et l'en-tête d'un direct
 * (#17442) : la disponibilité servie, la confirmation, l'envoi et son issue,
 * l'annulation tant que ça sonne. Aucune règle n'est recalculée ici.
 */
export function usePersonBring({
  language,
  personId,
  name,
  offered,
  onNotice,
  store,
  deps,
}: {
  readonly language: InterfaceLanguage;
  readonly personId: string;
  readonly name: string;
  readonly offered: boolean;
  readonly onNotice: (message: string) => void;
  readonly store: BringStoreApi;
  readonly deps: BringDeps;
}) {
  const availability = useQuery({ ...bringAvailabilityQueryOptions(deps, personId), enabled: offered }, appQueryClient);
  const outgoing = useStore(store, (state) => state.outgoing[personId] ?? null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = bringAvailabilityQueryKey(personId);
  const patch = (next: Partial<BringAvailabilityView>): void => {
    appQueryClient.setQueryData<BringAvailabilityView>(key, (current) => (current === undefined ? current : { ...current, ...next }));
  };

  const send = async (): Promise<void> => {
    setConfirming(false);
    setBusy(true);
    const outcome = bringSendOutcomeOf(await sendBring(deps, personId));
    setBusy(false);
    if (outcome.kind === 'sent') {
      store.getState().sent(outcome.sent);
      patch({ perDay: outcome.sent.perDay, remainingToday: outcome.sent.remainingToday });
      return;
    }
    if (outcome.kind === 'gone') return patch({ available: false, remainingToday: 0 });
    if (outcome.kind === 'quota') {
      patch({ remainingToday: 0 });
      return onNotice(translateCircles(language, 'bring.quota', { name }));
    }
    onNotice(translateCircles(language, outcome.kind === 'offline' ? 'bring.offline' : 'bring.failed'));
  };

  const cancel = (): void => {
    if (outgoing === null) return;
    store.getState().stop(outgoing.bringId);
    void stopBring(deps, outgoing.bringId);
  };

  return {
    availability: availability.data ?? null,
    ringing: outgoing !== null,
    busy,
    confirming,
    ask: () => setConfirming(true),
    dismiss: () => setConfirming(false),
    send,
    cancel,
  };
}

/** La confirmation du Bring, la MÊME depuis la fiche et depuis l'en-tête d'un direct. */
export function BringSendConfirm({
  language,
  name,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      name="bring-send"
      title={translateCircles(language, 'bring.confirm.title', { name })}
      body={translateCircles(language, 'bring.confirm.body', { name })}
      cancelLabel={translate(language, 'common.cancel')}
      confirmLabel={translateCircles(language, 'bring.confirm.send')}
      tone="destructive"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Hors amitié, la ligne ne demande le Bring que si la porte du lien (`GET /relations/:userId`,
 * même cache que le cercle de la fiche) sert un `accessLevel` d'au moins Ami : entre deux
 * comptes de l'équipe, Sang sans lien (#16623). Aucun rôle n'est lu ni déduit ici.
 */
export function ProfileBringRow({
  language,
  person,
  friend,
  onNotice,
  store = bringStore,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly person: PersonSummary;
  readonly friend: boolean;
  readonly onNotice: (message: string) => void;
  readonly store?: BringStoreApi;
  readonly deps?: BringDeps;
}) {
  const ready = useCirclesCatalog(language);
  const gate = useQuery({ ...relationRaiseGateQueryOptions(deps, person.id), enabled: !friend }, appQueryClient);
  const offered = friend || relationLevelIfAtLeast(gate.data?.accessLevel, 'FRIEND') !== null;
  const name = person.displayName ?? person.username;
  const bring = usePersonBring({ language, personId: person.id, name, offered, onNotice, store, deps });

  if (!ready) return null;
  return (
    <>
      <ProfileBringRowView
        language={language}
        name={name}
        availability={bring.availability}
        ringing={bring.ringing}
        busy={bring.busy}
        onBring={bring.ask}
        onCancel={bring.cancel}
      />
      {bring.confirming ? <BringSendConfirm language={language} name={name} onConfirm={() => void bring.send()} onCancel={bring.dismiss} /> : null}
    </>
  );
}
