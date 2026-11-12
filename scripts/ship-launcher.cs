// Ship.exe: runs scripts\ship.ps1 from the folder the exe sits in, and keeps the window open at the end.
// Build: scripts\build-ship.cmd (uses the .NET Framework C# compiler that ships with Windows).
using System;
using System.Diagnostics;
using System.IO;

class Ship {
  static int Main() {
    string dir = AppDomain.CurrentDomain.BaseDirectory;
    string script = Path.Combine(dir, "scripts", "ship.ps1");
    if (!File.Exists(script)) {
      Console.WriteLine("scripts\\ship.ps1 not found next to Ship.exe (" + dir + ").");
      Pause();
      return 1;
    }
    var p = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"");
    p.UseShellExecute = false;
    p.WorkingDirectory = dir;
    int code;
    using (var proc = Process.Start(p)) { proc.WaitForExit(); code = proc.ExitCode; }
    Pause();
    return code;
  }
  static void Pause() {
    Console.WriteLine();
    Console.Write("Press Enter to close.");
    Console.ReadLine();
  }
}
