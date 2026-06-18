// ============================================================
// Mass Attack Planner — main entry script
// Source: https://twscripts.dev/scripts/massAttackPlanner.js
// Helper (loaded at runtime): https://ts0hgx.github.io/Scripts/MassPlannerHelper.js
// Author: TS0HGx  |  Repo: github.com/TS0HGx/Scripts
// ============================================================

var scriptData = {
    name: 'Planeador de ataque em Massa',
    version: ' ',
    author: ' ',
    authorUrl: ' ',
    helpLink: ' ',
};

// User Input
if (typeof DEBUG !== 'boolean') DEBUG = false;

// Local Storage
var LS_PREFIX = `ra_massAttackPlanner_`;
var TIME_INTERVAL = 60 * 60 * 1000 * 24 * 30; /* fetch data every 30 days */
var LAST_UPDATED_TIME = localStorage.getItem(`${LS_PREFIX}_last_updated`) ?? 0;

var unitInfo;

// Init Debug
initDebug();

/* Fetch unit info only when needed */
(function () {
    if (LAST_UPDATED_TIME !== null) {
        if (Date.parse(new Date()) >= LAST_UPDATED_TIME + TIME_INTERVAL) {
            fetchUnitInfo();
        } else {
            unitInfo = JSON.parse(
                localStorage.getItem(`${LS_PREFIX}_unit_info`)
            );
            init(unitInfo);
        }
    } else {
        fetchUnitInfo();
    }
})();

// Script Initializer
function init(unitInfo) {
    var currentDateTime = getCurrentDateTime();

    // fix for no paladin worlds
    let knightSpeed = 0;
    const worldUnits = game_data.units;
    if (worldUnits.includes('knight')) {
        knightSpeed = unitInfo?.config['knight'].speed || 0;
    } else {
        jQuery('#support_unit option[data-option-unit="knight"]').attr('disabled');
    }

    const content = `
        <div class="ra-mb15">
            <label for="arrival_time">Hora de chegada</label>
            <input id="arrival_time" type="text" placeholder="yyyy-mm-dd hh:mm:ss" value="${currentDateTime}">
        </div>
        <input type="hidden" id="nobleSpeed" value="${unitInfo.config['snob'].speed}" />
        <div class="ra-flex">
            <div class="ra-flex-6">
                <div class="ra-mb15">
                    <label for="nuke_unit">Unidade mais Lenta</label>
                    <select id="nuke_unit">
                        <option value="${unitInfo.config['axe'].speed}">Machado</option>
                        <option value="${unitInfo.config['light'].speed}">Leve/Paladino</option>
                        <option value="${unitInfo.config['heavy'].speed}">Pesada</option>
                        <option value="${unitInfo.config['ram'].speed}" selected="selected">Aríete/Catas</option>
                    </select>
                </div>
            </div>
            <div class="ra-flex-6">
                <div class="ra-mb15">
                    <label for="support_unit">Unidade de suporte mais lenta</label>
                    <select id="support_unit">
                        <option value="${unitInfo.config['spear'].speed}">Lanceiros/Arqueiros</option>
                        <option value="${unitInfo.config['sword'].speed}" selected="selected">Espadas</option>
                        <option value="${unitInfo.config['spy'].speed}">Batedores</option>
                        <option value="${knightSpeed}" data-option-unit="knight">Paladino</option>
                        <option value="${unitInfo.config['heavy'].speed}">Pesada</option>
                        <option value="${unitInfo.config['catapult'].speed}">Catas</option>
                    </select>
                </div>
            </div>
        </div>
        <div class="ra-mb15">
            <label for="target_coords">Coordenadas Alvo</label>
            <textarea id="target_coords"></textarea>
        </div>
        <div class="ra-flex">
            <div class="ra-flex-4">
                <div class="ra-mb15">
                    <label for="nobel_coords">Coordenadas Nobres</label>
                    <textarea id="nobel_coords"></textarea>
                </div>
                <div class="ra-mb15">
                    <label for="nobel_count">Nobres por Alvo</label>
                    <input id="nobel_count" type="text" value="1">
                </div>
            </div>
            <div class="ra-flex-4">
                <div class="ra-mb15">
                    <label for="nuke_coords">Coordenadas Fulls</label>
                    <textarea id="nuke_coords"></textarea>
                </div>
                <div class="ra-mb15">
                    <label for="nuke_count">Fulls por Alvo</label>
                    <input id="nuke_count" type="text" value="1">
                </div>
            </div>
            <div class="ra-flex-4">
                <div class="ra-mb15">
                    <label for="support_coords">Coordenadas de Apoio</label>
                    <textarea id="support_coords"></textarea>
                </div>
                <div class="ra-mb15">
                    <label for="support_count">Apoio por aldeia</label>
                    <input id="support_count" type="text" value="1">
                </div>
            </div>
        </div>
        <div class="ra-mb15">
            <a id="submit_btn" class="button" onClick="handleSubmit();">Criar plano!</a>
        </div>
        <div class="ra-mb15">
            <label for="results">Resultados</label>
            <textarea id="results"></textarea>
        </div>
    `;

    const windowContent = prepareWindowContent(content);
    attackPlannerWindow = window.open(
        '',
        '',
        'left=10px,top=10px,width=480,height=670,toolbar=0,resizable=0,location=0,menubar=0,scrollbars=0,status=0'
    );
    attackPlannerWindow.document.write(windowContent);
}

// Helper: Window Content
function prepareWindowContent(windowBody) {
    const windowHeader = `<h1 class="ra-fs18 ra-fw600">${scriptData.name}</h1>`;
    const windowFooter = `<small><strong>${scriptData.name} ${scriptData.version}</strong> - <a href="${scriptData.authorUrl}" target="_blank" rel="noreferrer noopener">${scriptData.author}</a> - <a href="${scriptData.helpLink}" target="_blank" rel="noreferrer noopener">Help</a></small>`;
    const windowStyle = `
    <style>
        body { background-color: #f4e4bc; font-family: Verdana, Arial, sans-serif; font-size: 14px; line-height: 1; }
        main { max-width: 768px; margin: 0 auto; }
        h1 { font-size: 27px; }
        a { font-weight: 700; text-decoration: none; color: #603000; }
        small { font-size: 10px; }
        input[type="text"],
        select { display: block; width: 100%; height: auto; line-height: 1; box-sizing: border-box; padding: 5px; outline: none; border: 1px solid #999; }
        input[type="text"]:focus { outline: none; box-shadow: none; border: 1px solid #603000; background-color: #eee; }
        label { font-weight: 600; display: block; margin-bottom: 5px; font-size: 12px; }
        textarea { width: 100%; height: 80px; box-sizing: border-box; padding: 5px; resize: none; }
        textarea:focus { box-shadow: none; outline: none; border: 1px solid #603000; background-color: #eee; }
        .ra-mb15 { margin-bottom: 15px; }
        .ra-flex { display: flex; flex-flow: row wrap; justify-content: space-between; }
        .ra-flex-6 { flex: 0 0 48%; }
        .ra-flex-4 { flex: 0 0 30%; }
        .button { padding: 10px 20px; background-color: #603000; font-weight: 500; color: #fff; text-align: center; display: inline-block; cursor: pointer; text-transform: uppercase; }
    </style>
    `;

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${scriptData.name} ${scriptData.version}</title>
        ${windowStyle}
    </head>
    <body>
        <main>
            ${windowHeader}
            ${windowBody}
            ${windowFooter}
        </main>
        <script>
            function loadJS(url, callback) {
                var scriptTag = document.createElement('script');
                scriptTag.src = url;
                scriptTag.onload = callback;
                scriptTag.onreadystatechange = callback;
                document.body.appendChild(scriptTag);
            }
            // jQuery + helper are loaded into the popup window at runtime
            loadJS('https://code.jquery.com/jquery-3.6.0.min.js', function() {
                loadJS('https://ts0hgx.github.io/Scripts/MassPlannerHelper.js', function() {
                    console.log('Helper libraries loaded!');
                    // handleSubmit() and other logic live in MassPlannerHelper.js
                });
            });
        <\/script>
    </body>
    </html>
    `;

    return html;
}

// ---------------------------------------------------------------
// Helper functions (also in MassPlannerHelper.js for popup scope)
// ---------------------------------------------------------------

function fetchUnitInfo() {
    // Fetches unit speed data from the game's XML endpoint and caches it
    jQuery.get('/interface.php?func=get_unit_info', function (data) {
        unitInfo = xmlToJson(data);
        localStorage.setItem(`${LS_PREFIX}_unit_info`, JSON.stringify(unitInfo));
        localStorage.setItem(`${LS_PREFIX}_last_updated`, Date.parse(new Date()));
        init(unitInfo);
    });
}

function getCurrentDateTime() {
    // Returns current server time formatted as yyyy-mm-dd hh:mm:ss
    const serverDate = document.getElementById('serverDate').textContent;
    const serverTime = document.getElementById('serverTime').textContent;
    const [day, month, year] = serverDate.split('/');
    return `${year}-${month}-${day} ${serverTime}`;
}

function initDebug() {
    if (DEBUG) {
        console.log('DEBUG mode enabled');
    }
}

function xmlToJson(xml) {
    // Converts the XML unit info response to a JSON-friendly object
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const units = {};
    doc.querySelectorAll('config > *').forEach(node => {
        units[node.tagName] = {};
        node.querySelectorAll('*').forEach(child => {
            units[node.tagName][child.tagName] = isNaN(child.textContent)
                ? child.textContent
                : parseFloat(child.textContent);
        });
    });
    return { config: units };
}
