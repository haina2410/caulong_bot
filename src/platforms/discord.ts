import type { PlatformAdapter, PlatformContext } from './types';

export function createDiscordAdapter(context: PlatformContext): PlatformAdapter {
  return {
    async start() {
      console.warn('Discord adapter not implemented yet.');
      void context;
    },
    async stop() {
      // Nothing to clean up yet.
    },
  };
}
