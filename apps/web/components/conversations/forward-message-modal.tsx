'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, Send, Check, Loader2, Forward } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';
import { useUser } from '@/stores';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { conversationsService } from '@/services/conversations.service';
import { contactsDirectoryService, type DirectoryContact } from '@/services/contacts-directory.service';
import { useFriendRequestsV2 } from '@/hooks/v2/use-friend-requests-v2';
import { ForwardPickerModel, type TargetState } from '@/lib/forward-picker-model';
import {
  isReachableForwardConversation,
  mergeForwardTargets,
  type ForwardTarget,
} from '@/lib/forward-target-merge';
import { generateClientMessageId } from '@/utils/client-message-id';
import { postsService } from '@/services/posts.service';
import {
  publicationTargetsFor,
  publicationNeedsCaptureConfirmation,
  type PublicationTarget,
} from '@meeshy/shared/utils/forward-to-publication';
import { getConversationNameOnly } from './conversation-item/conversation-utils';
import { resolveOtherDirectParticipantUser } from './lentille/lentille-row-utils';
import type { Conversation, Message } from '@meeshy/shared/types';
import type { FriendRequest } from '@/types/contacts';

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message;
  sourceConversationId?: string;
  conversations: readonly Conversation[];
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  /**
   * Seam de test uniquement : remplace les contacts dérivés de
   * `useFriendRequestsV2().connected`, pour isoler un scénario de contact sans
   * avoir à reconstituer une relation d'amitié complète. JAMAIS fourni par un
   * appelant en production.
   */
  contactsOverride?: readonly ForwardTarget[];
}

const stateKey = (state: TargetState): string =>
  typeof state === 'object' ? 'failed' : state;

// Les data-testid existants (`forward-row-conv-a`) portent l'id de
// conversation NU ; une cible « contact » sans conversation n'en a pas et
// retombe sur l'id du ForwardTarget (`user:<id>`). Les deux contrats
// coexistent — ni l'un ni l'autre n'est renommé.
const rowIdOf = (target: ForwardTarget): string => target.conversationId ?? target.id;

type DirectParticipant = { id?: string; displayName?: string; username?: string; avatar?: string | null } | null;

function conversationToTarget(conversation: Conversation, currentUserId: string | null): ForwardTarget {
  const other: DirectParticipant =
    conversation.type === 'direct'
      ? (resolveOtherDirectParticipantUser(conversation, currentUserId) as DirectParticipant)
      : null;
  const title = getConversationNameOnly(conversation, () => other);
  return {
    id: `conv:${conversation.id}`,
    kind: 'conversation',
    conversationId: conversation.id,
    userId: other?.id,
    title,
    subtitle: conversation.type,
    avatarUrl: other?.avatar ?? conversation.avatar ?? undefined,
  };
}

function friendRequestToTarget(request: FriendRequest, currentUserId: string | null): ForwardTarget | null {
  const other = request.senderId === currentUserId ? request.receiver : request.sender;
  if (!other?.id) return null;
  return {
    id: `user:${other.id}`,
    kind: 'contact',
    userId: other.id,
    title: other.displayName || other.username || other.id,
    avatarUrl: other.avatar ?? undefined,
  };
}

function directoryContactToTarget(contact: DirectoryContact): ForwardTarget | null {
  const matched = contact.matchedUser;
  if (!matched?.id) return null;
  return {
    id: `user:${matched.id}`,
    kind: 'contact',
    userId: matched.id,
    title: matched.displayName || matched.username || contact.displayName || matched.id,
    avatarUrl: matched.avatar,
  };
}

export function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  sourceConversationId,
  conversations,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  contactsOverride,
}: ForwardMessageModalProps) {
  const { t } = useI18n('conversations');
  const currentUser = useUser();
  const currentUserId = currentUser?.id ?? null;
  const { connected } = useFriendRequestsV2({ enabled: isOpen, currentUserId: currentUserId ?? undefined });

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [remoteResults, setRemoteResults] = useState<readonly ForwardTarget[]>([]);
  const [searchError, setSearchError] = useState(false);
  const searchTokenRef = useRef(0);

  const modelRef = useRef(new ForwardPickerModel());
  const hasToastedRef = useRef(false);
  // Registre des envois NON CONFIRMÉS, par (message source, cible). Le gateway
  // dédoublonne sur `(conversationId, clientMessageId)` et la façade rend
  // `{success:false, timedOut:true}` alors que `message:new` peut encore
  // arriver : un retry qui frapperait un cid neuf produirait un DOUBLON. La
  // clé porte l'id du message pour qu'un transfert d'un AUTRE message vers la
  // même cible ne soit jamais dédoublonné contre celui-ci ; l'entrée est
  // retirée au succès confirmé pour qu'un re-transfert volontaire reste un
  // envoi neuf.
  const clientMessageIdsRef = useRef(new Map<string, string>());
  // Conversation créée pour une cible « contact » (rowId -> conversationId) :
  // un retry après échec réutilise le MÊME fil au lieu d'en ouvrir un second.
  const pendingConversationIdsRef = useRef(new Map<string, string>());
  const [, bump] = useReducer((x: number) => x + 1, 0);

  // Instantané au montage/réouverture — `setConversations` (pagination hook)
  // COLLAPSE toutes les pages en une seule au fil d'écritures tierces ; relire
  // `conversations` en continu ferait retomber le scroll de la modale à la
  // première page en plein chargement. Le snapshot est ensuite ÉTENDU (jamais
  // remplacé) par les nouveaux ids apportés par `onLoadMore`.
  const [localConversations, setLocalConversations] = useState<readonly Conversation[]>(conversations);
  const seenConversationIdsRef = useRef<Set<string>>(new Set(conversations.map((c) => c.id)));

  useEffect(() => {
    if (!isOpen) return;
    modelRef.current = new ForwardPickerModel();
    hasToastedRef.current = false;
    pendingConversationIdsRef.current = new Map();
    setSearchQuery('');
    setRemoteResults([]);
    setSearchError(false);
    setLocalConversations(conversations);
    seenConversationIdsRef.current = new Set(conversations.map((c) => c.id));
    bump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, message.id]);

  useEffect(() => {
    if (!isOpen) return;
    const seen = seenConversationIdsRef.current;
    const additions = conversations.filter((c) => !seen.has(c.id));
    if (additions.length === 0) return;
    additions.forEach((c) => seen.add(c.id));
    setLocalConversations((prev) => [...prev, ...additions]);
  }, [conversations, isOpen]);

  const isBrowsing = searchQuery.trim().length === 0;

  // Refs pour ne PAS reconstruire l'observateur à chaque changement de
  // hasMore/isLoadingMore (motif `UserConversationsSection.tsx:282`) — seule
  // l'ouverture de la modale ou le basculement recherche/liste doit le faire.
  const hasMoreRef = useRef(hasMore);
  const isLoadingMoreRef = useRef(isLoadingMore);
  const onLoadMoreRef = useRef(onLoadMore);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);
  useEffect(() => { onLoadMoreRef.current = onLoadMore; }, [onLoadMore]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !isBrowsing) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && hasMoreRef.current && !isLoadingMoreRef.current) {
          onLoadMoreRef.current?.();
        }
      },
      { root: scrollRef.current, rootMargin: '120px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isOpen, isBrowsing]);

  // Le gateway ne pose PAS de `title` sur un tête-à-tête (« le frontend résout
  // le nom de l'interlocuteur ») : sans le SSOT, la ligne afficherait
  // l'identifiant technique `mshy_direct-…` et la recherche par prénom ne
  // trouverait rien.
  const conversationTargets = useMemo<readonly ForwardTarget[]>(
    () =>
      localConversations
        .filter((conv) => conv.id !== sourceConversationId)
        .map((conv) => conversationToTarget(conv, currentUserId)),
    [localConversations, sourceConversationId, currentUserId],
  );

  const connectedTargets = useMemo<readonly ForwardTarget[]>(() => {
    if (contactsOverride) return contactsOverride;
    return connected
      .map((request) => friendRequestToTarget(request, currentUserId))
      .filter((target): target is ForwardTarget => target !== null);
  }, [contactsOverride, connected, currentUserId]);

  const browsingTargets = useMemo(
    () => mergeForwardTargets(conversationTargets, connectedTargets),
    [conversationTargets, connectedTargets],
  );

  // Recherche unifiée (Step 4) : filtre immédiat et synchrone du snapshot
  // local (conversations + contacts connectés), augmenté — jamais remplacé —
  // par la recherche distante une fois le débounce écoulé. `searchConversations`
  // avale ses erreurs réseau et rend `[]` (indiscernable d'un « aucun
  // résultat ») ; `contactsDirectoryService.list` PROPAGE les siennes, c'est
  // donc l'unique signal fiable pour distinguer un échec d'une liste vide ici.
  useEffect(() => {
    if (!isOpen) return;
    const query = debouncedQuery.trim();
    if (query.length < 2) {
      // Invalide aussi le jeton ici : une requête en vol pour une saisie plus
      // longue ne doit PAS réinjecter ses résultats une fois la requête
      // redescendue sous le seuil — sinon `searchTokenRef.current !== token`
      // reste faux et une réponse tardive « passe » malgré l'affichage déjà vidé.
      ++searchTokenRef.current;
      setRemoteResults([]);
      setSearchError(false);
      return;
    }
    const token = ++searchTokenRef.current;
    setSearchError(false);
    Promise.allSettled([
      conversationsService.searchConversations(query),
      contactsDirectoryService.list({ q: query, limit: 20 }),
    ]).then(([conversationsOutcome, directoryOutcome]) => {
      if (searchTokenRef.current !== token) return; // réponse obsolète, ignorée
      const remoteConversationTargets =
        conversationsOutcome.status === 'fulfilled'
          ? conversationsOutcome.value
              .filter((conv) => conv.id !== sourceConversationId)
              // Filtre d'appartenance (spec S.1) : la recherche serveur rend
              // aussi les salons publics dont on n'est PAS membre. `isMember`
              // est le signal officiel ; le repli sur `participants` ne sert
              // qu'à un gateway antérieur qui ne le porte pas.
              .filter((conv) =>
                isReachableForwardConversation(
                  conv.type,
                  (conv.participants ?? []).map((p) => p.userId ?? p.user?.id ?? '').filter(Boolean),
                  currentUserId,
                  conv.isMember,
                ),
              )
              .map((conv) => conversationToTarget(conv, currentUserId))
          : [];
      const directoryTargets =
        directoryOutcome.status === 'fulfilled'
          ? directoryOutcome.value.contacts
              .map(directoryContactToTarget)
              .filter((target): target is ForwardTarget => target !== null)
          : [];
      setRemoteResults(mergeForwardTargets(remoteConversationTargets, directoryTargets));
      setSearchError(directoryOutcome.status === 'rejected');
    });
  }, [debouncedQuery, isOpen, sourceConversationId, currentUserId]);

  const targets = useMemo<readonly ForwardTarget[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return browsingTargets;
    const localMatches = browsingTargets.filter((target) => target.title.toLowerCase().includes(query));
    return mergeForwardTargets(localMatches, remoteResults);
  }, [browsingTargets, searchQuery, remoteResults]);

  const targetsByRowId = useMemo(() => {
    const map = new Map<string, ForwardTarget>();
    targets.forEach((target) => map.set(rowIdOf(target), target));
    return map;
  }, [targets]);

  const resolveConversationId = useCallback(async (target: ForwardTarget): Promise<string> => {
    if (target.conversationId) return target.conversationId;
    const rowId = rowIdOf(target);
    const pending = pendingConversationIdsRef.current;
    const existing = pending.get(rowId);
    if (existing) return existing;
    if (!target.userId) throw new Error('missing userId for contact target');
    // La création n'a lieu QU'À L'ENVOI, jamais à la sélection.
    const created = await conversationsService.createConversation({
      type: 'direct',
      participantIds: [target.userId],
    });
    pending.set(rowId, created.id);
    return created.id;
  }, []);

  const transmit = useCallback(
    async (rowId: string, conversationId: string) => {
      const model = modelRef.current;
      const clientMessageIds = clientMessageIdsRef.current;
      const cidKey = `${message.id}:${conversationId}`;
      const clientMessageId = clientMessageIds.get(cidKey) ?? generateClientMessageId();
      clientMessageIds.set(cidKey, clientMessageId);
      try {
        const result = await meeshySocketIOService.sendMessage(
          conversationId,
          message.content || '',
          message.originalLanguage,
          undefined,
          undefined,
          undefined,
          undefined,
          clientMessageId,
          message.id,
          sourceConversationId || undefined,
        );
        const ok = result?.success ?? false;
        if (ok) clientMessageIds.delete(cidKey);

        // Le mot part APRÈS, et seulement si le transfert a abouti : l'envoyer
        // sur un transfert échoué laisserait « regarde ça » seul dans un fil,
        // sans le message qu'il commente. Il voyage comme un message PROPRE —
        // aucun `forwardedFromId` — parce que `forwardedFromId` désigne un
        // message d'origine dont le texte est celui de l'original ; réécrire ce
        // texte ferait mentir l'aperçu de source servi aux clients.
        const trimmedNote = noteRef.current.trim();
        if (ok && trimmedNote) {
          await meeshySocketIOService.sendMessage(
            conversationId,
            trimmedNote,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            generateClientMessageId(),
          );
        }
        model.finishSend(rowId, ok, ok ? undefined : t('forward.failed', 'Échec du transfert'));
        if (ok && !hasToastedRef.current) {
          hasToastedRef.current = true;
          toast.success(t('forward.sent', 'Message transféré'));
        }
      } catch (error) {
        model.finishSend(
          rowId,
          false,
          error instanceof Error && error.message
            ? error.message
            : t('forward.failed', 'Échec du transfert'),
        );
      }
      bump();
    },
    [message.content, message.originalLanguage, message.id, sourceConversationId, t],
  );

  const sendToTarget = useCallback(
    async (target: ForwardTarget) => {
      const rowId = rowIdOf(target);
      try {
        const conversationId = await resolveConversationId(target);
        await transmit(rowId, conversationId);
      } catch (error) {
        modelRef.current.finishSend(
          rowId,
          false,
          error instanceof Error && error.message ? error.message : t('forward.failed', 'Échec du transfert'),
        );
        bump();
      }
    },
    [resolveConversationId, transmit, t],
  );

  const handleImmediateSend = useCallback(
    (rowId: string) => {
      if (!modelRef.current.beginSend(rowId)) return;
      bump();
      const target = targetsByRowId.get(rowId);
      if (!target) return;
      void sendToTarget(target);
    },
    [sendToTarget, targetsByRowId],
  );

  const handleBatchSend = useCallback(() => {
    const batch = modelRef.current.beginBatch();
    bump();
    void (async () => {
      for (const rowId of batch) {
        const target = targetsByRowId.get(rowId);
        if (!target) continue;
        await sendToTarget(target);
      }
    })();
  }, [sendToTarget, targetsByRowId]);

  const handleRowTap = useCallback((rowId: string) => {
    modelRef.current.tapRow(rowId);
    bump();
  }, []);

  // La PREMIÈRE pièce jointe décide : le fil rend un média par publication, et
  // une feuille qui proposerait « publier » sur un lot hétérogène mentirait sur
  // ce qui partirait réellement.
  const primaryAttachment = message.attachments?.[0];
  const publicationTargets = publicationTargetsFor(primaryAttachment?.mimeType);

  const [pendingCapture, setPendingCapture] = useState<PublicationTarget | null>(null);

  const publish = useCallback(
    async (target: PublicationTarget) => {
      if (!primaryAttachment) return;
      try {
        await postsService.publishAttachment({
          attachmentId: primaryAttachment.id,
          target,
          content: noteRef.current.trim() || undefined,
          capturedInApp: primaryAttachment.capturedInApp || undefined,
        });
        toast.success(t('forward.published', 'Publié'));
        onClose();
      } catch {
        toast.error(t('forward.publish-failed', 'La publication a échoué'));
      }
    },
    [primaryAttachment, onClose, t],
  );

  const handlePublishTap = useCallback(
    (target: PublicationTarget) => {
      // Publier une capture est irréversible du point de vue de qui l'a prise :
      // une photo sortie de la caméra n'a encore été vue par personne. On
      // demande donc, une fois, avant d'ouvrir le média à un fil entier.
      if (publicationNeedsCaptureConfirmation({ capturedInApp: !!primaryAttachment?.capturedInApp, target })) {
        setPendingCapture(target);
        return;
      }
      void publish(target);
    },
    [primaryAttachment, publish],
  );

  const [note, setNote] = useState('');
  // Lu par `transmit` sans le faire dépendre de la frappe : une dépendance sur
  // `note` recréerait le callback à chaque caractère, et avec lui toute la liste
  // de cibles qui le porte.
  const noteRef = useRef('');
  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  const selectedCount = modelRef.current.selectedIds().length;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5" />
            {t('forward.title', 'Transférer le message')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid="forward-search"
              placeholder={t('forward.search', 'Rechercher une conversation...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {!isBrowsing && searchError && (
            <p data-testid="forward-search-error" className="text-xs text-destructive px-1">
              {t('forward.search-error', 'La recherche a échoué. Réessayez.')}
            </p>
          )}

          <div ref={scrollRef} className="h-72 overflow-y-auto">
            <div className="space-y-1 pr-2">
              {targets.map((target) => {
                const rowId = rowIdOf(target);
                const state = modelRef.current.state(rowId);
                const key = stateKey(state);
                const isSelected = state === 'selected';
                const isSending = state === 'sending';
                const isSent = state === 'sent';
                const failedReason = typeof state === 'object' ? state.failed : null;
                return (
                  <div key={rowId}>
                    <div
                      data-testid={`forward-row-${rowId}`}
                      data-state={key}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex items-center justify-between gap-3 p-2.5 rounded-lg border cursor-pointer outline-none',
                        'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
                        isSelected && 'bg-primary/10 border-primary',
                        isSent && 'opacity-70 cursor-default',
                      )}
                      onClick={() => handleRowTap(rowId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowTap(rowId);
                        }
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={target.avatarUrl} />
                          <AvatarFallback>{target.title.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{target.title}</p>
                          {target.subtitle && (
                            <p className="text-xs text-muted-foreground">{target.subtitle}</p>
                          )}
                        </div>
                        {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                      </div>
                      <Button
                        data-testid={`forward-send-${rowId}`}
                        variant={isSent ? 'ghost' : 'outline'}
                        size="sm"
                        disabled={isSending || isSent}
                        aria-label={t('forward.send', 'Envoyer')}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleImmediateSend(rowId);
                        }}
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : isSent ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {failedReason !== null && (
                      <p
                        data-testid={`forward-failed-${rowId}`}
                        className="px-2.5 pt-1 text-xs text-destructive"
                      >
                        {failedReason || t('forward.failed', 'Échec du transfert')}
                      </p>
                    )}
                  </div>
                );
              })}
              {isBrowsing && <div data-testid="forward-load-more-sentinel" ref={sentinelRef} />}
            </div>
          </div>
        </div>

        {publicationTargets.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1.5 px-1">
              {t('forward.publish-section', 'Publier')}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {publicationTargets.map((target) => (
                <Button
                  key={target}
                  variant="outline"
                  size="sm"
                  data-testid={`forward-publish-${target.toLowerCase()}`}
                  onClick={() => handlePublishTap(target)}
                >
                  {target === 'STORY'
                    ? t('forward.publish-story', 'Ma story')
                    : target === 'REEL'
                      ? t('forward.publish-reel', 'Nouveau réel')
                      : t('forward.publish-post', 'Nouveau post')}
                </Button>
              ))}
            </div>

            {pendingCapture && (
              <div data-testid="forward-publish-capture-warning" className="mt-2 rounded-lg border p-2.5">
                <p className="text-xs mb-2">
                  {t(
                    'forward.publish-capture-warning',
                    "Ce média vient d'être capturé par l'application. Le publier le rendra visible au-delà de cette conversation.",
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    data-testid="forward-publish-confirm"
                    onClick={() => {
                      const target = pendingCapture;
                      setPendingCapture(null);
                      void publish(target);
                    }}
                  >
                    {t('forward.publish-confirm', 'Publier')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="forward-publish-cancel"
                    onClick={() => setPendingCapture(null)}
                  >
                    {t('forward.publish-cancel', 'Annuler')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Le mot d'accompagnement, au plus près du geste d'envoi — il vaut pour
            TOUTES les cibles retenues, comme la feuille de partage des
            applications de référence. */}
        <div className="pt-2">
          <Input
            data-testid="forward-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('forward.note', 'Ajouter un message…')}
            aria-label={t('forward.note', 'Ajouter un message…')}
          />
        </div>

        <DialogFooter>
          {selectedCount > 0 && (
            <Button data-testid="forward-send-selected" onClick={handleBatchSend}>
              <Send className="h-4 w-4 mr-2" />
              {t('forward.send-selected', { count: selectedCount })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
