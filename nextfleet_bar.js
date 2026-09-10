window.NextfleetBar = (function() {
    let barra = null;
    let toastContainer = null;
    let resaltarEsperaHabilitado = true;
    let programarEsperaRAF = null;

    function init() {
        console.log("TMT - NextFleet: Módulo cargado.");

        inyectarEstilosEspera();

        // Cargar configuración de resaltado de espera
        if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
            chrome.storage.sync.get("enableHighlightEspera", ({ enableHighlightEspera }) => {
                if (enableHighlightEspera !== undefined) {
                    resaltarEsperaHabilitado = enableHighlightEspera;
                }
                programarActualizacionEspera();
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === "sync" && changes.enableHighlightEspera !== undefined) {
                    resaltarEsperaHabilitado = changes.enableHighlightEspera.newValue;
                    programarActualizacionEspera();
                }
            });
        }

        // Observar redimensionado de pantalla y cambios en DOM
        window.addEventListener("resize", () => {
            if (barra && barra.style.display !== "none") {
                ajustarPosicionBarra();
            }
        });
        iniciarObservadorDOM();
        programarActualizacionEspera();

        // Escuchar clics en el documento para detectar acciones de adjuntar archivos
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (!target) return;

            // Encontrar el contenedor interactivo más cercano
            const clickable = target.closest("button, a, [role='button'], .btn, .button") || target;
            const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            // Reemplazar múltiples espacios y saltos de línea por un único espacio
            const text = stripAccents(clickable.textContent.replace(/\s+/g, ' ').trim().toLowerCase());

            // Imprimir traza de depuración en consola para que el usuario/desarrollador pueda ver qué cazo el script
            console.log("NG CPT Clic detectado en:", clickable.tagName, "| Texto:", text);

            // Coincidencia estricta: debe contener "nuevo" y además ("fichero", "adjunto" o "archivo")
            const coincideTexto = text.includes("nuevo") && 
                                  (text.includes("fichero") || text.includes("adjunto") || text.includes("archivo"));

            // Aumentamos el límite de longitud a 100 para compensar iconos o textos más largos en la nueva versión
            if (text.length < 100 && coincideTexto) {
                console.log("NG CPT: Coincidencia de nuevo adjunto detectada. Abriendo barra.");
                
                // Retraso de 350ms para dar tiempo a NextFleet a renderizar la ventana/formulario en el DOM
                setTimeout(() => {
                    if (!barra || barra.style.display === "none") {
                        toggleBarra();
                    }
                }, 350);
            }
        }, true);
    }

    function toggleBarra() {
        if (!barra) {
            crearBarra();
        } else {
            const isHidden = barra.style.display === "none";
            barra.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
                mostrarToast("Barra rápida mostrada");
            }
        }
        if (barra && barra.style.display !== "none") {
            ajustarPosicionBarra();
            // Reintentos asíncronos para acoplarse conforme se completa la transición CSS de apertura
            setTimeout(ajustarPosicionBarra, 100);
            setTimeout(ajustarPosicionBarra, 250);
            setTimeout(ajustarPosicionBarra, 500);
            setTimeout(ajustarPosicionBarra, 1000);
        }
    }

    function ajustarPosicionBarra() {
        if (!barra) return;
        const offcanvas = document.getElementById("contenedor-Cuerpo-Ficha") || 
                          document.querySelector('[id*="contenedor-Cuerpo-Ficha"]') ||
                          document.querySelector(".contenedor-Cuerpo-Ficha") || 
                          document.querySelector(".offcanvas-body");
        
        if (offcanvas) {
            const parent = offcanvas.closest('.offcanvas') || offcanvas.parentElement || offcanvas;
            const elements = [parent, ...parent.querySelectorAll('*')];
            const candidates = [];
            
            // Límite izquierdo mínimo para considerar que un elemento pertenece al panel derecho
            // (el panel blanco normalmente no empieza a menos de 850px de la derecha, o sea, su left debe ser >= innerWidth - 850)
            const minLeftForPanel = window.innerWidth - 850;
            
            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const widthVal = rect.width || el.offsetWidth || 0;
                
                // Buscamos elementos cuyo ancho sea el de un panel visual normal (300px a 800px)
                if (widthVal >= 300 && widthVal <= 800) {
                    if (rect.left >= minLeftForPanel && rect.left < window.innerWidth) {
                        candidates.push({ el, left: rect.left });
                    }
                }
            }
            
            // Ordenamos de menor a mayor 'left' para encontrar el borde izquierdo más externo (el inicio del panel blanco)
            if (candidates.length > 0) {
                candidates.sort((a, b) => a.left - b.left);
                const targetLeft = candidates[0].left;
                console.log("TMT: Borde izquierdo del panel visual detectado en (mínimo left en zona derecha):", targetLeft);
                barra.style.right = `${window.innerWidth - targetLeft}px`;
                return;
            }
        }
        barra.style.right = "0";
    }

    function iniciarObservadorDOM() {
        const observer = new MutationObserver(() => {
            if (barra && barra.style.display !== "none") {
                ajustarPosicionBarra();
            }
            inyectarBotonesCopiar();
            programarActualizacionEspera();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function inyectarEstilosEspera() {
        if (document.getElementById("tmt-espera-styles")) return;

        const styles = document.createElement("style");
        styles.id = "tmt-espera-styles";
        styles.textContent = `
            /* TMT - NextFleet: Resaltado de órdenes En Espera */
            tr.tmt-fila-espera > td {
                background-color: #e5e7eb !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(100, 116, 139, 0.08),
                    rgba(100, 116, 139, 0.08) 12px,
                    rgba(100, 116, 139, 0.18) 12px,
                    rgba(100, 116, 139, 0.18) 24px
                ) !important;
            }

            /* Efecto hover sobre la fila en espera */
            tr.tmt-fila-espera:hover > td {
                background-color: #d8dbe0 !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(71, 85, 105, 0.12),
                    rgba(71, 85, 105, 0.12) 12px,
                    rgba(71, 85, 105, 0.22) 12px,
                    rgba(71, 85, 105, 0.22) 24px
                ) !important;
            }

            /* Fila en espera que además está seleccionada */
            tr.tmt-fila-espera.filaSeleccionada-Tabla_BS > td {
                background-color: #cbd5e1 !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(30, 58, 138, 0.10),
                    rgba(30, 58, 138, 0.10) 12px,
                    rgba(30, 58, 138, 0.22) 12px,
                    rgba(30, 58, 138, 0.22) 24px
                ) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(styles);
    }

    function programarActualizacionEspera() {
        if (programarEsperaRAF) return;
        programarEsperaRAF = requestAnimationFrame(() => {
            programarEsperaRAF = null;
            actualizarFilasEnEspera();
        });
    }

    function actualizarFilasEnEspera() {
        if (!resaltarEsperaHabilitado) {
            document.querySelectorAll('tr.tmt-fila-espera').forEach(tr => {
                tr.classList.remove('tmt-fila-espera');
                if (tr.dataset.tmtTitleEspera) {
                    tr.removeAttribute('title');
                    delete tr.dataset.tmtTitleEspera;
                }
            });
            return;
        }

        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            const thead = table.querySelector('thead');
            if (!thead) return;

            const ths = Array.from(thead.querySelectorAll('th'));
            const esperaColIdx = ths.findIndex(th => {
                const text = th.textContent.trim().toLowerCase();
                return text === 'espera' || text.startsWith('espera') || text.includes('espera');
            });

            if (esperaColIdx === -1) return;

            const tbody = table.querySelector('tbody');
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr');
            rows.forEach(tr => {
                const cell = tr.children[esperaColIdx];
                if (!cell) return;

                // En NextFleet se usa Material Symbols 'check_box' cuando está marcada
                // y 'check_box_outline_blank' cuando no está marcada
                const cellText = cell.textContent || '';
                const tieneIconoCheck = cellText.includes('check_box') && !cellText.includes('check_box_outline_blank');
                const tieneInputCheck = !!cell.querySelector('input[type="checkbox"]:checked');
                const estaEnEspera = tieneIconoCheck || tieneInputCheck;

                if (estaEnEspera) {
                    if (!tr.classList.contains('tmt-fila-espera')) {
                        tr.classList.add('tmt-fila-espera');
                        if (!tr.getAttribute('title')) {
                            tr.setAttribute('title', 'Orden En Espera');
                            tr.dataset.tmtTitleEspera = 'true';
                        }
                    }
                } else {
                    if (tr.classList.contains('tmt-fila-espera')) {
                        tr.classList.remove('tmt-fila-espera');
                        if (tr.dataset.tmtTitleEspera) {
                            tr.removeAttribute('title');
                            delete tr.dataset.tmtTitleEspera;
                        }
                    }
                }
            });
        });
    }

    function inyectarBotonesCopiar() {
        // Encontrar los botones de Cancelar con los estilos específicos
        const botonesCancelar = Array.from(document.querySelectorAll('button.conBorde.sinSombra.btn.btn-lg'))
            .filter(btn => btn.textContent.trim() === 'Cancelar');

        botonesCancelar.forEach(btnCancelar => {
            // Buscar el contenedor padre de la ventana modal u offcanvas
            // Para asegurarnos de no inyectar en modales pequeños que se abren encima
            const contenedorPrincipal = btnCancelar.closest('.offcanvas, .modal, [role="dialog"], .modal-dialog, .p-sidebar, .p-dialog, .contenedor-Cuerpo-Ficha') || document.body;
            
            // Validar que dentro de este modal específico estemos en la vista de taller
            const textoContenedor = contenedorPrincipal.textContent.toLowerCase();
            const esVistaTaller = textoContenedor.includes('ver taller') || textoContenedor.includes('nombre comercial');

            if (!esVistaTaller) {
                return; // Si no es la ventana del taller, no inyectamos los botones
            }

            const container = btnCancelar.parentElement;
            // Evitar inyecciones duplicadas comprobando si ya existe nuestra clase custom
            if (container && !container.querySelector('.btn-tmt-copiar')) {
                // Cambiar el contenedor a display flex para poder usar gap y ordenar bien los botones
                container.style.display = 'flex';
                container.style.gap = '8px';
                
                const baseStyleStr = "height:43px !important; border-radius: 0px !important; color: white !important;";
                const classStr = "conBorde sinSombra btn btn-lg btn-tmt-copiar";

                const btnInline = document.createElement("button");
                btnInline.type = "button";
                btnInline.className = classStr;
                btnInline.style.cssText = baseStyleStr + " background-color: #0d6efd !important;";
                btnInline.textContent = "Copiar inline";
                btnInline.addEventListener("click", () => copiarDatos('inline', btnInline));

                const btnEspaciado = document.createElement("button");
                btnEspaciado.type = "button";
                btnEspaciado.className = classStr;
                btnEspaciado.style.cssText = baseStyleStr + " background-color: #198754 !important;";
                btnEspaciado.textContent = "Copiar espaciado";
                btnEspaciado.addEventListener("click", () => copiarDatos('espaciado', btnEspaciado));

                // Insertar los botones justo antes del botón de Cancelar
                container.insertBefore(btnInline, btnCancelar);
                container.insertBefore(btnEspaciado, btnCancelar);
            }
        });
    }

    function copiarDatos(modo, btnElement) {
        const nombreComercial = getFieldValue("Nombre comercial");
        const telefono = getFieldValue("Teléfono");
        const movil = getFieldValue("Móvil");
        const direccion = getFieldValue("Dirección");
        const cp = getFieldValue("C.P.");

        const telefonos = [telefono, movil].filter(t => t.length > 0).join(" - ");

        let textoCopiar = "";

        if (modo === "inline") {
            const partes = [nombreComercial];
            if (telefonos) partes.push(telefonos);
            textoCopiar = partes.join(" - ");
        } else if (modo === "espaciado") {
            const lineas = [];
            if (nombreComercial) lineas.push(nombreComercial);
            if (telefonos) lineas.push(telefonos);
            
            const direccionPartes = [];
            if (direccion) direccionPartes.push(direccion);
            if (cp) direccionPartes.push(cp);
            
            if (direccionPartes.length > 0) {
                lineas.push(direccionPartes.join(" - "));
            }
            
            textoCopiar = lineas.join("\n");
        }

        navigator.clipboard.writeText(textoCopiar).then(() => {
            const originalText = btnElement.textContent;
            btnElement.textContent = "¡Copiado!";
            
            // Esperar 400ms para que el usuario lea "¡Copiado!" y luego cerrar el panel
            setTimeout(() => {
                // Restaurar el texto original por si se vuelve a abrir el panel luego
                btnElement.textContent = originalText;
                
                // Buscar el botón Cancelar original dentro del mismo contenedor y hacerle clic
                const btnCancelar = btnElement.parentElement.querySelector('button.conBorde.sinSombra.btn.btn-lg:not(.btn-tmt-copiar)');
                if (btnCancelar && btnCancelar.textContent.trim() === 'Cancelar') {
                    btnCancelar.click();
                }
            }, 400);
        }).catch(err => {
            console.error('Error al copiar al portapapeles: ', err);
            const originalText = btnElement.textContent;
            btnElement.textContent = "Error";
            setTimeout(() => {
                btnElement.textContent = originalText;
            }, 1500);
        });
    }

    function getFieldValue(labelText) {
        const input = findFieldByLabelText(labelText);
        return input ? (input.value || '').trim() : '';
    }

     function crearBarra() {
        // Crear elemento principal de la barra
        barra = document.createElement("div");
        barra.id = "ng-cpt-barra-vertical";
        
        // Estilos CSS modernos con Glassmorphism y diseño premium (barra vertical a la derecha)
        Object.assign(barra.style, {
            position: "fixed",
            top: "0",
            right: "0",
            width: "280px",
            height: "100vh",
            backgroundColor: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(15px)",
            webkitBackdropFilter: "blur(15px)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "-4px 0 30px rgba(0, 0, 0, 0.4)",
            zIndex: "999999999",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "flex-start",
            padding: "20px 16px",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
            transition: "all 0.3s ease",
            overflowY: "auto"
        });

        // Contenedor superior (solo botón de cerrar)
        const brandContainer = document.createElement("div");
        Object.assign(brandContainer.style, {
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "15px",
            flexShrink: "0"
        });

        // Botón de cerrar barra
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "&times;";
        closeBtn.title = "Cerrar barra";
        Object.assign(closeBtn.style, {
            background: "none",
            border: "none",
            color: "rgba(255, 255, 255, 0.5)",
            fontSize: "24px",
            cursor: "pointer",
            padding: "0 5px",
            lineHeight: "1",
            transition: "color 0.2s, transform 0.2s"
        });
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.color = "#FF4949";
            closeBtn.style.transform = "scale(1.1)";
        });
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.color = "rgba(255, 255, 255, 0.5)";
            closeBtn.style.transform = "scale(1)";
        });
        closeBtn.addEventListener("click", () => {
            toggleBarra();
        });

        brandContainer.appendChild(closeBtn);
        barra.appendChild(brandContainer);

        // Contenedor de botones rápidos
        const buttonsContainer = document.createElement("div");
        Object.assign(buttonsContainer.style, {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            alignItems: "stretch",
            width: "100%",
            boxSizing: "border-box"
        });

        // Botón especial de configuración (Amarillo) - AL PRINCIPIO
        const configBtn = document.createElement("button");
        configBtn.textContent = "configuración";
        configBtn.title = "Abrir panel de configuración";
        Object.assign(configBtn.style, {
            background: "#FFCC00",
            border: "1px solid #E5B800",
            color: "#1a1a1a",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
            boxSizing: "border-box"
        });

        configBtn.addEventListener("mouseenter", () => {
            configBtn.style.background = "#FFE066";
            configBtn.style.transform = "translateY(-2px)";
            configBtn.style.boxShadow = "0 4px 12px rgba(255, 204, 0, 0.3)";
        });

        configBtn.addEventListener("mouseleave", () => {
            configBtn.style.background = "#FFCC00";
            configBtn.style.transform = "translateY(0)";
            configBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        configBtn.addEventListener("click", () => {
            configBtn.style.transform = "scale(0.95)";
            setTimeout(() => {
                configBtn.style.transform = "translateY(-2px)";
            }, 100);
            chrome.runtime.sendMessage({ action: "openOptions" });
        });

        // Botón especial de AutoNG (Azul) - AL PRINCIPIO
        const autoNgBtn = document.createElement("button");
        autoNgBtn.textContent = "AutoNG";
        autoNgBtn.title = "Abrir orden de Northgate del texto seleccionado";
        Object.assign(autoNgBtn.style, {
            background: "#007bff",
            border: "1px solid #0056b3",
            color: "#ffffff",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
            boxSizing: "border-box"
        });

        autoNgBtn.addEventListener("mouseenter", () => {
            autoNgBtn.style.background = "#3395ff";
            autoNgBtn.style.transform = "translateY(-2px)";
            autoNgBtn.style.boxShadow = "0 4px 12px rgba(0, 123, 255, 0.3)";
        });

        autoNgBtn.addEventListener("mouseleave", () => {
            autoNgBtn.style.background = "#007bff";
            autoNgBtn.style.transform = "translateY(0)";
            autoNgBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        autoNgBtn.addEventListener("click", () => {
            autoNgBtn.style.transform = "scale(0.95)";
            setTimeout(() => {
                autoNgBtn.style.transform = "translateY(-2px)";
            }, 100);
            if (window.runAutoNg) {
                window.runAutoNg();
            }
        });

        buttonsContainer.appendChild(configBtn);
        buttonsContainer.appendChild(autoNgBtn);

        // Separador visual
        const sep = document.createElement("div");
        Object.assign(sep.style, {
            height: "1px",
            background: "rgba(255, 255, 255, 0.1)",
            margin: "8px 0"
        });
        buttonsContainer.appendChild(sep);

        const grupos = {
            "ESENCIAL": ["matricula", "kms"],
            "NEUMATICOS": ["desgaste neum. delanteros", "desgaste neum. traseros", "pinchazo", "medidas"],
            "FRENOS": ["pastillas", "pastillas viejas", "discos", "discos viejos"],
            "VARIOS": ["diagnosis", "daño", "material viejo"]
        };

        for (const [nombreGrupo, botones] of Object.entries(grupos)) {
            const header = document.createElement("div");
            header.textContent = nombreGrupo;
            Object.assign(header.style, {
                fontSize: "11px",
                fontWeight: "bold",
                color: "rgba(255, 255, 255, 0.4)",
                letterSpacing: "1px",
                marginTop: "16px",
                marginBottom: "6px",
                textTransform: "uppercase"
            });
            buttonsContainer.appendChild(header);

            botones.forEach(id => {
                const btn = crearBotonRapido(id);
                buttonsContainer.appendChild(btn);
            });
        }

        barra.appendChild(buttonsContainer);

        // Inyectar en el documento
        document.documentElement.appendChild(barra);

        // Ajustar posición inicial a la izquierda del div si existe
        ajustarPosicionBarra();
        setTimeout(ajustarPosicionBarra, 100);
        setTimeout(ajustarPosicionBarra, 250);
        setTimeout(ajustarPosicionBarra, 500);

        // Inyectar animaciones clave por CSS
        inyectarEstilosAnimacion();

        // Mostrar notificación de bienvenida
        mostrarToast("Barra rápida activada");
    }

    function crearBotonRapido(id) {
        const btn = document.createElement("button");
        btn.textContent = id.toLowerCase();
        btn.dataset.id = id;

        // Estilos del botón (adaptados a layout vertical)
        Object.assign(btn.style, {
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#e0e0e0",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "500",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
        });

        // Hover y Focus
        btn.addEventListener("mouseenter", () => {
            btn.style.background = "linear-gradient(135deg, rgba(0, 255, 135, 0.15) 0%, rgba(96, 239, 255, 0.15) 100%)";
            btn.style.borderColor = "rgba(96, 239, 255, 0.4)";
            btn.style.color = "#ffffff";
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 4px 12px rgba(96, 239, 255, 0.15)";
        });

        btn.addEventListener("mouseleave", () => {
            btn.style.background = "rgba(255, 255, 255, 0.05)";
            btn.style.borderColor = "rgba(255, 255, 255, 0.12)";
            btn.style.color = "#e0e0e0";
            btn.style.transform = "translateY(0)";
            btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        btn.addEventListener("click", () => {
            btn.style.transform = "scale(0.95)";
            setTimeout(() => {
                btn.style.transform = "translateY(-2px)";
            }, 100);
            
            // Acción al hacer clic
            ejecutarAccionBoton(id);
        });

        return btn;
    }

    function ejecutarAccionBoton(id) {
        console.log(`Botón de texto rápido presionado: ${id}`);
        
        // Mantener texto a insertar estrictamente en minúsculas
        const labelText = id.toLowerCase();
        
        // Localizar los campos
        const inputNombre = findFieldByLabelText("Nombre del archivo");
        const inputDescripcion = findFieldByLabelText("Descripción del archivo");
        
        let inyectado = false;
        
        if (inputNombre) {
            setInputValue(inputNombre, labelText);
            inyectado = true;
        }
        if (inputDescripcion) {
            setInputValue(inputDescripcion, labelText);
            inyectado = true;
        }
        
        if (inyectado) {
            mostrarToast(`Texto '${labelText}' insertado correctamente`);
        } else {
            mostrarToast(`Error: No se encontraron los campos "Nombre del archivo" o "Descripción del archivo"`, true);
        }
        
        // Plegar la barra automáticamente al presionar
        toggleBarra();
    }

    // Encuentra un input/textarea en el DOM buscando un texto indicador/etiqueta cercano
    function findFieldByLabelText(labelText) {
        const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cleanLabel = stripAccents(labelText.toLowerCase().trim().replace(":", ""));
        const elements = Array.from(document.querySelectorAll('label, span, div, p, td, th, h1, h2, h3, h4, h5, h6'));
        
        function esInputValido(el) {
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'textarea') return true;
            if (tag === 'input') {
                const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
                const invalidTypes = ['file', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset'];
                return !invalidTypes.includes(type);
            }
            return false;
        }

        function buscarInputValido(startNode) {
            if (!startNode) return null;
            if (esInputValido(startNode)) return startNode;
            const inside = Array.from(startNode.querySelectorAll('input, textarea')).find(esInputValido);
            if (inside) return inside;
            return null;
        }

        // 1. Primer barrido: buscar coincidencia exacta
        let target = elements.find(el => {
            const text = stripAccents(el.textContent.trim().toLowerCase().replace(":", ""));
            return text === cleanLabel;
        });
        
        // 2. Segundo barrido: buscar coincidencia por palabras clave
        if (!target) {
            const keywords = cleanLabel.split(/\s+/).filter(w => w.length > 2);
            if (keywords.length > 0) {
                target = elements.find(el => {
                    const text = stripAccents(el.textContent.trim().toLowerCase());
                    return keywords.every(kw => text.includes(kw));
                });
            }
        }

        if (!target) return null;

        // Si es un <label> con 'for', intentar obtener el input por ID
        if (target.tagName === "LABEL" && target.htmlFor) {
            const input = document.getElementById(target.htmlFor);
            if (esInputValido(input)) return input;
        }

        // Intentar buscar dentro de target o usar target si ya es un input válido
        const inputInsideTarget = buscarInputValido(target);
        if (inputInsideTarget) return inputInsideTarget;

        // Buscar input en hermanos siguientes
        let sibling = target.nextElementSibling;
        while (sibling) {
            const found = buscarInputValido(sibling);
            if (found) return found;
            sibling = sibling.nextElementSibling;
        }

        // Buscar subiendo y explorando la jerarquía cercana (hasta 3 niveles arriba)
        let parent = target.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            const inputs = Array.from(parent.querySelectorAll('input, textarea')).filter(esInputValido);
            if (inputs.length > 0) {
                const found = inputs.find(inp => inp !== target);
                if (found) return found;
            }
            
            // Buscar en hermanos del padre
            let parentSibling = parent.nextElementSibling;
            while (parentSibling) {
                const found = buscarInputValido(parentSibling);
                if (found) return found;
                parentSibling = parentSibling.nextElementSibling;
            }
            parent = parent.parentElement;
        }

        return null;
    }

    // Modifica de forma segura el valor del input/textarea forzando la actualización en frameworks SPA (React/Angular/Vue)
    function setInputValue(input, value) {
        if (!input) return;
        
        try {
            // Detectar el prototipo correcto para simular la entrada nativa de usuario
            const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
            
            if (descriptor && descriptor.set) {
                descriptor.set.call(input, value);
            } else {
                input.value = value;
            }
            
            // Disparar eventos nativos para que React, Vue o Angular actualicen sus estados bindings
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.error("Error setting input value via prototype descriptor", e);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // Sistema de notificaciones integradas (Toast) - Deshabilitado a petición del usuario
    function mostrarToast(mensaje, esError = false) {
        // No-op: las notificaciones visuales han sido desactivadas para no molestar la UI nativa.
    }

    function inyectarEstilosAnimacion() {
        if (document.getElementById("ng-cpt-keyframe-styles")) return;

        const styles = document.createElement("style");
        styles.id = "ng-cpt-keyframe-styles";
        styles.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.15); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }

    return {
        init: init,
        toggle: toggleBarra
    };
})();
