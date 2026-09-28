import { useEffect, useRef, useState } from 'react';

import { Sheet } from '@/components/sheet';
import type { MessageCardDelivery } from '@/lib/export/deliver-message-card';
import {
  INITIAL_MESSAGE_CARD_FORMAT,
  readDefaultMessageCardFormat,
  sameMessageCardFormat,
  writeDefaultMessageCardFormat,
  type MessageCardFormat,
} from '@/lib/export/message-card-format';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { MESSAGE_CARD_STYLE_IDS, type MessageCardStyleId } from '@/lib/export/message-card-style-ids';
import { messageCardFileName, type MessageCardSubject } from '@/lib/export/message-card-subject';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **EXPORTER UN MESSAGE EN IMAGE — UN COMPOSER SIMPLIFIÉ.** La feuille ne
 * crée aucun contenu : elle choisit comment MONTRER ce qui existe (le style,
 * le titre de la conversation, les noms des auteurs, la date), montre la
 * carte telle qu'elle partira, et l'enregistre.
 *
 * LE FORMAT PAR DÉFAUT (`message-card-format.ts`) ouvre la feuille déjà
 * réglée, et « Utiliser comme format par défaut » le remplace. L'« Export
 * rapide » du menu monte cette même feuille en mode `quick` : la carte, peinte
 * dans le format par défaut, part dès qu'elle est prête — la feuille n'est
 * alors qu'un retour visuel, et reste ouverte si l'enregistrement demande un
 * nouveau geste (feuille de partage annulée, activation expirée).
 *
 * Le peintre et les polices qu'il réveille, comme les portes de livraison,
 * sont chargés À LA DEMANDE : le fil n'en paie rien.
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

type Option = 'showConversationTitle' | 'showAuthors' | 'showDate';

const OPTION_LABEL = {
  showConversationTitle: 'export.card.option.title',
  showAuthors: 'export.card.option.authors',
  showDate: 'export.card.option.date',
} as const satisfies Readonly<Record<Option, InterfaceCatalogKey>>;

type Rendered = { readonly key: string; readonly blob: Blob; readonly url: string; readonly truncated: boolean };

type Painter = (input: MessageCardInput) => Promise<{ readonly blob: Blob; readonly truncated: boolean } | null>;

const defaultPainter: Painter = async (input) => (await import('@/lib/export/message-card-paint')).renderMessageCard(input);

/* La livraison (galerie, partage, téléchargement) est un `import()` au premier
   « Enregistrer », comme pour une pièce jointe : `budgets.json › story_export`
   interdit qu'un écran l'importe statiquement. */
const defaultDeliver = async (blob: Blob, fileName: string): Promise<MessageCardDelivery> =>
  (await import('@/lib/export/deliver-message-card')).deliverMessageCard(blob, fileName);

/** La carte telle que le format la demande — un titre absent ou vide n'est jamais « affiché ». */
export function messageCardInputOf(params: {
  readonly subject: MessageCardSubject;
  readonly format: MessageCardFormat;
  readonly exporter: string;
  readonly conversationTitle: string | null;
  readonly footerLabel: string;
  readonly formatDate: (date: Date) => string;
}): MessageCardInput {
  const { subject, format } = params;
  return {
    quoted: subject.quoted,
    reply: subject.reply,
    exporter: params.exporter,
    footerLabel: params.footerLabel,
    style: format.style,
    title: format.showConversationTitle ? params.conversationTitle : null,
    date: format.showDate ? params.formatDate(subject.sentAt) : null,
    showAuthors: format.showAuthors,
  };
}

const formatKey = (format: MessageCardFormat): string => JSON.stringify(format);

function Chip({
  pressed,
  onClick,
  data,
  children,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly children: string;
}) {
  return (
    <button
      {...data}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="shrink-0 rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        color: pressed ? 'white' : 'var(--color-ios-ink)',
        backgroundColor: pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-ios-surface)',
        border: `1px solid ${pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-edge)'}`,
        outlineColor: 'var(--accent, var(--color-ios-brand))',
      }}
    >
      {children}
    </button>
  );
}

export function MessageExportSheet({
  subject,
  exporter,
  conversationTitle,
  quick = false,
  onClose,
  announce,
  storage = safeLocalStorage(),
  paint = defaultPainter,
  deliver = defaultDeliver,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
}: {
  readonly subject: MessageCardSubject;
  readonly exporter: string;
  /** Le titre de la conversation — `null` quand elle n'en a pas : l'option ne s'offre alors pas. */
  readonly conversationTitle: string | null;
  /** « Export rapide » : le format par défaut, enregistré dès que la carte est peinte. */
  readonly quick?: boolean;
  readonly onClose: () => void;
  readonly announce: (message: string) => void;
  readonly storage?: SafeStorage;
  readonly paint?: Painter;
  readonly deliver?: (blob: Blob, fileName: string) => Promise<MessageCardDelivery>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
}) {
  const language = currentInterfaceLanguage();
  const [savedDefault, setSavedDefault] = useState<MessageCardFormat | null>(() => readDefaultMessageCardFormat(storage));
  const [format, setFormat] = useState<MessageCardFormat>(() => savedDefault ?? INITIAL_MESSAGE_CARD_FORMAT);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const quickSent = useRef(false);
  const title = conversationTitle !== null && conversationTitle.trim() !== '' ? conversationTitle.trim() : null;

  /* Les portes sont PRÉCHARGÉES pendant que la carte se peint : sur iOS, le
     partage exige l'activation du geste, qu'une attente réseau après le tap
     ferait expirer. */
  useEffect(() => {
    void import('@/lib/export/deliver-message-card').catch(() => undefined);
    void import('@/lib/media/deliver-file').catch(() => undefined);
  }, []);

  const key = formatKey(format);

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setFailed(false);
    const input = messageCardInputOf({
      subject,
      format,
      exporter,
      conversationTitle: title,
      footerLabel: translate(language, 'export.card.footer', { name: exporter }),
      formatDate: (date) => new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date),
    });
    void paint(input)
      .catch(() => null)
      .then((card) => {
        if (!live) return;
        if (card === null) {
          setFailed(true);
          return;
        }
        url = createObjectURL(card.blob);
        setRendered({ key, blob: card.blob, url, truncated: card.truncated });
      });
    return () => {
      live = false;
      if (url !== null) revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, subject, exporter, title]);

  const ready = rendered !== null && rendered.key === key;

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    const outcome = await deliver(rendered.blob, messageCardFileName(new Date())).catch((): MessageCardDelivery => 'unavailable');
    setSaving(false);
    announce(translate(language, DELIVERY_ANNOUNCE[outcome]));
    if (outcome === 'gallery' || outcome === 'shared') onClose();
  };

  useEffect(() => {
    if (!quick || !ready || quickSent.current) return;
    quickSent.current = true;
    void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, ready]);

  const toggle = (option: Option) => setFormat((current) => ({ ...current, [option]: !current[option] }));

  const isDefault = sameMessageCardFormat(format, savedDefault);
  const useAsDefault = () => {
    writeDefaultMessageCardFormat(storage, format);
    setSavedDefault(format);
    announce(translate(language, 'export.announce.defaultSaved'));
  };

  const options: readonly Option[] = title === null ? ['showAuthors', 'showDate'] : ['showConversationTitle', 'showAuthors', 'showDate'];

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
              data-export-preview={format.style}
              className="block w-full"
              style={{ maxHeight: '50vh', objectFit: 'contain' }}
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
          {MESSAGE_CARD_STYLE_IDS.map((candidate) => (
            <Chip
              key={candidate}
              pressed={candidate === format.style}
              onClick={() => setFormat((current) => ({ ...current, style: candidate }))}
              data={{ 'data-export-style': candidate }}
            >
              {translate(language, STYLE_LABEL[candidate])}
            </Chip>
          ))}
        </div>

        <div role="group" aria-label={translate(language, 'export.card.options')} className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip key={option} pressed={format[option]} onClick={() => toggle(option)} data={{ 'data-export-option': option }}>
              {translate(language, OPTION_LABEL[option])}
            </Chip>
          ))}
        </div>

        <div className="grid gap-2 pt-2">
          <ActionButton disabled={!ready || saving} onClick={() => void save()} data={{ 'data-export-save': '' }}>
            {translate(language, 'export.card.save')}
          </ActionButton>
          <ActionButton tone="secondary" disabled={isDefault} onClick={useAsDefault} data={{ 'data-export-default': '' }}>
            {translate(language, isDefault ? 'export.card.default.current' : 'export.card.default.save')}
          </ActionButton>
          <ActionButton tone="secondary" onClick={onClose}>
            {translate(language, 'common.cancel')}
          </ActionButton>
        </div>
      </div>
    </Sheet>
  );
}
