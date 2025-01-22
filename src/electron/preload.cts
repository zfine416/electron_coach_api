const electron = require('electron');
import { exec } from 'child_process';

console.log("INSIDE PRELOAD.cts")
electron.contextBridge.exposeInMainWorld('electron', {
  // Subscribe to change view
  subscribeChangeView: (callback: (view: View) => void) => {
    const listener = (_: Electron.IpcRendererEvent, view: View) => callback(view);
    electron.ipcRenderer.on('changeView', listener);

    // Return an unsubscribe function
    return () => electron.ipcRenderer.off('changeView', listener);
  },

  // Send frame action
  sendFrameAction: (payload: FrameWindowAction) => {
    electron.ipcRenderer.send('sendFrameAction', payload);
  },

  getAvailableDevices: async (): Promise<Device[]> => {
    return new Promise((resolve, reject) => {
      exec('ffmpeg -f avfoundation -list_devices true', (error, stdout, stderr) => {
        if (error) {
          console.error('Error listing devices:', error);
          reject(error);
          return;
        }

        const audioDevices: Device[] = [];
        const lines = stderr.split('\n');
        let captureType: 'audio' | null = null;

        for (const line of lines) {
          if (line.includes('AVFoundation audio devices:')) {
            captureType = 'audio';
          } else if (captureType && line.includes('[')) {
            const match = line.match(/\[(\d+)]\s(.+)/);
            if (match) {
              const [, index, name] = match;
              audioDevices.push({ index, name });
            }
          }
        }

        resolve(audioDevices);
      });
    });
  },

  // Subscribe to Zoom meeting detected events
  onZoomMeetingDetected: (callback: (zoomWindowName: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, zoomWindowName: string) =>
      callback(zoomWindowName);

    electron.ipcRenderer.on('zoom-meeting-detected', listener);

    return () => electron.ipcRenderer.removeListener('zoom-meeting-detected', listener);
  },
})

// Generic IPC invoke helper
function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key);
}

// Generic IPC on helper
function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]) => void
) {
  const wrappedCallback = (_: Electron.IpcRendererEvent, payload: any) =>
    callback(payload);
  electron.ipcRenderer.on(key, wrappedCallback);
  return () => electron.ipcRenderer.off(key, wrappedCallback); // Unsubscribe helper
}

// Generic IPC send helper
function ipcSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload: EventPayloadMapping[Key]
) {
  electron.ipcRenderer.send(key, payload);
}