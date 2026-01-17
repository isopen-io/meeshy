import { renderHook, waitFor } from '@testing-library/react';
import { useIdentifierValidation } from '../use-identifier-validation';
import { apiService } from '@/services/api.service';

// Mock dependencies
jest.mock('@/services/api.service');

describe('useIdentifierValidation', () => {
  const mockApiService = apiService as jest.Mocked<typeof apiService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateIdentifierFormat', () => {
    it('should validate correct identifier format', () => {
      const { result } = renderHook(() => useIdentifierValidation('', 'group'));

      expect(result.current.validateIdentifierFormat('my-group-123')).toBe(true);
      expect(result.current.validateIdentifierFormat('team_discussion')).toBe(true);
      expect(result.current.validateIdentifierFormat('group@123')).toBe(true);
    });

    it('should reject invalid identifier format', () => {
      const { result } = renderHook(() => useIdentifierValidation('', 'group'));

      expect(result.current.validateIdentifierFormat('my group')).toBe(false); // spaces
      expect(result.current.validateIdentifierFormat('my.group')).toBe(false); // dots
      expect(result.current.validateIdentifierFormat('my#group')).toBe(false); // hash
    });
  });

  describe('generateIdentifierFromTitle', () => {
    it('should generate identifier from title with hex suffix', () => {
      const { result } = renderHook(() => useIdentifierValidation('', 'group'));

      const identifier = result.current.generateIdentifierFromTitle('My Awesome Group');

      expect(identifier).toMatch(/^my-awesome-group-[a-f0-9]{8}$/);
    });

    it('should handle special characters in title', () => {
      const { result } = renderHook(() => useIdentifierValidation('', 'group'));

      const identifier = result.current.generateIdentifierFromTitle('Team #1 - Discussion!');

      expect(identifier).toMatch(/^team-1-discussion-[a-f0-9]{8}$/);
    });

    it('should return empty string for empty title', () => {
      const { result } = renderHook(() => useIdentifierValidation('', 'group'));

      expect(result.current.generateIdentifierFromTitle('')).toBe('');
      expect(result.current.generateIdentifierFromTitle('   ')).toBe('');
    });
  });

  describe('checkIdentifierAvailability', () => {
    it('should check availability for valid identifier', async () => {
      mockApiService.get.mockResolvedValueOnce({
        data: { success: true, available: true }
      } as any);

      const { result } = renderHook(() => useIdentifierValidation('my-group-abc', 'group'));

      await waitFor(() => {
        expect(result.current.identifierAvailable).toBe(true);
      });

      expect(mockApiService.get).toHaveBeenCalledWith(
        '/conversations/check-identifier/my-group-abc'
      );
    });

    it('should not check for identifiers shorter than 3 chars', async () => {
      const { result } = renderHook(() => useIdentifierValidation('ab', 'group'));

      await waitFor(() => {
        expect(result.current.identifierAvailable).toBeNull();
      });

      expect(mockApiService.get).not.toHaveBeenCalled();
    });

    it('should not check for direct conversations', async () => {
      const { result } = renderHook(() => useIdentifierValidation('my-group-abc', 'direct'));

      await waitFor(() => {
        expect(result.current.identifierAvailable).toBeNull();
      });

      expect(mockApiService.get).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockApiService.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useIdentifierValidation('my-group-abc', 'group'));

      await waitFor(() => {
        expect(result.current.identifierAvailable).toBeNull();
        expect(result.current.isCheckingIdentifier).toBe(false);
      });
    });
  });
});
