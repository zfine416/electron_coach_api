const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
  // Subscribe to statistics
  subscribeStatistics: (callback: (statistics: Statistics) => void) => {
    const listener = (_: Electron.IpcRendererEvent, statistics: Statistics) =>
      callback(statistics);
    electron.ipcRenderer.on('statistics', listener);

    // Return an unsubscribe function
    return () => electron.ipcRenderer.off('statistics', listener);
  },

  // Get static data
  getStaticData: () => electron.ipcRenderer.invoke('getStaticData'),

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

  // Subscribe to Zoom meeting detected events
  onZoomMeetingDetected: (callback: (zoomWindowName: string) => void) => {
    const listener = (_: Electron.IpcRendererEvent, zoomWindowName: string) =>
      callback(zoomWindowName);

    electron.ipcRenderer.on('zoom-meeting-detected', listener);

    return () => electron.ipcRenderer.removeListener('zoom-meeting-detected', listener);
  },
} satisfies Window['electron']);

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