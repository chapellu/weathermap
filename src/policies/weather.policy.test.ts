import { describe, it, expect } from 'vitest';
import { evaluateWeatherPolicy } from './weather.policy.js';

const viewer = { role: 'viewer', plan: 'free' };
const pro = { role: 'viewer', plan: 'pro' };
const admin = { role: 'admin', plan: 'pro' };

describe('evaluateWeatherPolicy', () => {
  describe('weather:read:current', () => {
    it('allows any authenticated user', () => {
      // Given / When / Then
      expect(evaluateWeatherPolicy('weather:read:current', viewer)).toBe('allow');
      expect(evaluateWeatherPolicy('weather:read:current', pro)).toBe('allow');
      expect(evaluateWeatherPolicy('weather:read:current', admin)).toBe('allow');
    });
  });

  describe('weather:read:forecast', () => {
    it('denies a free plan viewer', () => {
      // Given
      const user = viewer;

      // When
      const result = evaluateWeatherPolicy('weather:read:forecast', user);

      // Then
      expect(result).toBe('deny');
    });

    it('allows a pro plan user', () => {
      // Given
      const user = pro;

      // When
      const result = evaluateWeatherPolicy('weather:read:forecast', user);

      // Then
      expect(result).toBe('allow');
    });

    it('allows an admin regardless of plan', () => {
      // Given
      const user = { role: 'admin', plan: 'free' };

      // When
      const result = evaluateWeatherPolicy('weather:read:forecast', user);

      // Then
      expect(result).toBe('allow');
    });
  });

  describe('weather:cache:invalidate', () => {
    it('denies a non-admin user', () => {
      // Given / When / Then
      expect(evaluateWeatherPolicy('weather:cache:invalidate', viewer)).toBe('deny');
      expect(evaluateWeatherPolicy('weather:cache:invalidate', pro)).toBe('deny');
    });

    it('allows an admin', () => {
      // Given / When / Then
      expect(evaluateWeatherPolicy('weather:cache:invalidate', admin)).toBe('allow');
    });
  });

  describe('unknown action', () => {
    it('denies by default', () => {
      // Given / When / Then
      expect(evaluateWeatherPolicy('unknown:action', viewer)).toBe('deny');
      expect(evaluateWeatherPolicy('', admin)).toBe('deny');
    });
  });
});
