import { useEffect, useState } from 'react';

import { Sheet } from '@/components/sheet';
import type { MessageCardDelivery } from '@/lib/export/deliver-message-card';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { messageCardFileName, type MessageCardSubject } from '@/lib/export/message-card-subject';
import { MESSAGE_CARD_STYLE_IDS, type MessageCardStyleId } from '@/lib/export/message-card-style-ids';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **EXPORTER UN MESSAGE EN IMAGE** — la feuille qui montre la carte, laisse
 * choisir son style et l'enregistre. Deux gestes au cas nominal : « Exporter
 * en image » dans le menu, puis « Enregistrer l'image » — le style par défaut
 * est déjà une carte finie.
 *
 * Le peintre (`message-card-paint.ts`) et les polices qu'il réveille sont
 * chargés À LA DEMANDE, à l'ouverture de cette feuille : le fil n'en paie rien.
 */

const STYLE_LABEL = {
  aurore: 'export.card.style.aurore',
  editorial: 'export.card.style.editorial',
  manuscrit: 'export.card.style.manuscrit',
} as const satisfies Readonly<Record<MessageCardStyleId, InterfaceCatalogKey>>;

const DELIVERY_ANNOUNCE = {
  gallery: 'export.announce.gallery',
  shared: 'export.announce.shared',
  cancelled: 'export.announce.cancelled',
  expired: 'export.announce.expired',
  unavailable: 'export.announce.unavailable',
} as const satisfies Readonly<Record<MessageCardDelivery, InterfaceCatalogKey>>;

type Rendered = { readonly style: MessageCardStyleId; readonly blob: Blob; readonly url: string; readonly truncated: boolean };

type Painter = (input: MessageCardInput) => Promise<{ readonly blob: Blob; readonly truncated: boolean } | null>;

const defaultPainter: Painter = async (input) => (await import('@/lib/export/message-card-paint')).renderMessageCard(input);

/* La livraison (galerie, partage, téléchargement) est un `import()` au premier
   « Enregistrer », comme pour une pièce jointe : `budgets.json › story_export`
   interdit qu'un écran l'importe statiquement. */
const defaultDeliver = async (blob: Blob, fileName: string): Promise<MessageCardDelivery> =>
  (await import('@/lib/export/deliver-message-card')).deliverMessageCard(blob, fileName);

export function MessageExportSheet({
  subject,
  exporter,
  onClose,
  announce,
  paint = defaultPainter,
  deliver = defaultDeliver,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}: {
  readonly subject: MessageCardSubject;
  readonly exporter: string;
  readonly onClose: () => void;
  readonly announce: (message: string) => void;
  readonly paint?: Painter;
  readonly deliver?: (blob: Blob, fileName: string) => Promise<MessageCardDelivery>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
}) {
  const language = currentInterfaceLanguage();
  const [style, setStyle] = useState<MessageCardStyleId>(MESSAGE_CARD_STYLE_IDS[0]);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Les portes sont PRÉCHARGÉES pendant que la carte se peint : sur iOS, le
     partage exige l'activation du geste, qu'une attente réseau après le tap
     ferait expirer. */
  useEffect(() => {
    void import('@/lib/export/deliver-message-card').catch(() => undefined);
    void import('@/lib/media/deliver-file').catch(() => undefined);
  }, []);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setFailed(false);
    void paint({ ...subject, exporter, footerLabel: translate(language, 'export.card.footer', { name: exporter }), style })
      .catch(() => null)
      .then((card) => {
        if (!live) return;
        if (card === null) {
          setFailed(true);
          return;
        }
        url = createObjectURL(card.blob);
        setRendered({ style, blob: card.blob, url, truncated: card.truncated });
      });
    return () => {
      live = false;
      if (url !== null) revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style, subject, exporter]);

  const ready = rendered !== null && rendered.style === style;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    const outcome = await deliver(rendered.blob, messageCardFileName(new Date())).catch((): MessageCardDelivery => 'unavailable');
    setSaving(false);
    announce(translate(language, DELIVERY_ANNOUNCE[outcome]));
    if (outcome === 'gallery' || outcome === 'shared') onClose();
  };

  return (
    <Sheet title={translate(language, 'export.card.title')} presentation="centered" bodyAs="div" onClose={onClose}>
      <div className="grid gap-4 px-4 pb-6">
        <div
          className="grid place-items-center overflow-hidden rounded-card"
          style={{ minHeight: 240, backgroundColor: 'var(--color-ios-surface)' }}
          aria-live="polite"
          aria-busy={!ready && !failed}
        >
          {failed ? (
            <p className="px-4 py-6 text-center text-caption" style={{ color: 'var(--color-danger)' }} data-export-failed="">
              {translate(language, 'export.announce.failed')}
            </p>
          ) : ready ? (
            <img
              src={rendered.url}
              alt={translate(language, 'export.card.preview')}
              data-export-preview={rendered.style}
              className="block w-full"
              style={{ maxHeight: '55vh', objectFit: 'contain' }}
            />
          ) : (
            <p className="px-4 py-6 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'export.card.rendering')}
            </p>
          )}
        </div>

        {ready && rendered.truncated ? (
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'export.card.truncated')}
          </p>
        ) : null}

        <div role="group" aria-label={translate(language, 'export.card.styles')} className="flex gap-2 overflow-x-auto">
          {MESSAGE_CARD_STYLE_IDS.map((candidate) => {
            const pressed = candidate === style;
            return (
              <button
                key={candidate}
                type="button"
                aria-pressed={pressed}
                data-export-style={candidate}
                onClick={() => setStyle(candidate)}
                className="shrink-0 rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  minHeight: 44,
                  color: pressed ? 'white' : 'var(--color-ios-ink)',
                  backgroundColor: pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-ios-surface)',
                  border: `1px solid ${pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-edge)'}`,
                  outlineColor: 'var(--accent, var(--color-ios-brand))',
                }}
              >
                {translate(language, STYLE_LABEL[candidate])}
              </button>
            );
          })}
        </div>

        <div className="grid gap-2 pt-2">
          <ActionButton disabled={!ready || saving} onClick={() => void save()} data={{ 'data-export-save': '' }}>
            {translate(language, 'export.card.save')}
          </ActionButton>
          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}
