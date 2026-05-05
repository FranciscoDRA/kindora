// ===============================
// CONFIGURACIÓN — KINDORA
// ===============================
const WHATSAPP_NUMERO  = '59899000000';
const CUENTA_BANCO     = 'BROU';
const CUENTA_NUMERO    = '001-234567/8';
const CUENTA_TITULAR   = 'Kindora S.A.S';
const PRODUCTOS_POR_PAGINA = 8;
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
// ID DE SESIÓN ÚNICO POR USUARIO
// ===============================
const SESSION_ID = localStorage.getItem('kindora_session') || (() => {
  const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  localStorage.setItem('kindora_session', id);
  return id;
})();

const RESERVA_TTL_MS = 15 * 60 * 1000; // 15 minutos

// ===============================
// FIREBASE - Usar configuración centralizada
// ===============================
const FIREBASE_URL = 'https://kindora-47c88-default-rtdb.firebaseio.com/';
let db = window.firebaseDb;
let auth = window.firebaseAuth;
const HAS_FIREBASE_SDK = typeof db !== 'undefined' && db && typeof db.ref === 'function';

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let productosCargados = false;

// Variables de control
let suprimirRealtime = 0;
const inFlightAdds = new Set();
const keyById = {};
let pollingInterval = null;
const timersExpiracion = {};

let filtrosActuales = {
  precioMin: null,
  precioMax: null,
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
// HELPERS
// ===============================
function getDbKeyFromId(id) {
  return keyById[id] ?? String(id);
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
// PROCESAR DATOS DE FIREBASE
// ===============================
function procesarDatosProductos(data) {
  for (const k in keyById) delete keyById[k];
  
  if (!data) {
    productos = [];
    return;
  }
  
  productos = Object.entries(data)
    .filter(([, p]) => p && p.id && p.nombre && p.precio !== undefined)
    .map(([key, p]) => {
      const id = parseInt(p.id, 10);
      if (!Number.isFinite(id)) return null;
      
      keyById[id] = key;
      
      return {
        _key: key,
        id,
        nombre: p.nombre ? String(p.nombre).trim() : 'Sin Nombre',
        descripcion: p.descripcion ? String(p.descripcion).trim() : '',
        precio: parseFloat(p.precio) || 0,
        stock: parseInt(p.stock, 10) || 0,
        imagenes: Array.isArray(p.imagenes)
          ? p.imagenes
          : (p.imagenes ? String(p.imagenes).split(',').map(x => x.trim()).filter(Boolean) : []),
        adicionales: p.adicionales ? String(p.adicionales).trim() : '',
        alto: parseFloat(p.alto) || null,
        ancho: parseFloat(p.ancho) || null,
        profundidad: parseFloat(p.profundidad) || null,
        categoria: p.categoria ? String(p.categoria).trim().toLowerCase() : 'otros',
        vendido: p.vendido === true || String(p.vendido).toLowerCase() === 'true',
        estado: p.estado ? String(p.estado).trim() : '',
        nuevoAt: p.nuevoAt || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
    
  productosCargados = true;
}

// ===============================
// LIBERAR RESERVA (devuelve stock)
// ===============================
async function liberarReserva(reservaKey, productoId, cantidad) {
  try {
    const key = getDbKeyFromId(productoId);
    
    if (HAS_FIREBASE_SDK && db && typeof db.ref === 'function') {
      await db.ref(`productos/${key}/stock`).transaction((stock) => {
        return (stock || 0) + cantidad;
      });
      await db.ref(`reservas/${reservaKey}`).remove();
      console.log(`✅ Stock liberado: +${cantidad} de producto ${productoId}`);
    } else {
      const resp = await fetch(`${FIREBASE_URL}productos/${key}/stock.json`);
      const stockActual = await resp.json();
      const nuevoStock = (parseInt(stockActual) || 0) + cantidad;
      await fetch(`${FIREBASE_URL}productos/${key}/stock.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoStock)
      });
      await fetch(`${FIREBASE_URL}reservas/${reservaKey}.json`, {
        method: 'DELETE'
      });
    }
  } catch (e) {
    console.error('Error liberando reserva:', e);
  }
}

// ===============================
// PROGRAMAR EXPIRACIÓN DE RESERVA
// ===============================
function programarExpiracionReserva(reservaKey, producto, cantidad) {
  if (timersExpiracion[reservaKey]) clearTimeout(timersExpiracion[reservaKey]);

  timersExpiracion[reservaKey] = setTimeout(async () => {
    console.log(`⏰ Reserva expirada: ${reservaKey}`);
    await liberarReserva(reservaKey, producto.id, cantidad);

    carrito = carrito.filter(i => i.reservaKey !== reservaKey);
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(
      `⏰ Tu reserva de "${producto.nombre}" expiró. Podés volver a agregarlo.`,
      'error'
    );
  }, RESERVA_TTL_MS);
}

// ===============================
// LIMPIAR RESERVAS EXPIRADAS PROPIAS
// ===============================
async function limpiarReservasExpiradas() {
  if (!HAS_FIREBASE_SDK) return;
  
  try {
    const snap = await db.ref('reservas').orderByChild('sessionId').equalTo(SESSION_ID).once('value');
    if (!snap.exists()) return;

    const ahora = Date.now();
    const promesas = [];

    snap.forEach(child => {
      const reserva = child.val();
      if (reserva.expiraEn < ahora) {
        promesas.push(liberarReserva(child.key, reserva.productoId, reserva.cantidad));
        carrito = carrito.filter(i => i.reservaKey !== child.key);
      } else {
        const tiempoRestante = reserva.expiraEn - ahora;
        if (timersExpiracion[child.key]) clearTimeout(timersExpiracion[child.key]);
        timersExpiracion[child.key] = setTimeout(async () => {
          await liberarReserva(child.key, reserva.productoId, reserva.cantidad);
          carrito = carrito.filter(i => i.reservaKey !== child.key);
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
        }, tiempoRestante);
      }
    });

    await Promise.all(promesas);
    if (promesas.length > 0) {
      guardarCarrito();
      console.log(`🧹 ${promesas.length} reservas expiradas limpiadas`);
    }
  } catch (e) {
    console.error('Error limpiando reservas:', e);
  }
}

// ===============================
// AGREGAR AL CARRITO CON RESERVA
// ===============================
async function agregarAlCarrito(id, cantidad = 1) {
  if (inFlightAdds.has(id)) return;
  inFlightAdds.add(id);

  const producto = productos.find(p => p && p.id === id);
  if (!producto) {
    inFlightAdds.delete(id);
    return mostrarNotificacion('Producto no encontrado', 'error');
  }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  const key = getDbKeyFromId(id);
  const reservaKey = `${SESSION_ID}_${id}`;

  try {
    if (HAS_FIREBASE_SDK && db && typeof db.ref === 'function') {
      const reservaSnap = await db.ref(`reservas/${reservaKey}`).once('value');
      const reservaExistente = reservaSnap.val();
      const reservaVigente = reservaExistente && reservaExistente.expiraEn > Date.now();

      const stockRef = db.ref(`productos/${key}/stock`);
      const { committed, snapshot } = await stockRef.transaction((stockActual) => {
        stockActual = stockActual || 0;

        const cantidadYaReservada = (reservaVigente ? reservaExistente.cantidad : 0);
        const cantidadExtra = cantidadAgregar - cantidadYaReservada;

        if (cantidadExtra > 0 && stockActual < cantidadExtra) {
          return;
        }

        return stockActual - Math.max(0, cantidadExtra);
      });

      if (!committed) {
        mostrarNotificacion(`❌ "${producto.nombre}" está agotado`, 'error');
        inFlightAdds.delete(id);
        const snap = await db.ref(`productos/${key}/stock`).once('value');
        producto.stock = snap.val() || 0;
        renderizarProductos();
        return;
      }

      await db.ref(`reservas/${reservaKey}`).set({
        productoId: id,
        productoKey: key,
        cantidad: cantidadAgregar,
        sessionId: SESSION_ID,
        expiraEn: Date.now() + RESERVA_TTL_MS,
        nombre: producto.nombre
      });

      suprimirRealtime++;
      producto.stock = snapshot.val();

    } else {
      // Fallback con fetch
      const resp = await fetch(FIREBASE_URL + 'productos/.json');
      const data = await resp.json();
      const productosActualizados = Object.values(data);
      const prodActual = productosActualizados.find(p => p && p.id == id);
      
      if (!prodActual) throw new Error('Producto no encontrado');
      const stockReal = parseInt(prodActual.stock) || 0;
      
      if (stockReal < cantidadAgregar) {
        mostrarNotificacion(`❌ "${producto.nombre}" está agotado`, 'error');
        inFlightAdds.delete(id);
        return;
      }
      
      const nuevoStock = stockReal - cantidadAgregar;
      await fetch(`${FIREBASE_URL}productos/${key}/stock.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevoStock)
      });
      
      await fetch(`${FIREBASE_URL}reservas/${reservaKey}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productoId: id,
          productoKey: key,
          cantidad: cantidadAgregar,
          sessionId: SESSION_ID,
          expiraEn: Date.now() + RESERVA_TTL_MS,
          nombre: producto.nombre
        })
      });
      
      producto.stock = nuevoStock;
    }

    // Actualizar carrito local
    const enCarrito = carrito.find(item => item.id === id);
    if (enCarrito) {
      enCarrito.cantidad = cantidadAgregar;
    } else {
      carrito.push({
        id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: (producto.imagenes && producto.imagenes[0]) || '',
        reservaKey
      });
    }

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`"${producto.nombre}" añadido a tu bolsa`, 'exito');
    programarExpiracionReserva(reservaKey, producto, cantidadAgregar);

  } catch (error) {
    console.error('Error en transacción:', error);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    inFlightAdds.delete(id);
  }
}

// ===============================
// VACIAR CARRITO (libera todas las reservas)
// ===============================
async function vaciarCarrito() {
  if (!carrito || carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  mostrarNotificacion('Vaciando bolsa...', 'info');

  try {
    const promesas = carrito.map(async (item) => {
      if (item.reservaKey) {
        if (timersExpiracion[item.reservaKey]) {
          clearTimeout(timersExpiracion[item.reservaKey]);
          delete timersExpiracion[item.reservaKey];
        }
        await liberarReserva(item.reservaKey, item.id, item.cantidad);
      } else {
        // Fallback para items sin reservaKey (carrito viejo)
        const key = getDbKeyFromId(item.id);
        if (HAS_FIREBASE_SDK) {
          await db.ref(`productos/${key}/stock`).transaction(stock => (stock || 0) + item.cantidad);
        }
      }
    });

    await Promise.all(promesas);

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    actualizarContadorCarrito();

    if (document.querySelector('.carrito-panel')?.classList.contains('open')) {
      toggleCarrito();
    }

    mostrarNotificacion('Bolsa vaciada correctamente', 'exito');
  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    mostrarNotificacion('Error al vaciar la bolsa', 'error');
  }
}

// ===============================
// CARGA DESDE FIREBASE
// ===============================
async function cargarProductosDesdeFirebase() {
  const galeria = getElement('galeria-productos');
  
  try {
    if (galeria && !productosCargados) {
      galeria.innerHTML = `<div class="loader-wrapper"><div class="loader"></div><p>Cargando productos...</p></div>`;
    }
    
    if (HAS_FIREBASE_SDK) {
      const productosRef = db.ref('productos');
      
      const snapshot = await productosRef.once('value');
      if (snapshot.exists()) {
        procesarDatosProductos(snapshot.val());
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        initShowcaseCarousel();
      }
      
      productosRef.on('value', (snap) => {
        if (suprimirRealtime > 0) {
          suprimirRealtime--;
          return;
        }
        if (snap.exists()) {
          procesarDatosProductos(snap.val());
          renderizarProductos();
          actualizarCategorias();
          actualizarUI();
          console.log('🔄 Productos actualizados por listener');
        }
      });
    } else {
      await cargarProductosDesdeSheetsFallback();
      iniciarListenerTiempoReal();
    }
  } catch (e) {
    console.error('Error cargando productos:', e);
    if (galeria) {
      galeria.innerHTML = '<p style="text-align:center;padding:60px;">No se pudieron cargar los productos.</p>';
    }
  }
}

async function cargarProductosDesdeSheetsFallback() {
  const resp = await fetch(FIREBASE_URL + 'productos/.json');
  if (!resp.ok) throw new Error('Error al cargar productos');
  const data = await resp.json();
  procesarDatosProductos(data);
  actualizarCategorias();
  actualizarUI();
  initShowcaseCarousel();
}

function iniciarListenerTiempoReal() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    if (!productosCargados) return;
    try {
      const resp = await fetch(FIREBASE_URL + 'productos/.json');
      const data = await resp.json();
      if (data) {
        let cambiado = false;
        for (const prod of productos) {
          const actual = Object.values(data).find(p => p && p.id == prod.id);
          if (actual && parseInt(actual.stock) !== prod.stock) {
            cambiado = true;
            break;
          }
        }
        if (cambiado) {
          procesarDatosProductos(data);
          renderizarProductos();
          renderizarCarrito();
        }
      }
    } catch (e) {}
  }, 3000);
}

// ===============================
// CATEGORÍAS
// ===============================
function actualizarCategorias() {
  const select = getElement('filtro-categoria');
  if (!select) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  select.innerHTML = categorias.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');
}

// ===============================
// FILTRADO
// ===============================
function filtrarProductos(lista) {
  if (!lista || lista.length === 0) return [];
  return lista.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = (busqueda || '').toLowerCase();
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busquedaLower || p.nombre.toLowerCase().includes(busquedaLower))
    );
  });
}

// ===============================
// RENDERIZADO
// ===============================
function crearCardProducto(p) {
  if (!p) return '';
  const enCarrito = carrito.find(i => i && i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0 || p.stock <= 0;
  const primeraImagen = (p.imagenes && p.imagenes[0]) || PLACEHOLDER_IMAGE;
  
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${primeraImagen}" alt="${p.nombre}" class="producto-img" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <div>
        <p class="producto-nombre">${p.nombre}</p>
        <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
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
  
  galeria.innerHTML = slice.length === 0 
    ? '<p style="text-align:center;padding:60px;">No se encontraron productos.</p>'
    : slice.map(crearCardProducto).join('');
  
  renderizarPaginacion(list.length);
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
        <h2 class="modal-nombre">${p.nombre}</h2>
        <div class="modal-precio">$U ${p.precio.toLocaleString('es-UY')}</div>
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
// RENDERIZAR CARRITO
// ===============================
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
    <li class="carrito-item" data-id="${i.id}" data-reserva="${i.reservaKey || ''}">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre || ''}</span>
        <span class="carrito-item-subtotal">$U ${((i.precio || 0) * (i.cantidad || 0)).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${i.id}" ${i.cantidad <= 1 ? 'disabled' : ''}>−</button>
          <span class="carrito-item-cantidad">${i.cantidad || 0}</span>
          <button class="aumentar-cantidad" data-id="${i.id}">+</button>
          <button class="eliminar-item" data-id="${i.id}">✕</button>
        </div>
      </div>
    </li>
  `).join('');
  
  const total = carrito.reduce((sum, i) => sum + (i.precio || 0) * (i.cantidad || 0), 0);
  totalSpan.textContent = `$U ${total.toLocaleString('es-UY')}`;
  
  // Disminuir cantidad
  listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        if (item.reservaKey) {
          // Actualizar reserva: devolver 1 unidad y reducir cantidad
          await liberarReserva(item.reservaKey, id, 1);
          item.cantidad--;
          // Actualizar reserva con nueva cantidad
          const key = getDbKeyFromId(id);
          await db.ref(`reservas/${item.reservaKey}`).update({
            cantidad: item.cantidad,
            expiraEn: Date.now() + RESERVA_TTL_MS
          });
          programarExpiracionReserva(item.reservaKey, { id, nombre: item.nombre }, 0);
        } else {
          // Fallback
          const key = getDbKeyFromId(id);
          await db.ref(`productos/${key}/stock`).transaction(stock => (stock || 0) + 1);
          item.cantidad--;
        }
        guardarCarrito();
        renderizarCarrito();
        renderizarProductos();
      }
    };
  });
  
  // Aumentar cantidad
  listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const item = carrito.find(i => i.id === id);
      const prod = productos.find(p => p.id === id);
      if (item && prod && prod.stock > 0) {
        if (item.reservaKey) {
          // Actualizar reserva: reservar 1 unidad más
          const key = getDbKeyFromId(id);
          const { committed } = await db.ref(`productos/${key}/stock`).transaction(stock => {
            if (stock < 1) return;
            return stock - 1;
          });
          if (committed) {
            item.cantidad++;
            prod.stock--;
            await db.ref(`reservas/${item.reservaKey}`).update({
              cantidad: item.cantidad,
              expiraEn: Date.now() + RESERVA_TTL_MS
            });
            programarExpiracionReserva(item.reservaKey, { id, nombre: item.nombre }, 0);
          } else {
            mostrarNotificacion('No hay más stock disponible', 'error');
          }
        } else {
          const key = getDbKeyFromId(id);
          const { committed } = await db.ref(`productos/${key}/stock`).transaction(stock => {
            if (stock < 1) return;
            return stock - 1;
          });
          if (committed) {
            item.cantidad++;
            prod.stock--;
          } else {
            mostrarNotificacion('No hay más stock disponible', 'error');
          }
        }
        guardarCarrito();
        renderizarCarrito();
        renderizarProductos();
      } else {
        mostrarNotificacion('No hay más stock disponible', 'error');
      }
    };
  });
  
  // Eliminar item individual
  listaCarrito.querySelectorAll('.eliminar-item').forEach(btn => {
    btn.onclick = async () => {
      const id = parseInt(btn.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (!item) return;

      if (item.reservaKey) {
        if (timersExpiracion[item.reservaKey]) {
          clearTimeout(timersExpiracion[item.reservaKey]);
          delete timersExpiracion[item.reservaKey];
        }
        await liberarReserva(item.reservaKey, id, item.cantidad);
      } else {
        const key = getDbKeyFromId(id);
        if (HAS_FIREBASE_SDK) {
          await db.ref(`productos/${key}/stock`).transaction(stock => (stock || 0) + item.cantidad);
        }
      }

      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      renderizarCarrito();
      renderizarProductos();
      mostrarNotificacion('Producto eliminado de la bolsa', 'info');
    };
  });
}

// ===============================
// EMAILJS FUNCIONES
// ===============================
async function enviarCorreoContacto(formData) {
  try {
    await emailjs.sendForm(EMAILJS_SERVICE_ID, TEMPLATE_CONTACTO, formData);
    return { success: true };
  } catch (error) {
    console.error('Error EmailJS contacto:', error);
    return { success: false, error };
  }
}

async function enviarCorreoCompra(datosCompra) {
  try {
    const productosHtml = datosCompra.productos.map(p => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
          <span>${p.nombre} x${p.cantidad}</span>
          <strong>$U ${((p.precio || 0) * (p.cantidad || 0)).toLocaleString('es-UY')}</strong>
        </div>`).join('');

    const templateParams = {
      order_id: datosCompra.orderId,
      order_date: new Date().toLocaleString('es-UY'),
      total_amount: datosCompra.total,
      client_name: datosCompra.cliente.nombre,
      client_email: datosCompra.cliente.email,
      client_phone: datosCompra.cliente.telefono || '—',
      client_address: datosCompra.cliente.direccion || '—',
      products: productosHtml,
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
      nombre: datosCliente.nombre || 'Cliente',
      email: datosCliente.email || '',
      telefono: datosCliente.telefono || '—',
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
    console.warn('No se pudo guardar el pedido:', e);
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
// CHECKOUT EN PASOS
// ===============================
let checkoutStep = 1;
let checkoutDatosCliente = {};
let checkoutModal = null;

function abrirCheckout() {
  if (!carrito || carrito.length === 0) { 
    mostrarNotificacion('Tu bolsa está vacía', 'error'); 
    return; 
  }
  checkoutStep = 1;
  
  if (!checkoutModal) {
    checkoutModal = document.createElement('div');
    checkoutModal.id = 'checkout-modal';
    checkoutModal.style.cssText = `
      display:none;position:fixed;inset:0;
      background:rgba(58,40,25,0.6);backdrop-filter:blur(4px);
      z-index:9999;align-items:center;justify-content:center;
      padding:16px;box-sizing:border-box;`;
    document.body.appendChild(checkoutModal);
    checkoutModal.addEventListener('click', (e) => { if (e.target === checkoutModal) cerrarCheckout(); });
  }
  renderCheckout();
  checkoutModal.style.display = 'flex';
  document.body.classList.add('no-scroll');
}

function cerrarCheckout() {
  if (checkoutModal) checkoutModal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}

function renderCheckout() {
  if (!checkoutModal) return;
  
  const total = carrito.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 0), 0);
  const totalStr = total.toLocaleString('es-UY');
  const steps = ['Tu pedido', 'Pago', 'Confirmación'];

  const stepBar = steps.map((s, i) => `
    <div style="display:flex;align-items:center;gap:6px;flex:1;">
      <div style="width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700;background:${checkoutStep > i + 1 ? '#2D6A4F' : checkoutStep === i + 1 ? '#3b2a1a' : '#e0d8ce'};color:${checkoutStep >= i + 1 ? '#fff' : '#9a8878'};">
        ${checkoutStep > i + 1 ? '✓' : i + 1}
      </div>
      <span style="font-size:0.78rem;font-weight:${checkoutStep === i + 1 ? '600' : '400'};color:${checkoutStep === i + 1 ? '#3b2a1a' : '#9a8878'};">${s}</span>
      ${i < steps.length - 1 ? `<div style="flex:1;height:1px;background:${checkoutStep > i + 1 ? '#2D6A4F' : '#e0d8ce'};margin:0 4px;"></div>` : ''}
    </div>`).join('');

  let contenido = '';

  if (checkoutStep === 1) {
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
      
    contenido = `
      <div style="font-size:0.82rem;color:#7a6450;margin-bottom:16px;">Revisá tu pedido y completá tus datos.</div>
      <div style="max-height:180px;overflow-y:auto;margin-bottom:18px;">${resumenItems}</div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;margin-bottom:18px;border-top:2px solid #3b2a1a;">
        <span>Total</span>
        <strong>$U ${totalStr}</strong>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <input id="ck-nombre" placeholder="Nombre completo *" value="${checkoutDatosCliente.nombre || ''}" style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;">
        <input id="ck-email" type="email" placeholder="Email *" value="${checkoutDatosCliente.email || ''}" style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;">
        <input id="ck-telefono" placeholder="Teléfono (opcional)" value="${checkoutDatosCliente.telefono || ''}" style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;">
        <input id="ck-direccion" placeholder="Dirección de entrega (opcional)" value="${checkoutDatosCliente.direccion || ''}" style="padding:11px 14px;border:1.5px solid #d4c5b0;border-radius:8px;">
        <p id="ck-error" style="display:none;color:#c0392b;">* Nombre y email obligatorios</p>
      </div>
      <button id="ck-next" style="margin-top:18px;width:100%;padding:13px;background:#3b2a1a;color:#fff;border:none;border-radius:8px;cursor:pointer;">Continuar al pago →</button>`;
  } else if (checkoutStep === 2) {
    const wspMsg = encodeURIComponent(
      `Hola Kindora! 👋 Quiero enviar mi comprobante.\n\nPedido:\n${carrito.map(i => `• ${i.nombre} x${i.cantidad}`).join('\n')}\n\nTotal: $U ${totalStr}\n\nAdjunto el comprobante.`
    );
    contenido = `
      <div style="font-size:0.82rem;color:#7a6450;margin-bottom:16px;">Realizá la transferencia y envianos el comprobante por WhatsApp.</div>
      <div style="background:#f5f0e8;border-radius:10px;padding:16px;margin-bottom:16px;">
        <div class="mt-row"><span>Banco</span><strong>${CUENTA_BANCO}</strong></div>
        <div class="mt-row"><span>N° de cuenta</span><strong>${CUENTA_NUMERO}</strong></div>
        <div class="mt-row"><span>Titular</span><strong>${CUENTA_TITULAR}</strong></div>
        <div class="mt-total"><span>Total a transferir</span><strong>$U ${totalStr}</strong></div>
      </div>
      <a href="https://wa.me/${WHATSAPP_NUMERO}?text=${wspMsg}" target="_blank" class="btn-whatsapp">Enviar comprobante por WhatsApp</a>
      <button id="ck-next" style="width:100%;padding:13px;background:#2D6A4F;color:#fff;border:none;border-radius:8px;cursor:pointer;">✓ Ya realicé la transferencia</button>`;
  } else if (checkoutStep === 3) {
    contenido = `
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:3rem;">🎉</div>
        <h3>¡Pedido registrado!</h3>
        <p>Gracias <strong>${checkoutDatosCliente.nombre || ''}</strong>. Te llegará un email a <strong>${checkoutDatosCliente.email || ''}</strong></p>
        <button onclick="cerrarCheckout()" style="width:100%;padding:13px;background:#3b2a1a;color:#fff;border:none;border-radius:8px;cursor:pointer;">Cerrar</button>
      </div>`;
  }

  checkoutModal.innerHTML = `
    <div style="background:#faf6f0;border-radius:14px;padding:28px 24px;max-width:440px;width:100%;box-shadow:0 16px 60px rgba(58,40,25,0.22);position:relative;">
      <button onclick="cerrarCheckout()" style="position:absolute;top:16px;right:16px;background:none;border:none;font-size:1.3rem;cursor:pointer;">×</button>
      <div style="display:flex;gap:4px;margin-bottom:22px;">${stepBar}</div>
      ${contenido}
    </div>`;

  if (checkoutStep === 1) {
    const nextBtn = document.getElementById('ck-next');
    if (nextBtn) {
      nextBtn.onclick = async () => {
        const nombre = document.getElementById('ck-nombre')?.value.trim();
        const email = document.getElementById('ck-email')?.value.trim();
        const telefono = document.getElementById('ck-telefono')?.value.trim();
        const direccion = document.getElementById('ck-direccion')?.value.trim();
        const errorEl = document.getElementById('ck-error');
        
        if (!nombre || !email) {
          if (errorEl) errorEl.style.display = 'block';
          return;
        }
        if (errorEl) errorEl.style.display = 'none';
        
        checkoutDatosCliente = { nombre, email, telefono, direccion };
        checkoutStep = 2;
        renderCheckout();
      };
    }
  }

  if (checkoutStep === 2) {
    const nextBtn = document.getElementById('ck-next');
    if (nextBtn) {
      nextBtn.onclick = async () => {
        nextBtn.disabled = true;
        nextBtn.textContent = '📧 Confirmando pedido...';
        
        await confirmarPedidoConEmail(checkoutDatosCliente);
        
        // Eliminar reservas de Firebase (ya se compraron)
        const promesas = carrito.map(item => {
          if (item.reservaKey && HAS_FIREBASE_SDK) {
            if (timersExpiracion[item.reservaKey]) {
              clearTimeout(timersExpiracion[item.reservaKey]);
              delete timersExpiracion[item.reservaKey];
            }
            return db.ref(`reservas/${item.reservaKey}`).remove();
          }
          return Promise.resolve();
        });
        await Promise.all(promesas);
        
        carrito = [];
        guardarCarrito();
        actualizarUI();
        checkoutStep = 3;
        renderCheckout();
      };
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

function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
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
  if (isOpen) renderizarCarrito();
}

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
    mostrarNotificacion('Email válido requerido', 'error');
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
    return 'far-left';
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
      progEl.style.transition = 'width ' + INTERVAL + 'ms linear';
      progEl.style.width = '100%';
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
    carouselEl.addEventListener('mouseenter', () => { paused = true; clearInterval(autoTimer); });
    carouselEl.addEventListener('mouseleave', () => { paused = false; autoTimer = setInterval(() => goTo(cur + 1), INTERVAL); resetProgress(); });
  }
  
  updateCards();
  setInfoDirect(items[0]);
  requestAnimationFrame(() => { stage.querySelectorAll('.showcase-card.no-transition').forEach(c => c.classList.remove('no-transition')); });
  autoTimer = setInterval(() => goTo(cur + 1), INTERVAL);
  resetProgress();
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
// INICIALIZACIÓN
// ===============================
function init() {
  cargarCarrito();
  limpiarReservasExpiradas();
  cargarProductosDesdeFirebase();
  inicializarEventos();
  initShowcaseCarousel();
  
  if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log('✅ EmailJS inicializado');
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
        mostrarNotificacion('¡Mensaje enviado con éxito!', 'exito');
      } else {
        mostrarNotificacion('Error al enviar', 'error');
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
  
  // Vaciar carrito - CORREGIDO
  document.querySelector('.boton-vaciar-carrito')?.addEventListener('click', async () => {
    await vaciarCarrito();
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
    filtrosActuales = { precioMin: null, precioMax: null, categoria: 'todos', busqueda: '' };
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
      if (checkoutModal?.style.display === 'flex') cerrarCheckout();
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
      const target = e.target.closest('.boton-agregar, .boton-detalles');
      if (!target) return;
      const card = target.closest('.producto-card');
      const id = card ? parseInt(card.dataset.id) : parseInt(target.dataset.id);
      if (isNaN(id)) return;
      if (target.classList.contains('boton-agregar')) {
        const cantidad = +(document.getElementById(`cantidad-${id}`)?.value || 1);
        agregarAlCarrito(id, cantidad);
      } else if (target.classList.contains('boton-detalles')) {
        const prod = productos.find(p => p && p.id === id);
        if (prod) mostrarModalProducto(prod);
      }
    });
  }
}

// Funciones globales
window.agregarAlCarrito = agregarAlCarrito;
window.cerrarCheckout = cerrarCheckout;
window.abrirCheckout = abrirCheckout;
window.vaciarCarrito = vaciarCarrito;

// ===============================
// INICIAR TODO
// ===============================
if (document.readyState !== 'loading') init();
else document.addEventListener('DOMContentLoaded', init);
