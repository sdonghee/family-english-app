/**
 * web_app/src/avatarFace.js
 * ----------------------------------------------------------------------------
 * **깎아서 만든 얼굴.**
 *
 * 왜 이 파일이 새로 생겼나 — 2026-08-19 목사님 말씀:
 *      "아바타도 좀 외모에 신경써주면 좋겠어."
 *
 * 그동안 화면에 나오던 얼굴은 `구 + 원뿔(코) + 상자(눈썹) + 납작한 구(입)`
 * 였습니다. 도형을 **쌓아** 만든 얼굴은 아무리 손봐도 눈사람을 벗어나지
 * 못합니다. 사람 얼굴은 부품의 합이 아니라 **하나의 덩어리를 깎은 결과**라
 * 그렇습니다.
 *
 * 그래서 접근을 바꿨습니다:
 *   1. 촘촘한 구 하나에서 시작합니다 (160×120 = 약 1만 9천 점).
 *   2. 두개골 비율로 **늘이고 좁힙니다** — 턱은 좁게, 뒤통수는 뒤로.
 *   3. 그 위에 **덩어리를 눌러 붙입니다** — 눈두덩·광대·콧대·콧방울·
 *      인중·윗입술·아랫입술·턱끝·턱각. (조소에서 흙을 붙이는 것과 같습니다)
 *   4. 입 자리의 삼각형을 **도려냅니다.** 그래야 진짜 구멍이 되고,
 *      턱이 내려갈 때 입이 실제로 벌어집니다. 예전엔 붉은 원반이
 *      커졌다 작아졌을 뿐이라 "말하는 것"으로 안 보였습니다.
 *   5. 턱 열림·입 벌림·오므림·미소를 **모프타겟**으로 구워 둡니다.
 *      GPU가 섞으므로 매 프레임 CPU 비용이 0입니다.
 *   6. 정점마다 색을 칠합니다 — 볼의 홍조, 입술, 눈두덩 그늘.
 *      텍스처 한 장 없이 화장한 효과가 납니다.
 *
 * 남의 서버(readyplayer.me)가 죽어도, 인터넷이 느려도, 이 얼굴은
 * **항상** 나옵니다. 계산만으로 만들기 때문입니다.
 *
 * three.js 모듈을 직접 import 하지 않습니다. avatar3d.js 가 어렵게 구한
 * THREE 인스턴스를 넘겨받아 씁니다 — 인스턴스가 두 개면 instanceof 가
 * 깨지기 때문입니다.
 * ----------------------------------------------------------------------------
 */

/* ── 조립에 필요한 상수 (avatar3d.js 가 애니메이션에 그대로 씁니다) ────── */

/** 턱 회전 중심. 실제 사람 턱관절은 귀 바로 앞, 광대 아래에 있습니다. */
export const JAW_PIVOT = { x: 0, y: -0.06, z: -0.28 };
/** 완전히 벌렸을 때 턱 회전각(라디안). 0.4 를 넘으면 하품처럼 보입니다. */
export const JAW_ANGLE = 0.34;

/** 모프타겟 순서 — avatar3d.js 가 인덱스로 접근합니다. */
export const MORPH = { JAW: 0, WIDE: 1, ROUND: 2, SMILE: 3 };

/** 입 벌어지는 선의 높이. 아래 계산이 전부 이 값을 기준으로 돕니다. */
const MOUTH_Y = -0.455;

/* 입은 세 겹의 타원으로 정의합니다.
     CUT   — 피부에서 **도려낼** 자리 (대충 잘라도 됩니다. 입술이 덮습니다)
     LIP   — 입술 판의 **바깥** 테두리 (여기서 피부색과 만납니다)
     MOUTH — 다물었을 때의 **입 구멍** (얇은 선으로 보입니다)
   반드시 LIP > CUT 이어야 톱니 가장자리가 가려집니다. */
const CUT_A = 0.186, CUT_B = 0.074;
const LIP_A = 0.250, LIP_B = 0.113;
const MOUTH_A = 0.156, MOUTH_B = 0.0060;

/* ── 작은 수학 ─────────────────────────────────────────────────────────── */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0 || 1e-6));
  return t * t * (3 - 2 * t);
}

/** 가운데 1, 반지름 밖 0 으로 부드럽게 떨어지는 가중치 */
function falloff(d2, r2) {
  if (d2 >= r2) return 0;
  const w = 1 - d2 / r2;
  return w * w;
}

/**
 * 점 하나에 **흙덩이 하나**를 붙입니다(또는 눌러 파냅니다).
 *
 * sx/sy/sz 로 영향 범위를 찌그러뜨릴 수 있습니다. 입술처럼 옆으로 길고
 * 위아래로 얇은 부위는 이게 없으면 표현이 안 됩니다.
 */
function blob(v, cx, cy, cz, r, dx, dy, dz, amount, sx = 1, sy = 1, sz = 1) {
  const ax = (v.x - cx) / sx;
  const ay = (v.y - cy) / sy;
  const az = (v.z - cz) / sz;
  const w = falloff(ax * ax + ay * ay + az * az, r * r);
  if (w <= 0) return 0;
  v.x += dx * amount * w;
  v.y += dy * amount * w;
  v.z += dz * amount * w;
  return w;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1단계 — 두개골 비율
   구를 그대로 두면 '공'입니다. 사람 머리는 위가 넓고 아래가 좁습니다.
   ═══════════════════════════════════════════════════════════════════════════ */

function shapeSkull(v) {
  // 기본 타원체 (사람 머리는 앞뒤보다 좌우가 좁습니다)
  // ⚠️ x 를 0.845 로 뒀더니 정면에서 얼굴이 넓적했습니다. 사람 머리는
  //    정면 폭 : 높이 ≈ 0.72 입니다.
  v.x *= 0.775;
  v.y *= 1.028;
  v.z *= 0.905;

  const y = v.y;

  /* 턱 쪽 좁히기. 이게 이 함수에서 가장 중요한 한 줄입니다 —
     아래가 안 좁아지면 무슨 짓을 해도 얼굴이 눈사람으로 보입니다. */
  /* 2026-08-20 — 목사님: "목소리는 여자인데 얼굴은 남자야."
     여성 얼굴과 남성 얼굴을 가르는 것은 눈·코·입이 아니라 **턱선**입니다.
     아래로 갈수록 더 많이 좁혀서 계란형(V형)에 가깝게 만듭니다. */
  const t = smoothstep(-0.02, -1.02, y);
  v.x *= mix(1, 0.455, t * t);
  if (v.z >= 0) v.z *= mix(1, 0.845, t);      // 앞턱은 조금만
  else v.z *= mix(1, 0.36, t);                 // 목 쪽은 많이

  /* 이마.
     남자 이마는 평평하고 눈썹뼈가 튀어나옵니다. 여자 이마는 **둥글고
     매끈**합니다. 그래서 평평하게 누르는 정도를 크게 줄였습니다. */
  const f = smoothstep(0.28, 0.98, y);
  if (v.z > 0) v.z *= mix(1, 0.955, f);

  // 뒤통수는 조금 더 뒤로 — 옆에서 볼 때 두상이 삽니다
  if (v.z < -0.12) v.z *= mix(1, 1.085, smoothstep(-0.12, -0.75, v.z));

  // 정수리는 살짝 눌립니다
  v.y *= mix(1, 0.965, smoothstep(0.58, 1.05, y));

  /* ⚠️ 아래턱이 너무 길었습니다(첫 렌더에서 얼굴이 말처럼 길었습니다).
        사람 얼굴은 입-턱끝 거리가 눈-입 거리의 **절반 정도**입니다.
        입선(-0.455) 아래를 눌러서 그 비율을 맞춥니다. */
  if (v.y < -0.455) v.y = -0.455 + (v.y + 0.455) * 0.72;

  // 관자놀이 — 눈보다 조금 위, 옆에서 살짝 들어갑니다
  const temple = smoothstep(0.10, 0.42, y) * (1 - smoothstep(0.42, 0.85, y));
  v.x *= mix(1, 0.955, temple * clamp01((Math.abs(v.x) - 0.35) / 0.35));
}

/* ═══════════════════════════════════════════════════════════════════════════
   2단계 — 이목구비 (덩어리 붙이기)
   순서가 중요합니다. 큰 덩어리(광대·눈두덩) → 작은 덩어리(콧방울·인중).
   ═══════════════════════════════════════════════════════════════════════════ */

function sculptFeatures(v) {
  for (const sx of [-1, 1]) {
    /* 눈두덩(눈썹뼈) — 앞으로 나오면서 눈이 그 아래로 들어갑니다.
       이 하나가 얼굴에 그늘을 만들어 입체감의 절반을 담당합니다. */
    /* ⚠️ 눈두덩(눈썹뼈)을 0.072 로 세웠더니 인상이 확 남자가 됐습니다.
          여자 얼굴은 눈썹뼈가 거의 안 나옵니다. 그늘은 눈구멍 깊이로만
          만들고, 뼈는 아주 얕게 둡니다. */
    blob(v, sx * 0.290, 0.256, 0.640, 0.35, 0, 0.05, 1, 0.026, 1.25, 0.8, 1);

    /* 눈구멍 — 눈두덩 **바로 아래**를 파냅니다.
       ⚠️ 처음엔 0.085 만 팠더니 눈알이 얼굴 **속에** 묻혀 첫 렌더에서
          눈이 아예 보이지 않았습니다. 표면이 z≈0.76 까지 들어와야
          눈알(반지름 0.132)이 제대로 자리를 잡습니다. */
    /* ⚠️ 눈썹뼈를 낮추고도 눈구멍을 깊게(0.255) 뒀더니 눈이 퀭하게
          꺼져 보였습니다. 둘은 짝이라 같이 낮춰야 합니다. */
    blob(v, sx * 0.295, 0.076, 0.700, 0.330, 0, 0, -1, 0.190, 1.20, 0.92, 1);
    /* 눈 안쪽 구석(눈물언덕 쪽)은 더 깊습니다 */
    blob(v, sx * 0.160, 0.075, 0.720, 0.13, 0, 0, -1, 0.070);

    /* 광대 — 옆으로+앞으로. 광대가 없으면 얼굴이 계란처럼 밋밋합니다. */
    blob(v, sx * 0.455, -0.020, 0.520, 0.40, sx * 0.35, 0.15, 0.90, 0.048);

    /* 볼살.
        예전엔 여기를 **파냈습니다**(광대를 도드라지게 하려고). 그러면
        홀쭉하고 나이 들어 보입니다. 반대로 **붙여서** 통통하게 만듭니다.
        사랑스러워 보이는 얼굴의 절반은 이 볼살입니다. */
    blob(v, sx * 0.405, -0.240, 0.560, 0.34, sx * 0.35, 0.05, 0.9, 0.042);

    /* 눈 밑 애교살 — 아주 작게. 크면 부어 보입니다. */
    blob(v, sx * 0.292, -0.042, 0.690, 0.17, 0, 0, 1, 0.028);

    /* 콧방울 */
    blob(v, sx * 0.082, -0.198, 0.790, 0.082, sx * 0.75, -0.1, 0.40, 0.030);

    /* 턱각(하악각) — 옆에서 볼 때 얼굴선을 만듭니다. */
    /* 턱각(하악각). 각지면 곧바로 남자 얼굴이 됩니다. 거의 지웁니다. */
    blob(v, sx * 0.430, -0.560, 0.090, 0.30, sx, -0.15, 0.15, 0.006);

    /* 입꼬리 — 살짝 들어가야 입이 얼굴에 '붙어' 보입니다. */
    blob(v, sx * 0.175, -0.462, 0.720, 0.085, 0, 0, -1, 0.024);
  }

  /* 콧대 — 미간에서 코끝까지 길게. 세로로 긴 타원 영향범위.
     ⚠️ 코는 정면에서 **그림자로** 보입니다. 앞으로 충분히 안 나오면
        빛이 고르게 퍼져서 코가 아예 없는 것처럼 보입니다. */
  /* 코는 남녀 차이가 아주 큽니다. 콧대를 낮추고 코끝을 작고 살짝
     들리게 만들면 곧바로 여성스럽고 어려 보입니다. */
  blob(v, 0, 0.010, 0.740, 0.26, 0, 0, 1, 0.056, 0.32, 1.15, 1);
  /* 콧등 아래쪽이 조금 더 나옵니다 */
  blob(v, 0, -0.078, 0.790, 0.20, 0, 0, 1, 0.076, 0.36, 1.05, 1);
  /* 코끝 */
  blob(v, 0, -0.176, 0.836, 0.104, 0, 0.10, 1, 0.088);
  /* 코 밑(비주) — 살짝 파여야 코가 얼굴에서 떨어집니다 */
  blob(v, 0, -0.252, 0.800, 0.082, 0, 0, -1, 0.034, 1.3, 0.7, 1);

  /* 인중 — 코 밑에서 윗입술까지의 세로 홈 */
  blob(v, 0, -0.320, 0.830, 0.075, 0, 0, -1, 0.020, 0.5, 1.2, 1);

  /* 윗입술 / 아랫입술.
     옆으로 길고(sx 1.9) 위아래로 얇은(sy 0.55) 범위라야 입술 모양이 납니다. */
  blob(v, 0, -0.404, 0.795, 0.140, 0, 0, 1, 0.050, 1.85, 0.58, 1);
  blob(v, 0, -0.512, 0.790, 0.148, 0, 0, 1, 0.062, 1.70, 0.66, 1);

  /* 입술 사이 선 — 얕게 파야 두 입술이 갈라져 보입니다 */
  blob(v, 0, MOUTH_Y, 0.815, 0.105, 0, 0, -1, 0.028, 2.0, 0.35, 1);

  /* 아랫입술 아래 홈 */
  blob(v, 0, -0.605, 0.775, 0.095, 0, 0, -1, 0.022, 1.5, 0.6, 1);

  /* 턱끝 — 앞으로 그리고 살짝 아래로 */
  /* 턱끝. 넓고 각진 턱끝 → 남자. 좁고 둥근 턱끝 → 여자.
     좌우 영향범위(0.68)를 좁혀서 뾰족하고 부드러운 턱을 만듭니다. */
  blob(v, 0, -0.720, 0.660, 0.28, 0, -0.18, 1, 0.040, 0.68, 1, 1);

  /* 이마 중앙 아주 살짝 볼록 */
  blob(v, 0, 0.470, 0.760, 0.34, 0, 0, 1, 0.018);
}

/**
 * 조각이 끝난 뒤 이 점이 어디에 놓이는지 알려줍니다.
 * 눈알·눈꺼풀·눈썹을 **표면 위에** 정확히 얹으려면 표면이 어디인지
 * 알아야 합니다. 눈대중으로 넣으면 눈이 얼굴 속에 파묻힙니다
 * (첫 렌더에서 실제로 그렇게 됐습니다 — 눈이 아예 안 보였습니다).
 */
export function sculptedPoint(x, y, z) {
  const v = { x, y, z };
  shapeSkull(v);
  sculptFeatures(v);
  return v;
}

/**
 * 앞얼굴에서 (x, y) 위치의 **표면 좌표**를 찾습니다.
 *
 * 조각을 하고 나면 "y=0.29, x=0.29 자리의 피부는 z 가 얼마인가?"를
 * 눈으로 알 수 없습니다. 그런데 눈썹·눈알을 얹으려면 그 값이 꼭 필요합니다.
 * (두 번째 렌더에서 눈썹을 z=0.69 에 뒀는데 실제 표면은 0.853 이라
 *  눈썹이 살 **속에** 파묻혀 아예 안 보였습니다.)
 *
 * 구 위의 방향을 조금씩 고쳐가며 원하는 (x,y)에 도달하는 점을 찾습니다.
 */
export function surfaceAt(tx, ty) {
  let dx = tx, dy = ty;
  let p = sculptedPoint(0, 0, 1);
  for (let k = 0; k < 40; k++) {
    const L = Math.hypot(dx, dy, 1) || 1;
    p = sculptedPoint(dx / L, dy / L, 1 / L);
    const ex = tx - p.x, ey = ty - p.y;
    if (Math.abs(ex) < 2e-4 && Math.abs(ey) < 2e-4) break;
    dx += ex * 1.1;
    dy += ey * 1.1;
  }
  return p;
}

/* ═══════════════════════════════════════════════════════════════════════════
   3단계 — 턱 가중치
   "이 점은 턱을 열 때 얼마나 따라 내려가는가?"
   입 구멍 근처에서는 **딱 갈라져야** 입술이 떨어집니다.
   멀리 떨어진 볼·턱선에서는 **부드럽게** 이어져야 살이 찢어져 보이지 않습니다.
   ═══════════════════════════════════════════════════════════════════════════ */

function jawWeight(x, y, z) {
  // 뒤통수·목덜미는 턱과 무관합니다
  const front = smoothstep(-0.25, 0.25, z);
  if (front <= 0) return 0;

  // 넓게 보는 가중치 (볼·턱선)
  const soft = smoothstep(-0.30, -0.68, y);

  // 입 근처에서 쓰는 날카로운 가중치 (입술이 벌어지는 선)
  const sharp = smoothstep(MOUTH_Y + 0.030, MOUTH_Y - 0.030, y);

  // 입에서 얼마나 가까운가 (0 = 입 한가운데)
  const dx = x / 0.30;
  const dy = (y - MOUTH_Y) / 0.16;
  const near = clamp01(1 - Math.sqrt(dx * dx + dy * dy));

  return mix(soft, sharp, near * near) * front;
}

/** 점을 턱 회전축 둘레로 돌립니다 (x축 회전) */
function rotateJaw(x, y, z, angle) {
  const py = y - JAW_PIVOT.y;
  const pz = z - JAW_PIVOT.z;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x,
    y: JAW_PIVOT.y + (py * c - pz * s),
    z: JAW_PIVOT.z + (py * s + pz * c),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4단계 — 정점 색
   텍스처 없이 화장을 합니다. 이게 있고 없고가 "인형 vs 사람"을 가릅니다.
   ═══════════════════════════════════════════════════════════════════════════ */

const SKIN = [0.968, 0.775, 0.672];
const BLUSH = [0.972, 0.462, 0.432];
const LIP = [0.788, 0.392, 0.376];
const SHADE = [0.720, 0.508, 0.418];

function skinColorAt(x, y, z, out) {
  let r = SKIN[0], g = SKIN[1], b = SKIN[2];

  const put = (c, w) => {
    if (w <= 0) return;
    const k = clamp01(w);
    r = mix(r, c[0], k); g = mix(g, c[1], k); b = mix(b, c[2], k);
  };

  // 볼 홍조 — 광대 바깥쪽에 넓고 옅게
  for (const sx of [-1, 1]) {
    const dx = (x - sx * 0.430) / 0.30;
    const dy = (y + 0.185) / 0.25;
    const dz = (z - 0.520) / 0.42;
    put(BLUSH, falloff(dx * dx + dy * dy + dz * dz, 1) * 0.34);
  }

  // 입술 — 두 입술을 따로 칠해야 가운데 선이 살아납니다
  const lipShape = (cy, hw, hh) => {
    const lx = x / hw;
    const ly = (y - cy) / hh;
    const lz = (z - 0.78) / 0.32;
    return falloff(lx * lx + ly * ly + lz * lz, 1);
  };
  put(LIP, lipShape(MOUTH_Y - 0.045, 0.300, 0.115) * 0.45);

  // 눈두덩 그늘 — 눈이 쑥 들어가 보입니다
  for (const sx of [-1, 1]) {
    const dx = (x - sx * 0.295) / 0.26;
    const dy = (y - 0.095) / 0.16;
    const dz = (z - 0.64) / 0.30;
    put(SHADE, falloff(dx * dx + dy * dy + dz * dz, 1) * 0.10);
  }

  // 콧구멍 그늘
  for (const sx of [-1, 1]) {
    const dx = (x - sx * 0.062) / 0.070;
    const dy = (y + 0.243) / 0.050;
    const dz = (z - 0.79) / 0.14;
    put([0.34, 0.21, 0.18], falloff(dx * dx + dy * dy + dz * dz, 1) * 0.95);
  }

  // 코 밑 그늘 — 코가 얼굴에서 떨어져 보이게 합니다
  {
    const dx = x / 0.14;
    const dy = (y + 0.262) / 0.045;
    const dz = (z - 0.80) / 0.16;
    put(SHADE, falloff(dx * dx + dy * dy + dz * dz, 1) * 0.45);
  }

  // 아랫입술 아래 그늘
  {
    const dx = x / 0.14;
    const dy = (y + 0.600) / 0.055;
    const dz = (z - 0.77) / 0.18;
    put(SHADE, falloff(dx * dx + dy * dy + dz * dz, 1) * 0.40);
  }

  // 턱 아래 그늘 — 목과 얼굴을 분리합니다
  put([0.68, 0.49, 0.41], smoothstep(-0.84, -1.05, y) * 0.35);

  // 눈썹 자리 살짝 어둡게 (눈썹 메시가 떠 보이지 않게 받쳐줍니다)
  for (const sx of [-1, 1]) {
    const dx = (x - sx * 0.290) / 0.27;
    const dy = (y - 0.288) / 0.070;
    const dz = (z - 0.66) / 0.30;
    put([0.58, 0.41, 0.34], falloff(dx * dx + dy * dy + dz * dz, 1) * 0.45);
  }

  out[0] = r; out[1] = g; out[2] = b;
}

/* ═══════════════════════════════════════════════════════════════════════════
   5단계 — 머리카락 경계선
   머리카락은 **머리 모양 그대로** 살짝 부풀린 껍질입니다.
   경계선 아래 점들은 머리 **속으로** 접어 넣어 안 보이게 합니다.
   (삼각형을 지우는 것보다 안전하고, 경계가 톱니처럼 되지 않습니다)
   ═══════════════════════════════════════════════════════════════════════════ */

function hairOffset(x, y, z) {
  /* 방위각: 0 = 정면, ±π/2 = 옆, ±π = 뒤통수.
     헤어라인을 x·z 로 따로 계산하면 옆에서 층이 집니다. 각도로 한 번에
     정의하면 이마 → 관자놀이 → 귀 위 → 뒷목까지 한 줄로 흐릅니다. */
  const a = Math.abs(Math.atan2(x, z));

  let line;
  if (a < Math.PI * 0.5) {
    line = mix(0.605, 0.185, smoothstep(0.28, Math.PI * 0.5, a));
  } else {
    line = mix(0.185, -0.460, smoothstep(Math.PI * 0.5, Math.PI * 0.90, a));
  }

  /* 2026-08-20 — 여자 머리로 바꾸면서 **M자를 없앴습니다.**
     관자놀이가 파인 M자 헤어라인은 남자 머리의 신호입니다.
     대신 이마 위를 **앞머리(뱅)** 로 부드럽게 덮습니다. */
  line -= Math.exp(-(a * a) / 0.50) * 0.115;

  /* ⚠️ 2026-08-19 첫 렌더 사고 — 헤어라인 아래 점을 머리 속으로
        **접어 넣었더니** 경계가 계단처럼 우둘투둘했습니다(톱니).
        대신 두께를 **연속**으로 두고, 경계 아래에서는 살짝 **음수**로
        만들어 피부 밑으로 들어가게 합니다. 그러면 두께가 0을 지나는
        지점이 저절로 매끈한 곡선이 됩니다. */
  // 앞머리 끝이 자로 잰 듯 일직선이면 가발처럼 보입니다
  line += 0.009 * Math.sin(a * 17.0) * Math.exp(-(a * a) / 0.9);

  const above = y - line;
  const grow = smoothstep(-0.06, 0.20, above);

  /* 볼륨: 정수리가 제일 두껍습니다. 그리고 **한쪽으로 가르마**를 냅니다.
     두께가 완전히 균일하면 아무리 다듬어도 수영모자처럼 보입니다. */
  let volume = mix(0.055, 0.150, clamp01((y + 0.35) / 1.35));
  const part = Math.exp(-((a - 0.42) * (a - 0.42)) / 0.020) * clamp01((y - 0.35) / 0.5);
  volume *= 1 - 0.30 * part * (x > 0 ? 1 : 0.30);

  // 결이 지도록 아주 낮은 주파수의 물결을 얹습니다
  volume *= 1 + 0.10 * Math.sin(a * 7.0) * clamp01((y + 0.1) / 0.8);

  return grow * volume - 0.018;
}

/**
 * 표정 네 가지의 **점 이동량**을 계산합니다.
 *
 * 피부 메시와 입술 메시가 **같은 함수**를 써야 두 메시가 어긋나지 않습니다.
 * (따로 계산하면 입을 벌릴 때 입술과 얼굴 사이가 벌어집니다.)
 */
function morphDeltas(x, y, z, out) {
  out.fill(0);

  // 0~2 턱 열기 — 회전축 둘레로 돕니다 (평행이동은 턱이 빠져 보입니다)
  const w = jawWeight(x, y, z);
  if (w > 0.001) {
    const r = rotateJaw(x, y, z, JAW_ANGLE * w);
    out[0] = r.x - x; out[1] = r.y - y; out[2] = r.z - z;
  }

  // 3~8 입 벌림(이·에) / 오므림(오·우)
  const mx = x / 0.32;
  const my = (y - MOUTH_Y) / 0.20;
  const mz = (z - 0.78) / 0.36;
  const m = falloff(mx * mx + my * my + mz * mz, 1);
  /* ⚠️ 좌우 방향을 `x >= 0 ? 1 : -1` 로 딱 나누면 **한가운데에서 값이
        확 뒤집혀서**, 입을 오므릴 때 양쪽 입술이 가운데서 서로를 뚫고
        지나갑니다(렌더에서 가운데 세로 조각이 튀어나왔습니다).
        가운데로 갈수록 0 이 되는 부드러운 부호를 씁니다. */
  const sgn = Math.max(-1, Math.min(1, x / 0.16));
  if (m > 0.001) {
    out[3] = sgn * 0.072 * m;
    out[4] = 0.012 * m;
    out[5] = -0.028 * m;
    out[6] = -sgn * 0.052 * m;
    out[7] = 0;
    out[8] = 0.046 * m;
  }

  // 9~11 미소 — 입꼬리가 위로, 볼이 따라 올라갑니다
  const cx2 = (x - sgn * 0.215) / 0.21;
  const cy2 = (y - MOUTH_Y) / 0.16;
  const cz2 = (z - 0.74) / 0.30;
  const s = falloff(cx2 * cx2 + cy2 * cy2 + cz2 * cz2, 1);
  out[9] += sgn * 0.028 * s;
  out[10] += 0.050 * s;
  out[11] += -0.008 * s;

  // 진짜 미소는 볼과 눈 밑까지 움직입니다 — 이게 있어야 웃음이 '진짜'로 보입니다
  const bx = (x - sgn * 0.400) / 0.27;
  const by = (y + 0.180) / 0.21;
  const bz = (z - 0.60) / 0.33;
  const bs = falloff(bx * bx + by * by + bz * bz, 1);
  out[10] += 0.026 * bs;
  out[11] += 0.012 * bs;
}

/** morphDeltas 를 메시 전체에 적용해 모프타겟 네 장을 구워 넣습니다. */
function bakeMorphs(THREE, geo, xs, ys, zs) {
  const n = xs.length;
  const d = [
    new Float32Array(n * 3), new Float32Array(n * 3),
    new Float32Array(n * 3), new Float32Array(n * 3),
  ];
  const out = new Float32Array(12);
  for (let i = 0; i < n; i++) {
    morphDeltas(xs[i], ys[i], zs[i], out);
    for (let k = 0; k < 4; k++) {
      d[k][i * 3] = out[k * 3];
      d[k][i * 3 + 1] = out[k * 3 + 1];
      d[k][i * 3 + 2] = out[k * 3 + 2];
    }
  }
  geo.morphTargetsRelative = true;
  geo.morphAttributes.position = d.map((a) => new THREE.BufferAttribute(a, 3));
}

/* ═══════════════════════════════════════════════════════════════════════════
   긴 머리 (커튼)

   2026-08-20 — 목사님: "목소리는 여자인데 얼굴은 남자야."

   얼굴 뼈대를 아무리 여성스럽게 깎아도, **머리가 짧으면 남자로 보입니다.**
   사람이 성별을 판단할 때 가장 먼저 보는 것이 머리 길이이기 때문입니다.
   그래서 두피에 붙은 캡 머리(hairOffset) 위에, 어깨까지 내려오는 머리를
   한 겹 더 두릅니다.

   만드는 법: 뒤통수 쪽 방위각 구간만 도는 **커튼**입니다.
     - 가로 방향(u): 얼굴 앞(±A_FRONT 안쪽)은 비워 둡니다. 얼굴을 가리면
       안 되니까요. 그 바깥에서 뒤통수를 돌아 반대쪽까지 이어집니다.
     - 세로 방향(s): 정수리 근처에서 시작해 어깨까지 내려옵니다.
       귀 위까지는 두상을 감싸고, 그 아래로는 곧게 떨어집니다.
     - 끝단은 뒤가 길고 앞이 짧습니다. 일자로 자른 듯 평평하면
       가발처럼 보입니다.
   ═══════════════════════════════════════════════════════════════════════════ */

/** 이 높이에서 머리(두상)의 가로 반지름 근사값 */
function skullHalfWidth(y) {
  if (y <= 0.10) return 0.775;
  const t = smoothstep(0.10, 1.06, y);
  return 0.775 * (1 - 0.46 * Math.pow(t, 1.30));
}

function buildLongHair(THREE, Physical, HAIR) {
  const NA = 108;              // 뒤통수를 도는 분할
  const NS = 40;               // 위 → 아래 분할
  const A_FRONT = 0.86;        // 이 각도 안쪽(얼굴 앞)에는 머리가 없습니다
  const TOP_Y = 0.80;          // 커튼이 시작하는 높이 (캡 속에 숨습니다)
  const BOT_Y = -1.90;         // 끝단 기준 높이 (어깨 위에 닿습니다)

  const span = Math.PI * 2 - 2 * A_FRONT;
  const nV = (NA + 1) * (NS + 1);
  const positions = new Float32Array(nV * 3);
  const colors = new Float32Array(nV * 3);

  for (let j = 0; j <= NS; j++) {
    const s = j / NS;
    for (let i = 0; i <= NA; i++) {
      const a = A_FRONT + (i / NA) * span;   // 뒤통수를 도는 방위각
      const ca = Math.cos(a), sa = Math.sin(a);

      /* 끝단 높이: 뒤가 길고, 얼굴 옆으로 올수록 짧습니다.
         (cos a 는 뒤통수에서 -1, 옆에서 0 근처) */
      /* 끝단이 자로 잰 듯 평평하면 가발입니다. 갈래마다 길이를 다르게
         해서 머리카락 다발처럼 보이게 합니다. */
      /* ⚠️ 부호를 반대로 뒀더니 **얼굴 옆 머리가 제일 길어서** 널빤지
            두 장이 걸린 것처럼 보였습니다. 얼굴 쪽(ca > 0)이 짧아야
            얼굴이 열리고 뒤가 길어야 머리채로 보입니다. */
      const bottom = BOT_Y + 0.30 * ca
        + 0.10 * Math.sin(a * 7.0) + 0.05 * Math.sin(a * 13.0 + 1.3);
      const y = mix(TOP_Y, bottom, s);

      /* 가로 반지름: 귀 위까지는 두상을 따라가고 아래로는 곧게.
         끝으로 갈수록 아주 살짝 안으로 모읍니다(뻗치지 않게). */
      let r = skullHalfWidth(y);
      r *= 1.045;
      r += 0.058 + 0.085 * Math.sin(Math.min(1, s * 1.15) * Math.PI);
      r *= 1 - 0.42 * smoothstep(0.58, 1, s);   // 끝으로 갈수록 확실히 가늘게

      /* ⚠️ 커튼은 **면 한 겹**이라, 앞에서 보면 종잇장처럼 보입니다.
            앞 가장자리를 안쪽으로 말아 넣으면 두께가 있는 것처럼 보입니다.
            (첫 렌더에서 얼굴 옆에 리본 두 장이 걸린 것처럼 됐습니다.) */
      const eIn = Math.min((a - A_FRONT) / 0.30, (A_FRONT + span - a) / 0.30);
      const curl = 1 - clamp01(eIn);
      r *= 1 - 0.13 * curl;

      // 머릿결 — 아주 낮은 주파수의 물결이라야 '결'로 보입니다
      r += 0.016 * Math.sin(a * 8.0) * smoothstep(0.05, 0.45, s);

      const x = r * sa;
      const z = r * ca * 1.20 - 0.13 * curl;  // 앞뒤가 더 두꺼운 두상 비율 + 말린 가장자리

      const k = j * (NA + 1) + i;
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;

      /* 색: 정수리는 밝고 끝은 어둡습니다. 균일한 색이면 덩어리로 보입니다. */
      const lift = 1 + 0.30 * (1 - smoothstep(0, 0.55, s)) - 0.12 * smoothstep(0.6, 1, s);
      colors[k * 3] = lift; colors[k * 3 + 1] = lift; colors[k * 3 + 2] = lift;
    }
  }

  const index = [];
  for (let j = 0; j < NS; j++) {
    for (let i = 0; i < NA; i++) {
      const A = j * (NA + 1) + i, B = A + 1;
      const C = (j + 1) * (NA + 1) + i, D = C + 1;
      index.push(A, C, B, B, C, D);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  g.computeVertexNormals();

  const mesh = new THREE.Mesh(
    g,
    new Physical({
      color: HAIR, vertexColors: true,
      roughness: 0.58, metalness: 0.02,
      sheen: 0.8, sheenColor: new THREE.Color(0xb08a60), sheenRoughness: 0.40,
      // 안쪽 면도 그려야 고개를 돌렸을 때 구멍이 안 뚫립니다
      side: THREE.DoubleSide,
    })
  );
  mesh.frustumCulled = false;
  mesh.name = 'LongHair';
  return mesh;
}

/**
 * **입술 판.**
 *
 * 피부에 뚫은 구멍을 덮는 도넛 모양 판입니다. 바깥 테두리는 얼굴 표면에
 * 딱 붙고(그래서 이음매가 안 보입니다), 안쪽 테두리는 **정확한 얇은 타원**
 * 이라 다물었을 때 깔끔한 입술 선이 됩니다.
 *
 * 왜 따로 만드나 — 구 격자를 도려내서 만든 구멍은 아무리 손봐도 톱니이거나
 * 찢어집니다. 입 모양은 **우리가 정한 식**이 결정해야 합니다.
 *
 * 위·아래 입술을 따로 만들지 않고 한 장으로 두는 대신, 얼굴과 **같은
 * morphDeltas** 를 구워 넣습니다. 그래서 턱을 열면 아랫입술만 따라 내려가고
 * 입꼬리는 제자리에 남습니다 — 두 메시가 절대 어긋나지 않습니다.
 */
function buildLipPatch(THREE, Physical) {
  const SEG = 112;      // 둘레 분할
  const RINGS = 8;      // 바깥 → 안쪽 고리 수

  const nV = SEG * (RINGS + 1);
  const px = new Float32Array(nV);
  const py = new Float32Array(nV);
  const pz = new Float32Array(nV);
  const positions = new Float32Array(nV * 3);
  const colors = new Float32Array(nV * 3);
  const rgb = [0, 0, 0];

  const LIP_MID = [0.848, 0.430, 0.418];
  const LIP_IN = [0.300, 0.105, 0.115];

  for (let j = 0; j <= RINGS; j++) {
    const u = j / RINGS;                       // 0 = 바깥(피부), 1 = 입 구멍
    for (let i = 0; i < SEG; i++) {
      const th = (i / SEG) * Math.PI * 2;
      const ct = Math.cos(th), st = Math.sin(th);

      /* ⚠️ 바깥 테두리(u=0)는 **손대지 않은 순수 타원**이어야 합니다.
            여기에 두께 변화를 주면 테두리가 잘린 구멍보다 작아지는 곳이
            생겨서 톱니가 삐져나옵니다. 모양 변화는 안쪽으로 갈수록 켭니다. */
      const shape = smoothstep(0, 0.30, u);
      const fat = 1 - 0.17 * st * shape;
      const a = mix(LIP_A, MOUTH_A, u);
      const b = mix(LIP_B, MOUTH_B, u) * fat;

      let x = a * ct;
      let y = MOUTH_Y + b * st;

      /* 큐피드 활 — 윗입술 가운데가 살짝 내려앉고 양옆이 봉긋합니다.
         이 작은 굴곡 하나가 "입술"과 "구멍"을 가릅니다. */
      y += 0.016 * (-Math.cos(4 * th)) * Math.max(0, st) ** 1.5 * shape * (1 - u * 0.35);

      const s = surfaceAt(x, y);
      // 입술은 얼굴보다 살짝 앞으로 부풀고, 안쪽 테두리는 말려 들어갑니다
      /* ⚠️ 처음엔 안쪽으로 깊게 말고(0.078) 어두운 띠도 넓게(u>0.62) 뒀더니,
            **다물었는데도 입이 벌어져 보였습니다.** 깔때기 안쪽의 어두운 면이
            통째로 '벌어진 입'으로 읽혔기 때문입니다. 말림은 마지막 두 고리에서만,
            어두운 색도 맨 안쪽에서만 씁니다. */
      const bulge = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.015 * (st > 0 ? 0.82 : 1.0);
      const z = s.z + 0.005 + bulge - smoothstep(0.86, 1, u) * 0.034;

      const k = j * SEG + i;
      px[k] = x; py[k] = y; pz[k] = z;
      positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;

      // 색: 바깥은 피부색 그대로 → 안으로 갈수록 입술색 → 구멍 근처는 어둡게
      skinColorAt(x, y, z, rgb);
      const t1 = smoothstep(0.06, 0.40, u);
      const t2 = smoothstep(0.90, 1.0, u);
      for (let c = 0; c < 3; c++) {
        colors[k * 3 + c] = mix(mix(rgb[c], LIP_MID[c], t1), LIP_IN[c], t2);
      }
    }
  }

  const index = [];
  for (let j = 0; j < RINGS; j++) {
    for (let i = 0; i < SEG; i++) {
      const i2 = (i + 1) % SEG;
      const A = j * SEG + i, B = j * SEG + i2;
      const C = (j + 1) * SEG + i, D = (j + 1) * SEG + i2;
      index.push(A, C, B, B, C, D);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(index);
  bakeMorphs(THREE, g, px, py, pz);
  g.computeVertexNormals();

  const mesh = new THREE.Mesh(
    g,
    new Physical({
      color: 0xffffff, vertexColors: true,
      roughness: 0.44, metalness: 0,
      sheen: 0.30, clearcoat: 0.06, clearcoatRoughness: 0.55,
      // 뒤집힌 면이 나와도 구멍이 생기지 않도록 양면으로 그립니다
      side: THREE.DoubleSide,
    })
  );
  mesh.frustumCulled = false;
  mesh.name = 'Lips';
  return mesh;
}

/**
 * **이음매 지우기.**
 *
 * 구 지오메트리는 UV 이음매(경도 0°)와 양 극점에서 정점이 **복제**되어
 * 있습니다. computeVertexNormals 는 각 복제본에게 자기 쪽 삼각형만 보고
 * 법선을 계산하므로, 이음매를 따라 법선이 어긋나 **세로 줄이 하나 그어집니다.**
 * (세 번째 렌더에서 이마 한가운데를 지나 코까지 내려오는 줄이 그것이었습니다.)
 *
 * 같은 자리에 있는 정점들의 법선을 평균 내면 줄이 사라집니다.
 */
function weldNormals(geo) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const map = new Map();
  const key = (i) =>
    `${Math.round(pos.getX(i) * 4096)},${Math.round(pos.getY(i) * 4096)},${Math.round(pos.getZ(i) * 4096)}`;

  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) map.set(k, (e = { n: [0, 0, 0], list: [] }));
    e.n[0] += nrm.getX(i); e.n[1] += nrm.getY(i); e.n[2] += nrm.getZ(i);
    e.list.push(i);
  }
  for (const e of map.values()) {
    if (e.list.length < 2) continue;
    const L = Math.hypot(e.n[0], e.n[1], e.n[2]) || 1;
    const nx = e.n[0] / L, ny = e.n[1] / L, nz = e.n[2] / L;
    for (const i of e.list) nrm.setXYZ(i, nx, ny, nz);
  }
  nrm.needsUpdate = true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   조립
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param {object} THREE  avatar3d.js 가 불러온 three 인스턴스
 * @param {object} [opts]
 * @param {number} [opts.skin]  피부색 (기본은 정점색을 그대로 씀)
 * @param {number} [opts.hair]  머리색
 * @param {number} [opts.shirt] 옷 색
 * @returns {{root, headGroup, headInner, bodyGroup, neck, spine, headMesh,
 *            jawGroup, eyes, lids, brows, influences}}
 */
export function buildFace(THREE, opts = {}) {
  const HAIR = opts.hair ?? 0x4a3222;
  const SHIRT = opts.shirt ?? 0xb4707f;

  /* ── 머리 지오메트리 ────────────────────────────────────────────────── */

  // 160×120: 입 구멍을 도려낼 만큼 촘촘하면서 휴대폰에서도 가볍습니다.
  const geo = new THREE.SphereGeometry(1, 160, 120);
  const pos = geo.attributes.position;
  const N = pos.count;

  const vx = new Float32Array(N);
  const vy = new Float32Array(N);
  const vz = new Float32Array(N);

  const v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.fromBufferAttribute(pos, i);
    shapeSkull(v);
    sculptFeatures(v);
    vx[i] = v.x; vy[i] = v.y; vz[i] = v.z;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  /* ── 입 자리 도려내기 ───────────────────────────────────────────────
     ⚠️ 여기서 두 번 실패했습니다.
        (1) 삼각형만 지웠더니 가장자리가 **톱니 상어이빨**이 됐습니다.
        (2) 그 가장자리를 타원 위로 끌어다 붙였더니 삼각형이 늘어나
            입 주변이 **찢어진 것처럼** 됐습니다.

     그래서 셋째 방법으로 갑니다: 피부는 **넉넉하게, 대충** 도려내고
     그 위에 따로 만든 **입술 판**을 덮습니다. 톱니 가장자리는 입술 판
     아래에 완전히 숨으므로 보이지 않습니다. 입 구멍의 모양은 이제
     삼각형 격자가 아니라 우리가 적은 타원식이 그대로 결정합니다. */
  const idx = geo.index.array;
  const keep = [];
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    /* ⚠️ 무게중심으로 판정하면 삼각형이 타원 **밖으로** 삐져나옵니다.
          그러면 톱니 가장자리가 입술 판 밖으로 나와 검은 톱니로 보입니다
          (렌더에서 윗입술 위에 실제로 나왔습니다).
          세 점이 **모두** 안에 들 때만 지우면 구멍 ⊆ 타원 이 보장됩니다. */
    const insideOne = (i) =>
      vz[i] > 0.42 &&
      (vx[i] * vx[i]) / (CUT_A * CUT_A) +
        ((vy[i] - MOUTH_Y) * (vy[i] - MOUTH_Y)) / (CUT_B * CUT_B) < 1;
    if (!(insideOne(a) && insideOne(b) && insideOne(c))) keep.push(a, b, c);
  }
  geo.setIndex(keep);

  /* ── 정점 색 ────────────────────────────────────────────────────────── */
  const col = new Float32Array(N * 3);
  const rgb = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    skinColorAt(vx[i], vy[i], vz[i], rgb);
    col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2];
  }

  /* ⚠️ 입을 벌리면 **잘라낸 피부의 톱니 가장자리**가 윗입술 뒤로 살짝
        보였습니다(계단 모양 검은 띠). 그 자리를 미리 어둡게 칠해 두면
        보이더라도 '입 안 그늘'로 읽혀서 눈에 띄지 않습니다.
        이 색칠은 입술 판 뒤에 숨는 부분이라 평소에는 아예 안 보입니다. */
  for (let i = 0; i < N; i++) {
    if (vz[i] < 0.35) continue;
    /* ⚠️ 범위를 입술 판(LIP_A×LIP_B)보다 크게 잡으면 어두운 칠이
          입술 **바깥**으로 삐져나와, 입 둘레에 말굽 모양 그늘이 생깁니다
          (렌더에서 실제로 수염 자국처럼 보였습니다). 반드시 안쪽으로. */
    const dx = vx[i] / (CUT_A * 1.10);
    const dy = (vy[i] - MOUTH_Y) / (CUT_B * 1.22);
    const w = falloff(dx * dx + dy * dy, 1);
    if (w <= 0) continue;
    const k = clamp01(w * 1.25);
    col[i * 3] = mix(col[i * 3], 0.20, k);
    col[i * 3 + 1] = mix(col[i * 3 + 1], 0.075, k);
    col[i * 3 + 2] = mix(col[i * 3 + 2], 0.080, k);
  }

  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  /* ── 모프타겟 (전부 '차이값'으로 저장) ──────────────────────────────── */
  bakeMorphs(THREE, geo, vx, vy, vz);

  geo.computeVertexNormals();
  weldNormals(geo);

  /* ── 피부 재질 ──────────────────────────────────────────────────────
     MeshPhysicalMaterial 의 sheen 이 핵심입니다. 피부의 솜털이 빛을
     받는 느낌을 흉내 내서, 윤곽선이 따뜻하게 살아납니다.
     roughness 가 낮으면 플라스틱 인형이 되므로 0.6 아래로 내리지 않습니다. */
  const Physical = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
  const skinMat = new Physical({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.0,
    sheen: 0.55,
    sheenColor: new THREE.Color(0xff8a70),
    sheenRoughness: 0.85,
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    flatShading: false,
  });

  const headMesh = new THREE.Mesh(geo, skinMat);
  headMesh.frustumCulled = false;
  headMesh.name = 'FaceSkin';

  /* ── 조립 트리 ──────────────────────────────────────────────────────
       root
        ├ bodyGroup   (목·어깨 — 고개를 따라 살짝만 움직임)
        └ headGroup   (고개 회전축 = 목 위)
             └ headInner (실제 얼굴 부품들)                              */
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const headGroup = new THREE.Group();
  const headInner = new THREE.Group();

  // 고개는 머리 한가운데가 아니라 **목 위**에서 돕니다.
  headGroup.position.y = -0.62;
  headInner.position.y = 0.62;
  headGroup.add(headInner);
  root.add(bodyGroup, headGroup);

  headInner.add(headMesh);

  /* ── 입술 판 (피부 구멍을 덮습니다) ─────────────────────────────────── */
  const lipMesh = buildLipPatch(THREE, Physical);
  headInner.add(lipMesh);

  /* ── 입 안 ──────────────────────────────────────────────────────────
     구멍 뒤가 비면 **배경이 그대로 비칩니다**(뒤통수 안쪽 면은 컬링되어
     안 보이기 때문). 구 하나를 놓으면 입을 크게 벌렸을 때 가장자리에서
     구가 모자라 틈이 생깁니다.

     그래서 머리 **속껍질**을 통째로 하나 더 넣습니다. 머리와 같은 모양을
     0.78 로 줄인 것이라, 피부에 어떤 구멍이 나든 그 뒤는 항상 이 어두운
     껍질입니다. 틈이 생길 수가 없습니다. */
  const shellGeo = new THREE.SphereGeometry(1, 96, 72);
  {
    const sp = shellGeo.attributes.position;
    const sv = new THREE.Vector3();
    for (let i = 0; i < sp.count; i++) {
      sv.fromBufferAttribute(sp, i);
      shapeSkull(sv);
      sculptFeatures(sv);
      /* ⚠️ 균일하게 줄이면 입 자리가 **위로 딸려 올라갑니다**(원점이 머리
            한가운데가 아니라서). 그러면 이가 껍질 밖으로 삐져나와 톱니처럼
            보입니다. 축별로 줄여서 높이는 그대로 둡니다. */
      sv.x *= 0.86;
      sv.y = 0.07 + (sv.y - 0.07) * 0.93;
      sv.z *= 0.80;
      sp.setXYZ(i, sv.x, sv.y, sv.z);
    }
    shellGeo.computeVertexNormals();
  }
  const cavity = new THREE.Mesh(
    shellGeo,
    new THREE.MeshStandardMaterial({ color: 0x33121a, roughness: 0.9 })
  );
  cavity.frustumCulled = false;
  headInner.add(cavity);

  /* ⚠️ 이(teeth)는 뺐습니다. 입 안이 얕아서 어떤 크기로 넣어도 속껍질과
        교차해 **톱니 상어이빨**로 보였습니다(렌더 세 번 연속). 어두운 입
        안과 혀만으로도 말하는 것으로 충분히 보입니다. */
  /* ⚠️ 첫 렌더에서 이 이가 입술을 **뚫고 나와** 송곳니처럼 보였습니다.
        이는 입술보다 확실히 **뒤에**, 그리고 입술 선 **아래에** 있어야
        다물었을 때 안 보입니다. */

  // 아래 이와 혀는 **턱과 함께** 움직입니다
  const jawGroup = new THREE.Group();
  jawGroup.position.set(JAW_PIVOT.x, JAW_PIVOT.y, JAW_PIVOT.z);
  headInner.add(jawGroup);


  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xb75a63, roughness: 0.5 })
  );
  tongue.scale.set(0.85, 0.32, 1.05);
  tongue.position.set(0, MOUTH_Y - 0.150 - JAW_PIVOT.y, 0.375 - JAW_PIVOT.z);
  jawGroup.add(tongue);

  /* ── 눈 ─────────────────────────────────────────────────────────────
     흰자 + 홍채 + 동공 + **각막 하이라이트**.
     하이라이트 점 하나가 "살아있는 눈"의 90% 입니다. */
  /* 눈알 위치는 **눈구멍을 판 뒤의 표면**에서 역산합니다.
     눈대중으로 z 를 적으면 반드시 틀립니다 — 조각을 한 뒤의 표면 좌표는
     사람이 계산할 수 없습니다. surfaceAt 이 그 값을 알려줍니다.
     각막이 0.02 정도만 튀어나와야 얼굴 **안에** 들어앉습니다. */
  const EYE_X = 0.295;
  const EYE_Y = 0.066;
  const EYE = {
    x: EYE_X, y: EYE_Y, r: 0.148,
    z: surfaceAt(EYE_X, EYE_Y).z - 0.118,
  };

  const scleraMat = new Physical({
    color: 0xfaf6f0, roughness: 0.18, metalness: 0,
    clearcoat: 0.9, clearcoatRoughness: 0.08,
  });
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x7d5836, roughness: 0.26, metalness: 0.04,
  });
  const limbalMat = new THREE.MeshStandardMaterial({ color: 0x1c120a, roughness: 0.4 });

  const eyes = [];
  const lids = [];
  const brows = [];

  for (const sx of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(sx * EYE.x, EYE.y, EYE.z);

    const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE.r, 32, 24), scleraMat);
    ball.scale.set(1, 0.96, 0.92);
    eye.add(ball);

    // 홍채는 살짝 오목해야 빛이 예쁘게 갇힙니다 (구를 눌러서 흉내)
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.058, 28, 20), irisMat);
    iris.scale.set(1, 1, 0.42);
    iris.position.z = EYE.r * 0.84;
    eye.add(iris);

    // 홍채 테두리(림벌 링) — 이게 있으면 눈이 또렷해집니다
    const limbal = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.0062, 8, 32), limbalMat
    );
    limbal.position.z = EYE.r * 0.845;
    eye.add(limbal);

    const pupil = new THREE.Mesh(
      new THREE.SphereGeometry(0.0235, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x0b0705 })
    );
    pupil.scale.set(1, 1, 0.4);
    pupil.position.z = EYE.r * 0.92;
    eye.add(pupil);

    const hl = new THREE.Mesh(
      new THREE.SphereGeometry(0.0195, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    hl.position.set(sx * 0.036, 0.044, EYE.r * 0.93);
    eye.add(hl);

    // 아주 작은 두 번째 하이라이트 — 촉촉해 보입니다
    const hl2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.009, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    hl2.position.set(sx * -0.036, -0.038, EYE.r * 0.89);
    eye.add(hl2);

    headInner.add(eye);
    eyes.push(eye);

    /* 눈꺼풀 — 눈알과 **같은 중심**을 도는 구면 뚜껑입니다.
       평행이동시키면(예전 방식) 눈 위에 모자를 씌운 것처럼 보입니다.
       회전시켜야 진짜로 감깁니다.

       ⚠️ 두 번째 렌더 사고 — 뚜껑을 눈알과 거의 같은 크기로 만들었더니
          "줄무늬 있는 공"이 얼굴에 박힌 꼴이었습니다. 눈꺼풀은 눈알보다
          **확실히 커서** 눈두덩 살까지 덮어야 눈이 얼굴 안에 들어앉습니다.
          그리고 가로로 늘여야 동그란 눈이 아니라 아몬드 모양이 됩니다. */
    const lidPivot = new THREE.Group();
    // z 로는 **덜** 부풀립니다. 앞뒤로 키우면 눈이 얼굴 밖으로 튀어나온
    // 고글처럼 보입니다(세 번째 렌더에서 그랬습니다).
    lidPivot.position.set(sx * EYE.x, EYE.y, EYE.z - 0.012);
    lidPivot.scale.set(1.46, 1.26, 1.00);
    // 눈꼬리가 눈머리보다 살짝 올라가야 사람 눈처럼 보입니다
    lidPivot.rotation.z = sx * 0.075;
    headInner.add(lidPivot);

    /* ⚠️ 눈꺼풀 색을 손으로 적으면 피부색을 바꿀 때마다 어긋납니다.
          (밝은 피부로 바꿨더니 눈 감을 때 주황 렌즈처럼 보였습니다.)
          그 자리의 **피부색을 그대로 계산해서** 씁니다. */
    const lidRGB = [0, 0, 0];
    skinColorAt(sx * EYE.x, EYE.y + 0.06, EYE.z + 0.10, lidRGB);
    const lidMat = new Physical({
      color: new THREE.Color(lidRGB[0], lidRGB[1], lidRGB[2]),
      roughness: 0.74, sheen: 0.5,
      sheenColor: new THREE.Color(0xff8a70), sheenRoughness: 0.9,
    });
    const lashMat = new THREE.MeshStandardMaterial({ color: 0x1c1109, roughness: 0.45 });

    const upperG = new THREE.Group();
    upperG.add(new THREE.Mesh(
      new THREE.SphereGeometry(EYE.r * 1.05, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5),
      lidMat
    ));
    // 속눈썹 선 — 뚜껑 가장자리에 아주 얇은 띠 (두꺼우면 화장한 것처럼 됩니다)
    upperG.add(new THREE.Mesh(
      new THREE.SphereGeometry(EYE.r * 1.075, 36, 8, 0, Math.PI * 2,
        Math.PI * 0.452, Math.PI * 0.042),
      lashMat
    ));
    lidPivot.add(upperG);

    const lowerG = new THREE.Group();
    const lower = new THREE.Mesh(
      new THREE.SphereGeometry(EYE.r * 1.04, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.5),
      lidMat
    );
    lower.rotation.x = Math.PI;      // 아래쪽을 덮도록 뒤집습니다
    lowerG.add(lower);
    const lashL = new THREE.Mesh(
      new THREE.SphereGeometry(EYE.r * 1.05, 36, 6, 0, Math.PI * 2,
        Math.PI * 0.472, Math.PI * 0.028),
      lashMat
    );
    lashL.rotation.x = Math.PI;
    lowerG.add(lashL);
    lidPivot.add(lowerG);

    /* 열림 각도.
       위뚜껑을 -A 만큼 돌리면 앞쪽 가장자리가 수평선보다 A 라디안 위로
       올라갑니다. 아래뚜껑은 반대 부호입니다.
       사람 눈꺼풀 틈은 위 25° / 아래 18° 정도입니다. */
    const lid = {
      upper: upperG, lower: lowerG,
      upOpen: -0.88, upShut: 0.205,
      loOpen: 0.62, loShut: -0.145,
    };
    upperG.rotation.x = lid.upOpen;
    lowerG.rotation.x = lid.loOpen;
    lids.push(lid);

    /* 눈썹.
       ⚠️ 처음엔 납작한 토러스 하나를 z=0.69 에 뒀습니다. 그런데 눈썹뼈
          표면은 안쪽 0.881 → 가운데 0.821 → 바깥 0.722 로 **휘어 있어서**
          평평한 고리는 살 속에 파묻힙니다(실제로 눈썹이 안 보였습니다).
          그래서 눈썹 선을 따라 작은 덩어리를 여러 개 얹고, 각 덩어리의
          z 를 surfaceAt 으로 **그 자리 표면에 맞춥니다.**
          덤으로 끝이 가늘어져 진짜 눈썹처럼 보입니다. */
    const browG = new THREE.Group();
    const browMat = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.62 });
    const CLUMPS = 17;
    for (let i = 0; i < CLUMPS; i++) {
      const t = i / (CLUMPS - 1);                    // 0 = 눈머리, 1 = 눈꼬리
      const bx = mix(0.168, 0.492, t);
      // 가운데가 가장 높은 아치
      /* 여자 눈썹은 남자보다 **높고 가늘고 아치가 큽니다.**
         (남자 눈썹은 눈에 붙어서 굵고 곧습니다.) */
      const by = 0.288 + Math.sin(t * Math.PI) * 0.080 - t * 0.034;
      const s = surfaceAt(bx, by);
      // 끝으로 갈수록 가늘어집니다
      const thick = 0.0165 * (0.38 + 0.62 * Math.sin(Math.min(1, t * 1.10) * Math.PI) ** 0.5);
      const c = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), browMat);
      c.scale.set(thick * 1.5, thick, thick * 0.8);
      c.position.set(sx * s.x, s.y, s.z + thick * 0.35);
      browG.add(c);
    }
    headInner.add(browG);
    brows.push({ group: browG, restY: 0, sx });
  }

  /* ── 귀 ─────────────────────────────────────────────────────────────
     정면에서는 거의 안 보이지만, 없으면 고개를 돌릴 때 바로 티가 납니다. */
  for (const sx of [-1, 1]) {
    const earG = new THREE.Group();
    const outer = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), skinMat);
    outer.scale.set(0.34, 1.05, 0.62);
    earG.add(outer);
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xc98d70, roughness: 0.8 })
    );
    inner.scale.set(0.30, 0.85, 0.5);
    inner.position.set(sx * 0.035, -0.01, 0.02);
    earG.add(inner);
    earG.position.set(sx * 0.700, -0.045, -0.030);
    earG.rotation.set(0, sx * 0.28, sx * -0.12);
    headInner.add(earG);
  }

  /* ── 머리카락 ───────────────────────────────────────────────────────── */
  const hairGeo = new THREE.SphereGeometry(1, 128, 96);
  const hpos = hairGeo.attributes.position;
  const hv = new THREE.Vector3();
  for (let i = 0; i < hpos.count; i++) {
    hv.fromBufferAttribute(hpos, i);
    shapeSkull(hv);
    sculptFeatures(hv);
    const off = hairOffset(hv.x, hv.y, hv.z);
    const len = hv.length() || 1;
    hv.multiplyScalar((len + off) / len);
    hpos.setXYZ(i, hv.x, hv.y, hv.z);
  }
  hairGeo.computeVertexNormals();
  weldNormals(hairGeo);
  const hairMesh = new THREE.Mesh(
    hairGeo,
    new Physical({
      color: HAIR, roughness: 0.66, metalness: 0.02,
      sheen: 0.7, sheenColor: new THREE.Color(0x9c7a58), sheenRoughness: 0.45,
    })
  );
  hairMesh.frustumCulled = false;
  headInner.add(hairMesh);

  // 어깨까지 오는 긴 머리 — 성별 인상을 결정하는 가장 큰 요소입니다
  const longHair = buildLongHair(THREE, Physical, HAIR);
  headInner.add(longHair);

  /* ── 목 · 어깨 ──────────────────────────────────────────────────────── */
  const neckMat = new Physical({
    color: 0xefbb9d, roughness: 0.76, sheen: 0.45,
    sheenColor: new THREE.Color(0xff8a70), sheenRoughness: 0.9,
  });
  /* 목은 **턱 안쪽에서** 시작해야 합니다. 턱 밑에서 시작하면
     머리가 막대기 위에 얹힌 것처럼 보입니다(첫 렌더가 그랬습니다). */
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.285, 0.44, 1.20, 40, 1, true),
    neckMat
  );
  neck.position.set(0, -1.16, -0.06);
  neck.scale.z = 0.85;
  bodyGroup.add(neck);

  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(1, 44, 30),
    new Physical({ color: SHIRT, roughness: 0.88, sheen: 0.35 })
  );
  shoulders.scale.set(1.62, 0.88, 0.80);
  shoulders.position.y = -2.02;
  bodyGroup.add(shoulders);

  // 옷깃 — 목이 옷 속으로 들어가 보이게 하는 최소한의 장치
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.415, 0.085, 12, 36),
    new Physical({ color: SHIRT, roughness: 0.82 })
  );
  collar.rotation.x = Math.PI * 0.5;
  collar.position.y = -1.44;
  collar.scale.set(1, 1, 0.78);
  bodyGroup.add(collar);

  return {
    root,
    headGroup,
    headInner,
    bodyGroup,
    neck,
    spine: shoulders,
    headMesh,
    jawGroup,
    eyes,
    lids,
    brows,
    lipMesh,
    influences: headMesh.morphTargetInfluences,

    /**
     * 표정 값을 넣습니다. **반드시 이 함수를 쓰세요.**
     *
     * ⚠️ 2026-08-19 사고 — 피부 메시의 influences 만 건드리고 입술 판을
     *    잊었습니다. 결과: 턱을 벌리면 **피부에 뚫은 구멍만 열리고 입술은
     *    다문 채**라, 잘라낸 자리의 계단 모양 가장자리가 그대로 드러났습니다.
     *    두 메시는 언제나 같은 값으로 움직여야 합니다.
     */
    setMorph(index, value) {
      const v = value < 0 ? 0 : value > 1 ? 1 : value;
      if (headMesh.morphTargetInfluences) headMesh.morphTargetInfluences[index] = v;
      if (lipMesh.morphTargetInfluences) lipMesh.morphTargetInfluences[index] = v;
    },
  };
}
