import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Auth Form Store
 * Persists user input (email/phone/username) between auth forms
 * Uses sessionStorage so data is cleared when browser is closed
 */

interface AuthFormState {
  // The identifier entered by the user (email, phone, or username)
  identifier: string;

  // Actions
  setIdentifier: (identifier: string) => void;
  clearIdentifier: () => void;
}

export const useAuthFormStore = create<AuthFormState>()(
  persist(
    (set) => ({
      identifier: '',

      setIdentifier: (identifier: string) => set({ identifier }),
      clearIdentifier: () => set({ identifier: '' }),
    }),
    {
      name: 'auth-form-data',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
