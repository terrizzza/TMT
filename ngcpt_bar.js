window.NGCPTBar = (function () {
    let pollingInterval = null;


    // Detectar automáticamente si estamos en una orden NG
    function init() {
        const url = window.location.href;

        if (url.includes("/orden.html?id=") || url.includes("orden.html") || url.includes("NORTHGATE") || document.title.includes("NORTHGATE")) {

            chrome.storage.sync.get("autoOpenBar", ({ autoOpenBar }) => {

                if (autoOpenBar === undefined) {
                    autoOpenBar = true;
                    chrome.storage.sync.set({ autoOpenBar: true });
                }

                if (autoOpenBar) {
                    toggleBarra();
                }
            });
        }
    }

    // Corrige una matrícula a nivel interno (pasa "ABC1234" → "1234ABC")
    function fixMatricula(raw) {
        // Eliminar TODOS los caracteres invisibles, espacios, tabs, newlines, etc.
        // y convertir a mayúsculas
        raw = raw.toUpperCase()
            .replace(/\s/g, "")           // espacios normales
            .replace(/[\u200B-\u200D\uFEFF]/g, "")  // espacios de ancho cero y otros invisibles Unicode
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // caracteres de control

        // Extraer solo letras y números
        const letras = raw.replace(/\d/g, "");
        const numeros = raw.replace(/\D/g, "");

        // Asegurarse de que no queden espacios al inicio/final
        return (numeros + letras).trim();
    }

    // Aplica la corrección al texto seleccionado dentro de un input/textarea
    function fixSelectedMatricula() {
        const active = document.activeElement;

        if (!active) return;
        if (!(active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
        if (typeof active.selectionStart !== "number") return;

        const selStart = active.selectionStart;
        const selEnd = active.selectionEnd;

        if (selStart === selEnd) return; // no hay selección

        const selected = active.value.substring(selStart, selEnd);
        const fixed = fixMatricula(selected);

        // Construir el nuevo valor sin caracteres invisibles
        const newValue =
            active.value.substring(0, selStart) +
            fixed +
            active.value.substring(selEnd);

        // Usar setRangeText para una inserción más limpia (si está disponible)
        // o asignar directamente el valor
        if (active.setRangeText) {
            active.setRangeText(fixed, selStart, selEnd, "end");
            // Disparar evento input para que el campo se actualice correctamente
            active.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            active.value = newValue;
            // colocar el cursor justo después del texto corregido
            const newPos = selStart + fixed.length;
            active.selectionStart = active.selectionEnd = newPos;
        }
    }




    // Posición de la barra
    function toggleBarPosition() {
        const barra = document.getElementById("mi-barra-superior");
        if (!barra) return;

        chrome.storage.sync.get("barraPos", ({ barraPos }) => {
            let newPos = barraPos === "left" ? "right" : "left";

            // Aplicar nueva posición visual
            applyBarPosition(barra, newPos);

            // Guardar en chrome.storage
            chrome.storage.sync.set({ barraPos: newPos });
        });
    }
    function applyBarPosition(barra, pos) {
        if (pos === "left") {
            barra.style.left = "0";
            barra.style.right = "";
        } else {
            barra.style.right = "0";
            barra.style.left = "";
        }
    }


    function startPolling() {
        if (pollingInterval) return;
        // Primer intento inmediato
        get_data();
        
        pollingInterval = setInterval(() => {
            const order_id = get_order_id();
            if (order_id) {
                get_data();
                stopPolling();
            } else {
                get_data();
            }
        }, 500);
    }

    function stopPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    //Habilitar y deshabilitar barra con comando
    function toggleBarra() {
        let barra = document.getElementById("mi-barra-superior");

        if (!barra) {

            barra = document.createElement("div");
            barra.id = "mi-barra-superior";

            Object.assign(barra.style, {
                position: "fixed",
                top: "0",
                width: "280px",
                height: "100vh",
                backgroundColor: "#1a1a1a",
                color: "white",
                fontSize: "14px",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                padding: "12px",
                gap: "12px",
                zIndex: "999999999",
                borderLeft: "2px solid #333",
                boxShadow: "-2px 0px 5px rgba(0,0,0,0.4)",
                overflowY: "auto"
            });

            document.documentElement.appendChild(barra);

            // ⬇️ PRIMERO aplicar posición
            chrome.storage.sync.get("barraPos", ({ barraPos }) => {
                if (!barraPos) barraPos = "right";
                applyBarPosition(barra, barraPos);

                // ⬇️ DESPUÉS crear botones
                ensureUtilityButtons();

                // Activar polling automático de datos al crear la barra
                startPolling();
            });

        } else {
            const wasHidden = (barra.style.display === "none");

            barra.style.display = wasHidden ? "flex" : "none";

            if (wasHidden) {
                clean_data();
                startPolling(); // ⬅️ mostrar → empezar a buscar datos periódicamente
            } else {
                stopPolling();  // ⬅️ ocultar → parar polling
            }
        }
    }



    //Función para ocultar la barra.
    function hide_barra() {
        const barra = document.getElementById("mi-barra-superior");
        if (barra) {
            barra.style.display = "none";
            stopPolling(); // Detener polling si se oculta por el botón
        }
    }

    // Crear o devolver el contenedor interno donde van los botones
    function ensureInnerContainer() {
        let container = document.getElementById("mi-barra-superior-inner");

        if (!container) {
            container = document.createElement("div");
            container.id = "mi-barra-superior-inner";

            Object.assign(container.style, {
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                paddingTop: "5px"
            });

            const barra = document.getElementById("mi-barra-superior");
            barra.appendChild(container);
        }

        return container;
    }

    // Función para crear botón genérico
    function createSimpleButton(text, onClick) {
        const btn = document.createElement("button");

        btn.textContent = text;

        // Estilo para botones especiales (HIDE, GET DATA, CLEAN)
        Object.assign(btn.style, {
            width: "100%",
            padding: "10px 12px",
            textAlign: "left",
            background: "#27A844",     // ✔ verde solicitado
            color: "white",
            fontWeight: "bold",        // ✔ texto en negrita
            border: "1px solid #1e7d35",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "15px",
            transition: "background 0.15s ease"
        });

        // Hover
        btn.addEventListener("mouseover", () => {
            btn.style.background = "#32c254";   // un tono más claro
        });

        btn.addEventListener("mouseout", () => {
            btn.style.background = "#27A844";
        });

        btn.addEventListener("click", onClick);

        return btn;
    }



    // Función para limpiar todos los datos atrapados.
    function clean_data() {
        // Restaurar botón TOMAR DATOS
        const btnGet = document.getElementById("btn_get_data");
        if (btnGet) btnGet.style.display = "block";


        const ids = [
            "btn_order_id",
            "btn_state",
            "btn_matricula",
            "btn_km",
            "btn_contact_name",
            "btn_contact_phone",
            "btn_shop_zip",
            "btn_shop_name",
            "btn_obs"
        ];

        ids.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                const short = btn.textContent.split(":")[0]; // OR, ES, MAT, etc.
                btn.innerHTML = `<b>${short}:</b> NULO`;

                btn.disabled = true;

                // APLICAR ESTILO DESHABILITADO
                applyDataButtonStyle(btn, false);
            }
        });

        causasCacheDOM = {};
        currentTotalMO = null;
        currentTotalMat = null;
        const btnMO = document.getElementById("btn_mo");
        const btnMat = document.getElementById("btn_materiales");
        if (btnMO) {
            btnMO.textContent = "M/O";
            btnMO.title = "Copiar total M/O";
        }
        if (btnMat) {
            btnMat.textContent = "Materiales";
            btnMat.title = "Copiar total Materiales";
        }

        const btnCalc = document.getElementById("btn_calc_importes");
        if (btnCalc) {
            btnCalc.style.display = "block";
            btnCalc.textContent = "CALCULAR IMPORTES";
        }
    }


    // Función raiz para GET_DATA
    function get_data() {
        // Ocultar botón TOMAR DATOS después de usarlo
        const btnGet = document.getElementById("btn_get_data");
        if (btnGet) btnGet.style.display = "none";


        const order_id = get_order_id();
        render_order_id(order_id);

        const matricula = get_matricula();
        render_matricula(matricula);

        const state = get_state();
        render_state(state);

        const km = get_kilometros();
        render_kilometros(km);

        render_separator();

        const contact_name = get_contact_name();
        render_contact_name(contact_name);

        const contact_phone = get_contact_phone();
        render_contact_phone(contact_phone);

        render_separator();

        const shop = get_shop_info();
        render_shop_name(shop.name);
        render_shop_zip(shop.zip);

        const cita = get_cita();
        render_cita(cita);


        render_separator();

        const obs = get_obs();
        render_obs(obs);
    }



    // Funciones RENDER
    function render_order_id(value) { //Número de orden Northgate
        let btn = document.getElementById("btn_order_id");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_order_id";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>OR:</b> ${value}` : "<b>OR:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_state(value) { //Estado de la orden
        let btn = document.getElementById("btn_state");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_state";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>Estado:</b> ${value}` : "<b>Estado:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_matricula(value) { //Matrícula
        let btn = document.getElementById("btn_matricula");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_matricula";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>Matricula:</b> ${value}` : "<b>Matricula:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_kilometros(value) { //Kilómetros
        let btn = document.getElementById("btn_km");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_km";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>Kilómetros:</b> ${value}` : "<b>Kilómetros:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_contact_name(value) { //Nombre del usuario
        let btn = document.getElementById("btn_contact_name");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_contact_name";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>Usuario:</b> ${value}` : "<b>Usuario:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_contact_phone(value) { //Teléfono del usuario
        let btn = document.getElementById("btn_contact_phone");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_contact_phone";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>TEL:</b> ${value}` : "<b>TEL:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }
    function render_shop_zip(zip) { //CP Taller
        let btn = document.getElementById("btn_shop_zip");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_shop_zip";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = zip || "";
        btn.innerHTML = zip ? `<b>CP:</b> ${zip}` : "<b>CP:</b> NULO";
        btn.disabled = !zip;

        applyDataButtonStyle(btn, !!zip);
    }
    function render_shop_name(name) { //Nombre del taller
        let btn = document.getElementById("btn_shop_name");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_shop_name";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = name || "";
        btn.innerHTML = name ? `<b>Dirección del taller:</b> ${name}` : "<b>Dirección del taller:</b> NULO";
        btn.disabled = !name;

        applyDataButtonStyle(btn, !!name);
    }
    function render_obs(value) { //Observaciones completas
        let btn = document.getElementById("btn_obs");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_obs";

            btn.addEventListener("click", () => {

                // Tomar todos los valores necesarios
                const OR = get_order_id();
                const MAT = get_matricula();        // matrícula invertida
                const USER = get_contact_name();
                const TEL = get_contact_phone();
                const OBS = get_obs();              // observaciones del HTML

                // Formato final EXACTO como lo pediste
                const finalText =
                    `Orden ${OR}  -  Matrícula ${MAT}
Usuario ${USER}  - Teléfono ${TEL}
Observaciones: ${OBS}




`;

                // Copiar a portapapeles
                navigator.clipboard.writeText(finalText);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.innerHTML = "<b>Generar observaciones</b>";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }



    function render_separator(id = "") {

        const separatorId = id || ("sep_" + Math.random().toString(36).substr(2, 5));

        let sep = document.getElementById(separatorId);

        if (!sep) {
            sep = document.createElement("div");
            sep.id = separatorId;

            Object.assign(sep.style, {
                width: "100%",
                padding: "4px 10px",       // mismo tamaño que un botón
                height: "16px",            // fuerza altura consistente
                background: "transparent", // ✔ 100% invisible
                border: "none",            // ✔ sin borde
                marginTop: "2px",
                marginBottom: "2px",
                pointerEvents: "none",     // NO clicable
            });

            const container = ensureInnerContainer();
            container.appendChild(sep);
        }

        sep.textContent = ""; // ✔ vacío/invisible
    }
    function render_cita(value) { // Cita de taller
        let btn = document.getElementById("btn_cita");

        if (!btn) {
            btn = document.createElement("button");
            btn.id = "btn_cita";

            btn.addEventListener("click", () => {
                const textToCopy = btn.dataset.clipboardText;
                if (textToCopy) navigator.clipboard.writeText(textToCopy);
            });

            const container = ensureInnerContainer();
            container.appendChild(btn);
        }

        btn.dataset.clipboardText = value || "";
        btn.innerHTML = value ? `<b>Cita:</b> ${value}` : "<b>Cita:</b> NULO";
        btn.disabled = !value;

        applyDataButtonStyle(btn, !!value);
    }










    // Funciones independientes de atrapar datos
    function get_order_id() { //Número de orden Northgate
        const el = document.querySelector(".numParte");
        return el ? el.textContent.trim() : "";
    }
    function get_state() {  //Estado de la orden
        const el = document.getElementById("estPptoCab");
        return el ? el.textContent.trim() : "";
    }
    function get_matricula() { // Matricula
        const el = document.getElementById("matricula");
        if (!el) return "";

        const raw = el.value.trim().toUpperCase();

        let letras = "";
        let numeros = "";

        for (const char of raw) {
            if (/[A-Z]/.test(char)) letras += char;
            else if (/\d/.test(char)) numeros += char;
        }

        return numeros + letras;
    }
    function get_kilometros() {
        const el = document.getElementById("kilometros");
        if (!el) return "";

        // Tomar el valor original del input
        let raw = el.value.trim();

        // Eliminar TODO excepto números
        raw = raw.replace(/\D/g, "");

        return raw;
    }
    function get_contact_name() { //Nombre de contacto
        const el = document.getElementById("nombre_contacto");
        return el ? el.value.trim() : "";
    }
    function get_contact_phone() { //Telefono del usuario
        const el = document.getElementById("telefono");
        return el ? el.value.trim() : "";
    }
    function get_shop_info() { //CP y nombre del taller
        const el = document.getElementById("direccion_taller");
        if (!el) return { zip: "", name: "" };

        const text = el.value ? el.value.trim() : el.textContent.trim(); // por si es input o span

        // ZIP = primeros 5 dígitos
        const zipMatch = text.match(/^\d{5}/);
        const zip = zipMatch ? zipMatch[0] : "";

        // NAME = resto del texto, quitando "XXXXX "
        const name = zip ? text.substring(6).trim() : text;

        return { zip, name };
    }
    function get_obs() { //Observaciones
        const el = document.getElementById("obs_taller");
        if (!el) return "";

        // Puede ser <textarea> o <input> o <div>
        if ("value" in el) return el.value.trim();
        return el.textContent.trim();
    }
    function get_cita() { // Cita previa
        const el = document.getElementById("cita_previa_content");
        if (!el) return "";

        const raw = el.value ? el.value.trim() : el.textContent.trim();

        // El formato es "26/11/2025 13:08"
        // Nos quedamos SOLO con la fecha (primer bloque antes del espacio)
        const date = raw.split(" ")[0];

        return date;
    }



    // Estilo estandarizado para botones de datos
    function applyDataButtonStyle(btn, enabled) {

        // Fondo según estado
        const bg = enabled ? "#2a2a2a" : "#1a1a1a";

        Object.assign(btn.style, {
            width: "100%",
            padding: "8px 10px",
            textAlign: "left",
            background: bg,                     // ✔ fondo dinámico
            color: "white",
            border: "1px solid #444",
            borderRadius: "4px",
            cursor: enabled ? "pointer" : "default",
            fontSize: "14px",
            opacity: enabled ? "1" : "0.6",     // ✔ más oscuro al deshabilitar
            pointerEvents: enabled ? "auto" : "none", // ✔ bloquea clicks
            transition: "background 0.15s ease"
        });

        // Eliminar cualquier hover previo
        btn.onmouseover = null;
        btn.onmouseout = null;

        // Solo aplicar hover si está habilitado
        if (enabled) {
            btn.addEventListener("mouseover", () => {
                btn.style.background = "#3a3a3a";  // hover más claro
            });
            btn.addEventListener("mouseout", () => {
                btn.style.background = "#2a2a2a";  // estado normal
            });
        }
    }


    // Variables y lógica de cálculo para M/O y Materiales
    let currentTotalMO = null;
    let currentTotalMat = null;
    let causasCacheDOM = {};

    function parseNumValue(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === 'number') return val > 0 ? val : 0;
        let s = String(val).trim();
        if (s === '-' || s === '' || s.startsWith('-99') || s === 'NULO' || s.startsWith('-')) return 0;
        s = s.replace(/\s/g, '').replace(/€/g, '');
        if (s.includes(',') && s.includes('.')) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else if (s.includes(',')) {
            s = s.replace(',', '.');
        }
        const n = parseFloat(s);
        return isNaN(n) || n < 0 ? 0 : n;
    }

    function formatDisplayAmount(num) {
        if (!num || isNaN(num) || num <= 0) return "0";
        if (Math.round(num * 100) % 100 === 0) {
            return Math.round(num).toString();
        }
        return num.toFixed(2).replace('.', ',');
    }

    function formatClipboardAmount(num) {
        if (!num || isNaN(num) || num <= 0) return "0";
        if (Math.round(num * 100) % 100 === 0) {
            return Math.round(num).toString();
        }
        return num.toFixed(2).replace('.', ',');
    }

    function solicitarTotalesBridge() {
        let bridge = document.getElementById("tmt-ng-bridge");
        if (!bridge) {
            bridge = document.createElement("div");
            bridge.id = "tmt-ng-bridge";
            bridge.style.display = "none";
            (document.body || document.documentElement).appendChild(bridge);
        }

        // 1. Disparar evento para que ng_main_bridge.js (ejecutado en MAIN world) calcule y escriba en el bridge
        window.dispatchEvent(new CustomEvent("tmt-request-ng-totals"));

        if (bridge.dataset.found === "true") {
            return {
                found: true,
                mo: parseFloat(bridge.dataset.mo) || 0,
                mat: parseFloat(bridge.dataset.mat) || 0,
                causas: parseInt(bridge.dataset.causas, 10) || 0,
                intervs: parseInt(bridge.dataset.intervs, 10) || 0
            };
        }

        // 2. Si todavía no ha respondido (ej. pestaña sin refrescar tras actualizar la extensión),
        // intentar inyectar el script ng_main_bridge.js desde web_accessible_resources
        if (!document.getElementById("tmt-script-bridge")) {
            try {
                const script = document.createElement("script");
                script.id = "tmt-script-bridge";
                script.src = chrome.runtime.getURL("ng_main_bridge.js");
                (document.head || document.documentElement).appendChild(script);
                window.dispatchEvent(new CustomEvent("tmt-request-ng-totals"));
            } catch (e) {
                // Bloqueado si CSP estricta
            }
        }

        if (bridge.dataset.found === "true") {
            return {
                found: true,
                mo: parseFloat(bridge.dataset.mo) || 0,
                mat: parseFloat(bridge.dataset.mat) || 0,
                causas: parseInt(bridge.dataset.causas, 10) || 0,
                intervs: parseInt(bridge.dataset.intervs, 10) || 0
            };
        }

        return { found: false, mo: 0, mat: 0, causas: 0, intervs: 0 };
    }

    function leerTablaDetailActual() {
        let moCol = 3;
        let matCol = 4;
        const ths = document.querySelectorAll("#tablaDetail thead th");
        ths.forEach((th, idx) => {
            const txt = th.textContent.toLowerCase();
            if (txt.includes("coste m.o") || txt.includes("m.o")) moCol = idx;
            if (txt.includes("importe mat") || txt.includes("mat.")) matCol = idx;
        });

        let causaMO = 0;
        let causaMat = 0;
        const detailRows = document.querySelectorAll("#tablaDetail tbody tr");
        detailRows.forEach(tr => {
            if (tr.classList.contains("dataTables_empty")) return;
            const tds = tr.querySelectorAll("td");
            if (tds.length > Math.max(moCol, matCol)) {
                causaMO += parseNumValue(tds[moCol].textContent);
                causaMat += parseNumValue(tds[matCol].textContent);
            }
        });

        return { mo: causaMO, mat: causaMat };
    }

    function calcularTotalesDesdeDOM() {
        const masterRows = document.querySelectorAll("#tablaMaster tbody tr");
        const validMasterRows = Array.from(masterRows).filter(tr => !tr.classList.contains("dataTables_empty"));

        // Si solo hay 1 causa o ninguna, leemos directamente el detalle actual
        if (validMasterRows.length <= 1) {
            return leerTablaDetailActual();
        }

        // Recordar la fila de Causa que estaba previamente seleccionada
        const originalSelectedRow = document.querySelector("#tablaMaster tbody tr.selected");

        let totalMO = 0;
        let totalMat = 0;

        validMasterRows.forEach(tr => {
            // Simular clic en la fila de la causa para que DataTables cargue sus intervenciones en #tablaDetail
            tr.click();
            const parcial = leerTablaDetailActual();
            totalMO += parcial.mo;
            totalMat += parcial.mat;
        });

        // Restaurar la selección original del usuario para no cambiarle la pantalla
        if (originalSelectedRow) {
            originalSelectedRow.click();
        } else if (validMasterRows[0]) {
            validMasterRows[0].click();
        }

        return { mo: totalMO, mat: totalMat };
    }

    function calcularTotales() {
        const bridgeRes = solicitarTotalesBridge();
        let totalMO = 0;
        let totalMat = 0;

        if (bridgeRes.found) {
            totalMO = bridgeRes.mo;
            totalMat = bridgeRes.mat;
        } else {
            const domTotals = calcularTotalesDesdeDOM();
            totalMO = domTotals.mo;
            totalMat = domTotals.mat;
        }

        actualizarBotonesMOMateriales(totalMO, totalMat);
        return { mo: totalMO, mat: totalMat };
    }

    function actualizarBotonesMOMateriales(totalMO, totalMat) {
        currentTotalMO = totalMO;
        currentTotalMat = totalMat;

        const btnMO = document.getElementById("btn_mo");
        const btnMat = document.getElementById("btn_materiales");

        const strMO = formatDisplayAmount(totalMO);
        const strMat = formatDisplayAmount(totalMat);

        if (btnMO && !btnMO.dataset.copied) {
            btnMO.textContent = `M/O ${strMO}`;
            btnMO.title = `Copiar total Mano de Obra: ${strMO} €`;
        }

        if (btnMat && !btnMat.dataset.copied) {
            btnMat.textContent = `MAT. ${strMat}`;
            btnMat.title = `Copiar total Materiales: ${strMat} €`;
        }
    }

    // Funciones para botones M/O y Materiales
    function applyRowButtonStyle(btn) {
        Object.assign(btn.style, {
            flex: "1",
            padding: "10px 6px",
            textAlign: "center",
            background: "#27A844",     // ✔ verde consistente con los botones de acción
            color: "white",
            fontWeight: "bold",        // ✔ texto en negrita
            border: "1px solid #1e7d35",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
            transition: "background 0.15s ease",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
        });

        btn.addEventListener("mouseover", () => {
            btn.style.background = "#32c254";
        });

        btn.addEventListener("mouseout", () => {
            btn.style.background = "#27A844";
        });
    }

    function darFeedbackCopiado(btn, textoOriginal) {
        if (!btn) return;
        btn.dataset.copied = "true";
        btn.textContent = "¡Copiado!";
        setTimeout(() => {
            delete btn.dataset.copied;
            btn.textContent = textoOriginal;
        }, 1200);
    }

    function copiarTotalMO() {
        const mo = (currentTotalMO !== null) ? currentTotalMO : calcularTotales().mo;
        const textoACopiar = formatClipboardAmount(mo);
        navigator.clipboard.writeText(textoACopiar);

        const btnMO = document.getElementById("btn_mo");
        darFeedbackCopiado(btnMO, `M/O ${formatDisplayAmount(mo)}`);
    }

    function copiarTotalMateriales() {
        const mat = (currentTotalMat !== null) ? currentTotalMat : calcularTotales().mat;
        const textoACopiar = formatClipboardAmount(mat);
        navigator.clipboard.writeText(textoACopiar);

        const btnMat = document.getElementById("btn_materiales");
        darFeedbackCopiado(btnMat, `MAT. ${formatDisplayAmount(mat)}`);
    }

    function realizarCalculoImportes() {
        const btnCalc = document.getElementById("btn_calc_importes");
        if (btnCalc) {
            btnCalc.textContent = "CALCULANDO...";
        }

        setTimeout(() => {
            calcularTotales();
            if (btnCalc) {
                btnCalc.style.display = "none";
            }
        }, 50);
    }

    function ensureRowMoMateriales() {
        const container = ensureInnerContainer();

        if (!document.getElementById("row_mo_materiales")) {
            const row = document.createElement("div");
            row.id = "row_mo_materiales";

            Object.assign(row.style, {
                display: "flex",
                flexDirection: "row",
                gap: "8px",
                width: "100%",
                boxSizing: "border-box"
            });

            // Botón M/O
            const btnMO = document.createElement("button");
            btnMO.id = "btn_mo";
            btnMO.textContent = currentTotalMO !== null ? `M/O ${formatDisplayAmount(currentTotalMO)}` : "M/O";
            btnMO.title = "Copiar total Mano de Obra";
            applyRowButtonStyle(btnMO);
            btnMO.addEventListener("click", copiarTotalMO);

            // Botón Materiales
            const btnMat = document.createElement("button");
            btnMat.id = "btn_materiales";
            btnMat.textContent = currentTotalMat !== null ? `MAT. ${formatDisplayAmount(currentTotalMat)}` : "Materiales";
            btnMat.title = "Copiar total Materiales";
            applyRowButtonStyle(btnMat);
            btnMat.addEventListener("click", copiarTotalMateriales);

            row.appendChild(btnMO);
            row.appendChild(btnMat);

            const btnHide = document.getElementById("btn_hide");
            if (btnHide && btnHide.nextSibling) {
                container.insertBefore(row, btnHide.nextSibling);
            } else {
                container.appendChild(row);
            }
        }
    }

    function ensureBtnCalcularImportes() {
        const container = ensureInnerContainer();

        if (!document.getElementById("btn_calc_importes")) {
            const btnCalc = createSimpleButton("CALCULAR IMPORTES", realizarCalculoImportes);
            btnCalc.id = "btn_calc_importes";
            btnCalc.style.textAlign = "center";

            const btnGetData = document.getElementById("btn_get_data");
            const rowMoMat = document.getElementById("row_mo_materiales");

            if (btnGetData) {
                container.insertBefore(btnCalc, btnGetData);
            } else if (rowMoMat && rowMoMat.nextSibling) {
                container.insertBefore(btnCalc, rowMoMat.nextSibling);
            } else {
                container.appendChild(btnCalc);
            }
        }
    }

    // Insertar botones GET DATA y CLEAN al cargar la barra
    function ensureUtilityButtons() {
        const container = ensureInnerContainer();

        if (!document.getElementById("btn_hide")) {
            const btnHide = createSimpleButton("OCULTAR", hide_barra);
            btnHide.id = "btn_hide";
            container.appendChild(btnHide);
        }

        // Fila de botones M/O y Materiales directamente debajo de OCULTAR
        ensureRowMoMateriales();

        // Botón CALCULAR IMPORTES debajo de M/O y Materiales
        ensureBtnCalcularImportes();

        if (!document.getElementById("btn_get_data")) {
            const btnGet = createSimpleButton("TOMAR DATOS", get_data);
            btnGet.id = "btn_get_data";
            container.appendChild(btnGet);
        }

        //INFO BUTTON SIEMPRE ABAJO
        ensureInfoButton();
    }
    function ensureInfoButton() {

        let infoContainer = document.getElementById("info_container");

        if (!infoContainer) {
            infoContainer = document.createElement("div");
            infoContainer.id = "info_container";

            Object.assign(infoContainer.style, {
                marginTop: "auto",
                width: "100%",
                paddingTop: "12px"
            });

            const barra = document.getElementById("mi-barra-superior");
            barra.appendChild(infoContainer);
        }



        // Botón MOVER BARRA
        if (!document.getElementById("btn_move_bar")) {
            const btnMove = createSimpleButton("MOVER BARRA", toggleBarPosition);
            btnMove.id = "btn_move_bar";
            infoContainer.appendChild(btnMove);
        }

        // Botón CONFIGURACIÓN
        if (!document.getElementById("btn_options")) {
            const btnOptions = createSimpleButton("CONFIGURACIÓN", () => {
                chrome.runtime.sendMessage({ action: "openOptions" });
            });

            btnOptions.id = "btn_options";
            infoContainer.appendChild(btnOptions);
        }
    }

    return {
        init: init,
        toggle: toggleBarra,
        fixMatricula: fixSelectedMatricula,
        calcularTotales: calcularTotales,
        realizarCalculoImportes: realizarCalculoImportes
    };
})();



