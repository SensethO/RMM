' ─────────────────────────────────────────────────────────────────────────────
' RMM Agent - Lanceur silencieux
' Double-cliquer sur ce fichier pour demarrer l'agent RMM sans fenetre visible
' L'icone apparait dans la barre des taches (clic droit pour les options)
' ─────────────────────────────────────────────────────────────────────────────

Dim WshShell, fso, scriptDir, trayScript, cmd

Set WshShell = CreateObject("WScript.Shell")
Set fso      = CreateObject("Scripting.FileSystemObject")

scriptDir  = fso.GetParentFolderName(WScript.ScriptFullName)
trayScript = scriptDir & "\tray.ps1"

' Verifier que tray.ps1 existe
If Not fso.FileExists(trayScript) Then
    MsgBox "Fichier tray.ps1 introuvable dans : " & scriptDir, 16, "RMM Agent - Erreur"
    WScript.Quit 1
End If

' Lancer PowerShell invisible avec le script tray
' WindowStyle 0 = completement cache
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & trayScript & """"
WshShell.Run cmd, 0, False
