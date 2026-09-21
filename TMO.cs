using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

class TMOApp {
    [DllImport("shell32.dll", SetLastError = true)]
    static extern void SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string AppID);

    [STAThread]
    static void Main(string[] args) {
        // Register distinct Application ID for Windows Taskbar grouping
        try {
            SetCurrentProcessExplicitAppUserModelID("Throttl.MusicOverlay.TMO");
        } catch {}

        string appDir = AppDomain.CurrentDomain.BaseDirectory;

        // 1. Launch via Electron
        string electronExe = Path.Combine(appDir, @"node_modules\electron\dist\electron.exe");
        string desktopJs = Path.Combine(appDir, "desktop-app.js");

        if (File.Exists(electronExe)) {
            ProcessStartInfo electronPsi = new ProcessStartInfo {
                FileName = electronExe,
                Arguments = "\"" + desktopJs + "\"",
                WorkingDirectory = appDir,
                UseShellExecute = false
            };
            try {
                Process ep = Process.Start(electronPsi);
                if (ep != null) {
                    ep.WaitForExit();
                    return;
                }
            } catch {}
        }

        // 2. Fallback: Start background node server
        ProcessStartInfo nodePsi = new ProcessStartInfo {
            FileName = "node.exe",
            Arguments = "server.js",
            WorkingDirectory = appDir,
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden
        };

        Process nodeProcess = null;
        try { nodeProcess = Process.Start(nodePsi); } catch {}
        Thread.Sleep(800);

        // 3. Fallback: Open browser
        try {
            Process.Start("http://localhost:3000");
        } catch {}

        if (nodeProcess != null && !nodeProcess.HasExited) {
            try { nodeProcess.Kill(); } catch {}
        }
    }
}
