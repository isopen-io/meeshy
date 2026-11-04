import { useCallback, useEffect, useId, useState } from 'react';

import type { CreationEncryptionMode } from '@meeshy/shared/utils/conversation-creation-encryption';

import { CREATION_ENCRYPTION_KEY, CREATION_UNAVAILABILITY_KEY } from '@/lib/conversation-new/encryption';
import type { ConversationEncryptionCatalogKey } from '@/lib/i18n-conversation-encryption-catalog';
import { encryptionRegime } from '@/lib/view/conversation-encryption-explanation';
import {
  encryptionSwitchTargets,
  type EncryptionModeSwitchGesture,
  type EncryptionStatus,
  type EncryptionSwitchRefusal,
  SWITCH_KEY,
  SWITCH_REFUSAL_KEY,
} from '@/lib/view/conversation-encryption-switch';

/**
 * **« CHANGER DE MODE » DANS LA FICHE CHIFFREMENT** (#14648) — miroir de
 * `modeSwitchSection` (iOS, `ConversationEncryptionDetailSheet`) : chaque mode
 * proposé dit ce qu'il fait ; tout mode autre que le mode servi se propose,
 * hybride → serveur compris (#14663), jamais le clair ; le bout en bout se voit, désactivé, avec la raison (le navigateur
 * ne chiffre pas encore, #12975) ; rien ne se propose dans une conversation
 * chiffrée de bout en bout, servie ou vue telle (#12949). Le droit vient de la
 * passerelle (`canToggleEncryption`, rang de groupe compris) : tant qu'elle ne
 * l'a pas servi, rien ne s'affiche.
 *
 * Le changement est OPTIMISTE pour l'affichage seulement : pendant l'attente, la
 * fiche décrit le mode visé (`onShownMode`) et le bouton dit « en cours » ;
 * rien n'annonce le succès avant la réponse. À la réponse, l'optimisme
 * s'efface toujours : le mode confirmé arrive par les caches
 * (`applyEncryptionAnnounced`), qui seuls gouvernent l'envoi.
 */

type Translate = (key: ConversationEncryptionCatalogKey, params?: Readonly<Record<string, string>>) => string;

type Feedback = { readonly kind: 'switched'; readonly mode: CreationEncryptionMode } | { readonly kind: EncryptionSwitchRefusal };


const MUTED = 'var(--color-ios-ink-2)';

export function ConversationEncryptionSwitch({
  locked,
  gesture,
  t,
  onShownMode,
}: {
  readonly locked: boolean;
  readonly gesture: EncryptionModeSwitchGesture;
  readonly t: Translate;
  readonly onShownMode?: ((mode: CreationEncryptionMode | null) => void) | undefined;
}) {
  const headingId = useId();
  const closed = locked;
  const asks = !closed;
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [pending, setPending] = useState<CreationEncryptionMode | null>(null);
  const busy = pending !== null;
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const reread = useCallback(async () => {
    const served = await gesture.readStatus();
    setStatus(served);
  }, [gesture]);

  useEffect(() => {
    if (!asks) return undefined;
    let alive = true;
    void gesture.readStatus().then((served) => {
      if (alive) setStatus(served);
    });
    return () => {
      alive = false;
    };
  }, [asks, gesture]);

  const servedMode = feedback?.kind === 'switched' ? feedback.mode : (status?.mode ?? null);
  const targets =
    status === null || !asks
      ? []
      : encryptionSwitchTargets({
          servedMode,
          sealed: closed || encryptionRegime(status.mode) === 'end-to-end',
          mayToggle: status.canToggleEncryption,
        });
  const staleSwitch = feedback?.kind === 'switched' && closed;
  if (targets.length === 0 && (feedback === null || staleSwitch)) return null;

  const switchTo = async (target: CreationEncryptionMode) => {
    const before = servedMode;
    setPending(target);
    setFeedback(null);
    onShownMode?.(target);
    const outcome = await gesture.switchTo({ servedMode: before, target });
    if (outcome.kind === 'regime-changed') await reread();
    onShownMode?.(null);
    setFeedback(outcome);
    setPending(null);
  };

  const feedbackText =
    feedback === null
      ? ''
      : feedback.kind === 'switched'
        ? t(SWITCH_KEY.done, { mode: t(CREATION_ENCRYPTION_KEY[feedback.mode].title) })
        : t(SWITCH_REFUSAL_KEY[feedback.kind]);
  const endToEndShown = targets.some((target) => target.mode === 'e2ee' && !target.available);

  return (
    <div className="px-4 pb-3" data-conversation-encryption-switch role="group" aria-labelledby={headingId}>
      <h5 id={headingId} className="pb-1 text-caption font-semibold" style={{ color: MUTED }}>
        {t('conversationEncryption.topic.switching')}
      </h5>
      <ul className="flex flex-col gap-2">
        {targets.map((target) => {
          const keys = CREATION_ENCRYPTION_KEY[target.mode];
          const detail = target.unavailability === null ? keys.detail : CREATION_UNAVAILABILITY_KEY[target.unavailability];
          return (
            <li key={target.mode}>
              <button
                type="button"
                disabled={busy || !target.available}
                aria-disabled={busy || !target.available}
                aria-busy={pending === target.mode}
                onClick={() => {
                  if (target.available) void switchTo(target.mode);
                }}
                data-conversation-encryption-switch-target={target.mode}
                className="flex w-full flex-col items-start gap-1 rounded-[14px] px-4 py-3 text-left disabled:opacity-60"
                style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
              >
                <span className="text-body font-semibold">
                  {pending === target.mode ? t(SWITCH_KEY.busy) : t(SWITCH_KEY.to, { mode: t(keys.title) })}
                </span>
                {detail === null ? null : (
                  <span className="text-caption" style={{ color: MUTED }}>
                    {t(detail)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {endToEndShown ? (
        <p className="pt-2 text-caption" style={{ color: MUTED }} data-conversation-encryption-switch-apps-only>
          {t(SWITCH_KEY.endToEndOnApps)}
        </p>
      ) : null}
      <p className="pt-2 text-caption" style={{ color: MUTED }}>
        {t(SWITCH_KEY.footer)}
      </p>
      <p role="status" aria-live="polite" className="pt-2 text-caption font-semibold" data-conversation-encryption-switch-status>
        {feedbackText}
      </p>
    </div>
  );
}
