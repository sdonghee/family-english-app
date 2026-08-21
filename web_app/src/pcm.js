/**
 * web_app/src/pcm.js
 * ----------------------------------------------------------------------------
 * PCM 오디오 변환 유틸리티.
 *
 * 이 앱에는 서로 다른 3개의 샘플레이트가 돌아다닙니다:
 *   마이크(브라우저 기본, 보통 48000) → 16000  : Gemini 입력
 *   Gemini 출력 24000                          : 스피커 재생
 *   24000 → 16000                              : Simli 아바타 입력
 * 여기서 다 처리합니다.
 * ----------------------------------------------------------------------------
 */

/** Float32(-1~1) → PCM16 (little-endian Int16) */
export function float32ToPcm16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    // 클리핑 후 16비트 정수로. 음수는 32768, 양수는 32767 스케일.
    const s = input[i] < -1 ? -1 : input[i] > 1 ? 1 : input[i];
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/** PCM16 → Float32(-1~1) */
export function pcm16ToFloat32(input) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    out[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff);
  }
  return out;
}

/** Uint8Array → base64 (큰 배열에서 스택 오버플로 안 나게 조각내서 처리) */
export function bytesToBase64(bytes) {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** base64 → Uint8Array */
export function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Int16Array → Uint8Array (같은 메모리를 바이트로 재해석) */
export function int16ToBytes(int16) {
  return new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
}

/** Uint8Array → Int16Array (홀수 길이는 잘라냄) */
export function bytesToInt16(bytes) {
  const usable = bytes.byteLength - (bytes.byteLength % 2);
  // byteOffset이 2의 배수가 아니면 Int16Array를 못 만들므로 복사합니다.
  if ((bytes.byteOffset % 2) !== 0) {
    const copy = new Uint8Array(bytes.subarray(0, usable));
    return new Int16Array(copy.buffer);
  }
  return new Int16Array(bytes.buffer, bytes.byteOffset, usable / 2);
}

/**
 * PCM16 리샘플링.
 *
 * 24000 → 16000 (비율 1.5)처럼 다운샘플할 때는 그냥 뽑아내면 에일리어싱이
 * 생기므로, 3탭 이동평균으로 살짝 저역통과를 먼저 걸어줍니다.
 * 립싱크 입력용으로는 이 정도가 품질/비용 균형이 가장 좋습니다.
 */
export function resamplePcm16(input, fromRate, toRate) {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Int16Array(outLength);

  const needsLowpass = ratio > 1.05;

  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;

    let a = input[idx] ?? 0;
    let b = input[idx + 1] ?? a;

    if (needsLowpass) {
      // 이웃 샘플을 섞어 고주파를 눌러줍니다.
      const prev = input[idx - 1] ?? a;
      const next = input[idx + 2] ?? b;
      a = (prev + a + b) / 3;
      b = (a + b + next) / 3;
    }

    out[i] = Math.max(-32768, Math.min(32767, Math.round(a + (b - a) * frac)));
  }

  return out;
}

/** Float32 버퍼의 RMS 에너지 (0~1). 침묵 판정에 씁니다. */
export function rms(buffer) {
  if (!buffer.length) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/** Int16Array 여러 개를 하나로 이어붙입니다. */
export function concatInt16(chunks) {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Int16Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
