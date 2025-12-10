/**
 * Test Fixtures for Video Calls
 *
 * Provides mock data for testing video call functionality
 */

export const mockUsers = {
  userA: {
    id: 'user-a-test',
    email: 'user-a@meeshy.test',
    username: 'Alice Test',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  },
  userB: {
    id: 'user-b-test',
    email: 'user-b@meeshy.test',
    username: 'Bob Test',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  },
  userC: {
    id: 'user-c-test',
    email: 'user-c@meeshy.test',
    username: 'Charlie Test',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  },
};

export const mockConversations = {
  direct: {
    id: 'conv-direct-ab',
    type: 'DIRECT' as const,
    participants: [mockUsers.userA, mockUsers.userB],
    createdAt: new Date('2025-01-15T10:00:00Z'),
    updatedAt: new Date('2025-01-15T10:00:00Z'),
  },
  group2Members: {
    id: 'conv-group-ab',
    type: 'GROUP' as const,
    name: 'Test Group (2 members)',
    participants: [mockUsers.userA, mockUsers.userB],
    createdAt: new Date('2025-01-15T11:00:00Z'),
    updatedAt: new Date('2025-01-15T11:00:00Z'),
  },
  group3Members: {
    id: 'conv-group-abc',
    type: 'GROUP' as const,
    name: 'Test Group (3 members)',
    participants: [mockUsers.userA, mockUsers.userB, mockUsers.userC],
    createdAt: new Date('2025-01-15T12:00:00Z'),
    updatedAt: new Date('2025-01-15T12:00:00Z'),
  },
  public: {
    id: 'conv-public-test',
    type: 'PUBLIC' as const,
    name: 'Public Test Channel',
    participants: [mockUsers.userA, mockUsers.userB, mockUsers.userC],
    createdAt: new Date('2025-01-15T13:00:00Z'),
    updatedAt: new Date('2025-01-15T13:00:00Z'),
  },
};

export const mockCalls = {
  pending: {
    id: 'call-pending-1',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'pending' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T14:00:00Z'),
        leftAt: null,
        status: 'joined' as const,
      },
    ],
    createdAt: new Date('2025-01-20T14:00:00Z'),
    startedAt: null,
    endedAt: null,
    duration: null,
  },
  active: {
    id: 'call-active-1',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'active' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T15:00:00Z'),
        leftAt: null,
        status: 'joined' as const,
      },
      {
        userId: mockUsers.userB.id,
        joinedAt: new Date('2025-01-20T15:00:05Z'),
        leftAt: null,
        status: 'joined' as const,
      },
    ],
    createdAt: new Date('2025-01-20T15:00:00Z'),
    startedAt: new Date('2025-01-20T15:00:05Z'),
    endedAt: null,
    duration: null,
  },
  ended: {
    id: 'call-ended-1',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'ended' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T16:00:00Z'),
        leftAt: new Date('2025-01-20T16:05:30Z'),
        status: 'left' as const,
      },
      {
        userId: mockUsers.userB.id,
        joinedAt: new Date('2025-01-20T16:00:03Z'),
        leftAt: new Date('2025-01-20T16:05:28Z'),
        status: 'left' as const,
      },
    ],
    createdAt: new Date('2025-01-20T16:00:00Z'),
    startedAt: new Date('2025-01-20T16:00:03Z'),
    endedAt: new Date('2025-01-20T16:05:30Z'),
    duration: 330, // 5 minutes 30 seconds
  },
  rejected: {
    id: 'call-rejected-1',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'rejected' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T17:00:00Z'),
        leftAt: null,
        status: 'joined' as const,
      },
    ],
    createdAt: new Date('2025-01-20T17:00:00Z'),
    startedAt: null,
    endedAt: new Date('2025-01-20T17:00:15Z'),
    duration: null,
    rejectedBy: mockUsers.userB.id,
  },
  missed: {
    id: 'call-missed-1',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'missed' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T18:00:00Z'),
        leftAt: null,
        status: 'joined' as const,
      },
    ],
    createdAt: new Date('2025-01-20T18:00:00Z'),
    startedAt: null,
    endedAt: new Date('2025-01-20T18:01:00Z'),
    duration: null,
  },
  audioOnly: {
    id: 'call-audio-1',
    conversationId: mockConversations.direct.id,
    type: 'audio' as const,
    status: 'active' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-20T19:00:00Z'),
        leftAt: null,
        status: 'joined' as const,
      },
      {
        userId: mockUsers.userB.id,
        joinedAt: new Date('2025-01-20T19:00:04Z'),
        leftAt: null,
        status: 'joined' as const,
      },
    ],
    createdAt: new Date('2025-01-20T19:00:00Z'),
    startedAt: new Date('2025-01-20T19:00:04Z'),
    endedAt: null,
    duration: null,
  },
};

export const mockCallHistory = [
  mockCalls.ended,
  mockCalls.rejected,
  mockCalls.missed,
  {
    id: 'call-ended-2',
    conversationId: mockConversations.direct.id,
    type: 'video' as const,
    status: 'ended' as const,
    initiatorId: mockUsers.userB.id,
    participants: [
      {
        userId: mockUsers.userB.id,
        joinedAt: new Date('2025-01-19T10:00:00Z'),
        leftAt: new Date('2025-01-19T10:15:00Z'),
        status: 'left' as const,
      },
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-19T10:00:05Z'),
        leftAt: new Date('2025-01-19T10:15:00Z'),
        status: 'left' as const,
      },
    ],
    createdAt: new Date('2025-01-19T10:00:00Z'),
    startedAt: new Date('2025-01-19T10:00:05Z'),
    endedAt: new Date('2025-01-19T10:15:00Z'),
    duration: 900, // 15 minutes
  },
  {
    id: 'call-ended-3',
    conversationId: mockConversations.direct.id,
    type: 'audio' as const,
    status: 'ended' as const,
    initiatorId: mockUsers.userA.id,
    participants: [
      {
        userId: mockUsers.userA.id,
        joinedAt: new Date('2025-01-18T14:30:00Z'),
        leftAt: new Date('2025-01-18T14:32:30Z'),
        status: 'left' as const,
      },
      {
        userId: mockUsers.userB.id,
        joinedAt: new Date('2025-01-18T14:30:02Z'),
        leftAt: new Date('2025-01-18T14:32:30Z'),
        status: 'left' as const,
      },
    ],
    createdAt: new Date('2025-01-18T14:30:00Z'),
    startedAt: new Date('2025-01-18T14:30:02Z'),
    endedAt: new Date('2025-01-18T14:32:30Z'),
    duration: 150, // 2 minutes 30 seconds
  },
];

export const mockSocketEvents = {
  callInitiated: {
    event: 'call:initiated',
    data: {
      callId: mockCalls.pending.id,
      conversationId: mockConversations.direct.id,
      initiatorId: mockUsers.userA.id,
      type: 'video' as const,
      timestamp: new Date('2025-01-20T14:00:00Z'),
    },
  },
  callIncoming: {
    event: 'call:incoming',
    data: {
      callId: mockCalls.pending.id,
      conversationId: mockConversations.direct.id,
      initiator: mockUsers.userA,
      type: 'video' as const,
      timestamp: new Date('2025-01-20T14:00:00Z'),
    },
  },
  callAccepted: {
    event: 'call:accepted',
    data: {
      callId: mockCalls.active.id,
      userId: mockUsers.userB.id,
      timestamp: new Date('2025-01-20T15:00:05Z'),
    },
  },
  callActive: {
    event: 'call:active',
    data: {
      callId: mockCalls.active.id,
      participants: mockCalls.active.participants,
      timestamp: new Date('2025-01-20T15:00:05Z'),
    },
  },
  callRejected: {
    event: 'call:rejected',
    data: {
      callId: mockCalls.rejected.id,
      userId: mockUsers.userB.id,
      timestamp: new Date('2025-01-20T17:00:15Z'),
    },
  },
  callEnded: {
    event: 'call:ended',
    data: {
      callId: mockCalls.ended.id,
      reason: 'user_hangup' as const,
      duration: mockCalls.ended.duration,
      timestamp: new Date('2025-01-20T16:05:30Z'),
    },
  },
  participantLeft: {
    event: 'call:participant-left',
    data: {
      callId: mockCalls.active.id,
      userId: mockUsers.userB.id,
      timestamp: new Date('2025-01-20T15:10:00Z'),
    },
  },
  participantMuted: {
    event: 'call:participant-muted',
    data: {
      callId: mockCalls.active.id,
      userId: mockUsers.userA.id,
      muted: true,
      timestamp: new Date('2025-01-20T15:05:00Z'),
    },
  },
  participantVideoToggled: {
    event: 'call:participant-video-toggled',
    data: {
      callId: mockCalls.active.id,
      userId: mockUsers.userA.id,
      videoEnabled: false,
      timestamp: new Date('2025-01-20T15:06:00Z'),
    },
  },
  webrtcSignal: {
    event: 'call:signal',
    data: {
      callId: mockCalls.active.id,
      fromUserId: mockUsers.userA.id,
      toUserId: mockUsers.userB.id,
      signal: {
        type: 'offer' as const,
        sdp: 'mock-sdp-offer-string',
      },
      timestamp: new Date('2025-01-20T15:00:01Z'),
    },
  },
  iceCandidate: {
    event: 'call:signal',
    data: {
      callId: mockCalls.active.id,
      fromUserId: mockUsers.userA.id,
      toUserId: mockUsers.userB.id,
      signal: {
        type: 'ice-candidate' as const,
        candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host',
      },
      timestamp: new Date('2025-01-20T15:00:02Z'),
    },
  },
};

export const mockAPIResponses = {
  initiateCall: {
    success: true,
    data: mockCalls.pending,
    message: 'Call initiated successfully',
  },
  getCall: {
    success: true,
    data: mockCalls.active,
  },
  joinCall: {
    success: true,
    data: {
      ...mockCalls.active,
      participants: mockCalls.active.participants,
    },
    message: 'Joined call successfully',
  },
  leaveCall: {
    success: true,
    data: {
      ...mockCalls.ended,
      participants: mockCalls.ended.participants,
    },
    message: 'Left call successfully',
  },
  getCallHistory: {
    success: true,
    data: mockCallHistory,
    pagination: {
      total: mockCallHistory.length,
      page: 1,
      pageSize: 20,
      hasMore: false,
    },
  },
  errorConversationNotFound: {
    success: false,
    error: {
      code: 'CONVERSATION_NOT_FOUND',
      message: 'Conversation not found',
      statusCode: 404,
    },
  },
  errorUnauthorized: {
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'You are not a member of this conversation',
      statusCode: 403,
    },
  },
  errorPublicConversation: {
    success: false,
    error: {
      code: 'INVALID_CONVERSATION_TYPE',
      message: 'Calls are not supported for PUBLIC conversations',
      statusCode: 400,
    },
  },
  errorAlreadyInCall: {
    success: false,
    error: {
      code: 'ALREADY_IN_CALL',
      message: 'You are already in an active call',
      statusCode: 409,
    },
  },
  errorCallNotFound: {
    success: false,
    error: {
      code: 'CALL_NOT_FOUND',
      message: 'Call not found',
      statusCode: 404,
    },
  },
};

export const mockWebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const mockCallControls = {
  initial: {
    audioEnabled: true,
    videoEnabled: true,
    screenSharing: false,
  },
  audioMuted: {
    audioEnabled: false,
    videoEnabled: true,
    screenSharing: false,
  },
  videoOff: {
    audioEnabled: true,
    videoEnabled: false,
    screenSharing: false,
  },
  bothDisabled: {
    audioEnabled: false,
    videoEnabled: false,
    screenSharing: false,
  },
};
