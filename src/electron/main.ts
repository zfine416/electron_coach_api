import { app, BrowserWindow, Notification } from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { exec } from 'child_process';
import mic from 'mic';
import fs from 'fs';
import * as speech from '@google-cloud/speech';

// Set the path to your service account JSON
const serviceAccountPath = path.join(app.getAppPath(), 'coach-ai-445722-26abc296022b.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

console.log('GOOGLE_APPLICATION_CREDENTIALS set to:', serviceAccountPath);
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
  let meetingActive = false; // Track if a meeting is currently active

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

      console.log({ zoomMainProcess, aomHostProcess, notificationShown, meetingActive });

      if (zoomMainProcess) {
        if (aomHostProcess) {
          // Meeting is detected
          if (!meetingActive) {
            console.log('Zoom meeting detected. aomhost process is running.');
            showZoomNotification();
            meetingActive = true; // Mark meeting as active
          }
        } else {
          // Zoom is running, but no meeting
          if (meetingActive) {
            console.log('Zoom meeting ended. Stopping recording...');
            stopRecording();
            meetingActive = false; // Reset meeting state
          }
        }
      } else {
        // Zoom is not running
        if (meetingActive) {
          console.log('Zoom is not running. Stopping recording...');
          stopRecording();
        }
        meetingActive = false; // Ensure state is reset
      }
    });
  }, 2500); // Check every 2.5 seconds
}

function showZoomNotification() {
  const notification = new Notification({
    title: 'Meeting Detected',
    body: 'Zoom meeting is running. Click to start recording.',
  });

  notification.on('click', () => {
    console.log('Start Recording clicked.');
    startRecording();
    // Keep meetingActive as true since the meeting is still active
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
    audioFileStream.end(async () => {
      console.log(`Recording saved to ${outputFilePath}`);

      // Perform transcription
      try {
        const transcription = await transcribeAudio(outputFilePath);
        console.log('Transcription completed:', transcription);

        // Send the transcription to the renderer process
        if (mainWindow) {
          mainWindow.webContents.send('transcription-completed', transcription);
        }
      } catch (error) {
        console.error('Transcription failed:', error);
        if (mainWindow) {
          mainWindow.webContents.send('transcription-error', 'Transcription failed.');
        }
      }
    });
    audioFileStream = null;
  }
}

const client = new speech.SpeechClient();
async function transcribeAudio(filePath: string): Promise<string> {
  const audio = {
    content: fs.readFileSync(filePath).toString('base64'),
  };

  const config: speech.protos.google.cloud.speech.v1.IRecognitionConfig = {
    encoding: speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.LINEAR16, // Use the enum
    sampleRateHertz: 16000,
    languageCode: 'en-US',
  };

  const request: speech.protos.google.cloud.speech.v1.IRecognizeRequest = {
    audio,
    config,
  };

  // Explicitly type the response
  const [response] = await client.recognize(request);

  // Safely access the transcription
  const transcription = response.results
    ?.map((result) => result.alternatives?.[0]?.transcript)
    .filter(Boolean) // Filter out any undefined results
    .join('\n');

  if (!transcription) {
    throw new Error('No transcription found.');
  }

  return transcription;
}

app.on('window-all-closed', () => {
  console.log('All windows closed. Exiting app.');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  console.log('App activated.');
  // Recreate window logic if needed
});