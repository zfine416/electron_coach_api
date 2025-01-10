type Statistics = {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;
};

type StaticData = {
  totalStorage: number;
  cpuModel: string;
  totalMemoryGB: number;
};

// // Define a stricter type for notifications if necessary
// type NotificationOptions = {
//   title: string;
//   body: string;
// };

type View = 'CPU' | 'RAM' | 'STORAGE';

type FrameWindowAction = 'CLOSE' | 'MAXIMIZE' | 'MINIMIZE';

type EventPayloadMapping = {
  statistics: Statistics;
  getStaticData: StaticData;
  changeView: View;
  sendFrameAction: FrameWindowAction;

  // Add zoom-meeting-detected event payload
  'zoom-meeting-detected': string; // The payload is the zoom window name
};

type UnsubscribeFunction = () => void;

interface Window {
  electron: {
    subscribeStatistics: (
      callback: (statistics: Statistics) => void
    ) => UnsubscribeFunction;
    getStaticData: () => Promise<StaticData>;
    subscribeChangeView: (
      callback: (view: View) => void
    ) => UnsubscribeFunction;
    sendFrameAction: (payload: FrameWindowAction) => void;

    // Add the new onZoomMeetingDetected method
    onZoomMeetingDetected: (
      callback: (zoomWindowName: string) => void
    ) => UnsubscribeFunction;
  };
}

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

// Ensure the types are globally available
declare global {
  interface Window {
    electron: Window['electron'];
  }
}