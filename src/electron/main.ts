import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { exec } from 'child_process';
import mic from 'mic';
import fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let micInstance: ReturnType<typeof mic> | null = null;
let audioFileStream: fs.WriteStream | null = null;
const outputFilePath = path.join(app.getPath('userData'), 'meeting_recording.wav');
let notificationShown = false;

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
          if (!notificationShown) {
            console.log('Zoom meeting detected. aomhost process is running.');
            showZoomNotification();
            notificationShown = true; // Prevent further notifications
          }
        } else {
          if (notificationShown) {
            console.log('Zoom meeting ended. Stopping recording...');
            stopRecording();
            notificationShown = false; // Reset state if no meeting is detected
          } else {
            console.log('Zoom is running, but no meeting detected.');
          }
        }
      } else {
        if (notificationShown) {
          console.log('Zoom is not running. Stopping recording...');
          stopRecording();
        }
        notificationShown = false; // Ensure state is reset
      }
    });
  }, 4000); // Check every 4 seconds
}

function showZoomNotification() {
  const notification = new Notification({
    title: 'Meeting Detected',
    body: 'Zoom meeting is running. Click to start recording.',
  });

  notification.on('click', () => {
    console.log('Start Recording clicked.');
    startRecording();
    notificationShown = false;
  });

  notification.show();
}

function startRecording() {
  if (micInstance) {
    console.log('Recording is already in progress.');
    return;
  }

  console.log('Starting audio recording...');
  micInstance = mic({
    rate: '16000',
    channels: '1',
    debug: true,
    fileType: 'wav',
  });

  audioFileStream = fs.createWriteStream(outputFilePath);

  const micInputStream = micInstance.getAudioStream();
  micInputStream.pipe(audioFileStream);

  micInputStream.on('data', (data) => {
    console.log(`Recording chunk received: ${data.length} bytes`);
  });

  micInputStream.on('error', (error) => {
    console.error('Microphone error:', error);
    stopRecording(); // Stop recording in case of an error
  });

  micInputStream.on('startComplete', () => {
    console.log('Recording started successfully.');
  });

  micInputStream.on('stopComplete', () => {
    console.log('Recording stopped successfully.');
  });

  micInstance.start();
}

function stopRecording() {
  if (!micInstance) {
    console.log('No active recording to stop.');
    return;
  }

  console.log('Stopping audio recording...');
  micInstance.stop();
  micInstance = null;

  if (audioFileStream) {
    audioFileStream.end(() => {
      console.log(`Recording saved to ${outputFilePath}`);
      // Notify the renderer or perform additional actions
      if (mainWindow) {
        mainWindow.webContents.send('recording-saved', outputFilePath);
      }
    });
    audioFileStream = null;
  }
}


app.on('window-all-closed', () => {
  console.log('All windows closed. Exiting app.');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('App activated.');
  // Recreate window logic if needed
});