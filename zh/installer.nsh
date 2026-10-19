; Chinese, current-user wizard. Share upstream's updater/uninstaller, not its eager migration.
!define GRYT_ZH_INSTALLER
!define /ifndef GRYT_LEGACY_INSTALL_KEY "Software\683825e5-efcf-57d3-b331-3f3d51300599"
!define /ifndef GRYT_LEGACY_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\683825e5-efcf-57d3-b331-3f3d51300599"
!define /ifndef GRYT_HELPER_NAME "gryt-helper.exe"
!define /ifndef GRYT_HELPER_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"

; Switching oneClick changes electron-builder's default from gryt-chat to Gryt Chat.
; Keep the old directory component AND the updater's $APPDATA path stable.
!undef APP_FILENAME
!define APP_FILENAME "gryt-chat"

!ifndef BUILD_UNINSTALLER
Var grytPreviousDir
Var grytTargetDir
Var grytBackupDir
Var grytRepairHelper
!endif

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "欢迎安装 Gryt Chat"
  !define MUI_WELCOMEPAGE_TEXT "此向导将为当前 Windows 用户安装 Gryt Chat。$\r$\n$\r$\n下一步可以选择安装位置。程序会使用独立的 gryt-chat 子目录。$\r$\n$\r$\n升级将保留账号、设置和本地数据。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstallMode
  ; perMachine:false alone still offers an all-users installation in an assisted installer.
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  ; No process termination, renames or registry writes before the user presses Install.
  ${If} ${isForAllUsers}
  ${OrIf} $hasPerMachineInstallation == "1"
    MessageBox MB_OK|MB_ICONSTOP "此中文版仅支持为当前用户安装。请先卸载所有用户安装的版本，再重新运行安装程序；卸载时请保留用户数据。" /SD IDOK
    SetErrorLevel 2
    Quit
  ${EndIf}
  !insertmacro setInstallModePerUser
  ReadRegStr $grytPreviousDir HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $grytPreviousDir == ""
    ReadRegStr $grytPreviousDir HKCU "${GRYT_LEGACY_INSTALL_KEY}" "InstallLocation"
  ${EndIf}
  ${If} $grytPreviousDir == ""
  ${AndIf} ${FileExists} "$INSTDIR\Uninstall Gryt Chat.exe"
    StrCpy $grytPreviousDir "$INSTDIR"
  ${EndIf}
  ${If} $grytPreviousDir != ""
    !insertmacro GetDParameter $R0
    ${If} ${isUpdated}
    ${OrIf} $R0 == ""
      ; Suggest the previous directory; updates always keep it, even with a stale /D.
      StrCpy $INSTDIR "$grytPreviousDir"
    ${EndIf}
  ${EndIf}
  StrCpy $grytRepairHelper "0"
  ReadRegStr $R0 HKCU "${GRYT_HELPER_RUN_KEY}" "GrytHelper"
  ${If} $grytPreviousDir != ""
  ${AndIf} $R0 == '$\"$grytPreviousDir\resources\helper\${GRYT_HELPER_NAME}$\"'
    StrCpy $grytRepairHelper "1"
  ${EndIf}
!macroend

!macro grytBeforeCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    StrCpy $grytTargetDir "$INSTDIR"
    ; Reject a non-empty unrelated folder before either the old app or helper is stopped.
    ${If} $grytTargetDir != $grytPreviousDir
      FindFirst $R3 $R2 "$grytTargetDir\*.*"
      ${DoWhile} $R2 != ""
        ${If} $R2 != "."
        ${AndIf} $R2 != ".."
          FindClose $R3
          MessageBox MB_OK|MB_ICONSTOP "目标目录不是空目录。请选择一个空目录，或使用当前 Gryt Chat 的安装目录。" /SD IDOK
          SetErrorLevel 2
          Quit
        ${EndIf}
        FindNext $R3 $R2
      ${Loop}
      FindClose $R3
    ${EndIf}
    ClearErrors
    CreateDirectory "$grytTargetDir"
    GetTempFileName $R2 "$grytTargetDir"
    ${If} ${Errors}
      MessageBox MB_OK|MB_ICONSTOP "无法写入所选安装目录。请选择当前用户有写入权限的位置。" /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
    Delete "$R2"
    ${If} $grytPreviousDir != ""
      ; Process detection must inspect the OLD path, even when installing on another drive.
      StrCpy $INSTDIR "$grytPreviousDir"
    ${EndIf}
  !endif
!macroend

!macro grytAfterCheckAppRunning
  !ifndef BUILD_UNINSTALLER
    StrCpy $INSTDIR "$grytTargetDir"
    ; CHECK_APP_RUNNING has completed and the user has committed to installing.
    nsExec::Exec 'taskkill /F /IM ${GRYT_HELPER_NAME}'
    Pop $R0
    ReadRegDWORD $R1 HKCU "${GRYT_MIGRATION_REG_KEY}" "LegacyNsisMigrationV1"
    ${If} $R1 != 1
    ${AndIf} $grytPreviousDir != ""
    ${AndIf} ${FileExists} "$grytPreviousDir\Uninstall Gryt Chat.exe"
    ${AndIf} ${FileExists} "$grytPreviousDir\Gryt Chat.exe"
      ; Never remove a pre-existing recovery copy. Each attempt gets its own backup.
      StrCpy $grytBackupDir "$grytPreviousDir.gryt-backup"
      StrCpy $R2 0
      ${DoWhile} ${FileExists} "$grytBackupDir"
        IntOp $R2 $R2 + 1
        StrCpy $grytBackupDir "$grytPreviousDir.gryt-backup.$R2"
      ${Loop}
      SetOutPath "$TEMP"
      ClearErrors
      Rename "$grytPreviousDir" "$grytBackupDir"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONSTOP "无法准备旧版本以进行升级。请完全退出 Gryt Chat 后重试。" /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
      ; A receipt in BOTH locations lets the launched app clean only its own backup.
      FileOpen $R3 "$grytBackupDir\gryt-migration.ini" w
      FileWriteWord $R3 0xFEFF
      FileClose $R3
      WriteINIStr "$grytBackupDir\gryt-migration.ini" "migration" "target" "$INSTDIR"
      ${If} ${Errors}
        Rename "$grytBackupDir" "$grytPreviousDir"
        MessageBox MB_OK|MB_ICONSTOP "无法记录升级备份，安装已停止。请检查目录写入权限。" /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
      DeleteRegKey HKCU "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey HKCU "${GRYT_LEGACY_UNINSTALL_KEY}"
    ${EndIf}
  !endif
!macroend

!macro grytAfterInstall
  ${If} $grytBackupDir != ""
    FileOpen $R3 "$INSTDIR\gryt-migration.ini" w
    FileWriteWord $R3 0xFEFF
    FileClose $R3
    WriteINIStr "$INSTDIR\gryt-migration.ini" "migration" "backup" "$grytBackupDir"
  ${EndIf}
  ${If} $grytRepairHelper == "1"
    ; Repair only an existing opt-in. A fresh install must never enable this setting.
    WriteRegStr HKCU "${GRYT_HELPER_RUN_KEY}" "GrytHelper" '$\"$INSTDIR\resources\helper\${GRYT_HELPER_NAME}$\"'
  ${EndIf}
!macroend

!macro customFinishPage
  Function grytFinishPre
    ${If} ${isUpdated}
      ; Manual restart-for-update is non-silent, but should never stop at a Finish page.
      ${If} ${isForceRun}
        Call grytFinishLaunch
      ${EndIf}
      !insertmacro quitSuccess
    ${EndIf}
  FunctionEnd
  Function grytFinishLaunch
    StrCpy $1 ""
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd
  !define MUI_PAGE_CUSTOMFUNCTION_PRE grytFinishPre
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION grytFinishLaunch
  !insertmacro MUI_PAGE_FINISH
!macroend

!include "${PROJECT_DIR}\build\installer.nsh"
