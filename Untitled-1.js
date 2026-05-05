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
// CONFIGURACIÓN EMAILJS (CORREGIDO)
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
    el.textContent = total;
    el.classList.toggle('visible', total > 0);
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
// CARGA DESDE GOOGLE SHEETS
// ===============================
const FIREBASE_URL = 'https://kindora-47c88-default-rtdb.firebaseio.com/';

async function cargarProductosDesdeSheets() {
  const galeria = getElement('galeria-productos');
  try {
    if (galeria) {
      galeria.innerHTML = `<div class="loader-wrapper"><div class="loader"></div><p>Cargando productos...</p></div>`;
    }

    const resp = await fetch(FIREBASE_URL + 'productos/.json');
    if (!resp.ok) throw new Error('Error al cargar productos desde Firebase.');

    const data = await resp.json();
    if (!data) throw new Error('No se encontraron productos');

    productos = Object.values(data)
      .filter(r => r && r.id && r.nombre && r.precio)
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

    actualizarCategorias();
    actualizarUI();
    initShowcaseCarousel();

  } catch (e) {
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
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0;
  const primeraImagen = p.imagenes[0] || PLACEHOLDER_IMAGE;
  const imgHtml = `<img src="${primeraImagen}" alt="${p.nombre}" class="producto-img" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
  return `
    <div class="producto-card" data-id="${p.id}">
      ${imgHtml}
      <div>
        <p class="producto-nombre">${p.nombre}</p>
        <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock">${agot ? '<span class="texto-agotado">Agotado</span>' : `Disponibles: ${disp}`}</p>
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
  if (!modal || !modalContenido) return;
  modalAbierto = true;
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  let carruselHtml = '';
  if (p.imagenes.length > 0) {
    carruselHtml += `<img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
    if (p.imagenes.length > 1) {
      carruselHtml += `<div class="modal-thumbnails">${p.imagenes.map((img, i) => `<img src="${img || PLACEHOLDER_IMAGE}" class="modal-thumbnail${i === 0 ? ' active' : ''}" alt="Miniatura ${i + 1}" data-index="${i}" onerror="this.src='${PLACEHOLDER_IMAGE}'">`).join('')}</div>`;
    }
  } else {
    carruselHtml += `<img src="${PLACEHOLDER_IMAGE}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy">`;
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
  if (p.imagenes.length > 1) {
    const mainImg = modalContenido.querySelector('#modal-img-principal');
    modalContenido.querySelectorAll('.modal-thumbnail').forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        modalContenido.querySelectorAll('.modal-thumbnail').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImg.src = p.imagenes[i];
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
    const cantidad = +modalContenido.querySelector('.cantidad-modal-input').value || 1;
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
function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion('Producto no encontrado', 'error');
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad) || cantidad < 1) return mostrarNotificacion('Cantidad inválida', 'error');
  const enCarrito = carrito.find(item => item.id === id);
  const disponibles = prod.stock - (enCarrito?.cantidad || 0);
  if (cantidad > disponibles) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles`, 'error');
    return;
  }
  if (enCarrito) {
    enCarrito.cantidad += cantidad;
  } else {
    carrito.push({ id, nombre: prod.nombre, precio: prod.precio, cantidad, imagen: prod.imagenes[0] || '' });
  }
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${prod.nombre}" añadido a tu bolsa`, 'exito');
}

function renderizarCarrito() {
  const listaCarrito = getElement('lista-carrito');
  const totalSpan = getElement('total');
  if (!listaCarrito || !totalSpan) return;
  if (carrito.length === 0) {
    listaCarrito.innerHTML = '<p class="carrito-vacio">Tu bolsa está vacía</p>';
    totalSpan.textContent = '$U 0';
    return;
  }
  listaCarrito.innerHTML = carrito.map(i => `
    <li class="carrito-item">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre}</span>
        <span class="carrito-item-subtotal">$U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${i.id}" data-action="decrementar">−</button>
          <span class="carrito-item-cantidad">${i.cantidad}</span>
          <button data-id="${i.id}" data-action="incrementar">+</button>
          <button data-id="${i.id}" class="eliminar-item">✕</button>
        </div>
      </div>
    </li>`).join('');
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  totalSpan.textContent = `$U ${total.toLocaleString('es-UY')}`;
  listaCarrito.onclick = (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i.id === id);
    const prod = productos.find(p => p.id === id);
    if (!item || !prod) return;
    if (action === 'incrementar') {
      const disp = prod.stock - item.cantidad;
      if (disp > 0) { item.cantidad++; guardarCarrito(); actualizarUI(); }
      else mostrarNotificacion('No hay más stock disponible', 'error');
    } else if (action === 'decrementar') {
      item.cantidad--;
      if (item.cantidad <= 0) carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      actualizarUI();
    } else if (target.classList.contains('eliminar-item')) {
      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Producto eliminado de la bolsa', 'info');
    }
  };
}

// ===============================
// EMAILJS FUNCIONES (NUEVAS)
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
          <strong>$U ${(p.precio * p.cantidad).toLocaleString('es-UY')}</strong>
        </div>`)
      .join('');

    const templateParams = {
      order_id:       datosCompra.orderId,
      order_date:     new Date().toLocaleString('es-UY'),
      total_amount:   datosCompra.total,
      name:           datosCompra.cliente.nombre,
      client_name:    datosCompra.cliente.nombre,
      client_email:   datosCompra.cliente.email,
      client_phone:   datosCompra.cliente.telefono  || '—',
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

// ===============================
// MODAL DE TRANSFERENCIA (MODIFICADO)
// ===============================
function abrirModalTransferencia() {
  const modal = getElement('aviso-pre-compra-modal');
  if (!modal) return;
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const totalStr = `$U ${total.toLocaleString('es-UY')}`;
  const montoEl = document.getElementById('monto-transferencia');
  if (montoEl) montoEl.textContent = totalStr;
  const items = carrito.map(i => `• ${i.nombre} x${i.cantidad} = $U ${(i.precio * i.cantidad).toLocaleString('es-UY')}`).join('%0A');
  const wspMsg = encodeURIComponent(`Hola Kindora! 👋 Quiero enviar mi comprobante de pago.\n\nPedido:\n${carrito.map(i => `• ${i.nombre} x${i.cantidad}`).join('\n')}\n\nTotal: ${totalStr}\n\nAdjunto el comprobante de transferencia.`);
  const wspLink = document.getElementById('wsp-link');
  if (wspLink) wspLink.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${wspMsg}`;
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
}

function cerrarModalTransferencia() {
  const modal = getElement('aviso-pre-compra-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}

// Función para confirmar pedido y enviar email
async function confirmarPedidoConEmail(datosCliente) {
  const totalNumerico = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const orderId = 'KIN-' + Date.now().toString().slice(-8);
  
  const datosCompra = {
    orderId: orderId,
    total: totalNumerico.toLocaleString('es-UY'),
    cliente: datosCliente,
    productos: [...carrito]
  };
  
  // Mostrar loading
  mostrarNotificacion('Procesando tu pedido...', 'info');
  
  const result = await enviarCorreoCompra(datosCompra);
  
  if (result.success) {
    mostrarNotificacion('✅ Pedido confirmado. Te enviaremos un email con los detalles.', 'exito');
  } else {
    mostrarNotificacion('⚠️ Pedido registrado. Nos contactaremos contigo pronto.', 'info');
  }
  
  // Vaciar carrito
  carrito = [];
  guardarCarrito();
  actualizarUI();
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
    { 
      nombre: 'Funda Caoba Premium', 
      categoria: 'Fundas', 
      precio: 1890, 
      img: 'img/WhatsApp%20Image%202026-04-28%20at%2010.45.47.jpeg' 
    },
    { 
      nombre: 'Funda Caoba Premium', 
      categoria: 'Fundas', 
      precio: 1890, 
      img: 'img/WhatsApp Image 2026-04-28 at 10.46.08.jpeg' 
    },
    { 
      nombre: 'Funda Caoba Premium', 
      categoria: 'Fundas', 
      precio: 1890, 
      img: 'img/WhatsApp Image 2026-04-28 at 10.46.16.jpeg' 
    },
  ];
  const raw = (typeof productos !== 'undefined' && productos.length > 0) ? productos.slice(0, 8) : DEMO_ITEMS;
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
// KINDLE INTERACTIVO
// ===============================
(function() {
  const pages = [
    { chapter: "CAPÍTULO PRIMERO", title: "El secreto del bosque", page: "— 12 —",
      lines: ["La mañana llegó envuelta en un silencio","extraño, como si el bosque mismo hubiera","contenido la respiración durante la noche.","Mara abrió los ojos antes de que el sol","tocara el horizonte, impulsada por una","inquietud que no sabía nombrar. Desde su","ventana, los robles centenarios se erguían","inmóviles, sus ramas formando una bóveda.","","     —¿Lo escuchaste anoche? —susurró su","hermano Tomás desde el umbral, con los ojos","aún pesados de sueño pero la voz cargada.","","     Mara asintió sin palabras. El sonido","—aquella vibración grave que recorrió el","suelo como un pulso subterráneo— la había","despertado a las tres de la madrugada. No","era el viento. Era algo más antiguo."] },
    { chapter: "CAPÍTULO SEGUNDO", title: "El camino de raíces", page: "— 28 —",
      lines: ["Al amanecer, los dos hermanos cruzaron","el umbral sin decirse nada. Las palabras","sobraban cuando el bosque llamaba así.","","     El sendero era apenas una sugerencia","entre la hojarasca. Las raíces emergían","del suelo como dedos, como advertencias.","Mara las esquivaba sin mirar; las conocía","de memoria, las había recorrido de niña.","","     Pero el bosque no era el mismo.","Los pájaros callaban. La luz del alba","se filtraba distinta, más dorada, más","espesa. Como si el aire mismo tuviera","memoria y eligiera recordar."] },
    { chapter: "CAPÍTULO TERCERO", title: "El círculo de robles", page: "— 41 —",
      lines: ["Lo encontraron al mediodía: el claro.","Siete robles dispuestos en círculo perfecto,","sus troncos tan viejos que parecían piedra.","","     En el centro, la tierra era diferente.","Más oscura. Más quieta. Sin insectos,","sin musgo, sin la vida pequeña que","cubría todo lo demás.","","     —El mapa decía aquí —murmuró Tomás.","","     Mara no respondió. Estaba mirando","el suelo, donde algo pulsaba, lento","y profundo, como un corazón dormido","esperando el momento exacto de despertar."] }
  ];
  const device = document.querySelector('.device');
  if (!device) return;
  const scene = document.querySelector('.ereader-scene');
  if (scene && !document.querySelector('.kindle-progress')) {
    const progressWrap = document.createElement('div');
    progressWrap.className = 'kindle-progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'kindle-progress-fill';
    progressWrap.appendChild(progressFill);
    scene.appendChild(progressWrap);
    const style = document.createElement('style');
    style.textContent = `.kindle-progress { position: absolute; bottom: 30px; left: 30px; right: 30px; height: 1.5px; background: rgba(212,163,115,0.25); z-index: 5; } .kindle-progress-fill { height: 100%; width: 0%; background: var(--sepia); transition: width 0.6s ease; }`;
    document.head.appendChild(style);
  }
  const progressFill = document.querySelector('.kindle-progress-fill');
  const textGroup = device.querySelector('g[font-family]');
  const chapterEl = device.querySelector('text[letter-spacing="2.5"]');
  const titleEl = device.querySelector('text[font-size="13"]');
  const pageNumEl = device.querySelector('text[letter-spacing="1"]');
  if (!textGroup) return;
  const textEls = Array.from(textGroup.querySelectorAll('text'));
  let current = 0, paused = false, timer;
  function setPage(idx, animate) {
    const p = pages[idx];
    if (progressFill) progressFill.style.width = ((idx + 1) / pages.length * 100) + '%';
    const doUpdate = () => {
      if (chapterEl) chapterEl.textContent = p.chapter;
      if (titleEl) titleEl.textContent = p.title;
      if (pageNumEl) pageNumEl.textContent = p.page;
      textEls.forEach((el, i) => { el.textContent = i < p.lines.length ? p.lines[i] : ''; });
    };
    if (animate) {
      device.style.opacity = '0.85';
      device.style.transition = 'opacity 0.08s';
      setTimeout(() => { doUpdate(); device.style.opacity = '1'; }, 90);
    } else { doUpdate(); }
  }
  function nextPage() { if (!paused) { current = (current + 1) % pages.length; setPage(current, true); } }
  function startTimer() { clearInterval(timer); timer = setInterval(nextPage, 5000); }
  if (scene) {
    scene.addEventListener('mouseenter', () => { paused = true; });
    scene.addEventListener('mouseleave', () => { paused = false; startTimer(); });
  }
  setPage(0, false);
  startTimer();
})();

// ===============================
// INICIALIZACIÓN (CORREGIDA CON EMAILJS)
// ===============================
function init() {
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  initShowcaseCarousel();
  
  // Inicializar EmailJS
  if (window.emailjs) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
    console.log('✅ EmailJS inicializado con clave:', EMAILJS_PUBLIC_KEY);
  } else {
    console.warn('⚠️ EmailJS no cargado. Revisa que el script esté incluido.');
  }
  
  // ===== FORMULARIO DE CONTACTO =====
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
        console.error('Error detallado:', result.error);
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
// EVENTOS (MODIFICADO PARA EMAILJS)
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
  
  // Botón finalizar compra MODIFICADO
  document.querySelector('.boton-finalizar-compra')?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('Tu bolsa está vacía', 'error');
      return;
    }
    if (document.querySelector('.carrito-panel')?.classList.contains('open')) toggleCarrito();
    setTimeout(abrirModalTransferencia, 320);
  });
  
  // Botón ENTENDIDO del modal - MODIFICADO para enviar email
  document.getElementById('btn-entendido-aviso')?.addEventListener('click', () => {
  cerrarModalTransferencia();
  setTimeout(() => abrirModalDatosCliente(), 200);
});

document.getElementById('btn-cancelar-cliente')?.addEventListener('click', cerrarModalDatosCliente);

document.getElementById('btn-confirmar-cliente')?.addEventListener('click', async () => {
  const nombre    = document.getElementById('cliente-nombre')?.value.trim();
  const email     = document.getElementById('cliente-email')?.value.trim();
  const telefono  = document.getElementById('cliente-telefono')?.value.trim();
  const direccion = document.getElementById('cliente-direccion')?.value.trim();
  const errorEl   = document.getElementById('cliente-error');

  if (!nombre || !email) {
    errorEl.style.display = 'block';
    return;
  }
  errorEl.style.display = 'none';

  const btn = document.getElementById('btn-confirmar-cliente');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  await confirmarPedidoConEmail({ nombre, email, telefono, direccion });

  btn.disabled = false;
  btn.textContent = 'Confirmar pedido →';
  cerrarModalDatosCliente();
});
  
  document.getElementById('btn-cancelar-aviso')?.addEventListener('click', cerrarModalTransferencia);
  document.getElementById('aviso-pre-compra-modal')?.addEventListener('click', (e) => { 
    if (e.target === document.getElementById('aviso-pre-compra-modal')) cerrarModalTransferencia(); 
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
      if (getElement('aviso-pre-compra-modal')?.style.display === 'flex') cerrarModalTransferencia();
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
        const cant = +document.getElementById(`cantidad-${id}`)?.value || 1;
        agregarAlCarrito(id, cant);
        return;
      }
      const detalleBtn = e.target.closest('.boton-detalles');
      if (detalleBtn) {
        const id = +detalleBtn.dataset.id;
        const prod = productos.find(p => p.id === id);
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

// ===============================
// MODAL DATOS CLIENTE
// ===============================
function abrirModalDatosCliente() {
  let modal = getElement('modal-datos-cliente');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-datos-cliente';
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(74,55,40,0.55);z-index:9999;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#faf6f0;border-radius:12px;padding:36px 32px;max-width:420px;width:90%;box-shadow:0 8px 40px rgba(74,55,40,0.18);">
        <h3 style="margin:0 0 6px;font-family:Georgia,serif;color:#3b2a1a;font-size:1.25rem;">Confirmá tu pedido</h3>
        <p style="margin:0 0 22px;font-size:0.85rem;color:#7a6450;">Completá tus datos para registrar la compra y recibir confirmación.</p>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <input id="cliente-nombre" placeholder="Nombre completo *" style="padding:10px 14px;border:1px solid #d4c5b0;border-radius:7px;font-size:0.95rem;background:#fff;color:#3b2a1a;outline:none;">
          <input id="cliente-email" type="email" placeholder="Email *" style="padding:10px 14px;border:1px solid #d4c5b0;border-radius:7px;font-size:0.95rem;background:#fff;color:#3b2a1a;outline:none;">
          <input id="cliente-telefono" placeholder="Teléfono (opcional)" style="padding:10px 14px;border:1px solid #d4c5b0;border-radius:7px;font-size:0.95rem;background:#fff;color:#3b2a1a;outline:none;">
          <input id="cliente-direccion" placeholder="Dirección de entrega (opcional)" style="padding:10px 14px;border:1px solid #d4c5b0;border-radius:7px;font-size:0.95rem;background:#fff;color:#3b2a1a;outline:none;">
          <p id="cliente-error" style="display:none;color:#c0392b;font-size:0.82rem;margin:0;">* Nombre y email son obligatorios.</p>
        </div>
        <div style="display:flex;gap:10px;margin-top:22px;">
          <button id="btn-cancelar-cliente" style="flex:1;padding:11px;border:1px solid #d4c5b0;background:transparent;border-radius:7px;color:#7a6450;cursor:pointer;font-size:0.9rem;">Cancelar</button>
          <button id="btn-confirmar-cliente" style="flex:2;padding:11px;background:#3b2a1a;color:#faf6f0;border:none;border-radius:7px;cursor:pointer;font-size:0.95rem;font-weight:600;">Confirmar pedido →</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Reasignar eventos porque el DOM cambió
    document.getElementById('btn-cancelar-cliente').addEventListener('click', cerrarModalDatosCliente);
    document.getElementById('btn-confirmar-cliente').addEventListener('click', async () => {
      const nombre    = document.getElementById('cliente-nombre')?.value.trim();
      const email     = document.getElementById('cliente-email')?.value.trim();
      const telefono  = document.getElementById('cliente-telefono')?.value.trim();
      const direccion = document.getElementById('cliente-direccion')?.value.trim();
      const errorEl   = document.getElementById('cliente-error');
      if (!nombre || !email) { errorEl.style.display = 'block'; return; }
      errorEl.style.display = 'none';
      const btn = document.getElementById('btn-confirmar-cliente');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      await confirmarPedidoConEmail({ nombre, email, telefono, direccion });
      btn.disabled = false;
      btn.textContent = 'Confirmar pedido →';
      cerrarModalDatosCliente();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) cerrarModalDatosCliente(); });
  }
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');
}

function cerrarModalDatosCliente() {
  const modal = getElement('modal-datos-cliente');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}
