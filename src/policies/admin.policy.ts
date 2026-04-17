type User = { role: string; plan: string };

export function evaluateAdminPolicy(action: string, user: User): 'allow' | 'deny' {
  if (action === 'admin:manage:users') {
    return user.role === 'admin' ? 'allow' : 'deny';
  }

  return 'deny';
}
