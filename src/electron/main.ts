import { app, BrowserWindow, Notification, systemPreferences } from 'electron';
import path from 'path';
import { isDev } from './util.js';
import { getPreloadPath } from './pathResolver.js';
import { exec } from 'child_process';
import fs from 'fs';
import * as speech from '@google-cloud/speech';
import NaturalLanguageUnderstandingV1 from 'ibm-watson/natural-language-understanding/v1.js';
import { IamAuthenticator } from 'ibm-watson/auth/index.js';
import ffmpegPath from 'ffmpeg-static';
import dotenv from 'dotenv';
dotenv.config();

const naturalLanguageUnderstanding = new NaturalLanguageUnderstandingV1({
  version: '2022-04-07',
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_API_KEY || '', // Use the environment variable
  }),
  serviceUrl: process.env.IBM_SERVICE_URL || '', // Use the environment variable
});

// Set the path to your service account JSON
const serviceAccountPath = path.join(app.getAppPath(), 'coach-ai-445722-26abc296022b.json');
process.env.GOOGLE_APPLICATION_CREDENTIALS = serviceAccountPath;

console.log('GOOGLE_APPLICATION_CREDENTIALS set to:', serviceAccountPath);
let mainWindow: BrowserWindow | null = null;

app.on('ready', async () => {
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

  try {
    await requestMediaPermissions();
  } catch (error) {
    console.error('Failed to request media permissions:', error);
  }

  // analyzeVideo()
  // Start monitoring for Zoom windows after the app is ready
  monitorZoomProcesses();
});

async function requestMediaPermissions(): Promise<void> {
  try {
    // Ask for microphone access
    const micAccess = await systemPreferences.askForMediaAccess('microphone');
    console.log('Microphone access granted:', micAccess);

    // Ask for camera access
    const cameraAccess = await systemPreferences.askForMediaAccess('camera');
    console.log('Camera access granted:', cameraAccess);

    if (!micAccess || !cameraAccess) {
      console.error('Microphone or camera access was denied. Recording will not work.');
    }
  } catch (error) {
    console.error('Error requesting media permissions:', error);
  }
}

let recordingProcess: ReturnType<typeof exec> | null = null;
let recordingActive = false; // Track whether a recording is active
const outputPath = path.join(app.getPath('userData'), 'meeting-recording.wav');

function startRecording(outputPath: string) {
  if (recordingActive) {
    console.log('Recording is already in progress.');
    return;
  }

  console.log('Starting system audio recording...');

  // FFmpeg command to record system audio with mono channel (-ac 1)
  const command = `"${ffmpegPath}" -y -f avfoundation -i "none:0" -ac 1 -ar 44100 -c:a pcm_s16le "${outputPath}"`;

  console.log('Executing FFmpeg command:', command);

  // Start the FFmpeg process
  recordingProcess = exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error('Error executing FFmpeg:', error.message);
      console.error('FFmpeg stderr:', stderr);
      recordingActive = false; // Ensure recordingActive is reset on failure
      return;
    }
    console.log('FFmpeg stdout:', stdout);
    console.error('FFmpeg stderr:', stderr);
  });

  // Attach the 'close' event handler here
  recordingProcess.on('close', (code: number) => {
    console.log('CODE:', code);
    if (code === 0) {
      console.log(`System audio recording saved to ${outputPath}`);
      processAudioFile(outputPath); // Pass the recorded audio to Google Speech-to-Text
    } else {
      console.error(`FFmpeg process exited with code ${code}`);
      console.error('Recording failed. Please verify the parameters or system configuration.');
    }
  });

  // Set the recording state to active
  recordingActive = true;
}

function stopRecording() {
  if (recordingProcess) {
    console.log('Stopping system audio recording...');

    // Attach an event handler to ensure cleanup
    recordingProcess.on('close', (code: number) => {
      console.log(`FFmpeg process closed with code: ${code}`);
      
      // Check if the output file exists after stopping
      if (fs.existsSync(outputPath)) {
        console.log(`Recording stopped and saved to ${outputPath}`);
        processAudioFile(outputPath); // Pass the recorded audio to Google Speech-to-Text
      } else {
        console.error('Recording stopped, but output file was not created.');
      }
    });

    // Send SIGINT to gracefully stop FFmpeg and finalize the file
    recordingProcess.kill('SIGINT');
    recordingProcess = null;
  } else {
    console.log('No active recording to stop.');
  }

  // Ensure recording state is reset
  recordingActive = false;
}

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
    startRecording(outputPath); // Start recording when the notification is clicked
  });

  notification.show();
}

async function processAudioFile(audioPath: string) {
  console.log(`Processing audio file: ${audioPath}`);

  const client = new speech.SpeechClient();
  const audio = {
    content: fs.readFileSync(audioPath).toString('base64'),
  };

  const config: speech.protos.google.cloud.speech.v1p1beta1.IRecognitionConfig = {
    encoding: 'LINEAR16',
    sampleRateHertz: 44100,
    languageCode: 'en-US',
    enableAutomaticPunctuation: true,
    enableSpokenPunctuation: { value: true },
    enableSpeakerDiarization: true,
    diarizationConfig: {
      enableSpeakerDiarization: true,
      minSpeakerCount: 2,
    },
  };

  const request: speech.protos.google.cloud.speech.v1p1beta1.IRecognizeRequest = {
    config,
    audio,
  };

  try {
    console.log('Sending audio to Google Speech-to-Text...');
    const [response] = await client.recognize(request);

    console.log('Processing transcription results...');
    if (!response.results || response.results.length === 0) {
      throw new Error('No results returned from the Speech-to-Text API.');
    }

    console.log('Transcription completed:');
    const transcription = response.results
      .map(result => result.alternatives?.[0]?.transcript || '')
      .join('\n');
    console.log(transcription);
    console.log("RESULTS: ", response.results)
    console.log("Alternatives:", response.results[0].alternatives)
    // Extract speaker diarization info
    const wordsInfo = response.results[response.results.length - 1].alternatives?.[0]?.words || [];
    const speakerMapping: Record<string, string[]> = {};

    wordsInfo.forEach(wordInfo => {
      const speaker = `Speaker ${wordInfo.speakerTag}`;
      if (!speakerMapping[speaker]) {
        speakerMapping[speaker] = [];
      }
      speakerMapping[speaker].push(wordInfo.word || '');
    });

    Object.keys(speakerMapping).forEach(speaker => {
      console.log(`${speaker}: ${speakerMapping[speaker].join(' ')}`);
    });

    // Pass transcription to the UI or further processing
    if (mainWindow) {
      mainWindow.webContents.send('transcription-completed', {
        transcription,
        speakerMapping,
      });
    }
  } catch (error) {
    console.error('Error processing audio file:', error);
  }
}

async function analyzeTone(transcription: string): Promise<void> {
  try {
    // Define parameters for tone analysis
    const analyzeParams = {
      text: transcription,
      features: {
        emotion: {}, // Emotion analysis
        sentiment: {}, // Sentiment analysis
      },
    };

    // Call the NLU API
    const analysisResults = await naturalLanguageUnderstanding.analyze(analyzeParams);
    console.log('Tone analysis results:', JSON.stringify(analysisResults.result, null, 2));

    // Extract emotion and sentiment results
    const emotions = analysisResults.result.emotion?.document?.emotion;
    const sentiment = analysisResults.result.sentiment?.document;

    // Log emotions and sentiment to the console
    if (emotions) {
      console.log('Emotions:');
      for (const [emotion, score] of Object.entries(emotions)) {
        console.log(`  ${emotion}: ${score}`);
      }
    } else {
      console.log('No emotion data found.');
    }

    if (sentiment) {
      console.log('Sentiment:');
      console.log(`  Sentiment: ${sentiment.label}`);
      console.log(`  Score: ${sentiment.score}`);
    } else {
      console.log('No sentiment data found.');
    }

    // Send analysis results to the UI or process further
    if (mainWindow) {
      mainWindow.webContents.send('tone-analysis-completed', {
        emotions,
        sentiment,
      });
    }
  } catch (err) {
    console.error('Error analyzing tone:', err);

    // Notify UI about the error
    if (mainWindow) {
      mainWindow.webContents.send('tone-analysis-error', 'Tone analysis failed.');
    }
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