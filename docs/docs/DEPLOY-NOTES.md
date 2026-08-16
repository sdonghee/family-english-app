# 배포 메모 (v11-live-3d)

> 개발자가 아닌 사람이 나중에 혼자 보고도 알 수 있게 적어둡니다.

## 어느 프로젝트가 진짜인가

Vercel 팀 `shinfam` 안에 이름이 비슷한 프로젝트가 두 개 있습니다.

- **family-english-app-xzo8** ← 실제로 쓰는 것. 이 저장소가 여기에 붙어 있습니다.
- family-english-app ← 예전에 만든 것. 여기 설정을 고쳐도 앱은 안 바뀝니다.

## 꼭 있어야 하는 환경변수

`family-english-app-xzo8` → Settings → Environment Variables

- `GEMINI_API_KEY` : `AIza` 로 시작하는 Google AI Studio 키.
  Production / Preview / Development 세 칸을 **모두** 켜야 합니다.
  하나라도 빠지면 그 환경에서는 값이 없는 것과 똑같습니다.
- `GEMINI_LIVE_MODEL` : 더 이상 안 씁니다. 지워도 됩니다.

**중요 — 값만 저장하면 반영되지 않습니다.** 환경변수는 배포를 만들 때 한 번
박아 넣는 방식이라, 이미 만들어진 배포는 옛날 값을 계속 씁니다.
값을 바꾼 뒤에는 Deployments 탭에서 `···` → **Redeploy** 를 눌러야 합니다.

## 주소가 여러 개인 이유

- 프로덕션(가족들이 쓰는 주소) : `main` 브랜치가 올라갑니다.
- 브랜치별 미리보기 : `...-git-<브랜치이름>-shinfam.vercel.app`
  브랜치마다 고정 주소가 하나씩 생깁니다. 프로덕션을 건드리지 않고
  새 코드를 먼저 시험해 볼 수 있습니다.
  기본적으로 Vercel 로그인이 있어야 열립니다.

## 잘못됐을 때 되돌리는 법

Vercel → Deployments → 예전에 잘 되던 배포 → `···` → **Instant Rollback**.
몇 초 만에 원래대로 돌아갑니다. 코드를 되돌릴 필요가 없습니다.

## 음성이 지금 어떻게 돌아가는가

Gemini Live API(실시간 통화 방식)는 이 계정에서 열리지 않습니다.
서버 기록에 남은 실제 오류:

```
/api/live-token  400
field_mask is invalid for BidiGenerateContentSetup
```

그래서 한 턴씩 주고받는 방식으로 바꿨습니다.

1. 아이가 말합니다 → 브라우저가 녹음합니다
2. `/api/talk` 이 받아쓰고 선생님 대사를 만듭니다
3. `/api/tts` 가 그 대사를 목소리(24kHz PCM)로 만듭니다
4. 3D 아바타 입이 그 소리에 맞춰 움직입니다

`/api/session` 은 통화를 시작할 때 키가 잘못됐는지 먼저 확인해 줍니다.

`web_app/src/liveSession.js` 는 지우지 않았습니다.
Live API 가 열리면 `web_app/app.js` 의 import 한 줄만 되돌리면 됩니다.

## 이 프로젝트의 원칙

**조용한 폴백 금지.** 뭔가 실패해서 다른 방법으로 넘어갔다면
반드시 화면에 보이게 합니다. 조용히 넘어가면 왜 이상한지 아무도 모릅니다.
