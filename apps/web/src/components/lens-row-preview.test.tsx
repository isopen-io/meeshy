import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import casesFile from '../../../../packages/shared/fixtures/conversation-preview-cases.json';
import {
  composeConversationPreview,
  renderConversationPreviewText,
  type ConversationPreviewInput,
} from '@meeshy/shared/utils/conversation-preview';

import { RAINBOW_SPECTRUM } from '@/lib/effects-playback';
import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { readingModeScopeOf } from '@/lib/reading-mode/scope';
import { draftStore } from '@/lib/send/draft-store';
import { noteEphemeralReception, resetEphemeralReception } from '@/lib/view/ephemeral-reception';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/**
 * LA LIGNE REND LE COMPOSEUR PARTAGÉ, CAS PAR CAS (#7547 — critère de preuve
 * « chaque ligne du fichier de cas commun rendue par la ligne de liste »).
 *
 * Chaque cas de `packages/shared/fixtures/conversation-preview-cases.json`
 * (celui que rejouent aussi les tests shared et le SDK Swift, #7548) est
 * reconstruit en CONVERSATION telle que le cache de liste la tient, rendu par
 * `LensRow`, puis lu à deux endroits :
 *  - le libellé ACCESSIBLE dit exactement le texte du cas ;
 *  - le texte VISIBLE dit la même chose, l'icône étant dessinée par un glyphe.
 */

type PreviewCase = { readonly id: string; readonly input: ConversationPreviewInput; readonly text: string };
const CASES = (casesFile as unknown as { readonly cases: readonly PreviewCase[] }).cases;

const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const CONVERSATION_ID = 'c-case';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  resetEphemeralReception();
});

/** Le cas du fichier commun, tel que le cache de liste de web-v2 le tiendrait. */
function conversationOf(input: ConversationPreviewInput): Conversation {
  const m = input.lastMessage ?? null;
  const base = {
    id: CONVERSATION_ID,
    type: input.isDirect === true ? 'direct' : 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    title: 'Cas',
    ...(input.activeCall ? { activeCall: input.activeCall } : {}),
    ...(input.lastReaction ? { lastReaction: input.lastReaction } : {}),
  };
  if (m === null) return base as unknown as Conversation;
  const sender =
    m.senderName || m.senderUserId
      ? { sender: { id: m.senderId ?? 'p-?', displayName: m.senderName ?? '', ...(m.senderUserId ? { userId: m.senderUserId } : {}) } }
      : {};
  const attachments = m.attachment ? { attachments: [{ id: 'a-1', fileName: '', ...m.attachment, originalName: m.attachment.originalName ?? '' }] } : {};
  const optional = Object.fromEntries(
    Object.entries({
      messageType: m.messageType,
      effectFlags: m.effectFlags,
      ephemeralDuration: m.ephemeralDuration,
      expiresAt: m.expiresAt,
      isEncrypted: m.isEncrypted,
      isViewOnce: m.isViewOnce,
      isBlurred: m.isBlurred,
      isForwarded: m.isForwarded,
      systemEvent: m.systemEvent,
      callSummary: m.callSummary,
      location: m.location,
      sticker: m.sticker,
      attachmentSummary: m.attachmentSummary,
    }).filter(([, value]) => value !== undefined && value !== null),
  );
  return {
    ...base,
    lastMessage: {
      id: m.id,
      conversationId: CONVERSATION_ID,
      senderId: m.senderId ?? '',
      content: m.content ?? '',
      originalLanguage: m.originalLanguage ?? '',
      translations: [],
      createdAt: m.createdAt,
      viewOnceCount: 0,
      /* LE CHAMP SERVI, TEL QUEL (#7671) — le traduire en compteurs globaux
         gardait le défaut : la ligne se lisait « Ouvert » dès qu'un AUTRE
         ouvrait, et jamais sur la donnée que la passerelle sert. */
      ...(m.viewOnceConsumed === undefined ? {} : { viewOnceConsumed: m.viewOnceConsumed }),
      ...sender,
      ...attachments,
      ...optional,
    },
    lastMessageAt: m.createdAt,
    ...(m.originalLanguage ? { lastMessageOriginalLanguage: m.originalLanguage } : {}),
    ...(m.translations ? { lastMessageTranslations: m.translations } : {}),
  } as unknown as Conversation;
}

function renderCase(entry: PreviewCase): Element {
  const { input } = entry;
  const scope = readingModeScopeOf({ id: input.viewerId });
  if (input.receivedAt && input.lastMessage) noteEphemeralReception(input.lastMessage.id, Date.parse(String(input.receivedAt)));
  if (input.draft) draftStore.setDraft(scope, CONVERSATION_ID, { text: input.draft, language: 'fr', protection: {} });
  try {
    const html = renderToStaticMarkup(
      <LensRow
        conversation={conversationOf(input)}
        languages={input.preferredLanguages}
        viewerId={input.viewerId}
        flags={FLAGS}
        unreadCount={0}
        onRowAction={() => {}}
        interfaceLanguage={input.language}
        now={() => Date.parse(String(input.now))}
        {...(input.typing && input.typing.length > 0 ? { typists: input.typing } : {})}
      />,
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    const line = host.querySelector('[data-line2]');
    if (line === null) throw new Error(`${entry.id} : aucune ligne 2`);
    return line;
  } finally {
    if (input.draft) draftStore.setDraft(scope, CONVERSATION_ID, { text: '', language: 'fr', protection: {} });
  }
}

const visibleTextOf = (line: Element): string => (line.querySelector('[data-line2-visible]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
const spokenTextOf = (line: Element): string => line.querySelector('[data-line2-label]')?.textContent ?? '';

describe('LensRow rend le composeur partagé — chaque cas du fichier commun (#7547)', () => {
  for (const entry of CASES) {
    test(entry.id, () => {
      const line = renderCase(entry);
      const withoutIcon = renderConversationPreviewText({ ...composeConversationPreview(entry.input), icon: null }, entry.input.language);

      expect(spokenTextOf(line)).toBe(entry.text);
      expect(visibleTextOf(line)).toBe(withoutIcon.replace(/\s+/g, ' ').trim());
    });
  }
});

describe('LensRow — ce que la ligne n’affiche pas (#7547)', () => {
  test('le texte visible est caché au lecteur d’écran, qui lit le libellé — jamais deux fois', () => {
    const line = renderCase(CASES.find((c) => c.id === 'voice')!);
    expect(line.querySelector('[data-line2-visible]')?.getAttribute('aria-hidden')).toBe('true');
    expect(line.querySelector('[data-line2-label]')?.className).toContain('sr-only');
  });

  test('un message protégé ne rend aucune trace de son contenu', () => {
    const line = renderCase(CASES.find((c) => c.id === 'view-once')!);
    expect(line.textContent).not.toContain('4242');
  });

  /** H4 (lot 3) : le web appelle (#6382) — « Rejoindre » est posé au bout de
   * la rangée, HORS du lien, et la ligne 2 elle-même reste sans bouton. */
  test('un appel en cours se dit sur la ligne 2, et « Rejoindre » vit hors du lien de la rangée', () => {
    const entry = CASES.find((c) => c.id === 'active-call')!;
    const line = renderCase(entry);
    expect(line.textContent).toContain('Appel en cours');
    expect(line.querySelector('button')).toBeNull();

    const html = renderToStaticMarkup(
      <LensRow
        conversation={conversationOf(entry.input)}
        languages={entry.input.preferredLanguages}
        viewerId={entry.input.viewerId}
        flags={FLAGS}
        unreadCount={0}
        onRowAction={() => {}}
        interfaceLanguage={entry.input.language}
        now={() => Date.parse(String(entry.input.now))}
      />,
    );
    const host = document.createElement('div');
    host.innerHTML = html;
    const join = host.querySelector('button[data-lens-join]');
    expect(join?.getAttribute('data-lens-join')).toBe(entry.input.activeCall?.id ?? '');
    expect(join?.getAttribute('aria-label')).toBe('Rejoindre l’appel avec Cas');
    expect(join?.textContent).toContain('Rejoindre');
    expect(join?.closest('a')).toBeNull();
  });

  test('sans appel en cours, aucune rangée ne porte « Rejoindre »', () => {
    const html = renderToStaticMarkup(
      <LensRow
        conversation={conversationOf(CASES.find((c) => c.id === 'voice')!.input)}
        languages={['fr']}
        viewerId="u-viewer"
        flags={FLAGS}
        unreadCount={0}
        onRowAction={() => {}}
      />,
    );
    expect(html).not.toContain('data-lens-join');
  });
});

describe('LensRow applique l’effet du dernier message, figé (#16975)', () => {
  const lineOf = (id: string) => renderCase(CASES.find((c) => c.id === id)!);
  const visibleOf = (line: Element) => line.querySelector<HTMLElement>('[data-line2-visible]')!;

  test('chaque cas du fichier commun porte, ou non, l’effet que le composeur décrit', () => {
    for (const entry of CASES) {
      const effect = composeConversationPreview(entry.input).effect;
      const visible = visibleOf(renderCase(entry));
      expect(visible.hasAttribute('data-preview-veil')).toBe(effect?.veil === true);
      expect(visible.getAttribute('data-preview-finish')).toBe(effect?.finish ?? null);
    }
  });

  test('un message flouté se peint voilé : la ligne est floutée, le lecteur d’écran lit toujours le libellé', () => {
    const line = lineOf('blurred');
    const veil = line.querySelector<HTMLElement>('[data-preview-veil] [data-preview-veiled]');
    expect(veil?.getAttribute('style')).toContain('blur(');
    expect(spokenTextOf(line)).toContain('Message masqué');
  });

  test('la lueur et l’arc-en-ciel se peignent sans aucune animation', () => {
    const glow = visibleOf(lineOf('effect-finish-glow-entrance-shake')).querySelector<HTMLElement>('[data-preview-text]');
    const rainbow = visibleOf(lineOf('effect-finish-rainbow')).querySelector<HTMLElement>('[data-preview-text]');
    expect(glow?.getAttribute('style')).toContain('text-shadow');
    expect(rainbow?.getAttribute('style')).toContain('linear-gradient');
    for (const node of [glow, rainbow]) expect(node?.getAttribute('style') ?? '').not.toContain('animation');
  });

  test('l’arc-en-ciel d’un aperçu chiffre LE SPECTRE DE LA MAISON, pas une jumelle codée en dur (parité iOS + bulle)', () => {
    // Le même fini « rainbow » doit afficher le MÊME spectre dans la ligne de
    // liste, dans la bulle (effects-runner) et sur iOS (houseSpectrum). Le
    // dégradé de l’aperçu dérive donc de `RAINBOW_SPECTRUM` (la source unique,
    // déjà jouée par la bulle) — jamais d’un arc-en-ciel réécrit à la main ici.
    const style = (visibleOf(lineOf('effect-finish-rainbow')).querySelector<HTMLElement>('[data-preview-text]')?.getAttribute('style') ?? '').toLowerCase();
    for (const stop of RAINBOW_SPECTRUM) expect(style).toContain(stop.toLowerCase());
    for (const twin of ['#f43f5e', '#a855f7', '#22c55e', '#3b82f6']) expect(style).not.toContain(twin);
  });

  test('un éphémère qui brille ne brille pas : la protection prime', () => {
    const visible = visibleOf(lineOf('effect-under-ephemeral-not-applied'));
    expect(visible.hasAttribute('data-preview-finish')).toBe(false);
  });
});
