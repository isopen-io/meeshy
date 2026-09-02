/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  banniereDeNotification,
  cadrageDeBanniere,
  titreDeBanniere,
  TYPES_TRANSCRITS,
  type NotificationServie,
  type TraduireDansLaConversation,
} from '@/lib/notifications/banniere';

/**
 * **Les sept cadrages de la bannière v3** (#4454, miroir de #4452 iOS et #4453
 * web existant).
 *
 * Ce que ce témoin protège n'est pas « le texte est joli » mais deux
 * propriétés que les deux surfaces précédentes ont mis trois passes à tenir :
 *
 *  1. **La phrase d'action vient du SERVEUR.** Aucun cas ci-dessous n'attend
 *     une chaîne française produite par la v3. Le seul appel de traduction est
 *     « X dans {groupe} », et il est INJECTÉ — un test qui vérifierait une
 *     phrase en dur ici gèlerait précisément ce que #4451 a déplacé côté
 *     serveur.
 *  2. **Le TYPE décide du cadrage, jamais la forme des champs.** `subtitle`
 *     porte le nom du GROUPE sur un message et la PHRASE D'ACTION partout
 *     ailleurs. Le cas « message de groupe » ci-dessous a donc un `subtitle`
 *     qui NE DOIT PAS être concaténé au titre — c'est le défaut exact que la
 *     lecture « si subtitle existe, c'est une action » produirait.
 */

const traduire: TraduireDansLaConversation = ({ acteur, groupe }) =>
  `${acteur} dans « ${groupe} »`;

const notification = (parts: NotificationServie): NotificationServie => parts;

const acteurAlice = { displayName: 'Alice Martin', username: 'alice' };

describe('les sept cadrages de la bannière', () => {
  it('commentaire de contenu — la phrase serveur fait le titre, le commentaire le corps', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'post_comment',
        title: 'Alice Martin',
        subtitle: 'a commenté votre réel',
        content: 'superbe !',
        actor: acteurAlice,
        metadata: { postThumbnailUrl: 'https://cdn/x.jpg' },
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin a commenté votre réel');
    expect(banniere.corps).toBe('superbe !');
    expect(banniere.vignette).toBe('https://cdn/x.jpg');
  });

  it('nouvelle publication — le corps ne répète pas la phrase déjà servie en titre', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'friend_new_story',
        title: 'Alice Martin',
        subtitle: 'a publié une nouvelle story',
        // Le serveur garantit une ligne de liste non vide : faute d'extrait,
        // `content` retombe sur la phrase d'action elle-même.
        content: 'a publié une nouvelle story',
        actor: acteurAlice,
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin a publié une nouvelle story');
    expect(banniere.corps).toBeNull();
  });

  it('message privé — le titre est le seul nom de l’acteur', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'new_message',
        title: 'Alice Martin',
        content: 'on se voit à 18h ?',
        actor: acteurAlice,
        context: { conversationType: 'direct', conversationTitle: 'Alice Martin' },
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin');
    expect(banniere.corps).toBe('on se voit à 18h ?');
  });

  it('message de groupe — « X dans {groupe} », et le sous-titre n’est PAS une phrase d’action', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'new_message',
        title: 'Alice Martin',
        // Sur un message, `subtitle` porte le nom du GROUPE. Le concaténer
        // écrirait « Alice Martin Les collègues ».
        subtitle: 'Les collègues',
        content: 'je suis en route',
        actor: acteurAlice,
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin dans « Les collègues »');
    expect(banniere.corps).toBe('je suis en route');
  });

  it('message de groupe — le nom LOCAL du groupe l’emporte sur celui du fil', () => {
    const titre = titreDeBanniere(
      notification({
        type: 'new_message',
        actor: acteurAlice,
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
      }),
      traduire,
      'Équipe produit',
    );

    expect(titre).toBe('Alice Martin dans « Équipe produit »');
  });

  it('relation acceptée — la phrase serveur se suffit, aucun corps', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'friend_accepted',
        title: 'Alice Martin',
        subtitle: 'a accepté votre demande',
        content: 'Nouvelle relation',
        actor: acteurAlice,
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin a accepté votre demande');
    expect(banniere.corps).toBeNull();
  });

  it('demande de relation — idem, et sans corps de répétition', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'friend_request',
        title: 'Alice Martin',
        subtitle: 'veut se connecter',
        content: 'Nouvelle demande de contact',
        actor: acteurAlice,
      }),
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin veut se connecter');
    expect(banniere.corps).toBeNull();
  });

  it('réaction à un contenu — la pastille se tait quand la phrase porte déjà l’émoji', () => {
    const porte = banniereDeNotification(
      notification({
        type: 'story_reaction',
        title: 'Alice Martin',
        subtitle: 'a réagi 🔥 à votre story',
        actor: acteurAlice,
        metadata: { emoji: '🔥' },
      }),
      traduire,
    );
    expect(porte.titre).toBe('Alice Martin a réagi 🔥 à votre story');
    expect(porte.reaction).toBeNull();

    const absente = banniereDeNotification(
      notification({
        type: 'story_reaction',
        title: 'Alice Martin',
        subtitle: 'a réagi à votre story',
        actor: acteurAlice,
        metadata: { reactionEmoji: '❤️' },
      }),
      traduire,
    );
    expect(absente.reaction).toBe('❤️');
  });
});

describe('le TYPE décide du cadrage, jamais la forme des champs', () => {
  it('range chaque famille là où sa règle de titre s’applique', () => {
    expect(cadrageDeBanniere({ type: 'new_message' })).toBe('conversation');
    expect(cadrageDeBanniere({ type: 'message_reaction' })).toBe('conversation');
    expect(cadrageDeBanniere({ type: 'friend_request' })).toBe('relation');
    expect(cadrageDeBanniere({ type: 'story_reaction' })).toBe('action');
    expect(cadrageDeBanniere({ type: 'un_type_inconnu' })).toBe('action');
  });

  it('une réaction à un MESSAGE se cadre en conversation, et porte pourtant sa pastille', () => {
    // Les deux ensembles se croisent sur ce seul type : le cadrage vient de
    // `conversation` (le titre est l'acteur, ou « X dans {groupe} ») tandis
    // que la pastille vient de `réaction`. Un module qui aurait fait des trois
    // ensembles une partition aurait perdu l'un des deux.
    const banniere = banniereDeNotification(
      {
        type: 'message_reaction',
        actor: acteurAlice,
        context: { conversationType: 'group', conversationTitle: 'Les collègues' },
        metadata: { reactionEmoji: '👍' },
      },
      traduire,
    );

    expect(banniere.titre).toBe('Alice Martin dans « Les collègues »');
    expect(banniere.reaction).toBe('👍');
  });
});

describe('ce que la bannière REFUSE de fabriquer', () => {
  it('sans phrase d’action ni titre riche, elle sert l’acteur — jamais une phrase française', () => {
    const titre = titreDeBanniere(
      notification({ type: 'post_comment', actor: acteurAlice }),
      traduire,
    );

    expect(titre).toBe('Alice Martin');
  });

  it('un titre REST déjà entier n’est pas rallongé par le sous-titre', () => {
    const titre = titreDeBanniere(
      notification({
        type: 'post_comment',
        title: 'Alice Martin a commenté votre réel',
        subtitle: 'Votre réel',
        actor: acteurAlice,
      }),
      traduire,
    );

    expect(titre).toBe('Alice Martin a commenté votre réel');
  });

  it('une vignette de message protégé est absente du fil, et rien ne la remplace', () => {
    const banniere = banniereDeNotification(
      notification({
        type: 'new_message',
        actor: acteurAlice,
        context: { conversationType: 'direct', firstAttachmentMimeType: 'image/jpeg' },
      }),
      traduire,
    );

    expect(banniere.vignette).toBeNull();
  });

  it('une charge illisible ne produit ni titre fabriqué ni exception', () => {
    const banniere = banniereDeNotification(
      notification({ type: 42, actor: 'pas un objet', metadata: [], context: null }),
      traduire,
    );

    expect(banniere.titre).toBe('');
    expect(banniere.corps).toBeNull();
    expect(banniere.reaction).toBeNull();
    expect(banniere.vignette).toBeNull();
  });
});

describe('les littéraux de type transcrivent l’énumération partagée', () => {
  const source = (): string =>
    readFileSync(
      join(__dirname, '..', '..', '..', 'packages', 'shared', 'types', 'notification.ts'),
      'utf8',
    );

  it('lit bien la source partagée — sans quoi la garde ci-dessous serait vide', () => {
    const contenu = source();
    expect(contenu).toContain('NotificationTypeEnum');
    expect(contenu.length).toBeGreaterThan(1000);
    expect(TYPES_TRANSCRITS.size).toBe(13);
  });

  it('chaque littéral transcrit est bien un membre de NotificationTypeEnum', () => {
    const contenu = source();
    const absents = [...TYPES_TRANSCRITS].filter(
      (valeur) => !contenu.includes(`= '${valeur}'`),
    );

    expect(absents).toEqual([]);
  });
});
