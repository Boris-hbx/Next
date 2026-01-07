; NSIS Hooks for Next installer
; Kill old processes before installation

!macro NSIS_HOOK_PREINSTALL
  ; Kill flask-backend.exe if running
  nsExec::ExecToLog 'taskkill /F /IM flask-backend.exe'
  ; Kill next.exe if running
  nsExec::ExecToLog 'taskkill /F /IM next.exe'
  ; Wait a moment for processes to terminate
  Sleep 500
!macroend
