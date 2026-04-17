type User = { role: string; plan: string };

export function evaluateWeatherPolicy(action: string, user: User): 'allow' | 'deny' {
  if (action === 'weather:read:current') return 'allow';

  if (action === 'weather:read:forecast') {
    return user.plan === 'pro' || user.role === 'admin' ? 'allow' : 'deny';
  }

  if (action === 'weather:cache:invalidate') {
    return user.role === 'admin' ? 'allow' : 'deny';
  }

  return 'deny';
}
