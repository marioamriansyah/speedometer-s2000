--[[
    speedometer / server
    Menyimpan odometer per plat nomor di data/odometer.json.

    Event:
        speedometer:server:requestOdometer (plate)         -> speedometer:client:odometer (plate, meters)
        speedometer:server:saveOdometer    (plate, total)  -> tersimpan bila lolos validasi
]]

local RESOURCE = GetCurrentResourceName()
local STORE_PATH = 'data/odometer.json'

local MIN_SAVE_INTERVAL = 3        -- detik, batas minimal antar penyimpanan per pemain
local MAX_PLATE_LENGTH = 12
local MAX_GROWTH_SLACK = 250.0     -- meter, toleransi pembulatan

local store = {}
local sessions = {}
local dirty = false

local function sanitizePlate(plate)
    if type(plate) ~= 'string' then return nil end
    plate = plate:gsub('[^%w]', ''):upper()
    if plate == '' then return nil end
    return plate:sub(1, MAX_PLATE_LENGTH)
end

local function countEntries()
    local total = 0
    for _ in pairs(store) do total = total + 1 end
    return total
end

local function loadStore()
    local raw = LoadResourceFile(RESOURCE, STORE_PATH)
    if type(raw) == 'string' and raw ~= '' then
        local ok, decoded = pcall(json.decode, raw)
        if ok and type(decoded) == 'table' then
            store = decoded
            return
        end
        print(('[%s] data odometer tidak bisa dibaca, mulai dari kosong'):format(RESOURCE))
    end
    store = {}
end

local function flush()
    if not dirty then return end
    local ok, encoded = pcall(json.encode, store)
    if not ok then
        print(('[%s] gagal menyandi data odometer: %s'):format(RESOURCE, tostring(encoded)))
        return
    end
    SaveResourceFile(RESOURCE, STORE_PATH, encoded, -1)
    dirty = false
end

local function getSession(src)
    local session = sessions[src]
    if not session then
        session = { lastSave = 0, lastRequest = 0 }
        sessions[src] = session
    end
    return session
end

RegisterNetEvent('speedometer:server:requestOdometer', function(plate)
    local src = source
    local key = sanitizePlate(plate)
    if not key then return end

    local now = os.time()
    local session = getSession(src)
    if now - (session.lastRequest or 0) < 1 then return end
    session.lastRequest = now

    TriggerClientEvent('speedometer:client:odometer', src, key, tonumber(store[key]) or 0)
end)

RegisterNetEvent('speedometer:server:saveOdometer', function(plate, total)
    local src = source
    local key = sanitizePlate(plate)
    if not key or type(total) ~= 'number' or total ~= total or total < 0 then return end

    local now = os.time()
    local session = getSession(src)
    if now - (session.lastSave or 0) < MIN_SAVE_INTERVAL then return end

    local stored = tonumber(store[key]) or 0.0
    local elapsed = math.max(now - (session.lastSave or 0), 1)
    session.lastSave = now

    local maxSpeed = (Config.Odometer and Config.Odometer.maxSpeed) or 120.0
    local maxGrowth = maxSpeed * elapsed + MAX_GROWTH_SLACK

    local value = total
    if value < stored then value = stored end
    if value - stored > maxGrowth then value = stored + maxGrowth end
    if value - stored < 0.5 then return end

    store[key] = math.floor(value * 10.0 + 0.5) / 10.0
    dirty = true

    if Config.Debug then
        print(('[%s] %s  %s  +%.1f m  (total %.1f m)'):format(
            RESOURCE, GetPlayerName(src) or ('id ' .. src), key, store[key] - stored, store[key]))
    end
end)

AddEventHandler('playerDropped', function()
    sessions[source] = nil
end)

CreateThread(function()
    loadStore()
    print(('[%s] odometer siap — %d kendaraan tersimpan'):format(RESOURCE, countEntries()))

    while true do
        Wait(30000)
        flush()
    end
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= RESOURCE then return end
    flush()
end)
