'use client';

interface MetricIconProps {
  type: 'events' | 'users' | 'sessions' | 'revenue';
  size?: 'sm' | 'md' | 'lg';
}

export function MetricIcon({ type, size = 'md' }: MetricIconProps) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  };

  const iconSize = sizes[size];

  switch (type) {
    case 'events':
      return <EventsIcon className={iconSize} />;
    case 'users':
      return <UsersIcon className={iconSize} />;
    case 'sessions':
      return <SessionsIcon className={iconSize} />;
    case 'revenue':
      return <RevenueIcon className={iconSize} />;
    default:
      return null;
  }
}

function EventsIcon({ className }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <defs>
          <linearGradient id="events-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="events-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background circle with subtle gradient */}
        <circle cx="20" cy="20" r="18" fill="#1e3a5f" opacity="0.3" />
        <circle cx="20" cy="20" r="16" fill="none" stroke="#3b82f6" strokeWidth="0.5" opacity="0.3" />

        {/* Activity pulse rings */}
        <circle cx="20" cy="20" r="8" fill="none" stroke="url(#events-grad)" strokeWidth="1.5" opacity="0.2" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="url(#events-grad)" strokeWidth="1" opacity="0.15" />

        {/* Lightning bolt */}
        <path
          d="M22 12L16 21h4l-2 7 6-9h-4l2-7z"
          fill="url(#events-grad)"
          filter="url(#events-glow)"
        />

        {/* Small accent dots */}
        <circle cx="28" cy="14" r="1" fill="#60a5fa" opacity="0.6" />
        <circle cx="12" cy="26" r="0.8" fill="#60a5fa" opacity="0.4" />
      </svg>
    </div>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <defs>
          <linearGradient id="users-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <filter id="users-glow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <circle cx="20" cy="20" r="18" fill="#2e1f5e" opacity="0.3" />

        {/* Connection lines */}
        <path
          d="M14 24 Q20 18 26 24"
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="0.8"
          opacity="0.3"
          strokeDasharray="2,2"
        />

        {/* Main user */}
        <circle cx="20" cy="15" r="4" fill="url(#users-grad)" filter="url(#users-glow)" />
        <path
          d="M13 28c0-4 3-6 7-6s7 2 7 6"
          fill="url(#users-grad)"
          opacity="0.9"
          filter="url(#users-glow)"
        />

        {/* Secondary users (smaller, faded) */}
        <circle cx="10" cy="18" r="2.5" fill="#8b5cf6" opacity="0.4" />
        <path d="M6 26c0-2.5 1.8-4 4-4s4 1.5 4 4" fill="#8b5cf6" opacity="0.3" />

        <circle cx="30" cy="18" r="2.5" fill="#8b5cf6" opacity="0.4" />
        <path d="M26 26c0-2.5 1.8-4 4-4s4 1.5 4 4" fill="#8b5cf6" opacity="0.3" />
      </svg>
    </div>
  );
}

function SessionsIcon({ className }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <defs>
          <linearGradient id="sessions-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id="sessions-glow">
            <feGaussianBlur stdDeviation="1" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <circle cx="20" cy="20" r="18" fill="#14532d" opacity="0.25" />

        {/* Grid lines */}
        <path d="M8 28 L32 28" stroke="#22c55e" strokeWidth="0.5" opacity="0.2" />
        <path d="M8 22 L32 22" stroke="#22c55e" strokeWidth="0.5" opacity="0.15" />
        <path d="M8 16 L32 16" stroke="#22c55e" strokeWidth="0.5" opacity="0.1" />

        {/* Upward trend line */}
        <path
          d="M10 26 Q15 24 18 20 T26 14 L30 12"
          fill="none"
          stroke="url(#sessions-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          filter="url(#sessions-glow)"
        />

        {/* Area fill under line */}
        <path
          d="M10 26 Q15 24 18 20 T26 14 L30 12 L30 28 L10 28 Z"
          fill="url(#sessions-grad)"
          opacity="0.15"
        />

        {/* Data points */}
        <circle cx="10" cy="26" r="2" fill="#22c55e" />
        <circle cx="18" cy="20" r="2" fill="#22c55e" />
        <circle cx="30" cy="12" r="2.5" fill="url(#sessions-grad)" filter="url(#sessions-glow)" />

        {/* Arrow indicator */}
        <path
          d="M28 10 L32 10 L32 14"
          fill="none"
          stroke="#4ade80"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.8"
        />
      </svg>
    </div>
  );
}

function RevenueIcon({ className }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <defs>
          <linearGradient id="revenue-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <filter id="revenue-glow">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="coin-shadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Background glow */}
        <circle cx="20" cy="20" r="18" fill="#422006" opacity="0.3" />

        {/* Stacked coins effect */}
        <ellipse cx="20" cy="26" rx="10" ry="3" fill="#b45309" opacity="0.4" />
        <ellipse cx="20" cy="24" rx="10" ry="3" fill="#d97706" opacity="0.5" />
        <ellipse cx="20" cy="22" rx="10" ry="3" fill="#f59e0b" opacity="0.6" />

        {/* Main coin */}
        <ellipse cx="20" cy="19" rx="10" ry="4" fill="url(#revenue-grad)" filter="url(#coin-shadow)" />
        <ellipse cx="20" cy="19" rx="8" ry="3" fill="none" stroke="#fde047" strokeWidth="0.5" opacity="0.5" />

        {/* Dollar symbol */}
        <text
          x="20"
          y="22"
          textAnchor="middle"
          fontSize="10"
          fontWeight="bold"
          fill="#422006"
          opacity="0.7"
        >
          $
        </text>

        {/* Sparkle accents */}
        <g fill="#fde047" opacity="0.8">
          <path d="M30 12 L31 14 L33 13 L31 15 L32 17 L30 15 L28 17 L29 15 L27 13 L29 14 Z" />
          <circle cx="10" cy="14" r="1" />
          <circle cx="8" cy="18" r="0.6" />
        </g>
      </svg>
    </div>
  );
}

// Empty state icon for when there's no data
export function EmptyMetricIcon({ className }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 40 40" className="w-full h-full">
        <circle cx="20" cy="20" r="18" fill="#27272a" opacity="0.5" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="#3f3f46" strokeWidth="1" strokeDasharray="3,3" />
        <text
          x="20"
          y="24"
          textAnchor="middle"
          fontSize="14"
          fill="#52525b"
        >
          ?
        </text>
      </svg>
    </div>
  );
}
