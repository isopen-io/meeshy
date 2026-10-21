import type { CSSProperties } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import type { Conversation } from '@/lib/api/types';
import { backdropViewOf } from '@/lib/appearance/backdrop-view';
import { appearanceOf } from '@/lib/appearance/read';
import { useAppearanceLive, useBackdropPhoto, useMediaFlag, useScheme, useWallpaperDesign } from '@/lib/appearance/use-backdrop';

import { PackLottieLayer } from './pack-lottie-layer';

/**
 * **LE FOND DU FIL** (#10631, § 8.1) — Signature par défaut (la couche CSS
 * d'origine, `thread-scene.css`, rendue À L'IDENTIQUE quand rien n'est choisi),
 * ou le fond que le lecteur a choisi pour CETTE conversation : un modèle des
 * packs, une couleur unie de la gamme, ou une photo envoyée dans la conversation
 * (voile et flou). Une couche isolée (`contain: strict`) derrière le fil : ni la
 * frappe ni le défilement ne la touchent.
 *
 * CACHE D'ABORD : le choix se lit de la conversation en cache, le dessin d'un
 * modèle `builtin` est embarqué — aucun réseau, aucun spinner. Ce qui n'est pas
 * encore prêt (le dessin chargé à la demande, la photo) laisse voir Signature,
 * puis se fond en 180 ms. Clair/sombre : suit la classe `:root.light`.
 *
 * COUCHE ANIMÉE (#10638) : un modèle qui déclare `lottie` la joue AU-DESSUS du
 * dessin statique (qui reste l'image fixe) quand `animate` est vrai ; sous
 * « Réduire les animations » ou en cas d'échec, le dessin seul reste.
 */
export function ConversationBackdrop({
  conversation,
  accent,
  live = true,
  deps = apiDeps,
}: {
  readonly conversation: Conversation;
  readonly accent: string;
  readonly live?: boolean;
  readonly deps?: ConversationsDeps;
}) {
  const appearance = appearanceOf(conversation);
  const { background } = appearance;
  const scheme = useScheme();
  const reducedTransparency = useMediaFlag('(prefers-reduced-transparency: reduce)');
  const design = useWallpaperDesign(background.kind === 'design' ? { pack: background.pack, design: background.design } : null);
  const photoSrc = useBackdropPhoto({ conversationId: conversation.id, attachmentId: background.kind === 'photo' ? background.attachmentId : null, deps });
  useAppearanceLive(live);

  const view = backdropViewOf({ appearance, scheme, accent, design, photoSrc, reducedTransparency });

  switch (view.kind) {
    case 'signature':
      return <div className="thread-backdrop" aria-hidden />;
    case 'solid':
      return <div className="thread-backdrop" data-appearance="solid" aria-hidden style={{ backgroundImage: 'none', ...view.style }} />;
    case 'design':
      return (
        <div
          className="thread-backdrop"
          data-appearance="design"
          {...(view.flipInRtl ? { 'data-flip-rtl': '' } : {})}
          aria-hidden
          style={{ backgroundImage: 'none', ...view.style }}
        >
          {appearance.animate ? <PackLottieLayer lottie={design?.lottie} /> : null}
        </div>
      );
    case 'photo':
      return (
        <div className="thread-backdrop" data-appearance="photo" aria-hidden>
          <div className="thread-backdrop-photo" style={{ backgroundImage: `url("${view.src.replace(/["\\\n]/g, encodeURIComponent)}")`, filter: view.blur > 0 ? `blur(${view.blur}px)` : 'none' } as CSSProperties} />
          <div className="thread-backdrop-veil" style={{ backgroundColor: `rgba(${view.veilColor}, ${view.veil})` }} />
        </div>
      );
  }
}
