// function startRecording(outputPath: string) {
//   console.log('Starting recording...');

//   // FFmpeg command to use FaceTime HD Camera and MacBook Pro Microphone with supported settings
//   const command = `"${ffmpegPath}" -f avfoundation -framerate 30 -video_size 1280x720 -i "1:1" -c:v libx264 -preset ultrafast -c:a aac -strict experimental "${outputPath}"`;

//   console.log('Executing FFmpeg command:', command);

//   // Execute FFmpeg command
//   const ffmpegProcess = exec(command, (error, stdout, stderr) => {
//     if (error) {
//       console.error('Error executing FFmpeg:', error.message);
//       return;
//     }
//     console.log('FFmpeg stdout:', stdout);
//     console.error('FFmpeg stderr:', stderr);
//   });

//   ffmpegProcess.on('close', (code) => {
//     if (code === 0) {
//       console.log(`Recording saved to ${outputPath}`);
//       uploadToGoogleCloud(outputPath); // Start the upload after recording ends
//     } else {
//       console.error(`FFmpeg process exited with code ${code}`);
//     }
//   });
// }

// Initialize Google Cloud Storage client
// const storage = new Storage();

// async function uploadToGoogleCloud(filePath: string): Promise<void> {
//   const bucketName = 'your-google-cloud-bucket-name'; // Replace with your bucket name
//   const destination = 'recordings/' + path.basename(filePath); // Path within the bucket

//   try {
//     console.log('Uploading to Google Cloud Storage...');
//     await storage.bucket(bucketName).upload(filePath, {
//       destination,
//       resumable: true,
//     });
//     console.log(`File uploaded to gs://${bucketName}/${destination}`);

//     // Trigger the video analysis after upload
//     analyzeVideo(`gs://${bucketName}/${destination}`);
//   } catch (error) {
//     console.error('Error uploading to Google Cloud Storage:', error);
//   }
// }

// video section ---------

// Create a client
// const videoClient = new videoIntelligence.v1.VideoIntelligenceServiceClient();

// const request: videoIntelligence.protos.google.cloud.videointelligence.v1.IAnnotateVideoRequest = {
//   inputUri: 'gs://your-bucket-name/recording-test.mp4', // Replace with the dynamic path after upload
//   features: [
//     videoIntelligence.protos.google.cloud.videointelligence.v1.Feature.SPEECH_TRANSCRIPTION,
//     videoIntelligence.protos.google.cloud.videointelligence.v1.Feature.PERSON_DETECTION,
//   ],
//   videoContext: {
//     speechTranscriptionConfig: {
//       languageCode: 'en-US',
//       enableSpeakerDiarization: true,
//       diarizationSpeakerCount: 2,
//       enableAutomaticPunctuation: true,
//     },
//     personDetectionConfig: {
//       includeBoundingBoxes: true,
//       includeAttributes: true, // Optionally detect person attributes like clothing
//     },
//   },
// };

// async function analyzeVideo(inputUri: string) {
//   console.log('Starting video annotation for:', inputUri);

//   const request: videoIntelligence.protos.google.cloud.videointelligence.v1.IAnnotateVideoRequest = {
//     inputUri,
//     features: [
//       videoIntelligence.protos.google.cloud.videointelligence.v1.Feature.SPEECH_TRANSCRIPTION,
//       videoIntelligence.protos.google.cloud.videointelligence.v1.Feature.PERSON_DETECTION,
//     ],
//     videoContext: {
//       speechTranscriptionConfig: {
//         languageCode: 'en-US',
//         enableSpeakerDiarization: true,
//         diarizationSpeakerCount: 2,
//         enableAutomaticPunctuation: true,
//       },
//       personDetectionConfig: {
//         includeBoundingBoxes: true,
//         includeAttributes: true,
//       },
//     },
//   };

//   try {
//     const [operation] = await videoClient.annotateVideo(request);
//     const [operationResult] = await operation.promise();

//     if (!operationResult.annotationResults || operationResult.annotationResults.length === 0) {
//       console.error('No annotation results found in the response.');
//       return;
//     }

//     const annotationResults = operationResult.annotationResults[0];

//     // Process transcription
//     if (annotationResults.speechTranscriptions) {
//       console.log('Speech Transcriptions:');
//       annotationResults.speechTranscriptions.forEach((transcription) => {
//         console.log('Transcript:', transcription.alternatives?.[0]?.transcript || 'No transcript found');

//         transcription.alternatives?.[0]?.words?.forEach((wordInfo) => {
//           console.log(
//             `Word: ${wordInfo.word}, Speaker: ${wordInfo.speakerTag}, Start: ${wordInfo.startTime?.seconds}s`
//           );
//         });
//       });
//     }

//     // Process person detection
//     if (annotationResults.personDetectionAnnotations) {
//       console.log('Person Detection Results:');
//       annotationResults.personDetectionAnnotations.forEach((person) => {
//         console.log('Person detected:', person);
//       });
//     }
//   } catch (err) {
//     console.error('Error during video annotation:', err);
//   }
// }

// ---------------- VIDEO END -------