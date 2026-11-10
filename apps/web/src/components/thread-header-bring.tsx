import { apiDeps } from '@/lib/api/deps';
import type { BringDeps } from '@/lib/bring/bring-api';
import { bringHeaderState } from '@/lib/bring/bring-header-law';
import { bringStore, type BringStoreApi } from '@/lib/bring/bring-live';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { BringSendConfirm, usePersonBring } from '@/routes/user-profile-bring';

import { CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph } from './glyph';
import { ThreadHeaderNotice, useTransientNotice } from './thread-header-notice';

/**
 * **LE BRING DANS L'EN-TÊTE D'UN DIRECT** (#17442, iso iOS
 * `ConversationHeaderBringButton`) — on le trouve depuis la conversation, sans
 * passer par la fiche : un toucher, la MÊME confirmation que la fiche, et ça
 * sonne chez l'autre. Mêmes règles que la fiche (`usePersonBring`) :
 *
 * - le bouton n'existe que si la passerelle sert `available: true` — c'est
 *   elle qui juge le niveau (dès Ami), le blocage et le service coupé ;
 * - tant que ça sonne, le même bouton ANNULE, sans confirmation ;
 * - quota épuisé, il reste et dit le quota dans le bandeau de l'en-tête.
 */

const DANGER = 'var(--color-error)';

export function ThreadHeaderBring({
  language,
  peerId,
  peerName,
  store = bringStore,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly peerId: string;
  readonly peerName: string;
  readonly store?: BringStoreApi;
  readonly deps?: BringDeps;
}) {
  const ready = useCirclesCatalog(language);
  const [notice, announce] = useTransientNotice();
  const bring = usePersonBring({ language, personId: peerId, name: peerName, offered: true, onNotice: announce, store, deps });
  const state = bringHeaderState({ availability: bring.availability, ringing: bring.ringing });

  if (!ready) return null;
  const quota = translateCircles(language, 'bring.quota', { name: peerName });
  const label =
    state === 'ringing'
      ? `${translateCircles(language, 'bring.cancel')} · ${translateCircles(language, 'bring.ringing', { name: peerName })}`
      : state === 'exhausted'
        ? quota
        : translateCircles(language, 'bring.header.send', { name: peerName });
  const onPress = (): void => {
    if (state === 'ringing') return bring.cancel();
    if (state === 'exhausted') return announce(quota);
    bring.ask();
  };
  return (
    <>
      {state === 'hidden' ? null : (
        <button
          type="button"
          data-testid="conversation-header-bring"
          data-thread-bring={state}
          aria-label={label}
          aria-pressed={state === 'ringing'}
          disabled={bring.busy}
          aria-busy={bring.busy}
          onClick={onPress}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: DANGER, outlineColor: DANGER, opacity: state === 'exhausted' || bring.busy ? 0.55 : 1 }}
        >
          <span
            data-chrome-disc=""
            className="grid place-items-center rounded-chip transition-[background] duration-150"
            style={{
              width: 'var(--size-header-circle)',
              height: 'var(--size-header-circle)',
              color: state === 'ringing' ? '#fff' : DANGER,
              background: state === 'ringing' ? DANGER : 'color-mix(in srgb, currentColor 18%, transparent)',
            }}
          >
            <Glyph name={state === 'ringing' ? 'bellSlash' : 'bell'} size={13} />
          </span>
        </button>
      )}
      {bring.confirming ? <BringSendConfirm language={language} name={peerName} onConfirm={() => void bring.send()} onCancel={bring.dismiss} /> : null}
      {notice === null ? null : <ThreadHeaderNotice text={notice} marker="bring" />}
    </>
  );
}
