import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface User {
  id: number;
  email: string;
  role: 'viewer' | 'admin';
  plan: 'free' | 'pro';
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const initialized = ref(false);

  async function fetchUser() {
    try {
      const res = await fetch('/me', { credentials: 'include' });
      user.value = res.ok ? await res.json() : null;
    } catch {
      user.value = null;
    } finally {
      initialized.value = true;
    }
  }

  return { user, initialized, fetchUser };
});
