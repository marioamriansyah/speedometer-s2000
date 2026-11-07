Config = {}

-- ─────────────────────────────────────────────────────────────────────────────
--  TAMPILAN (HUD)
-- ─────────────────────────────────────────────────────────────────────────────
Config.Position      = 'bottom'   -- 'bottom' | 'top'
Config.Scale         = 1.0        -- 0.5 – 2.0
Config.OffsetX       = 0          -- piksel, positif = ke kanan
Config.OffsetY       = 0          -- piksel, positif = ke bawah
Config.UpdateInterval = 60        -- ms antar update HUD saat berada di dalam kendaraan
Config.DriverOnly    = false      -- true = HUD hanya tampil untuk pengemudi
Config.ShowStatusRow = true       -- baris sein / sabuk / lampu / gigi di bawah cluster

-- ─────────────────────────────────────────────────────────────────────────────
--  SATUAN
-- ─────────────────────────────────────────────────────────────────────────────
Config.DefaultUnit   = 0          -- 0 = km/h, 1 = mph, 2 = knots
Config.UnitToggleKey = 'J'        -- tombol untuk ganti satuan ('' = tanpa tombol)

-- ─────────────────────────────────────────────────────────────────────────────
--  SABUK PENGAMAN
-- ─────────────────────────────────────────────────────────────────────────────
Config.Seatbelt     = true        -- false = fitur sabuk dimatikan
Config.SeatbeltKey  = 'B'         -- tombol toggle sabuk ('' = tanpa tombol)

-- ─────────────────────────────────────────────────────────────────────────────
--  ODOMETER (disimpan di server, per plat nomor)
-- ─────────────────────────────────────────────────────────────────────────────
Config.Odometer = {
    enabled      = true,          -- false = odometer hanya hidup selama sesi
    saveInterval = 30,            -- detik antar penyimpanan per pemain
    maxSpeed     = 120.0,         -- m/s; batas wajar untuk menolak lompatan odometer
}

-- ─────────────────────────────────────────────────────────────────────────────
--  ZONA REDLINE (batas RPM)
-- ─────────────────────────────────────────────────────────────────────────────
Config.Redline = {
    start  = 0.8,                 -- 0–1 dari skala penuh (0.8 = mulai 8 x1000 r/min)
    finish = 1.0,                 -- ujung zona merah
}

Config.Debug = false
