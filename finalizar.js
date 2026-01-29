const SUPABASE_URL = 'https://ouglkdanbxomammpqhmc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Z2xrZGFuYnhvbWFtbXBxaG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTc2NjUsImV4cCI6MjA3NDA3MzY2NX0.MV2IJ8LGCASbf6qgZuIkQ_CWl0i-w9UcmrlyUb1E4WI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cuenta = null;
let mesa = null;
let items = [];
let metodoPagoSeleccionado = null;
let vistaActual = 'separada';

async function init() {
    // Verificar autenticación
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Cargar datos de usuario
    const userData = JSON.parse(localStorage.getItem('user'));
    if (userData) {
        document.getElementById('userRole').textContent = userData.role;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const cuentaId = urlParams.get('cuenta_id');
    const mesaId = urlParams.get('mesa_id');

    if (!cuentaId || !mesaId) {
        window.location.href = 'mesasparapedir.html';
        return;
    }

    await cargarDatos(cuentaId, mesaId);
    configurarEventListeners();

    // Verificar tema
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeToggle').textContent = '☀️';
    }
}

async function cargarDatos(cuentaId, mesaId) {
    try {
        // Cargar cuenta
        const { data: cuentaData, error: cuentaError } = await supabaseClient
            .from('cuentas')
            .select('*')
            .eq('id', cuentaId)
            .single();

        if (cuentaError) throw cuentaError;
        cuenta = cuentaData;

        // Cargar mesa
        const { data: mesaData, error: mesaError } = await supabaseClient
            .from('mesas')
            .select('*')
            .eq('id', mesaId)
            .single();

        if (mesaError) throw mesaError;
        mesa = mesaData;

        // Cargar items de la cuenta
        const { data: itemsData, error: itemsError } = await supabaseClient
            .from('ordenes')
            .select(`
                        id,
                        persona,
                        orden_items (
                            id,
                            nombre_platillo,
                            cantidad,
                            precio_unitario,
                            total
                        )
                    `)
            .eq('cuenta_id', cuentaId);

        if (itemsError) throw itemsError;
        items = itemsData;

        mostrarInfoCuenta();
        mostrarResumen();

    } catch (error) {
        console.error('Error cargando datos:', error);
        alert('Error al cargar la cuenta');
    }
}

function mostrarInfoCuenta() {
    const infoHtml = `
                <div class="info-item">
                    <span class="info-label">Mesa:</span>
                    <span class="info-value">${mesa.numero}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Fecha apertura:</span>
                    <span class="info-value">${new Date(cuenta.fecha_apertura).toLocaleString()}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Mesero:</span>
                    <span class="info-value">${cuenta.mesero_nombre || 'No asignado'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Total items:</span>
                    <span class="info-value">${items.reduce((total, orden) => total + orden.orden_items.length, 0)}</span>
                </div>
            `;
    document.getElementById('infoCuenta').innerHTML = infoHtml;
}

function mostrarResumen() {
    // Recalcular total a partir de los items para evitar depender de un
    // campo `cuenta.total` que puede estar desactualizado o haberse actualizado
    // incorrectamente en la base de datos.
    const totalFromItems = items.reduce((sumOrdenes, orden) => {
        const ordenSum = (orden.orden_items || []).reduce((s, it) => {
            const val = parseFloat(it.total) || 0;
            return s + val;
        }, 0);
        return sumOrdenes + ordenSum;
    }, 0);

    document.getElementById('totalCuenta').textContent = totalFromItems.toFixed(2);

    // Log de discrepancia para debugging (opcional)
    if (typeof cuenta?.total !== 'undefined' && Math.abs((parseFloat(cuenta.total) || 0) - totalFromItems) > 0.005) {
        console.warn(`Discrepancia detectada entre cuenta.total=${cuenta.total} y suma de items=${totalFromItems}`);
    }

    const vistaCuenta = document.getElementById('vistaCuenta').value;
    let html = '';

    if (vistaCuenta === 'separada') {
        // Agrupar items por persona
        const personas = {};
        items.forEach(orden => {
            const persona = orden.persona;
            if (!personas[persona]) {
                personas[persona] = [];
            }
            personas[persona].push(...orden.orden_items.filter(item => parseFloat(item.total) > 0));
        });

        Object.entries(personas).forEach(([persona, itemsPersona]) => {
            if (itemsPersona.length === 0) return;
            const totalPersona = itemsPersona.reduce((sum, item) => sum + parseFloat(item.total), 0);

            html += `
                        <div class="grupo-persona">
                            <div class="header-persona">
                                <span class="nombre-persona">${persona}</span>
                                <span class="total-persona">$${totalPersona.toFixed(2)}</span>
                            </div>
                            <hr style="border-color: var(--primary-color); margin-bottom: 1rem;">
                    `;
            itemsPersona.forEach(item => {
                html += `
                            <div class="item-cuenta">
                                <span>${item.nombre_platillo} x${item.cantidad}</span>
                                <span>$${parseFloat(item.total).toFixed(2)}</span>
                            </div>
                        `;
            });
            html += `</div>`;
        });
    } else {
        // Vista junta
        const itemsAgrupados = {};
        items.forEach(orden => {
            orden.orden_items.forEach(item => {
                const key = item.nombre_platillo;
                if (!itemsAgrupados[key]) {
                    itemsAgrupados[key] = {
                        nombre: item.nombre_platillo,
                        cantidad: 0,
                        total: 0
                    };
                }
                itemsAgrupados[key].cantidad += item.cantidad;
                itemsAgrupados[key].total += parseFloat(item.total);
            });
        });

        Object.values(itemsAgrupados).forEach(item => {
            html += `
                        <div class="item-cuenta">
                            <span>${item.nombre} x${item.cantidad}</span>
                            <span>$${item.total.toFixed(2)}</span>
                        </div>
                    `;
        });
    }

    document.getElementById('detalleItems').innerHTML = html;
}

function configurarEventListeners() {
    // Tema toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTema);

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', cerrarSesion);

    // Cambio de vista
    document.getElementById('vistaCuenta').addEventListener('change', mostrarResumen);

    // Selección de método de pago
    document.querySelectorAll('.opcion-pago').forEach(opcion => {
        opcion.addEventListener('click', () => {
            document.querySelectorAll('.opcion-pago').forEach(o => o.classList.remove('seleccionada'));
            opcion.classList.add('seleccionada');
            metodoPagoSeleccionado = opcion.dataset.metodo;
        });
    });

    // Botones de acción
    document.getElementById('imprimirBtn').addEventListener('click', imprimirTicket);
    document.getElementById('previsualizarBtn').addEventListener('click', previsualizarTicket);
    document.getElementById('finalizarBtn').addEventListener('click', finalizarCuenta);
}

function toggleTema() {
    document.body.classList.toggle('dark-theme');
    if (document.body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
        document.getElementById('themeToggle').textContent = '☀️';
    } else {
        localStorage.setItem('theme', 'light');
        document.getElementById('themeToggle').textContent = '🌙';
    }
}

async function cerrarSesion() {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Función para imprimir ticket (fácil de implementar después)
function imprimirTicket() {
    const tipoTicket = document.getElementById('tipoTicket').value;
    const datosTicket = {
        cuenta: cuenta,
        mesa: mesa,
        items: items,
        tipo: tipoTicket,
        vista: document.getElementById('vistaCuenta').value,
        metodoPago: metodoPagoSeleccionado,
        notas: document.getElementById('notasFinales').value
    };

    console.log('Datos para imprimir:', datosTicket);
    alert('Función de impresión lista para implementar. Ver consola para datos.');

    // Aquí se integrará la lógica de impresión PDF
    // generarPDF(datosTicket);
}

// Función para previsualizar ticket
// Función para previsualizar ticket
function previsualizarTicket() {
    const tipoTicket = document.getElementById('tipoTicket').value;
    const vistaCuenta = document.getElementById('vistaCuenta').value;
    const notas = document.getElementById('notasFinales').value;

    // Crear ventana de previsualización
    const previsualizacionWindow = window.open('', '_blank', 'width=400,height=600,scrollbars=yes');

    const contenidoTicket = generarContenidoTicket(tipoTicket, vistaCuenta, notas);

    previsualizacionWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Previsualización de Ticket</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Courier New', monospace;
                }
                body {
                    padding: 15px;
                    background: white;
                    color: black;
                    font-size: 12px;
                    line-height: 1.3;
                }
                .ticket {
                    max-width: 350px;
                    margin: 0 auto;
                    border: 1px solid #ccc;
                    padding: 20px;
                    background: white;
                }
                .header {
                    text-align: center;
                    margin-bottom: 15px;
                    border-bottom: 2px dashed #333;
                    padding-bottom: 10px;
                }
                .logo {
                    max-width: 120px;
                    margin-bottom: 8px;
                }
                .restaurant-name {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 5px;
                    text-transform: uppercase;
                }
                .slogan {
                    font-size: 10px;
                    color: #666;
                    margin-bottom: 8px;
                }
                .info-section {
                    margin-bottom: 15px;
                    border-bottom: 1px dashed #ccc;
                    padding-bottom: 10px;
                }
                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 3px;
                }
                .info-label {
                    font-weight: bold;
                }
                .items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 15px 0;
                }
                .items-table th {
                    text-align: left;
                    border-bottom: 1px solid #333;
                    padding: 5px 0;
                    font-weight: bold;
                }
                .items-table td {
                    padding: 4px 0;
                    border-bottom: 1px dotted #ccc;
                }
                .item-name {
                    text-align: left;
                    width: 60%;
                }
                .item-qty {
                    text-align: center;
                    width: 15%;
                }
                .item-price {
                    text-align: right;
                    width: 25%;
                }
                .total-section {
                    border-top: 2px solid #333;
                    margin-top: 15px;
                    padding-top: 10px;
                    font-weight: bold;
                }
                .total-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                }
                .grand-total {
                    font-size: 14px;
                    border-top: 1px solid #333;
                    padding-top: 5px;
                    margin-top: 5px;
                }
                .notas-section {
                    margin-top: 15px;
                    padding-top: 10px;
                    border-top: 1px dashed #ccc;
                    font-style: italic;
                }
                .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px dashed #ccc;
                    padding-top: 10px;
                }
                .persona-header {
                    background: #f5f5f5;
                    padding: 5px;
                    margin: 8px 0 5px 0;
                    border-left: 3px solid #333;
                    font-weight: bold;
                }
                .separator {
                    border-top: 1px dashed #ccc;
                    margin: 5px 0;
                }
            </style>
        </head>
        <body>
            <div class="ticket">
                ${contenidoTicket}
            </div>
            <script>
                window.print();
            </script>
        </body>
        </html>
    `);

    previsualizacionWindow.document.close();
}

function generarContenidoTicket(tipoTicket, vistaCuenta, notas) {
    const fecha = new Date();
    const folio = `ORD-${cuenta.id.toString().padStart(4, '0')}`;

    let itemsHTML = '';
    let totalGeneral = 0;

    if (vistaCuenta === 'separada' && tipoTicket === 'individual') {
        // Tickets individuales por persona
        const personas = {};

        // Agrupar items por persona
        items.forEach(orden => {
            const persona = orden.persona;
            if (!personas[persona]) {
                personas[persona] = [];
            }
            personas[persona].push(...orden.orden_items.filter(item => parseFloat(item.total) > 0));
        });

        Object.entries(personas).forEach(([persona, itemsPersona]) => {
            if (itemsPersona.length === 0) return;

            const totalPersona = itemsPersona.reduce((sum, item) => sum + parseFloat(item.total), 0);
            totalGeneral += totalPersona;

            itemsHTML += `
                <div class="persona-header">Persona: ${persona}</div>
                <table class="items-table">
                    <thead>
                        <tr>
                            <th class="item-name">Producto</th>
                            <th class="item-qty">Cant</th>
                            <th class="item-price">Total</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            itemsPersona.forEach(item => {
                itemsHTML += `
                    <tr>
                        <td class="item-name">${item.nombre_platillo}</td>
                        <td class="item-qty">${item.cantidad}</td>
                        <td class="item-price">$${parseFloat(item.total).toFixed(2)}</td>
                    </tr>
                `;
            });

            itemsHTML += `
                    </tbody>
                </table>
                <div class="total-row">
                    <span>Subtotal ${persona}:</span>
                    <span>$${totalPersona.toFixed(2)}</span>
                </div>
                <div class="separator"></div>
            `;
        });

    } else {
        // Ticket general o vista junta
        const itemsAgrupados = {};

        items.forEach(orden => {
            orden.orden_items.forEach(item => {
                if (parseFloat(item.total) <= 0) return;

                const key = item.nombre_platillo;
                if (!itemsAgrupados[key]) {
                    itemsAgrupados[key] = {
                        nombre: item.nombre_platillo,
                        cantidad: 0,
                        total: 0
                    };
                }
                itemsAgrupados[key].cantidad += item.cantidad;
                itemsAgrupados[key].total += parseFloat(item.total);
                totalGeneral += parseFloat(item.total);
            });
        });

        itemsHTML = `
            <table class="items-table">
                <thead>
                    <tr>
                        <th class="item-name">Producto</th>
                        <th class="item-qty">Cant</th>
                        <th class="item-price">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.values(itemsAgrupados).forEach(item => {
            itemsHTML += `
                <tr>
                    <td class="item-name">${item.nombre}</td>
                    <td class="item-qty">${item.cantidad}</td>
                    <td class="item-price">$${item.total.toFixed(2)}</td>
                </tr>
            `;
        });

        itemsHTML += `
                </tbody>
            </table>
        `;
    }

    return `
        <div class="header">
            <img src="./logocaye.png" alt="Logo" class="logo" onerror="this.style.display='none'">
            <div class="restaurant-name">La Cayetana</div>
            <div class="slogan">¡Gracias por su visita!</div>
        </div>

        <div class="info-section">
            <div class="info-row">
                <span class="info-label">Folio:</span>
                <span>${folio}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Fecha:</span>
                <span>${fecha.toLocaleDateString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Hora:</span>
                <span>${fecha.toLocaleTimeString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Mesa:</span>
                <span>${mesa.numero}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Tipo cuenta:</span>
                <span>${vistaCuenta === 'separada' ? 'Separada' : 'Junta'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Mesero:</span>
                <span>${cuenta.mesero_nombre || 'No asignado'}</span>
            </div>
        </div>

        ${itemsHTML}

        <div class="total-section">
            <div class="total-row grand-total">
                <span>TOTAL GENERAL:</span>
                <span>$${totalGeneral.toFixed(2)}</span>
            </div>
        </div>

        <div class="info-section">
            <div class="info-row">
                <span class="info-label">Método de pago:</span>
                <span>${metodoPagoSeleccionado ? metodoPagoSeleccionado.charAt(0).toUpperCase() + metodoPagoSeleccionado.slice(1) : 'No seleccionado'}</span>
            </div>
        </div>

        ${notas ? `
            <div class="notas-section">
                <div><strong>Notas:</strong></div>
                <div>${notas}</div>
            </div>
        ` : ''}

        <div class="footer">
            <div>¡Gracias por su preferencia!</div>
            <div>Vuelva pronto</div>
            <div>${fecha.toLocaleString()}</div>
        </div>
    `;
}

async function finalizarCuenta() {
    if (!metodoPagoSeleccionado) {
        alert('Selecciona un método de pago');
        return;
    }

    try {
        const notas = document.getElementById('notasFinales').value;

        // Actualizar cuenta como cerrada
        const { error } = await supabaseClient
            .from('cuentas')
            .update({
                status: 1,
                fecha_cierre: new Date().toISOString(),
                tipo_pago: metodoPagoSeleccionado,
                notas: notas
            })
            .eq('id', cuenta.id);

        if (error) throw error;

        // Liberar la mesa
        await supabaseClient
            .from('mesas')
            .update({ ocupado: false })
            .eq('id', mesa.id);

        // Eliminar nota asociada a la mesa
        await supabaseClient
            .from('notas_mesa')
            .delete()
            .eq('mesa_id', mesa.id);

        alert('✅ Cuenta finalizada correctamente!');
        window.location.href = 'mesasparapedir.html';

    } catch (error) {
        console.error('Error finalizando cuenta:', error);
        alert('❌ Error al finalizar la cuenta');
    }
}

init();