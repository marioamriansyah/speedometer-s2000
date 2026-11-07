# Speedometer — FiveM Instrument Cluster

Resource speedometer FiveM berbentuk **cluster digital**: tachometer, kecepatan seven-segment,
odometer + trip, bar temperatur dan bensin, serta baris status (sein, sabuk, lampu, gigi).

Antarmuka NUI mengikuti API [jgvrp-speedometer-template](https://github.com/tianmetal/jgvrp-speedometer-template)
(`setSpeed`, `setRPM`, `setFuel`, …), dengan desain cluster dari `Speedometer Cluster.html`.
Sisi server menyimpan odometer per plat nomor, jadi jarak tempuh kendaraan tidak hilang saat restart.

---

## Fitur

- **Tachometer progresif** 0–10 ×1000 r/min dengan zona redline 8–10 (menyala merah + glow).
- **Kecepatan digital** 3 digit seven-segment, satuan km/h · mph · knots.
- **Odometer persisten** per plat nomor (json di `data/odometer.json`) + **trip** sesi.
- **Temperatur** diturunkan dari kondisi mesin, **bensin** dari level bahan bakar kendaraan.
- **Baris status**: sein kiri/kanan, sabuk pengaman, lampu (jauh), dan gigi (N/R/1–6).
- Cluster meredup saat mesin mati, dan hanya tampil saat berada di dalam kendaraan.
- Konfigurasi posisi, skala, offset, satuan, dan tombol pintasan.
- Tanpa dependency, tanpa build step, tanpa database eksternal.

---

## Instalasi

1. Salin folder ini ke `resources/` server, misal `resources/[hud]/speedometer`.
2. Tambahkan ke `server.cfg`:

   ```cfg
   ensure speedometer
   ```

3. Restart server. HUD muncul otomatis saat pemain masuk ke kendaraan.

Tidak perlu `npm install` atau build: NUI-nya HTML/CSS/JS biasa.

---

## Struktur

```
fxmanifest.lua          manifest resource
config.lua              konfigurasi bersama (client + server)
client/main.lua         pembaca state kendaraan + pengirim data ke NUI
server/main.lua         penyimpanan odometer per plat nomor
data/odometer.json      data odometer (dibuat/diisi otomatis)
html/index.html         markup cluster (SVG)
html/style.css          tema cluster + penempatan HUD
html/app.js             render gauge + API template
html/fonts/             Rajdhani 600/700 (offline, tanpa Google Fonts)
```

---

## Konfigurasi — `config.lua`

| Opsi | Default | Keterangan |
| --- | --- | --- |
| `Position` | `'bottom'` | `'bottom'` atau `'top'` |
| `Scale` | `1.0` | Skala HUD, `0.5`–`2.0` |
| `OffsetX` / `OffsetY` | `0` | Geser HUD dalam piksel |
| `UpdateInterval` | `60` | ms antar update (25–500) |
| `DriverOnly` | `false` | `true` = hanya tampil untuk pengemudi |
| `ShowStatusRow` | `true` | Baris sein/sabuk/lampu/gigi |
| `DefaultUnit` | `0` | `0` km/h · `1` mph · `2` knots |
| `UnitToggleKey` | `'J'` | Tombol ganti satuan (`''` = tanpa tombol) |
| `Seatbelt` | `true` | Aktifkan fitur sabuk |
| `Redline` | `{ start = 0.8, finish = 1.0 }` | Zona merah tachometer (0–1 skala penuh) |
| `SeatbeltKey` | `'B'` | Tombol toggle sabuk (`''` = tanpa tombol) |
| `Odometer.enabled` | `true` | `false` = odometer hanya selama sesi |
| `Odometer.saveInterval` | `30` | Detik antar penyimpanan per pemain |
| `Odometer.maxSpeed` | `120.0` | m/s, batas wajar validasi server |
| `Debug` | `false` | Log penyimpanan odometer di server |

Pilihan satuan terakhir pemain disimpan di KVP client, jadi tidak berubah setelah reconnect.

---

## API NUI (kompatibel template)

Semua fungsi juga tersedia sebagai fungsi global di dalam NUI (`window.setSpeed` dst.),
sama seperti template aslinya. Dari Lua, kirim lewat `SendNUIMessage`:

```lua
SendNUIMessage({ action = 'setSpeed', data = 12.5 })        -- m/s
SendNUIMessage({ action = 'setRPM', data = 0.42 })          -- 0..1 (RPM mentah juga diterima)
SendNUIMessage({ action = 'setFuel', data = 0.68 })         -- 0..1 (0..100 juga diterima)
SendNUIMessage({ action = 'setHealth', data = 0.9 })        -- 0..1 (0..1000 juga diterima)
SendNUIMessage({ action = 'setEngine', data = true })
SendNUIMessage({ action = 'setGear', data = '3' })
SendNUIMessage({ action = 'setHeadlights', data = 2 })      -- 0 off · 1 on · 2 high beam
SendNUIMessage({ action = 'setLeftIndicator', data = true })
SendNUIMessage({ action = 'setRightIndicator', data = true })
SendNUIMessage({ action = 'setSeatbelts', data = true })
SendNUIMessage({ action = 'setSpeedMode', data = 1 })       -- 0 km/h · 1 mph · 2 knots
SendNUIMessage({ action = 'setOdometer', data = 1234.5 })   -- satuan tampil aktif
SendNUIMessage({ action = 'setRedline', data = { start = 0.8, finish = 1.0 } })  -- zona merah RPM (0–1)
```

Resource ini sendiri mengirim satu snapshot per tick (lebih murah daripada 10 pesan terpisah):

```lua
SendNUIMessage({ action = 'update', data = {
    engine = true, speed = 12.5, rpm = 0.42, gear = '3', fuel = 0.68, health = 0.9,
    headlights = 1, left = false, right = false, seatbelt = true, odo = 1234.5, trip = 12.3,
} })
```

### Detail fungsi

| Fungsi | Parameter | Efek di cluster |
| --- | --- | --- |
| `setEngine(state)` | boolean | Cluster terang saat mesin hidup, meredup saat mati |
| `setSpeed(speed)` | m/s | Digit kecepatan (dikonversi sesuai satuan) |
| `setRPM(rpm)` | 0–1 | Bar tachometer + label 1–9 menyala progresif |
| `setFuel(fuel)` | 0–1 | Bar E–F, segmen cadangan merah saat ≤ 12% |
| `setHealth(health)` | 0–1 | Bar C–H: makin rusak mesin, makin panas |
| `setGear(gear)` | string/number | Huruf gigi + panah shift ▲ hijau (naik) / ▼ merah (turun) selama 700 ms |
| `setHeadlights(state)` | 0/1/2 | Ikon lampu, sorotan tambahan saat high beam |
| `setLeftIndicator(state)` | boolean | Panah kiri |
| `setRightIndicator(state)` | boolean | Panah kanan |
| `setSeatbelts(state)` | boolean | Ikon sabuk: merah saat tidak dipakai |
| `setSpeedMode(mode)` | 0/1/2 | Label satuan + konversi digit |
| `setOdometer(distance)` | number | 6 digit odometer |
| `setRedline(start, finish)` | 0–1, 0–1 | Geser zona merah tachometer (default 0.8–1.0) |

---

## Event & export (client)

| Nama | Jenis | Keterangan |
| --- | --- | --- |
| `speedometer:client:seatbeltChanged` | event | Dipancarkan saat sabuk di-toggle |
| `speedometer:client:setUnit` | event | `(0|1|2)` ganti satuan dari resource lain |
| `speedometer:client:setSeatbelt` | event | `(boolean)` sinkronkan state sabuk |
| `IsSeatbeltOn()` | export | `true`/`false` |
| `SetSeatbelt(bool)` / `ToggleSeatbelt()` | export | Ubah state sabuk |
| `SetUnit(mode)` | export | Ganti satuan |

Server:

| Event | Parameter | Keterangan |
| --- | --- | --- |
| `speedometer:server:requestOdometer` | `plate` | Balasan `speedometer:client:odometer` (`plate`, meter) |
| `speedometer:server:saveOdometer` | `plate`, `meter` | Simpan bila lolos validasi |

Contoh integrasi sabuk dengan resource lain:

```lua
AddEventHandler('speedometer:client:seatbeltChanged', function(state)
    TriggerEvent('my-seatbelt:set', state)
end)
```

---

## Integrasi bahan bakar custom

Bawaan memakai `GetVehicleFuelLevel`. Untuk sistem bahan bakar sendiri, ganti baris fuel
di `client/main.lua`:

```lua
-- sebelum: local fuel = clamp((GetVehicleFuelLevel(vehicle) or 0.0) / 100.0, 0.0, 1.0)
local level = exports['ox_fuel']:GetFuel(vehicle)   -- 0..100
local fuel = clamp((level or 0.0) / 100.0, 0.0, 1.0)
```

---

## Odometer: cara kerja & pengamanan

- Server menyimpan total **meter** per plat nomor di `data/odometer.json`, ditulis tiap 30 detik bila berubah.
- Client mengirim total setiap `Odometer.saveInterval` detik, saat ganti kendaraan, dan saat resource berhenti.
- Nilai tidak boleh turun (monotonic) dan pertambahannya dibatasi `maxSpeed × selang waktu + 250 m`,
  sehingga total yang dikirim pemain tidak bisa dilonjakkan seenaknya.
- Plat nomor dinormalisasi (hanya huruf/angka, maks 12 karakter) agar `ABC 123` dan `abc123` dianggap sama.
- Menghapus `data/odometer.json` (atau mengisinya `{}`) akan mereset semua odometer.

---

## Mengembangkan tampilan (mode demo)

Buka `html/index.html` langsung di browser (misal lewat static server lokal) untuk melihat cluster
beranimasi tanpa menjalankan FiveM. Bila dalam 1,2 detik tidak ada pesan NUI dari client,
`app.js` otomatis masuk mode demo; di dalam game client selalu mengirim data lebih dulu sehingga
mode ini tidak pernah aktif.

## Catatan teknis

- NUI hanya mengirim 1 pesan per tick (~16×/detik) dan berhenti total saat di luar kendaraan
  (`Wait(400)`), jadi idle hampir 0.00 ms.
- Semua elemen gauge dibuat sekali saat load; update hanya mengubah `class`/teks, bukan membuat ulang node.
- Font Rajdhani dibundel lokal supaya tidak bergantung koneksi internet di CEF.
- Latar NUI transparan dan `pointer-events: none`, jadi tidak pernah menahan input pemain.

## Troubleshooting

| Masalah | Solusi |
| --- | --- |
| HUD tidak muncul | Pastikan resource `started` dan pemain duduk di kendaraan |
| HUD terpotong / terlalu besar | Turunkan `Config.Scale`, atur `OffsetY` |
| Digit tidak bergerak | Cek `Config.UpdateInterval`; pastikan tidak ada resource HUD lain menimpa `ui_page` |
| Odometer selalu 0 | Cek izin tulis folder resource dan log server `odometer siap — N kendaraan tersimpan` |
| Font terlihat berbeda | File `html/fonts/*.woff2` tidak ikut tercopy |

## Kredit

API & konsep template: [tianmetal/jgvrp-speedometer-template](https://github.com/tianmetal/jgvrp-speedometer-template).
Desain cluster: `Speedometer Cluster.html`.
