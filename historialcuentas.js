// Inicializar Supabase
const SUPABASE_URL = 'https://ouglkdanbxomammpqhmc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Z2xrZGFuYnhvbWFtbXBxaG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTc2NjUsImV4cCI6MjA3NDA3MzY2NX0.MV2IJ8LGCASbf6qgZuIkQ_CWl0i-w9UcmrlyUb1E4WI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos DOM
const themeToggle = document.getElementById('themeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const userRoleSpan = document.getElementById('userRole');
const fechaInicio = document.getElementById('fechaInicio');
const fechaFin = document.getElementById('fechaFin');
const filtroMesero = document.getElementById('filtroMesero');
const filtroTipoPago = document.getElementById('filtroTipoPago');
const limpiarFiltrosBtn = document.getElementById('limpiarFiltrosBtn');
const aplicarFiltrosBtn = document.getElementById('aplicarFiltrosBtn');
const cuentasTableBody = document.getElementById('cuentasTableBody');
const emptyState = document.getElementById('emptyState');
const exportarCSVBtn = document.getElementById('exportarCSVBtn');
const exportarPDFBtn = document.getElementById('exportarPDFBtn');
const totalCuentas = document.getElementById('totalCuentas');
const totalVendido = document.getElementById('totalVendido');
const promedioCuenta = document.getElementById('promedioCuenta');
const cuentasHoy = document.getElementById('cuentasHoy');

// Modal
const detalleModal = document.getElementById('detalleModal');
const detalleContent = document.getElementById('detalleContent');

// ----------------- nuevo: estilos para modal flotante -----------------
function injectFloatingModalCSS() {
    if (document.getElementById('floating-modal-styles')) return;
    const css = `
        /* Overlay centrado y flotante */
        #detalleModal {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            backdrop-filter: blur(3px) saturate(110%);
            justify-content: center;
            align-items: center;
            padding: 20px;
            z-index: 1200;
        }
        /* Contenido del modal */
        #detalleContent {
            width: 100%;
            max-width: 880px;
            max-height: 80vh;
            overflow: auto;
            background: var(--card-bg, #ffffff);
            color: var(--text-color, #111);
            padding: 18px;
            border-radius: 12px;
            box-shadow: 0 14px 40px rgba(0,0,0,0.28);
            border: 1px solid rgba(0,0,0,0.06);
        }
        /* Ajustes para tema oscuro */
        .dark-theme #detalleContent {
            background: var(--card-bg-dark, #0f1720);
            color: var(--text-color-light, #e6eef8);
            border-color: rgba(255,255,255,0.04);
            box-shadow: 0 10px 28px rgba(0,0,0,0.55);
        }
    `;
    const style = document.createElement('style');
    style.id = 'floating-modal-styles';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
}
// ----------------- fin estilos -----------------

// Variables de estado
let currentUser = null;
let cuentas = [];
let meseros = [];
let filtrosActuales = {
    fechaInicio: null,
    fechaFin: null,
    mesero: 'todos',
    tipoPago: 'todos'
};

// Inicializar la aplicación
async function init() {
    // inyectar estilos del modal flotante
    injectFloatingModalCSS();

    // Verificar autenticación
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Cargar datos de usuario
    const userData = JSON.parse(localStorage.getItem('user'));
    if (userData) {
        currentUser = userData;
        userRoleSpan.textContent = userData.role;

        // Verificar si es admin
        if (userData.role !== 'admin') {
            mostrarError('No tienes permisos para acceder a esta página');
            window.location.href = 'main.html';
            return;
        }
    }

    // Configurar fechas por defecto (últimos 30 días)
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);

    fechaInicio.valueAsDate = hace30Dias;
    fechaFin.valueAsDate = hoy;

    // Cargar meseros
    await cargarMeseros();

    // Cargar cuentas
    await cargarCuentas();

    // Configurar event listeners
    configurarEventListeners();

    // Verificar tema
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
    }
}

// Cargar lista de meseros
async function cargarMeseros() {
    try {
        const { data, error } = await supabaseClient
            .from('perfiles')
            .select('nombre')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error) throw error;

        meseros = data || [];

        // Limpiar y llenar select de meseros
        filtroMesero.innerHTML = '<option value="todos">Todos los meseros</option>';
        meseros.forEach(mesero => {
            const option = document.createElement('option');
            option.value = mesero.nombre;
            option.textContent = mesero.nombre;
            filtroMesero.appendChild(option);
        });

    } catch (error) {
        console.error('Error cargando meseros:', error);
    }
}

// Cargar cuentas desde Supabase
async function cargarCuentas() {
    try {
        let query = supabaseClient
            .from('cuentas')
            .select(`
                        *,
                        mesas (numero)
                    `)
            .eq('status', 1) // Solo cuentas cerradas
            .order('fecha_cierre', { ascending: false });

        // Aplicar filtros de fecha
        if (filtrosActuales.fechaInicio) {
            query = query.gte('fecha_cierre', filtrosActuales.fechaInicio + 'T00:00:00');
        }
        if (filtrosActuales.fechaFin) {
            query = query.lte('fecha_cierre', filtrosActuales.fechaFin + 'T23:59:59');
        }

        // Aplicar filtro de mesero
        if (filtrosActuales.mesero !== 'todos') {
            query = query.eq('mesero_nombre', filtrosActuales.mesero);
        }

        // Aplicar filtro de tipo de pago
        if (filtrosActuales.tipoPago !== 'todos') {
            query = query.eq('tipo_pago', filtrosActuales.tipoPago);
        }

        const { data, error } = await query;

        if (error) throw error;

        cuentas = data || [];
        renderizarCuentas();
        actualizarEstadisticas();

    } catch (error) {
        console.error('Error cargando cuentas:', error);
        mostrarError('Error al cargar el historial de cuentas');
    }
}

// Renderizar cuentas en la tabla
function renderizarCuentas() {
    cuentasTableBody.innerHTML = '';

    if (cuentas.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    cuentas.forEach(cuenta => {
        const row = document.createElement('tr');

        // Formatear fechas
        const fechaApertura = new Date(cuenta.fecha_apertura).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const fechaCierre = new Date(cuenta.fecha_cierre).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // Formatear tipo de pago
        const tipoPago = cuenta.tipo_pago || 'No especificado';
        const pagoClass = `pago-${tipoPago}`;

        row.innerHTML = `
                    <td>${cuenta.id}</td>
                    <td>${cuenta.mesas?.numero || 'N/A'}</td>
                    <td>${cuenta.mesero_nombre || 'No asignado'}</td>
                    <td class="total-amount">$${parseFloat(cuenta.total).toFixed(2)}</td>
                    <td>
                        <span class="pago-badge ${pagoClass}">
                            ${tipoPago.charAt(0).toUpperCase() + tipoPago.slice(1)}
                        </span>
                    </td>
                    <td>${fechaApertura}</td>
                    <td>${fechaCierre}</td>
                    <td class="action-buttons">
                        <button class="btn btn-info btn-ver" data-id="${cuenta.id}">Ver Detalles</button>
                    </td>
                `;

        cuentasTableBody.appendChild(row);
    });

    // Añadir event listeners a los botones
    document.querySelectorAll('.btn-ver').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.dataset.id;
            const cuenta = cuentas.find(c => c.id === parseInt(id));
            if (cuenta) verDetallesCuenta(cuenta);
        });
    });
}

// Actualizar estadísticas
function actualizarEstadisticas() {
    // Total de cuentas
    totalCuentas.textContent = cuentas.length;

    // Total vendido
    const total = cuentas.reduce((sum, cuenta) => sum + parseFloat(cuenta.total), 0);
    totalVendido.textContent = `$${total.toFixed(2)}`;

    // Promedio por cuenta
    const promedio = cuentas.length > 0 ? total / cuentas.length : 0;
    promedioCuenta.textContent = `$${promedio.toFixed(2)}`;

    // Cuentas de hoy
    const hoy = new Date().toISOString().split('T')[0];
    const cuentasHoyCount = cuentas.filter(cuenta =>
        cuenta.fecha_cierre.split('T')[0] === hoy
    ).length;
    cuentasHoy.textContent = cuentasHoyCount;
}

// Ver detalles de una cuenta
async function verDetallesCuenta(cuenta) {
    try {
        // Cargar órdenes e items de la cuenta
        const { data: ordenes, error } = await supabaseClient
            .from('ordenes')
            .select(`
                        id,
                        persona,
                        orden_items (
                            nombre_platillo,
                            cantidad,
                            precio_unitario,
                            total
                        )
                    `)
            .eq('cuenta_id', cuenta.id);

        if (error) throw error;

        let detallesHTML = `
                    <div class="detalle-info">
                        <h3>Información de la Cuenta</h3>
                        <p><strong>ID:</strong> ${cuenta.id}</p>
                        <p><strong>Mesa:</strong> ${cuenta.mesas?.numero || 'N/A'}</p>
                        <p><strong>Mesero:</strong> ${cuenta.mesero_nombre || 'No asignado'}</p>
                        <p><strong>Total:</strong> $${parseFloat(cuenta.total).toFixed(2)}</p>
                        <p><strong>Tipo de Pago:</strong> ${cuenta.tipo_pago || 'No especificado'}</p>
                        <p><strong>Fecha Apertura:</strong> ${new Date(cuenta.fecha_apertura).toLocaleString()}</p>
                        <p><strong>Fecha Cierre:</strong> ${new Date(cuenta.fecha_cierre).toLocaleString()}</p>
                    </div>
                `;

        if (ordenes && ordenes.length > 0) {
            detallesHTML += '<div class="detalle-items"><h3>Items del Pedido</h3>';

            ordenes.forEach(orden => {
                // Filtrar items válidos
                const itemsValidos = (orden.orden_items || []).filter(item =>
                    item.nombre_platillo &&
                    item.nombre_platillo.trim() !== '' &&
                    item.cantidad &&
                    item.precio_unitario &&
                    item.total
                );

                // Solo mostrar la tabla si hay items válidos
                if (itemsValidos.length > 0) {
                    detallesHTML += `
            <div class="grupo-persona">
                <h4>Persona ${orden.persona}</h4>
                <table style="width: 100%; margin-top: 0.5rem;">
                    <thead>
                        <tr>
                            <th>Platillo</th>
                            <th>Cantidad</th>
                            <th>Precio Unitario</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

                    itemsValidos.forEach(item => {
                        detallesHTML += `
                <tr>
                    <td>${item.nombre_platillo}</td>
                    <td>${item.cantidad}</td>
                    <td>$${parseFloat(item.precio_unitario).toFixed(2)}</td>
                    <td>$${parseFloat(item.total).toFixed(2)}</td>
                </tr>
            `;
                    });

                    detallesHTML += '</tbody></table></div>';
                }
            });

            detallesHTML += '</div>';
        }

        if (cuenta.notas) {
            detallesHTML += `
                        <div class="detalle-notas">
                            <h3>Notas</h3>
                            <p>${cuenta.notas}</p>
                        </div>
                    `;
        }

        detalleContent.innerHTML = detallesHTML;

        // Asegurar que el overlay use flex y centrado (por si alguna regla previa lo sobrescribió)
        detalleModal.style.display = 'flex';
        detalleModal.style.justifyContent = 'center';
        detalleModal.style.alignItems = 'center';
        detalleModal.style.padding = '20px';
        detalleModal.style.zIndex = '1200';

    } catch (error) {
        console.error('Error cargando detalles:', error);
        mostrarError('Error al cargar los detalles de la cuenta');
    }
}

// Configurar event listeners
function configurarEventListeners() {
    // Tema toggle
    themeToggle.addEventListener('click', toggleTema);

    // Logout
    logoutBtn.addEventListener('click', cerrarSesion);

    // Filtros
    aplicarFiltrosBtn.addEventListener('click', aplicarFiltros);
    limpiarFiltrosBtn.addEventListener('click', limpiarFiltros);

    // Exportar
    exportarCSVBtn.addEventListener('click', exportarCSV);
    exportarPDFBtn.addEventListener('click', exportarPDF);

    // Cerrar modal
    document.getElementById('closeModal').addEventListener('click', cerrarModal);
    document.getElementById('cerrarDetalleBtn').addEventListener('click', cerrarModal);

    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === detalleModal) cerrarModal();
    });
}

// Toggle tema claro/oscuro
function toggleTema() {
    document.body.classList.toggle('dark-theme');
    if (document.body.classList.contains('dark-theme')) {
        localStorage.setItem('theme', 'dark');
        themeToggle.textContent = '☀️';
    } else {
        localStorage.setItem('theme', 'light');
        themeToggle.textContent = '🌙';
    }
}

// Cerrar sesión
async function cerrarSesion() {
    await supabaseClient.auth.signOut();
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Aplicar filtros
function aplicarFiltros() {
    filtrosActuales.fechaInicio = fechaInicio.value;
    filtrosActuales.fechaFin = fechaFin.value;
    filtrosActuales.mesero = filtroMesero.value;
    filtrosActuales.tipoPago = filtroTipoPago.value;

    cargarCuentas();
}

// Limpiar filtros
function limpiarFiltros() {
    const hoy = new Date();
    const hace30Dias = new Date();
    hace30Dias.setDate(hoy.getDate() - 30);

    fechaInicio.valueAsDate = hace30Dias;
    fechaFin.valueAsDate = hoy;
    filtroMesero.value = 'todos';
    filtroTipoPago.value = 'todos';

    aplicarFiltros();
}

// Cerrar modal
function cerrarModal() {
    detalleModal.style.display = 'none';
}

// Exportar a CSV
function exportarCSV() {
    if (cuentas.length === 0) {
        mostrarError('No hay datos para exportar');
        return;
    }

    const headers = ['ID', 'Mesa', 'Mesero', 'Total', 'Tipo Pago', 'Fecha Apertura', 'Fecha Cierre'];
    const csvData = cuentas.map(cuenta => [
        cuenta.id,
        cuenta.mesas?.numero || 'N/A',
        cuenta.mesero_nombre || 'No asignado',
        parseFloat(cuenta.total).toFixed(2),
        cuenta.tipo_pago || 'No especificado',
        new Date(cuenta.fecha_apertura).toLocaleString(),
        new Date(cuenta.fecha_cierre).toLocaleString()
    ]);

    const csvContent = [headers, ...csvData]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `historial_cuentas_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Exportar a PDF (función básica - se puede mejorar con librerías)
function exportarPDF() {
    if (cuentas.length === 0) {
        mostrarError('No hay datos para exportar');
        return;
    }

    // Crear una ventana de impresión básica
    const ventana = window.open('', '_blank');
    const contenido = `
                <html>
                    <head>
                        <title>Historial de Cuentas</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 20px; }
                            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; }
                            .total { font-weight: bold; margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <h1>Historial de Cuentas - La cayetana</h1>
                        <p>Generado el: ${new Date().toLocaleString()}</p>
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Mesa</th>
                                    <th>Mesero</th>
                                    <th>Total</th>
                                    <th>Tipo Pago</th>
                                    <th>Fecha Cierre</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cuentas.map(cuenta => `
                                    <tr>
                                        <td>${cuenta.id}</td>
                                        <td>${cuenta.mesas?.numero || 'N/A'}</td>
                                        <td>${cuenta.mesero_nombre || 'No asignado'}</td>
                                        <td>$${parseFloat(cuenta.total).toFixed(2)}</td>
                                        <td>${cuenta.tipo_pago || 'No especificado'}</td>
                                        <td>${new Date(cuenta.fecha_cierre).toLocaleDateString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="total">
                            Total Vendido: $${cuentas.reduce((sum, cuenta) => sum + parseFloat(cuenta.total), 0).toFixed(2)}
                        </div>
                    </body>
                </html>
            `;

    ventana.document.write(contenido);
    ventana.document.close();
    ventana.print();
}

// Mostrar error
function mostrarError(mensaje) {
    alert(`Error: ${mensaje}`);
}

// Iniciar la aplicación
init();