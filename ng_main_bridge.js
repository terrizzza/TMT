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

    function esAceptado(estado) {
        if (!estado) return false;
        const s = String(estado).trim().toLowerCase();
        return s.includes("acepta") || s === "aut" || s === "s";
    }

    function esRechazado(estado) {
        if (!estado) return false;
        const s = String(estado).trim().toLowerCase();
        return s.includes("rechaz") || s.includes("deneg") || s === "rng" || s === "n";
    }

    function calcularTotalesMemoria() {
        let totalMO = 0;
        let totalMat = 0;
        let found = false;
        let causasCount = 0;
        let intervCount = 0;

        function procesarIntervencion(i) {
            if (!i) return;

            // Filtrar estado de la intervención
            const estInt = i.estadoPInt || i.EstadoPInt || i.EstGetPre || i.estGetPre;
            if (estInt) {
                if (esRechazado(estInt) || !esAceptado(estInt)) {
                    return;
                }
            }

            intervCount++;

            // Mano de obra (coste real de la intervención, respetando 0 si es 0)
            let mo = 0;
            if (i.costOpe !== undefined && i.costOpe !== null && i.costOpe !== "") {
                mo = parseNum(i.costOpe);
            } else if (i.CostOpe !== undefined && i.CostOpe !== null && i.CostOpe !== "") {
                mo = parseNum(i.CostOpe);
            }

            // Materiales (coste real, respetando 0 si es 0)
            let mat = 0;
            if (i.importeMat !== undefined && i.importeMat !== null && i.importeMat !== "") {
                mat = parseNum(i.importeMat);
            } else if (i.impMatExt !== undefined && i.impMatExt !== null && i.impMatExt !== "") {
                mat = parseNum(i.impMatExt);
            } else if (i.CostMat !== undefined && i.CostMat !== null && i.CostMat !== "") {
                mat = parseNum(i.CostMat);
            } else if (i.CostTotMatExt !== undefined && i.CostTotMatExt !== null && i.CostTotMatExt !== "") {
                mat = parseNum(i.CostTotMatExt);
            }

            totalMO += mo;
            totalMat += mat;
        }

        function procesarArrayCausas(causas) {
            if (!Array.isArray(causas) || causas.length === 0) return false;
            found = true;
            causas.forEach(function (c) {
                if (!c) return;

                // Filtrar estado de la causa (ignorar causas rechazadas o no aceptadas)
                const estCausa = c.estPCausa || c.estPptoCau || c.cEstadoPCau || c.estPpto;
                if (estCausa) {
                    if (esRechazado(estCausa) || !esAceptado(estCausa)) {
                        return;
                    }
                }

                causasCount++;
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
