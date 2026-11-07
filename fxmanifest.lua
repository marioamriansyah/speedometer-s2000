fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'tianmetal (template) — kompatibel FiveM'
description 'Digital instrument cluster speedometer (speed, RPM, fuel, temperature, odometer)'
version '1.0.0'

shared_scripts {
    'config.lua',
}

client_scripts {
    'client/main.lua',
}

server_scripts {
    'server/main.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/app.js',
    'html/fonts/*.woff2',
}
