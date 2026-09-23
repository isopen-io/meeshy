import { describe, expect, it } from 'vitest';
import casesFile from '../fixtures/conversation-preview-cases.json';
import {
  composeConversationPreview,
  renderConversationPreviewText,
  type ConversationPreviewInput,
} from '../utils/conversation-preview';
import {
  CONVERSATION_PREVIEW_LANGUAGES,
  CONVERSATION_PREVIEW_STRING_KEYS,
  conversationPreviewString,
  formatPreviewFileSize,
  formatPreviewRemaining,
} from '../utils/conversation-preview-strings';

type PreviewCase = {
  readonly id: string;
  readonly matrix: string;
  readonly input: ConversationPreviewInput;
  readonly expected?: unknown;
  readonly text: string;
};

const cases = casesFile.cases as unknown as readonly PreviewCase[];
const caseById = (id: string): PreviewCase => {
  const found = cases.find((entry) => entry.id === id);
  if (!found) throw new Error(`cas absent : ${id}`);
  return found;
};

describe('composeConversationPreview — le fichier de cas commun (web + iOS)', () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))('%s — mise à plat', (_id, entry) => {
    expect(renderConversationPreviewText(composeConversationPreview(entry.input))).toBe(entry.text);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))('%s — valeur structurée', (_id, entry) => {
    expect(entry.expected).toBeDefined();
    expect(composeConversationPreview(entry.input)).toEqual(entry.expected);
  });

  it('chaque identifiant de cas est unique', () => {
    expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
  });

  it.each([
    'prism-rank-2',
    'view-once',
    'cumul-view-once-beats-blur-ephemeral-effect',
    'cumul-ephemeral-hides-effect',
    'photo-without-size',
    'file-without-name',
    'en-view-once-placeholder-not-translated',
  ])('le fichier couvre le cas exigé %s', (id) => {
    expect(caseById(id).text.length).toBeGreaterThan(0);
  });
});

describe('Prisme — le texte vient de resolvePrismTranslation', () => {
  it('au rang 2, sert la traduction du rang 2 et dit sa langue', () => {
    const preview = composeConversationPreview(caseById('prism-rank-2').input);
    expect(preview.segments).toEqual([{ kind: 'text', text: 'Bonjour', language: 'fr' }]);
  });

  it('sert l’original avec une langue nulle quand l’origine gagne à son rang', () => {
    const preview = composeConversationPreview(caseById('prism-original-at-its-rank').input);
    expect(preview.segments).toEqual([{ kind: 'text', text: 'Hello', language: null }]);
  });
});

describe('sécurité — un message protégé ne transporte ni texte, ni traduction, ni pièce jointe', () => {
  const PROTECTED = [
    ['view-once', ['4242']],
    ['view-once-opened', ['4242']],
    ['view-once-attachment', ['450', '234']],
    ['blurred', ['Spoiler']],
    ['encrypted', ['AAECAwQ=']],
    ['cumul-view-once-beats-blur-ephemeral-effect', ['Secret', 'Zoom']],
    ['cumul-expired-beats-view-once', ['Secret']],
    ['ephemeral-expired', ['Rendez-vous']],
    ['expired-legacy', ['Vieux secret']],
    ['en-view-once-placeholder-not-translated', ['4242', 'code']],
  ] as const;

  it.each(PROTECTED)('%s ne laisse rien fuir', (id, secrets) => {
    const serialized = JSON.stringify(composeConversationPreview(caseById(id).input));
    secrets.forEach((secret) => expect(serialized).not.toContain(secret));
    expect(serialized).not.toContain('"kind":"text"');
  });

  it('un éphémère expiré ne garde aucun compteur vivant', () => {
    expect(composeConversationPreview(caseById('ephemeral-expired').input).live).toBeUndefined();
  });

  it('un éphémère actif porte son échéance pour que le client rafraîchisse sans recomposer à l’aveugle', () => {
    const preview = composeConversationPreview(caseById('ephemeral-live').input);
    expect(preview.live).toEqual({ expiresAt: Date.parse('2026-09-23T10:04:00.000Z') });
  });

  it('le même éphémère, recomposé après son échéance, bascule seul en expiré', () => {
    const later = { ...caseById('ephemeral-live').input, now: '2026-09-23T10:04:00.000Z' };
    expect(renderConversationPreviewText(composeConversationPreview(later))).toBe('Alice : ⏱ Message expiré');
  });
});

describe('le catalogue des libellés', () => {
  it('couvre les sept langues du produit', () => {
    expect([...CONVERSATION_PREVIEW_LANGUAGES].sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'pt']);
  });

  it.each(CONVERSATION_PREVIEW_LANGUAGES.map((lang) => [lang] as const))(
    '%s : chaque clé a un libellé, avec les mêmes jetons que le français',
    (lang) => {
      const tokensOf = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      CONVERSATION_PREVIEW_STRING_KEYS.forEach((key) => {
        const probe = conversationPreviewString(lang, key, {});
        expect(probe.trim().length, `${lang}/${key}`).toBeGreaterThan(0);
      });
      CONVERSATION_PREVIEW_STRING_KEYS.forEach((key) => {
        const withTokens = (l: string) => conversationPreviewString(l, key, { name: '§n', other: '§o', count: '§c', actor: '§a', target: '§t', emoji: '§e', excerpt: '§x', author: '§u', line: '§l' });
        expect(tokensOf(withTokens(lang).replace(/§(\w)/g, '{$1}')), `${lang}/${key}`).toEqual(
          tokensOf(withTokens('fr').replace(/§(\w)/g, '{$1}')),
        );
      });
    },
  );

  it('une langue hors catalogue retombe sur le français', () => {
    expect(conversationPreviewString('ja', 'conversation.empty')).toBe('Nouvelle conversation');
    expect(conversationPreviewString('fr-CA', 'conversation.empty')).toBe('Nouvelle conversation');
    expect(conversationPreviewString(null, 'draft')).toBe('Brouillon');
  });

  it.each([
    ['fr', 512, '512 o'],
    ['fr', 49152, '48 Ko'],
    ['fr', 4404019, '4,2 Mo'],
    ['fr', 2097152, '2 Mo'],
    ['fr', 12582912, '12 Mo'],
    ['en', 4404019, '4.2 MB'],
    ['de', 1468006, '1,4 MB'],
    ['fr', 3 * 1024 ** 3, '3 Go'],
    ['en', 1048500, '1 MB'],
  ] as const)('taille %s de %d octets ⇒ %s', (lang, bytes, expected) => {
    expect(formatPreviewFileSize(lang, bytes)).toBe(expected);
  });

  it.each([
    [500, '1 s'],
    [25_000, '25 s'],
    [60_000, '1 min'],
    [181_000, '4 min'],
    [2 * 3_600_000, '2 h'],
    [3 * 86_400_000 - 1, '3 j'],
  ] as const)('temps restant de %d ms ⇒ %s', (ms, expected) => {
    expect(formatPreviewRemaining('fr', ms)).toBe(expected);
  });
});
