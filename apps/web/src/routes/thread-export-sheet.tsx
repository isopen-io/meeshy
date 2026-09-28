import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { Sheet } from '@/components/sheet';
import type { MessageCardDelivery, MessageCardIntent } from '@/lib/export/deliver-message-card';
import {
  INITIAL_MESSAGE_CARD_FORMAT,
  readDefaultMessageCardFormat,
  sameMessageCardFormat,
  writeDefaultMessageCardFormat,
  type MessageCardFormat,
  type MessageCardToggle,
} from '@/lib/export/message-card-format';
import type { MessageCardInput } from '@/lib/export/message-card-layout';
import { messageCardFileName, type MessageCardSubject } from '@/lib/export/message-card-subject';
import {
  CARD_LINKS,
  CARD_PALETTES,
  CARD_PALETTE_IDS,
  CARD_TYPEFACE_IDS,
  randomTemplateId,
  templateIdOf,
  templateOf,
  type CardLinkId,
  type CardTypefaceId,
  type MessageCardTemplateId,
} from '@/lib/export/message-card-templates';
import { popularTemplates, readTemplateUsage, recordTemplateUse } from '@/lib/export/message-card-usage';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';
import { spokenLanguageName } from '@/lib/view/language-name';
import { ActionButton } from '@/routes/link-page-parts';

/**
 * **EXPORTER UN MESSAGE EN IMAGE — UN COMPOSER SIMPLIFIÉ.** La feuille ne
 * crée aucun contenu : elle choisit comment MONTRER ce qui existe (le
 * template, le titre de la conversation, les noms des auteurs ou leur
 * anonymat, la date), montre la carte telle qu'elle partira, et l'enregistre.
 *
 * DES CENTAINES DE TEMPLATES (`message-card-templates.ts`) se choisissent
 * par leurs trois dimensions — couleurs, typographie, liaison — ou d'un geste :
 * les « Populaires » (les plus enregistrés sur l'appareil, puis la vitrine) et
 * « Au hasard ». Chaque carte enregistrée compte pour son template.
 *
 * APRÈS LE FORMAT, LA LANGUE : la carte part par défaut telle que le lecteur
 * la lit ; il peut choisir l'original ou une traduction servie du message.
 *
 * DEUX GESTES À LA FIN : « Sauvegarder » (la galerie d'abord) et
 * « Partager » (toujours la feuille du système, où l'utilisateur décide).
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

const TYPEFACE_LABEL = {
  rond: 'export.card.typeface.rond',
  didone: 'export.card.typeface.didone',
  plume: 'export.card.typeface.plume',
  affiche: 'export.card.typeface.affiche',
  futur: 'export.card.typeface.futur',
  machine: 'export.card.typeface.machine',
  marqueur: 'export.card.typeface.marqueur',
  systeme: 'export.card.typeface.systeme',
} as const satisfies Readonly<Record<CardTypefaceId, InterfaceCatalogKey>>;

const LINK_LABEL = {
  orbite: 'export.card.link.orbite',
  filet: 'export.card.link.filet',
  guillemets: 'export.card.link.guillemets',
  fleche: 'export.card.link.fleche',
  bulles: 'export.card.link.bulles',
  fil: 'export.card.link.fil',
  silence: 'export.card.link.silence',
} as const satisfies Readonly<Record<CardLinkId, InterfaceCatalogKey>>;

const POPULAR_COUNT = 6;

const DELIVERY_ANNOUNCE = {
  gallery: 'export.announce.gallery',
  shared: 'export.announce.shared',
  cancelled: 'export.announce.cancelled',
  expired: 'export.announce.expired',
  unavailable: 'export.announce.unavailable',
} as const satisfies Readonly<Record<MessageCardDelivery, InterfaceCatalogKey>>;

const OPTION_LABEL = {
  showConversationTitle: 'export.card.option.title',
  showAuthors: 'export.card.option.authors',
  showDate: 'export.card.option.date',
  anonymizeQuoted: 'export.card.option.anonymizeQuoted',
  anonymizeReply: 'export.card.option.anonymizeReply',
} as const satisfies Readonly<Record<MessageCardToggle, InterfaceCatalogKey>>;

type Rendered = { readonly key: string; readonly blob: Blob; readonly url: string; readonly truncated: boolean };

type Painter = (input: MessageCardInput) => Promise<{ readonly blob: Blob; readonly truncated: boolean } | null>;

const defaultPainter: Painter = async (input) => (await import('@/lib/export/message-card-paint')).renderMessageCard(input);

/* La livraison (galerie, partage, téléchargement) est un `import()` au premier
   « Enregistrer », comme pour une pièce jointe : `budgets.json › story_export`
   interdit qu'un écran l'importe statiquement. */
const defaultDeliver = async (blob: Blob, fileName: string, intent: MessageCardIntent): Promise<MessageCardDelivery> =>
  (await import('@/lib/export/deliver-message-card')).deliverMessageCard(blob, fileName, intent);

/**
 * La carte telle que le format la demande — un titre absent ou vide n'est
 * jamais « affiché », et un auteur anonymisé cède son nom à `anonymousLabel`.
 * Le filigrane, lui, garde toujours le pseudo de qui exporte.
 */
export function messageCardInputOf(params: {
  readonly subject: MessageCardSubject;
  readonly format: MessageCardFormat;
  readonly handle: string | null;
  readonly conversationTitle: string | null;
  readonly anonymousLabel: string;
  readonly formatDate: (date: Date) => string;
}): MessageCardInput {
  const { subject, format } = params;
  const quoted = subject.quoted;
  return {
    quoted: quoted === null || !format.anonymizeQuoted ? quoted : { ...quoted, author: params.anonymousLabel },
    reply: format.anonymizeReply ? { ...subject.reply, author: params.anonymousLabel } : subject.reply,
    handle: params.handle,
    template: format.template,
    title: format.showConversationTitle ? params.conversationTitle : null,
    date: format.showDate ? params.formatDate(subject.sentAt) : null,
    showAuthors: format.showAuthors,
  };
}

const templateLabel = (language: InterfaceLanguage, id: MessageCardTemplateId): string => {
  const template = templateOf(id);
  return `${template.palette.name} · ${translate(language, TYPEFACE_LABEL[template.typefaceId])} · ${translate(language, LINK_LABEL[template.link])}`;
};

const formatKey = (format: MessageCardFormat): string => JSON.stringify(format);

function Chip({
  pressed,
  onClick,
  data,
  children,
  swatch,
}: {
  readonly pressed: boolean;
  readonly onClick: () => void;
  readonly data: Readonly<Record<`data-${string}`, string>>;
  readonly children: string;
  /** Une pastille de la palette, devant le libellé. */
  readonly swatch?: string;
}) {
  return (
    <button
      {...data}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-2 rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 44,
        color: pressed ? 'white' : 'var(--color-ios-ink)',
        backgroundColor: pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-ios-surface)',
        border: `1px solid ${pressed ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-edge)'}`,
        outlineColor: 'var(--accent, var(--color-ios-brand))',
      }}
    >
      {swatch === undefined ? null : (
        <span aria-hidden="true" className="inline-block shrink-0 rounded-full" style={{ width: 16, height: 16, background: swatch, border: '1px solid var(--color-edge)' }} />
      )}
      {children}
    </button>
  );
}

function ChipRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-2">
      <p className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}

const swatchOf = (palette: (typeof CARD_PALETTES)[keyof typeof CARD_PALETTES]): string =>
  `linear-gradient(135deg, ${palette.background.map(([offset, color]) => `${color} ${Math.round(offset * 100)}%`).join(', ')})`;

export type MessageExportLanguages = {
  /** Les langues dans lesquelles la réponse existe — l'original d'abord. */
  readonly codes: readonly string[];
  readonly subjectIn: (language: string) => MessageCardSubject | null;
};

export function MessageExportSheet({
  subject: asRead,
  exportLanguages = { codes: [], subjectIn: () => null },
  handle,
  conversationTitle,
  quick = false,
  onClose,
  announce,
  storage = safeLocalStorage(),
  paint = defaultPainter,
  deliver = defaultDeliver,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  random = Math.random,
}: {
  /** La carte telle que le lecteur la lit. */
  readonly subject: MessageCardSubject;
  readonly exportLanguages?: MessageExportLanguages;
  /** Le pseudo de qui exporte — il signe le filigrane, anonymat ou pas. */
  readonly handle: string | null;
  /** Le titre de la conversation — `null` quand elle n'en a pas : l'option ne s'offre alors pas. */
  readonly conversationTitle: string | null;
  /** « Export rapide » : le format par défaut, enregistré dès que la carte est peinte. */
  readonly quick?: boolean;
  readonly onClose: () => void;
  readonly announce: (message: string) => void;
  readonly storage?: SafeStorage;
  readonly paint?: Painter;
  readonly deliver?: (blob: Blob, fileName: string, intent: MessageCardIntent) => Promise<MessageCardDelivery>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly random?: () => number;
}) {
  const language = currentInterfaceLanguage();
  const [savedDefault, setSavedDefault] = useState<MessageCardFormat | null>(() => readDefaultMessageCardFormat(storage));
  const [format, setFormat] = useState<MessageCardFormat>(() => savedDefault ?? INITIAL_MESSAGE_CARD_FORMAT);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportLanguage, setExportLanguage] = useState<string | null>(null);
  const subject = useMemo(
    () => (exportLanguage === null ? asRead : (exportLanguages.subjectIn(exportLanguage) ?? asRead)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asRead, exportLanguage],
  );
  const quickSent = useRef(false);
  const [popular] = useState(() => popularTemplates(readTemplateUsage(storage), POPULAR_COUNT));
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
      handle,
      conversationTitle: title,
      anonymousLabel: translate(language, 'export.card.anonymous'),
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
  }, [key, subject, handle, title]);

  const ready = rendered !== null && rendered.key === key;

  const send = async (intent: MessageCardIntent) => {
    if (!ready || saving) return;
    setSaving(true);
    const outcome = await deliver(rendered.blob, messageCardFileName(new Date()), intent).catch((): MessageCardDelivery => 'unavailable');
    setSaving(false);
    announce(translate(language, DELIVERY_ANNOUNCE[outcome]));
    if (outcome !== 'gallery' && outcome !== 'shared') return;
    recordTemplateUse(storage, format.template);
    onClose();
  };

  useEffect(() => {
    if (!quick || !ready || quickSent.current) return;
    quickSent.current = true;
    void send('save');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quick, ready]);

  const toggle = (option: MessageCardToggle) => setFormat((current) => ({ ...current, [option]: !current[option] }));
  const pick = (template: MessageCardTemplateId) => setFormat((current) => ({ ...current, template }));
  const current = templateOf(format.template);
  const pickPart = (part: { readonly palette?: typeof current.paletteId; readonly typeface?: CardTypefaceId; readonly link?: CardLinkId }) =>
    pick(templateIdOf({ palette: part.palette ?? current.paletteId, typeface: part.typeface ?? current.typefaceId, link: part.link ?? current.link }));

  const isDefault = sameMessageCardFormat(format, savedDefault);
  const useAsDefault = () => {
    writeDefaultMessageCardFormat(storage, format);
    setSavedDefault(format);
    announce(translate(language, 'export.announce.defaultSaved'));
  };

  /* L'anonymat n'a de sens que pour un nom PEINT — et celui du message cité, que s'il y en a un. */
  const options: readonly MessageCardToggle[] = [
    ...(title === null ? [] : (['showConversationTitle'] as const)),
    'showAuthors',
    'showDate',
    ...(format.showAuthors && subject.quoted !== null ? (['anonymizeQuoted'] as const) : []),
    ...(format.showAuthors ? (['anonymizeReply'] as const) : []),
  ];

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
              data-export-preview={format.template}
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

        <ChipRow label={translate(language, 'export.card.popular')}>
          <Chip pressed={false} onClick={() => pick(randomTemplateId(random))} data={{ 'data-export-random': '' }}>
            {translate(language, 'export.card.random')}
          </Chip>
          {popular.map((id) => (
            <Chip key={id} pressed={id === format.template} onClick={() => pick(id)} data={{ 'data-export-template': id }} swatch={swatchOf(templateOf(id).palette)}>
              {templateLabel(language, id)}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label={translate(language, 'export.card.palette')}>
          {CARD_PALETTE_IDS.map((palette) => (
            <Chip key={palette} pressed={palette === current.paletteId} onClick={() => pickPart({ palette })} data={{ 'data-export-palette': palette }} swatch={swatchOf(CARD_PALETTES[palette])}>
              {CARD_PALETTES[palette].name}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label={translate(language, 'export.card.typeface')}>
          {CARD_TYPEFACE_IDS.map((typeface) => (
            <Chip key={typeface} pressed={typeface === current.typefaceId} onClick={() => pickPart({ typeface })} data={{ 'data-export-typeface': typeface }}>
              {translate(language, TYPEFACE_LABEL[typeface])}
            </Chip>
          ))}
        </ChipRow>

        <ChipRow label={translate(language, 'export.card.link')}>
          {CARD_LINKS.map((link) => (
            <Chip key={link} pressed={link === current.link} onClick={() => pickPart({ link })} data={{ 'data-export-link': link }}>
              {translate(language, LINK_LABEL[link])}
            </Chip>
          ))}
        </ChipRow>

        <div role="group" aria-label={translate(language, 'export.card.options')} className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip key={option} pressed={format[option]} onClick={() => toggle(option)} data={{ 'data-export-option': option }}>
              {translate(language, OPTION_LABEL[option])}
            </Chip>
          ))}
        </div>

        {exportLanguages.codes.length > 1 ? (
          <ChipRow label={translate(language, 'export.card.language')}>
            <Chip pressed={exportLanguage === null} onClick={() => setExportLanguage(null)} data={{ 'data-export-language': '' }}>
              {translate(language, 'export.card.language.asRead')}
            </Chip>
            {exportLanguages.codes.map((code) => (
              <Chip key={code} pressed={code === exportLanguage} onClick={() => setExportLanguage(code)} data={{ 'data-export-language': code }}>
                {spokenLanguageName(code)}
              </Chip>
            ))}
          </ChipRow>
        ) : null}

        <div className="grid gap-2 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <ActionButton disabled={!ready || saving} onClick={() => void send('save')} data={{ 'data-export-save': '' }}>
              {translate(language, 'export.card.save')}
            </ActionButton>
            <ActionButton disabled={!ready || saving} onClick={() => void send('share')} data={{ 'data-export-share': '' }}>
              {translate(language, 'export.card.share')}
            </ActionButton>
          </div>
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
