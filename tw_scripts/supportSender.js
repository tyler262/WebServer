// made by Costache Madalin (lllll llll)
// discord: costache madalin#8472
// Source: twdevtools/approved  scripts/supportSender.js

let url = window.location.href;
var countApiKey = "support_sender";
var countNameSpace = "madalinoTribalWarsScripts";

if (!url.includes("screen=place&mode=call")) {
    alert("this script must be run from Rally point-> Mass support");
    window.location.href = game_data.link_base_pure + "place&mode=call";
}

var units = game_data.units;
var unitsLength = units.length;
if (units.includes("snob"))    unitsLength--;
if (units.includes("militia")) unitsLength--;
if (units.includes("knight"))  unitsLength--;

units = Array.from(game_data.units.slice()).filter(value => {
    return value != "snob" && value != "militia" && value != "knight";
});

var troupesPop = {
    spear: 1, sword: 1, axe: 1, archer: 1,
    spy: 2, light: 4, marcher: 5, heavy: 6,
    ram: 5, catapult: 8, knight: 10, snob: 100
};
troupesPop.heavy = heavyCav; // set by bookmarklet before $.getScript call

var keepTroopsHome = 21;

function httpGet(theUrl) {
    var xmlHttp = new XMLHttpRequest();
    xmlHttp.open("GET", theUrl, false); // synchronous
    xmlHttp.send(null);
    return xmlHttp.responseText;
}

// ── Theme colours ──────────────────────────────────────────────
var headerWood = "#001a33";
var headerWoodEven = "#002e5a";
var headerStone = "#3b3b00";
var headerStoneEven = "#626200";
var headerIron = "#1e003b";
var headerIronEven = "#3c0076";

var defaultTheme = '[["theme1",["#E0E0E0","#000000","#C5979D","#2B193D","#2C365E","#484D6D","#4B8F8C","50"]],["currentTheme","theme1"],["theme2",["#E0E0E0","#000000","#F76F8E","#113537","#37505C","#445552","#294D4A","50"]],["theme3",["#E0E0E0","#000000","#ACFCD9","#190933","#665687","#7C77B9","#623B5A","50"]],["theme4",["#E0E0E0","#000000","#181F1C","#60712F","#274029","#315C2B","#214F4B","50"]],["theme5",["#E0E0E0","#000000","#9AD1D4","#007EA7","#003249","#1F5673","#1C448E","50"]],["theme6",["#E0E0E0","#000000","#EA8C55","#81171B","#540804","#710627","#9E1946","50"]],["theme7",["#E0E0E0","#000000","#754043","#37423D","#171614","#3A2618","#523A34","50"]],["theme8",["#E0E0E0","#000000","#9E0031","#8E0045","#44001A","#600047","#770058","50"]],["theme9",["#E0E0E0","#000000","#C1BDB3","#5F5B6B","#323031","#3D3B3C","#575366","50"]],["theme10",["#E0E0E0","#000000","#E6BCCD","#29274C","#012A36","#14453D","#7E52A0","50"]]]';
var localStorageThemeName = "supportSenderTheme";

if (localStorage.getItem(localStorageThemeName) != undefined) {
    let mapTheme = new Map(JSON.parse(localStorage.getItem(localStorageThemeName)));
    Array.from(mapTheme.keys()).forEach((key) => {
        if (key != "currentTheme") {
            let listColors = mapTheme.get(key);
            if (listColors.length == 7) {
                listColors.push(50);
                mapTheme.set(key, listColors);
            }
        }
    });
    localStorage.setItem(localStorageThemeName, JSON.stringify(Array.from(mapTheme.entries())));
}

var textColor = "#ffffff";
var backgroundInput = "#000000";
var borderColor = "#C5979D";
var backgroundContainer = "#2B193D";
var backgroundHeader = "#2C365E";
var backgroundMainTable = "#484D6D";
var backgroundInnerTable = "#4B8F8C";
var widthInterface = 50; // percentage
var headerColorDarken = -50;
var headerColorAlternateTable = -30;
var headerColorAlternateHover = 30;
var backgroundAlternateTableEven = backgroundContainer;
var backgroundAlternateTableOdd = getColorDarker(backgroundContainer, headerColorAlternateTable);

// ── Entry point ────────────────────────────────────────────────
async function main() {
    initializationTheme();
    await $.getScript("https://dl.dropboxusercontent.com/s/i5c0so9hwsizogm/styleCSSGlobal.js?dl=0");
    createMainInterface();
    changeTheme();
    addEvents();
    hitCountApi();
}
main();

// ── Colour utilities ───────────────────────────────────────────
function getColorDarker(hexInput, percent) {
    let hex = hexInput.replace(/^\s*#|\s*$/g, "");
    if (hex.length === 3) hex = hex.replace(/(.)/g, "$1$1");
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);
    const calculatedPercent = (100 + percent) / 100;
    r = Math.round(Math.min(255, Math.max(0, r * calculatedPercent)));
    g = Math.round(Math.min(255, Math.max(0, g * calculatedPercent)));
    b = Math.round(Math.min(255, Math.max(0, b * calculatedPercent)));
    return `#${("00" + r.toString(16)).slice(-2).toUpperCase()}${("00" + g.toString(16)).slice(-2).toUpperCase()}${("00" + b.toString(16)).slice(-2).toUpperCase()}`;
}

// ── UI builder ─────────────────────────────────────────────────
function createMainInterface() {
    let rowsSpawnButtons  = (game_data.units.includes("archer") == true) ? 7 : 6;
    let rowsSpawnDatetimes = (game_data.units.includes("archer") == true) ? 4 : 3;

    let html = `
    <div id="div_container" class="scriptContainer">
        <div class="scriptHeader">
            <div style="margin-top:10px;"><h2>Support sender</h2></div>
            <div style="position:absolute;top:10px;right:10px;">
                <a href="#" onclick="$('#div_container').remove()">
                    <img src="https://img.icons8.com/emoji/24/000000/cross-mark-button-emoji.png"/>
                </a>
            </div>
            <div style="position:absolute;top:8px;right:35px;" id="div_minimize">
                <a href="#"><img src="https://img.icons8.com/plasticine/28/000000/minimize-window.png"/></a>
            </div>
            <div style="position:absolute;top:10px;right:60px;" id="div_theme">
                <a href="#" onclick="$('#theme_settings').toggle()">
                    <img src="https://img.icons8.com/material-sharp/24/fa314a/change-theme.png"/>
                </a>
            </div>
        </div>
        <div id="theme_settings"></div>
        <div id="div_body">
            <table id="table_upload" class="scriptTable">
                <tr><td>troops</td>`;

    for (let i = 0; i < units.length; i++) {
        if (!["knight","snob","militia","axe","light","ram","catapult","marcher"].includes(units[i])) {
            html += `<td class="fm_unit"><img src="https://dsen.innogamescdn.com/asset/1d2499b/graphic/unit/unit_${units[i]}.png"></td>`;
        }
    }
    html += `<td>pop</td></tr>`;

    // ── Total row ──────────────────────────────────────────────
    html += `<tr id="totalTroops"><td>total</td>`;
    for (let i = 0; i < units.length; i++) {
        if (!["knight","snob","militia","axe","light","ram","catapult","marcher"].includes(units[i])) {
            html += `<td>
                <input id="${units[i]}total" value="0" type="text" class="totalTroops scriptInput" disabled>
                <font color="${textColor}" class="hideMobile">k</font>
            </td>`;
        }
    }
    html += `<td>
        <input id="packets_total" value="0" type="text" class="scriptInput" disabled>
        <font color="${textColor}" class="hideMobile">k</font>
    </td></tr>`;

    // ── Send row ───────────────────────────────────────────────
    html += `<tr id="sendTroops"><td>send</td>`;
    for (let i = 0; i < units.length; i++) {
        if (!["knight","snob","militia","axe","light","ram","catapult","marcher"].includes(units[i])) {
            html += `<td align="center">
                <input id="${units[i]}total" value="0" type="number" class="scriptInput sendTroops">
                <font color="${textColor}" class="hideMobile">k</font>
            </td>`;
        }
    }
    html += `<td align="center">
        <input id="packets_send" value="0" type="number" class="scriptInput">
        <font color="${textColor}" class="hideMobile">k</font>
    </td></tr>`;

    // ── Reserve row ────────────────────────────────────────────
    html += `<tr id="reserveTroops"><td>reserve</td>`;
    for (let i = 0; i < units.length; i++) {
        if (!["knight","snob","militia","axe","light","ram","catapult","marcher"].includes(units[i])) {
            html += `<td align="center">
                <input id="${units[i]}Reserve" value="0" type="number" class="scriptInput reserveTroops">
                <font color="${textColor}" class="hideMobile">k</font>
            </td>`;
        }
    }
    html += `<td align="center">
        <input id="packets_reserve" value="0" type="text" class="scriptInput" disabled>
        <font color="${textColor}" class="hideMobile">k</font>
    </td></tr>`;

    html += `
                <tr>
                    <td colspan="1">
                        <center>
                            <font color="${textColor}"> sigil:</font>
                            <input type="number" id="flag_boost" class="scriptInput" min="0" max="100" placeholder="0" value="0" style="text-align:center">
                        </center>
                    </td>
                    <td colspan="2">
                        <center>
                            <input type="checkbox" id="checkbox_window" value="land_specific">
                            <font color="${textColor}"> packets land between:</font>
                        </center>
                    </td>
                    <td colspan="${rowsSpawnDatetimes}">
                        <center style="margin:5px">start:<input type="datetime-local" id="start_window" style="text-align:center;"></center>
                        <center style="margin:5px">end:  <input type="datetime-local" id="stop_window"  style="text-align:center;"></center>
                    </td>
                </tr>
                <tr>
                    <td colspan="${rowsSpawnButtons}">
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" id="fillInputs" onclick="fillInputs()">Fill inputs</button>
                        <button type="button" class="btn evt-confirm-btn btn-confirm-yes" onclick="countTotalTroops()">Calculate</button>
                    </td>
                </tr>
            </table>
        </div>
        <div class="scriptFooter">
            <div style="margin-top:5px;"><h5>made by Costache</h5></div>
        </div>
    </div>`;

    $("#div_container").remove();
    $("#contentContainer").eq(0).prepend(html);
    $("#mobileContent").eq(0).prepend(html);

    $("#div_container").css("position", "fixed").draggable();

    $("#div_minimize").on("click", () => {
        let currentWidthPercentage = Math.ceil($('#div_container').width() / $('body').width() * 100);
        if (currentWidthPercentage >= widthInterface) {
            $('#div_container').css({ 'width': '10%' });
            $('#div_body').hide();
        } else {
            $('#div_container').css({ 'width': `${widthInterface}%` });
            $('#div_body').show();
        }
    });

    // Restore saved settings
    if (localStorage.getItem(game_data.world + "support_sender_settings2") != null) {
        let list_checkbox = JSON.parse(localStorage.getItem(game_data.world + "support_sender_settings2"))[0];
        $('#table_upload input[type=checkbox]').each(function (index) { this.checked = list_checkbox[index]; });
        let list_input = JSON.parse(localStorage.getItem(game_data.world + "support_sender_settings2"))[1];
        $('#table_upload input').each(function (index) { this.value = list_input[index]; });
        $('.totalTroops').each(function () { this.value = 0; });
        $("#packets_total").val(0);
    }

    // Auto-save settings on any change
    $("#table_upload input[type=checkbox], #table_upload input").on("click input change", () => {
        countTotalTroops();
        let list_checkbox = [];
        let list_input = [];
        $('#table_upload input[type=checkbox]').each(function () { list_checkbox.push(this.checked); });
        $('#table_upload input').each(function () { list_input.push(this.value); });
        let data = JSON.stringify([list_checkbox, list_input]);
        if (data != localStorage.getItem(game_data.world + "support_sender_settings2")) {
            localStorage.setItem(game_data.world + "support_sender_settings2", data);
        }
    });

    if (game_data.device != "desktop") {
        $(".hideMobile").hide();
        $("#table_upload").find("input[type=text]").css("width", "100%");
    }
}

// ── Core logic ─────────────────────────────────────────────────
function countTotalTroops() {
    let dateStart = new Date();
    let dateStop  = new Date();
    dateStart.setFullYear(dateStart.getFullYear() - 1);
    dateStop.setFullYear(dateStop.getFullYear() + 1);

    let sigil = 0;
    let timeWindow = document.getElementById("checkbox_window").checked;
    if (timeWindow) {
        dateStart = new Date(document.getElementById("start_window").value);
        dateStop  = new Date(document.getElementById("stop_window").value);
        sigil     = parseInt(document.getElementById("flag_boost").value);
        if (dateStart == "Invalid Date") UI.ErrorMessage("start date has an invalid format", 2000);
        if (dateStop  == "Invalid Date") UI.ErrorMessage("stop date has an invalid format",  2000);
        sigil = (Number.isNaN(sigil)) ? 0 : sigil;
    }

    let mapVillages = new Map();

    let coordDestination;
    if (game_data.device == "desktop")
        coordDestination = $(".village-name").text().match(/\d+\|\d+/)[0];
    else
        coordDestination = $("#inputx").val() + "|" + $("#inputy").val();

    let speedWorld  = getSpeedConstant().worldSpeed;
    let speedTroupes = getSpeedConstant().unitSpeed;

    // Travel time per unit type in ms per map unit of distance
    let speedTroop = {
        snob:     2100 * 1000 / (speedWorld * speedTroupes),
        ram:      1800 * 1000 / (speedWorld * speedTroupes),
        catapult: 1800 * 1000 / (speedWorld * speedTroupes),
        sword:    1320 * 1000 / (speedWorld * speedTroupes),
        axe:      1080 * 1000 / (speedWorld * speedTroupes),
        spear:    1080 * 1000 / (speedWorld * speedTroupes),
        archer:   1080 * 1000 / (speedWorld * speedTroupes),
        heavy:     660 * 1000 / (speedWorld * speedTroupes),
        light:     600 * 1000 / (speedWorld * speedTroupes),
        marcher:   600 * 1000 / (speedWorld * speedTroupes),
        knight:    600 * 1000 / (speedWorld * speedTroupes),
        spy:       540 * 1000 / (speedWorld * speedTroupes),
    };

    Array.from($("#village_troup_list tbody tr")).forEach(row => {
        let coord    = row.children[0].innerText.match(/\d+\|\d+/)[0];
        let distance = calcDistance(coord, coordDestination);
        let objTroops = { distance };

        units.forEach(troopName => {
            let totalTroops  = parseInt($(row).find(`[data-unit='${troopName}']`).text());
            let reserveTroops = parseFloat($(`#${troopName}Reserve`).val());
            reserveTroops = (Number.isNaN(reserveTroops)) ? 0 : reserveTroops * 1000;
            totalTroops = (totalTroops > reserveTroops) ? totalTroops - reserveTroops : 0;

            let timeTroop = speedTroop[troopName] * distance;
            timeTroop = timeTroop / (1 + sigil / 100.0);

            let serverTime = document.getElementById("serverTime").innerText;
            let serverDate = document.getElementById("serverDate").innerText.split("/");
            serverDate = serverDate[1] + "/" + serverDate[0] + "/" + serverDate[2];
            let date_current = new Date(new Date(serverDate + " " + serverTime).getTime() + timeTroop);

            if (totalTroops > 0 && dateStart.getTime() < date_current.getTime() && date_current.getTime() < dateStop.getTime()) {
                objTroops[troopName + "_speed"] = troopName;
            }
            objTroops[troopName] = totalTroops;

            if (!timeWindow) {
                delete objTroops.ram;
                delete objTroops.catapult;
                delete objTroops.ram_speed;
                delete objTroops.catapult_speed;
            }
        });

        mapVillages.set(coord, objTroops);
    });

    let objTroopsTotal = { spear: 0, sword: 0, archer: 0, spy: 0, heavy: 0, totalPop: 0 };

    Array.from(mapVillages.keys()).forEach(key => {
        let obj = mapVillages.get(key);
        if (obj.ram_speed || obj.catapult_speed || obj.sword_speed) {
            objTroopsTotal.spear += obj.spear;
            objTroopsTotal.sword += obj.sword;
            objTroopsTotal.spy   += obj.spy;
            objTroopsTotal.heavy += obj.heavy;
            if (obj.archer != undefined) objTroopsTotal.archer += obj.archer;
        } else if (obj.spear_speed || obj.archer_speed) {
            objTroopsTotal.spear += obj.spear;
            objTroopsTotal.heavy += obj.heavy;
            objTroopsTotal.spy   += obj.spy;
            if (obj.archer != undefined) objTroopsTotal.archer += obj.archer;
        } else if (obj.heavy_speed) {
            objTroopsTotal.heavy += obj.heavy;
            objTroopsTotal.spy   += obj.spy;
        } else if (obj.spy_speed) {
            objTroopsTotal.spy += obj.spy;
        }
    });

    if (!game_data.units.includes("archer")) delete objTroopsTotal.archer;

    let totalPop = 0;
    Object.keys(objTroopsTotal).forEach(key => {
        if (["spear","sword","archer","spy","heavy"].includes(key) && units.includes(key)) {
            document.getElementById(key + "total").value = (objTroopsTotal[key] / 1000).toFixed(2);
        }
        if (["spear","sword","archer"].includes(key)) totalPop += objTroopsTotal[key];
        else if (key == "heavy") totalPop += objTroopsTotal[key] * heavyCav;
    });

    document.getElementById("packets_total").value = (totalPop / 1000).toFixed(2);
    addEvents();
    return mapVillages;
}

function fillInputs() {
    let mapVillages = countTotalTroops();
    let listTotal   = [];

    let troopsTotal  = Array.from(document.getElementsByClassName("totalTroops")).map(e => parseFloat(e.value) * 1000);
    let sendTotalObj = {};
    let sendTotal    = Array.from(document.getElementsByClassName("sendTroops")).map(e => ({
        value:     (Number.isNaN(parseFloat(e.value) * 1000) ? 0 : parseFloat(e.value) * 1000),
        troopName: e.id.replace("total", "")
    }));
    sendTotal.forEach(e => { sendTotalObj[e.troopName] = e.value; });

    for (let i = 0; i < troopsTotal.length; i++) {
        if (troopsTotal[i] < sendTotal[i].value) { alert("wrong input\n not enough troops"); return; }
    }

    // Select all village checkboxes
    let checkbox = document.getElementById("village_troup_list").children[0].children[0].getElementsByTagName("input");
    for (let i = 0; i < checkbox.length - 1; i++) {
        let id = checkbox[i].id.split("_")[1];
        checkbox[i].checked = ["spear","sword","archer","spy","heavy","ram","catapult"].includes(id);
    }
    document.getElementById("place_call_select_all").click();
    $("#village_troup_list").find("input[type=number]:visible").val(0);

    // Build per-village allocation objects based on slowest unit available
    Array.from(mapVillages.keys()).forEach(key => {
        let obj     = mapVillages.get(key);
        let objTotal = { coord: key };
        const assign = troopName => (sendTotalObj[troopName] > 0) ? obj[troopName] : 0;

        if (obj.ram_speed) {
            objTotal.ram = 1; objTotal.catapult = 0; objTotal.speedTroop = "ram";
            objTotal.sword = assign("sword"); objTotal.spear = assign("spear");
            objTotal.heavy = assign("heavy"); objTotal.spy   = assign("spy");
            if (obj.archer != undefined) objTotal.archer = assign("archer");
        } else if (obj.catapult_speed) {
            objTotal.ram = 0; objTotal.catapult = 1; objTotal.speedTroop = "catapult";
            objTotal.sword = assign("sword"); objTotal.spear = assign("spear");
            objTotal.heavy = assign("heavy"); objTotal.spy   = assign("spy");
            if (obj.archer != undefined) objTotal.archer = assign("archer");
        } else if (obj.sword_speed) {
            objTotal.ram = 0; objTotal.catapult = 0; objTotal.speedTroop = "sword";
            objTotal.sword = assign("sword"); objTotal.spear = assign("spear");
            objTotal.heavy = assign("heavy"); objTotal.spy   = assign("spy");
            if (obj.archer != undefined) objTotal.archer = assign("archer");
        } else if (obj.spear_speed) {
            objTotal.ram = 0; objTotal.catapult = 0; objTotal.sword = 0; objTotal.speedTroop = "spear";
            objTotal.spear = assign("spear"); objTotal.heavy = assign("heavy"); objTotal.spy = assign("spy");
            if (obj.archer != undefined) objTotal.archer = assign("archer");
        } else if (obj.archer_speed) {
            objTotal.ram = 0; objTotal.catapult = 0; objTotal.sword = 0; objTotal.speedTroop = "archer";
            objTotal.spear = assign("spear"); objTotal.heavy = assign("heavy"); objTotal.spy = assign("spy");
            if (obj.archer != undefined) objTotal.archer = assign("archer");
        } else if (obj.heavy_speed) {
            objTotal.ram = 0; objTotal.catapult = 0; objTotal.sword = 0; objTotal.spear = 0; objTotal.speedTroop = "heavy";
            objTotal.spy = obj.spy; objTotal.heavy = assign("heavy");
            if (obj.archer != undefined) objTotal.archer = 0;
        } else if (obj.spy_speed) {
            objTotal.ram = 0; objTotal.catapult = 0; objTotal.sword = 0; objTotal.spear = 0; objTotal.heavy = 0;
            objTotal.spy = assign("spy"); objTotal.speedTroop = "spy";
            if (obj.archer != undefined) objTotal.archer = 0;
        }
        objTotal.axe = 0; objTotal.light = 0;
        if (obj.marcher != undefined) objTotal.marcher = 0;
        listTotal.push(objTotal);
    });

    let listTotalRange = listTotal.filter(r => r.speedTroop != undefined);

    // Proportional distribution across villages
    let factorTroopSent = {};
    sendTotal.forEach(elem => { factorTroopSent[elem.troopName] = elem.value / listTotalRange.length; });

    let mapResult = new Map();
    Object.keys(factorTroopSent).forEach(troopName => {
        let factorValue = factorTroopSent[troopName];
        listTotalRange.sort((o1, o2) => o1[troopName] > o2[troopName] ? 1 : o1[troopName] < o2[troopName] ? -1 : 0);

        for (let i = 0; i < listTotalRange.length; i++) {
            let troopValue = listTotalRange[i][troopName];
            if (troopValue < factorValue) {
                let redistribute = factorValue - troopValue;
                factorValue += redistribute / (listTotalRange.length - i - 1);
                listTotalRange[i][troopName] = troopValue;
            } else {
                let module = factorValue % parseInt(factorValue);
                if (listTotalRange[i][troopName] + 1 > factorValue) {
                    listTotalRange[i][troopName] = parseInt(factorValue) + ((Math.random() < module) ? 1 : 0);
                } else {
                    listTotalRange[i][troopName] = factorValue;
                }
            }
            let timeWindow = document.getElementById("checkbox_window").checked;
            if (listTotalRange[i].speedTroop == troopName && listTotalRange[i][troopName] == 0 && timeWindow) {
                listTotalRange[i][troopName] = 1;
            }
            if (!timeWindow) {
                listTotalRange[i].ram      = 0;
                listTotalRange[i].catapult = 0;
            }
            mapResult.set(listTotalRange[i].coord, listTotalRange[i]);
        }
    });

    // Write values into the game's mass-support table
    Array.from($(".overview_table .selected")).forEach(row => {
        let coord = row.children[0].innerText.match(/\d+\|\d+/).pop();
        if (mapResult.has(coord)) {
            let obj = mapResult.get(coord);
            let totalTroopCount = Object.keys(obj)
                .filter(k => k != "speedTroop" && k != "coord")
                .reduce((s, k) => s + obj[k], 0);
            if (totalTroopCount > 1) {
                Object.keys(obj).forEach(troopName => {
                    if (troopName != "speedTroop") {
                        $(row).find(`.call-unit-box-${troopName}`).val(obj[troopName]);
                    }
                });
            }
        }
    });
}

function addEvents() {
    $('.sendTroops').on('input', function () {
        let sendTotal  = document.getElementsByClassName("sendTroops");
        let totalPop   = 0;
        for (let i = 0; i < sendTotal.length; i++) {
            let id    = sendTotal[i].id;
            let value = (sendTotal[i].value == "") ? 0 : sendTotal[i].value;
            if (id.includes("spear") || id.includes("sword") || id.includes("archer")) totalPop += parseFloat(value) * 1000;
            if (id.includes("heavy")) totalPop += parseFloat(value) * 1000 * heavyCav;
        }
        document.getElementById("packets_send").value = (totalPop / 1000).toFixed(2);
    });

    $('#packets_send').on('input', function () {
        let needTroops  = parseFloat(document.getElementById("packets_send").value);
        let totalPop    = parseFloat(document.getElementById("packets_total").value);
        let sendTotal   = document.getElementsByClassName("sendTroops");
        let totalTroops = document.getElementsByClassName("totalTroops");
        let ratio = needTroops / totalPop;
        for (let i = 0; i < totalTroops.length; i++) {
            let id = sendTotal[i].id;
            if (!id.includes("spy")) {
                sendTotal[i].value = parseInt(parseFloat(totalTroops[i].value) * ratio * 100) / 100.0;
            } else {
                sendTotal[i].value = 0;
            }
        }
    });
}

function hitCountApi() {
    $.getJSON(`https://api.countapi.xyz/hit/${countNameSpace}/${countApiKey}`, response => {
        console.log(`This script has been run: ${response.value} times`);
    });
    if (game_data.device != "desktop") {
        $.getJSON(`https://api.countapi.xyz/hit/${countNameSpace}/${countApiKey}_phone`, response => {
            console.log(`This script has been run on mobile: ${response.value} times`);
        });
    }
    $.getJSON(`https://api.countapi.xyz/hit/${countNameSpace}/${countApiKey}_id${game_data.player.id}`, response => {
        if (response.value == 1) {
            $.getJSON(`https://api.countapi.xyz/hit/${countNameSpace}/${countApiKey}_users`, () => {});
        }
    });
}

function calcDistance(coord1, coord2) {
    let [x1, y1] = coord1.split("|").map(Number);
    let [x2, y2] = coord2.split("|").map(Number);
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function getSpeedConstant() {
    if (localStorage.getItem(game_data.world + "speedWorld") !== null) {
        return JSON.parse(localStorage.getItem(game_data.world + "speedWorld"));
    }
    let data = httpGet("/interface.php?func=get_config");
    const parser   = new DOMParser();
    const htmlDoc  = parser.parseFromString(data, 'text/html');
    let obj = {
        worldSpeed: Number(htmlDoc.getElementsByTagName("speed")[0].innerHTML),
        unitSpeed:  Number(htmlDoc.getElementsByTagName("unit_speed")[0].innerHTML),
    };
    localStorage.setItem(game_data.world + "speedWorld", JSON.stringify(obj));
    return obj;
}
