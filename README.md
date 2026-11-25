<p align="center"><img src="logo.png" width="128" alt="Zamify"></p>

# Zamify

Reproductor ligero para Windows que abre el reproductor web de Spotify en una ventana propia, con paletas oscuras, control de tono y velocidad, y efectos de sonido.

> **Proyecto no oficial.** Zamify no está afiliado, patrocinado ni respaldado por Spotify AB. «Spotify» es una marca de Spotify AB y aquí solo se nombra para indicar con qué servicio funciona. Cada persona usa su propia cuenta y debe cumplir las condiciones de Spotify. Zamify no descarga música, no quita la protección de las pistas, no bloquea los anuncios y no da acceso a funciones Premium.

## Qué hace

- **Ritmo:** Super slowed, Slowed, Sped up y Nightcore.
- **Tono y velocidad** por separado: ±12 semitonos y de 0,5× a 2×.
- **Efectos que se pueden juntar:** reverb, bajos, 8D, eco, lo-fi, bajo el agua, radio, estéreo amplio y menos voz.
- **Botones en la miniatura de la barra de tareas:** Me gusta, anterior, reproducir/pausar y siguiente.
- **Ocho paletas oscuras** y un modo minimalista.
- **Ligero:** sin proceso gráfico, y los efectos solo consumen mientras se usan.

## Consumo

Datos aproximados del Administrador de tareas, sumando todos los procesos de cada app, con música sonando:

| | Zamify | App oficial de escritorio |
| --- | --- | --- |
| Memoria (RAM) | ~270 MB | ~610–625 MB |
| Procesador (CPU) | ~0–1 % | ~0,2–0,7 % |
| Descarga | 0,5 MB | — |

> Esto pasó en mi PC: en la tuya puede funcionar diferente. Depende del equipo, de la versión de Windows y de cada app, y de cómo la uses. Para el procesador, las dos gastan muy poco y la diferencia es mínima.

Por qué gasta menos: usa el WebView2 que Windows ya incluye, funciona sin proceso gráfico, carga carátulas más pequeñas, no carga los vídeos de fondo, bloquea la analítica de terceros y los efectos de sonido solo trabajan mientras los usas.

## Requisitos

- Windows 10 u 11 de 64 bits.
- [.NET 10 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/10.0).
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (Windows 11 ya lo trae).

## Instalar

1. Descomprime el `.zip` en la carpeta que quieras.
2. Abre `Zamify.exe` e inicia sesión.
3. Opcional: `crear-acceso-directo.ps1` pone un acceso directo en el escritorio.

El programa no está firmado, así que Windows puede mostrar un aviso la primera vez.

## Atajos

| Atajo | Acción |
| --- | --- |
| Alt+Mayús+L | Abrir o cerrar el panel |
| Alt+Mayús+↑ / ↓ | Velocidad |
| Alt+Mayús+→ / ← | Tono |
| Alt+Mayús+0 | Todo normal |

## Privacidad

Zamify no recoge ni envía datos propios. La sesión y los ajustes se guardan en tu equipo, en `%LOCALAPPDATA%\Zamify`. Se bloquean algunos servicios de analítica de terceros, y la lista está en `Program.cs`.

## Compilar

Con el [SDK de .NET 10](https://dotnet.microsoft.com/download/dotnet/10.0):

```powershell
.\empaquetar.ps1
```

Para probar sin tocar tu sesión, define `ZAMIFY_DATOS` con otra carpeta antes de abrir la app.

| Archivo | Contenido |
| --- | --- |
| `Program.cs` | Ventana, WebView2, memoria y navegación permitida |
| `Miniatura.cs`, `web/barra.js` | Botones de la miniatura de la barra de tareas |
| `web/main.js` | Velocidad, tono y conexión del audio |
| `web/worklet.js` | Cambio de tono y reverb |
| `web/efectos.js` | Cadena de efectos |
| `web/ui.js`, `web/estilo.css` | Panel, paletas y estilo |

## Licencia

[MIT](LICENSE). Los componentes de terceros están en [TERCEROS.txt](TERCEROS.txt).
