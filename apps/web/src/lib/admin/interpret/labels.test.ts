import { beforeAll, describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  booleanPhrase,
  conversationLabel,
  excerptOf,
  guestLabel,
  invitationLabel,
  personInitials,
  personLabel,
  personSecondary,
  postLabel,
  reportLabel,
  shareLinkLabel,
  trackingLinkLabel,
} from './labels';

beforeAll(async () => {
  await Promise.all((['fr', 'en'] as const).map((language) => loadAdminInterfaceCatalog(language)));
});

const OBJECT_ID = '64f1c2a9e8b7d6c5b4a39281';

describe('personLabel — le vrai nom, jamais un identifiant', () => {
  test('le nom affiché d’abord', () => {
    expect(personLabel({ displayName: 'Awa Diop', username: 'awa', firstName: 'A', lastName: 'D' }, 'fr')).toBe('Awa Diop');
  });

  test('puis « Prénom Nom », puis @username, puis « Compte sans nom »', () => {
    expect(personLabel({ displayName: ' ', firstName: 'Awa', lastName: 'Diop', username: 'awa' }, 'fr')).toBe('Awa Diop');
    expect(personLabel({ firstName: 'Awa', username: 'awa' }, 'fr')).toBe('Awa');
    expect(personLabel({ username: 'awa' }, 'fr')).toBe('@awa');
    expect(personLabel({}, 'fr')).toBe('Compte sans nom');
    expect(personLabel({ displayName: null, username: null }, 'en')).toBe('Unnamed account');
  });

  test('une personne absente (supprimée, non servie) se dit « Personne inconnue »', () => {
    expect(personLabel(null, 'fr')).toBe('Personne inconnue');
  });

  test('personSecondary : @username, ou rien', () => {
    expect(personSecondary('awa')).toBe('@awa');
    expect(personSecondary('')).toBeNull();
    expect(personSecondary(null)).toBeNull();
  });

  test('personInitials : deux lettres au plus, « ? » sans nom', () => {
    expect(personInitials('Awa Diop')).toBe('AD');
    expect(personInitials('@awa')).toBe('A');
    expect(personInitials('Jean-Luc Martin Dupont')).toBe('JM');
    expect(personInitials('')).toBe('?');
  });

  test('guestLabel : « Invité sans nom » sans pseudonyme', () => {
    expect(guestLabel('Moussa', 'fr')).toBe('Moussa');
    expect(guestLabel(null, 'fr')).toBe('Invité sans nom');
  });
});

describe('conversationLabel — le titre, ou ses membres — jamais un id', () => {
  const awa = { displayName: 'Awa' };
  const jean = { displayName: 'Jean' };
  const paul = { displayName: 'Paul' };

  test('le titre d’abord', () => {
    expect(conversationLabel({ title: 'Équipe produit', type: 'group', participants: [awa] }, 'fr')).toBe('Équipe produit');
  });

  test('privée : « Awa et Jean »', () => {
    expect(conversationLabel({ type: 'direct', participants: [awa, jean] }, 'fr')).toBe('Awa et Jean');
  });

  test('groupe sans titre : trois noms se listent, au-delà « Awa, Jean et 3 autres »', () => {
    expect(conversationLabel({ type: 'group', participants: [awa, jean, paul] }, 'fr')).toBe('Awa, Jean et Paul');
    expect(conversationLabel({ type: 'group', participants: [awa, jean, paul, awa, jean], total: 5 }, 'fr')).toBe('Awa, Jean et 3 autres');
  });

  test('un seul « autre » s’accorde', () => {
    expect(conversationLabel({ type: 'group', participants: [awa, jean], total: 3 }, 'fr')).toBe('Awa, Jean et 1 autre');
  });

  test('l’aperçu est plus court que l’effectif : le total fait foi', () => {
    expect(conversationLabel({ type: 'group', participants: [awa, jean, paul], total: 12 }, 'en')).toBe('Awa, Jean and 10 others');
  });

  test('sans titre ni membres : « Conversation sans titre » — JAMAIS un identifiant', () => {
    const label = conversationLabel({ title: '  ', type: 'group', participants: [] }, 'fr');
    expect(label).toBe('Conversation sans titre');
    expect(label).not.toContain(OBJECT_ID);
    expect(conversationLabel({ participants: null }, 'fr')).toBe('Conversation sans titre');
  });
});

describe('les autres entités', () => {
  test('shareLinkLabel : le nom, sinon « Lien sans nom » — aucun identifiant ne peut y entrer', () => {
    expect(shareLinkLabel({ name: 'Webinaire de rentrée' }, 'fr')).toBe('Webinaire de rentrée');
    expect(shareLinkLabel({ name: null }, 'fr')).toBe('Lien sans nom');
    const avecSecret = { name: '', identifier: 'mshy_secret_7f3a', linkId: 'mshy_xx' };
    expect(shareLinkLabel(avecSecret, 'fr')).toBe('Lien sans nom');
  });

  test('trackingLinkLabel : nom, puis campagne, puis « Lien de suivi sans nom »', () => {
    expect(trackingLinkLabel({ name: 'Bannière', campaign: 'rentree' }, 'fr')).toBe('Bannière');
    expect(trackingLinkLabel({ name: '', campaign: 'rentree' }, 'fr')).toBe('rentree');
    expect(trackingLinkLabel({}, 'fr')).toBe('Lien de suivi sans nom');
  });

  test('postLabel : « {type} de {auteur} »', () => {
    expect(postLabel({ type: 'STORY', author: { displayName: 'Awa Diop' } }, 'fr')).toBe('Story de Awa Diop');
    expect(postLabel({ type: 'POST', author: null }, 'fr')).toBe('Publication de Personne inconnue');
  });

  test('reportLabel : « Signalement · {motif} »', () => {
    expect(reportLabel({ type: 'harassment' }, 'fr')).toBe('Signalement · Harcèlement');
    expect(reportLabel({ type: 'zzz' }, 'fr')).toBe('Signalement · Non reconnu');
  });

  test('invitationLabel : « {expéditeur} → {destinataire} »', () => {
    expect(invitationLabel({ sender: { displayName: 'Awa' }, recipient: { username: 'jean' } }, 'fr')).toBe('Awa → @jean');
  });

  test('excerptOf : espaces repliés, coupé à la limite avec « … »', () => {
    expect(excerptOf('  Bonjour\n\n  tout   le monde ')).toBe('Bonjour tout le monde');
    expect(excerptOf('a'.repeat(100))).toBe(`${'a'.repeat(79)}…`);
    expect(excerptOf('abcdef', 4)).toBe('abc…');
    expect(excerptOf('   ')).toBeNull();
    expect(excerptOf(null)).toBeNull();
  });
});

describe('booleanPhrase — jamais true/false', () => {
  const phrases = { yes: 'Les invités peuvent écrire', no: 'Les invités ne peuvent pas écrire' };

  test('dit la phrase du champ', () => {
    expect(booleanPhrase(true, phrases, 'fr')).toBe('Les invités peuvent écrire');
    expect(booleanPhrase(false, phrases, 'fr')).toBe('Les invités ne peuvent pas écrire');
  });

  test('l’inconnu se dit « Inconnu » ou la phrase donnée', () => {
    expect(booleanPhrase(null, phrases, 'fr')).toBe('Inconnu');
    expect(booleanPhrase(undefined, { ...phrases, unknown: 'Non renseigné' }, 'fr')).toBe('Non renseigné');
  });
});
