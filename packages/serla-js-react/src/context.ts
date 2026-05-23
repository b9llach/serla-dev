import { createContext } from 'react';

/**
 * Provider context. The value is `true` once <SerlaProvider> has mounted and
 * called Serla.init(). Consumers don't actually need this value at runtime —
 * Serla is a module-level singleton — but the context lets hooks detect a
 * missing provider and warn in development.
 */
export const SerlaContext = createContext<boolean>(false);
