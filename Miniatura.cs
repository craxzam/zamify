using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace Zamify;

// Botones bajo la miniatura de la barra de tareas: Me gusta, anterior, reproducir/pausar y siguiente.
sealed class Miniatura : IDisposable
{
    public static readonly int Creada = RegisterWindowMessage("TaskbarButtonCreated");
    public static readonly string[] Ordenes = ["like", "prev", "play", "next"];

    readonly nint ventana;
    readonly Icon guardar, guardada, anterior, reproducir, pausar, siguiente;
    ITaskbarList3? barra;
    bool sonando, gusta, agregados;
    bool? hayGusta;

    public Miniatura(nint ventana)
    {
        this.ventana = ventana;
        int t = SystemInformation.SmallIconSize.Width;
        guardar = Dibujar(t, Guardar);
        guardada = Dibujar(t, Guardada);
        anterior = Dibujar(t, (g, s) => Saltar(g, s, false));
        siguiente = Dibujar(t, (g, s) => Saltar(g, s, true));
        reproducir = Dibujar(t, Reproducir);
        pausar = Dibujar(t, Pausar);
    }

    // Windows avisa con "TaskbarButtonCreated" cuando ya se pueden añadir (y otra vez si Explorer se reinicia).
    public void Crear()
    {
        try
        {
            barra ??= (ITaskbarList3)new TaskbarList();
            barra.HrInit();
            var b = Botones();
            agregados = barra.ThumbBarAddButtons(ventana, (uint)b.Length, b) >= 0;
        }
        catch (COMException) { barra = null; }
    }

    public void Estado(bool sonando, bool? gusta)
    {
        if (this.sonando == sonando && hayGusta == gusta) return;
        this.sonando = sonando;
        hayGusta = gusta;
        this.gusta = gusta == true;
        if (!agregados || barra is null) return;
        var b = Botones();
        try { barra.ThumbBarUpdateButtons(ventana, (uint)b.Length, b); } catch (COMException) { }
    }

    THUMBBUTTON[] Botones() =>
    [
        Boton(0, gusta ? guardada : guardar, gusta ? "Ya está en Tus me gusta" : "Guardar en Tus me gusta", hayGusta is null),
        Boton(1, anterior, "Anterior"),
        Boton(2, sonando ? pausar : reproducir, sonando ? "Pausar" : "Reproducir"),
        Boton(3, siguiente, "Siguiente")
    ];

    static THUMBBUTTON Boton(uint id, Icon icono, string texto, bool apagado = false) => new()
    {
        dwMask = 2 | 4 | 8,           // icono, texto y estado
        iId = id,
        hIcon = icono.Handle,
        szTip = texto,
        dwFlags = apagado ? 1u : 0u
    };

    // Iconos blancos dibujados al tamaño del sistema: nítidos con cualquier escala.
    static Icon Dibujar(int t, Action<Graphics, float> trazo)
    {
        using var bmp = new Bitmap(t, t, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            trazo(g, t);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    static void Reproducir(Graphics g, float s) =>
        g.FillPolygon(Brushes.White, new[] { P(s, .25f, .13f), P(s, .85f, .5f), P(s, .25f, .87f) });

    static void Pausar(Graphics g, float s)
    {
        g.FillRectangle(Brushes.White, s * .22f, s * .15f, s * .2f, s * .7f);
        g.FillRectangle(Brushes.White, s * .58f, s * .15f, s * .2f, s * .7f);
    }

    static void Saltar(Graphics g, float s, bool adelante)
    {
        float x(float v) => adelante ? s - v : v;
        g.FillPolygon(Brushes.White, new[] { new PointF(x(s * .82f), s * .15f), new PointF(x(s * .3f), s * .5f), new PointF(x(s * .82f), s * .85f) });
        g.FillRectangle(Brushes.White, adelante ? s - s * .3f : s * .15f, s * .15f, s * .15f, s * .7f);
    }

    static void Guardar(Graphics g, float s)
    {
        using var lapiz = new Pen(Color.White, Math.Max(1f, s / 12));
        g.DrawEllipse(lapiz, s * .1f, s * .1f, s * .8f, s * .8f);
        g.DrawLine(lapiz, s * .5f, s * .3f, s * .5f, s * .7f);
        g.DrawLine(lapiz, s * .3f, s * .5f, s * .7f, s * .5f);
    }

    static void Guardada(Graphics g, float s)
    {
        g.FillEllipse(Brushes.White, s * .06f, s * .06f, s * .88f, s * .88f);
        using var lapiz = new Pen(Color.Black, Math.Max(1.5f, s / 9)) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        g.DrawLines(lapiz, new[] { P(s, .3f, .52f), P(s, .45f, .66f), P(s, .71f, .37f) });
    }

    static PointF P(float s, float x, float y) => new(s * x, s * y);

    public void Dispose()
    {
        foreach (var i in new[] { guardar, guardada, anterior, reproducir, pausar, siguiente })
        {
            DestroyIcon(i.Handle);
            i.Dispose();
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int RegisterWindowMessage(string nombre);
    [DllImport("user32.dll")] static extern bool DestroyIcon(nint h);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct THUMBBUTTON
    {
        public uint dwMask, iId, iBitmap;
        public nint hIcon;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szTip;
        public uint dwFlags;
    }

    [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090"), ClassInterface(ClassInterfaceType.None)]
    class TaskbarList { }

    [ComImport, Guid("ea1afb91-9e28-4b86-90e9-9e9f8a5eefaf"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ITaskbarList3
    {
        void HrInit();
        void AddTab(nint h);
        void DeleteTab(nint h);
        void ActivateTab(nint h);
        void SetActiveAlt(nint h);
        void MarkFullscreenWindow(nint h, [MarshalAs(UnmanagedType.Bool)] bool pantalla);
        void SetProgressValue(nint h, ulong hecho, ulong total);
        void SetProgressState(nint h, int estado);
        void RegisterTab(nint pestana, nint mdi);
        void UnregisterTab(nint pestana);
        void SetTabOrder(nint pestana, nint antes);
        void SetTabActive(nint pestana, nint mdi, uint reservado);
        [PreserveSig] int ThumbBarAddButtons(nint h, uint n, [MarshalAs(UnmanagedType.LPArray)] THUMBBUTTON[] botones);
        [PreserveSig] int ThumbBarUpdateButtons(nint h, uint n, [MarshalAs(UnmanagedType.LPArray)] THUMBBUTTON[] botones);
    }
}
