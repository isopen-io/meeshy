/**
 * Un champ PAR LECTEUR n'a pas de valeur dans une charge PARTAGÉE (#18622).
 *
 * `serializeAttachmentForSocket` rend `currentUserReactions: []` quand on ne
 * lui donne pas de `currentParticipantId` — et son propre doc-comment le dit :
 * « `currentParticipantId` absent (broadcast) → `currentUserReactions` vide ».
 * Mais `[]` n'est pas « je n'ai pas calculé », c'est **« il n'y en a pas »**, et
 * le client le lit comme tel.
 *
 * ─── Pourquoi `[]` DÉTRUIT au lieu d'être ignoré ─────────────────────────────
 *
 * Le web FUSIONNE (`apps/web/src/lib/api/realtime-apply.ts`) et ne préserve
 * d'un champ servi que `transcription` et `translations`, et seulement quand ils
 * valent `null`. `[]` n'est pas `null` : `incoming` écrase. Bob réagit 🔥 à un
 * vocal, la piste TTS de la langue suivante arrive, et son badge cesse d'être le
 * SIEN — le menu lui propose « ajouter » un emoji qu'il a déjà posé.
 *
 * ─── Ce que les TROIS clients disent de ce champ, relevé avant de changer ────
 *
 * | client | ce qu'il fait de `currentUserReactions` reçu par cet événement |
 * |---|---|
 * | Android | **le protège explicitement** : « ce qui est PERSONNEL (mes réactions, ma progression) … n'est jamais remplacé par une diffusion » (`AttachmentLiveDeltas.enriched`) |
 * | iOS | **ne le lit pas** : `handleAttachmentUpdated` ne patche que `transcription` et `translations` |
 * | web | **le recopie** — le seul des trois, et le seul touché |
 *
 * Deux clients sur trois tiennent déjà cet événement pour muet sur les
 * réactions. La forme juste est donc de **ne pas porter la clé du tout** : elle
 * dit « cet événement ne parle pas de ça », ce que `[]` ne peut pas dire. Les
 * trois la déclarent facultative (`[String]?`, `List<String>? = null`, `?? []`),
 * donc l'omettre est rétrocompatible — et c'est la seule forme qui RÉPARE le web
 * sans y toucher : une clé absente ne survit pas à `{ ...cached, ...incoming }`.
 *
 * La diffusion par destinataire ne sauverait rien : la branche chaînée du plan
 * signé partage UNE charge, et son doc-comment dit pourquoi.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { serializeAttachmentForSocket, aggregateAttachmentReactions } from '../serializeAttachmentForSocket';

const LIGNE = {
  id: 'att-vocal',
  messageId: 'msg-vocal',
  mimeType: 'audio/m4a',
  fileSize: 120_000,
  fileUrl: 'https://cdn.meeshy.me/uploads/vocal.m4a',
  transcription: null,
  translations: null,
  createdAt: new Date('2026-11-15T10:00:00Z'),
  reactions: [
    { emoji: '🔥', participantId: 'p-bob' },
    { emoji: '😍', participantId: 'p-alice' },
  ],
} as const;

const servi = (currentParticipantId?: string) =>
  serializeAttachmentForSocket({ ...LIGNE } as Record<string, unknown>, currentParticipantId);

describe('une charge PARTAGÉE ne porte pas de champ par lecteur (#18622)', () => {
  /**
   * LE témoin du lot. `toBeUndefined()` ne suffirait pas : la clé PRÉSENTE à
   * `undefined` écrase tout autant lors d'un `{ ...cached, ...incoming }`.
   * C'est la PRÉSENCE DE LA CLÉ qui décide, donc c'est elle qu'on mesure.
   */
  it('n’émet AUCUNE clé `currentUserReactions` en diffusion', () => {
    expect('currentUserReactions' in servi()).toBe(false);
  });

  /**
   * L'autre moitié : une garde qui retire le champ PARTOUT casserait le fil
   * `/sync` et la page, qui le servent par lecteur et dont le client dépend
   * pour savoir quelles pastilles sont les siennes.
   */
  it('sert le champ quand le lecteur est NOMMÉ', () => {
    expect(servi('p-bob').currentUserReactions).toEqual(['🔥']);
  });

  /** Et il reste PAR LECTEUR : celui d'à côté n'hérite de rien. */
  it('ne sert à un lecteur que SES emojis', () => {
    expect(servi('p-alice').currentUserReactions).toEqual(['😍']);
  });

  /**
   * L'agrégat PARTAGÉ, lui, est servi dans les deux cas : c'est un compte, pas
   * une appartenance. Le retirer avec le champ par lecteur retirerait la
   * pastille elle-même.
   */
  it('sert le `reactionSummary` partagé dans les deux cas', () => {
    expect(servi().reactionSummary).toEqual({ '🔥': 1, '😍': 1 });
    expect(servi('p-bob').reactionSummary).toEqual({ '🔥': 1, '😍': 1 });
  });

  /**
   * La fonction d'agrégation garde sa forme TOTALE : elle répond à une question
   * (« qui a réagi, et moi ? »), et c'est le SÉRIALISEUR qui décide ce qu'il
   * met sur le fil. Les confondre obligerait chaque appelant à retraduire
   * « absent » en « vide ».
   */
  it('laisse l’agrégateur rendre une liste vide — c’est le fil qui se tait, pas lui', () => {
    expect(aggregateAttachmentReactions(LIGNE.reactions).currentUserReactions).toEqual([]);
  });
});
