import { useEffect, useMemo, useRef, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { EXPORT_CARD_GLYPHS } from '@/components/glyphs-export-card';
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
import type { CardPart, CardRegion, MessageCardInput, MessageCardPart } from '@/lib/export/message-card-layout';
import { cardOutputsOf, extensionOfType, type CardOutput } from '@/lib/export/message-card-output';
import type { CardSource } from '@/lib/export/message-card-paint';
import { messageCardFileName, type MessageCardSubject, type MessageCardSubjectPart } from '@/lib/export/message-card-subject';
import { randomTemplateId, templateIdOf, templateOf, type CardLinkId, type CardPaletteId, type CardTypefaceId, type MessageCardTemplateId } from '@/lib/export/message-card-templates';
import { createThumbnailCache } from '@/lib/export/message-card-thumbnails';
import { popularTemplates, readTemplateUsage, recordTemplateUse } from '@/lib/export/message-card-usage';
import { translateExportCard, type ExportCardCatalogKey } from '@/lib/i18n-export-card-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

import type { FrameChoice } from './thread-export-frame';
import { ExportGallery } from './thread-export-gallery';
import { OutputPicker, defaultMotionRecorder, defaultSourcesLoader, temporalItemOf, useCardSources, useMotionCache, type MotionRecorder, type SourcesLoader } from './thread-export-output';
import type { ThumbSource } from './thread-export-thumb';
import { ExportTray, TAB_OF_PART, type ExportTab } from './thread-export-tray';

/**
 * **« IMAGINE » — IMAGER UN MESSAGE OU UN COMMENTAIRE, UN COMPOSER QUI SE
 * TOUCHE** (#8667, #8693). La feuille ne crée aucun contenu : elle choisit
 * comment MONTRER ce qui existe (le template, le format, le cadre, le titre de
 * la conversation, les noms des auteurs, leur pseudo ou leur anonymat, la date
 * et les heures, les médias), montre la carte telle qu'elle partira, et
 * l'enregistre — en image, ou en GIF / vidéo quand le contenu est temporel.
 *
 * L'APERÇU EST LE CONTRÔLE. Chaque partie peinte (en-tête, citation, liaison,
 * réponse) est une zone qu'on touche, le fond aussi : le plateau en verre
 * (`thread-export-tray.tsx`) ouvre alors le seul réglage de cette partie —
 * jamais la longue liste de toutes les dimensions à la fois. La citation et la
 * réponse y portent leur propre anonymat.
 *
 * DES CENTAINES DE TEMPLATES se choisissent par leurs trois dimensions, ou
 * dans la GALERIE (`thread-export-gallery.tsx`) : toutes les cartes, peintes
 * sur CE message, cherchables, les plus utilisées d'abord. « Au hasard » et
 * « Format par défaut » vivent dans l'en-tête ; « Sauvegarder » et
 * « Partager » en bas, toujours visibles. APRÈS LE FORMAT, LA LANGUE : son
 * onglet n'apparaît que si le message existe dans plusieurs.
 *
 * LE FORMAT PAR DÉFAUT (`message-card-format.ts`) ouvre la feuille déjà
 * réglée. L'« Export rapide » du menu monte cette même feuille en mode
 * `quick` : la carte, peinte dans le format par défaut, part dès qu'elle est
 * prête — la feuille n'est alors qu'un retour visuel, et reste ouverte si
 * l'enregistrement demande un nouveau geste.
 *
 * Le peintre et les polices qu'il réveille, comme les portes de livraison,
 * sont chargés À LA DEMANDE : le fil n'en paie rien.
 */

const POPULAR_COUNT = 6;

/** La largeur d'une vignette peinte : deux fois sa plus grande largeur affichée, pour un écran dense. */
const THUMB_WIDTH = 240;

const DELIVERY_ANNOUNCE = {
  gallery: 'export.announce.gallery',
  shared: 'export.announce.shared',
  cancelled: 'export.announce.cancelled',
  expired: 'export.announce.expired',
  unavailable: 'export.announce.unavailable',
} as const satisfies Readonly<Record<MessageCardDelivery, ExportCardCatalogKey>>;

/** Un GIF ou une vidéo n'est pas « une image » : ses deux issues heureuses le disent autrement. */
const MOTION_ANNOUNCE = { ...DELIVERY_ANNOUNCE, gallery: 'export.announce.galleryMotion', shared: 'export.announce.sharedMotion' } as const satisfies Readonly<
  Record<MessageCardDelivery, ExportCardCatalogKey>
>;

const PART_LABEL = {
  header: 'export.card.part.header',
  quote: 'export.card.part.quote',
  link: 'export.card.part.link',
  reply: 'export.card.part.reply',
  media: 'export.card.part.media',
  background: 'export.card.part.background',
} as const satisfies Readonly<Record<CardPart, ExportCardCatalogKey>>;

type Rendered = {
  readonly key: string;
  readonly blob: Blob;
  readonly url: string;
  readonly truncated: boolean;
  readonly width: number;
  readonly height: number;
  readonly regions: readonly CardRegion[];
};

type Painted = {
  readonly blob: Blob;
  readonly truncated: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly regions?: readonly CardRegion[];
};

type Painter = (input: MessageCardInput, sources: readonly (CardSource | null)[]) => Promise<Painted | null>;
type Thumbnailer = (input: MessageCardInput, width: number, sources: readonly (CardSource | null)[]) => Promise<Blob | null>;

const defaultPainter: Painter = async (input, sources) => (await import('@/lib/export/message-card-paint')).renderMessageCard(input, document, sources);
const defaultThumbnailer: Thumbnailer = async (input, width, sources) =>
  (await import('@/lib/export/message-card-paint')).renderMessageCardThumbnail(input, width, document, sources);

/* La livraison (galerie, partage, téléchargement) est un `import()` au premier
   « Enregistrer », comme pour une pièce jointe : `budgets.json › story_export`
   interdit qu'un écran l'importe statiquement. */
const defaultDeliver = async (blob: Blob, fileName: string, intent: MessageCardIntent): Promise<MessageCardDelivery> =>
  (await import('@/lib/export/deliver-message-card')).deliverMessageCard(blob, fileName, intent);

/**
 * La carte telle que le format la demande — un titre absent ou vide n'est
 * jamais « affiché ». L'auteur d'un bloc est, dans cet ordre : « Anonyme » si
 * on l'a voulu, son PSEUDO (« @awa ») si on le préfère au nom affiché et qu'on
 * le connaît, sinon son nom. Le filigrane, lui, garde toujours le pseudo de qui
 * exporte.
 */
export function messageCardInputOf(params: {
  readonly subject: MessageCardSubject;
  readonly format: MessageCardFormat;
  readonly handle: string | null;
  readonly conversationTitle: string | null;
  readonly anonymousLabel: string;
  readonly formatDate: (date: Date) => string;
  /** L'heure d'un message, rédigée — absente : aucune heure n'est peinte. */
  readonly formatTime?: (date: Date) => string;
}): MessageCardInput {
  const { subject, format } = params;
  const time = (date: Date | null) => (format.showTimes && date !== null && params.formatTime !== undefined ? params.formatTime(date) : null);
  const part = (source: MessageCardSubjectPart, anonymized: boolean, at: Date | null): MessageCardPart => ({
    author: anonymized ? params.anonymousLabel : format.usePseudonyms && source.handle !== null ? `@${source.handle}` : source.author,
    text: source.text,
    time: time(at),
  });
  return {
    quoted: subject.quoted === null ? null : part(subject.quoted, format.anonymizeQuoted, subject.quotedAt),
    reply: part(subject.reply, format.anonymizeReply, subject.sentAt),
    handle: params.handle,
    template: format.template,
    title: format.showConversationTitle ? params.conversationTitle : null,
    date: format.showDate ? params.formatDate(subject.sentAt) : null,
    showAuthors: format.showAuthors,
    aspect: format.aspect,
    frame: { header: format.header, authors: format.authorsAt, tilt: format.tilt },
    media: subject.media.map((item) => item.card),
    mediaStyle: format.mediaStyle,
    audioStyle: format.audioStyle,
  };
}

const formatKey = (format: MessageCardFormat): string => JSON.stringify(format);

const percent = (value: number, of: number): string => `${(value / of) * 100}%`;

/** Le doigt ne vise pas au pixel : chaque zone déborde un peu de son texte. */
const ZONE_SLOP = 10;

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
  thumbnail = defaultThumbnailer,
  deliver = defaultDeliver,
  createObjectURL = (blob) => URL.createObjectURL(blob),
  revokeObjectURL = (url) => URL.revokeObjectURL(url),
  random = Math.random,
  loadSources = defaultSourcesLoader,
  recordMotion = defaultMotionRecorder,
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
  readonly thumbnail?: Thumbnailer;
  readonly deliver?: (blob: Blob, fileName: string, intent: MessageCardIntent) => Promise<MessageCardDelivery>;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly random?: () => number;
  /** Les pixels des médias de la carte (#8693) — injectés par les témoins. */
  readonly loadSources?: SourcesLoader;
  /** Le GIF ou la vidéo de la carte (#8693) — injecté par les témoins. */
  readonly recordMotion?: MotionRecorder;
}) {
  const language = currentInterfaceLanguage();
  const [savedDefault, setSavedDefault] = useState<MessageCardFormat | null>(() => readDefaultMessageCardFormat(storage));
  const [format, setFormat] = useState<MessageCardFormat>(() => savedDefault ?? INITIAL_MESSAGE_CARD_FORMAT);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportLanguage, setExportLanguage] = useState<string | null>(null);
  const [tab, setTab] = useState<ExportTab>('styles');
  const [focus, setFocus] = useState<CardPart | null>(null);
  const [touched, setTouched] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const subject = useMemo(
    () => (exportLanguage === null ? asRead : (exportLanguages.subjectIn(exportLanguage) ?? asRead)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asRead, exportLanguage],
  );
  const quickSent = useRef(false);
  const [usage] = useState(() => readTemplateUsage(storage));
  const [popular] = useState(() => popularTemplates(usage, POPULAR_COUNT));
  const title = conversationTitle !== null && conversationTitle.trim() !== '' ? conversationTitle.trim() : null;

  /* Les portes sont PRÉCHARGÉES pendant que la carte se peint : sur iOS, le
     partage exige l'activation du geste, qu'une attente réseau après le tap
     ferait expirer. */
  useEffect(() => {
    void import('@/lib/export/deliver-message-card').catch(() => undefined);
    void import('@/lib/media/deliver-file').catch(() => undefined);
  }, []);

  const media = useCardSources(subject.media, loadSources);
  const outputs = cardOutputsOf(subject.media.map((item) => item.card));
  const [chosenOutput, setOutput] = useState<CardOutput>('image');
  const output: CardOutput = outputs.includes(chosenOutput) ? chosenOutput : 'image';
  const [motionBusy, setMotionBusy] = useState<Exclude<CardOutput, 'image'> | null>(null);
  const motionCache = useMotionCache();

  const inputFor = (template: MessageCardTemplateId): MessageCardInput =>
    messageCardInputOf({
      subject,
      format: { ...format, template },
      handle,
      conversationTitle: title,
      anonymousLabel: translateExportCard(language, 'export.card.anonymous'),
      formatDate: (date) => new Intl.DateTimeFormat(language, { dateStyle: 'long' }).format(date),
      formatTime: (date) => new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(date),
    });

  const key = `${formatKey(format)}|${media.version}`;

  useEffect(() => {
    let live = true;
    let url: string | null = null;
    setFailed(false);
    void paint(inputFor(format.template), media.sources)
      .catch(() => null)
      .then((card) => {
        if (!live) return;
        if (card === null) {
          setFailed(true);
          return;
        }
        url = createObjectURL(card.blob);
        setRendered({ key, blob: card.blob, url, truncated: card.truncated, width: card.width ?? 1080, height: card.height ?? 1080, regions: card.regions ?? [] });
      });
    return () => {
      live = false;
      if (url !== null) revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, subject, handle, title]);

  /* Les vignettes : un cache par feuille, rendu à la fermeture. Leur clé suit
     tout ce qui change la carte SAUF le template, qu'elle nomme elle-même. */
  const [cache] = useState(() => createThumbnailCache({ createObjectURL, revokeObjectURL }));
  useEffect(() => () => cache.dispose(), [cache]);
  const context = `${JSON.stringify({ ...format, template: null })}|${exportLanguage ?? ''}|${media.version}`;
  const thumbs = useMemo<ThumbSource>(
    () => ({ cache, keyOf: (id) => `${id}|${context}`, render: (id) => thumbnail(inputFor(id), THUMB_WIDTH, media.sources) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cache, context, subject],
  );

  /* Une carte à médias n'est PRÊTE qu'avec leurs pixels : « Imager rapide » ne part jamais avec des cadres vides. */
  const ready = rendered !== null && rendered.key === key && !media.loading;

  /** Le fichier à livrer : l'image peinte, ou le GIF / la vidéo fabriqués à la demande (et gardés pour un second geste). */
  const fileFor = async (card: Rendered): Promise<Blob | null> => {
    if (output === 'image') return card.blob;
    const cacheKey = `${key}|${output}|${exportLanguage ?? ''}`;
    const cached = motionCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const temporal = temporalItemOf(subject.media);
    if (temporal === null) return null;
    setMotionBusy(output);
    announce(translateExportCard(language, output === 'gif' ? 'export.card.motion.gif' : 'export.card.motion.video'));
    const blob = await recordMotion({ input: inputFor(format.template), sources: media.sources, output, item: temporal.item, index: temporal.index }).catch(() => null);
    setMotionBusy(null);
    if (blob !== null) motionCache.set(cacheKey, blob);
    return blob;
  };

  const send = async (intent: MessageCardIntent) => {
    if (!ready || saving) return;
    setSaving(true);
    const file = await fileFor(rendered);
    if (file === null) {
      setSaving(false);
      announce(translateExportCard(language, 'export.announce.motionUnavailable'));
      return;
    }
    const outcome = await deliver(file, messageCardFileName(new Date(), extensionOfType(file.type)), intent).catch((): MessageCardDelivery => 'unavailable');
    setSaving(false);
    announce(translateExportCard(language, (output === 'image' ? DELIVERY_ANNOUNCE : MOTION_ANNOUNCE)[outcome]));
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
  const choose = (choice: FrameChoice) => setFormat((current) => ({ ...current, ...choice }));
  const pick = (template: MessageCardTemplateId) => setFormat((current) => ({ ...current, template }));
  const current = templateOf(format.template);
  const pickPart = (part: { readonly palette?: CardPaletteId; readonly typeface?: CardTypefaceId; readonly link?: CardLinkId }) =>
    pick(templateIdOf({ palette: part.palette ?? current.paletteId, typeface: part.typeface ?? current.typefaceId, link: part.link ?? current.link }));

  const isDefault = sameMessageCardFormat(format, savedDefault);
  const useAsDefault = () => {
    writeDefaultMessageCardFormat(storage, format);
    setSavedDefault(format);
    announce(translateExportCard(language, 'export.announce.defaultSaved'));
  };

  const touchPart = (part: CardPart) => {
    setTouched(true);
    setFocus(part);
    setTab(TAB_OF_PART[part]);
  };

  const openTab = (next: ExportTab) => {
    setTab(next);
    setFocus(
      next === 'palette' ? 'background' : next === 'link' ? 'link' : next === 'media' ? 'media' : next === 'typeface' ? (focus === 'quote' ? 'quote' : 'reply') : null,
    );
  };

  /* « Détails » garde ce qui S'AJOUTE à la carte (le titre, les noms) ; la date, les heures et l'anonymat vivent dans Frame. */
  const options: readonly MessageCardToggle[] = [...(title === null ? [] : (['showConversationTitle'] as const)), 'showAuthors'];
  const hasHeader = (format.showConversationTitle && title !== null) || format.showDate;
  const hasVisual = subject.media.some((item) => item.card.kind !== 'audio');
  const hasAudio = subject.media.some((item) => item.card.kind === 'audio');

  const headerButton = { width: 44, height: 44, color: 'var(--color-ios-ink)' } as const;
  const shown = rendered;
  const focused = shown?.regions.find((region) => region.part === focus) ?? null;

  return (
    <Sheet
      title={translateExportCard(language, 'export.card.title')}
      presentation="centered"
      bodyAs="div"
      onClose={onClose}
      accessory={
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-export-random=""
            onClick={() => pick(randomTemplateId(random))}
            aria-label={translateExportCard(language, 'export.card.random')}
            title={translateExportCard(language, 'export.card.random')}
            className="grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={headerButton}
          >
            <GlyphSvg glyph={EXPORT_CARD_GLYPHS.shuffle} size={20} />
          </button>
          <button
            type="button"
            data-export-default=""
            disabled={isDefault}
            aria-pressed={isDefault}
            onClick={useAsDefault}
            aria-label={translateExportCard(language, isDefault ? 'export.card.default.current' : 'export.card.default.save')}
            title={translateExportCard(language, isDefault ? 'export.card.default.current' : 'export.card.default.save')}
            className="grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ ...headerButton, ...(isDefault ? { color: 'var(--accent, var(--color-ios-brand))' } : {}) }}
          >
            <GlyphSvg glyph={EXPORT_CARD_GLYPHS.bookmarkSimple} size={20} />
          </button>
        </div>
      }
    >
      <div className="relative flex flex-col overflow-hidden" style={{ height: 'min(82dvh, 860px)' }}>
        {shown === null ? null : (
          <img aria-hidden="true" alt="" src={shown.url} className="pointer-events-none absolute inset-0 h-full w-full object-cover" style={{ filter: 'blur(48px) saturate(1.5)', opacity: 0.5, transform: 'scale(1.25)' }} />
        )}

        <div className="relative min-h-0 flex-1" aria-live="polite" aria-busy={!ready && !failed}>
          <div className="absolute inset-x-6 inset-y-3" style={{ containerType: 'size' }}>
            <div className="grid h-full w-full place-items-center">
              {failed ? (
                <p className="px-4 py-6 text-center text-caption" style={{ color: 'var(--color-danger)' }} data-export-failed="">
                  {translateExportCard(language, 'export.announce.failed')}
                </p>
              ) : shown === null ? (
                <p className="px-4 py-6 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {translateExportCard(language, 'export.card.rendering')}
                </p>
              ) : (
                <div
                  className="relative"
                  style={{
                    width: `min(100cqw, calc(100cqh * ${shown.width / shown.height}))`,
                    aspectRatio: `${shown.width} / ${shown.height}`,
                    opacity: ready ? 1 : 0.6,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <button
                    type="button"
                    data-export-part="background"
                    aria-pressed={focus === 'background'}
                    aria-label={translateExportCard(language, 'export.card.part.background')}
                    onClick={() => touchPart('background')}
                    className="absolute inset-0 block overflow-hidden rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-4"
                    style={{ boxShadow: '0 18px 48px color-mix(in srgb, black 35%, transparent)' }}
                  >
                    <img src={shown.url} alt={translateExportCard(language, 'export.card.preview')} data-export-preview={ready ? format.template : ''} className="block h-full w-full" />
                  </button>
                  {shown.regions.map((region) => (
                    <button
                      key={region.part}
                      type="button"
                      data-export-part={region.part}
                      aria-pressed={focus === region.part}
                      aria-label={translateExportCard(language, PART_LABEL[region.part])}
                      onClick={() => touchPart(region.part)}
                      className="absolute rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        left: `calc(${percent(region.x, shown.width)} - ${ZONE_SLOP}px)`,
                        top: `calc(${percent(region.y, shown.height)} - ${ZONE_SLOP}px)`,
                        width: `calc(${percent(region.width, shown.width)} + ${2 * ZONE_SLOP}px)`,
                        height: `calc(${percent(region.height, shown.height)} + ${2 * ZONE_SLOP}px)`,
                        outline: focus === region.part ? '2px solid white' : undefined,
                        boxShadow: focus === region.part ? '0 0 0 4px color-mix(in srgb, black 25%, transparent)' : undefined,
                      }}
                    />
                  ))}
                  {focused === null && focus !== 'background' ? null : (
                    <span
                      aria-hidden="true"
                      className="glass pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-3 py-1 text-caption font-semibold"
                      style={{ top: focused === null ? -6 : `calc(${percent(focused.y, shown.height)} - ${ZONE_SLOP + 6}px)`, color: 'var(--color-ios-ink)' }}
                    >
                      {translateExportCard(language, PART_LABEL[focus ?? 'background'])}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          {motionBusy !== null ? (
            <p data-export-motion={motionBusy} className="glass pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translateExportCard(language, motionBusy === 'gif' ? 'export.card.motion.gif' : 'export.card.motion.video')}
            </p>
          ) : touched || shown === null ? null : (
            <p data-export-hint="" className="glass pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-caption" style={{ color: 'var(--color-ios-ink)' }}>
              {translateExportCard(language, media.loading ? 'export.card.media.loading' : 'export.card.hint')}
            </p>
          )}
        </div>

        {ready && rendered.truncated ? (
          <p className="relative px-6 pb-1 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateExportCard(language, 'export.card.truncated')}
          </p>
        ) : null}

        <div className="relative shrink-0">
          <ExportTray
            language={language}
            tab={tab}
            onTab={openTab}
            focus={focus}
            format={format}
            options={options}
            hasQuote={subject.quoted !== null}
            hasHeader={hasHeader}
            hasVisual={hasVisual}
            hasAudio={hasAudio}
            popular={popular.includes(format.template) ? popular : [format.template, ...popular]}
            thumbs={thumbs}
            onTemplate={pick}
            onPart={pickPart}
            onToggle={toggle}
            onChoice={choose}
            onGallery={() => setGalleryOpen(true)}
            languages={exportLanguages.codes}
            exportLanguage={exportLanguage}
            onLanguage={setExportLanguage}
          />
        </div>

        <OutputPicker language={language} outputs={outputs} output={output} onOutput={setOutput} />

        <div className="relative grid shrink-0 grid-cols-2 gap-2 px-3 pb-3 pt-2">
          <button
            type="button"
            data-export-save=""
            disabled={!ready || saving}
            onClick={() => void send('save')}
            className="glass-prominent glass-accent inline-flex items-center justify-center gap-2 rounded-full text-body font-bold transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            style={{ minHeight: 50, color: 'white' }}
          >
            <Glyph name="downloadSimple" size={18} />
            {translateExportCard(language, 'export.card.save')}
          </button>
          <button
            type="button"
            data-export-share=""
            disabled={!ready || saving}
            onClick={() => void send('share')}
            className="glass-prominent inline-flex items-center justify-center gap-2 rounded-full text-body font-bold transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
            style={{ minHeight: 50, color: 'var(--color-ios-ink)' }}
          >
            <GlyphSvg glyph={EXPORT_CARD_GLYPHS.export} size={18} />
            {translateExportCard(language, 'export.card.share')}
          </button>
        </div>

        {galleryOpen ? (
          <ExportGallery
            language={language}
            usage={usage}
            selected={format.template}
            thumbs={thumbs}
            onPick={(id) => {
              pick(id);
              setGalleryOpen(false);
            }}
            onClose={() => setGalleryOpen(false)}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
