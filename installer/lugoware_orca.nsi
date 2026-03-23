; LUGOWARE OrcaSlicer NSIS Installer Script
; Build 36

!include "MUI2.nsh"
!include "FileFunc.nsh"

; General
Name "LUGOWARE OrcaSlicer"
OutFile "..\LugowareOrcaSlicer-Setup.exe"
InstallDir "$PROGRAMFILES64\LugowareOrcaSlicer"
InstallDirRegKey HKLM "Software\LugowareOrcaSlicer" "InstallDir"
RequestExecutionLevel admin

; Version
!define VERSION "2.4.0"
!define PRODUCT_NAME "LUGOWARE OrcaSlicer"

; UI
!define MUI_ICON "..\resources\images\OrcaSlicer.ico"
!define MUI_UNICON "..\resources\images\OrcaSlicer.ico"
!define MUI_ABORTWARNING

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish page with auto-run checkbox
!define MUI_FINISHPAGE_RUN "$INSTDIR\orca-slicer.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch LUGOWARE OrcaSlicer"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Language
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Korean"
!insertmacro MUI_LANGUAGE "Polish"
!insertmacro MUI_LANGUAGE "Japanese"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "German"
!insertmacro MUI_LANGUAGE "French"
!insertmacro MUI_LANGUAGE "Spanish"

; Language selection dialog at startup
Function .onInit
  !insertmacro MUI_LANGDLL_DISPLAY
FunctionEnd

; Install Section
Section "Install"
    SetOutPath "$INSTDIR"

    ; Copy all files from build/OrcaSlicer
    File /r "..\build\OrcaSlicer\*.*"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Start Menu
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\orca-slicer.exe"
    CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

    ; Desktop shortcut
    CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\orca-slicer.exe"

    ; Registry
    WriteRegStr HKLM "Software\LugowareOrcaSlicer" "InstallDir" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayName" "${PRODUCT_NAME}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "Publisher" "LUGOWARE"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "DisplayIcon" "$INSTDIR\orca-slicer.exe"

    ; Get installed size
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}" "EstimatedSize" "$0"

    ; File associations - 3MF
    WriteRegStr HKCR ".3mf" "" "LugowareOrcaSlicer.3mf"
    WriteRegStr HKCR "LugowareOrcaSlicer.3mf" "" "3MF File"
    WriteRegStr HKCR "LugowareOrcaSlicer.3mf\shell\open\command" "" '"$INSTDIR\orca-slicer.exe" "%1"'

    ; File associations - STL
    WriteRegStr HKCR ".stl" "" "LugowareOrcaSlicer.stl"
    WriteRegStr HKCR "LugowareOrcaSlicer.stl" "" "STL File"
    WriteRegStr HKCR "LugowareOrcaSlicer.stl\shell\open\command" "" '"$INSTDIR\orca-slicer.exe" "%1"'
SectionEnd

; Uninstall Section
Section "Uninstall"
    ; Remove files
    RMDir /r "$INSTDIR"

    ; Remove shortcuts
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

    ; Remove registry
    DeleteRegKey HKLM "Software\LugowareOrcaSlicer"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
    DeleteRegKey HKCR ".3mf"
    DeleteRegKey HKCR "LugowareOrcaSlicer.3mf"
    DeleteRegKey HKCR ".stl"
    DeleteRegKey HKCR "LugowareOrcaSlicer.stl"
SectionEnd
