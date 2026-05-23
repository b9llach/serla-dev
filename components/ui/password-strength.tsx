'use client';

import { cn } from '@/lib/utils';

interface Props {
  password: string;
}

/**
 * Simple, dependency-free password strength meter.
 *
 * Score 0-4 based on:
 *   +1 length >= 8
 *   +1 length >= 12
 *   +1 mix of upper + lower
 *   +1 contains digit
 *   +1 contains special char
 * (capped at 4)
 *
 * Not a substitute for zxcvbn-class evaluation. It's a low-noise hint to
 * users that "password" is bad and "P@ssw0rdLong!" is okay.
 */
export function PasswordStrength({ password }: Props) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  score = Math.min(score, 4);

  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
  ];
  const widths = ['w-1/4', 'w-2/4', 'w-3/4', 'w-3/4', 'w-full'];

  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-200', colors[score], widths[score])}
        />
      </div>
      <p className={cn(
        'text-xs',
        score < 2 ? 'text-red-500' : score < 4 ? 'text-yellow-500' : 'text-green-500'
      )}>
        {labels[score]}
      </p>
    </div>
  );
}
