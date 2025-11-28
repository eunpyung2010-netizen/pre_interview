// ============================================================
// 면접 모의연습 시스템 - 영상 분석 기능 JavaScript
// ============================================================
// 이 파일의 내용을 기존 index.html의 <script> 태그 내에 추가하세요.
// ============================================================

// ==================== 영상 분석 관련 전역 변수 ====================
let analysisMode = 'audio'; // 'audio' or 'video'
let videoStream = null;
let videoRecorder = null;
let videoChunks = [];
let videoBlob = null;
let faceApiLoaded = false;
let faceDetectionInterval = null;

let videoAnalysisData = {
  expressionSamples: [],
  gazeDirections: [],
  headPoses: [],
  cameraLookRatio: 0,
  dominantExpression: null,
  expressionDistribution: {},
  stabilityScore: 0,
  smileRatio: 0
};

// ==================== face-api.js 로드 ====================
async function loadFaceApi() {
  if (faceApiLoaded) return true;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js';
    script.onload = async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
        ]);
        faceApiLoaded = true;
        console.log('face-api.js 모델 로드 완료');
        resolve(true);
      } catch (err) {
        console.error('face-api.js 모델 로드 실패:', err);
        reject(err);
      }
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ==================== 모드 선택 ====================
function selectMode(mode) {
  analysisMode = mode;
  document.getElementById('modeAudio').classList.toggle('selected', mode === 'audio');
  document.getElementById('modeVideo').classList.toggle('selected', mode === 'video');
  
  const videoContainer = document.getElementById('videoContainer');
  if (mode === 'video') {
    videoContainer.classList.remove('hidden');
    initVideoPreview();
  } else {
    videoContainer.classList.add('hidden');
    stopVideoPreview();
  }
}

// ==================== 비디오 프리뷰 초기화 ====================
async function initVideoPreview() {
  const video = document.getElementById('videoPreview');
  const loading = document.getElementById('videoLoading');
  
  loading.classList.remove('hidden');
  
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false 
    });
    
    video.srcObject = videoStream;
    await video.play();
    await loadFaceApi();
    
    loading.classList.add('hidden');
    document.getElementById('videoStatusText').textContent = '카메라 준비 완료';
    
    const canvas = document.getElementById('videoCanvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    startRealtimeFaceDetection();
  } catch (err) {
    console.error('카메라 초기화 실패:', err);
    loading.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #888;">
        <div style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;">📷</div>
        <div>카메라를 사용할 수 없습니다</div>
        <div style="font-size: 0.85rem; margin-top: 0.5rem;">카메라 권한을 허용해주세요</div>
      </div>
    `;
  }
}

// ==================== 비디오 프리뷰 중지 ====================
function stopVideoPreview() {
  if (faceDetectionInterval) {
    clearInterval(faceDetectionInterval);
    faceDetectionInterval = null;
  }
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
}

// ==================== 실시간 얼굴 감지 ====================
function startRealtimeFaceDetection() {
  const video = document.getElementById('videoPreview');
  const canvas = document.getElementById('videoCanvas');
  const ctx = canvas.getContext('2d');
  const statsContainer = document.getElementById('realtimeStats');
  
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  
  faceDetectionInterval = setInterval(async () => {
    if (!video.srcObject) return;
    
    try {
      const detection = await faceapi
        .detectSingleFace(video, options)
        .withFaceLandmarks(true)
        .withFaceExpressions();
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      if (detection) {
        // 얼굴 박스 그리기
        const box = detection.detection.box;
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // 주요 표정
        const expressions = detection.expressions;
        const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
        const dominant = sorted[0];
        
        // 시선 방향
        const gazeDirection = estimateGazeDirection(detection.landmarks);
        
        // 실시간 통계 표시
        statsContainer.innerHTML = `
          <div class="stat-badge ${dominant[1] > 0.5 ? 'good' : ''}">
            <span class="stat-icon">${getExpressionEmoji(dominant[0])}</span>
            <span class="stat-value">${translateExpression(dominant[0])}</span>
          </div>
          <div class="stat-badge ${gazeDirection === 'center' ? 'good' : 'warning'}">
            <span class="stat-icon">👁️</span>
            <span class="stat-value">${translateGaze(gazeDirection)}</span>
          </div>
        `;
        
        // 녹화 중이면 데이터 수집
        if (isRecording && analysisMode === 'video') {
          collectVideoAnalysisData(detection, gazeDirection);
        }
      } else {
        statsContainer.innerHTML = `
          <div class="stat-badge warning">
            <span class="stat-icon">⚠️</span>
            <span class="stat-value">얼굴 감지 안됨</span>
          </div>
        `;
      }
    } catch (err) {
      // 조용히 실패
    }
  }, 200); // 5 FPS
}

// ==================== 시선 방향 추정 ====================
function estimateGazeDirection(landmarks) {
  if (!landmarks) return 'unknown';
  
  const positions = landmarks.positions;
  const noseTip = positions[30];
  const leftEye = landmarks.getLeftEye();
  const rightEye = landmarks.getRightEye();
  
  const leftEyeCenter = {
    x: leftEye.reduce((s, p) => s + p.x, 0) / leftEye.length,
    y: leftEye.reduce((s, p) => s + p.y, 0) / leftEye.length
  };
  const rightEyeCenter = {
    x: rightEye.reduce((s, p) => s + p.x, 0) / rightEye.length,
    y: rightEye.reduce((s, p) => s + p.y, 0) / rightEye.length
  };
  
  const faceCenterX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const horizontalOffset = noseTip.x - faceCenterX;
  const eyeDistance = Math.abs(rightEyeCenter.x - leftEyeCenter.x);
  const normalizedOffset = horizontalOffset / eyeDistance;
  
  if (Math.abs(normalizedOffset) < 0.15) return 'center';
  return normalizedOffset > 0 ? 'right' : 'left';
}

// ==================== 영상 분석 데이터 수집 ====================
function collectVideoAnalysisData(detection, gazeDirection) {
  if (!detection) return;
  
  videoAnalysisData.expressionSamples.push({
    timestamp: Date.now(),
    expressions: { ...detection.expressions }
  });
  
  videoAnalysisData.gazeDirections.push(gazeDirection);
  
  // 머리 기울기 계산
  const positions = detection.landmarks.positions;
  const leftEye = positions[36];
  const rightEye = positions[45];
  const eyeSlope = (rightEye.y - leftEye.y) / (rightEye.x - leftEye.x);
  const roll = Math.atan(eyeSlope) * (180 / Math.PI);
  videoAnalysisData.headPoses.push({ roll });
}

// ==================== 유틸리티 함수들 ====================
function getExpressionEmoji(exp) {
  const emojis = {
    neutral: '😐', happy: '😊', sad: '😢', angry: '😠',
    fearful: '😨', disgusted: '🤢', surprised: '😲'
  };
  return emojis[exp] || '🙂';
}

function translateExpression(exp) {
  const translations = {
    neutral: '중립', happy: '미소', sad: '슬픔', angry: '화남',
    fearful: '불안', disgusted: '불쾌', surprised: '놀람'
  };
  return translations[exp] || exp;
}

function translateGaze(dir) {
  const translations = {
    center: '정면 응시', left: '왼쪽', right: '오른쪽', unknown: '감지 안됨'
  };
  return translations[dir] || dir;
}

// ==================== 영상 분석 데이터 처리 ====================
function processVideoAnalysisData() {
  const data = videoAnalysisData;
  
  if (data.expressionSamples.length === 0) {
    console.log('영상 분석 데이터 없음');
    return;
  }
  
  // 1. 카메라 응시 비율
  const centerCount = data.gazeDirections.filter(d => d === 'center').length;
  data.cameraLookRatio = Math.round((centerCount / data.gazeDirections.length) * 100) || 0;
  
  // 2. 표정 분포 계산
  const expressionTotals = {
    neutral: 0, happy: 0, sad: 0, angry: 0,
    fearful: 0, disgusted: 0, surprised: 0
  };
  
  data.expressionSamples.forEach(sample => {
    Object.keys(expressionTotals).forEach(exp => {
      expressionTotals[exp] += sample.expressions[exp] || 0;
    });
  });
  
  const sampleCount = data.expressionSamples.length;
  Object.keys(expressionTotals).forEach(exp => {
    data.expressionDistribution[exp] = Math.round((expressionTotals[exp] / sampleCount) * 100);
  });
  
  // 3. 주요 표정
  const sorted = Object.entries(data.expressionDistribution).sort((a, b) => b[1] - a[1]);
  data.dominantExpression = sorted[0][0];
  
  // 4. 미소 비율
  data.smileRatio = data.expressionDistribution.happy || 0;
  
  // 5. 자세 안정성
  if (data.headPoses.length > 1) {
    let totalChange = 0;
    for (let i = 1; i < data.headPoses.length; i++) {
      totalChange += Math.abs(data.headPoses[i].roll - data.headPoses[i-1].roll);
    }
    const avgChange = totalChange / (data.headPoses.length - 1);
    data.stabilityScore = Math.max(0, Math.min(100, Math.round(100 - avgChange * 5)));
  } else {
    data.stabilityScore = 80;
  }
  
  console.log('영상 분석 완료:', data);
}

// ==================== 영상 분석 결과 렌더링 ====================
function renderVideoAnalysis(videoAnalysis) {
  const section = document.getElementById('videoAnalysisSection');
  const grid = document.getElementById('videoAnalysisGrid');
  
  if (!section || !grid) return;
  
  if (!videoAnalysis || !videoAnalysis.cameraLookRatio) {
    section.classList.add('hidden');
    return;
  }
  
  section.classList.remove('hidden');
  
  // 평가 함수들
  const getGazeStatus = (r) => {
    if (r >= 70) return { label: '훌륭함', class: 'excellent', icon: '✓' };
    if (r >= 50) return { label: '좋음', class: 'good', icon: '○' };
    if (r >= 30) return { label: '개선 필요', class: 'warning', icon: '!' };
    return { label: '많은 개선 필요', class: 'low', icon: '✗' };
  };
  
  const getSmileStatus = (r) => {
    if (r >= 30) return { label: '밝은 인상', class: 'excellent', icon: '✓' };
    if (r >= 15) return { label: '적당함', class: 'good', icon: '○' };
    if (r >= 5) return { label: '조금 경직', class: 'warning', icon: '!' };
    return { label: '긴장됨', class: 'low', icon: '✗' };
  };
  
  const getStabilityStatus = (s) => {
    if (s >= 80) return { label: '안정적', class: 'excellent', icon: '✓' };
    if (s >= 60) return { label: '양호', class: 'good', icon: '○' };
    if (s >= 40) return { label: '움직임 많음', class: 'warning', icon: '!' };
    return { label: '불안정', class: 'low', icon: '✗' };
  };
  
  const gazeStatus = getGazeStatus(videoAnalysis.cameraLookRatio);
  const smileStatus = getSmileStatus(videoAnalysis.smileRatio);
  const stabilityStatus = getStabilityStatus(videoAnalysis.stabilityScore);
  
  // 요약 포인트
  let summaryItems = [];
  if (videoAnalysis.cameraLookRatio >= 70) {
    summaryItems.push({ text: '카메라 응시 훌륭', type: 'positive' });
  } else if (videoAnalysis.cameraLookRatio < 50) {
    summaryItems.push({ text: '카메라 응시 더 자주', type: 'warning' });
  }
  if (videoAnalysis.smileRatio >= 20) {
    summaryItems.push({ text: '밝은 표정 유지', type: 'positive' });
  } else if (videoAnalysis.smileRatio < 10) {
    summaryItems.push({ text: '가벼운 미소 권장', type: 'warning' });
  }
  if (videoAnalysis.stabilityScore >= 70) {
    summaryItems.push({ text: '안정된 자세', type: 'positive' });
  } else if (videoAnalysis.stabilityScore < 50) {
    summaryItems.push({ text: '자세 안정 필요', type: 'warning' });
  }
  
  // 표정 분포 차트
  const expressionBars = Object.entries(videoAnalysis.expressionDistribution || {})
    .map(([exp, value]) => `
      <div class="expression-bar">
        <div class="expression-bar-fill" style="height: ${Math.min(100, value)}%"></div>
        <div class="expression-bar-value">${value}%</div>
        <div class="expression-bar-label">${getExpressionEmoji(exp)}</div>
      </div>
    `).join('');
  
  grid.innerHTML = `
    <!-- 요약 -->
    ${summaryItems.length > 0 ? `
    <div class="video-summary">
      <div class="video-summary-title">
        <span>🎬</span>
        <span>영상 분석 한눈에 보기</span>
      </div>
      <div class="video-summary-items">
        ${summaryItems.map(item => `
          <span class="video-summary-item ${item.type}">${item.text}</span>
        `).join('')}
      </div>
    </div>
    ` : ''}
    
    <!-- 카메라 응시 -->
    <div class="video-metric">
      <div class="video-metric-header">
        <span class="video-metric-label">👁️ 카메라 응시</span>
        <span class="voice-status-badge ${gazeStatus.class}">${gazeStatus.icon} ${gazeStatus.label}</span>
      </div>
      <div class="video-metric-value ${gazeStatus.class}">${videoAnalysis.cameraLookRatio}%</div>
      <div class="video-metric-bar">
        <div class="video-metric-fill ${gazeStatus.class}" style="width: ${videoAnalysis.cameraLookRatio}%"></div>
      </div>
      <div class="video-metric-desc">
        화상 면접에서는 카메라 렌즈를 직접 바라봐야 면접관과 눈을 맞추는 효과가 있어요.
      </div>
    </div>
    
    <!-- 미소 비율 -->
    <div class="video-metric">
      <div class="video-metric-header">
        <span class="video-metric-label">😊 미소 비율</span>
        <span class="voice-status-badge ${smileStatus.class}">${smileStatus.icon} ${smileStatus.label}</span>
      </div>
      <div class="video-metric-value ${smileStatus.class}">${videoAnalysis.smileRatio}%</div>
      <div class="video-metric-bar">
        <div class="video-metric-fill ${smileStatus.class}" style="width: ${Math.min(100, videoAnalysis.smileRatio * 2)}%"></div>
      </div>
      <div class="video-metric-desc">
        핵심 포인트에서 가벼운 미소를 지으면 호감도가 올라가요.
      </div>
    </div>
    
    <!-- 자세 안정성 -->
    <div class="video-metric">
      <div class="video-metric-header">
        <span class="video-metric-label">🧍 자세 안정성</span>
        <span class="voice-status-badge ${stabilityStatus.class}">${stabilityStatus.icon} ${stabilityStatus.label}</span>
      </div>
      <div class="video-metric-value ${stabilityStatus.class}">${videoAnalysis.stabilityScore}%</div>
      <div class="video-metric-bar">
        <div class="video-metric-fill ${stabilityStatus.class}" style="width: ${videoAnalysis.stabilityScore}%"></div>
      </div>
      <div class="video-metric-desc">
        상체를 안정적으로 유지하면 자신감 있는 인상을 줄 수 있어요.
      </div>
    </div>
    
    <!-- 표정 분포 -->
    <div class="video-metric">
      <div class="video-metric-header">
        <span class="video-metric-label">😐 표정 분포</span>
        <span class="voice-status-badge good">${getExpressionEmoji(videoAnalysis.dominantExpression)} 주요: ${translateExpression(videoAnalysis.dominantExpression)}</span>
      </div>
      <div class="expression-chart">
        ${expressionBars}
      </div>
      <div class="video-metric-desc">
        녹화 중 감지된 표정의 분포입니다. 다양한 표정을 자연스럽게 사용하면 좋아요.
      </div>
    </div>
  `;
}


// ============================================================
// 아래는 기존 함수들을 수정해야 하는 부분입니다.
// 기존 함수를 찾아서 아래 내용으로 교체하세요.
// ============================================================

/*
=== startRecording 함수 수정 ===
기존 startRecording 함수의 시작 부분에 아래 내용을 추가하세요:

async function startRecording() {
  try {
    // ▼▼▼ 추가할 코드 시작 ▼▼▼
    // 영상 분석 데이터 초기화
    videoAnalysisData = {
      expressionSamples: [],
      gazeDirections: [],
      headPoses: [],
      cameraLookRatio: 0,
      dominantExpression: null,
      expressionDistribution: {},
      stabilityScore: 0,
      smileRatio: 0
    };
    // ▲▲▲ 추가할 코드 끝 ▲▲▲
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // ▼▼▼ 추가할 코드 (stream 획득 후) ▼▼▼
    // 영상 모드일 경우 비디오 녹화도 시작
    if (analysisMode === 'video' && videoStream) {
      const combinedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...stream.getAudioTracks()
      ]);
      
      videoRecorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
      videoChunks = [];
      
      videoRecorder.ondataavailable = (e) => {
        videoChunks.push(e.data);
      };
      
      videoRecorder.onstop = () => {
        videoBlob = new Blob(videoChunks, { type: 'video/webm' });
      };
      
      videoRecorder.start();
      
      const videoStatus = document.getElementById('videoStatus');
      if (videoStatus) {
        videoStatus.classList.add('recording');
        document.getElementById('videoStatusText').textContent = '녹화 중...';
      }
    }
    // ▲▲▲ 추가할 코드 끝 ▲▲▲
    
    // ... 기존 코드 계속 ...
    
    // ▼▼▼ UI 업데이트 부분에 추가 ▼▼▼
    // 모드 선택 비활성화
    const modeSelector = document.getElementById('modeSelector');
    if (modeSelector) {
      modeSelector.style.pointerEvents = 'none';
      modeSelector.style.opacity = '0.5';
    }
    // ▲▲▲ 추가할 코드 끝 ▲▲▲


=== stopRecording 함수 수정 ===
stopRecording 함수에 아래 내용을 추가하세요:

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  
  // ▼▼▼ 추가할 코드 ▼▼▼
  // 영상 녹화 중지
  if (videoRecorder && videoRecorder.state !== 'inactive') {
    videoRecorder.stop();
    
    const videoStatus = document.getElementById('videoStatus');
    if (videoStatus) {
      videoStatus.classList.remove('recording');
      document.getElementById('videoStatusText').textContent = '녹화 완료';
    }
  }
  // ▲▲▲ 추가할 코드 끝 ▲▲▲
  
  isRecording = false;
  clearInterval(timerInterval);
  stopWaveform();
  
  // ... 기존 UI 업데이트 코드 ...
  
  // ▼▼▼ 추가할 코드 (UI 업데이트 후) ▼▼▼
  // 모드 선택 다시 활성화
  const modeSelector = document.getElementById('modeSelector');
  if (modeSelector) {
    modeSelector.style.pointerEvents = 'auto';
    modeSelector.style.opacity = '1';
  }
  
  // 영상 분석 데이터 처리
  if (analysisMode === 'video') {
    processVideoAnalysisData();
  }
  // ▲▲▲ 추가할 코드 끝 ▲▲▲
}


=== viewResult 함수 수정 ===
viewResult 함수에서 renderVoiceAnalysis 호출 뒤에 추가:

  renderVoiceAnalysis(p.voiceAnalysis);
  renderVideoAnalysis(p.videoAnalysis); // ← 이 줄 추가


=== submitRecording 함수 수정 ===
practice 객체 생성 부분에 videoAnalysis 추가:

    const practice = {
      attempt: practices.length + 1,
      question: question,
      transcript: transcript,
      feedback: feedback,
      voiceAnalysis: voiceAnalysis,
      videoAnalysis: analysisMode === 'video' ? { ...videoAnalysisData } : null, // ← 이 줄 추가
      timestamp: new Date().toISOString()
    };


=== resetRecording 함수 수정 ===
resetRecording 함수에 영상 관련 초기화 추가:

function resetRecording() {
  audioBlob = null;
  audioUrl = null;
  audioChunks = [];
  
  // ▼▼▼ 추가할 코드 ▼▼▼
  videoBlob = null;
  videoChunks = [];
  
  videoAnalysisData = {
    expressionSamples: [],
    gazeDirections: [],
    headPoses: [],
    cameraLookRatio: 0,
    dominantExpression: null,
    expressionDistribution: {},
    stabilityScore: 0,
    smileRatio: 0
  };
  // ▲▲▲ 추가할 코드 끝 ▲▲▲
  
  // ... 기존 코드 ...
  
  // ▼▼▼ 함수 끝에 추가 ▼▼▼
  // 비디오 상태 초기화
  if (analysisMode === 'video') {
    const videoStatus = document.getElementById('videoStatus');
    if (videoStatus) {
      videoStatus.classList.remove('recording');
      document.getElementById('videoStatusText').textContent = '카메라 준비 완료';
    }
  }
  // ▲▲▲ 추가할 코드 끝 ▲▲▲
}
*/
