import { useEffect, useRef, useState } from 'react';

import { apiDeps } from '@/lib/api/deps';
import type { ApiResult } from '@/lib/api/http';
import type { ReachFailure } from '@/lib/api/link-failure';
import { recordTrackingClick, resolveTrackingLink } from '@/lib/api/tracking-links';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { browserClickEnvironment, collectClickContext, type ClickContext } from '@/lib/links/click-context';
import { decideTrackingRedirect, isTrackingToken, type TrackingClick, type TrackingResolution } from '@/lib/links/tracking-redirect';
import { useParams } from '@/lib/router';
import { href, navigate } from '@/routes/route-table';

import { LinkPage, ReachFailurePage } from './link-page-parts';

/**
 * **`/l/:token` — UN LIEN SUIVI S'OUVRE** (#6714). L'adresse que la passerelle
 * range dans chaque lien suivi (`TrackingLinkService.buildTrackingUrl`) et que
 * les messages, les publications et Android partagent déjà.
 *
 * Au montage, comme la page legacy (`apps/web/app/l/[token]/page.tsx`) : le
 * clic est COMPTÉ et la cible RÉSOLUE en parallèle, puis
 * `decideTrackingRedirect` tranche :
 *
 * - une adresse web → `location.replace` : le lien ne reste pas dans
 *   l'historique, et « retour » ne recompte pas le clic ;
 * - une invitation de conversation → la jonction de la v2 (`/chat/:link`) ;
 * - un lien mort, ou une cible qui n'est pas une adresse web → `/l/:token/expired` ;
 * - une passerelle muette ou hors ligne → un état sur place, avec « Réessayer ».
 *
 * **Compter au montage est voulu** : l'effet de ce lien EST l'ouverture de la
 * cible, et c'est ce que la passerelle mesure. Rien d'irréversible ne s'y
 * joue, contrairement aux liens d'e-mail de compte qui attendent un clic.
 *
 * **L'ouverture de l'application native n'est pas tentée.** Le legacy essayait
 * `meeshy://` puis retombait sur le web après 1,5 s ; la v2 laisse ce rôle aux
 * liens universels (le fichier d'association sert `/l/`), et un schéma
 * propriétaire tenté à l'aveugle affiche une erreur dans les navigateurs où
 * l'application n'est pas installée.
 */

export type TrackingLinkDeps = {
  readonly record: (token: string, context: ClickContext) => Promise<ApiResult<TrackingClick>>;
  readonly resolve: (token: string) => Promise<ApiResult<TrackingResolution>>;
  readonly context: () => ClickContext;
  readonly leave: (target: string) => void;
  readonly go: (url: string, replace?: boolean) => void;
};

const BROWSER_DEPS: TrackingLinkDeps = {
  record: (token, context) => recordTrackingClick(apiDeps, token, context),
  resolve: (token) => resolveTrackingLink(apiDeps, token),
  context: () => collectClickContext(browserClickEnvironment()),
  leave: (target) => window.location.replace(target),
  go: navigate,
};

type Phase = 'opening' | ReachFailure;

export function TrackingLinkRedirect({
  token,
  language,
  deps,
}: {
  readonly token: string;
  readonly language: InterfaceLanguage;
  readonly deps: TrackingLinkDeps;
}) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>('opening');
  const started = useRef<string | null>(null);

  useEffect(() => {
    const run = `${token}#${attempt}`;
    if (started.current === run) return;
    started.current = run;
    void follow();

    async function follow() {
      const expired = href('trackingLinkExpired', { token });
      if (!isTrackingToken(token)) {
        deps.go(expired, true);
        return;
      }
      const [click, resolution] = await Promise.all([deps.record(token, deps.context()), deps.resolve(token)]);
      const outcome = decideTrackingRedirect({ token, click, resolution });
      if (outcome.kind === 'leave') {
        deps.leave(outcome.target);
        return;
      }
      if (outcome.kind === 'join') {
        deps.go(href('chatJoin', { link: outcome.linkId }), true);
        return;
      }
      if (outcome.kind === 'dead') {
        deps.go(expired, true);
        return;
      }
      setPhase(outcome.kind);
    }
  }, [token, attempt]);

  const retry = () => {
    setPhase('opening');
    setAttempt((count) => count + 1);
  };

  if (phase !== 'opening') return <ReachFailurePage language={language} failure={phase} onRetry={retry} />;
  return <LinkPage glyph="linkSimple" tone="brand" title={translate(language, 'trackingLink.opening')} busy />;
}

export default function TrackingLinkScreen() {
  const { token } = useParams<'/l/$token'>();
  return <TrackingLinkRedirect token={token} language={currentInterfaceLanguage()} deps={BROWSER_DEPS} />;
}
