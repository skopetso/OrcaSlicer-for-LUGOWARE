# 필라멘트 시스템 프리셋 작업 기록

## 작업 목표

`D:\Claude\Appendix\slicer plus\Preset\Filament\` 에 있는 유저 프리셋들을
LUGOWARE 시스템 프리셋으로 등록.

---

## 처음에 한 것 (Build 64 — 실패 포함)

### 시도 1: OrcaFilamentLibrary에 넣기
- `resources/profiles/OrcaFilamentLibrary/filament/` 에 JSON 파일 생성
- `OrcaFilamentLibrary.json` `filament_list`에 등록
- `inherits: "fdm_filament_pet"` 같은 OrcaFilamentLibrary base 상속
- **결과**: 슬라이서에서 Lugoware 벤더 분류 안 됨, 프린터 호환 설정이 꼬임

### 시도 2: LUGOWARE.json에 등록 + LUGOWARE/filament/ 에 파일
- `resources/profiles/LUGOWARE/filament/` 에 파일 이동
- `LUGOWARE.json` `filament_list`에 등록
- 베이스 프리셋(`1.75 solid material base`) 만들고 파생 프리셋이 inherits로 참조
- `compatible_printers: []` 로 설정해서 전체 프린터 호환
- **결과**: 슬라이서에서 정상 표시됨 — 이 방식이 맞았음

### 핵심 포인트
- LUGOWARE 필라멘트는 반드시 `LUGOWARE.json`에 등록해야 로드됨
- `OrcaFilamentLibrary.json`은 서드파티 벤더 용도 — Lugoware꺼 넣으면 안 됨
- `LUGOWARE.json` filament_list에 베이스 프리셋을 파생 프리셋보다 먼저 등록해야 inherits가 작동함
- `setting_id` / `filament_id` / `name` / `filament_settings_id[0]` 네 개가 일치해야 함. 하나라도 다르면 저장 시 이름 깨짐

---

## Build 76에서 구조 변경 (다른 대화방)

inherits 체인 방식에서 standalone 방식으로 전환.

- 파일 위치: `LUGOWARE/filament/` → `LUGOWARE/filament/Generic/`
- `LUGOWARE.json` `filament_list`를 비움(`[]`) — 폴더 자동 스캔으로 로드
- `inherits` 제거, 모든 설정 직접 명시
- `setting_id` / `filament_id` 를 `LGFN01` 같은 코드로 통일

---

## 기본값 확정 과정 (Build 66)

처음엔 heating_duration=0, slowdown_distance=70으로 설정했다가
유저 요청으로 heating_duration=7, slowdown_distance=70으로 재수정.

최종 기준값:
- `filament_heating_duration`: 7s
- `filament_toolchange_slowdown_distance`: 70mm
- `filament_toolchange_slowdown_speed_ratio`: 50%
- `filament_toolchange_slowdown_additional_temp`: 5°C (기본값, 소재별 조정)

수정 방법: `py` 스크립트로 14개 파일 일괄 처리.
```
py -c "import json, os; ..."
```
파이썬이 `python3` 명령으로 안 되고 `py` 로 됨 (Windows Python Launcher).
