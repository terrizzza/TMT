/**
 * ng_main_bridge.js
 * 
 * Script ejecutado en el contexto MAIN (entorno de la página de Northgate).
 * Al ejecutarse en el MAIN world:
 * - No es bloqueado por la Content Security Policy (CSP) del servidor.
 * - Tiene acceso directo a las variables globales de Northgate:
 *   window.myApp, window.myApp.orden, window.mTable, window.dTable, window.$, etc.
 */

(function () {
    "use strict";

    function parseNum(val) {
        if (val === null || val === undefined) return 0;
        if (typeof val === "number") return (val > 0 && val !== -99) ? val : 0;
        let s = String(val).trim();
        if (s === "-" || s === "" || s.startsWith("-99") || s === "NULO" || s.startsWith("-")) return 0;
        s = s.replace(/\s/g, "").replace(/€/g, "");
        if (s.includes(",") && s.includes(".")) {
            s = s.replace(/\./g, "").replace(",", ".");
        } else if (s.includes(",")) {
            s = s.replace(",", ".");
        }
        const n = parseFloat(s);
        return isNaN(n) || n < 0 ? 0 : n;
    }

    function calcularTotalesMemoria() {
        let totalMO = 0;
        let totalMat = 0;
        let found = false;
        let causasCount = 0;
        let intervCount = 0;

        function procesarIntervencion(i) {
            if (!i) return;
            intervCount++;

            // Mano de obra
            let mo = parseNum(i.costOpe);
            if (mo === 0 && i.CostOpe !== undefined) mo = parseNum(i.CostOpe);
            if (mo === 0 && i.importeMob !== undefined) mo = parseNum(i.importeMob);
            if (mo === 0 && i.dImporteMOB !== undefined) mo = parseNum(i.dImporteMOB);
            if (mo === 0 && i.importeMO !== undefined) mo = parseNum(i.importeMO);

            // Materiales
            let mat = parseNum(i.importeMat);
            if (mat === 0 && i.CostMat !== undefined) mat = parseNum(i.CostMat);
            if (mat === 0 && i.impMatExt !== undefined) mat = parseNum(i.impMatExt);
            if (mat === 0 && i.CostTotMatExt !== undefined) mat = parseNum(i.CostTotMatExt);

            totalMO += mo;
            totalMat += mat;
        }

        function procesarArrayCausas(causas) {
            if (!Array.isArray(causas) || causas.length === 0) return false;
            found = true;
            causasCount = causas.length;
            causas.forEach(function (c) {
                const intvs = (c && c.intervenciones) ? c.intervenciones : [];
                intvs.forEach(procesarIntervencion);
            });
            return true;
        }

        // Opción 1: myApp.orden.getCausas()
        try {
            if (window.myApp && window.myApp.orden && typeof window.myApp.orden.getCausas === "function") {
                const causas = window.myApp.orden.getCausas();
                if (procesarArrayCausas(causas)) {
                    // Calculado con éxito
                }
            }
        } catch (e) {
            console.warn("[TMT Bridge Main] Error en myApp.orden.getCausas():", e);
        }

        // Opción 2: myApp.orden.causas directamente
        if (!found) {
            try {
                if (window.myApp && window.myApp.orden && Array.isArray(window.myApp.orden.causas)) {
                    procesarArrayCausas(window.myApp.orden.causas);
                }
            } catch (e) {}
        }

        // Opción 3: mTable.data() (DataTable de Causas)
        if (!found) {
            try {
                if (window.mTable && typeof window.mTable.data === "function") {
                    const causas = window.mTable.data().toArray();
                    procesarArrayCausas(causas);
                }
            } catch (e) {
                console.warn("[TMT Bridge Main] Error en mTable:", e);
            }
        }

        // Opción 4: $('#tablaMaster').DataTable().data()
        if (!found) {
            try {
                if (window.$ && typeof window.$ === "function") {
                    const $tbl = window.$("#tablaMaster");
                    if ($tbl.length && window.$.fn && window.$.fn.dataTable && window.$.fn.dataTable.isDataTable("#tablaMaster")) {
                        const causas = $tbl.DataTable().data().toArray();
                        procesarArrayCausas(causas);
                    }
                }
            } catch (e) {}
        }

        return {
            totalMO: totalMO,
            totalMat: totalMat,
            found: found,
            causasCount: causasCount,
            intervCount: intervCount
        };
    }

    function publicarTotales() {
        const res = calcularTotalesMemoria();

        // 1. Escribir en elemento bridge en el DOM
        let bridge = document.getElementById("tmt-ng-bridge");
        if (!bridge) {
            bridge = document.createElement("div");
            bridge.id = "tmt-ng-bridge";
            bridge.style.display = "none";
            (document.body || document.documentElement).appendChild(bridge);
        }

        bridge.dataset.mo = String(res.totalMO);
        bridge.dataset.mat = String(res.totalMat);
        bridge.dataset.found = String(res.found);
        bridge.dataset.causas = String(res.causasCount);
        bridge.dataset.intervs = String(res.intervCount);

        // 2. Disparar evento personalizado con los detalles
        window.dispatchEvent(new CustomEvent("tmt-response-ng-totals", {
            detail: res
        }));

        return res;
    }

    // Escuchar solicitudes bajo demanda desde el content script aislado
    window.addEventListener("tmt-request-ng-totals", function () {
        publicarTotales();
    });

    // Publicar inicialmente si ya existen datos cargados
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(publicarTotales, 500);
    } else {
        document.addEventListener("DOMContentLoaded", () => {
            setTimeout(publicarTotales, 500);
        });
    }
})();
