import {
  MessageSquare,
  Smile,
  TrendingUp,
  Reply,
  AtSign,
  Send,
  UserPlus,
  Building2,
  Link as LinkIcon,
  Paperclip,
  Shield,
  UserCheck,
  Phone,
  Target,
  Share2,
  Users2,
  MousePointerClick,
  Eye,
  Users,
  Activity
} from 'lucide-react';

export const USER_CRITERIA = [
  { value: 'messages_sent', label: 'Messages envoyés', icon: MessageSquare },
  { value: 'reactions_given', label: 'Réactions données', icon: Smile },
  { value: 'reactions_received', label: 'Réactions reçues', icon: TrendingUp },
  { value: 'replies_received', label: 'Réponses reçues', icon: Reply },
  { value: 'mentions_received', label: 'Mentions reçues', icon: AtSign },
  { value: 'mentions_sent', label: 'Mentions envoyées', icon: Send },
  { value: 'conversations_joined', label: 'Conversations rejointes', icon: UserPlus },
  { value: 'communities_created', label: 'Communautés créées', icon: Building2 },
  { value: 'share_links_created', label: 'Liens de partage créés', icon: LinkIcon },
  { value: 'files_shared', label: 'Fichiers partagés', icon: Paperclip },
  { value: 'reports_sent', label: 'Signalements envoyés', icon: Shield },
  { value: 'reports_received', label: 'Signalements reçus', icon: Shield },
  { value: 'friend_requests_sent', label: 'Demandes d\'amitié envoyées', icon: UserCheck },
  { value: 'friend_requests_received', label: 'Demandes d\'amitié reçues', icon: UserCheck },
  { value: 'calls_initiated', label: 'Appels initiés', icon: Phone },
  { value: 'call_participations', label: 'Participations appels', icon: Phone },
  { value: 'most_referrals_via_affiliate', label: 'Parrainages (affiliation)', icon: Target },
  { value: 'most_referrals_via_sharelinks', label: 'Parrainages (liens partagés)', icon: Share2 },
  { value: 'most_contacts', label: 'Nombre de contacts', icon: Users2 },
  { value: 'most_tracking_links_created', label: 'Liens trackés créés', icon: LinkIcon },
  { value: 'most_tracking_link_clicks', label: 'Clics sur liens trackés', icon: MousePointerClick }
];

export const CONVERSATION_CRITERIA = [
  { value: 'message_count', label: 'Nombre de messages', icon: MessageSquare },
  { value: 'member_count', label: 'Nombre de membres', icon: Users },
  { value: 'reaction_count', label: 'Nombre de réactions', icon: Smile },
  { value: 'files_shared', label: 'Fichiers partagés', icon: Paperclip },
  { value: 'call_count', label: 'Nombre d\'appels', icon: Phone },
  { value: 'recent_activity', label: 'Activité récente', icon: Activity }
];

export const MESSAGE_CRITERIA = [
  { value: 'most_reactions', label: 'Plus de réactions', icon: Smile },
  { value: 'most_replies', label: 'Plus répondu', icon: Reply },
  { value: 'most_mentions', label: 'Plus de mentions', icon: AtSign }
];

export const LINK_CRITERIA = [
  { value: 'tracking_links_most_visited', label: 'Liens trackés (visites totales)', icon: MousePointerClick },
  { value: 'tracking_links_most_unique', label: 'Liens trackés (visiteurs uniques)', icon: Eye },
  { value: 'share_links_most_used', label: 'Liens de partage (utilisations)', icon: Share2 },
  { value: 'share_links_most_unique_sessions', label: 'Liens de partage (sessions uniques)', icon: Users }
];

export const RANKING_CRITERIA = {
  users: USER_CRITERIA,
  conversations: CONVERSATION_CRITERIA,
  messages: MESSAGE_CRITERIA,
  links: LINK_CRITERIA
};

export const MEDAL_COLORS = [
  'text-yellow-500',
  'text-gray-400',
  'text-amber-700'
];
