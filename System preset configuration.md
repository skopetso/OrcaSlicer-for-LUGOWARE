# LUGOWARE 필라멘트 시스템 프리셋 구성 가이드

> Build 76 기준. "시스템 프리셋 완전 독립화" 이후 구조.

---

## 전체 구조 개요

```
resources/profiles/
├── LUGOWARE.json                           ← LUGOWARE 벤더 인덱스
└── LUGOWARE/
    └── filament/
        └── Generic/                        ← Lugoware 필라멘트 프리셋 폴더 (Build 76~)
            ├── 1.75 LPLA.json
            ├── 1.75 BONE_phantom.json
            ├── 1.75 Foaming TPU.json
            └── ...
```

**Build 76 이전 (Build 64~66)**에는 `LUGOWARE/filament/` 직하에 파일이 있었고, `LUGOWARE.json`의 `filament_list`에 등록해야 했음.

**Build 76 이후** (현재): `LUGOWARE.json`의 `filament_list`는 비어있음 (`[]`). 슬라이서가 vendor 폴더를 스캔해서 자동 로드.

---

## Build 76+ 프리셋 파일 구조

Build 76부터 프리셋은 **완전 독립형(standalone)** — `inherits` 없이 모든 설정을 직접 명시.

### 필수 필드

```json
{
    "type": "filament",
    "name": "1.75 EXAMPLE",
    "from": "system",
    "instantiation": "true",
    "setting_id": "LGFN99",
    "filament_id": "LGFN99",
    "filament_settings_id": ["1.75 EXAMPLE"],
    "filament_vendor": ["Lugoware"],
    "filament_type": ["PLA"],
    "compatible_printers": ["FLEX4 W 0.4 nozzle"],
    "filament_diameter": ["1.75"],
    "nozzle_temperature": ["220"],
    "nozzle_temperature_initial_layer": ["225"],
    ...
}
```

| 필드 | 설명 | 주의 |
|------|------|------|
| `setting_id` | 고유 ID (LGFN + 번호) | `filament_id`와 반드시 동일 |
| `filament_id` | 필라멘트 ID | `setting_id`와 반드시 동일 |
| `filament_settings_id` | 표시 이름 (배열) | `name`과 일치시켜야 함 |
| `name` | 드롭다운 표시 이름 | `filament_settings_id[0]`과 동일 |
| `instantiation` | `"true"` = 선택 가능 | `"false"` = 베이스 전용 (숨겨짐) |
| `from` | `"system"` 고정 | 없으면 user preset으로 취급됨 |
| `filament_vendor` | `["Lugoware"]` | 대소문자 정확히 — 벤더 분류에 사용 |
| `compatible_printers` | 호환 프린터 목록 | `[]`이면 모든 프린터 호환 |

---

## 새 필라멘트 추가 방법 (Build 76+)

### 1. 기존 파일 복사해서 수정

```
resources/profiles/LUGOWARE/filament/Generic/
```

가장 가까운 소재 타입의 기존 파일을 복사 → 이름 변경 → 값 수정.

### 2. 반드시 수정해야 할 필드

- `name` — 표시될 이름 (유일해야 함)
- `filament_settings_id` — `["새 이름"]`
- `setting_id` / `filament_id` — 새 LGFN 번호 (현재 최고번호 + 1)
- `filament_type` — `"PLA"`, `"TPU"`, `"PETG"`, `"Radiopaque"` 등
- `nozzle_temperature` / `nozzle_temperature_initial_layer`
- `filament_diameter` — `"1.75"` 또는 `"2.85"`

### 3. LUGOWARE.json 수정 불필요 (Build 76+)

`filament_list: []` 비어있어도 폴더 스캔으로 자동 로드됨.

---

## LGFN ID 현황 (Build 76 기준)

| ID | 이름 |
|----|------|
| LGFN01 | 1.75 LPLA |
| LGFN02 | 1.75 PLA Generic |
| LGFN03 | 1.75 PETG Generic |
| LGFN04 | 1.75 PVA Generic |
| LGFN05 | 1.75 Foaming TPU |
| LGFN06 | 1.75 TPU 83A Generic |
| LGFN07 | 1.75 TPU 95A Generic |
| LGFN08 | 1.75 BONE_phantom |
| LGFN09 | 1.75 FAT_phantom |
| LGFN10 | 1.75 SKIN_phantom |
| LGFN11 | 1.75 TISSUE_phantom |
| LGFN12 | 1.75 TPU D Generic |
| LGFN13 | 2.85 TPU 60A |
| LGFN14 | 2.85 TPU 70A |
| LGFN15 | 2.85 Foaming TPU |

새 프리셋 추가 시 LGFN16부터 사용.

---

## 기본값 기준 (Build 66 이후 확정)

| 설정 | 값 |
|------|----|
| `filament_heating_duration` | `"7"` |
| `filament_toolchange_slowdown_distance` | `"70"` |
| `filament_toolchange_slowdown_speed_ratio` | `"50"` |
| `filament_toolchange_slowdown_additional_temp` | `"5"` (소재별 조정 가능) |

---

## 트러블슈팅 — 잘 안됐던 것들

### 1. 프리셋이 드롭다운에 안 보임 (가장 흔함)
- `instantiation: "true"` 인지 확인 (`"false"`면 베이스 전용)
- **AppData와 resources 불일치**: 빌드 후 `build/OrcaSlicer/resources/`는 symlink라 자동 반영되지만 `%APPDATA%/LugowareOrcaSlicer/system/`은 수동 업데이트 필요
  - 해결: 슬라이서 재시작 or AppData system 폴더 삭제 후 재시작
- Build 64~66 방식: `LUGOWARE.json` `filament_list`에 등록 안 하면 로드 안 됨

### 2. setting_id / filament_id / name 불일치
```json
// 잘못된 예
"setting_id": "LGFN01",
"filament_id": "LGFN02",       ← 다르면 저장/로드 시 깨짐
"filament_settings_id": ["1.75 LPLA"],
"name": "LPLA"                  ← filament_settings_id와 달라도 문제
```
→ 네 개 모두 일치시켜야 함 (단, setting_id/filament_id는 LGFN 번호, name/filament_settings_id는 표시 이름)

### 3. inherits 참조 실패 (Build 64~66 방식에서 발생)
- `inherits` 값이 등록된 프리셋 `name`과 정확히 일치해야 함
- 베이스 프리셋이 LUGOWARE.json에서 파생 프리셋보다 먼저 등록되어야 함
- Build 76 이후에는 inherits 없애고 standalone으로 작성하므로 이 문제 없음

### 4. compatible_printers 설정 오류
- `[]` → 모든 프린터에서 선택 가능 (권장하지 않음, 다른 프린터 유저에게도 표시)
- `["FLEX4 W 0.4 nozzle", "FLEX4 W 0.6 nozzle", ...]` → 명시적 지정
- 목록에 없는 프린터에서는 드롭다운에 표시 안 됨

### 5. JSON 문법 오류
- LUGOWARE.json filament_list에 항목 추가할 때 마지막 항목 뒤 콤마 누락/중복
- 검증: `py -c "import json; json.load(open('LUGOWARE.json', encoding='utf-8'))"`

### 6. AppData 구버전 파일 잔존
- `%APPDATA%\LugowareOrcaSlicer\system\LUGOWARE\filament\Generic\` 확인
- 구버전 파일이 남아있으면 슬라이서 재시작 후에도 구버전 표시
- 해결: AppData의 system/LUGOWARE/filament/Generic/ 폴더 삭제 후 재시작

---

## Build 64~66 방식 (구버전 참고용)

당시 파일 위치: `LUGOWARE/filament/` (Generic 서브폴더 없음)
등록 방식: `LUGOWARE.json`의 `filament_list`에 직접 명시

```json
"filament_list": [
    {"name": "1.75 solid material base", "sub_path": "filament/1.75 solid material base.json"},
    {"name": "1.75 LPLA", "sub_path": "filament/1.75 LPLA.json"}
]
```

- 베이스 프리셋 먼저, 파생 프리셋 나중 순서 필수
- inherits 방식 사용: 파생 프리셋은 오버라이드 값만 명시

이 방식에서 Build 76으로 전환한 이유: inherits 체인 관리 복잡, 베이스 변경 시 파급 범위 예측 어려움.
