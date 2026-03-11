import { User, Participant } from '@/types';
import { SUPPORTED_LANGUAGES } from '@/types';

type ParticipantUser = {
  firstName?: string;
  lastName?: string;
  username?: string;
  systemLanguage?: string;
  useCustomDestination?: boolean;
  customDestinationLanguage?: string;
  translateToRegionalLanguage?: boolean;
  regionalLanguage?: string;
};

/**
 * Retourne le nom complet d'un utilisateur en utilisant firstName/lastName 
 * ou displayName/username en fallback
 */
export function getUserDisplayName(user: User): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  if (user.displayName) {
    return user.displayName;
  }
  
  return user.username;
}

/**
 * Retourne les initiales d'un utilisateur pour les avatars
 */
export function getUserInitials(user: User | null | undefined): string {
  if (!user) {
    return '??';
  }
  
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  
  if (user.displayName && user.displayName.includes(' ')) {
    const parts = user.displayName.split(' ');
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  
  if (user.displayName) {
    return user.displayName.substring(0, 2).toUpperCase();
  }
  
  if (user.username) {
    return user.username.substring(0, 2).toUpperCase();
  }
  
  return '??';
}

/**
 * Retourne le prénom ou displayName en fallback
 */
export function getUserFirstName(user: User | null | undefined): string {
  if (!user) {
    return 'Utilisateur';
  }
  
  if (user.firstName) {
    return user.firstName;
  }
  
  if (user.displayName) {
    return user.displayName.split(' ')[0];
  }
  
  if (user.username) {
    return user.username;
  }
  
  return 'Utilisateur';
}

/**
 * Retourne le prénom d'un membre de thread
 */
export function getThreadMemberFirstName(member: Participant): string {
  const user = member.user as ParticipantUser | undefined;
  if (user?.firstName) {
    return user.firstName;
  }

  if (member.displayName) {
    return member.displayName.split(' ')[0];
  }

  if (user?.username) {
    return user.username;
  }

  return 'Utilisateur';
}

/**
 * Formate un utilisateur pour l'affichage dans une conversation
 * Retourne "firstName (username)" avec contact si disponible
 */
export function formatUserForConversation(user: User): string {
  const firstName = getUserFirstName(user);
  let result = `${firstName} (${user.username})`;
  
  // Ajouter le contact si disponible
  if (user.phoneNumber) {
    result += ` • ${user.phoneNumber}`;
  } else if (user.email) {
    result += ` • ${user.email}`;
  }
  
  return result;
}

/**
 * Formate un membre de thread pour l'affichage dans une conversation
 * Retourne "firstName (username)"
 */
export function formatThreadMemberForConversation(member: Participant): string {
  const firstName = getThreadMemberFirstName(member);
  const user = member.user as ParticipantUser | undefined;
  const username = user?.username || member.displayName;
  return `${firstName} (${username})`;
}

/**
 * Obtient le drapeau d'une langue basé sur son code
 */
export function getLanguageFlag(languageCode: string): string {
  const language = SUPPORTED_LANGUAGES.find(lang => lang.code === languageCode);
  return language?.flag || '🌐';
}

/**
 * Formate le titre d'une conversation basé sur ses participants
 * Affiche: "🏴 username, 🏴 username, 🏴 username" (avec drapeaux des langues de lecture)
 */
export function formatConversationTitle(
  participants: Participant[],
  currentUserId: string,
  isGroup: boolean,
  members?: Array<User>
): string {
  // Si les participants sont des ThreadMember complets, utiliser la fonction dédiée
  if (participants.length > 0 && 'user' in participants[0]) {
    return formatConversationTitleFromMembers(participants, currentUserId);
  }
  
  // Fallback pour compatibilité
  const otherParticipants = participants.filter(p => p.userId !== currentUserId);
  
  if (otherParticipants.length === 0) {
    return "Conversation vide";
  }
  
  // Afficher les 3 premiers participants avec drapeau + username
  const displayParticipants = otherParticipants.slice(0, 3);
  const participantNames = displayParticipants.map(participant => {
    // Essayer de récupérer les infos complètes de l'utilisateur via members
    const memberInfo = members?.find(m => m.id === participant.userId);
    
    if (memberInfo) {
      // Déterminer la langue de lecture selon les préférences de l'utilisateur
      let readingLanguage = memberInfo.systemLanguage; // Par défaut
      
      if (memberInfo.useCustomDestination && memberInfo.customDestinationLanguage) {
        readingLanguage = memberInfo.customDestinationLanguage;
      } else if (memberInfo.translateToRegionalLanguage) {
        readingLanguage = memberInfo.regionalLanguage;
      }
      
      const flag = getLanguageFlag(readingLanguage);
      const pUser = participant.user as ParticipantUser | undefined;
      return `${flag} ${pUser?.username || participant.displayName}`;
    }

    // Fallback si pas d'infos complètes
    const pUser = participant.user as ParticipantUser | undefined;
    return `🌐 ${pUser?.username || participant.displayName}`;
  });
  
  if (otherParticipants.length > 3) {
    participantNames.push(`+${otherParticipants.length - 3} autres`);
  }
  
  return participantNames.join(', ');
}

/**
 * Formate le titre d'une conversation basé sur ses participants (ThreadMember)
 * Affiche: "🏴 username, 🏴 username, 🏴 username" (avec drapeaux des langues de lecture)
 */
export function formatConversationTitleFromMembers(
  participants: Participant[],
  currentUserId: string
): string {
  const otherParticipants = participants.filter(p => p.userId !== currentUserId);

  if (otherParticipants.length === 0) {
    return "Conversation vide";
  }

  // Afficher les 3 premiers participants avec drapeau + username
  const displayParticipants = otherParticipants.slice(0, 3);
  const participantNames = displayParticipants.map(participant => {
    const user = participant.user as ParticipantUser | undefined;

    // Déterminer la langue de lecture selon les préférences de l'utilisateur
    let readingLanguage = participant.language || user?.systemLanguage || 'en';

    if (user?.useCustomDestination && user?.customDestinationLanguage) {
      readingLanguage = user.customDestinationLanguage;
    } else if (user?.translateToRegionalLanguage && user?.regionalLanguage) {
      readingLanguage = user.regionalLanguage;
    }

    const flag = getLanguageFlag(readingLanguage);
    return `${flag} ${user?.username || participant.displayName}`;
  });

  if (otherParticipants.length > 3) {
    participantNames.push(`+${otherParticipants.length - 3} autres`);
  }

  return participantNames.join(', ');
}
