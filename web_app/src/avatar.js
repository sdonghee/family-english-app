/**
 * web_app/src/avatar.js
 * ----------------------------------------------------------------------------
 * 아바타 두 종류를 같은 인터페이스로 감쌉니다.
 *
 *  1) PhotoAvatar  — 무료. Chloe 사진 + 오디오 기반 립싱크.
 *     매일 쓰는 기본 모드. 요금이 0원이고, 잘 만들면 놀랄 만큼 살아있어 보입니다.
 *     턱 내림 + 입 모양 + 눈 깜빡임 + 미세한 고개 움직임 + 호흡을 합성합니다.
 *
 *  2) SimliAvatar  — 유료. 실사 영상 아바타.
 *     Gemini가 만든 음성을 그대로 Simli에 흘려보내면 그 음성에 맞춰
 *     실제 사람 영상이 생성됩니다. 특별한 날/주말용.
 *
 * 공통 인터페이스:
 *   await mount(container)
 *   pushAudio(pcm16_24k)   // 선생님 음성 조각
 *   interrupt()            // 말 끊김 → 즉시 정지
 *   setState('idle'|'listening'|'thinking'|'speaking')
 *   unmount()
 *   get usesLocalAudio()   // true면 우리가 스피커로 재생해야 함
 * ----------------------------------------------------------------------------
 */

import { AUDIO, AVATAR_MODE } from './config.js';
import { resamplePcm16, int16ToBytes } from './pcm.js';

/* ═══════════════════════════════════════════════════════════════════════════
   1. 사진 립싱크 아바타 (무료 · 기본)
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 사진 보정값.
 *
 * 기본값은 assets/chloe_teacher_avatar.jpg (896×1200) 기준으로 직접 측정한 값입니다.
 * 사진을 교체하면 이 값들을 다시 맞춰야 합니다.
 *
 * crop: 원본에서 얼굴만 잘라내는 영역 (원본 크기에 대한 비율).
 *   원본은 책상·노트북까지 다 들어간 전신 구도라서, 그대로 쓰면 얼굴이 너무 작습니다.
 *   얼굴 중심으로 잘라내면 실제 영상통화 화면처럼 보입니다.
 *   (0.52 × 0.52 = 466×624px → 3:4 비율, 무대 비율과 일치)
 *
 * 나머지 좌표는 **잘라낸 영역** 기준 비율입니다.
 */
export const DEFAULT_FACE_MAP = {
  crop: { x: 0.28, y: 0.09, w: 0.52, h: 0.52 },

  // 입 (치아가 보이는 웃는 입의 중심)
  mouthX: 0.520,
  mouthY: 0.518,
  mouthW: 0.175,
  /** 턱 아래 끝 — 늘림 영역의 아래 한계 */
  chinY: 0.625,

  // 눈. 고개가 살짝 기울어져 있어 좌우 높이를 따로 둡니다.
  eyeLeftX: 0.440,
  eyeLeftY: 0.365,
  eyeRightX: 0.635,
  eyeRightY: 0.347,
  eyeW: 0.085,
};

export class PhotoAvatar {
  /**
   * @param {object} opts
   * @param {string} opts.imageSrc
   * @param {() => number} opts.getLevel       현재 음량 0~1
   * @param {() => number} opts.getMouthWidth  입 모양 0(둥근)~1(넓은)
   * @param {object} [opts.faceMap]
   */
  constructor(opts) {
    this.imageSrc = opts.imageSrc;
    this.getLevel = opts.getLevel;
    this.getMouthWidth = opts.getMouthWidth || (() => 0.5);
    this.faceMap = { ...DEFAULT_FACE_MAP, ...(opts.faceMap || {}) };
    this.crop = { ...DEFAULT_FACE_MAP.crop, ...(this.faceMap.crop || {}) };

    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.rafId = null;
    this.state = 'idle';

    this.startedAt = performance.now();
    this.nextBlinkAt = this.startedAt + 1800 + Math.random() * 2400;
    this.blinkStartedAt = 0;
    this.smoothedLevel = 0;
    this.smoothedWidth = 0.5;

    /** 잘라낸 영역의 원본 픽셀 좌표 (mount에서 계산) */
    this.src = null;
  }

  get usesLocalAudio() { return true; }

  async mount(container) {
    this.image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`아바타 이미지를 불러올 수 없습니다: ${this.imageSrc}`));
      img.src = this.imageSrc;
    });

    // 원본에서 얼굴 영역만 잘라내 쓸 좌표
    this.src = {
      x: this.image.width * this.crop.x,
      y: this.image.height * this.crop.y,
      w: this.image.width * this.crop.w,
      h: this.image.height * this.crop.h,
    };

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'avatar-canvas';

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(360, Math.round((rect.width || 360) * dpr));
    this.canvas.height = Math.round((this.canvas.width * this.src.h) / this.src.w);

    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._loop();
  }

  setState(state) { this.state = state; }

  /** 사진 아바타는 오디오를 직접 쓰지 않습니다 (AnalyserNode로 음량만 읽음) */
  pushAudio() { /* no-op */ }

  interrupt() { this.smoothedLevel = 0; }

  /** 잘라낸 영역 전체를 캔버스에 그립니다 (기본 배경) */
  _drawBase(ctx, W, H) {
    const s = this.src;
    ctx.drawImage(this.image, s.x, s.y, s.w, s.h, 0, 0, W, H);
  }

  _loop() {
    this.rafId = requestAnimationFrame(() => this._loop());
    if (!this.ctx || !this.image) return;

    const now = performance.now();
    const t = (now - this.startedAt) / 1000;
    const { canvas, ctx } = this;
    const W = canvas.width;
    const H = canvas.height;

    // ── 음량 스무딩 ─────────────────────────────────────────────────
    // 올라갈 때는 빠르게, 내려갈 때는 천천히 → 입이 떨리지 않고 자연스럽습니다.
    const rawLevel = this.state === 'speaking' ? this.getLevel() : 0;
    const coeff = rawLevel > this.smoothedLevel ? 0.55 : 0.16;
    this.smoothedLevel += (rawLevel - this.smoothedLevel) * coeff;

    const rawWidth = this.state === 'speaking' ? this.getMouthWidth() : 0.5;
    this.smoothedWidth += (rawWidth - this.smoothedWidth) * 0.18;

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // ── 살아있는 느낌: 미세한 고개 움직임 + 호흡 ───────────────────
    // 서로 안 맞는 주기의 사인파를 겹치면 기계적인 반복이 느껴지지 않습니다.
    const liveliness = this.state === 'speaking' ? 1.5 : this.state === 'listening' ? 1.1 : 1;
    const swayX = (Math.sin(t * 0.47) * 2.6 + Math.sin(t * 0.83) * 1.3) * liveliness;
    const swayY = (Math.cos(t * 0.39) * 1.9 + Math.sin(t * 1.13) * 0.8) * liveliness;
    const tilt = Math.sin(t * 0.31) * 0.0035 * liveliness;
    const breathe = 1 + Math.sin(t * 1.55) * 0.003;

    ctx.translate(W / 2 + swayX, H / 2 + swayY);
    ctx.rotate(tilt);
    ctx.scale(breathe, breathe);
    ctx.translate(-W / 2, -H / 2);

    this._drawBase(ctx, W, H);
    this._drawJaw(ctx, W, H);
    this._drawBlink(ctx, W, H, now);

    ctx.restore();
  }

  /**
   * 턱 열기 = 입 주변을 세로로 늘리기.
   *
   * 어두운 타원을 덧그리는 방식은 이 사진처럼 이미 웃으며 치아가 보이는 경우
   * 어색해집니다. 그래서 **실제 입 픽셀을 세로로 늘려** 턱이 내려간 것처럼 만듭니다.
   * 어떤 사진이든(웃는 입/닫힌 입) 자연스럽게 동작합니다.
   *
   * 이음선이 보이지 않게 타원으로 클리핑합니다 —
   * 경계가 매끈한 피부 위에 놓이므로 합성 티가 나지 않습니다.
   */
  _drawJaw(ctx, W, H) {
    const level = this.smoothedLevel;
    if (level < 0.03) return;

    const f = this.faceMap;
    const mouthCX = W * f.mouthX;
    const mouthCY = H * f.mouthY;
    const mouthW = W * f.mouthW;
    const chinY = H * (f.chinY ?? 0.625);

    // 늘릴 영역: 입 바로 위부터 턱 끝까지.
    // 이보다 넓게 잡으면 코와 눈까지 함께 늘어나서 얼굴이 일그러집니다.
    const regionTop = mouthCY - mouthW * 0.25;
    const regionBottom = Math.min(H, chinY);
    const regionH = regionBottom - regionTop;
    if (regionH <= 4) return;

    // 벌어지는 양 (입 너비에 비례 → 사진 해상도가 달라도 비율이 유지됩니다)
    const openAmount = level * mouthW * 0.22;
    // 넓은 모음(이/에)은 가로로 퍼지고, 둥근 모음(오/우)은 좁아집니다
    const horizontalSquash = 1 - (0.5 - this.smoothedWidth) * 0.10;

    ctx.save();

    // 1) 이음선을 숨기는 타원 클립.
    //    경계가 매끈한 볼·턱 피부 위에 놓이도록 크기를 맞췄습니다.
    const clipCY = (regionTop + regionBottom) / 2;
    ctx.beginPath();
    ctx.ellipse(
      mouthCX,
      clipCY,
      mouthW * 1.02,
      (regionH / 2) * 1.06,
      0, 0, Math.PI * 2
    );
    ctx.clip();

    // 2) 클립 안에서만 세로로 늘려 다시 그리기 → 턱이 내려간 효과
    const scaleY = 1 + openAmount / regionH;
    ctx.translate(mouthCX, regionTop);
    ctx.scale(horizontalSquash, scaleY);
    ctx.translate(-mouthCX, -regionTop);
    this._drawBase(ctx, W, H);

    ctx.restore();

    // 3) 벌어진 입 안쪽에 아주 옅은 그림자 — 깊이감만 살짝 더합니다
    if (level > 0.12) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        mouthCX, mouthCY + openAmount * 0.5,
        mouthW * 0.42 * (0.85 + this.smoothedWidth * 0.3),
        openAmount * 0.62,
        0, 0, Math.PI * 2
      );
      const shade = ctx.createRadialGradient(
        mouthCX, mouthCY + openAmount * 0.6, 1,
        mouthCX, mouthCY + openAmount * 0.5, Math.max(4, openAmount * 1.5)
      );
      shade.addColorStop(0, `rgba(48, 16, 22, ${Math.min(0.42, level * 0.5)})`);
      shade.addColorStop(1, 'rgba(48, 16, 22, 0)');
      ctx.fillStyle = shade;
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * 눈 깜빡임.
   * 눈 바로 위(눈꺼풀·이마) 픽셀을 눈 위로 끌어내려 감깁니다.
   * 사진에서 직접 색을 따오므로 어떤 사진이든 피부색이 정확히 맞습니다.
   */
  _drawBlink(ctx, W, H, now) {
    if (!this.blinkStartedAt && now >= this.nextBlinkAt) {
      this.blinkStartedAt = now;
    }
    if (!this.blinkStartedAt) return;

    const BLINK_MS = 140;
    const elapsed = now - this.blinkStartedAt;

    if (elapsed > BLINK_MS) {
      this.blinkStartedAt = 0;
      // 말할 때 조금 더 자주 깜빡입니다
      const base = this.state === 'speaking' ? 1500 : 2600;
      this.nextBlinkAt = now + base + Math.random() * 2600;
      return;
    }

    // 0 → 1 → 0 (감았다 뜨기)
    const half = BLINK_MS / 2;
    const progress = elapsed < half ? elapsed / half : (BLINK_MS - elapsed) / half;
    if (progress <= 0.02) return;

    const f = this.faceMap;
    const s = this.src;
    // 캔버스 좌표 → 원본 좌표 변환 비율
    const kx = s.w / W;
    const ky = s.h / H;

    const eyeH = H * 0.030;
    const eyeW = W * f.eyeW;

    // 고개가 기울어져 있어 좌우 눈 높이가 다릅니다.
    const eyes = [
      { cx: W * f.eyeLeftX,  cy: H * (f.eyeLeftY  ?? f.eyeY ?? 0.36) },
      { cx: W * f.eyeRightX, cy: H * (f.eyeRightY ?? f.eyeY ?? 0.36) },
    ];

    for (const eye of eyes) {
      const x = eye.cx - eyeW / 2;
      const eyeTop = eye.cy - eyeH * 0.45;

      // 눈 바로 위(눈꺼풀) 띠를 원본에서 떠옵니다 →
      // 피부색이 사진에서 직접 나오므로 어떤 사진이든 자연스럽게 감깁니다.
      const srcX = s.x + x * kx;
      const srcW = eyeW * kx;
      const srcH = eyeH * 0.85 * ky;
      const srcY = Math.max(s.y, s.y + eyeTop * ky - srcH);

      ctx.drawImage(
        this.image,
        srcX, srcY, srcW, srcH,
        x, eyeTop, eyeW, eyeH * progress * 1.3
      );
    }
  }

  unmount() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Simli 실사 영상 아바타 (유료 · 선택)
   ═══════════════════════════════════════════════════════════════════════════ */

const SIMLI_SOURCES = [
  'https://esm.sh/simli-client@3.0.2',
  'https://cdn.jsdelivr.net/npm/simli-client@3.0.2/+esm',
];

let simliSdkPromise = null;

/** Simli SDK는 무겁고(livekit 포함) 영상 모드에서만 필요하므로 지연 로딩합니다. */
async function loadSimliSdk() {
  if (simliSdkPromise) return simliSdkPromise;
  simliSdkPromise = (async () => {
    let lastError;
    for (const url of SIMLI_SOURCES) {
      try {
        const mod = await import(/* @vite-ignore */ url);
        if (mod?.SimliClient) return mod;
        lastError = new Error('SimliClient export 없음');
      } catch (err) {
        console.warn('[avatar] Simli SDK 로드 실패:', url, err?.message);
        lastError = err;
      }
    }
    throw new Error(`Simli SDK 로드 실패: ${lastError?.message || 'unknown'}`);
  })();
  return simliSdkPromise;
}

export class SimliAvatar {
  /**
   * @param {object} opts
   * @param {(ms: number) => void} [opts.onStreamedMs] 영상 생성 시간 누적 (요금)
   * @param {(reason: string) => void} [opts.onFailure] 실패 시 폴백 트리거
   */
  constructor(opts = {}) {
    this.onStreamedMs = opts.onStreamedMs || (() => {});
    this.onFailure = opts.onFailure || (() => {});

    this.client = null;
    this.videoEl = null;
    this.audioEl = null;
    this.connected = false;
    this.state = 'idle';
    this._speakingSince = 0;
  }

  /** Simli가 자기 오디오 트랙으로 소리를 냅니다 → 로컬 재생 불필요 */
  get usesLocalAudio() { return false; }

  async mount(container) {
    // ── 1. 서버에서 세션 토큰 받기 (API 키는 서버에만 있음) ──────────
    const res = await fetch('/api/simli-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const payload = await res.json().catch(() => ({}));

    if (!payload?.enabled) {
      throw new Error(payload?.reason || 'Simli가 설정되지 않았습니다.');
    }

    // ── 2. 비디오/오디오 엘리먼트 ────────────────────────────────
    this.videoEl = document.createElement('video');
    this.videoEl.className = 'avatar-video';
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
    // 소리는 audioEl이 담당합니다 (비디오 트랙 음소거)
    this.videoEl.muted = true;

    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;

    container.appendChild(this.videoEl);
    container.appendChild(this.audioEl);

    // ── 3. 연결 ─────────────────────────────────────────────────
    const { SimliClient } = await loadSimliSdk();

    // transport 기본값이 livekit이며, livekit은 iceServers가 필요 없습니다.
    this.client = new SimliClient(
      payload.sessionToken,
      this.videoEl,
      this.audioEl,
      null
    );

    this.client.on?.('error', (detail) => {
      console.error('[avatar] Simli 오류', detail);
      this.connected = false;
      this.onFailure(String(detail));
    });
    this.client.on?.('startup_error', (msg) => {
      console.error('[avatar] Simli 시작 실패', msg);
      this.onFailure(String(msg));
    });
    this.client.on?.('stop', () => { this.connected = false; });

    await this.client.start();
    this.connected = true;
  }

  setState(state) {
    this.state = state;
    // 영상 생성 시간(=요금) 누적
    if (state === 'speaking' && !this._speakingSince) {
      this._speakingSince = performance.now();
    } else if (state !== 'speaking' && this._speakingSince) {
      this.onStreamedMs(performance.now() - this._speakingSince);
      this._speakingSince = 0;
    }
  }

  /**
   * Gemini 음성(24kHz)을 Simli가 원하는 16kHz로 바꿔 흘려보냅니다.
   * @param {Int16Array} pcm16_24k
   */
  pushAudio(pcm16_24k) {
    if (!this.connected || !this.client) return;
    try {
      const pcm16k = resamplePcm16(pcm16_24k, AUDIO.OUTPUT_SAMPLE_RATE, AUDIO.AVATAR_SAMPLE_RATE);
      this.client.sendAudioData(int16ToBytes(pcm16k));
    } catch (err) {
      console.warn('[avatar] Simli 오디오 전송 실패', err);
    }
  }

  /** 말 끊김 → 버퍼를 비워 즉시 입을 멈춥니다 */
  interrupt() {
    try { this.client?.ClearBuffer?.(); } catch {}
  }

  unmount() {
    this.setState('idle');
    try { this.client?.stop?.(); } catch {}
    try { this.client?.close?.(); } catch {}
    this.client = null;
    this.connected = false;
    this.videoEl?.remove();
    this.audioEl?.remove();
    this.videoEl = null;
    this.audioEl = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. 매니저 — 모드 선택과 자동 폴백
   ═══════════════════════════════════════════════════════════════════════════ */

export class AvatarManager {
  /**
   * @param {object} opts
   * @param {HTMLElement} opts.container
   * @param {string} opts.imageSrc
   * @param {() => number} opts.getLevel
   * @param {() => number} opts.getMouthWidth
   * @param {(ms: number) => void} [opts.onAvatarMs]
   * @param {(mode: string, note?: string) => void} [opts.onModeChange]
   * @param {object} [opts.faceMap]
   */
  constructor(opts) {
    this.opts = opts;
    this.impl = null;
    this.mode = null;
    /**
     * mount 세대 번호.
     * Simli가 start() 도중에 실패하면 onFailure가 mount를 **재진입**합니다.
     * 그러면 안쪽 mount가 붙인 캔버스를 바깥 mount가 지워버리거나(rAF 루프 누수),
     * 반대로 바깥이 mode=VIDEO로 덮어써서 소리가 영구 음소거되는 사고가 납니다.
     * 세대 번호로 "낡은 mount는 아무것도 건드리지 않는다"를 보장합니다.
     */
    this._gen = 0;
  }

  /**
   * 아바타를 붙입니다.
   * 영상 모드가 실패하면 조용히 사진 모드로 폴백합니다 —
   * 아바타 문제로 영어 대화 자체가 막히면 안 되기 때문입니다.
   */
  async mount(mode) {
    // ⚠️ 순서가 중요합니다.
    //    unmount()가 세대를 올리므로, 먼저 세대를 claim하면 바로 뒤 unmount에서
    //    자기 세대가 무효화되어 mount가 통째로 no-op이 됩니다(아바타가 안 뜸).
    //    반드시 unmount 이후에 세대를 가져와야 합니다.
    await this.unmount();

    const gen = ++this._gen;
    const isCurrent = () => gen === this._gen;

    if (mode === AVATAR_MODE.VIDEO) {
      let video = null;
      try {
        video = new SimliAvatar({
          onStreamedMs: this.opts.onAvatarMs,
          onFailure: (reason) => {
            // 이미 낡은 세대라면 손대지 않습니다
            if (!isCurrent()) return;
            this.opts.onModeChange?.(
              AVATAR_MODE.PHOTO,
              `영상 아바타 오류로 사진 모드로 전환했습니다. (${reason})`
            );
            this.mount(AVATAR_MODE.PHOTO).catch(console.error);
          },
        });
        await video.mount(this.opts.container);

        // mount 하는 동안 더 새로운 mount가 시작됐다면 이건 버립니다
        if (!isCurrent()) {
          video.unmount();
          return;
        }

        this.impl = video;
        this.mode = AVATAR_MODE.VIDEO;
        this.opts.onModeChange?.(AVATAR_MODE.VIDEO);
        return;
      } catch (err) {
        // ⚠️ 정리를 먼저 합니다.
        //    onFailure가 이미 재진입해서 세대가 바뀐 경우에도 이 Simli 세션은
        //    반드시 닫아야 합니다. 안 닫으면 <video>/<audio>가 화면에 남고
        //    Simli 크레딧이 계속 소모됩니다 (this.impl에 안 들어갔으므로
        //    다른 곳에서는 정리할 방법이 없습니다).
        try { video?.unmount(); } catch {}

        if (!isCurrent()) return;
        console.warn('[avatar] 영상 아바타 실패 → 사진 모드로 폴백', err);
        this.impl = null;
        this.opts.onModeChange?.(
          AVATAR_MODE.PHOTO,
          `영상 아바타를 쓸 수 없어 사진 모드로 시작합니다. (${err?.message || err})`
        );
        if (!isCurrent()) return;
      }
    }

    /* ── 3D 아바타 ────────────────────────────────────────────────────
       기본 모드입니다. three.js 를 CDN에서 받고 GLB 모델을 내려받아야
       하므로, 망이 막혀 있으면 실패할 수 있습니다. 그때는 조용히
       사진 모드로 내려갑니다 — 아바타 때문에 대화가 막히면 안 됩니다.
       (three 는 되는데 GLB만 실패하는 경우는 avatar3d 안에서 자체
        폴백 얼굴로 처리하므로 여기까지 오지 않습니다.)              */
    if (mode === AVATAR_MODE.THREE) {
      let three = null;
      try {
        const { ThreeAvatar } = await import('./avatar3d.js');
        if (!isCurrent()) return;

        three = new ThreeAvatar({
          getLevel: this.opts.getLevel,
          getMouthWidth: this.opts.getMouthWidth,
          modelUrl: this.opts.avatarModelUrl || undefined,
          onNote: (note) => {
            if (isCurrent()) this.opts.onModeChange?.(AVATAR_MODE.THREE, note);
          },
        });
        await three.mount(this.opts.container);

        if (!isCurrent()) { three.unmount(); return; }

        this.impl = three;
        this.mode = AVATAR_MODE.THREE;
        this.opts.onModeChange?.(AVATAR_MODE.THREE);
        return;
      } catch (err) {
        try { three?.unmount(); } catch {}
        if (!isCurrent()) return;
        console.warn('[avatar] 3D 아바타 실패 → 사진 모드로 폴백', err);
        this.impl = null;
        this.opts.onModeChange?.(
          AVATAR_MODE.PHOTO,
          `3D 아바타를 불러오지 못해 사진 모드로 표시합니다. (${err?.message || err})`
        );
        if (!isCurrent()) return;
      }
    }

    const photo = new PhotoAvatar({
      imageSrc: this.opts.imageSrc,
      getLevel: this.opts.getLevel,
      getMouthWidth: this.opts.getMouthWidth,
      faceMap: this.opts.faceMap,
    });
    await photo.mount(this.opts.container);

    if (!isCurrent()) {
      // 낡은 세대 → 캔버스와 rAF 루프를 반드시 정리 (안 하면 영구 누수)
      photo.unmount();
      return;
    }

    this.impl = photo;
    this.mode = AVATAR_MODE.PHOTO;
    this.opts.onModeChange?.(AVATAR_MODE.PHOTO);
  }

  get usesLocalAudio() { return this.impl?.usesLocalAudio ?? true; }

  pushAudio(pcm16) { this.impl?.pushAudio(pcm16); }
  interrupt() { this.impl?.interrupt(); }
  setState(state) { this.impl?.setState(state); }

  async unmount() {
    // 세대를 올려서 진행 중이던 mount와 늦게 도착하는 onFailure를 무효화합니다.
    // 이게 없으면 통화 종료 뒤 Simli 오류가 도착했을 때 아무도 소유하지 않는
    // 캔버스와 rAF 루프가 새로 생겨서 영원히 돕니다.
    this._gen++;
    this.impl?.unmount();
    this.impl = null;
    this.mode = null;
  }
}
