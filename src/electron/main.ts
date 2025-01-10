import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { exec } from 'child_process';

app.on('ready', () => {
  console.log('App is ready.');

  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    frame: false, // Disables the default system frame
  });

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5123');
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), '/dist-react/index.html'));
  }

  // Start monitoring for Zoom windows after the app is ready
  monitorZoomProcesses();
});

function monitorZoomProcesses() {
  setInterval(() => {
    exec("ps aux | grep 'zoom.us'", (err, stdout, stderr) => {
      if (err || stderr) {
        console.error('Error detecting Zoom process:', err || stderr);
        return;
      }

      // Split the output into lines
      const processes = stdout.split('\n').filter((line) => line.includes('zoom.us'));

      const zoomMainProcess = processes.find((line) => line.includes('/MacOS/zoom.us'));
      const aomHostProcess = processes.find((line) => line.includes('/Frameworks/aomhost.app'));

      if (zoomMainProcess) {
        if (aomHostProcess) {
          console.log('Zoom meeting detected. aomhost process is running.');
          showZoomNotification();
          // Notify renderer or perform actions for a detected meeting
        } else {
          console.log('Zoom is running, but no meeting detected.');
        }
      } else {
        console.log('Zoom is not running.');
      }
    });
  }, 5000); // Check every 5 seconds
}

function showZoomNotification() {
  const notification = new Notification({
    title: 'Meeting Detected',
    body: 'Zoom meeting is running. Click to start recording.',
    closeButtonText: 'Dismiss',
  });

  notification.on('click', () => {
    console.log('Start Recording clicked.');
    // Add logic to start recording or notify renderer
    // For example:
    // if (mainWindow) mainWindow.webContents.send('start-recording');
  });

  notification.show();
}
app.on('window-all-closed', () => {
  console.log('All windows closed. Exiting app.');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('App activated.');
  // Recreate window logic if needed
});