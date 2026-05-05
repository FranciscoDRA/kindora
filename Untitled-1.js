// ===============================
// CONFIGURACIÓN — KINDORA
// ===============================
const WHATSAPP_NUMERO  = '59899000000';
const CUENTA_BANCO     = 'BROU';
const CUENTA_NUMERO    = '001-234567/8';
const CUENTA_TITULAR   = 'Kindora S.A.S';
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'kindora_carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

// ===============================
// CONFIGURACIÓN EMAILJS
// ===============================
const EMAILJS_PUBLIC_KEY = 'yYJ_1sm_T24de7v3O';
const EMAILJS_SERVICE_ID = 'service_kindora';
const TEMPLATE_CONTACTO = 'template_ddt6i41';   
const TEMPLATE_COMPRA = 'template_an2edlc';      

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let productosCargados = false;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  tamañoMin: null,
  tamañoMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = (id) => document.getElementById(id);

// ===============================
// NOTIFICACIONES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  requestAnimationFrame(() => notificacion.classList.add('show'));
  setTimeout(() => {
    notificacion.classList.remove('show');
    setTimeout(() => notificacion.remove(), 300);
  }, 3000);
}

// ===============================
// LOCALSTORAGE: CARRITO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (e) {
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}

function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch {
    carrito = [];
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  document.querySelectorAll('#contador-carrito, .cart-count').forEach(el => {
    if (el) el.textContent = total;
    if (el) el.classList.toggle('visible', total > 0);
  });
}

// ===============================
// CATEGORÍAS
// ===============================
function actualizarCategorias() {
  const select = getElement('filtro-categoria');
  if (!select) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  select.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// CARGA DESDE FIREBASE
// ===============================
const FIREBASE_URL = 'https://kindora-47c88-default-rtdb.firebaseio.com/';

async function cargarProductosDesdeSheets() {
  const galeria = getElement('galeria-productos');
  try {
    if (galeria && !productosCargados) {
      galeria.innerHTML = `<div class="loader-wrapper"><div class="loader"></div><p>Cargando productos...</p></div>`;
    }

    const resp = await fetch(FIREBASE_URL + 'productos/.json');
    if (!resp.ok) throw new Error('Error al cargar productos desde Firebase.');

    const data = await resp.json();
    if (!data) throw new Error('No se encontraron productos');

    productos = Object.values(data)
      .filter(r => r && r.id && r.nombre && r.precio !== undefined)
      .map(r => ({
        id:          parseInt(r.id, 10),
        nombre:      r.nombre ? String(r.nombre).trim() : 'Sin Nombre',
        descripcion: r.descripcion ? String(r.descripcion).trim() : '',
        precio:      parseFloat(r.precio) || 0,
        stock:       parseInt(r.stock, 10) || 0,
        imagenes:    Array.isArray(r.imagenes)
                       ? r.imagenes
                       : (r.imagenes ? String(r.imagenes).split(',').map(x => x.trim()).filter(Boolean) : []),
        adicionales: r.adicionales ? String(r.adicionales).trim() : '',
        alto:        parseFloat(r.alto) || null,
        ancho:       parseFloat(r.ancho) || null,
        profundidad: parseFloat(r.profundidad) || null,
        categoria:   r.categoria ? String(r.categoria).trim().toLowerCase() : 'otros',
        vendido:     r.vendido === true || String(r.vendido).toLowerCase() === 'true',
        estado:      r.estado ? String(r.estado).trim() : '',
        nuevoAt:     r.nuevoAt || null
      }));

    productosCargados = true;
    actualizarCategorias();
    actualizarUI();
    initShowcaseCarousel();

  } catch (e) {
    console.error('Error cargando productos:', e);
    if (galeria) {
      galeria.innerHTML = '<p style="text-align:center;padding:60px;color:var(--brown-mid);font-style:italic">No se pudieron cargar los productos. Intentá recargar la página.</p>';
    }
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  }
}

// ===============================
// FILTRADO
// ===============================
function filtrarProductos(lista) {
  if (!lista || lista.length === 0) return [];
  return lista.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = busqueda.toLowerCase();
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busqueda ||
        p.nombre.toLowerCase().includes(busquedaLower) ||
        p.descripcion.toLowerCase().includes(busquedaLower))
    );
  });
}

// ===============================
// RENDERIZADO DE TARJETAS
// ===============================
function crearCardProducto(p) {
  if (!p) return '';
  const enCarrito = carrito.find(i => i && i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0;
  const primeraImagen = (p.imagenes && p.imagenes[0]) || PLACEHOLDER_IMAGE;
  const imgHtml = `<img src="${primeraImagen}" alt="${p.nombre}" class="producto-img" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
  return `
    <div class="producto-card" data-id="${p.id}">
      ${imgHtml}
      <div>
        <p class="producto-nombre">${p.nombre || 'Sin nombre'}</p>
        <p class="producto-precio">$U ${(p.precio || 0).toLocaleString('es-UY')}</p>
        <p class="producto-stock">${agot ? '<span class="texto-agotado">Agotado</span>' : ''}</p>
      </div>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot ? 'disabled' : ''}>
        <button class="boton-agregar ${agot ? 'agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>${agot ? 'Agotado' : '+ Agregar'}</button>
        <button class="boton-detalles" data-id="${p.id}">Ver más</button>
      </div>
    </div>
  `;
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  const cont = getElement('paginacion');
  if (!cont) return;
  cont.innerHTML = '';
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.className = i === paginaActual ? 'pagina-activa' : '';
    b.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
      getElement('galeria-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    cont.appendChild(b);
  }
}

function renderizarProductos() {
  const galeria = getElement('galeria-productos');
  if (!galeria) return;
  
  if (!productosCargados || productos.length === 0) {
    galeria.innerHTML = '<div class="loader-wrapper"><div class="loader"></div><p>Cargando productos...</p></div>';
    return;
  }
  
  const list = filtrarProductos(productos);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const slice = list.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (slice.length === 0) {
    galeria.innerHTML = '<p style="text-align:center;padding:60px;color:var(--brown-mid);font-style:italic;grid-column:1/-1">No se encontraron productos con esos filtros.</p>';
  } else {
    galeria.innerHTML = slice.map(crearCardProducto).join('');
  }
  renderizarPaginacion(list.length);
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
let modalAbierto = false;

function mostrarModalProducto(p) {
  const modal = getElement('producto-modal');
  const modalContenido = getElement('modal-contenido');
  if (!modal || !modalContenido || !p) return;
  modalAbierto = true;
  const enCarrito = carrito.find(i => i && i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  
  let carruselHtml = '';
  if (p.imagenes && p.imagenes.length > 0) {
    carruselHtml += `<img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" class="modal-img-principal" alt="${p.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
    if (p.imagenes.length > 1) {
      carruselHtml += `<div class="modal-thumbnails">${p.imagenes.map((img, i) => `<img src="${img || PLACEHOLDER_IMAGE}" class="modal-thumbnail${i === 0 ? ' active' : ''}" alt="Miniatura ${i + 1}" data-index="${i}" onerror="this.src='${PLACEHOLDER_IMAGE}'">`).join('')}</div>`;
    }
  } else {
    carruselHtml += `<img src="${PLACEHOLDER_IMAGE}" class="modal-img-principal" alt="${p.nombre}" loading="lazy">`;
  }
  
  modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal">&times;</button>
    <div class="modal-flex">
      <div class="modal-carrusel">${carruselHtml}</div>
      <div class="modal-info">
        <h2 class="modal-nombre">${p.nombre || ''}</h2>
        <div class="modal-precio">$U ${(p.precio || 0).toLocaleString('es-UY')}</div>
        <div class="modal-stock ${disp > 0 ? 'disponible' : 'agotado'}">${disp > 0 ? `Disponibles: ${disp}` : 'AGOTADO'}</div>
        <div class="modal-descripcion">${p.descripcion || ''}</div>
        ${p.adicionales ? `<div class="modal-detalles"><span>Material:</span> ${p.adicionales}</div>` : ''}
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${disp <= 0 ? 'disabled' : ''}>
          <button class="boton-agregar-modal${disp <= 0 ? ' agotado' : ''}" ${disp <= 0 ? 'disabled' : ''} data-id="${p.id}">${disp <= 0 ? 'Agotado' : 'Agregar al carrito'}</button>
        </div>
      </div>
    </div>
  `;
  
  if (p.imagenes && p.imagenes.length > 1) {
    const mainImg = modalContenido.querySelector('.modal-img-principal');
    modalContenido.querySelectorAll('.modal-thumbnail').forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        modalContenido.querySelectorAll('.modal-thumbnail').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        if (mainImg) mainImg.src = p.imagenes[i];
      });
    });
  }
  
  const cerrarBtn = modalContenido.querySelector('.cerrar-modal');
  cerrarBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
    document.body.classList.remove('no-scroll');
    modalAbierto = false;
  });
  
  const agregarBtn = modalContenido.querySelector('.boton-agregar-modal');
  agregarBtn?.addEventListener('click', () => {
    const cantidad = +(modalContenido.querySelector('.cantidad-modal-input')?.value || 1);
    agregarAlCarrito(p.id, cantidad);
    modal.style.display = 'none';
    document.body.classList.remove('no-scroll');
    modalAbierto = false;
  });
  
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
      document.body.classList.remove('no-scroll');
      modalAbierto = false;
    }
  });
}

// ===============================
// CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1) {
  try {
    // Verificar que productos esté cargado
    if (!productosCargados || productos.length === 0) {
      mostrarNotificacion('Cargando productos, intentá de nuevo', 'error');
      await cargarProductosDesdeSheets();
      return;
    }
    
    // Verificar stock en Firebase
    const resp = await fetch(FIREBASE_URL + 'productos/.json');
    if (!resp.ok) throw new Error('No se pudo verificar stock');
    
    const data = await resp.json();
    if (!data) throw new Error('No hay datos de stock');
    
    const productosActualizados = Object.values(data);
    const prodActual = productosActualizados.find(p => p && p.id == id);
    
    if (!prodActual) {
      mostrarNotificacion('Producto no encontrado', 'error');
      return;
    }
    
    const stockReal = parseInt(prodActual.stock) || 0;
    
    if (stockReal <= 0) {
      mostrarNotificacion('❌ Este producto ya no tiene stock disponible', 'error');
      await cargarProductosDesdeSheets();
      return;
    }
    
    if (cantidad > stockReal) {
      mostrarNotificacion(`Solo hay ${stockReal} unidades disponibles`, 'error');
      return;
    }
    
    // Proceder con el producto local
    const prod = productos.find(p => p && p.id === id);
    if (!prod) {
      mostrarNotificacion('Producto no encontrado en el catálogo', 'error');
      await cargarProductosDesdeSheets();
      return;
    }
    
    cantidad = parseInt(cantidad, 10);
    if (isNaN(cantidad) || cantidad < 1) {
      mostrarNotificacion('Cantidad inválida', 'error');
      return;
    }
    
    const enCarrito = carrito.find(item => item && item.id === id);
    const disponibles = prod.stock - (enCarrito?.cantidad || 0);
    
    if (cantidad > disponibles) {
      mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles en este momento`, 'error');
      return;
    }
    
    if (enCarrito) {
      enCarrito.cantidad += cantidad;
    } else {
      carrito.push({ 
        id, 
        nombre: prod.nombre, 
        precio: prod.precio, 
        cantidad, 
        imagen: (prod.imagenes && prod.imagenes[0]) || '' 
      });
    }
    
    guardarCarrito();
    actualizarUI();
    mostrarNotificacion(`"${prod.nombre}" añadido a tu bolsa`, 'exito');
    
  } catch (error) {
    console.error('Error en agregarAlCarrito:', error);
    mostrarNotificacion('Error al verificar disponibilidad. Intentá de nuevo.', 'error');
  }
}

function renderizarCarrito() {
  const listaCarrito = getElement('lista-carrito');
  const totalSpan = getElement('total');
  if (!listaCarrito || !totalSpan) return;
  if (!carrito || carrito.length === 0) {
    listaCarrito.innerHTML = '<p class="carrito-vacio">Tu bolsa está vacía</p>';
    totalSpan.textContent = '$U 0';
    return;
  }
  listaCarrito.innerHTML = carrito.map(i => `
    <li class="carrito-item">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre || ''}</span>
        <span class="carrito-item-subtotal">$U ${((i.precio || 0) * (i.cantidad || 0)).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${i.id}" data-action="decrementar">−</button>
          <span class="carrito-item-cantidad">${i.cantidad || 0}</span>
          <button data-id="${i.id}" data-action="incrementar">+</button>
          <button data-id="${i.id}" class="eliminar-item">✕</button>
        </div>
      </div>
    </li>`).join('');
  const total = carrito.reduce((sum, i) => sum + (i.precio || 0) * (i.cantidad || 0), 0);
  totalSpan.textContent = `$U ${total.toLocaleString('es-UY')}`;
  
  listaCarrito.onclick = (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i && i.id === id);
    const prod = productos.find(p => p && p.id === id);
    if (!item || !prod) return;
    if (action === 'incrementar') {
      const disp = prod.stock - item.cantidad;
      if (disp > 0) { item.cantidad++; guardarCarrito(); actualizarUI(); }
      else mostrarNotificacion('No hay más stock disponible', 'error');
    } else if (action === 'decrementar') {
      item.cantidad--;
      if (item.cantidad <= 0) carrito = carrito.filter(i => i && i.id !== id);
      guardarCarrito();
      actualizarUI();
    } else if (target.classList.contains('eliminar-item')) {
      carrito = carrito.filter(i => i && i.id !== id);
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Producto eliminado de la bolsa', 'info');
    }
  };
}

// ===============================
// EMAILJS FUNCIONES
// ===============================
async function enviarCorreoContacto(formData) {
  try {
    await emailjs.sendForm(
      EMAILJS_SERVICE_ID,
      TEMPLATE_CONTACTO,
      formData
    );
    return { success: true };
  } catch (error) {
    console.error('Error EmailJS contacto:', error);
    return { success: false, error };
  }
}

async function enviarCorreoCompra(datosCompra) {
  try {
    const productosHtml = datosCompra.productos
      .map(p => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
          <span>${p.nombre} x${p.cantidad}</span>
          <strong>$U ${((p.precio || 0) * (p.cantidad || 0)).toLocaleString('es-UY')}</strong>
        </div>`)
      .join('');

    const templateParams = {
      order_id:       datosCompra.orderId,
      order_date:     new Date().toLocaleString('es-UY'),
      total_amount:   datosCompra.total,
      client_name:    datosCompra.cliente.nombre,
      client_email:   datosCompra.cliente.email,
      client_phone:   datosCompra.cliente.telefono || '—',
      client_address: datosCompra.cliente.direccion || '—',
      products:       productosHtml,
    };

    await emailjs.send(EMAILJS_SERVICE_ID, TEMPLATE_COMPRA, templateParams);
    return { success: true };
  } catch (error) {
    console.error('Error EmailJS compra:', error);
    return { success: false, error };
  }
}

async function confirmarPedidoConEmail(datosCliente) {
  if (!carrito || carrito.length === 0) return;
  
  const totalNumerico = carrito.reduce((sum, i) => sum + (i.precio || 0) * (i.cantidad || 0), 0);
  const orderId = 'KIN-' + Date.now().toString().slice(-8);

  const datosCompra = {
    orderId,
    total: totalNumerico.toLocaleString('es-UY'),
    cliente: {
      nombre:    datosCliente.nombre || 'Cliente',
      email:     datosCliente.email || '',
      telefono:  datosCliente.telefono || '—',
      direccion: datosCliente.direccion || '—'
    },
    productos: [...carrito],
    fecha: new Date().toISOString(),
    estado: 'pendiente_confirmacion'
  };

  try {
    await fetch(FIREBASE_URL + 'pedidos/.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosCompra)
    });
  } catch (e) {
    console.warn('No se pudo guardar el pedido en Firebase:', e);
  }

  mostrarNotificacion('Enviando confirmación...', 'info');
  const result = await enviarCorreoCompra(datosCompra);

  if (result.success) {
    mostrarNotificacion('✅ Pedido confirmado. Te llegará un email.', 'exito');
  } else {
    mostrarNotificacion('⚠️ Pedido registrado. Te contactaremos.', 'info');
  }
}

// ===============================
// VERIFICAR STOCK EN TIEMPO REAL
// ===============================
async function verificarStockEnTiempoReal() {
  try {
    const resp = await fetch(FIREBASE_URL + 'productos/.json');
    if (!resp.ok) throw new Error('No se pudo verificar stock');
    
    const data = await resp.json();
    if (!data) throw new Error('No hay datos de stock');
    
    const productosActualizados = Object.values(data);
    
    for (const item of carrito) {
      if (!item) continue;
      const prodActual = productosActualizados.find(p => p && p.id == item.id);
      
      if (!prodActual) {
        mostrarNotificacion(`❌ "${item.nombre}" ya no está disponible`, 'error');
        await cargarProductosDesdeSheets();
        return false;
      }
      
      const stockDisponible = parseInt(prodActual.stock) || 0;
      
      if (stockDisponible < item.cantidad) {
        mostrarNotificacion(`❌ "${item.nombre}" ahora está agotado`, 'error');
        await cargarProductosDesdeSheets();
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error verificando stock:', error);
    mostrarNotificacion('⚠️ No se pudo verificar el stock', 'error');
    return false;
  }
}

// ===============================
// ACTUALIZAR STOCK EN FIREBASE
// ===============================
async function descontarStockEnFirebase() {
  try {
    console.log('📦 Iniciando descuento de stock...');
    
    const resp = await fetch(FIREBASE_URL + 'productos.json');
    if (!resp.ok) throw new Error('No se pudo leer el stock');
    const data = await resp.json();
    if (!data) throw new Error('No hay datos');
    
    const updates = {};
    for (const item of carrito) {
      if (!item) continue;
      const entry = Object.entries(data).find(([, p]) => p && p.id == item.id);
      if (!entry) {
        console.warn(`Producto ${item.id} no encontrado`);
        continue;
      }
      const [key, prod] = entry;
      const stockActual = parseInt(prod.stock) || 0;
      const nuevoStock = Math.max(0, stockActual - (item.cantidad || 0));
      updates[`productos/${key}/stock`] = nuevoStock;
      console.log(`📉 ${prod.nombre}: ${stockActual} → ${nuevoStock}`);
    }
    
    if (Object.keys(updates).length > 0) {
      const patchResp = await fetch(FIREBASE_URL + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      
      if (!patchResp.ok) throw new Error('Error al actualizar');
      console.log('✅ Stock actualizado en Firebase', updates);
      await cargarProductosDesdeSheets();
      return true;
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error en descontarStockEnFirebase:', error);
    return false;
  }
}

// ===============================
// CHECKOUT EN PASOS
// ===============================
let checkoutStep = 1;
let checkoutDatosCliente = {};

function abrirCheckout() {
  if (!carrito || carrito.length === 0) { 
    mostrarNotificacion('Tu bolsa está vacía', 'error'); 
    return; 
  }
  checkoutStep = 1;
  let modal = getElement('checkout-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'checkout-modal';
    modal.style.cssText = `
      display:none;position:fixed;inset:0;
      background:rgba(58,40,25,0.6);backdrop-filter:blur(4px);
      z-index:9999;align-items:center;justify-content:center;
      padding:16px;box-sizing:border-box;`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarCheckout(); });
  }
  renderCheckout(modal);
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
}

function cerrarCheckout() {
  const modal = getElement('checkout-modal');
  if (modal) modal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}

function abrirModalTransferencia() { abrirCheckout(); }
function cerrarModalTransferencia() { cerrarCheckout(); }
function abrirModalDatosCliente() { abrirCheckout(); }
function cerrarModalDatosCliente() { cerrarCheckout(); }

function renderCheckout(modal) {
  if (!carrito) carrito = [];
  const total = carrito.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 0), 0);
  const totalStr = total.toLocaleString('es-UY');
  const steps = ['Tu pedido', 'Pago', 'Confirmación'];

  const stepBar = steps.map((s, i) => `
    <div style="display:flex;align-items:center;gap:6px;flex:1;${i < steps.length - 1 ? 'flex:1;' : ''}">
      <div style="
        width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:0.75rem;font-weight:700;flex-shrink:0;transition:all 0.3s;
        background:${checkoutStep > i + 1 ? '#2D6A4F' : checkoutStep === i + 1 ? '#3b2a1a' : '#e0d8ce'};
        color:${checkoutStep >= i + 1 ? '#fff' : '#9a8878'};">
        ${checkoutStep > i + 1 ? '✓' : i + 1}
      </div>
      <span style="font-size:0.78rem;font-weight:${checkoutStep === i + 1 ? '600' : '400'};
        color:${checkoutStep === i + 1 ? '#3b2a1a' : '#9a8878'};white-space:nowrap;">${s}</span>
      ${i < steps.length - 1 ? `<div style="flex:1;height:1px;background:${checkoutStep > i + 1 ? '#2D6A4F' : '#e0d8ce'};margin:0 4px;"></div>` : ''}
    </div>`).join('');

  const resumenItems = carrito.map(i => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #ede5d8;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${i.imagen ? `<img src="${i.imagen}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;">` : ''}
        <div>
          <div style="font-size:0.88rem;font-weight:600;color:#3b2a1a;">${i.nombre || ''}</div>
          <div style="font-size:0.78rem;color:#9a8878;">x${i.cantidad || 0}</div>
        </div>
      </div>
      <div style="font-size:0.9rem;font-weight:700;color:#3b2a1a;">$U ${((i.precio || 0) * (i.cantidad || 0)).toLocaleString('es-UY')}</div>
    </div>`).join('');

  let contenido = '';

  if (checkoutStep === 1) {
    contenido = `
      <div style="font-size:0.82rem;color:#7a6450;margin-bottom:16px;">Revisá tu pedido y completá tus datos.</div>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:18px;">${resumenItems || ''}</div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;margin-bottom:18px;border-top:2px solid #3b2a1a;">
        <span style="font-weight:700;color:#3b2a1a;">Total</span>
        <span style="font-weight:700;color:#3b2a1a;font-size:1.05rem;">$U ${totalStr}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="ck-nombre" placeholder="Nombre completo *" value="${checkoutDatosCliente.nombre || ''}"
          style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;font-size:0.9rem;background:#fff;color:#3b2a1a;outline:none;">
        <input id="ck-email" type="email" placeholder="Email *" value="${checkoutDatosCliente.email || ''}"
          style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;font-size:0.9rem;background:#fff;color:#3b2a1a;outline:none;">
        <input id="ck-telefono" placeholder="Teléfono (opcional)" value="${checkoutDatosCliente.telefono || ''}"
          style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;font-size:0.9rem;background:#fff;color:#3b2a1a;outline:none;">
        <input id="ck-direccion" placeholder="Dirección de entrega (opcional)" value="${checkoutDatosCliente.direccion || ''}"
          style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;font-size:0.9rem;background:#fff;color:#3b2a1a;outline:none;">
        <p id="ck-error" style="display:none;color:#c0392b;font-size:0.8rem;margin:0;">* Nombre y email son obligatorios.</p>
      </div>
      <button id="ck-next" style="margin-top:18px;width:100%;padding:13px;background:#3b2a1a;color:#faf6f0;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;">
        Continuar al pago →
      </button>`;

  } else if (checkoutStep === 2) {
    const wspMsg = encodeURIComponent(
      `Hola Kindora! 👋 Quiero enviar mi comprobante.\n\nPedido:\n${carrito.map(i => `• ${i.nombre} x${i.cantidad}`).join('\n')}\n\nTotal: $U ${totalStr}\n\nAdjunto el comprobante.`
    );
    contenido = `
      <div style="font-size:0.82rem;color:#7a6450;margin-bottom:16px;">
        Realizá la transferencia y envianos el comprobante por WhatsApp.
      </div>
      <div style="background:#f5f0e8;border-radius:10px;padding:16px;margin-bottom:16px;">
        ${[
          ['Banco', CUENTA_BANCO],
          ['N° de cuenta', CUENTA_NUMERO],
          ['Titular', CUENTA_TITULAR],
        ].map(([label, val]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e0d5c5;">
            <span style="font-size:0.82rem;color:#7a6450;">${label}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-weight:600;color:#3b2a1a;font-size:0.9rem;">${val}</span>
              <button onclick="navigator.clipboard.writeText('${val}');this.textContent='✓';setTimeout(()=>this.textContent='⎘',1500)"
                style="background:#e8dfd3;border:none;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:0.75rem;color:#3b2a1a;">⎘</button>
            </div>
          </div>`).join('')}
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0 0;">
          <span style="font-size:0.82rem;font-weight:700;color:#7a6450;">Total a transferir</span>
          <span style="font-size:1.2rem;font-weight:800;color:#2D6A4F;">$U ${totalStr}</span>
        </div>
      </div>
      <a href="https://wa.me/${WHATSAPP_NUMERO}?text=${wspMsg}" target="_blank" style="
        display:flex;align-items:center;justify-content:center;gap:8px;
        width:100%;padding:13px;background:#25D366;color:#fff;
        border:none;border-radius:8px;font-size:0.95rem;font-weight:700;
        cursor:pointer;text-decoration:none;margin-bottom:10px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.122 1.528 5.857L.057 23.927l6.233-1.635A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.015-1.378l-.36-.213-3.7.97.988-3.61-.235-.371A9.818 9.818 0 012.182 12C2.182 6.573 6.573 2.182 12 2.182S21.818 6.573 21.818 12 17.427 21.818 12 21.818z"/>
        </svg>
        Enviar comprobante por WhatsApp
      </a>
      <button id="ck-next" style="width:100%;padding:13px;background:#2D6A4F;color:#fff;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;">
        ✓ Ya realicé la transferencia
      </button>`;

  } else if (checkoutStep === 3) {
    contenido = `
      <div style="text-align:center;padding:16px 0 8px;">
        <div style="font-size:3rem;margin-bottom:12px;">🎉</div>
        <h3 style="margin:0 0 8px;color:#2D6A4F;font-size:1.2rem;">¡Pedido registrado!</h3>
        <p style="color:#7a6450;font-size:0.88rem;margin:0 0 20px;">
          Gracias <strong>${checkoutDatosCliente.nombre || ''}</strong>. Te enviaremos una confirmación a<br>
          <strong>${checkoutDatosCliente.email || ''}</strong>
        </p>
        <div style="background:#f5f0e8;border-radius:10px;padding:14px;margin-bottom:20px;">
          <p style="margin:0;font-size:0.82rem;">En cuanto confirmemos tu transferencia, te contactamos.</p>
        </div>
        <button onclick="cerrarCheckout()" style="width:100%;padding:13px;background:#3b2a1a;color:#faf6f0;border:none;border-radius:8px;font-size:0.95rem;font-weight:700;cursor:pointer;">
          Cerrar
        </button>
      </div>`;
  }

  modal.innerHTML = `
    <div style="background:#faf6f0;border-radius:14px;padding:28px 24px;max-width:440px;width:100%;box-shadow:0 16px 60px rgba(58,40,25,0.22);max-height:90vh;overflow-y:auto;position:relative;">
      <button onclick="cerrarCheckout()" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:#9a8878;">×</button>
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:22px;">${stepBar}</div>
      ${contenido}
    </div>`;

  if (checkoutStep === 1) {
    const nextBtn = modal.querySelector('#ck-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', async () => {
        const nombre = modal.querySelector('#ck-nombre')?.value.trim();
        const email = modal.querySelector('#ck-email')?.value.trim();
        const telefono = modal.querySelector('#ck-telefono')?.value.trim();
        const direccion = modal.querySelector('#ck-direccion')?.value.trim();
        const errorEl = modal.querySelector('#ck-error');
        
        if (!nombre || !email) {
          if (errorEl) errorEl.style.display = 'block';
          return;
        }
        if (errorEl) errorEl.style.display = 'none';
        
        checkoutDatosCliente = { nombre, email, telefono, direccion };
        
        checkoutStep = 2;
        renderCheckout(modal);
      });
    }
  }

  if (checkoutStep === 2) {
    const nextBtn = modal.querySelector('#ck-next');
    if (nextBtn) {
      const newBtn = nextBtn.cloneNode(true);
      nextBtn.parentNode.replaceChild(newBtn, nextBtn);
      
      newBtn.addEventListener('click', async () => {
        const textoOriginal = newBtn.textContent;
        newBtn.textContent = '🔍 Verificando stock...';
        newBtn.disabled = true;

        const stockValido = await verificarStockEnTiempoReal();
        if (!stockValido) {
          newBtn.textContent = textoOriginal;
          newBtn.disabled = false;
          cerrarCheckout();
          return;
        }

        newBtn.textContent = '📦 Registrando pedido...';
        const stockDescontado = await descontarStockEnFirebase();
        if (!stockDescontado) {
          mostrarNotificacion('Error al procesar el pedido. Intentá de nuevo.', 'error');
          newBtn.textContent = textoOriginal;
          newBtn.disabled = false;
          return;
        }

        newBtn.textContent = '📧 Confirmando pedido...';
        await confirmarPedidoConEmail(checkoutDatosCliente);

        carrito = [];
        guardarCarrito();
        actualizarUI();
        
        checkoutStep = 3;
        renderCheckout(modal);
      });
    }
  }
}

// ===============================
// ACTUALIZAR UI
// ===============================
function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// FILTROS
// ===============================
function aplicarFiltros() {
  paginaActual = 1;
  actualizarUI();
}

// ===============================
// TOGGLE CARRITO
// ===============================
function toggleCarrito() {
  const panel = document.querySelector('.carrito-panel');
  const overlay = document.querySelector('.carrito-overlay');
  if (!panel || !overlay) return;
  const isOpen = panel.classList.toggle('open');
  overlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
}

// ===============================
// TESTIMONIALES
// ===============================
const testimonials = [
  { text: '"La funda Caoba es exactamente lo que buscaba. Se siente como sostener un libro de primera edición. Llegó en tres días, perfectamente embalada."', author: '— Laura M., Buenos Aires' },
  { text: '"El estuche viajero cambió mis viajes. Todo en su lugar: el Kindle, el cargador, los auriculares. Es bello y funcional al mismo tiempo."', author: '— Andrés R., Montevideo' },
  { text: '"Compré el protector anti-reflejos y leer en el jardín ya no es un problema. Calidad impecable, y el empaque es un regalo en sí mismo."', author: '— Valentina S., Santiago' }
];

window.setTestimonial = function(i, dot) {
  document.querySelectorAll('.dot').forEach(d => d.classList.remove('active'));
  dot.classList.add('active');
  const el = document.getElementById('testimonial-text');
  const au = document.getElementById('testimonial-author');
  if (!el || !au) return;
  el.style.opacity = '0';
  setTimeout(() => {
    el.textContent = testimonials[i].text;
    au.textContent = testimonials[i].author;
    el.style.opacity = '1';
  }, 250);
};

// ===============================
// NEWSLETTER
// ===============================
window.subscribeNewsletter = function() {
  const input = document.getElementById('newsletter-email');
  const email = input?.value || '';
  if (email && email.includes('@')) {
    mostrarNotificacion('¡Bienvenida a la biblioteca Kindora!', 'exito');
    if (input) input.value = '';
  } else {
    mostrarNotificacion('Por favor ingresá un email válido', 'error');
  }
};

// ===============================
// SHOWCASE CAROUSEL
// ===============================
function initShowcaseCarousel() {
  const PLACEHOLDER = window.PLACEHOLDER_IMAGE || 'https://placehold.co/480x640/EDE4D6/4A3728?text=Kindora';
  const INTERVAL = 4800;
  const DEMO_ITEMS = [
    { nombre: 'Funda Caoba Premium', categoria: 'Fundas', precio: 1890, img: 'img/WhatsApp%20Image%202026-04-28%20at%2010.45.47.jpeg' },
    { nombre: 'Funda Caoba Premium', categoria: 'Fundas', precio: 1890, img: 'img/WhatsApp Image 2026-04-28 at 10.46.08.jpeg' },
    { nombre: 'Funda Caoba Premium', categoria: 'Fundas', precio: 1890, img: 'img/WhatsApp Image 2026-04-28 at 10.46.16.jpeg' },
  ];
  const raw = (productos && productos.length > 0) ? productos.slice(0, 8) : DEMO_ITEMS;
  const items = raw.map(p => ({
    nombre: p.nombre || '',
    categoria: p.categoria ? p.categoria.charAt(0).toUpperCase() + p.categoria.slice(1) : 'Colección',
    precio: p.precio || 0,
    img: (p.imagenes && p.imagenes[0]) || p.img || PLACEHOLDER,
  }));
  if (!items.length) return;
  const stage = document.getElementById('showcase-stage');
  const dotsC = document.getElementById('sc-dots');
  const infoEl = document.getElementById('showcase-info');
  const nameEl = document.getElementById('sc-name');
  const catEl = document.getElementById('sc-categoria');
  const priceEl = document.getElementById('sc-price');
  const ctrEl = document.getElementById('sc-counter');
  const progEl = document.getElementById('sc-progress');
  if (!stage || !infoEl) return;
  stage.querySelectorAll('.showcase-card').forEach(c => c.remove());
  if (dotsC) dotsC.innerHTML = '';
  let cur = 0, autoTimer, paused = false;
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'showcase-card no-transition';
    card.dataset.i = i;
    const img = document.createElement('img');
    img.src = item.img;
    img.alt = item.nombre;
    img.onerror = () => { img.src = PLACEHOLDER; };
    card.appendChild(img);
    card.addEventListener('click', () => {
      if (card.dataset.state === 'prev') goTo(cur - 1);
      else if (card.dataset.state === 'next') goTo(cur + 1);
    });
    stage.appendChild(card);
  });
  if (dotsC) {
    items.forEach((_, i) => {
      const d = document.createElement('button');
      d.className = 'sc-dot';
      d.dataset.i = i;
      d.setAttribute('aria-label', 'Producto ' + (i + 1));
      d.addEventListener('click', () => goTo(i));
      dotsC.appendChild(d);
    });
  }
  function getState(i) {
    const n = items.length;
    if (i === cur) return 'active';
    if (n < 3) return i === (cur + 1) % n ? 'next' : 'far-right';
    if (i === (cur - 1 + n) % n) return 'prev';
    if (i === (cur + 1) % n) return 'next';
    const distL = (cur - i + n) % n;
    const distR = (i - cur + n) % n;
    return distL <= distR ? 'far-left' : 'far-right';
  }
  function updateCards() {
    stage.querySelectorAll('.showcase-card').forEach(c => { c.dataset.state = getState(+c.dataset.i); });
    if (dotsC) dotsC.querySelectorAll('.sc-dot').forEach((d, i) => { d.classList.toggle('active', i === cur); });
  }
  function setInfoDirect(p) {
    if (nameEl) nameEl.textContent = p.nombre;
    if (catEl) catEl.textContent = p.categoria;
    if (priceEl) priceEl.textContent = '$U ' + p.precio.toLocaleString('es-UY');
    if (ctrEl) ctrEl.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
  }
  function fadeInfo() {
    infoEl.classList.add('fading');
    setTimeout(() => { setInfoDirect(items[cur]); infoEl.classList.remove('fading'); }, 230);
  }
  function resetProgress() {
    if (!progEl) return;
    progEl.style.transition = 'none';
    progEl.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        progEl.style.transition = 'width ' + INTERVAL + 'ms linear';
        progEl.style.width = '100%';
      });
    });
  }
  function goTo(i) {
    cur = ((i % items.length) + items.length) % items.length;
    updateCards();
    fadeInfo();
    clearInterval(autoTimer);
    if (!paused) { autoTimer = setInterval(() => goTo(cur + 1), INTERVAL); resetProgress(); }
  }
  const prevBtn = document.getElementById('sc-prev');
  const nextBtn = document.getElementById('sc-next');
  if (prevBtn) prevBtn.addEventListener('click', () => goTo(cur - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => goTo(cur + 1));
  const carouselEl = document.getElementById('showcase-carousel');
  if (carouselEl) {
    carouselEl.addEventListener('mouseenter', () => { paused = true; clearInterval(autoTimer); if (progEl) progEl.style.transition = 'none'; });
    carouselEl.addEventListener('mouseleave', () => { paused = false; autoTimer = setInterval(() => goTo(cur + 1), INTERVAL); resetProgress(); });
  }
  const stageEl = stage;
  stageEl.addEventListener('mousemove', (e) => {
    const ac = stage.querySelector('[data-state="active"]');
    if (!ac) return;
    const r = ac.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    ac.style.transition = 'opacity 0.72s ease, box-shadow 0.72s ease';
    ac.style.transform = 'translateX(-50%) translateZ(4px) rotateY(' + (dx * 6) + 'deg) rotateX(' + (-dy * 4) + 'deg) scale(1.02)';
  });
  stageEl.addEventListener('mouseleave', () => {
    const ac = stage.querySelector('[data-state="active"]');
    if (!ac) return;
    ac.style.transition = 'transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.72s ease, box-shadow 0.72s ease';
    ac.style.transform = '';
  });
  let touchX = 0;
  stageEl.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stageEl.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 44) dx < 0 ? goTo(cur + 1) : goTo(cur - 1);
  }, { passive: true });
  updateCards();
  setInfoDirect(items[0]);
  requestAnimationFrame(() => { stage.querySelectorAll('.showcase-card.no-transition').forEach(c => c.classList.remove('no-transition')); });
  autoTimer = setInterval(() => goTo(cur + 1), INTERVAL);
  resetProgress();
}

// ===============================
// INICIALIZACIÓN
// ===============================
function init() {
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  initShowcaseCarousel();
  
  // Sincronización cada 10 segundos
  setInterval(async () => {
    if (productosCargados) {
      await cargarProductosDesdeSheets();
      console.log('🔄 Productos actualizados automáticamente');
    }
  }, 10000);
  
  if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log('✅ EmailJS inicializado');
  } else {
    console.warn('⚠️ EmailJS no cargado');
  }
  
  const formContacto = document.getElementById('form-contacto');
  if (formContacto) {
    formContacto.addEventListener('submit', async function(event) {
      event.preventDefault();
      
      const btnEnviar = document.getElementById('btn-enviar');
      const successMessage = document.getElementById('success-message');
      
      if (btnEnviar) {
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Enviando...';
      }
      
      const result = await enviarCorreoContacto(formContacto);
      
      if (result.success) {
        formContacto.reset();
        if (successMessage) {
          successMessage.classList.remove('hidden');
          setTimeout(() => successMessage.classList.add('hidden'), 5000);
        }
        mostrarNotificacion('¡Mensaje enviado con éxito! Te responderemos pronto 📖', 'exito');
      } else {
        mostrarNotificacion('Error al enviar. Por favor intentá de nuevo.', 'error');
      }
      
      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar mensaje';
      }
    });
  }
}

// ===============================
// EVENTOS
// ===============================
function inicializarEventos() {
  document.getElementById('carrito-btn-main')?.addEventListener('click', toggleCarrito);
  document.querySelector('.carrito-overlay')?.addEventListener('click', toggleCarrito);
  document.querySelector('.cerrar-carrito')?.addEventListener('click', toggleCarrito);
  document.querySelector('.boton-vaciar-carrito')?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    actualizarUI();
    if (document.querySelector('.carrito-panel')?.classList.contains('open')) toggleCarrito();
    mostrarNotificacion('Bolsa vaciada', 'info');
  });
  
  document.querySelector('.boton-finalizar-compra')?.addEventListener('click', () => {
    if (!carrito || carrito.length === 0) {
      mostrarNotificacion('Tu bolsa está vacía', 'error');
      return;
    }
    if (document.querySelector('.carrito-panel')?.classList.contains('open')) toggleCarrito();
    setTimeout(abrirCheckout, 320);
  });
  
  document.getElementById('input-busqueda')?.addEventListener('input', (e) => { 
    filtrosActuales.busqueda = e.target.value.toLowerCase(); 
    aplicarFiltros(); 
  });
  
  document.getElementById('filtro-categoria')?.addEventListener('change', (e) => { 
    filtrosActuales.categoria = e.target.value; 
    aplicarFiltros(); 
  });
  
  document.querySelectorAll('.aplicar-rango-btn').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.rangeType;
      if (t === 'precio') {
        filtrosActuales.precioMin = document.getElementById('precio-min')?.value ? +document.getElementById('precio-min').value : null;
        filtrosActuales.precioMax = document.getElementById('precio-max')?.value ? +document.getElementById('precio-max').value : null;
      }
      aplicarFiltros();
    });
  });
  
  document.getElementById('boton-resetear-filtros')?.addEventListener('click', () => {
    filtrosActuales = { precioMin: null, precioMax: null, tamañoMin: null, tamañoMax: null, categoria: 'todos', busqueda: '' };
    if (document.getElementById('input-busqueda')) document.getElementById('input-busqueda').value = '';
    if (document.getElementById('filtro-categoria')) document.getElementById('filtro-categoria').value = 'todos';
    if (document.getElementById('precio-min')) document.getElementById('precio-min').value = '';
    if (document.getElementById('precio-max')) document.getElementById('precio-max').value = '';
    aplicarFiltros();
  });
  
  document.querySelector('.hamburguesa')?.addEventListener('click', () => { 
    document.getElementById('menu')?.classList.toggle('open'); 
  });
  
  document.querySelector('.boton-flotante')?.addEventListener('click', () => { 
    window.scrollTo({ top: 0, behavior: 'smooth' }); 
  });
  
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (nav) nav.style.boxShadow = window.scrollY > 20 ? '0 2px 20px rgba(74,55,40,0.08)' : 'none';
    const flotante = document.querySelector('.boton-flotante');
    if (flotante) flotante.classList.toggle('visible', window.scrollY > 400);
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (getElement('producto-modal')?.style.display === 'flex') {
        getElement('producto-modal').style.display = 'none';
        document.body.classList.remove('no-scroll');
      }
      if (getElement('checkout-modal')?.style.display === 'flex') cerrarCheckout();
    }
  });
  
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  
  let ti = 0;
  setInterval(() => { ti = (ti + 1) % 3; const dots = document.querySelectorAll('.dot'); if (dots[ti]) window.setTestimonial(ti, dots[ti]); }, 5000);
  
  const galeria = getElement('galeria-productos');
  if (galeria) {
    galeria.addEventListener('click', (e) => {
      const target = e.target.closest('.boton-agregar');
      if (target && !target.disabled) {
        const id = +target.dataset.id;
        const cant = +(document.getElementById(`cantidad-${id}`)?.value || 1);
        agregarAlCarrito(id, cant);
        return;
      }
      const detalleBtn = e.target.closest('.boton-detalles');
      if (detalleBtn) {
        const id = +detalleBtn.dataset.id;
        const prod = productos.find(p => p && p.id === id);
        if (prod) mostrarModalProducto(prod);
      }
    });
  }
}

// ===============================
// INICIAR TODO
// ===============================
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
