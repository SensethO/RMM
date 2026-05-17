' VBScript to create Windows scheduled task for RMM Agent
Set objShell = CreateObject("WScript.Shell")
Set objFS = CreateObject("Scripting.FileSystemObject")

' Get the current directory
currentDir = objFS.GetParentFolderName(WScript.ScriptFullPath)
batFile = currentDir & "\start-agent.bat"

' Delete old task if it exists
objShell.Run "schtasks /delete /tn ""RMM-Agent"" /f", 0, False

' Create new scheduled task
createCmd = "schtasks /create /tn ""RMM-Agent"" /tr """ & batFile & """ /sc onstart /delay 0000:30 /ru SYSTEM /rl HIGHEST /f"
objShell.Run createCmd, 0, True

' Start the agent
startCmd = "schtasks /run /tn ""RMM-Agent"""
objShell.Run startCmd, 0, True

' Display status
statusCmd = "schtasks /query /tn ""RMM-Agent"""
objShell.Run statusCmd, 1, False

WScript.Echo "RMM Agent scheduled task created successfully!"
