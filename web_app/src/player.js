/**
 * web_app/src/player.js
 * ----------------------------------------------------------------------------
 * Gemini가 보내주는 24kHz PCM 조각들을 끊김 없이 이어서 재생합니다.
 *
 * 신경 쓸 점 두 가지:
 *  1) 조각을 그냥 순서대로 play()하면 사이사이 딱딱 끊깁니다.
 *     → 재생 커서(playCursor)를 두고 정확히 이어붙여 예약합니다.
 *  2) 사용자가 말을 끊고 들어오면(interrupted) 예약된 오디오를 즉시 다 버려야 합니다.
 *     안 그러면 선생님이 이미 취소된 문장을 계속 떠듭니다.
 *
 * 아바타 립싱크용으로 AnalyserNode도 함께 제공합니다.
 * ----------------------------------------------------------------------------
 */

import { AUDIO } from './config.js';
import { pcm16ToFloat32 } from './pcm.js';

export class AudioPlayer {
  /**
   * @param {object} [opts]
   * @param {(speaking: boolean) => void} [opts.onSpeakingChange]
   */
  constructor(opts = {}) {
    this.onSpeakingChange = opts.onSpeakingChange || (() => {});

    this.context = null;
    this.gainNode = null;
    this.analyser = null;

    /** 현재 예약되어 있는 소스들 (중단 시 전부 죽여야 함) */
    this.activeSources = new Set();
    /** 다음 조각을 예약할 시각 (AudioContext 시간축) */
    this.playCursor = 0;

    this.speaking = false;
    this._speakingTimer = null;

    /** 아바타 영상 모드에서는 소리를 Simli가 냅니다 → 여기선 음소거 */
    this.localOutputEnabled = true;

    this._analyserBuffer = null;
  }

  async init() {
    if (this.context) return;

    try {
      this.context = new AudioContext({ sampleRate: AUDIO.OUTPUT_SAMPLE_RATE });
    } catch {
      this.context = new AudioContext();
    }
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.gainNode = this.context.createGain();
    this.gainNode.gain.value = this.localOutputEnabled ? 1 : 0;

    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.35;
    this._analyserBuffer = new Float32Array(this.analyser.fftSize);

    // 게인 → 아날라이저 → 스피커
    this.gainNode.connect(this.analyser);
    this.analyser.connect(this.context.destination);

    this.playCursor = this.context.currentTime;
  }

  /**
   * 백그라운드에서 돌아왔을 때 AudioContext를 되살립니다.
   * iOS는 백그라운드 전환 시 suspended로 바꾸고 자동 재개하지 않습니다.
   */
  async resume() {
    if (this.context && this.context.state === 'suspended') {
      try {
        await this.context.resume();
        // ⚠️ 커서만 되돌리면 안 됩니다.
        //    정지되기 전에 예약해둔 조각들이 아직 큐에 남아 있어서,
        //    새 조각을 그 위에 겹쳐 예약하면 소리가 겹쳐 들립니다.
        //    끊긴 문장을 이어 붙일 수도 없으니 통째로 버리는 것이 맞습니다.
        this.flush();
      } catch (err) {
        console.warn('[player] AudioContext 재개 실패', err);
      }
    }
  }

  /** true면 로컬 스피커로 재생, false면 음소거(타이밍 추적은 계속) */
  setLocalOutputEnabled(enabled) {
    this.localOutputEnabled = enabled;
    if (this.gainNode) {
      this.gainNode.gain.value = enabled ? 1 : 0;
    }
  }

  /**
   * PCM16 조각을 재생 큐에 넣습니다.
   * @param {Int16Array} pcm16
   */
  push(pcm16) {
    if (!this.context || !pcm16.length) return;

    const float32 = pcm16ToFloat32(pcm16);
    const buffer = this.context.createBuffer(1, float32.length, AUDIO.OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    // 커서가 과거로 밀렸으면(네트워크 지연으로 큐가 비었으면) 현재 시각으로 리셋.
    // 살짝 여유(20ms)를 줘서 첫 조각이 잘리는 걸 막습니다.
    const now = this.context.currentTime;
    if (this.playCursor < now) {
      this.playCursor = now + 0.02;
    }

    source.start(this.playCursor);
    this.playCursor += buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      this.activeSources.delete(source);
      this._scheduleSpeakingCheck();
    };

    this._setSpeaking(true);
  }

  /**
   * 말 끊김(interruption) 처리. 예약된 모든 오디오를 즉시 폐기합니다.
   * 사용자가 끼어들었을 때 반드시 호출해야 합니다.
   */
  flush() {
    for (const source of this.activeSources) {
      try { source.onended = null; source.stop(); } catch {}
    }
    this.activeSources.clear();
    if (this.context) {
      this.playCursor = this.context.currentTime;
    }
    this._setSpeaking(false);
  }

  /** 지금 재생 중인 오디오가 언제 끝나는지 (초). 0이면 재생 중 아님. */
  remainingSeconds() {
    if (!this.context) return 0;
    return Math.max(0, this.playCursor - this.context.currentTime);
  }

  /**
   * 립싱크용 현재 음량 (0~1).
   * 사진 아바타의 입 크기를 이 값으로 움직입니다.
   */
  getLevel() {
    if (!this.analyser || !this.speaking) return 0;

    this.analyser.getFloatTimeDomainData(this._analyserBuffer);
    let sum = 0;
    for (let i = 0; i < this._analyserBuffer.length; i++) {
      sum += this._analyserBuffer[i] * this._analyserBuffer[i];
    }
    const level = Math.sqrt(sum / this._analyserBuffer.length);

    // 말소리 RMS는 보통 0.02~0.25 → 0~1로 펴줍니다.
    return Math.min(1, level * 6);
  }

  /**
   * 립싱크 품질을 높이기 위한 대략적인 모음 추정.
   * 스펙트럼 무게중심으로 입을 옆으로 벌릴지(이/에) 둥글게 할지(오/우) 가릅니다.
   * @returns {number} 0(둥근 입) ~ 1(넓은 입)
   */
  getMouthWidth() {
    if (!this.analyser || !this.speaking) return 0.5;

    const bins = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(bins);

    let weighted = 0;
    let total = 0;
    for (let i = 0; i < bins.length; i++) {
      weighted += i * bins[i];
      total += bins[i];
    }
    if (!total) return 0.5;

    const centroid = weighted / total / bins.length; // 0~1
    // 사람 말소리의 무게중심은 대략 0.05~0.35 구간에 몰려 있습니다.
    return Math.max(0, Math.min(1, (centroid - 0.05) / 0.3));
  }

  _setSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.onSpeakingChange(speaking);
  }

  /** 마지막 조각이 끝났는지 확인해서 speaking 상태를 내립니다. */
  _scheduleSpeakingCheck() {
    clearTimeout(this._speakingTimer);
    // ⚠️ 이 값이 짧으면 네트워크가 잠깐 끊길 때마다 "말이 끝났다"고 판단합니다.
    //    반이중 모드에서는 그때마다 마이크가 열렸다 닫히면서
    //    서버에 "대답해" 신호가 나가고, 선생님이 말을 자꾸 끊고 들어옵니다.
    this._speakingTimer = setTimeout(() => {
      if (this.activeSources.size === 0 && this.remainingSeconds() <= 0.05) {
        this._setSpeaking(false);
      }
    }, 400);
  }

  async close() {
    this.flush();
    clearTimeout(this._speakingTimer);
    if (this.context && this.context.state !== 'closed') {
      try { await this.context.close(); } catch {}
    }
    this.context = null;
    this.gainNode = null;
    this.analyser = null;
  }
}
