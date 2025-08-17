
import type { NextApiRequest, NextApiResponse } from 'next';
import { SpeechClient } from '@google-cloud/speech';
import fetch from 'node-fetch';

const client = new SpeechClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { audioUrl } = req.body;

  if (!audioUrl) {
    console.error('transcribe API: Missing audioUrl in request body.');
    return res.status(400).json({ message: 'Missing audioUrl' });
  }

  console.log(`transcribe API: Received audioUrl: ${audioUrl}`);

  try {
    // Download the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio from ${audioUrl}: ${audioResponse.statusText}`);
    }
    const audioBuffer = await audioResponse.buffer();
    console.log(`transcribe API: Downloaded audio buffer size: ${audioBuffer.length} bytes`);

    const audio = {
      content: audioBuffer.toString('base64'),
    };
    const config = {
      encoding: 'WEBM_OPUS', // 修正: LINEAR16 から WEBM_OPUS へ
      sampleRateHertz: 48000, // 修正: 16000 から 48000 へ
      languageCode: 'ja-JP',
      // enableAutomaticPunctuation: true, // Optional: for better transcription quality
      // model: 'default', // Optional: 'default', 'command_and_search', 'phone_call', 'video', 'latest_long', 'latest_short'
    } as const;
    const request = {
      audio: audio,
      config: config,
    };

    console.log('transcribe API: Sending request to Google Speech-to-Text...');
    const responses = await client.recognize(request);
    const response = responses[0];
    console.log('transcribe API: Received response from Google Speech-to-Text.');

    const transcription = response.results
      ?.map(result => result.alternatives?.[0]?.transcript)
      .join('\n');

    console.log(`transcribe API: Transcription result: ${transcription || '(empty)'}`);
    res.status(200).json({ transcription });
  } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('transcribe API: Error transcribing audio:', error);
    res.status(500).json({ message: 'Error transcribing audio', error: error.message });
  }
}
