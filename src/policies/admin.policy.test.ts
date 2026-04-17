import { describe, expect, it } from 'vitest';
import { evaluateAdminPolicy } from '@/policies/admin.policy.js';

describe('evaluateAdminPolicy', () => {
  describe('admin:manage:users', () => {
    it('denies a viewer', () => {
      // Given
      const user = { role: 'viewer', plan: 'free' };

      // When
      const result = evaluateAdminPolicy('admin:manage:users', user);

      // Then
      expect(result).toBe('deny');
    });

    it('allows an admin', () => {
      // Given
      const user = { role: 'admin', plan: 'free' };

      // When
      const result = evaluateAdminPolicy('admin:manage:users', user);

      // Then
      expect(result).toBe('allow');
    });
  });

  describe('unknown action', () => {
    it('denies by default', () => {
      // Given / When / Then
      expect(evaluateAdminPolicy('unknown:action', { role: 'admin', plan: 'pro' })).toBe('deny');
    });
  });
});
