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
      allowEmptyFiles: false,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('Formidable parse error:', err);
          reject(err);
        } else {
          resolve([fields, files]);
        }
      });
    });

    // 업로드된 오디오 파일 가져오기
    const audioFile = files.audio?.[0] || files.audio;
    
    if (!audioFile) {
      return res.status(400).json({ error: '오디오 파일이 필요합니다.' });
    }

    console.log('Audio file received:', {
      filepath: audioFile.filepath,
      originalFilename: audioFile.originalFilename,
      mimetype: audioFile.mimetype,
      size: audioFile.size
    });

    // 파일 존재 확인
    if (!fs.existsSync(audioFile.filepath)) {
      return res.status(400).json({ error: '업로드된 파일을 찾을 수 없습니다.' });
    }

    // 파일 크기 확인
    const stats = fs.statSync(audioFile.filepath);
    if (stats.size === 0) {
      fs.unlink(audioFile.filepath, () => {});
      return res.status(400).json({ error: '빈 오디오 파일입니다.' });
    }

    // OpenAI Whisper API 호출
    const formData = new FormData();
    
    // 파일 확장자 결정
    let filename = audioFile.originalFilename || 'recording.webm';
    let contentType = audioFile.mimetype || 'audio/webm';
    
    // webm이 문제가 될 수 있으므로 명시적으로 처리
    if (filename.endsWith('.webm') || contentType.includes('webm')) {
      contentType = 'audio/webm';
    }
    
    formData.append('file', fs.createReadStream(audioFile.filepath), {
      filename: filename,
      contentType: contentType,
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'ko'); // 한국어
    formData.append('response_format', 'json');

    console.log('Sending to Whisper API...');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    // 임시 파일 삭제
    fs.unlink(audioFile.filepath, (err) => {
      if (err) console.error('Failed to delete temp file:', err);
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Whisper API Error:', response.status, errorText);
      
      // 더 구체적인 에러 메시지
      let errorMessage = `음성 변환 실패 (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message;
        }
      } catch (e) {
        // JSON 파싱 실패 시 원본 텍스트 사용
      }
      
      return res.status(response.status).json({
        error: errorMessage,
        details: errorText
      });
    }

    const data = await response.json();
    
    console.log('Whisper API success:', data.text?.substring(0, 100));
    
    return res.status(200).json({
      text: data.text || '',
      success: true
    });

  } catch (error) {
    console.error('Transcribe Error:', error);
    return res.status(500).json({ 
      error: '음성 변환 중 오류가 발생했습니다: ' + error.message 
    });
  }
}
