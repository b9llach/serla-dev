// Webhook payload formatters for different integrations

export type WebhookType = 'raw' | 'discord' | 'slack' | 'teams';

// Serla branding for webhook messages
const SERLA_LOGO_URL = 'https://serla.dev/logo-square.png';
const SERLA_BOT_NAME = 'Serla';

export interface WebhookEvent {
  id: string;
  name: string;
  distinctId: string | null;
  timestamp: string;
  properties: Record<string, unknown>;
  country?: string | null;
  browser?: string | null;
  device?: string | null;
  pageUrl?: string | null;
}

export interface WebhookPayload {
  body: string;
  contentType: string;
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Get color based on event name
function getEventColor(eventName: string): number {
  // Common event types with specific colors
  if (eventName.includes('purchase') || eventName.includes('payment') || eventName.includes('revenue')) {
    return 0x22c55e; // Green for revenue
  }
  if (eventName.includes('signup') || eventName.includes('register')) {
    return 0x3b82f6; // Blue for signups
  }
  if (eventName.includes('error') || eventName.includes('fail')) {
    return 0xef4444; // Red for errors
  }
  if (eventName.includes('login') || eventName.includes('auth')) {
    return 0x8b5cf6; // Purple for auth
  }
  return 0x71717a; // Gray default
}

// Format properties for display
function formatProperties(properties: Record<string, unknown>): string {
  const entries = Object.entries(properties).slice(0, 5);
  if (entries.length === 0) return 'No properties';

  return entries
    .map(([key, value]) => {
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      return `**${key}:** ${displayValue.slice(0, 50)}${displayValue.length > 50 ? '...' : ''}`;
    })
    .join('\n');
}

/**
 * Raw webhook format - standard JSON payload
 */
export function formatRawPayload(event: WebhookEvent): WebhookPayload {
  const payload = {
    id: event.id,
    event: event.name,
    distinctId: event.distinctId,
    timestamp: event.timestamp,
    properties: event.properties,
    context: {
      country: event.country,
      browser: event.browser,
      device: event.device,
      pageUrl: event.pageUrl,
    },
  };

  return {
    body: JSON.stringify(payload),
    contentType: 'application/json',
  };
}

/**
 * Discord webhook format - rich embed
 */
export function formatDiscordPayload(event: WebhookEvent): WebhookPayload {
  const color = getEventColor(event.name);

  const payload = {
    username: SERLA_BOT_NAME,
    avatar_url: SERLA_LOGO_URL,
    embeds: [
      {
        title: event.name,
        color: color,
        fields: [
          {
            name: 'User',
            value: event.distinctId || 'Anonymous',
            inline: true,
          },
          {
            name: 'Time',
            value: formatTimestamp(event.timestamp),
            inline: true,
          },
          ...(event.country ? [{
            name: 'Location',
            value: event.country,
            inline: true,
          }] : []),
          ...(Object.keys(event.properties).length > 0 ? [{
            name: 'Properties',
            value: formatProperties(event.properties),
            inline: false,
          }] : []),
        ],
        footer: {
          text: 'Serla Analytics',
          icon_url: SERLA_LOGO_URL,
        },
        timestamp: event.timestamp,
      },
    ],
  };

  return {
    body: JSON.stringify(payload),
    contentType: 'application/json',
  };
}

/**
 * Slack webhook format - Block Kit
 */
export function formatSlackPayload(event: WebhookEvent): WebhookPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: event.name,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*User:*\n${event.distinctId || 'Anonymous'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Time:*\n${formatTimestamp(event.timestamp)}`,
        },
        ...(event.country ? [{
          type: 'mrkdwn',
          text: `*Location:*\n${event.country}`,
        }] : []),
        ...(event.browser ? [{
          type: 'mrkdwn',
          text: `*Browser:*\n${event.browser}`,
        }] : []),
      ],
    },
  ];

  // Add properties section if there are any
  const propEntries = Object.entries(event.properties).slice(0, 5);
  if (propEntries.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*Properties:*\n' + propEntries
          .map(([key, value]) => `• ${key}: \`${String(value).slice(0, 30)}\``)
          .join('\n'),
      },
    });
  }

  // Add context footer with logo
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'image',
        image_url: SERLA_LOGO_URL,
        alt_text: 'Serla',
      },
      {
        type: 'mrkdwn',
        text: `Serla Analytics | Event ID: ${event.id.slice(0, 8)}...`,
      },
    ],
  });

  return {
    body: JSON.stringify({
      username: SERLA_BOT_NAME,
      icon_url: SERLA_LOGO_URL,
      blocks,
    }),
    contentType: 'application/json',
  };
}

/**
 * Microsoft Teams webhook format - Adaptive Cards
 */
export function formatTeamsPayload(event: WebhookEvent): WebhookPayload {
  const card = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          version: '1.4',
          body: [
            {
              type: 'ColumnSet',
              columns: [
                {
                  type: 'Column',
                  width: 'auto',
                  items: [
                    {
                      type: 'Image',
                      url: SERLA_LOGO_URL,
                      size: 'small',
                      style: 'default',
                      width: '32px',
                      height: '32px',
                    },
                  ],
                },
                {
                  type: 'Column',
                  width: 'stretch',
                  items: [
                    {
                      type: 'TextBlock',
                      text: event.name,
                      weight: 'bolder',
                      size: 'large',
                    },
                    {
                      type: 'TextBlock',
                      text: 'Serla Analytics',
                      size: 'small',
                      isSubtle: true,
                      spacing: 'none',
                    },
                  ],
                },
              ],
            },
            {
              type: 'FactSet',
              facts: [
                {
                  title: 'User',
                  value: event.distinctId || 'Anonymous',
                },
                {
                  title: 'Time',
                  value: formatTimestamp(event.timestamp),
                },
                ...(event.country ? [{
                  title: 'Location',
                  value: event.country,
                }] : []),
                ...Object.entries(event.properties).slice(0, 4).map(([key, value]) => ({
                  title: key,
                  value: String(value).slice(0, 50),
                })),
              ],
            },
          ],
        },
      },
    ],
  };

  return {
    body: JSON.stringify(card),
    contentType: 'application/json',
  };
}

/**
 * Format webhook payload based on integration type
 */
export function formatWebhookPayload(type: WebhookType, event: WebhookEvent): WebhookPayload {
  switch (type) {
    case 'discord':
      return formatDiscordPayload(event);
    case 'slack':
      return formatSlackPayload(event);
    case 'teams':
      return formatTeamsPayload(event);
    case 'raw':
    default:
      return formatRawPayload(event);
  }
}

/**
 * Get display info for webhook type
 */
export function getWebhookTypeInfo(type: WebhookType): { label: string; description: string; placeholder: string } {
  switch (type) {
    case 'discord':
      return {
        label: 'Discord',
        description: 'Send formatted messages to a Discord channel',
        placeholder: 'https://discord.com/api/webhooks/...',
      };
    case 'slack':
      return {
        label: 'Slack',
        description: 'Send formatted messages to a Slack channel',
        placeholder: 'https://hooks.slack.com/services/...',
      };
    case 'teams':
      return {
        label: 'Microsoft Teams',
        description: 'Send Adaptive Cards to a Teams channel',
        placeholder: 'https://outlook.office.com/webhook/...',
      };
    case 'raw':
    default:
      return {
        label: 'Raw Webhook',
        description: 'Send raw JSON payload to any URL',
        placeholder: 'https://your-server.com/webhook',
      };
  }
}
