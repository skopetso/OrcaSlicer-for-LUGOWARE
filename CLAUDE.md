# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

OrcaSlicer is an open-source 3D slicer application forked from Bambu Studio, built using C++ with wxWidgets for the GUI and CMake as the build system. The project uses a modular architecture with separate libraries for core slicing functionality, GUI components, and platform-specific code.

## Build Commands

### Building on Windows
**Always use this command to build the project when testing build issues on Windows.**
```bash
cmake --build . --config %build_type% --target ALL_BUILD -- -m
```

### Building on macOS
**Always use this command to build the project when testing build issues on macOS.**
```bash
cmake --build build/arm64 --config RelWithDebInfo --target all --
```

### Building on Linux
 **Always use this command to build the project when testing build issues on Linux.**
```bash
cmake --build build/arm64 --config RelWithDebInfo --target all --

```
### Build test:

**Always use this command to build the project when testing build issues on Windows.**
```bash
cmake --build . --config %build_type% --target ALL_BUILD -- -m
```

### Building on macOS
**Always use this command to build the project when testing build issues on macOS.**
```bash
cmake --build build/arm64 --config RelWithDebInfo --target all --
```

### Building on Linux
 **Always use this command to build the project when testing build issues on Linux.**
```bash
cmake --build build --config RelWithDebInfo --target all --

```


### Build System
- Uses CMake with minimum version 3.13 (maximum 3.31.x on Windows)
- Primary build directory: `build/`
- Dependencies are built in `deps/build/`
- The build process is split into dependency building and main application building
- Windows builds use Visual Studio generators
- macOS builds use Xcode by default, Ninja with -x flag
- Linux builds use Ninja generator

### Testing
Tests are located in the `tests/` directory and use the Catch2 testing framework. Test structure:
- `tests/libslic3r/` - Core library tests (21 test files)
  - Geometry processing, algorithms, file formats (STL, 3MF, AMF)
  - Polygon operations, clipper utilities, Voronoi diagrams
- `tests/fff_print/` - Fused Filament Fabrication tests (12 test files)
  - Slicing algorithms, G-code generation, print mechanics
  - Fill patterns, extrusion, support material
- `tests/sla_print/` - Stereolithography tests (4 test files)
  - SLA-specific printing algorithms, support generation
- `tests/libnest2d/` - 2D nesting algorithm tests
- `tests/slic3rutils/` - Utility function tests
- `tests/sandboxes/` - Experimental/sandbox test code

Run all tests after building:
```bash
cd build && ctest
```

Run tests with verbose output:
```bash
cd build && ctest --output-on-failure
```

Run individual test suites:
```bash
# From build directory
ctest --test-dir ./tests/libslic3r/libslic3r_tests
ctest --test-dir ./tests/fff_print/fff_print_tests
ctest --test-dir ./tests/sla_print/sla_print_tests
# and so on
```

## Architecture

### Core Libraries
- **libslic3r/**: Core slicing engine and algorithms (platform-independent)
  - Main slicing logic, geometry processing, G-code generation
  - Key classes: Print, PrintObject, Layer, GCode, Config
  - Modular design with specialized subdirectories:
    - `GCode/` - G-code generation, cooling, pressure equalization, thumbnails
    - `Fill/` - Infill pattern implementations (gyroid, honeycomb, lightning, etc.)
    - `Support/` - Tree supports and traditional support generation
    - `Geometry/` - Advanced geometry operations, Voronoi diagrams, medial axis
    - `Format/` - File I/O for 3MF, AMF, STL, OBJ, STEP formats
    - `SLA/` - SLA-specific print processing and support generation
    - `Arachne/` - Advanced wall generation using skeletal trapezoidation

- **src/slic3r/**: Main application framework and GUI
  - GUI application built with wxWidgets
  - Integration between libslic3r core and user interface
  - Located in `src/slic3r/GUI/` (not shown in this directory but exists)

### Key Algorithmic Components
- **Arachne Wall Generation**: Variable-width perimeter generation using skeletal trapezoidation
- **Tree Supports**: Organic support generation algorithm  
- **Lightning Infill**: Sparse infill optimization for internal structures
- **Adaptive Slicing**: Variable layer height based on geometry
- **Multi-material**: Multi-extruder and soluble support processing
- **G-code Post-processing**: Cooling, fan control, pressure advance, conflict checking

### File Format Support
- **3MF/BBS_3MF**: Native format with extensions for multi-material and metadata
- **STL**: Standard tessellation language for 3D models
- **AMF**: Additive Manufacturing Format with color/material support  
- **OBJ**: Wavefront OBJ with material definitions
- **STEP**: CAD format support for precise geometry
- **G-code**: Output format with extensive post-processing capabilities

### External Dependencies
- **Clipper2**: Advanced 2D polygon clipping and offsetting
- **libigl**: Computational geometry library for mesh operations
- **TBB**: Intel Threading Building Blocks for parallelization
- **wxWidgets**: Cross-platform GUI framework
- **OpenGL**: 3D graphics rendering and visualization
- **CGAL**: Computational Geometry Algorithms Library (selective use)
- **OpenVDB**: Volumetric data structures for advanced operations
- **Eigen**: Linear algebra library for mathematical operations

## File Organization

### Resources and Configuration
- `resources/profiles/` - Printer and material profiles organized by manufacturer
- `resources/printers/` - Printer-specific configurations and G-code templates  
- `resources/images/` - UI icons, logos, calibration images
- `resources/calib/` - Calibration test patterns and data
- `resources/handy_models/` - Built-in test models (benchy, calibration cubes)

### Internationalization and Localization  
- `localization/i18n/` - Source translation files (.pot, .po)
- `resources/i18n/` - Runtime language resources
- Translation managed via `scripts/run_gettext.sh` / `scripts/run_gettext.bat`

### Platform-Specific Code
- `src/libslic3r/Platform.cpp` - Platform abstractions and utilities
- `src/libslic3r/MacUtils.mm` - macOS-specific utilities (Objective-C++)
- Windows-specific build scripts and configurations
- Linux distribution support scripts in `scripts/linux.d/`

### Build and Development Tools
- `cmake/modules/` - Custom CMake find modules and utilities
- `scripts/` - Python utilities for profile generation and validation  
- `tools/` - Windows build tools (gettext utilities)
- `deps/` - External dependency build configurations

## Development Workflow

### Code Style and Standards
- **C++17 standard** with selective C++20 features
- **Naming conventions**: PascalCase for classes, snake_case for functions/variables
- **Header guards**: Use `#pragma once` 
- **Memory management**: Prefer smart pointers, RAII patterns
- **Thread safety**: Use TBB for parallelization, be mindful of shared state

### Common Development Tasks

#### Adding New Print Settings
1. Define setting in `PrintConfig.cpp` with proper bounds and defaults
2. Add UI controls in appropriate GUI components  
3. Update serialization in config save/load
4. Add tooltips and help text for user guidance
5. Test with different printer profiles

#### Modifying Slicing Algorithms  
1. Core algorithms live in `libslic3r/` subdirectories
2. Performance-critical code should be profiled and optimized
3. Consider multi-threading implications (TBB integration)
4. Validate changes don't break existing profiles
5. Add regression tests where appropriate

#### GUI Development
1. GUI code resides in `src/slic3r/GUI/` (not visible in current tree)
2. Use existing wxWidgets patterns and custom controls
3. Support both light and dark themes
4. Consider DPI scaling on high-resolution displays
5. Maintain cross-platform compatibility

#### Adding Printer Support
1. Create JSON profile in `resources/profiles/[manufacturer].json`
2. Add printer-specific start/end G-code templates
3. Configure build volume, capabilities, and material compatibility
4. Test thoroughly with actual hardware when possible
5. Follow existing profile structure and naming conventions

### Dependencies and Build System
- **CMake-based** with separate dependency building phase
- **Dependencies** built once in `deps/build/`, then linked to main application  
- **Cross-platform** considerations important for all changes
- **Resource files** embedded at build time, platform-specific handling

### Performance Considerations
- **Slicing algorithms** are CPU-intensive, profile before optimizing
- **Memory usage** can be substantial with complex models
- **Multi-threading** extensively used via TBB
- **File I/O** optimized for large 3MF files with embedded textures
- **Real-time preview** requires efficient mesh processing

## Important Development Notes

### Codebase Navigation
- Use search tools extensively - codebase has 500k+ lines
- Key entry points: `src/OrcaSlicer.cpp` for application startup
- Core slicing: `libslic3r/Print.cpp` orchestrates the slicing pipeline
- Configuration: `PrintConfig.cpp` defines all print/printer/material settings

### Compatibility and Stability
- **Backward compatibility** maintained for project files and profiles
- **Cross-platform** support essential (Windows/macOS/Linux)  
- **File format** changes require careful version handling
- **Profile migrations** needed when settings change significantly

### Quality and Testing
- **Regression testing** important due to algorithm complexity
- **Performance benchmarks** help catch performance regressions
- **Memory leak** detection important for long-running GUI application
- **Cross-platform** testing required before releases

## LUGOWARE Customization History

### Build 49~49d (v2.4.0 → v2.4.1)
- **BBL 프린터 위자드 버그 수정**: 깨진 COEX PCTG PRIME 필라멘트가 BBL 벤더 전체 로딩을 중단시키던 버그 (throw→continue)
- FOAMING TPU 프로세스에 누락된 `instantiation` 필드 추가
- LoadProfileFamily null-safe 체크 추가
- PrintConfig.cpp extruder_type/nozzle_volume_type null 체크
- COEX PCTG PRIME 파일 9개 + BBL.json 참조 제거
- 위자드 필라멘트 페이지 Vendor 필터 기본 Lugoware만 체크
- 서드파티 필라멘트 벤더 제거 (Generic, Bambu Lab, Lugoware만 유지)

### Build 50~51
- **네트워크 플러그인 위자드 스킵**: Bambu 네트워크 플러그인 설치 페이지 비활성화
- **플러그인 팝업/사이드바 비활성화**: 플러그인 설치 요구 팝업 및 사이드바 메시지 숨김

### Build 52~53
- **벽/infill 출력 순서 수정**: 내벽→infill→외벽 순서 버그 수정
- **Cell-by-cell extrusion 재구현**: contour-aware 그룹핑으로 내벽+외벽 쌍을 묶은 후 infill 매칭

### Build 54 (v2.4.1)
- NSIS 설치파일 언어 선택 다이얼로그 추가 (EN/KR/PL/JP/CN/DE/FR/ES)
- 버전 2.4.1로 업데이트
- 설치파일 이름에 버전 포함 (`lugoware_slicer_2.4.1.exe`)

### Build 55 (v2.4.12)
- **툴체인지 감속 기능**: F값 직접 감속 (기본 50% 속도, 60mm 거리)
  - 설정: `filament_toolchange_slowdown_speed_ratio`, `filament_toolchange_slowdown_distance`
  - 위치: 필라멘트 설정 > Multimaterial 탭
- **Additional Prime 설정**: `filament_additional_prime` — Klipper CHANGE_TOOL 매크로에 A_P 파라미터로 전달
- **Heating Duration UI 이동**: Multimaterial 탭 하단으로 이동
- **retract_restart_extra_toolchange**: 프린터→필라멘트 설정으로 이동

### Build 56 (v2.4.12)
- **첫 툴 tc_retract 지원**: LUGOWARE_TOOLCHANGER 감지 (`template_custom_gcode`)
  - 첫 번째 툴도 tc_retract 상태로 설정하여 올바른 unretract 보장
- 버전 2.4.12로 업데이트

### Build 57
- **PrintFarm 탭 추가**: 웹뷰로 프린트팜 서버 표시
  - Preferences > General에 PrintFarm URL 설정
  - URL 변경 시 재시작 없이 즉시 반영

### Build 58
- **툴체인지 retract/unretract 수정 (Critical)**
  - pre-toolchange retract 시 OLD 필라멘트 retraction_length가 NEW 필라멘트 unretract에 적용되던 버그 수정
  - 매 툴체인지 후 `set_retracted(tc_retract)` 설정
  - T2 과압출(8.1mm→3.1mm) 해결

### Build 59
- **Z hop 순서 수정**: 툴체인지 후 XY 먼저 이동 → Z 내림 순서 보장
  - Z hop 중복 이동 제거

### Build 60
- **PrintFarm 탭 Setup UI**: 서버/클라이언트 카드 선택 방식
  - 서버 모드: Storage Path, Admin Username/Password, Install & Start Server
  - 클라이언트 모드: URL 입력 → 연결
  - 서버 설치: resources 복사, .env 생성, admin 등록, storage 설정 API 호출

### Build 61
- **Upload to PrintFarm 버튼**: Print 드롭다운에 추가
  - 슬라이싱된 gcode를 직접 업로드 (파일 대화상자 없음)
  - 파일명 입력 대화상자 (.gcode 자동 추가)
  - 서버 로그인 → multipart/form-data 업로드
- **PrintFarm 아이콘 SVG**: 모니터+프린터 2대 연결 아이콘

### Build 62 (v2.4.13)
- PrintFarm 아이콘 스타일 통일 (#fff, 20x20, 다른 탭과 일관성)
- Preferences에 "Reset Admin Password" 버튼 추가 (localhost일 때만 표시)
- Preferences에 "Reset PrintFarm Setup" 버튼 추가
- **XY compensation 멀티컬러 지원**: `is_mm_painted()` 제한 제거 — 페인트 모델에서도 적용
- **Tool change time 계산 수정**: single extruder filament change에서 tool_change_time 누락 수정 (2h15m→7h18m)
- **서포트 생성 수정**: support interface 팝업 제거 + 전 프리셋 independent_support_layer_height=0
- **P-point travel 개선**: avoid_crossing_perimeters 적용으로 도넛 구멍 횡단 방지
- filename_format 파싱 에러 수정 (filament_type[initial_tool]→[0])
- PrintFarm 업로드 시 webview localStorage에서 토큰 획득
- PrintFarm 업로드 한글 파일명 UTF-8 인코딩
- LUGOWARE 브랜딩 아이콘 교체 (OrcaSlicer→LUGOWARE 로고)
- **Seam 경계 배치 시도 → revert**: embedded_distance 기반 접근 한계로 원복

## LUGOWARE 프로파일 구조
- `resources/profiles/LUGOWARE.json` — 벤더 정의
- `resources/profiles/LUGOWARE/machine/` — 프린터 모델 및 노즐 프리셋
- `resources/profiles/LUGOWARE/process/` — 프로세스 프리셋 11종
- `resources/profiles/OrcaFilamentLibrary/` — 필라멘트 (base + Generic @System + Bambu + Lugoware 16종)
- 프로파일 변경 시 3곳 동기화: `resources/`, `build/OrcaSlicer/resources/`, `AppData/Roaming/LugowareOrcaSlicer/system/`

## LUGOWARE 툴체인저 특수 기능
- `template_custom_gcode`에 `; LUGOWARE_TOOLCHANGER` 포함 시 활성화
- 첫 툴 tc_retract 자동 설정
- pre-toolchange retract 유지 (펌웨어 G92 E0으로 무효화됨)
- 매 툴체인지 후 set_retracted(tc_retract) + set_zhop(z_hop)
- 툴체인지 후 F값 감속 (filament_toolchange_slowdown_speed_ratio/distance)

## Klipper 펌웨어 (별도 관리)
- `C:\Users\Huhn\Desktop\CFG\V3(FIRSTDOCK)\` — 펌웨어 cfg 파일
- v12.29 W/M: a_p 적용, M220 제거, FIRST_DOCK→DOCK_TOOL 통합 (h_d*2)
- CHANGE_TOOL 파라미터: NEXT_TOOL, TEMP, FILAMENT_DIAMETER, RETRACT_LEN, TC_RETRACT_LEN, H_D, A_P

### Build 63 (v2.4.1301)

#### C-hop 기능 (Cell Z-hop → C-hop)
- **셀 간 대각선 이동**: 다른 셀/객체 간 이동 시 XYZ 동시 대각선 이동
- **z-hop 순서**: retract → z-hop up → C-hop 대각선 XYZ → z-hop down → unlift → unretract
- **거리 비례 높이**: `C-hop Z = min(설정값, 이동거리 * 0.25)` — 가까운 객체는 낮게, 먼 객체는 높게
- **스킵 조건**: 단일 객체 레이어 전환, 첫 아일랜드, 서포트 extrusion에서 C-hop 비활성
- **P-point 호환**: P-point 착지점이 있으면 C-hop 목표로 사용
- **설정 위치**: 필라멘트 > Multimaterial 탭 > "C-hop height" (0~50mm, 기본 0)
- **G-code 코멘트**: `; C-hop`
- **cross-cell 판정 로직** (v5):
  1. `m_prev_island_obj_copy.first == nullptr` → 스킵 (첫 아일랜드)
  2. `prev_obj != cur_obj` → cross-cell (다른 객체)
  3. `prev_lslice >= 0 && prev_lslice != cur_lslice` → cross-cell (같은 객체, 다른 아일랜드)
  4. 나머지 → 스킵 (같은 객체 레이어 전환 등)
- **관련 변수** (GCode.hpp):
  - `m_current_island_obj_copy` / `m_prev_island_obj_copy` — `std::pair<const PrintObject*, Point>`
  - `m_current_island_lslice_idx` / `m_prev_island_lslice_idx` — lslice 인덱스
  - `m_prev_island_layer` — 이전 아일랜드의 Layer 포인터
- **관련 파일**: GCode.cpp (`_extrude` 내 C-hop 블록), GCode.hpp, PrintConfig.cpp/hpp, Tab.cpp, Preset.cpp

#### PrintFarm 탭 개선
- **서버 카드 간소화**: 입력 필드 전부 제거, "Start Server" 버튼 하나만
- **클라이언트 카드 유지**: URL 기본값 `http://`
- **탭 이름 토글**: ON(주황) / OFF(흰색) — 최초 1회는 볼드 주황, 이후 토글
- **서버 경로**: `%APPDATA%/LugowareOrcaSlicer/printfarm/node/node.exe` + `server/src/index.js`
- **오르카 종료 시 서버 자동 종료**: `MainFrame::on_close` → `stop_server()`
- **모든 텍스트 `_L()` 다국어 대응**
- **상단바(m_topbar)에 버튼 넣으면 UI 깨짐 — 절대 넣지 마**

#### 서드파티 필라멘트 벤더 복구
- OrcaFilamentLibrary.json 원본 복구 (Build 46에서 제거했던 서드파티 220개 파일 복구)
- **COEX PCTG PRIME @base/@System 제외** — 깨진 파일이 BBL 벤더 전체 로딩 중단시킴
- Lugoware 프리셋 유지 (LPLA, LPET, PHANTOM-BONE/TISSUE/SKIN/FAT)
- 벤더: AliZ, COEX, Elas, Elegoo, Eolas, FDplast, FILL3D, FusRock, NIT, Numakers, Overture, Polymaker, SUNLU, Valment, eSUN

### 대화 스타일
- 반말로 대화. 짧게 답변
- "행님"으로 호칭
- 빌드 전 변경사항 브리핑 후 컨펌
- 빌드/롤백 완료 = DLL 복사 + 재시작 + 확인까지
- git index.lock 에러 시 `rm .git/index.lock`
- 메모리 저장 시 알리지 말고 조용히
- /clear 전에 반드시 메모리 저장
- worktree 쓰지 마. 빌드 디렉토리가 메인에만 있음
- 버전 변경은 기능 확정 후 마지막에 한 번만 (version.inc 바꾸면 거의 전체 리빌드)

## 남은 숙제
- **프린터 전환 크래시**: 다른 프린터→루고웨어 전환 후 소재 추가/삭제 시 튕김
- **C-hop Setting Overrides 이동**: nullable 타입 호환성 문제로 Multimaterial에 유지 중. 해결하면 Setting Overrides > Retraction으로 이동
- **PrintFarm 서버 파일 배치**: node/ 폴더 NSIS 설치파일에 포함 필요
- **버전 2.4.1301 확정**: 기능 확정 후 version.inc 업데이트
- **Seam 경계 배치 재구현**: embedded_distance 대신 다른 extruder perimeter 거리 기반으로
- **avoid_crossing_walls + 4번 툴 서포트 버그**: upstream 2.4.x 버그 추정, 서포트가 빔
- cell-by-cell 개선 (큰 아일랜드에서 벽→벽→벽→채움 패턴)
- 멀티컬러 세팅 초기화 버그 (BBL↔LUGOWARE 전환 시)
- Generic 필라멘트 드롭다운 alias 매칭 문제
- Physical Printer IP 저장 문제
- BBL 프린터 프린트팜 통합
- P-point max depth 입력 UI 버그 (숫자 입력 이상)
- NSIS 설치파일 로고 미확인 (어디가 안 바뀌었는지 확인 필요)
- 채움패턴 개발 (다음 작업)
