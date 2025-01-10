declare module 'mic' {
  type MicOptions = {
    rate?: string;
    channels?: string;
    debug?: boolean;
    fileType?: string;
  };

  interface MicInstance {
    getAudioStream(): NodeJS.ReadableStream;
    start(): void;
    stop(): void;
  }

  export default function mic(options?: MicOptions): MicInstance;
}