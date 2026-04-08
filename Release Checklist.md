---
name: 릴리즈 체크리스트 및 주의사항
description: 빌드/릴리즈 시 반드시 확인할 사항. 2026-04-07 사고 기반 작성.
type: feedback
---

# 릴리즈 규칙 (행님 지시)

1. **개발 포터블에서 검증 완료된 상태만 릴리즈한다. 수정과 릴리즈를 동시에 진행하지 않는다.**
2. **릴리즈 시 GitHub에 푸시하고 Windows/macOS/Linux 3종 동시 빌드한다.**
3. **설치파일 이름은 반드시 `Lugorca_slicer` + 버전정보 형식으로 만든다.** (예: `Lugorca_slicer_V2.3.231_Windows.exe`)
4. **릴리즈 실행 전 내용을 행님에게 공유하고 승인받은 후 제작한다.**

---

# 빌드 체크리스트

## 빌드 전
- [ ] cmake configure 절대 돌리지 말 것 (`cmake --build`만 사용)
- [ ] version.inc 변경은 기능 확정 후 마지막에 한 번만 (거의 전체 리빌드 유발)
- [ ] 메모리 부족 대비: `-m:2` 사용, 안 되면 `-m:1`
- [ ] 슬라이서 프로세스 종료 확인 (`taskkill //IM orca-slicer.exe //F`)

## 프리셋 수정 시 절대 주의
- [ ] **LUGOWARE.json (벤더 파일)이 참조하는 프리셋 절대 삭제 금지**
  - `fdm_process_lugoware_common.json` 등 벤더 JSON이 참조하는 파일 삭제하면 LUGOWARE 벤더 전체 로딩 실패
  - 삭제 전 반드시 `LUGOWARE.json`의 `process_list`, `filament_list` 확인
- [ ] **AppData 시스템 캐시 통째로 삭제 금지**
  - `rm -rf AppData/system/LUGOWARE/` 하면 프린터 프리셋까지 전부 날아감
  - 필라멘트/프로세스만 갱신할 거면 해당 하위 폴더만 건드릴 것
- [ ] 프리셋 3곳 동기화 필수:
  1. `resources/profiles/LUGOWARE/` (소스)
  2. `build/OrcaSlicer/resources/profiles/LUGOWARE/` (빌드)
  3. `AppData/Roaming/LugowareOrcaSlicer/system/LUGOWARE/` (캐시)

## 빌드 후 (포터블 배포)
- [ ] DLL 복사 + build/OrcaSlicer/resources 리소스 동기화
  - DLL만 복사하면 리소스 안 바뀜
  - 리소스 복사 시 machine/ 폴더 건드리지 말 것 (프린터 프리셋)
- [ ] 포터블에서 실행 확인 (프린터 프리셋 보이는지)
- [ ] 업로드 & 프린팅 테스트 (OctoPrint 연결)
- [ ] 슬라이싱 테스트 (기본 모델 하나)

## 릴리즈 (포터블 검증 완료 후에만)
- [ ] 행님에게 릴리즈 내용 공유 + 승인
- [ ] 설치파일 빌드: `cmake --build . --config Release --target package -- -m:2`
- [ ] 설치파일 이름 확인: `Lugorca_slicer_V{버전}_{플랫폼}` 형식
- [ ] 설치파일 설치 테스트 (실제 설치 되는지)
- [ ] GitHub 푸시 + Windows/macOS/Linux 3종 릴리즈
- [ ] 릴리즈 노트에 변경사항 명시

---

# 2026-04-07 사고 기록
- fdm_process_lugoware_common.json 삭제 → 벤더 로딩 실패 → 프린터 프리셋 전체 소실
- AppData system/ 통째로 삭제 → 프린터/필라멘트/프로세스 전부 날아감
- 포터블 검증 없이 GitHub에 깨진 릴리즈 업로드
- 원인: 프리셋 독립화 작업 중 벤더 JSON 참조 구조 미확인, 검증 절차 무시
