--[[
    speedometer / client
    Membaca state kendaraan lalu mengirim snapshot ke cluster NUI.

    Kontrak pesan (lihat html/app.js):
        { action = 'update',       data = { engine, speed, rpm, gear, fuel, health,
                                            headlights, left, right, seatbelt, odo, trip } }
        { action = 'setConfig',    data = { position, scale, offsetX, offsetY, showStatusRow, unit } }
        { action = 'setVisible',   data = boolean }
        { action = 'setSpeedMode', data = 0|1|2 }
]]

local RESOURCE = GetCurrentResourceName()

-- 0 = km/h, 1 = mph, 2 = knots
local UNITS = {
    [0] = { speed = 3.6,       distance = 1000.0,   label = 'km/h' },
    [1] = { speed = 2.2369363, distance = 1609.344, label = 'mph' },
    [2] = { speed = 1.9438445, distance = 1852.0,   label = 'kn' },
}

local knownOdometers = {}   -- plate -> meter (cache dari server)

local state = {
    unit      = 0,
    seatbelt  = false,
    visible   = false,
    vehicle   = 0,
    plate     = nil,
    odometer  = 0.0,        -- meter
    trip      = 0.0,        -- meter, hanya selama sesi
    coords    = nil,
    lastSave  = 0,
}

local function clamp(value, min, max)
    value = tonumber(value) or min
    if value < min then return min end
    if value > max then return max end
    return value
end

local function ui(action, data)
    SendNUIMessage({ action = action, data = data })
end

local function normalizePlate(plate)
    if type(plate) ~= 'string' then return nil end
    plate = plate:gsub('[^%w]', ''):upper()
    if plate == '' then return nil end
    return plate:sub(1, 12)
end

local function pushConfig()
    ui('setConfig', {
        position     = Config.Position or 'bottom',
        scale        = clamp(Config.Scale or 1.0, 0.5, 2.0),
        offsetX      = tonumber(Config.OffsetX) or 0,
        offsetY      = tonumber(Config.OffsetY) or 0,
        showStatusRow = Config.ShowStatusRow ~= false,
        unit         = state.unit,
        redline      = {
            start  = clamp((Config.Redline or {}).start or 0.8, 0.0, 0.98),
            finish = clamp((Config.Redline or {}).finish or 1.0, 0.02, 1.0),
        },
    })
end

local function setVisible(visible)
    visible = visible and true or false
    if state.visible == visible then return end
    state.visible = visible
    ui('setVisible', visible)
end

local function setUnit(mode)
    mode = math.floor(tonumber(mode) or 0)
    if not UNITS[mode] then mode = 0 end
    state.unit = mode
    ui('setSpeedMode', mode)
    SetResourceKvp('unit', tostring(mode))
end

local function setSeatbelt(value)
    value = value and true or false
    if state.seatbelt == value then return end
    state.seatbelt = value
    TriggerEvent('speedometer:client:seatbeltChanged', value)
end

local function toggleSeatbelt()
    if Config.Seatbelt == false then return end
    setSeatbelt(not state.seatbelt)
end

local function gearLabel(vehicle, speed)
    local gear = GetVehicleCurrentGear(vehicle) or 0
    if gear > 0 then return tostring(gear) end
    if speed < -0.5 then return 'R' end
    return 'N'
end

local function persistOdometer()
    if not Config.Odometer or Config.Odometer.enabled == false then return end
    if not state.plate or state.odometer <= 0.0 then return end
    TriggerServerEvent('speedometer:server:saveOdometer', state.plate, state.odometer)
end

local function attachVehicle(vehicle)
    if state.vehicle ~= 0 then
        persistOdometer()
    end

    state.vehicle = vehicle
    state.plate = normalizePlate(GetVehicleNumberPlateText(vehicle))
    state.coords = GetEntityCoords(vehicle)
    state.trip = 0.0
    state.odometer = 0.0

    if state.plate then
        state.odometer = knownOdometers[state.plate] or 0.0
        TriggerServerEvent('speedometer:server:requestOdometer', state.plate)
    end
end

local function detachVehicle()
    if state.plate then
        persistOdometer()
    end
    state.vehicle = 0
    state.plate = nil
    state.coords = nil
end

local function updateVehicle(vehicle)
    local speed = GetEntitySpeed(vehicle) or 0.0
    local coords = GetEntityCoords(vehicle)

    if state.coords then
        local travelled = #(coords - state.coords)
        -- abaikan lompatan besar (teleport / respawn)
        if travelled > 0.0 and travelled < 50.0 then
            state.odometer = state.odometer + travelled
            state.trip = state.trip + travelled
        end
    end
    state.coords = coords

    local unit = UNITS[state.unit]
    local health = clamp((GetVehicleEngineHealth(vehicle) or 1000.0) / 1000.0, 0.0, 1.0)
    local fuel = clamp((GetVehicleFuelLevel(vehicle) or 0.0) / 100.0, 0.0, 1.0)
    local rpm = clamp(GetVehicleCurrentRpm(vehicle) or 0.0, 0.0, 1.0)

    local _, lightsOn, highBeams = GetVehicleLightsState(vehicle)
    local _, indicatorLeft, indicatorRight = GetVehicleIndicatorLights(vehicle)

    local headlights = 0
    if highBeams then
        headlights = 2
    elseif lightsOn then
        headlights = 1
    end

    ui('update', {
        engine     = GetIsVehicleEngineRunning(vehicle) and true or false,
        speed      = speed,
        rpm        = rpm,
        gear       = gearLabel(vehicle, speed),
        fuel       = fuel,
        health     = health,
        headlights = headlights,
        left       = indicatorLeft and true or false,
        right      = indicatorRight and true or false,
        seatbelt   = state.seatbelt,
        odo        = state.odometer / unit.distance,
        trip       = state.trip / unit.distance,
    })
end

-- ─────────────────────────────── loop utama ────────────────────────────────
CreateThread(function()
    Wait(300)

    local saved = tonumber(GetResourceKvpString('unit'))
    if saved and UNITS[saved] then
        state.unit = saved
    else
        state.unit = clamp(Config.DefaultUnit or 0, 0, 2)
    end

    pushConfig()
    ui('setSpeedMode', state.unit)
    ui('setVisible', false)

    while true do
        local ped = PlayerPedId()
        local vehicle = GetVehiclePedIsIn(ped, false)
        local allowed = vehicle ~= 0

        if allowed and Config.DriverOnly then
            allowed = GetPedInVehicleSeat(vehicle, -1) == ped
        end

        if allowed then
            if vehicle ~= state.vehicle then
                attachVehicle(vehicle)
            end

            updateVehicle(vehicle)
            setVisible(true)
            Wait(clamp(Config.UpdateInterval or 60, 25, 500))
        else
            if state.vehicle ~= 0 then
                detachVehicle()
            end
            setVisible(false)
            Wait(400)
        end
    end
end)

-- ─────────────────────────── penyimpanan berkala ───────────────────────────
CreateThread(function()
    while true do
        Wait(1000)
        local interval = ((Config.Odometer or {}).saveInterval or 30) * 1000
        if state.vehicle ~= 0 and state.plate and (GetGameTimer() - state.lastSave) >= interval then
            state.lastSave = GetGameTimer()
            persistOdometer()
        end
    end
end)

-- ───────────────────────────── event & perintah ────────────────────────────
RegisterNetEvent('speedometer:client:odometer', function(plate, meters)
    if type(plate) ~= 'string' or type(meters) ~= 'number' then return end
    knownOdometers[plate] = meters
    if state.plate == plate and state.odometer < meters then
        state.odometer = meters
    end
end)

RegisterNetEvent('speedometer:client:setUnit', function(mode)
    setUnit(mode)
end)

RegisterNetEvent('speedometer:client:setSeatbelt', function(value)
    setSeatbelt(value)
end)

RegisterCommand('speedometer:seatbelt', function()
    toggleSeatbelt()
end, false)

if Config.Seatbelt ~= false and type(Config.SeatbeltKey) == 'string' and Config.SeatbeltKey ~= '' then
    RegisterKeyMapping('speedometer:seatbelt', 'Toggle sabuk pengaman', 'keyboard', Config.SeatbeltKey)
end

RegisterCommand('speedometer:unit', function()
    setUnit((state.unit + 1) % 3)
end, false)

if type(Config.UnitToggleKey) == 'string' and Config.UnitToggleKey ~= '' then
    RegisterKeyMapping('speedometer:unit', 'Ganti satuan speedometer', 'keyboard', Config.UnitToggleKey)
end

exports('IsSeatbeltOn', function()
    return state.seatbelt
end)

exports('SetSeatbelt', function(value)
    setSeatbelt(value)
end)

exports('ToggleSeatbelt', function()
    toggleSeatbelt()
end)

exports('SetUnit', function(mode)
    setUnit(mode)
end)

AddEventHandler('onResourceStop', function(resource)
    if resource ~= RESOURCE then return end
    if state.plate then persistOdometer() end
end)
