import { IncomingForm } from 'formidable';
import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false, // formidable 사용을 위해 비활성화
  },
};

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  try {
    // formidable로 파일 파싱
    const form = new IncomingForm({
      keepExtensions: true,
      maxFileSize: 25 * 1024 * 1024, // 25MB
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    // 업로드된 오디오 파일 가져오기
    const audioFile = files.audio?.[0] || files.audio;
    
    if (!audioFile) {
      return res.status(400).json({ error: '오디오 파일이 필요합니다.' });
    }

    // OpenAI Whisper API 호출
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFile.filepath), {
      filename: audioFile.originalFilename || 'recording.webm',
      contentType: audioFile.mimetype || 'audio/webm',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko'); // 한국어
    formData.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    // 임시 파일 삭제
    fs.unlink(audioFile.filepath, () => {});

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API Error:', response.status, errorText);
      return res.status(response.status).json({
        error: `Whisper API 오류: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    return res.status(200).json({
      text: data.text || '',
      success: true
    });

  } catch (error) {
    console.error('Transcribe Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
