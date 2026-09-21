import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { sharedConversationsWith, VIEWER_ID } from '@/lib/api/fixtures';
import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileConversationsSection } from './user-profile-conversations';

/**
 * **CE QUE VOUS PARTAGEZ DÉJÀ, DESSINÉ** (#7124) — l'onglet Conversations
 * d'iOS (`UserProfileSheet+ConversationsTab.swift`) rendu en SECTION empilée.
 *
 * Ce que ces témoins gardent, et qu'aucun témoin de port ne peut prouver :
 * qu'une rangée est une ADRESSE (donc un `<Link>` qu'on peut ouvrir dans un
 * onglet), que le VIDE se DIT au lieu de laisser une section muette, et que
 * les quatre états — vide, chargement, erreur, servi — sont tous DESSINÉS.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const noop = () => undefined;
const VIEWER = VIEWER_ID;

const parse = (html: string): HTMLElement => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

/* LES CONVERSATIONS SONT CELLES DU CORPUS, jamais un littéral recomposé :
   `Conversation` est le type PARTAGÉ (`packages/shared`), et un objet bâti à
   la main ici aurait demandé une assertion — c'est-à-dire un témoin qui mesure
   sa propre idée de la forme plutôt que la forme servie. `u-kwame` partage un
   DIRECT (`c-kwame`) et un salon PUBLIC (`c-annonces`) avec le lecteur. */
const PARTAGEES = sharedConversationsWith('u-kwame');
const DIRECT = PARTAGEES.find((c) => c.type === 'direct');
const GROUPE = PARTAGEES.find((c) => c.type !== 'direct');

const section = (params: {
  readonly conversations?: readonly Conversation[];
  readonly loading?: boolean;
  readonly failed?: boolean;
}) =>
  parse(
    renderToStaticMarkup(
      <ProfileConversationsSection
        language="fr"
        conversations={params.conversations ?? []}
        viewerId={VIEWER}
        loading={params.loading ?? false}
        failed={params.failed ?? false}
        onRetry={noop}
      />,
    ),
  );

describe('ProfileConversationsSection — une rangée mène quelque part', () => {
  test('chaque conversation partagée est une ADRESSE, pas une zone tapable', () => {
    const el = section({ conversations: PARTAGEES });

    const liens = [...el.querySelectorAll('[data-profile-conversation] a')];
    expect(liens).toHaveLength(PARTAGEES.length);
    expect(liens.map((a) => a.getAttribute('href'))).toEqual(PARTAGEES.map((c) => `/c/${c.id}`));
  });

  test('un DIRECT porte le nom de l’autre, un GROUPE porte son titre', () => {
    const el = section({ conversations: [DIRECT, GROUPE].filter((c): c is Conversation => c !== undefined) });

    const lignes = [...el.querySelectorAll('[data-profile-conversation]')].map((n) => (n.textContent ?? '').trim());
    // `titleOf` : un direct n'a pas de titre propre — il PORTE le nom de
    // l'autre ; un groupe a le sien (#6790).
    expect(lignes[0]).toContain('Kwame Mensah');
    expect(lignes[1]).toContain(GROUPE?.title ?? '');
  });

  /* LES QUATRE ÉTATS SONT DESSINÉS (dimension 8) — une section qui ne rend
     rien quand elle n'a rien est indistinguable d'une section en panne. */
  test('le VIDE se DIT, il ne laisse pas la section muette', () => {
    const el = section({ conversations: [] });

    expect(el.querySelector('[data-profile-conversations-empty]')).not.toBeNull();
    expect(el.textContent).toContain('Aucune conversation en commun');
  });

  test('le CHARGEMENT ne se peint que sur un cache VIDE — Cache-First', () => {
    const froid = section({ conversations: [], loading: true });
    expect(froid.querySelector('[aria-busy="true"]')).not.toBeNull();
    /* La liste déjà servie reste peinte pendant sa revalidation silencieuse :
       aucun spinner sur un cache non vide (§ Instant App Principles). */
    const chaud = section({ conversations: PARTAGEES.slice(0, 1), loading: true });
    expect(chaud.querySelector('[aria-busy="true"]')).toBeNull();
    expect(chaud.querySelectorAll('[data-profile-conversation]')).toHaveLength(1);
  });

  test('une PANNE porte son alerte et son geste — elle ne blanchit pas la fiche', () => {
    const el = section({ failed: true });

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('[data-profile-conversations-retry]')).not.toBeNull();
    // Et le vide n'est PAS affirmé en même temps : une panne n'est pas « rien ».
    expect(el.querySelector('[data-profile-conversations-empty]')).toBeNull();
  });

  /**
   * **« ENVOYER UN MESSAGE » N'EST PAS REPRIS ICI** — la fiche l'offre déjà
   * (« Écrire », section CONNEXION). iOS le répète dans son onglet parce que
   * ses onglets se cachent l'un l'autre ; une page pleine n'a pas ce problème,
   * et deux boutons pour un geste sont le doublon que D-11 interdit.
   */
  test('aucun second « Écrire » — le geste vit dans la section CONNEXION', () => {
    const el = section({ conversations: PARTAGEES });

    expect(el.querySelector('[data-profile-action="write"]')).toBeNull();
  });
});
