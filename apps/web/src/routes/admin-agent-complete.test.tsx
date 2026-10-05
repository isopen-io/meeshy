import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { routedTransport, pathOf, type RoutedReply } from '@/test-support/routed-transport';
import { servedPagination } from '@/test-support/served-pagination';

import { AdminAgentPanel } from './admin-agent-parts';

/**
 * **L'ÉCRAN AGENT COMPLET** (lot Agent complet) — les cartes qui ouvrent leurs
 * modales, et chaque geste écrit avec sa forme EXACTE : méthode, adresse, corps
 * (et son absence pour les DELETE qui n'en déclarent pas), confirmation pour ce
 * qui détruit, annonce du résultat, masquage de ce que le rang ne permet pas.
 */
const { mount, mounter } = setupAdminKitTests();

const C = 'c-atelier';
const U = 'b'.repeat(24);
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const ok = (data: unknown, extra: Readonly<Record<string, unknown>> = {}): ApiResult<unknown> => ({ ok: true, data, ...extra });
const page = (data: readonly unknown[]) => ok(data, { pagination: servedPagination({ total: data.length, page: 1, limit: 20, hasMore: false }) });

const SUJET = {
  id: 't1',
  slug: 'cuisine',
  label: 'Cuisine',
  keywordPatterns: ['recette'],
  instructionTemplate: 'Parle de cuisine avec entrain et précision.',
  searchHintTemplate: 'recettes',
  examples: [],
  cooldownMinutes: 60,
  priority: 2,
  isActive: true,
};

const AGENT: RoutedReply = (req) => {
  const path = pathOf(req);
  const p = '/api/v1/admin/agent';
  if (req.method !== 'GET') return undefined;
  if (path === `${p}/stats`)
    return ok({
      totalConfigs: 4,
      activeConfigs: 2,
      totalControlledUsers: 9,
      totalMessagesSent: 120,
      totalWordsSent: 4800,
      avgConfidence: 0.66,
      recentActivity: [{ conversationId: C, conversation: { title: 'Atelier', type: 'group' }, lastResponseAt: '2026-10-05T08:00:00.000Z' }],
    });
  if (path === `${p}/configs`)
    return page([{ conversationId: C, conversation: { title: 'Atelier', type: 'group' }, enabled: true, controlledUserIds: [U], analytics: { messagesSent: 3 } }]);
  if (path === `${p}/scan-logs`) return page([]);
  if (path === `${p}/recent-activity`) return ok([{ conversationId: C, conversation: { title: 'Atelier', type: 'group' }, enabled: true, messagesSent: 3, totalWordsSent: 40, avgConfidence: 0.5 }]);
  if (path === `${p}/scan-logs/stats`) return ok({ buckets: [{ date: '2026-10-04', scans: 3, messagesSent: 1 }], totalLogs: 3, since: '2026-07-05T00:00:00.000Z' });
  if (path === `${p}/llm`) return ok({ provider: 'openai', model: 'gpt-4o-mini', hasApiKey: true, dailyBudgetUsd: 20, maxCostPerCall: 0.05, maxTokens: 1024, temperature: 0.7 });
  if (path === `${p}/global-config`) return ok({ enabled: true, globalScanEnabled: false, defaultProvider: 'openai', defaultModel: 'gpt-4o-mini', maxConcurrentCalls: 5, systemPrompt: 'Anime', updatedAt: '2026-10-01T00:00:00.000Z' });
  if (path === `${p}/configs/${C}`)
    return ok({
      enabled: true,
      scanIntervalMinutes: 3,
      burstEnabled: true,
      timeoutSeconds: 300,
      excludedRoles: ['AGENT'],
      freshTopicCategoryHints: [],
      minDelayMinutes: null,
      controlledUserIds: [U],
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
  if (path === `${p}/configs/${C}/summary`) return ok({ summary: 'On parle cuisine.', currentTopics: ['recettes'], messageCount: 12, healthScore: 80 });
  if (path === `${p}/configs/${C}/schedule`) return ok({ scanIntervalMinutes: 3, lastScan: 0, nextScan: Date.UTC(2026, 9, 5, 9), upcomingScans: [1], budget: { messagesUsed: 1, messagesMax: 10 }, burst: { enabled: true } });
  if (path === `${p}/configs/${C}/roles`) return ok([{ userId: U, origin: 'observed', confidence: 0.4, locked: true }], { pagination: { total: 1, offset: 0, limit: 50 } });
  if (path === `${p}/configs/${C}/live`) return ok({ conversationId: C, controlledUsers: [{ userId: U, displayName: 'Awa', username: 'awa' }] });
  if (path === `${p}/configs/${C}/messages`) return page([{ id: 'm1', content: 'Bonjour à tous', createdAt: '2026-10-04T08:00:00.000Z', sender: { displayName: 'Awa' } }]);
  if (path === `${p}/archetypes`) return ok([{ id: 'curious', name: 'Le Curieux' }]);
  if (path === `${p}/delivery-queue`) return ok([{ id: 'q1', conversationId: C, scheduledAt: Date.UTC(2026, 9, 5, 12), action: { type: 'message', asUserId: U, content: 'Salut' } }]);
  if (path === `${p}/topics`) return ok([SUJET]);
  if (path === `${p}/topics/t1`) return ok(SUJET);
  return undefined;
};

const ECRITURES: RoutedReply = (req) => {
  if (req.method === 'GET') return undefined;
  if (req.path.endsWith('/topics/t1') && req.method === 'PATCH') {
    return { ok: false, status: 400, error: 'keywordPatterns: motif refusé — (a+)+$ → [NESTED_QUANTIFIER] quantificateur imbriqué' };
  }
  if (req.path.endsWith('/topics/t1/test')) return ok({ matches: { recette: 2 }, refused: [] });
  return ok({});
};

async function monter(identity = ADMIN, ...extra: readonly RoutedReply[]) {
  const espion = routedTransport(...extra, ECRITURES, AGENT);
  const host = await mount(<AdminAgentPanel language="fr" deps={{ source: 'gateway', transport: espion.transport }} />, identity);
  return { host, calls: espion.calls };
}

const $ = <T extends Element = HTMLElement>(selector: string): T | null => document.querySelector<T>(selector);
const confirmer = () => mounter.click($('[data-admin-confirm] [data-admin-action="confirm"]'));
const ecritures = (calls: () => readonly HttpRequest[]) => calls().filter((call) => call.method !== 'GET');
const annonce = () => [...document.querySelectorAll('[data-admin-announcement]')].map((node) => node.textContent ?? '').join(' | ');
const soumettre = async (selector: string) => {
  const form = $<HTMLFormElement>(selector);
  if (form === null) throw new Error(`formulaire absent : ${selector}`);
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await mounter.settle();
};
const ouvrir = (carte: string) => mounter.click($(`[data-admin-summary="${carte}"] [data-admin-summary-open]`));

describe('la vue d’ensemble', () => {
  test('mots publiés et confiance moyenne sont des cartes ; aucune modale ne lit avant d’être ouverte', async () => {
    const { host, calls } = await monter();
    expect(host.querySelector('[data-admin-stat="words"]')?.textContent).toContain('4');
    expect(host.querySelector('[data-admin-stat="confidence"]')?.textContent).toContain('66');
    expect(host.querySelector('[data-admin-summary="activity"] [data-admin-summary-sentence]')?.textContent).toContain('Atelier');
    expect(calls().some((call) => /\/(llm|global-config|topics|delivery-queue|recent-activity|scan-logs\/stats)/.test(call.path))).toBe(false);
    expect(ecritures(calls)).toEqual([]);
    expectNoRawIdentifiers(host);
  });

  test('« Activité récente » lit le fil et les statistiques du journal, à l’ouverture', async () => {
    const { calls } = await monter();
    await ouvrir('activity');
    expect($('[data-agent-activity="c-atelier"]')?.textContent).toContain('Atelier');
    expect(calls().some((call) => call.path.startsWith('/api/v1/admin/agent/recent-activity?limit=20'))).toBe(true);
    expect(calls().some((call) => call.path === '/api/v1/admin/agent/scan-logs/stats?months=3&bucket=day')).toBe(true);
  });

  test('le journal se borne à une période — un jour devient sa journée entière', async () => {
    const { host, calls } = await monter();
    mounter.type(host, '[data-agent-logs-bound="from"]', '2026-10-01');
    await mounter.settle();
    expect(calls().some((call) => call.path.includes('/scan-logs?') && call.path.includes('from=2026-10-01T00%3A00%3A00.000Z'))).toBe(true);
  });
});

describe('le modèle et la configuration globale', () => {
  test('un administrateur LIT le modèle, ne peut pas l’écrire — et la clé ne s’affiche jamais', async () => {
    await monter(ADMIN);
    await ouvrir('model');
    expect($('[data-agent-llm]')?.textContent).toContain('OpenAI');
    expect($('[data-agent-llm]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.llm.keySet'));
    expect($('[data-agent-form="llm"]')).toBeNull();
    expect($('[data-agent-llm-readonly]')).not.toBeNull();
  });

  test('le souverain change la clé : champ mot de passe, envoyée saisie, sans motif, puis vidée', async () => {
    const { calls } = await monter(BIGBOSS);
    await ouvrir('model');
    const champ = $<HTMLInputElement>('[data-agent-llm-key] input');
    expect(champ?.type).toBe('password');
    mounter.type(document, '[data-agent-llm-key] input', 'sk-nouvelle');
    await soumettre('[data-agent-form="llm"]');
    expect($('[data-admin-confirm] [data-admin-motive]')).toBeNull();
    await confirmer();
    expect(ecritures(calls)).toEqual([{ method: 'PUT', path: '/api/v1/admin/agent/llm', body: { apiKeyEncrypted: 'sk-nouvelle' } }]);
    expect(annonce()).toContain(translateAdmin('fr', 'admin.agentPanel.llm.saved'));
    expect($<HTMLInputElement>('[data-agent-llm-key] input')?.value).toBe('');
  });

  test('la configuration globale n’envoie que le champ changé, après confirmation', async () => {
    const { calls } = await monter(ADMIN);
    await ouvrir('model');
    mounter.type(document, '[data-agent-form="global"] [data-agent-field="maxConcurrentCalls"]', '8');
    await soumettre('[data-agent-form="global"]');
    expect(ecritures(calls)).toEqual([]);
    await confirmer();
    expect(ecritures(calls)).toEqual([{ method: 'PUT', path: '/api/v1/admin/agent/global-config', body: { maxConcurrentCalls: 8 } }]);
  });

  test('un champ hors bornes est NOMMÉ, et rien ne part', async () => {
    const { calls } = await monter(ADMIN);
    await ouvrir('model');
    mounter.type(document, '[data-agent-form="global"] [data-agent-field="maxConcurrentCalls"]', '80');
    await soumettre('[data-agent-form="global"]');
    expect($('[data-agent-form="global"] [data-agent-form-error]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.global.maxConcurrentCalls'));
    expect($('[data-admin-confirm]')).toBeNull();
    expect(ecritures(calls)).toEqual([]);
  });
});

describe('les remises à zéro', () => {
  test('« Tout remettre à zéro » n’est pas peint pour un administrateur', async () => {
    await monter(ADMIN);
    await ouvrir('reset');
    expect($('[data-admin-detail="agent-reset"]')).not.toBeNull();
    expect($('[data-agent-reset-all]')).toBeNull();
  });

  test('le souverain confirme une feuille qui dit TOUT ce qui est effacé ; le DELETE porte `{}`', async () => {
    const { calls } = await monter(BIGBOSS);
    await ouvrir('reset');
    await mounter.click($('[data-agent-reset-all]'));
    expect($('[data-admin-confirm]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.reset.allBody'));
    expect(ecritures(calls)).toEqual([]);
    await confirmer();
    expect(ecritures(calls)).toEqual([{ method: 'DELETE', path: '/api/v1/admin/agent/reset', body: {} }]);
    expect(annonce()).toContain(translateAdmin('fr', 'admin.agentPanel.reset.allDone'));
  });
});

describe('la fiche de l’agent sur une conversation suivie', () => {
  const ouvrirFiche = () => mounter.click($(`[data-agent-config-open="${C}"]`));

  test('elle lit réglages, résumé, planning, rôles nommés et messages publiés', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    const fiche = $(`[data-agent-conversation-sheet="${C}"]`);
    expect(fiche?.textContent).toContain('On parle cuisine.');
    expect(fiche?.textContent).toContain('Bonjour à tous');
    expect($(`[data-agent-role="${U}"]`)?.textContent).toContain('Awa');
    for (const suffixe of ['', '/summary', '/schedule', '/roles?offset=0&limit=50', '/messages?page=1&limit=20']) {
      expect(calls().some((call) => call.path === `/api/v1/admin/agent/configs/${C}${suffixe}`)).toBe(true);
    }
  });

  test('enregistrer n’envoie que le réglage changé', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    mounter.type(document, '[data-agent-form="conversation"] [data-agent-field="scanIntervalMinutes"]', '15');
    await soumettre('[data-agent-form="conversation"]');
    expect(ecritures(calls)).toEqual([{ method: 'PUT', path: `/api/v1/admin/agent/configs/${C}`, body: { scanIntervalMinutes: 15 } }]);
    expect(annonce()).toContain(translateAdmin('fr', 'admin.agentPanel.conv.saved'));
  });

  test('les réglages sont regroupés en sections titrées, chaque champ avec son libellé humain', async () => {
    await monter();
    await ouvrirFiche();
    const sections = [...document.querySelectorAll('[data-agent-form="conversation"] [data-agent-form-section]')].map((node) => node.getAttribute('data-agent-form-section'));
    expect(sections).toEqual(['general', 'members', 'rhythm', 'budget', 'style', 'triggers', 'topics']);
    expect(document.querySelectorAll('[data-agent-form="conversation"] [data-agent-field]').length).toBe(45);
    expect($('[data-agent-form-section="rhythm"] legend')?.textContent).toBe(translateAdmin('fr', 'admin.agentPanel.cfg.section.rhythm'));
  });

  test('une bascule pour un booléen : basculée, seul ce champ part', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    const bascule = $('[data-agent-form="conversation"] [data-agent-field="burstEnabled"]');
    expect(bascule?.getAttribute('role')).toBe('switch');
    expect(bascule?.getAttribute('aria-checked')).toBe('true');
    await mounter.click(bascule);
    expect(bascule?.getAttribute('aria-checked')).toBe('false');
    await soumettre('[data-agent-form="conversation"]');
    expect(ecritures(calls)).toEqual([{ method: 'PUT', path: `/api/v1/admin/agent/configs/${C}`, body: { burstEnabled: false } }]);
  });

  test('une liste nommée pour une énumération, des cases pour un ensemble, des mots-clés pour un tableau de chaînes', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    expect($<HTMLSelectElement>('[data-agent-field="agentType"]')?.tagName).toBe('SELECT');
    expect($('[data-agent-field="excludedRoles"] [data-agent-field-option="AGENT"]')?.closest('label')?.textContent).toBe(
      translateAdmin('fr', 'admin.agentPanel.cfg.excludedRoles.AGENT'),
    );
    await mounter.click($('[data-agent-field="excludedRoles"] [data-agent-field-option="ADMIN"]'));
    mounter.type(document, '[data-agent-field="freshTopicCategoryHints"]', 'cuisine\nfootball');
    await soumettre('[data-agent-form="conversation"]');
    expect(ecritures(calls)).toEqual([
      { method: 'PUT', path: `/api/v1/admin/agent/configs/${C}`, body: { excludedRoles: ['AGENT', 'ADMIN'], freshTopicCategoryHints: ['cuisine', 'football'] } },
    ]);
  });

  test('un entier dit ses bornes ; hors bornes, la raison est NOMMÉE sous le champ et rien ne part', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    const champ = $<HTMLInputElement>('[data-agent-field="timeoutSeconds"]');
    expect(champ?.type).toBe('number');
    expect($('[data-agent-field-hint="timeoutSeconds"]')?.textContent?.replace(/\s/g, ' ')).toBe('Entre 30 et 3 600'.replace(/\s/g, ' '));
    expect($('[data-agent-field-hint="minDelayMinutes"]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.form.emptyDefault'));
    mounter.type(document, '[data-agent-field="timeoutSeconds"]', '20');
    await soumettre('[data-agent-form="conversation"]');
    expect($('[data-agent-field-problem="timeoutSeconds"]')?.textContent).toContain('Hors bornes');
    expect(champ?.getAttribute('aria-invalid')).toBe('true');
    expect($('[data-agent-form="conversation"] [data-agent-form-error]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.cfg.timeoutSeconds'));
    expect(ecritures(calls)).toEqual([]);
  });

  test('supprimer la configuration et remettre la conversation à zéro : confirmés, DELETE sans corps', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    await mounter.click($(`[data-agent-config-delete="${C}"]`));
    expect($('[data-admin-confirm]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.conv.deleteBody'));
    await confirmer();
    await mounter.click($(`[data-agent-conversation-reset="${C}"]`));
    expect($('[data-admin-confirm]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.conv.resetBody'));
    await confirmer();
    expect(ecritures(calls)).toEqual([
      { method: 'DELETE', path: `/api/v1/admin/agent/configs/${C}` },
      { method: 'DELETE', path: `/api/v1/admin/agent/reset/conversation/${C}` },
    ]);
  });

  test('un rôle : poser un archétype, déverrouiller (confirmé), remettre le membre à zéro (confirmé)', async () => {
    const { calls } = await monter();
    await ouvrirFiche();
    await mounter.settle();
    const choix = $<HTMLSelectElement>(`[data-agent-role-archetype="${U}"]`);
    expect(choix?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.archetype.curious'));
    await act(async () => {
      if (choix === null) throw new Error('choix absent');
      choix.value = 'curious';
      choix.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.click($(`[data-agent-role-assign="${U}"]`));
    await mounter.click($(`[data-agent-role-unlock="${U}"]`));
    await confirmer();
    await mounter.click($(`[data-agent-role-reset="${U}"]`));
    expect($('[data-admin-confirm]')?.textContent).toContain('TOUTES les conversations');
    await confirmer();
    expect(ecritures(calls)).toEqual([
      { method: 'POST', path: `/api/v1/admin/agent/roles/${C}/${U}/assign`, body: { archetypeId: 'curious' } },
      { method: 'POST', path: `/api/v1/admin/agent/roles/${C}/${U}/unlock` },
      { method: 'DELETE', path: `/api/v1/admin/agent/reset/user/${U}` },
    ]);
  });

  test('« Voir les scans » restreint le journal à la conversation, et le dit', async () => {
    const { host, calls } = await monter();
    await ouvrirFiche();
    await mounter.click($(`[data-agent-conversation-logs="${C}"]`));
    expect(calls().some((call) => call.path.includes('/scan-logs?') && call.path.includes(`conversationId=${C}`))).toBe(true);
    expect(host.textContent).toContain('Scans de « Atelier » seulement.');
    await mounter.click(host.querySelector('[data-agent-logs-conversation-clear]'));
    expect(host.textContent).not.toContain('Scans de « Atelier » seulement.');
  });
});

describe('la file de livraison', () => {
  test('corriger un texte (PATCH `{ content }`) et annuler une publication (confirmée, DELETE sans corps)', async () => {
    const { calls } = await monter();
    await ouvrir('queue');
    expect($('[data-agent-queue-item="q1"]')?.textContent).toContain('Salut');
    await mounter.click($('[data-agent-queue-edit="q1"]'));
    mounter.type(document, '[data-agent-queue-text="q1"]', 'Bonsoir');
    await mounter.click($('[data-agent-queue-save="q1"]'));
    await mounter.click($('[data-agent-queue-cancel="q1"]'));
    await confirmer();
    expect(ecritures(calls)).toEqual([
      { method: 'PATCH', path: '/api/v1/admin/agent/delivery-queue/q1', body: { content: 'Bonsoir' } },
      { method: 'DELETE', path: '/api/v1/admin/agent/delivery-queue/q1' },
    ]);
    expect(annonce()).toContain(translateAdmin('fr', 'admin.agentPanel.queue.cancelled'));
  });
});

describe('la file de livraison nomme où et au nom de qui', () => {
  const NOMMEE: RoutedReply = (req) =>
    req.method === 'GET' && pathOf(req) === '/api/v1/admin/agent/delivery-queue'
      ? ok([
          {
            id: 'q1',
            conversationId: C,
            conversation: { id: C, title: 'Atelier cuisine' },
            persona: { id: U, username: 'awa', displayName: 'Awa Diallo' },
            scheduledAt: Date.UTC(2026, 9, 5, 12),
            action: { type: 'message', asUserId: U, content: 'Salut' },
          },
        ])
      : undefined;

  test('la conversation nommée (lien vers sa fiche) et le membre joué (nom et @pseudo), jamais le libellé générique', async () => {
    await monter(ADMIN, NOMMEE);
    await ouvrir('queue');
    const conversation = $('[data-agent-queue-item="q1"] [data-agent-queue-conversation]');
    expect(conversation?.textContent).toContain('Atelier cuisine');
    expect(conversation?.querySelector('a')?.getAttribute('href')).toContain(C);
    const persona = $(`[data-agent-queue-item="q1"] [data-agent-queue-persona="${U}"]`);
    expect(persona?.textContent).toContain('Awa Diallo');
    expect(persona?.textContent).toContain('@awa');
    expect($('[data-agent-queue-item="q1"]')?.textContent).not.toContain(translateAdmin('fr', 'admin.agentPanel.queue.conversation'));
  });

  test('un serveur d’avant (ni conversation ni persona) : le lien générique reste, aucun membre inventé', async () => {
    await monter();
    await ouvrir('queue');
    expect($('[data-agent-queue-item="q1"] [data-agent-queue-conversation]')?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.queue.conversation'));
    expect($('[data-agent-queue-item="q1"] [data-agent-queue-persona]')).toBeNull();
  });
});

describe('les sujets', () => {
  test('un motif dangereux est refusé en le NOMMANT : le message de la passerelle s’affiche', async () => {
    const { calls } = await monter();
    await ouvrir('topics');
    await mounter.click($('[data-agent-topic-open="t1"]'));
    mounter.type(document, '[data-agent-topic-field="keywordPatterns"]', 'recette\n(a+)+$');
    await soumettre('[data-agent-topic-form="t1"]');
    expect(ecritures(calls)).toEqual([{ method: 'PATCH', path: '/api/v1/admin/agent/topics/t1', body: { keywordPatterns: ['recette', '(a+)+$'] } }]);
    expect($('[data-agent-topic-error]')?.textContent).toContain('(a+)+$ → [NESTED_QUANTIFIER]');
  });

  test('essayer un texte contre les motifs dit les occurrences', async () => {
    const { calls } = await monter();
    await ouvrir('topics');
    await mounter.click($('[data-agent-topic-open="t1"]'));
    mounter.type(document, '[data-agent-topic-sample]', 'une bonne recette');
    await mounter.click($('[data-agent-topic-test="t1"]'));
    expect(ecritures(calls)).toEqual([{ method: 'POST', path: '/api/v1/admin/agent/topics/t1/test', body: { sampleText: 'une bonne recette' } }]);
    expect($('[data-agent-topic-result]')?.textContent).toContain('recette : 2 occurrence(s)');
  });

  test('désactiver et supprimer se confirment : DELETE, puis DELETE ?hard=true', async () => {
    const { calls } = await monter();
    await ouvrir('topics');
    await mounter.click($('[data-agent-topic-deactivate="t1"]'));
    await confirmer();
    await mounter.click($('[data-agent-topic-delete="t1"]'));
    expect($('[data-admin-confirm]')?.textContent).toContain('sans retour possible');
    await confirmer();
    expect(ecritures(calls).map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api/v1/admin/agent/topics/t1',
      'DELETE /api/v1/admin/agent/topics/t1?hard=true',
    ]);
  });
});
