' Starts the daily auto-rerun with no console window.
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\sabih.siddiqui\Desktop\Automation\SchoolCafe2.0Automation"
sh.Run """C:\Program Files\nodejs\node.exe"" scripts\auto-rerun-latest.js", 0, False
