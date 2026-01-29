// Inicializar Supabase
const SUPABASE_URL = 'https://ouglkdanbxomammpqhmc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91Z2xrZGFuYnhvbWFtbXBxaG1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0OTc2NjUsImV4cCI6MjA3NDA3MzY2NX0.MV2IJ8LGCASbf6qgZuIkQ_CWl0i-w9UcmrlyUb1E4WI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos DOM
const themeToggle = document.getElementById('themeToggle');
const logoutBtn = document.getElementById('logoutBtn');
const userRoleSpan = document.getElementById('userRole');
const actualizarBtn = document.getElementById('actualizarBtn');
const ordenesGrid = document.getElementById('ordenesGrid');
const emptyState = document.getElementById('emptyState');
const totalOrdenes = document.getElementById('totalOrdenes');
const totalMesas = document.getElementById('totalMesas');
const totalItems = document.getElementById('totalItems');
const valorTotal = document.getElementById('valorTotal');

// Modal
const modificarModal = document.getElementById('modificarModal');
const modificarContent = document.getElementById('modificarContent');

// Variables de estado
let currentUser = null;
let ordenesActivas = [];
let cuentasActivas = [];

// Inicializar la aplicación
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
        currentUser = userData;
        userRoleSpan.textContent = userData.role;
    }

    // Cargar órdenes activas
    await cargarOrdenesActivas();

    // Configurar event listeners
    configurarEventListeners();

    // Verificar tema
    if (localStorage.getItem('theme') === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
    }

    // Actualizar cada 30 segundos
    setInterval(cargarOrdenesActivas, 30000);

    // Ocultar el modal al iniciar
    modificarModal.style.display = 'none';
}

// Cargar órdenes activas desde Supabase
async function cargarOrdenesActivas() {
    try {
        // Cargar cuentas activas (status = 0)
        const { data: cuentas, error: errorCuentas } = await supabaseClient
            .from('cuentas')
            .select(`
                        id,
                        mesa_id,
                        total,
                        mesero_nombre,
                        fecha_apertura,
                        mesas (numero)
                    `)
            .eq('status', 0) // Cuentas activas
            .order('fecha_apertura', { ascending: true });

        if (errorCuentas) throw errorCuentas;

        cuentasActivas = cuentas || [];

        if (cuentasActivas.length === 0) {
            ordenesActivas = [];
            renderizarOrdenes();
            actualizarEstadisticas();
            return;
        }

        // Cargar órdenes para las cuentas activas
        const { data: ordenes, error: errorOrdenes } = await supabaseClient
            .from('ordenes')
            .select(`
                        id,
                        cuenta_id,
                        persona,
                        staff_id,
                        creado_en,
                        orden_items (
                            id,
                            platillo_id,
                            nombre_platillo,
                            cantidad,
                            precio_unitario,
                            total
                        )
                    `)
            .in('cuenta_id', cuentasActivas.map(c => c.id))
            .order('creado_en', { ascending: false });

        if (errorOrdenes) throw errorOrdenes;

        // Agrupar órdenes por cuenta
        ordenesActivas = cuentasActivas.map(cuenta => {
            const ordenesCuenta = ordenes?.filter(o => o.cuenta_id === cuenta.id) || [];
            return {
                cuenta: cuenta,
                ordenes: ordenesCuenta
            };
        });

        renderizarOrdenes();
        actualizarEstadisticas();

    } catch (error) {
        console.error('Error cargando órdenes activas:', error);
        mostrarError('Error al cargar las órdenes activas');
    }
}

// Renderizar órdenes en la grid
function renderizarOrdenes() {
    ordenesGrid.innerHTML = '';

    if (ordenesActivas.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    ordenesActivas.forEach(grupo => {
        const cuenta = grupo.cuenta;
        const ordenes = grupo.ordenes;

        // Calcular total de la cuenta a partir de los items (no fiarse de cuenta.total)
        const totalCuenta = ordenes.reduce((sumOrden, orden) => {
            return sumOrden + (orden.orden_items?.reduce((s, it) => s + (parseFloat(it.total) || 0), 0) || 0);
        }, 0);

        // Calcular tiempo transcurrido
        const tiempoApertura = new Date(cuenta.fecha_apertura);
        const ahora = new Date();
        const diffMs = ahora - tiempoApertura;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHoras = Math.floor(diffMins / 60);
        const tiempoTranscurrido = diffHoras > 0 ?
            `${diffHoras}h ${diffMins % 60}m` :
            `${diffMins}m`;

        const card = document.createElement('div');
        card.className = 'orden-card';

        let itemsHTML = '';
        let totalItemsCount = 0;

        // Procesar items de todas las órdenes
        ordenes.forEach(orden => {
            if (orden.orden_items && orden.orden_items.length > 0) {
                orden.orden_items.forEach(item => {
                    itemsHTML += `
                                <div class="orden-item">
                                    <div class="item-quantity">${item.cantidad}</div>
                                    <div class="item-name">${item.nombre_platillo}</div>
                                    <div>$${parseFloat(item.total).toFixed(2)}</div>
                                </div>
                            `;
                    totalItemsCount += item.cantidad;
                });
            }
        });

        if (itemsHTML === '') {
            itemsHTML = '<p>No hay items en esta orden</p>';
        }

        card.innerHTML = `
                    <div class="orden-header">
                        <h3>Mesa ${cuenta.mesas?.numero || 'N/A'}</h3>
                        <span class="badge badge-warning">${tiempoTranscurrido}</span>
                    </div>
                    <div class="orden-info">
                        <div class="orden-details">
                            <div class="orden-detail">
                                <span>Mesero:</span>
                                <span>${cuenta.mesero_nombre || 'No asignado'}</span>
                            </div>
                            <div class="orden-detail">
                                <span>Total:</span>
                                <span class="total-amount">$${totalCuenta.toFixed(2)}</span>
                            </div>
                            <div class="orden-detail">
                                <span>Items:</span>
                                <span>${totalItemsCount}</span>
                            </div>
                            <div class="orden-detail">
                                <span>Personas:</span>
                                <span>${new Set(ordenes.map(o => o.persona)).size}</span>
                            </div>
                        </div>
                        <div class="orden-items">
                            <h4>Items del Pedido:</h4>
                            ${itemsHTML}
                        </div>
                    </div>
                    <div class="orden-actions">
                    <!--
                        <button class="btn btn-small btn-warning btn-modificar" data-cuenta-id="${cuenta.id}">
                            Modificar
                        </button>
                        <button class="btn btn-small btn-success btn-imprimir" data-cuenta-id="${cuenta.id}">
                            Imprimir Ticket
                        </button>

                        -->
                        <a href="mesasparapedir.html?mesa=${cuenta.mesa_id}" class="btn btn-small btn-secondary">
                            Ver Mesa
                        </a>
                    </div>
                `;

        ordenesGrid.appendChild(card);
    });

    // Añadir event listeners a los botones
    document.querySelectorAll('.btn-modificar').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cuentaId = e.target.dataset.cuentaId;
            const grupo = ordenesActivas.find(g => g.cuenta.id === parseInt(cuentaId));
            if (grupo) abrirModalModificar(grupo);
        });
    });

    document.querySelectorAll('.btn-imprimir').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const cuentaId = e.target.dataset.cuentaId;
            const grupo = ordenesActivas.find(g => g.cuenta.id === parseInt(cuentaId));
            if (grupo) imprimirTicket(grupo);
        });
    });
}

// Actualizar estadísticas
function actualizarEstadisticas() {
    // Total de órdenes activas
    totalOrdenes.textContent = ordenesActivas.length;

    // Total de mesas ocupadas
    totalMesas.textContent = new Set(ordenesActivas.map(g => g.cuenta.mesa_id)).size;

    // Total de items
    const totalItemsCount = ordenesActivas.reduce((total, grupo) => {
        return total + grupo.ordenes.reduce((sum, orden) => {
            return sum + (orden.orden_items?.reduce((itemSum, item) => itemSum + item.cantidad, 0) || 0);
        }, 0);
    }, 0);
    totalItems.textContent = totalItemsCount;

    // Valor total activo: sumar totales a partir de los items de cada grupo
    const valorTotalActivo = ordenesActivas.reduce((total, grupo) => {
        const grupoTotal = (grupo.ordenes || []).reduce((gSum, orden) => {
            return gSum + (orden.orden_items?.reduce((s, it) => s + (parseFloat(it.total) || 0), 0) || 0);
        }, 0);
        return total + grupoTotal;
    }, 0);
    valorTotal.textContent = `$${valorTotalActivo.toFixed(2)}`;
}

// Abrir modal para modificar orden
function abrirModalModificar(grupo) {
    // Comentado para no mostrar el modal temporalmente
    /*
    const cuenta = grupo.cuenta;
    const ordenes = grupo.ordenes;
    
    let modalHTML = `
        <div class="modal-info">
            <h3>Modificar Orden - Mesa ${cuenta.mesas?.numero || 'N/A'}</h3>
            <p><strong>Mesero:</strong> ${cuenta.mesero_nombre || 'No asignado'}</p>
            <p><strong>Total Actual:</strong> $${parseFloat(cuenta.total || 0).toFixed(2)}</p>
        </div>
    `;

    // Agrupar items por persona
    const itemsPorPersona = {};
    ordenes.forEach(orden => {
        if (!itemsPorPersona[orden.persona]) {
            itemsPorPersona[orden.persona] = [];
        }
        if (orden.orden_items) {
            itemsPorPersona[orden.persona].push(...orden.orden_items);
        }
    });

    Object.keys(itemsPorPersona).forEach(persona => {
        modalHTML += `
            <div class="persona-section">
                <h4>Persona ${persona}</h4>
                <table style="width: 100%; margin-bottom: 1rem;">
                    <thead>
                        <tr>
                            <th>Platillo</th>
                            <th>Cantidad</th>
                            <th>Precio</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        itemsPorPersona[persona].forEach(item => {
            modalHTML += `
                <tr data-item-id="${item.id}">
                    <td>${item.nombre_platillo}</td>
                    <td>
                        <button class="btn-quantity" data-action="decrease" data-item-id="${item.id}">-</button>
                        <span class="quantity">${item.cantidad}</span>
                        <button class="btn-quantity" data-action="increase" data-item-id="${item.id}">+</button>
                    </td>
                    <td>$${parseFloat(item.precio_unitario).toFixed(2)}</td>
                    <td>
                        <button class="btn btn-small btn-danger btn-eliminar-item" data-item-id="${item.id}">
                            Eliminar
                        </button>
                    </td>
                </tr>
            `;
        });

        modalHTML += `
                    </tbody>
                </table>
            </div>
        `;
    });

    modalHTML += `
        <div class="agregar-item">
            <h4>Agregar Nuevo Item</h4>
            <div style="display: grid; grid-template-columns: 2fr 1fr 1fr auto; gap: 10px; align-items: end;">
                <div>
                    <label>Platillo:</label>
                    <select id="nuevoPlatillo" style="width: 100%; padding: 8px;">
                        <option value="">Seleccionar platillo...</option>
                    </select>
                </div>
                <div>
                    <label>Persona:</label>
                    <select id="nuevaPersona" style="width: 100%; padding: 8px;">
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                        <option value="6">6</option>
                    </select>
                </div>
                <div>
                    <label>Cantidad:</label>
                    <input type="number" id="nuevaCantidad" value="1" min="1" style="width: 100%; padding: 8px;">
                </div>
                <div>
                    <button class="btn btn-small" id="agregarItemBtn">Agregar</button>
                </div>
            </div>
        </div>
    `;

    modificarContent.innerHTML = modalHTML;
    modificarModal.style.display = 'flex';

    // Cargar platillos para el select
    cargarPlatillosParaSelect();

    // Configurar event listeners del modal
    configurarEventListenersModal(cuenta.id);
    */
    // Modal deshabilitado temporalmente
    return;
}

// Cargar platillos para el select del modal
async function cargarPlatillosParaSelect() {
    try {
        const { data: platillos, error } = await supabaseClient
            .from('platillos')
            .select('id, nombre, precio')
            .eq('activo', true)
            .order('nombre', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('nuevoPlatillo');
        platillos.forEach(platillo => {
            const option = document.createElement('option');
            option.value = platillo.id;
            option.textContent = `${platillo.nombre} - $${parseFloat(platillo.precio).toFixed(2)}`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error cargando platillos:', error);
    }
}

// Configurar event listeners del modal
function configurarEventListenersModal(cuentaId) {
    // Botones de cantidad
    document.querySelectorAll('.btn-quantity').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const itemId = e.target.dataset.itemId;
            modificarCantidadItem(itemId, action);
        });
    });

    // Botones eliminar item
    document.querySelectorAll('.btn-eliminar-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = e.target.dataset.itemId;
            eliminarItem(itemId);
        });
    });

    // Botón agregar item
    document.getElementById('agregarItemBtn').addEventListener('click', () => {
        agregarNuevoItem(cuentaId);
    });

    // Botones del modal
    document.getElementById('cancelarModificarBtn').addEventListener('click', cerrarModal);
    document.getElementById('eliminarOrdenBtn').addEventListener('click', () => {
        if (confirm('¿Estás seguro de que quieres eliminar toda esta orden?')) {
            eliminarOrdenCompleta(cuentaId);
        }
    });
    document.getElementById('guardarModificarBtn').addEventListener('click', cerrarModal);
}

// Modificar cantidad de un item
async function modificarCantidadItem(itemId, action) {
    try {
        // Obtener item actual
        const { data: item, error: errorItem } = await supabaseClient
            .from('orden_items')
            .select('*')
            .eq('id', itemId)
            .single();

        if (errorItem) throw errorItem;

        let nuevaCantidad = item.cantidad;
        if (action === 'increase') {
            nuevaCantidad++;
        } else if (action === 'decrease' && nuevaCantidad > 1) {
            nuevaCantidad--;
        }

        // Actualizar cantidad
        const { error } = await supabaseClient
            .from('orden_items')
            .update({
                cantidad: nuevaCantidad,
                total: nuevaCantidad * parseFloat(item.precio_unitario)
            })
            .eq('id', itemId);

        if (error) throw error;

        // Actualizar total de la cuenta
        await actualizarTotalCuenta(item.orden_id);

        // Recargar órdenes
        await cargarOrdenesActivas();

    } catch (error) {
        console.error('Error modificando cantidad:', error);
        mostrarError('Error al modificar la cantidad');
    }
}

// Eliminar item
async function eliminarItem(itemId) {
    try {
        // Obtener item para saber la orden
        const { data: item, error: errorItem } = await supabaseClient
            .from('orden_items')
            .select('orden_id')
            .eq('id', itemId)
            .single();

        if (errorItem) throw errorItem;

        // Eliminar item
        const { error } = await supabaseClient
            .from('orden_items')
            .delete()
            .eq('id', itemId);

        if (error) throw error;

        // Actualizar total de la cuenta
        await actualizarTotalCuenta(item.orden_id);

        // Recargar órdenes
        await cargarOrdenesActivas();

    } catch (error) {
        console.error('Error eliminando item:', error);
        mostrarError('Error al eliminar el item');
    }
}

// Agregar nuevo item
async function agregarNuevoItem(cuentaId) {
    try {
        const platilloId = document.getElementById('nuevoPlatillo').value;
        const persona = document.getElementById('nuevaPersona').value;
        const cantidad = parseInt(document.getElementById('nuevaCantidad').value);

        if (!platilloId || !persona || cantidad < 1) {
            mostrarError('Por favor completa todos los campos correctamente');
            return;
        }

        // Obtener información del platillo
        const { data: platillo, error: errorPlatillo } = await supabaseClient
            .from('platillos')
            .select('nombre, precio')
            .eq('id', platilloId)
            .single();

        if (errorPlatillo) throw errorPlatillo;

        // Buscar o crear orden para la persona
        const { data: ordenExistente, error: errorOrden } = await supabaseClient
            .from('ordenes')
            .select('id')
            .eq('cuenta_id', cuentaId)
            .eq('persona', persona)
            .single();

        let ordenId;
        if (errorOrden && errorOrden.code === 'PGRST116') {
            // No existe orden para esta persona, crear una nueva
            const { data: nuevaOrden, error: errorNuevaOrden } = await supabaseClient
                .from('ordenes')
                .insert({
                    cuenta_id: cuentaId,
                    persona: persona,
                    staff_id: currentUser.id
                })
                .select()
                .single();

            if (errorNuevaOrden) throw errorNuevaOrden;
            ordenId = nuevaOrden.id;
        } else if (ordenExistente) {
            ordenId = ordenExistente.id;
        } else {
            throw new Error('Error al obtener la orden');
        }

        // Agregar item a la orden
        const { error: errorItem } = await supabaseClient
            .from('orden_items')
            .insert({
                orden_id: ordenId,
                platillo_id: platilloId,
                nombre_platillo: platillo.nombre,
                persona: persona,
                cantidad: cantidad,
                precio_unitario: platillo.precio,
                precio_individual: platillo.precio,
                total: cantidad * parseFloat(platillo.precio)
            });

        if (errorItem) throw errorItem;

        // Actualizar total de la cuenta
        await actualizarTotalCuenta(ordenId);

        // Recargar órdenes
        await cargarOrdenesActivas();

        // Limpiar formulario
        document.getElementById('nuevoPlatillo').value = '';
        document.getElementById('nuevaCantidad').value = '1';

    } catch (error) {
        console.error('Error agregando item:', error);
        mostrarError('Error al agregar el nuevo item');
    }
}

// Eliminar orden completa
async function eliminarOrdenCompleta(cuentaId) {
    try {
        // Eliminar items de la orden
        const { error: errorItems } = await supabaseClient
            .from('orden_items')
            .delete()
            .in('orden_id',
                (await supabaseClient.from('ordenes').select('id').eq('cuenta_id', cuentaId)).data.map(o => o.id)
            );

        if (errorItems) throw errorItems;

        // Eliminar órdenes
        const { error: errorOrdenes } = await supabaseClient
            .from('ordenes')
            .delete()
            .eq('cuenta_id', cuentaId);

        if (errorOrdenes) throw errorOrdenes;

        // Cerrar modal y recargar
        cerrarModal();
        await cargarOrdenesActivas();

    } catch (error) {
        console.error('Error eliminando orden:', error);
        mostrarError('Error al eliminar la orden');
    }
}

// Actualizar total de la cuenta
async function actualizarTotalCuenta(ordenId) {
    try {
        // Obtener cuenta_id desde la orden
        const { data: orden, error: errorOrden } = await supabaseClient
            .from('ordenes')
            .select('cuenta_id')
            .eq('id', ordenId)
            .single();

        if (errorOrden) throw errorOrden;

        // Calcular nuevo total sumando todos los items de la cuenta
        const { data: items, error: errorItems } = await supabaseClient
            .from('orden_items')
            .select('total')
            .in('orden_id',
                (await supabaseClient.from('ordenes').select('id').eq('cuenta_id', orden.cuenta_id)).data.map(o => o.id)
            );

        if (errorItems) throw errorItems;

        const nuevoTotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);

        // Actualizar cuenta
        const { error } = await supabaseClient
            .from('cuentas')
            .update({ total: nuevoTotal })
            .eq('id', orden.cuenta_id);

        if (error) throw error;

    } catch (error) {
        console.error('Error actualizando total:', error);
    }
}

// Imprimir ticket
function imprimirTicket(grupo) {
    const cuenta = grupo.cuenta;
    const ordenes = grupo.ordenes;

    const ventana = window.open('', '_blank');
    const contenido = `
                <html>
                    <head>
                        <title>Ticket Mesa ${cuenta.mesas?.numero || 'N/A'}</title>
                        <style>
                            body { font-family: Arial, sans-serif; margin: 20px; }
                            .header { text-align: center; margin-bottom: 20px; }
                            .info { margin-bottom: 15px; }
                            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                            th { background-color: #f2f2f2; }
                            .total { font-weight: bold; margin-top: 20px; text-align: right; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>La cayetana</h1>
                            <h2>Ticket de Orden</h2>
                        </div>
                        <div class="info">
                            <p><strong>Mesa:</strong> ${cuenta.mesas?.numero || 'N/A'}</p>
                            <p><strong>Mesero:</strong> ${cuenta.mesero_nombre || 'No asignado'}</p>
                            <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
                        </div>
            `;

    // Agrupar items por persona
    const itemsPorPersona = {};
    ordenes.forEach(orden => {
        if (!itemsPorPersona[orden.persona]) {
            itemsPorPersona[orden.persona] = [];
        }
        if (orden.orden_items) {
            itemsPorPersona[orden.persona].push(...orden.orden_items);
        }
    });

    Object.keys(itemsPorPersona).forEach(persona => {
        contenido += `
                    <h3>Persona ${persona}</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Platillo</th>
                                <th>Cantidad</th>
                                <th>Precio</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

        itemsPorPersona[persona].forEach(item => {
            contenido += `
                        <tr>
                            <td>${item.nombre_platillo}</td>
                            <td>${item.cantidad}</td>
                            <td>$${parseFloat(item.precio_unitario).toFixed(2)}</td>
                            <td>$${parseFloat(item.total).toFixed(2)}</td>
                        </tr>
                    `;
        });

        contenido += '</tbody></table>';
    });

    contenido += `
                        <div class="total">
                            <strong>Total: $${parseFloat(cuenta.total || 0).toFixed(2)}</strong>
                        </div>
                    </body>
                </html>
            `;

    ventana.document.write(contenido);
    ventana.document.close();
    ventana.print();
}

// Configurar event listeners
function configurarEventListeners() {
    // Tema toggle
    themeToggle.addEventListener('click', toggleTema);

    // Logout
    logoutBtn.addEventListener('click', cerrarSesion);

    // Actualizar
    actualizarBtn.addEventListener('click', cargarOrdenesActivas);

    // Cerrar modal
    document.getElementById('closeModal').addEventListener('click', cerrarModal);

    // Cerrar modal al hacer clic fuera
    window.addEventListener('click', (e) => {
        if (e.target === modificarModal) cerrarModal();
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

// Cerrar modal
function cerrarModal() {
    modificarModal.style.display = 'none';
}

// Mostrar error
function mostrarError(mensaje) {
    alert(`Error: ${mensaje}`);
}

// Inicializar la aplicación
init();