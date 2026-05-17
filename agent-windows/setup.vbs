' VBScript to setup RMM Agent as Windows Scheduled Task
Set objShell = CreateObject("WScript.Shell")

' Set the agent directory
agentDir = "C:\Users\SylvainCASSARO\OneDrive - SCDB PRO SARL\sensetho\RMM\agent-windows"
batFile = agentDir & "\start-agent.bat"

' Delete old task
objShell.Run "schtasks /delete /tn RMM-Agent /f", 0, False

' Create scheduled task
cmd = "schtasks /create /tn RMM-Agent /tr """ & batFile & """ /sc onstart /delay 0000:30 /ru SYSTEM /rl HIGHEST /f"
result = objShell.Run(cmd, 0, True)

If result = 0 Then
  WScript.Echo "Successfully created scheduled task!"

  ' Start agent immediately
  objShell.Run "schtasks /run /tn RMM-Agent", 0, False
  WScript.Sleep 2000

  ' Show task info
  objShell.Run "cmd /c schtasks /query /tn RMM-Agent /fo list", 1, False
Else
  WScript.Echo "Error creating task: " & result
End If
