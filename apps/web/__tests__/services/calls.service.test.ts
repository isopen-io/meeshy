import { callsService } from '@/services/calls.service';
import { apiService } from '@/services/api.service';
import type { ApiResponse } from '@meeshy/shared/types';
import type { CallSession } from '@meeshy/shared/types/video-call';
import { mockCalls } from '../fixtures/calls';

// The shared fixture predates the strict `CallSession` shape (string dates,
// no `mode`) — cast through `unknown`, never `any`, to keep these tests
// focused on the service's request wiring rather than payload shape.
const activeCallResponse = {
  success: true,
  data: mockCalls.active,
} as unknown as ApiResponse<CallSession>;
const activeOrNullCallResponse = activeCallResponse as unknown as ApiResponse<CallSession | null>;

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  },
}));

const mockApi = apiService as jest.Mocked<typeof apiService>;

describe('callsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getActiveCall', () => {
    it('should call GET with the active-call endpoint for the conversation', async () => {
      mockApi.get.mockResolvedValue(activeOrNullCallResponse);

      const result = await callsService.getActiveCall('conv-direct-ab');

      expect(mockApi.get).toHaveBeenCalledWith('/conversations/conv-direct-ab/active-call');
      expect(result).toBe(activeOrNullCallResponse);
    });

    it('should propagate a null data payload when no call is active', async () => {
      const response = { success: true, data: null } as ApiResponse<CallSession | null>;
      mockApi.get.mockResolvedValue(response);

      const result = await callsService.getActiveCall('conv-direct-ab');

      expect(result.data).toBeNull();
    });

    it('should propagate errors without catching', async () => {
      mockApi.get.mockRejectedValue(new Error('Network error'));

      await expect(callsService.getActiveCall('conv-direct-ab')).rejects.toThrow('Network error');
    });
  });

  describe('removeParticipant', () => {
    it('should call DELETE with the callId and target userId in the path', async () => {
      mockApi.delete.mockResolvedValue(activeCallResponse);

      const result = await callsService.removeParticipant('call-active-1', 'user-b-test');

      expect(mockApi.delete).toHaveBeenCalledWith('/calls/call-active-1/participants/user-b-test');
      expect(result).toBe(activeCallResponse);
    });

    it('should send no request body — the gateway route takes none', async () => {
      mockApi.delete.mockResolvedValue(activeCallResponse);

      await callsService.removeParticipant('call-active-1', 'user-b-test');

      expect(mockApi.delete).toHaveBeenCalledTimes(1);
      expect(mockApi.delete).toHaveBeenCalledWith(expect.any(String));
    });

    it('should propagate errors (e.g. 403 PERMISSION_DENIED for a non-moderator) without catching', async () => {
      mockApi.delete.mockRejectedValue(new Error('PERMISSION_DENIED'));

      await expect(
        callsService.removeParticipant('call-active-1', 'user-b-test')
      ).rejects.toThrow('PERMISSION_DENIED');
    });
  });
});
