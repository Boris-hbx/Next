; NSIS Hooks for Next installer
; Kill old processes before installation

!macro NSIS_HOOK_PREINSTALL
  ; Kill next.exe if running
  nsExec::ExecToLog 'taskkill /F /IM next.exe'
  ; Wait a moment for processes to terminate
  Sleep 500
!macroend
