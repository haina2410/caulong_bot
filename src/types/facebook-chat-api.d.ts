declare module 'facebook-chat-api' {
  export interface LoginCredentials {
    email?: string;
    password?: string;
    appState?: unknown;
  }

  export interface ApiOptions {
    selfListen?: boolean;
    listenEvents?: boolean;
    forceLogin?: boolean;
    updatePresence?: boolean;
    autoMarkDelivery?: boolean;
    autoMarkRead?: boolean;
    logLevel?: 'silent' | 'info' | 'debug';
  }

  export interface SendMessageOptions {
    body?: string;
  }

  export interface MessageEvent {
    type: 'message' | string;
    threadID: string;
    messageID: string;
    senderID: string;
    body: string | null;
    isGroup: boolean;
    participantIDs?: string[];
    senderName?: string;
    threadName?: string;
  }

  export interface Api {
    setOptions(options: ApiOptions): void;
    listenMqtt(callback: (error: Error | null, event: MessageEvent) => void): () => void;
    sendMessage(message: string | SendMessageOptions, threadID: string): Promise<void> | void;
    markAsRead(threadID: string): Promise<void> | void;
    getThreadInfo(
      threadID: string,
      callback: (error: Error | null, info: ThreadInfo) => void,
    ): void;
  }

  export interface ThreadInfo {
    threadID: string;
    threadName?: string;
  }

  export default function login(
    credentials: LoginCredentials,
    callback: (error: Error | null, api: Api) => void,
  ): void;
}
