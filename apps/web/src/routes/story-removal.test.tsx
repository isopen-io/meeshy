import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PostActionOutcome } from '@/lib/api/publication-actions';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useStoryRemoval } from './story-removal';

/**
 * #11150 — « RETIRER » UNE STORY D'UN AUTRE : offert à la modération de
 * plateforme seule, jamais sur la sienne ; le motif demandé, le lecteur se
 * referme tout de suite, l'issue s'annonce (refus compris).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

function Probe(props: { readonly role: string | null; readonly isMine: boolean; readonly outcome: PostActionOutcome; readonly journal: string[] }) {
  const { role, isMine, outcome, journal } = props;
  const removal = useStoryRemoval({
    storyId: 's-1',
    isMine,
    platformRole: role,
    announce: (message) => journal.push(`announce:${message}`),
    onRemoved: () => journal.push('closed'),
    remove: async (id, reason) => {
      journal.push(`remove:${id}:${reason}`);
      return outcome;
    },
  });
  return (
    <div>
      {removal.onRemove === undefined ? null : (
        <button type="button" data-probe-remove onClick={removal.onRemove}>
          remove
        </button>
      )}
      {removal.sheet}
    </div>
  );
}

const fill = async (host: HTMLElement, text: string) => {
  mounter.type(host.ownerDocument, '[data-content-removal-reason]', text);
  await mounter.click(host.ownerDocument.querySelector('[data-content-removal="confirm"]'));
};

describe('useStoryRemoval', () => {
  test('offert à MODERATOR, ADMIN, BIGBOSS sur la story d’un autre — jamais sur la sienne ni sans le rôle', async () => {
    for (const role of ['MODERATOR', 'ADMIN', 'BIGBOSS']) {
      expect((await mounter.mount(<Probe role={role} isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-remove]')).not.toBeNull();
    }
    expect((await mounter.mount(<Probe role="ADMIN" isMine outcome="done" journal={[]} />)).querySelector('[data-probe-remove]')).toBeNull();
    expect((await mounter.mount(<Probe role="USER" isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-remove]')).toBeNull();
    expect((await mounter.mount(<Probe role={null} isMine={false} outcome="done" journal={[]} />)).querySelector('[data-probe-remove]')).toBeNull();
  });

  test('le motif saisi, le lecteur se referme, la story part avec son motif, l’issue s’annonce', async () => {
    const journal: string[] = [];
    const host = await mounter.mount(<Probe role="ADMIN" isMine={false} outcome="done" journal={journal} />);
    await mounter.click(host.querySelector('[data-probe-remove]'));
    await fill(host, ' Nudité ');
    await mounter.settle();
    expect(journal).toEqual(['closed', 'remove:s-1:Nudité', 'announce:Contenu retiré']);
  });

  test('un refus de la passerelle se dit', async () => {
    const journal: string[] = [];
    const host = await mounter.mount(<Probe role="ADMIN" isMine={false} outcome="failed" journal={journal} />);
    await mounter.click(host.querySelector('[data-probe-remove]'));
    await fill(host, 'Nudité');
    await mounter.settle();
    expect(journal.at(-1)).toBe('announce:Le retrait a été refusé : le contenu est revenu.');
  });
});
