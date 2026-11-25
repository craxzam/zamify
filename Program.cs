using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Zamify;

static class Program
{
    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, "Zamify." + Ventana.Datos.Replace(Path.DirectorySeparatorChar, '/'), out bool first);
        if (!first) { Ventana.Mostrar(); return; }
        try { Ventana.Migrar(); }
        catch (IOException)
        {
            MessageBox.Show("Cierra la versión anterior (Ligero) y vuelve a abrir Zamify para conservar tu sesión.", "Zamify");
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new Ventana());
    }
}

sealed class Ventana : Form
{
    const string Inicio = "https://open.spotify.com/";
    const string Titulo = "Zamify";
    public static readonly string Datos = Environment.GetEnvironmentVariable("ZAMIFY_DATOS") ?? Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Zamify");
    // Las primeras versiones se llamaban Ligero: conserva su sesión y sus ajustes.
    public static void Migrar()
    {
        string anterior = Path.Combine(Path.GetDirectoryName(Datos)!, "Ligero");
        if (Directory.Exists(anterior) && !Directory.Exists(Datos)) Directory.Move(anterior, Datos);
    }

    static readonly string Posicion = Path.Combine(Datos, "ventana.json");

    // Solo analítica de terceros: nada que la reproducción o el inicio de sesión necesiten.
    static readonly string[] Rastreadores =
    [
        "www.googletagmanager.com", "www.google-analytics.com", "analytics.google.com",
        "sb.scorecardresearch.com", "www.fastly-insights.com", "static.hotjar.com",
        "t.contentsquare.net", "cdn.us.heap-api.com", "analytics.tiktok.com"
    ];

    readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.Black };

    public Ventana()
    {
        Text = Titulo;
        BackColor = Color.Black;
        MinimumSize = new Size(480, 400);
        Size = new Size(1200, 780);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = new Icon(typeof(Ventana).Assembly.GetManifestResourceStream("icono.ico")!);
        Restaurar();
        Controls.Add(web);
        Load += async (_, _) => await Arrancar();
        Resize += (_, _) => AjustarMemoria();
        soltar.Tick += (_, _) => { soltar.Stop(); Memoria(CoreWebView2MemoryUsageTargetLevel.Low); _ = SoltarSubmarcos(); };
        submarcos.Tick += (_, _) => { submarcos.Stop(); _ = SoltarSubmarcos(); };
        FormClosing += (_, _) => Guardar();
        FormClosed += (_, _) => miniatura?.Dispose();
    }

    async Task Arrancar()
    {
        try
        {
            Directory.CreateDirectory(Datos);
            var opciones = new CoreWebView2EnvironmentOptions(string.Join(' ',
                "--disk-cache-size=157286400",          // caché máxima de 150 MB
                "--autoplay-policy=no-user-gesture-required",
                "--disable-background-networking",
                "--renderer-process-limit=1",
                "--enable-low-end-device-mode",         // cachés y búferes mínimos
                "--disable-gpu"))                       // sin proceso gráfico pesado
            { Language = "es" };
            var entorno = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Datos, "Perfil"), opciones);
            await web.EnsureCoreWebView2Async(entorno);
        }
        catch (Exception e)
        {
            MessageBox.Show("No se pudo iniciar WebView2:\n" + e.Message, Titulo, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        var c = web.CoreWebView2;
        c.Settings.AreDevToolsEnabled = false;
        c.Settings.IsStatusBarEnabled = false;
        c.Settings.IsSwipeNavigationEnabled = false;
        c.Settings.IsPasswordAutosaveEnabled = false;
        c.Settings.IsGeneralAutofillEnabled = false;
        c.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;

        // Carátulas más pequeñas y sin vídeos de fondo.
        c.AddWebResourceRequestedFilter("https://i.scdn.co/image/ab67616d0000b273*", CoreWebView2WebResourceContext.Image);
        c.AddWebResourceRequestedFilter("https://canvaz.scdn.co/*", CoreWebView2WebResourceContext.All);
        foreach (var host in Rastreadores)
            c.AddWebResourceRequestedFilter($"https://{host}/*", CoreWebView2WebResourceContext.All);
        c.WebResourceRequested += (_, e) =>
        {
            if (e.Request.Uri.StartsWith("https://i.scdn.co/"))
                e.Request.Uri = e.Request.Uri.Replace("ab67616d0000b273", "ab67616d00001e02");
            else
                e.Response = c.Environment.CreateWebResourceResponse(null, 403, "Blocked", "");
        };

        c.NavigationStarting += (_, e) =>
        {
            if (Permitida(e.Uri)) return;
            e.Cancel = true;
            AbrirFuera(e.Uri);
        };
        c.NewWindowRequested += (_, e) =>
        {
            if (Permitida(e.Uri) || e.Uri == "about:blank") return;   // ventanas de inicio de sesión
            e.Handled = true;
            AbrirFuera(e.Uri);
        };
        c.WebMessageReceived += Mensaje;
        c.NavigationCompleted += (_, _) => { submarcos.Stop(); submarcos.Start(); };
        c.ProcessFailed += (_, e) =>
        {
            if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited) c.Reload();
        };

        string codigo = Recurso("worklet.js") + Recurso("efectos.js") + Recurso("main.js") + Recurso("barra.js")
            + "const ESTILO=" + JsonSerializer.Serialize(Recurso("estilo.css")) + ";" + Recurso("ui.js");
        await c.AddScriptToExecuteOnDocumentCreatedAsync(
            "if(location.origin==='https://open.spotify.com'&&self===top){" + codigo + "}");
        c.Navigate(Inicio);
    }

    // La página avisa del color de la paleta para pintar la barra de título.
    void Mensaje(object? _, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!e.Source.StartsWith(Inicio)) return;
        string m;
        try { m = e.TryGetWebMessageAsString(); } catch (ArgumentException) { return; }
        // "e" + sonando (0/1) + Me gusta (0/1, o "-" si no hay canción)
        if (m.Length == 3 && m[0] == 'e')
        {
            miniatura?.Estado(m[1] == '1', m[2] == '-' ? null : m[2] == '1');
            return;
        }
        if (m.Length != 7 || m[0] != '#' ||
            !int.TryParse(m.AsSpan(1), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out int rgb)) return;
        var color = Color.FromArgb(255, Color.FromArgb(rgb));
        BackColor = color;
        Pintar(color);
    }

    void Pintar(Color color)
    {
        int oscuro = 1, bgr = color.R | color.G << 8 | color.B << 16;
        DwmSetWindowAttribute(Handle, 20, ref oscuro, 4);
        DwmSetWindowAttribute(Handle, 35, ref bgr, 4);   // barra de título
        DwmSetWindowAttribute(Handle, 34, ref bgr, 4);   // borde
    }

    Miniatura? miniatura;

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == Miniatura.Creada)
        {
            miniatura ??= new Miniatura(Handle);
            miniatura.Crear();
        }
        else if (m.Msg == 0x0111 && ((long)m.WParam >> 16 & 0xFFFF) == 0x1800)   // WM_COMMAND de un botón de la miniatura
        {
            int id = (int)((long)m.WParam & 0xFFFF);
            if (id < Miniatura.Ordenes.Length) web.CoreWebView2?.PostWebMessageAsString(Miniatura.Ordenes[id]);
            return;
        }
        base.WndProc(ref m);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        Pintar(BackColor);
    }

    // Soltar memoria cuesta CPU, así que solo se hace tras un minuto seguido minimizada.
    readonly System.Windows.Forms.Timer soltar = new() { Interval = 60_000 };

    void AjustarMemoria()
    {
        soltar.Stop();
        if (WindowState == FormWindowState.Minimized) soltar.Start();
        else Memoria(CoreWebView2MemoryUsageTargetLevel.Normal);
    }

    void Memoria(CoreWebView2MemoryUsageTargetLevel nivel)
    {
        if (web.CoreWebView2 is { } c && c.MemoryUsageTargetLevel != nivel) c.MemoryUsageTargetLevel = nivel;
    }

    readonly System.Windows.Forms.Timer submarcos = new() { Interval = 45_000 };

    // El submarco de terceros queda inactivo tras cargar. Sigue funcionando, pero devuelve
    // a Windows la RAM que no usa; si la necesita, Windows se la da de nuevo.
    async Task SoltarSubmarcos()
    {
        if (web.CoreWebView2 is not { } c) return;
        try
        {
            foreach (var p in await c.Environment.GetProcessExtendedInfosAsync())
            {
                if (p.ProcessInfo.Kind != CoreWebView2ProcessKind.Renderer) continue;
                if (p.AssociatedFrameInfos.Count == 0 || p.AssociatedFrameInfos.Any(f => f.Source.StartsWith(Inicio))) continue;
                using var proceso = Process.GetProcessById(p.ProcessInfo.ProcessId);
                EmptyWorkingSet(proceso.Handle);
            }
        }
        catch (Exception e) when (e is ArgumentException or InvalidOperationException or System.ComponentModel.Win32Exception or COMException) { }
    }

    static bool Permitida(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u) || u.Scheme != "https") return url == "about:blank";
        string h = u.Host;
        return h == "spotify.com" || h.EndsWith(".spotify.com")
            || h is "accounts.google.com" or "appleid.apple.com" or "www.facebook.com" or "m.facebook.com";
    }

    static void AbrirFuera(string url)
    {
        if (Uri.TryCreate(url, UriKind.Absolute, out var u) && u.Scheme is "https" or "http")
            Process.Start(new ProcessStartInfo(u.AbsoluteUri) { UseShellExecute = true });
    }

    static string Recurso(string nombre)
    {
        using var s = typeof(Ventana).Assembly.GetManifestResourceStream(nombre)!;
        using var r = new StreamReader(s);
        return r.ReadToEnd() + "\n";
    }

    void Guardar()
    {
        var r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
        try { File.WriteAllText(Posicion, JsonSerializer.Serialize(new[] { r.X, r.Y, r.Width, r.Height })); } catch (IOException) { }
    }

    void Restaurar()
    {
        try
        {
            if (JsonSerializer.Deserialize<int[]>(File.ReadAllText(Posicion)) is not [var x, var y, var w, var h]) return;
            var r = new Rectangle(x, y, w, h);
            if (!Screen.AllScreens.Any(s => s.WorkingArea.IntersectsWith(r))) return;
            StartPosition = FormStartPosition.Manual;
            Bounds = r;
        }
        catch (Exception e) when (e is IOException or JsonException) { }
    }

    public static void Mostrar()
    {
        foreach (var p in Process.GetProcessesByName("Zamify"))
            if (p.MainWindowHandle != 0)
            {
                if (IsIconic(p.MainWindowHandle)) ShowWindow(p.MainWindowHandle, 9);
                SetForegroundWindow(p.MainWindowHandle);
            }
    }

    [DllImport("psapi.dll")] static extern bool EmptyWorkingSet(nint proceso);
    [DllImport("dwmapi.dll")] static extern int DwmSetWindowAttribute(nint h, int attr, ref int valor, int tam);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(nint h);
    [DllImport("user32.dll")] static extern bool ShowWindow(nint h, int cmd);
    [DllImport("user32.dll")] static extern bool IsIconic(nint h);
}
