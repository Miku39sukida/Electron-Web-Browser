Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

strPath = FSO.GetParentFolderName(WScript.ScriptFullName)

Function CheckCommand(cmd)
    Dim exitCode
    exitCode = WshShell.Run(cmd & " >nul 2>&1", 0, True)
    CheckCommand = (exitCode = 0)
End Function

If CheckCommand("node --version") Then
    If CheckCommand("npm --version") Then
        WshShell.CurrentDirectory = strPath
        WshShell.Run "npm start", 0, False
    Else
        MsgBox "npm 未安装，请先安装 Node.js。", vbExclamation, "缺少 npm"
    End If
Else
    Dim result
    result = MsgBox("Node.js 未安装。点击确定通过 winget 安装。", vbOKCancel + vbExclamation, "缺少 Node.js")
    If result = vbOK Then
        WshShell.Run "powershell -Command ""Start-Process powershell -Verb RunAs -ArgumentList '-Command', 'winget install OpenJS.NodeJS.LTS'""", 1, False
        MsgBox "安装完成后请重新运行本程序。", vbInformation, "安装已启动"
    End If
End If

Set FSO = Nothing
Set WshShell = Nothing