declare module 'ws3-fca' {
  export interface LoginCredentials {
    email?: string;
    password?: string;
    appState?: unknown;
  }

  export interface LoginOptions {
    online?: boolean;
    updatePresence?: boolean;
    selfListen?: boolean;
    randomUserAgent?: boolean;
    listenEvents?: boolean;
    logLevel?: 'silent' | 'info' | 'debug';
  }

  export interface SendMessageOptions {
    body?: string;
    attachment?: unknown;
    mentions?: Array<{ tag: string; id: string }>;
    url?: string;
    sticker?: string;
  }

  export interface MessageEvent {
    type: 'message' | 'event' | string;
    threadID: string;
    messageID: string;
    senderID: string;
    body: string | null;
    isGroup: boolean;
    participantIDs?: string[];
    mentions?: Record<string, string>;
    attachments?: unknown[];
  }

  export interface Api {
    getCurrentUserID(): string;
    listenMqtt(callback: (error: Error | null, event: MessageEvent) => void): () => void;
    sendMessageMqtt(
      message: string | SendMessageOptions,
      threadID: string,
      messageID?: string,
    ): Promise<{ threadID: string; messageID: string }>;
    getThreadInfo(
      threadID: string,
      callback: (error: Error | null, info: ThreadInfo) => void,
    ): void;
    markAsRead(threadID: string): void;
    setMessageReaction(
      reaction: string,
      messageID: string,
      callback?: (error: Error | null) => void,
    ): void;
  }

  export interface ThreadInfo {
    threadID: string;
    threadName?: string;
    participantIDs?: string[];
    nicknames?: Record<string, string>;
  }

  export function login(
    credentials: LoginCredentials,
    options: LoginOptions | ((error: Error | null, api: Api) => void),
    callback?: (error: Error | null, api: Api) => void,
  ): void;
}
