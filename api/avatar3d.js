/**
 * web_app/src/avatar3d.js
 * ----------------------------------------------------------------------------
 * 3D 아바타 — Three.js + glTF(GLB) 모프타겟 립싱크.
 *
 * 왜 3D인가:
 *   사진 아바타는 결국 "사진이 움직이는 것"입니다. 아무리 잘 만들어도
 *   고개를 돌리거나 시선을 옮길 수 없고, 사람 눈은 그걸 즉시 알아챕니다.
 *   3D는 진짜 머리 뼈대와 얼굴 근육(모프타겟)이 있어서, 말할 때 턱이 내려가고
 *   입술이 오므라들고 고개가 따라 움직입니다.
 *
 * 이 파일이 지키는 것:
 *
 *   1) **살아있어 보이는 것은 입이 아니라 입 이외의 것들이다.**
 *      눈 깜빡임, 미세한 고개 흔들림, 호흡, 눈동자 사케이드가 없으면
 *      아무리 입을 잘 맞춰도 마네킹으로 보입니다. 그래서 이 파일에서
 *      립싱크보다 그쪽 코드가 더 깁니다. 의도된 것입니다.
 *
 *   2) **외부 자산은 언젠가 반드시 실패한다.**
 *      GLB는 남의 서버(readyplayer.me)에서 옵니다. 언젠가 못 받습니다.
 *      그때 화면이 비면 안 되므로, 실패하면 이 파일 안에서 직접 만든
 *      3D 얼굴로 자동 전환합니다. 폴백도 립싱크·눈깜빡임 전부 됩니다.
 *
 *   3) **아바타 문제로 영어 대화가 막히면 안 된다.**
 *      여기서 무슨 일이 나든 예외를 밖으로 던지지 않습니다.
 *
 * 인터페이스 (PhotoAvatar / SimliAvatar 와 동일):
 *   await mount(container)
 *   pushAudio(pcm16)        // 3D 모드는 player의 analyser를 쓰므로 no-op
 *   interrupt()
 *   setState('idle'|'listening'|'thinking'|'speaking')
 *   unmount()
 *   get usesLocalAudio()    // true — 소리는 우리 재생기가 냅니다
 * ----------------------------------------------------------------------------
 */

/* 얼굴 조각은 avatarFace.js 가 전담합니다. 이 파일은 조명·카메라·움직임만
   맡습니다. (한 파일에 다 넣었더니 900줄이 넘어가고 어디를 고쳐야 하는지
   찾을 수가 없었습니다.) */
import { buildFace, MORPH, JAW_ANGLE } from './avatarFace.js';

/* ═══════════════════════════════════════════════════════════════════════════
   Three.js 로딩

   ESM CDN에서 가져옵니다. 여러 곳을 순서대로 시도하는 이유는, CDN 하나가
   막히거나(사내망·학교망) 느릴 때 앱 전체가 얼굴 없이 시작되는 걸 막기 위함입니다.
   ═══════════════════════════════════════════════════════════════════════════ */

const THREE_VERSION = '0.185.1';

let threeModulePromise = null;

/**
 * three + GLTFLoader 를 한 번만 로드해서 재사용합니다.
 *
 * 두 가지 경로를 순서대로 시도합니다.
 *
 *  1) import map 경로 — index.html 의 <script type="importmap"> 이
 *     'three' 와 'three/addons/' 를 실제 주소로 바꿔줍니다.
 *     three.js 공식 문서가 권하는 방식이고 가장 안전합니다.
 *
 *  2) esm.sh 경로 — import map 이 없거나(다른 페이지에 붙였을 때) jsdelivr 이
 *     막혔을 때를 위한 예비책입니다. esm.sh 는 맨 이름(bare specifier)을
 *     자기가 알아서 풀어주므로 import map 없이도 동작합니다.
 *
 * 둘 다 실패하면 호출한 쪽에서 직접 만든 폴백 얼굴로 넘어갑니다.
 *
 * ⚠️ 두 경로에서 서로 다른 three 인스턴스를 섞으면 안 됩니다.
 *    ("Multiple instances of Three.js" 경고 + instanceof 검사가 깨집니다)
 *    그래서 한 경로가 성공하면 그 경로의 THREE 와 GLTFLoader 만 씁니다.
 */
function loadThree() {
  if (threeModulePromise) return threeModulePromise;

  threeModulePromise = (async () => {
    const attempts = [
      {
        name: 'importmap',
        run: async () => {
          const THREE = await import('three');
          const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
          return { THREE, GLTFLoader };
        },
      },
      {
        name: 'esm.sh',
        run: async () => {
          const base = `https://esm.sh/three@${THREE_VERSION}`;
          const THREE = await import(/* @vite-ignore */ base);
          const { GLTFLoader } = await import(
            /* @vite-ignore */ `${base}/examples/jsm/loaders/GLTFLoader.js`
          );
          return { THREE, GLTFLoader };
        },
      },
    ];

    let lastErr = null;
    for (const a of attempts) {
      try {
        const mod = await a.run();
        if (!mod?.THREE || !mod?.GLTFLoader) throw new Error('모듈이 비어 있습니다');
        return mod;
      } catch (err) {
        lastErr = err;
        console.warn(`[avatar3d] three 로드 실패 (${a.name}):`, err?.message || err);
      }
    }
    throw lastErr || new Error('three.js 를 불러오지 못했습니다');
  })();

  return threeModulePromise;
}

/* ═══════════════════════════════════════════════════════════════════════════
   비세임(입 모양) 정의

   Ready Player Me 아바타는 Oculus Viseme 15종을 모프타겟으로 갖고 있습니다.
   우리는 오디오만 갖고 있으므로 음소를 정확히 알 수 없습니다. 대신
   **음량 + 스펙트럼 무게중심**으로 "지금 입이 얼마나 벌어져 있고 얼마나
   옆으로 퍼져 있는가"를 추정해서 몇 개의 대표 입모양을 섞습니다.

   정확한 음소 단위 립싱크는 아니지만, 사람 눈에는 충분히 말하는 것으로
   보입니다. 중요한 건 **타이밍**이지 음소 정확도가 아니기 때문입니다.
   (그리고 타이밍은 실제 스피커 출력에서 재므로 절대 어긋나지 않습니다.)
   ═══════════════════════════════════════════════════════════════════════════ */

/** 넓은 입(이·에 계열) — 스펙트럼 무게중심이 높을 때 */
const VIS_WIDE = ['viseme_I', 'viseme_E'];
/** 둥근 입(오·우 계열) — 무게중심이 낮을 때 */
const VIS_ROUND = ['viseme_O', 'viseme_U'];
/** 크게 벌린 입(아 계열) — 음량이 클 때 */
const VIS_OPEN = ['viseme_aa'];
/** 마찰음(스·프 계열) — 무게중심이 아주 높고 음량이 작을 때 */
const VIS_FRIC = ['viseme_SS', 'viseme_FF'];
/** 다문 입 */
const VIS_SIL = ['viseme_sil', 'viseme_PP'];

/* ═══════════════════════════════════════════════════════════════════════════
   유틸
   ═══════════════════════════════════════════════════════════════════════════ */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
/** 지수이동평균 — 이게 없으면 입이 프레임마다 덜덜 떱니다. */
const ema = (prev, next, a) => prev + (next - prev) * a;

/** 주기가 서로 안 맞는 사인파를 겹칩니다. 규칙적으로 안 보이게 하는 핵심. */
function noise2(t, s1, s2) {
  return Math.sin(t * s1) * 0.6 + Math.sin(t * s2 + 1.7) * 0.4;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ThreeAvatar
   ═══════════════════════════════════════════════════════════════════════════ */

export class ThreeAvatar {
  /**
   * @param {object} opts
   * @param {() => number} opts.getLevel        0~1 현재 음량 (player.getLevel)
   * @param {() => number} opts.getMouthWidth   0~1 입 넓이 추정 (player.getMouthWidth)
   * @param {string} [opts.modelUrl]            GLB 주소. 없으면 기본 후보들을 시도
   * @param {(note: string) => void} [opts.onNote]
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.state = 'idle';

    this.container = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = null;
    this.raf = 0;
    this._disposed = false;

    /** 모프타겟을 가진 메시들 (얼굴·치아·혀) */
    this.morphMeshes = [];
    /** 이름 → [{mesh, index}] 캐시. 매 프레임 문자열 조회를 피합니다. */
    this.morphIndex = new Map();

    this.head = null;      // 머리 본
    this.neck = null;
    this.spine = null;
    this.leftEye = null;
    this.rightEye = null;

    /** 부드럽게 따라가는 값들 */
    this.sLevel = 0;
    this.sWidth = 0.5;
    this.sOpen = 0;

    /** 눈 깜빡임 스케줄 */
    this.nextBlinkAt = 0;
    this.blinkStart = -1;
    /** 두 번 연속 깜빡임(사람은 가끔 그럽니다) */
    this.blinkTwice = false;

    /** 눈동자 사케이드 목표 */
    this.gaze = { x: 0, y: 0, tx: 0, ty: 0, nextAt: 0 };

    /** 듣는 중 고개 끄덕임 */
    this.nodPhase = 0;
    this.nodStrength = 0;

    this.usingFallback = false;
  }

  get usesLocalAudio() { return true; }

  /* ───────────────────────────────────────────────────────────────────────
     mount
     ─────────────────────────────────────────────────────────────────────── */

  async mount(container) {
    this.container = container;
    this._disposed = false;

    const { THREE, GLTFLoader } = await loadThree();
    this.THREE = THREE;
    if (this._disposed) return;

    const rect = container.getBoundingClientRect();
    const W = Math.max(240, Math.round(rect.width || 360));
    const H = Math.max(240, Math.round(rect.height || W * 4 / 3));

    /* --- 렌더러 ------------------------------------------------------- */
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    // 휴대폰에서 픽셀비를 그대로 쓰면 열이 나고 배터리가 빨리 닳습니다.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.domElement.className = 'avatar-canvas avatar-canvas-3d';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    /* --- 장면 · 카메라 ------------------------------------------------- */
    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
    this.camera = camera;

    /* --- 조명 ---------------------------------------------------------
       영상통화처럼 보이게 하는 3점 조명.
       키라이트를 살짝 옆에서 주면 코와 광대에 그림자가 생겨 입체감이 삽니다.
       정면에서만 비추면 얼굴이 납작해 보입니다.                          */
    /* ⚠️ 예전 값(반구 1.4 + 키 2.1 + 필 0.7 + 림 1.5)은 **너무 밝아서**
          얼굴이 하얗게 날아갔습니다. 코와 광대의 그림자가 사라져서
          이목구비가 안 보이고 석고상처럼 보였습니다. 총량을 절반쯤으로
          줄이고, 키라이트를 더 옆으로 옮겨 그림자를 만듭니다. */
    scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3140, 0.55));

    const key = new THREE.DirectionalLight(0xfff1dd, 1.25);
    key.position.set(1.6, 1.1, 2.0);
    scene.add(key);

    /* 아래에서 올라오는 아주 약한 반사광.
       인물 사진에서 반사판을 대는 것과 같습니다. 이게 없으면 코 밑과
       턱 아래가 까맣게 죽어서 얼굴이 초췌해 보입니다. */
    const bounce = new THREE.DirectionalLight(0xffd9c0, 0.42);
    bounce.position.set(0, -1.8, 1.6);
    scene.add(bounce);

    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.38);
    fill.position.set(-2.0, 0.2, 1.6);
    scene.add(fill);

    // 림라이트: 머리 윤곽을 배경에서 떼어냅니다. 이게 있으면 확 삽니다.
    const rim = new THREE.DirectionalLight(0xb9cdff, 0.75);
    rim.position.set(-0.8, 1.5, -2.2);
    scene.add(rim);

    // THREE.Clock 은 최신 버전에서 deprecated 입니다(콘솔 경고). 필요한 건
    // 경과시간과 프레임 간격뿐이라 직접 잽니다 — 의존성도 줄어듭니다.
    this._t0 = performance.now();
    this._lastFrameAt = this._t0;

    /* --- 모델 ----------------------------------------------------------
       ⚠️ 2026-08-19 로 바뀐 정책: **직접 만든 얼굴이 기본**입니다.
          예전에는 readyplayer.me 에서 GLB 를 먼저 받아보고, 실패하면
          폴백 얼굴을 썼습니다. 그런데 실제로는 **한 번도 성공한 적이
          없었고**(목사님 화면에 늘 폴백이 떴습니다), 대신 시작할 때마다
          20초 × 2번을 기다렸습니다. 얼굴이 나오기까지 40초가 걸린 겁니다.

          이제 avatarFace.js 가 만드는 얼굴이 충분히 좋으므로, 주소를
          **명시적으로 넣었을 때만** 남의 서버를 부릅니다. 기본 경로에는
          네트워크가 아예 끼지 않습니다. */
    let loaded = false;
    if (this.opts.modelUrl) {
      try {
        await this._loadGlb(GLTFLoader, this.opts.modelUrl);
        loaded = true;
      } catch (err) {
        console.warn('[avatar3d] 모델 로드 실패:', this.opts.modelUrl, err?.message || err);
        this.opts.onNote?.('넣어주신 아바타 주소를 못 읽어서 기본 얼굴로 표시합니다.');
      }
    }

    if (this._disposed) return;

    if (!loaded) {
      this.usingFallback = true;
      this._buildFallbackHead();
    }

    this._frameCamera();
    this._observeResize();
    this._loop();
  }

  /* ───────────────────────────────────────────────────────────────────────
     GLB 로드
     ─────────────────────────────────────────────────────────────────────── */

  async _loadGlb(GLTFLoader, url) {
    const THREE = this.THREE;
    const loader = new GLTFLoader();

    const gltf = await new Promise((resolve, reject) => {
      // 네트워크가 느릴 때 영원히 매달리지 않도록 자체 타임아웃을 겁니다.
      // (GLTFLoader 자체에는 타임아웃이 없습니다.)
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        reject(new Error('모델 다운로드 시간 초과(20초)'));
      }, 20000);

      loader.load(
        url,
        (g) => { if (!done) { done = true; clearTimeout(timer); resolve(g); } },
        undefined,
        (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } }
      );
    });

    if (this._disposed) return;

    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;   // 모프로 움직이면 잘리는 일이 있습니다
        if (o.morphTargetDictionary) {
          this.morphMeshes.push(o);
        }
        // 피부가 너무 번들거리면 인형처럼 보입니다.
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (m && typeof m.roughness === 'number') {
              m.roughness = clamp(m.roughness, 0.55, 1);
            }
          });
        }
      }
      const n = (o.name || '').toLowerCase();
      if (!this.head && n === 'head') this.head = o;
      if (!this.neck && n === 'neck') this.neck = o;
      if (!this.spine && (n === 'spine2' || n === 'spine1')) this.spine = o;
      if (!this.leftEye && (n === 'lefteye' || n === 'eyeleft')) this.leftEye = o;
      if (!this.rightEye && (n === 'righteye' || n === 'eyeright')) this.rightEye = o;
    });

    this.scene.add(root);
    this.model = root;
    this._indexMorphs();
  }

  /** 모프 이름 → 어느 메시의 몇 번 인덱스인지 미리 찾아둡니다. */
  _indexMorphs() {
    this.morphIndex.clear();
    for (const mesh of this.morphMeshes) {
      const dict = mesh.morphTargetDictionary || {};
      for (const name of Object.keys(dict)) {
        const key = name.toLowerCase();
        if (!this.morphIndex.has(key)) this.morphIndex.set(key, []);
        this.morphIndex.get(key).push({ mesh, index: dict[name] });
      }
    }
  }

  /** 모프타겟 값 설정 (없는 이름은 조용히 무시) */
  _setMorph(name, value) {
    const entries = this.morphIndex.get(String(name).toLowerCase());
    if (!entries) return false;
    const v = clamp(value, 0, 1);
    for (const { mesh, index } of entries) {
      if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = v;
    }
    return true;
  }

  /** 여러 후보 이름 중 존재하는 것에 값을 넣습니다. */
  _setMorphAny(names, value) {
    let hit = false;
    for (const n of names) {
      if (this._setMorph(n, value)) hit = true;
    }
    return hit;
  }

  /* ───────────────────────────────────────────────────────────────────────
     폴백 얼굴 — CDN/모델이 죽어도 여기서 직접 만듭니다.
     사실적이진 않지만 립싱크·눈깜빡임·고개움직임이 전부 동작합니다.
     ─────────────────────────────────────────────────────────────────────── */

  _buildFallbackHead() {
    /* 얼굴 조립은 전부 avatarFace.js 가 합니다.
       여기서는 받아온 부품을 애니메이션 루프가 아는 이름에 걸어둡니다. */
    const face = buildFace(this.THREE, this.opts.look || {});
    this.scene.add(face.root);

    this.model = face.root;
    this._fb = face;
    this._fbHead = face.headGroup;
    this.head = face.headGroup;       // 고개 흔들림이 여기 걸립니다
    this.neck = null;                  // 목은 따로 안 돌립니다(어깨가 휘둘립니다)
    this.spine = face.bodyGroup;       // 호흡만 아주 미세하게
    this._fbEyes = face.eyes;
    this._fbLids = face.lids;
    this._fbBrows = face.brows;
  }

  /* ───────────────────────────────────────────────────────────────────────
     카메라 — 얼굴이 화면에 꽉 차게 (영상통화처럼)
     ─────────────────────────────────────────────────────────────────────── */

  _frameCamera() {
    const THREE = this.THREE;
    if (!this.model) return;

    if (this.usingFallback) {
      // 얼굴이 꽉 차되 어깨가 아래쪽에 살짝 걸치는 거리 (영상통화 구도).
      this.camera.position.set(0, 0.02, 5.7);
      this.camera.lookAt(0, -0.12, 0);
      return;
    }

    // Ready Player Me 모델은 발이 원점, 키 약 1.7m 입니다.
    // 머리 본이 있으면 그 위치를 그대로 씁니다 — 모델마다 키가 달라도 맞습니다.
    const target = new THREE.Vector3();
    if (this.head) {
      this.head.getWorldPosition(target);
    } else {
      const box = new THREE.Box3().setFromObject(this.model);
      target.set((box.min.x + box.max.x) / 2, box.max.y - 0.15, 0);
    }

    // 눈높이보다 아주 살짝 위에서 보면 친근해 보입니다.
    this.camera.position.set(target.x + 0.02, target.y + 0.045, target.z + 0.62);
    this.camera.lookAt(target.x, target.y + 0.01, target.z);
    this._camTarget = target.clone();
  }

  _observeResize() {
    if (typeof ResizeObserver === 'undefined') return;
    this._ro = new ResizeObserver(() => {
      if (!this.renderer || !this.container || this._disposed) return;
      const r = this.container.getBoundingClientRect();
      const W = Math.max(200, Math.round(r.width || 360));
      const H = Math.max(200, Math.round(r.height || W * 4 / 3));
      this.renderer.setSize(W, H, false);
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
    });
    this._ro.observe(this.container);
  }

  /* ───────────────────────────────────────────────────────────────────────
     상태
     ─────────────────────────────────────────────────────────────────────── */

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    // 들을 때는 고개를 조금 끄덕여 줍니다 (사람이 듣는 티를 내는 방식)
    if (state === 'listening') {
      this.nodStrength = 1;
      this.nodPhase = 0;
    } else {
      this.nodStrength = 0;
    }
    // 생각할 때는 시선을 살짝 위로 돌립니다
    if (state === 'thinking') {
      this.gaze.tx = 0.35;
      this.gaze.ty = 0.45;
      this.gaze.nextAt = performance.now() + 900;
    }
  }

  /** 3D 모드는 실제 스피커 출력을 재므로 PCM을 따로 받을 필요가 없습니다. */
  pushAudio() { /* no-op */ }

  interrupt() {
    this.sLevel = 0;
    this.sOpen = 0;
  }

  /* ───────────────────────────────────────────────────────────────────────
     렌더 루프
     ─────────────────────────────────────────────────────────────────────── */

  _loop() {
    if (this._disposed) return;
    this.raf = requestAnimationFrame(() => this._loop());

    const now = performance.now();
    // 탭이 백그라운드에 갔다 오면 간격이 몇 초씩 튑니다. 상한을 걸어서
    // 고개가 갑자기 홱 돌아가는 걸 막습니다.
    const dt = Math.min(0.05, (now - this._lastFrameAt) / 1000);
    this._lastFrameAt = now;
    const t = (now - this._t0) / 1000;

    const speaking = this.state === 'speaking';

    /* --- 1. 오디오 → 입 -------------------------------------------------
       음량과 스펙트럼을 그대로 쓰면 덜덜 떨립니다. 지수이동평균으로
       부드럽게 만들되, **열 때는 빠르게 닫을 때는 느리게** 합니다.
       사람 입이 실제로 그렇게 움직이기 때문입니다.                        */
    const rawLevel = speaking ? (this.opts.getLevel?.() ?? 0) : 0;
    const rawWidth = speaking ? (this.opts.getMouthWidth?.() ?? 0.5) : 0.5;

    const openSpeed = rawLevel > this.sLevel ? 0.55 : 0.18;
    this.sLevel = ema(this.sLevel, rawLevel, openSpeed);
    this.sWidth = ema(this.sWidth, rawWidth, 0.18);

    const level = this.sLevel;
    const width = this.sWidth;

    if (this.usingFallback) {
      this._animateFallback(t, now, level, width, speaking);
    } else {
      this._animateMorphs(t, now, level, width, speaking);
    }

    /* --- 2. 고개 · 몸 --------------------------------------------------
       주기가 서로 다른 사인파를 겹쳐서 규칙적으로 안 보이게 합니다.
       말할 때는 조금 더 크게 움직입니다 (사람은 말할 때 고개를 씁니다).   */
    const amp = speaking ? 1.0 : 0.55;
    const headYaw = noise2(t, 0.31, 0.13) * 0.055 * amp;
    const headPitch = noise2(t + 11, 0.23, 0.17) * 0.035 * amp;
    const headRoll = noise2(t + 23, 0.19, 0.29) * 0.028 * amp;

    // 듣는 중 끄덕임 (한 번 크게, 그다음 잦아듦)
    let nod = 0;
    if (this.nodStrength > 0.001) {
      this.nodPhase += dt * 4.2;
      nod = Math.sin(this.nodPhase) * 0.05 * this.nodStrength;
      this.nodStrength *= Math.pow(0.35, dt);   // 서서히 잦아듦
    }

    // 호흡 — 아주 미세해야 합니다. 크면 숨 가빠 보입니다.
    const breath = Math.sin(t * 0.85) * 0.006;

    if (this.head) {
      this.head.rotation.y = headYaw;
      this.head.rotation.x = headPitch + nod + breath;
      this.head.rotation.z = headRoll;
    }
    if (this.neck) {
      // 목은 머리의 절반만 따라갑니다. 안 그러면 목이 꺾여 보입니다.
      this.neck.rotation.y = headYaw * 0.45;
      this.neck.rotation.x = headPitch * 0.4;
    }
    if (this.spine) {
      this.spine.rotation.x = breath * 1.6;
    }

    /* --- 3. 눈 깜빡임 ---------------------------------------------------
       사람은 2~6초에 한 번, 100~150ms 동안 깜빡입니다.
       가끔 두 번 연속으로 깜빡이는 걸 넣으면 훨씬 자연스럽습니다.         */
    if (this.nextBlinkAt === 0) this.nextBlinkAt = now + 800 + Math.random() * 2000;

    let blink = 0;
    if (this.blinkStart >= 0) {
      const p = (now - this.blinkStart) / 130;
      if (p >= 1) {
        this.blinkStart = -1;
        if (this.blinkTwice) {
          this.blinkTwice = false;
          this.nextBlinkAt = now + 90;         // 곧바로 한 번 더
        } else {
          this.nextBlinkAt = now + 1800 + Math.random() * 4200;
        }
      } else {
        // 0→1→0 (닫혔다 열림)
        blink = Math.sin(p * Math.PI);
      }
    } else if (now >= this.nextBlinkAt) {
      this.blinkStart = now;
      this.blinkTwice = Math.random() < 0.22;
    }

    /* --- 4. 눈동자 사케이드 --------------------------------------------
       시선이 완전히 고정되어 있으면 죽은 눈처럼 보입니다.
       듣는 중에는 상대(카메라)를 보되 아주 미세하게만 흔들고,
       생각할 때는 크게 옆/위로 돌립니다.                                  */
    if (now >= this.gaze.nextAt) {
      const wide = this.state === 'thinking' ? 0.55 : 0.16;
      this.gaze.tx = (Math.random() * 2 - 1) * wide;
      this.gaze.ty = (Math.random() * 2 - 1) * wide * 0.6;
      this.gaze.nextAt = now + (this.state === 'thinking' ? 700 : 1200)
        + Math.random() * 1800;
    }
    this.gaze.x = ema(this.gaze.x, this.gaze.tx, 0.12);
    this.gaze.y = ema(this.gaze.y, this.gaze.ty, 0.12);

    this._applyEyes(blink, speaking, level);

    this.renderer.render(this.scene, this.camera);
  }

  /* ───────────────────────────────────────────────────────────────────────
     모프타겟 애니메이션 (Ready Player Me 등 정식 아바타)
     ─────────────────────────────────────────────────────────────────────── */

  _animateMorphs(t, now, level, width, speaking) {
    // 모든 비세임을 매 프레임 0으로 리셋 (안 하면 잔상이 남아 입이 굳습니다)
    for (const names of [VIS_WIDE, VIS_ROUND, VIS_OPEN, VIS_FRIC, VIS_SIL]) {
      for (const n of names) this._setMorph(n, 0);
    }

    if (speaking && level > 0.02) {
      // 턱은 음량에 직접 비례
      const jaw = clamp(level * 0.85, 0, 0.85);
      this._setMorph('jawOpen', jaw);

      // 입 모양은 음량 + 스펙트럼으로 섞습니다
      const openW = clamp(level * 1.2, 0, 1);          // 얼마나 크게 벌렸나
      const wide = clamp(width, 0, 1);                  // 얼마나 옆으로 폈나

      if (level < 0.12 && width > 0.7) {
        // 작고 높은 소리 → 마찰음
        this._setMorphAny(VIS_FRIC, 0.55);
      } else {
        this._setMorphAny(VIS_OPEN, openW * 0.75);
        this._setMorphAny(VIS_WIDE, wide * openW * 0.7);
        this._setMorphAny(VIS_ROUND, (1 - wide) * openW * 0.7);
      }

      // 말할 때 입꼬리가 조금 올라가면 훨씬 친근해 보입니다
      this._setMorph('mouthSmile', 0.12 + level * 0.10);
      // 강세가 실릴 때 눈썹이 살짝 올라감 — 이게 표정을 만듭니다
      this._setMorph('browInnerUp', clamp((level - 0.25) * 0.9, 0, 0.35));
    } else {
      this._setMorph('jawOpen', 0.02 + Math.sin(t * 0.9) * 0.008);
      this._setMorphAny(VIS_SIL, 0.25);
      // 쉬는 표정: 아주 옅은 미소
      this._setMorph('mouthSmile', this.state === 'listening' ? 0.22 : 0.14);
      this._setMorph('browInnerUp', this.state === 'thinking' ? 0.30 : 0.05);
    }
  }

  _applyEyes(blink, speaking, level) {
    if (this.usingFallback) {
      /* 눈꺼풀은 눈알과 같은 중심을 **회전**합니다(평행이동이 아닙니다).
         0 = 뜬 상태, 1 = 감은 상태. */
      this._fbLids?.forEach((lid) => {
        lid.upper.rotation.x = lid.upOpen + (lid.upShut - lid.upOpen) * blink;
        lid.lower.rotation.x = lid.loOpen + (lid.loShut - lid.loOpen) * blink;
      });
      // 눈동자 이동
      this._fbEyes?.forEach((eye) => {
        eye.rotation.y = this.gaze.x * 0.30;
        eye.rotation.x = -this.gaze.y * 0.24;
      });
      /* 눈썹은 **위아래로만** 움직입니다.
         눈썹 덩어리들이 머리 원점 기준 절대좌표에 놓여 있어서, 그룹을
         회전시키면 얼굴 반대편까지 휘둘려 날아갑니다. */
      this._fbBrows?.forEach((brow) => {
        brow.group.position.y =
          (speaking ? level * 0.026 : 0) +
          (this.state === 'thinking' ? 0.045 : 0);
      });
      return;
    }

    this._setMorph('eyeBlinkLeft', blink);
    this._setMorph('eyeBlinkRight', blink);

    // 눈동자: 모프가 있으면 모프로, 눈 본이 있으면 회전으로
    const gx = this.gaze.x, gy = this.gaze.y;
    const usedMorph =
      this._setMorph('eyeLookOutLeft', clamp(-gx, 0, 1)) |
      this._setMorph('eyeLookInLeft', clamp(gx, 0, 1)) |
      this._setMorph('eyeLookOutRight', clamp(gx, 0, 1)) |
      this._setMorph('eyeLookInRight', clamp(-gx, 0, 1)) |
      this._setMorph('eyeLookUpLeft', clamp(gy, 0, 1)) |
      this._setMorph('eyeLookUpRight', clamp(gy, 0, 1)) |
      this._setMorph('eyeLookDownLeft', clamp(-gy, 0, 1)) |
      this._setMorph('eyeLookDownRight', clamp(-gy, 0, 1));

    if (!usedMorph) {
      if (this.leftEye) {
        this.leftEye.rotation.y = gx * 0.26;
        this.leftEye.rotation.x = -gy * 0.20;
      }
      if (this.rightEye) {
        this.rightEye.rotation.y = gx * 0.26;
        this.rightEye.rotation.x = -gy * 0.20;
      }
    }
  }

  _animateFallback(t, now, level, width, speaking) {
    const face = this._fb;
    if (!face) return;

    let jaw, wide, round, smile;
    if (speaking && level > 0.02) {
      jaw = clamp(level * 1.15, 0, 1);
      const w = clamp(width, 0, 1);
      wide = w * jaw * 0.90;            // 이·에 계열
      round = (1 - w) * jaw * 0.85;     // 오·우 계열
      smile = 0.22 + level * 0.12;
    } else {
      // 쉴 때도 아주 미세하게 움직여야 '정지 화면'으로 안 보입니다
      jaw = 0.015 + Math.sin(t * 0.9) * 0.010;
      wide = 0;
      round = 0;
      // 기본 표정은 **옅은 미소**입니다. 무표정이면 아이들이 무서워합니다.
      smile = this.state === 'listening' ? 0.44 : 0.30;
    }

    this._fbJaw = ema(this._fbJaw ?? 0, jaw, speaking ? 0.5 : 0.12);
    this._fbWide = ema(this._fbWide ?? 0, wide, 0.25);
    this._fbRound = ema(this._fbRound ?? 0, round, 0.25);
    this._fbSmile = ema(this._fbSmile ?? 0.30, smile, 0.06);

    /* ⚠️ setMorph 를 써야 합니다. 피부와 입술은 **다른 메시**라서,
          한쪽만 바꾸면 턱은 벌어지는데 입술은 다문 채로 남습니다. */
    face.setMorph(MORPH.JAW, this._fbJaw);
    face.setMorph(MORPH.WIDE, this._fbWide);
    face.setMorph(MORPH.ROUND, this._fbRound);
    face.setMorph(MORPH.SMILE, this._fbSmile);

    // 혀는 턱과 함께 내려갑니다
    face.jawGroup.rotation.x = JAW_ANGLE * this._fbJaw;
  }

  /* ───────────────────────────────────────────────────────────────────────
     정리
     ─────────────────────────────────────────────────────────────────────── */

  unmount() {
    this._disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this._ro?.disconnect();
    this._ro = null;

    // GPU 메모리는 자동으로 안 돌아옵니다. 명시적으로 놓아줘야
    // 프로필을 여러 번 바꾸면 결국 렌더링이 죽습니다.
    try {
      this.scene?.traverse((o) => {
        if (o.isMesh) {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            for (const k of Object.keys(m)) {
              const v = m[k];
              if (v && v.isTexture) v.dispose?.();
            }
            m.dispose?.();
          });
        }
      });
      this.renderer?.dispose?.();
      this.renderer?.forceContextLoss?.();
    } catch (e) {
      console.warn('[avatar3d] 정리 중 오류', e);
    }

    this.renderer?.domElement?.remove();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.model = null;
    this.morphMeshes = [];
    this.morphIndex.clear();
    this.head = this.neck = this.spine = null;
    this.leftEye = this.rightEye = null;
    this.container = null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   기본 모델 후보

   Ready Player Me 아바타. morphTargets 파라미터로 비세임과 ARKit 표정을
   같이 받아야 립싱크와 눈깜빡임이 됩니다. 이게 빠지면 얼굴이 굳습니다.

   목사님이 직접 만드신 아바타를 쓰시려면 readyplayer.me 에서 만든 뒤
   설정에서 GLB 주소를 넣으시면 됩니다. 가족마다 다른 얼굴도 됩니다.
   ═══════════════════════════════════════════════════════════════════════════ */

const MORPH_QS = 'morphTargets=Oculus%20Visemes,ARKit&textureAtlas=1024&lod=1';

export const DEFAULT_MODEL_URLS = [
  `https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb?${MORPH_QS}`,
  `https://models.readyplayer.me/6460691aa25b2e9f19ba0b6a.glb?${MORPH_QS}`,
];

/** 사용자가 넣은 주소에 morphTargets 파라미터가 빠졌으면 붙여줍니다. */
export function normalizeAvatarUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const u = url.trim();
  if (!/^https:\/\/.+\.glb(\?.*)?$/i.test(u)) return null;
  if (/morphTargets=/i.test(u)) return u;
  return u + (u.includes('?') ? '&' : '?') + MORPH_QS;
}
