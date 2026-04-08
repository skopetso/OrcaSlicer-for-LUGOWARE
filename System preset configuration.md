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

---

## Build 77 시스템 프리셋 대규모 교체 (2026-04-09)

### 작업 목표
유저프리셋(`D:\Claude\Appendix\slicer plus\Preset\0408 1차\`)의 오버라이드 값을
기존 시스템프리셋에 머지하여 완전한 standalone base 프리셋으로 교체.
필라멘트 16개 + 프로세스 11개.

### 머지 방식
1. 유저프리셋 JSON에서 `inherits` 필드로 베이스 시스템프리셋 특정
2. 시스템프리셋(베이스) 전체 로드 + 유저프리셋 오버라이드 값 덮어쓰기
3. `inherits` 제거, `from: "system"`, 이름을 유저프리셋 파일명 기준으로 설정
4. `setting_id` / `filament_id` / `name` / `filament_settings_id[0]` (또는 `print_settings_id`) 일치시킴
5. `compatible_printers: []` (전체 프린터 호환)
6. 결과물을 `0408 1차\merged\` 폴더에 백업 보관

### 이름 변경 (구이름 → 신이름)

#### 필라멘트
- `1.75 PHANTOM-BONE` → `1.75 BONE_phantom`
- `1.75 PHANTOM-FAT` → `1.75 FAT_phantom`
- `1.75 PHANTOM-SKIN` → `1.75 SKIN_phantom`
- `1.75 PHANTOM-TISSUE` → `1.75 TISSUE_phantom`
- `1.75 TPU 85A Generic` → `1.75 TPU 83A Generic` / `1.75 TPU 95A Generic` (분리)
- 신규: `2.85 TPU 80A` (기존 `2.85 TPU 70A` 베이스)

#### 프로세스
- `FLEXIBLE(0.25)` → `TPU(0.25)`
- `FOAMING TPU(0.25)` → `FOAM(0.25)`
- `0.4 Support + FLEXIBLE(0.25)` → `0.4 Support + TPU(0.25)`
- `0.4 Support + FOAMING TPU(0.25)` → `0.4 Support + FOAM(0.25)`

### 변경 파일 목록

#### LUGOWARE.json
- `version`: `02.05.00.00` → `02.05.01.00` (벤더 프로파일 버전, 앱 버전과 별개)
- `filament_list`: `[]` → 16개 명시적 등록 (auto-scan 안 됨, 명시 등록 필수)
- `process_list`: 구이름 4개 → 신이름으로 교체
- sub_path: `filament/Generic/xxx.json` 형식

#### 필라멘트 프리셋 (16개)
- 위치: `resources/profiles/LUGOWARE/filament/Generic/`
- 1.75mm (12개): LPLA, PLA Generic, PETG Generic, PVA Generic, Foaming TPU, TPU 83A Generic, TPU 95A Generic, TPU D Generic, BONE_phantom, FAT_phantom, SKIN_phantom, TISSUE_phantom
- 2.85mm (4개): Foaming TPU, TPU 60A, TPU 70A, TPU 80A

#### 프로세스 프리셋 (11개 + common 1개)
- 위치: `resources/profiles/LUGOWARE/process/`
- STANDARD(0.2), STANDARD_DRAFT(0.28), STRONG PARTS(0.2), STRONGEST PARTS(0.25), TPU(0.25), FOAM(0.25)
- 0.4 Support + STANDARD(0.2), 0.4 Support + STRONG PARTS(0.2), 0.4 Support + STRONGEST PARTS(0.2), 0.4 Support + TPU(0.25), 0.4 Support + FOAM(0.25)
- fdm_process_lugoware_common.json (베이스, 삭제하면 안 됨)

#### 머신 프리셋 (FLEX4 M/L/W.json)
- `default_materials`: 구이름 → 현재 16개 필라멘트 이름으로 교체

#### OrcaFilamentLibrary
- OrcaFilamentLibrary.json에서 Lugoware 벤더 항목 8개 제거
- OrcaFilamentLibrary/filament/ 에서 Lugoware 파일 8개 삭제
- **Lugoware 필라멘트는 LUGOWARE 벤더에만 등록. OrcaFilamentLibrary에 중복 등록하면 안 됨**

### 삽질 기록 및 교훈

#### 1. AppData 캐시 우선 적용 문제
- 오르카는 `resources/profiles/`가 아니라 `%APPDATA%/LugowareOrcaSlicer/system/`을 우선 로드
- resources → AppData 자동 복사는 **LUGOWARE.json 버전이 올라갔을 때만** 발생
- **해결**: LUGOWARE.json 버전을 올리면 앱이 시작할 때 자동으로 resources → AppData 복사
- **교훈**: resources만 바꾸고 버전 안 올리면 AppData 캐시가 계속 우선 적용됨

#### 2. filament_list auto-scan 안 됨
- `filament_list: []`로 두면 폴더 자동 스캔 안 함
- 코드상 명시적으로 filament_list에 등록된 것만 로드 (PresetBundle.cpp:3853-4271)
- **교훈**: filament_list와 process_list에 반드시 명시적 등록 필요

#### 3. OrcaFilamentLibrary 중복 등록
- Build 64에서 OrcaFilamentLibrary에 넣었다가 LUGOWARE로 옮겼는데, 구 파일을 안 지움
- OrcaFilamentLibrary 쪽이 LUGOWARE 쪽보다 우선 적용되어 값이 안 바뀌는 것처럼 보임
- **교훈**: 같은 이름 필라멘트가 두 벤더에 있으면 OrcaFilamentLibrary가 우선. 중복 절대 불가

#### 4. user preset 덮어쓰기
- `AppData/user/default/filament/`에 같은 이름 유저프리셋이 있으면 시스템프리셋 위에 덮어씀
- 시스템프리셋 교체 시 동일 이름 유저프리셋 삭제 필요
- **교훈**: 유저프리셋과 시스템프리셋 이름이 같으면 유저프리셋이 항상 우선

#### 5. fdm_process_lugoware_common.json 삭제 사고
- 프로세스 json 전체 삭제 시 common 파일도 같이 삭제됨
- LUGOWARE.json process_list에 등록되어 있어서 없으면 프로세스 전체 로드 실패
- worktree에서 복구함
- **교훈**: `rm *.json` 할 때 common/base 파일 주의

### 프리셋 로딩 구조 (코드 분석)

```
시작 → GUI_App.cpp:3068 load_presets()
  → PresetBundle.cpp:440 load_system_presets_from_json()
    → PresetUpdater.cpp:1095 check_installed_vendor_profiles()
      resources/profiles/ 스캔 → AppData/system/ 버전 비교
      버전 높으면 resources → AppData 복사 (install_bundles_rsrc)
    → PresetBundle.cpp:3766 load_vendor_configs_from_json()
      LUGOWARE.json 파싱 → filament_list/process_list 순회
      sub_path로 파일 로드 (경로: vendor_dir + sub_path)
  → user preset 로드 (AppData/user/default/)
    → 같은 이름이면 시스템프리셋 위에 덮어씀
```

### 테스트 추가 (같은 세션)

#### 프로세스 추가: `0.4 Support + SHOE(0.25)`
- inherits: `0.4 Support + FOAM(0.25)` 베이스
- 오버라이드: `xy_contour_compensation: 0.12`
- LUGOWARE.json process_list에 추가, 버전 02.05.02.00

#### 필라멘트 교체: `1.75 TPU 83A Generic` → `1.75 TPU 85A Generic`
- inherits: `1.75 TPU 83A Generic` 베이스
- 오버라이드: `filament_extruder_variant`
- 83A 파일 삭제 + 85A 파일 생성
- filament_list, default_materials 업데이트

#### 최종 프리셋 수
- 필라멘트: 16개 (83A 삭제, 85A 추가 = 변동 없음)
- 프로세스: 13개 (12 + SHOE 1개 추가)
- LUGOWARE.json 최종 버전: `02.05.02.00`

### 프리셋 변경 시 체크리스트
1. `resources/profiles/LUGOWARE/` 파일 수정
2. `LUGOWARE.json`에 filament_list/process_list 등록 확인
3. LUGOWARE.json `version` 올리기 (AppData 자동 갱신 트리거)
4. `build/OrcaSlicer/resources/profiles/`에 LUGOWARE.json 복사
5. OrcaFilamentLibrary에 동일 이름 중복 없는지 확인
6. AppData user preset에 동일 이름 없는지 확인
7. 머신 프리셋 default_materials 업데이트
8. 재시작하여 확인
