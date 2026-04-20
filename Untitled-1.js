// ===============================
// CONFIGURACIÓN — KINDORA
// ===============================
// ⚠️  CAMBIA ESTOS DATOS ANTES DE PUBLICAR
const WHATSAPP_NUMERO  = '59899000000';   // ← Tu número de WhatsApp (sin + ni espacios)
const CUENTA_BANCO     = 'BROU';
const CUENTA_NUMERO    = '001-234567/8';  // ← Tu número de cuenta
const CUENTA_TITULAR   = 'Kindora S.A.S'; // ← Nombre del titular

const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'kindora_carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

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
const elementos = {
  galeriaProductos:      getElement('galeria-productos'),
  paginacion:            getElement('paginacion'),
  productoModal:         getElement('producto-modal'),
  modalContenido:        getElement('modal-contenido'),
  listaCarrito:          getElement('lista-carrito'),
  totalCarrito:          getElement('total'),
  contadorCarrito:       getElement('contador-carrito'),
  inputBusqueda:         getElement('input-busqueda'),
  selectCategoria:       getElement('filtro-categoria'),
  precioMinInput:        getElement('precio-min'),
  precioMaxInput:        getElement('precio-max'),
  tamañoMinInput:        getElement('tamaño-min'),
  tamañoMaxInput:        getElement('tamaño-max'),
  botonResetearFiltros:  getElement('boton-resetear-filtros'),
  carritoBtnMain:        getElement('carrito-btn-main'),
  carritoPanel:          document.querySelector('.carrito-panel'),
  carritoOverlay:        document.querySelector('.carrito-overlay'),
  btnVaciarCarrito:      document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra:    document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito:      document.querySelector('.cerrar-carrito'),
  hamburguesaBtn:        document.querySelector('.hamburguesa'),
  menu:                  getElement('menu'),
  faqToggles:            document.querySelectorAll('.faq-toggle'),
  formContacto:          getElement('form-contacto'),
  successMessage:        getElement('success-message'),
  btnFlotante:           document.querySelector('.boton-flotante'),
  avisoPreCompraModal:   getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso:     getElement('btn-entendido-aviso'),
  btnCancelarAviso:      getElement('btn-cancelar-aviso')
};

// ===============================
// PREVENIR SCROLL POR DEFECTO EN BOTONES
// ===============================
function evitarScrollPorDefecto() {
  document.querySelectorAll('button:not([type])').forEach(btn => {
    btn.setAttribute('type', 'button');
  });
}

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
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

// ===============================
// CATEGORÍAS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// CARGA DESDE GOOGLE SHEETS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = `
        <div class="loader-wrapper">
          <div class="loader"></div>
          <p>Cargando productos...</p>
        </div>`;
    }
    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos.');
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
    });
    if (errors.length) throw new Error('Error al procesar el CSV');
    if (!data || data.length === 0) throw new Error('No se encontraron productos');
    productos = data
      .filter(r => r.id && r.nombre && r.precio)
      .map(r => ({
        id:          parseInt(r.id, 10),
        nombre:      r.nombre ? r.nombre.trim() : 'Sin Nombre',
        descripcion: r.descripcion ? r.descripcion.trim() : '',
        precio:      parseFloat(r.precio) || 0,
        stock:       parseInt(r.cantidad, 10) || 0,
        imagenes:    (r.foto && r.foto.trim() !== '')
                       ? r.foto.split(',').map(x => x.trim()).filter(x => !!x)
                       : [],
        adicionales: r.adicionales ? r.adicionales.trim() : '',
        alto:        parseFloat(r.alto) || null,
        ancho:       parseFloat(r.ancho) || null,
        profundidad: parseFloat(r.profundidad) || null,
        categoria:   r.categoria ? r.categoria.trim().toLowerCase() : 'otros',
        tamaño:      parseFloat(r.tamaño) || null,
        vendido:     r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false,
        estado:      r.estado ? r.estado.trim() : ''
      }));
    actualizarCategorias();
    actualizarUI();
  } catch (e) {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p style="text-align:center;padding:60px;color:var(--brown-mid);font-style:italic">No se pudieron cargar los productos. Intentá recargar la página.</p>';
    }
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  }
}

// ===============================
// FILTRADO
// ===============================
function filtrarProductos(lista) {
  return lista.filter(p => {
    const { precioMin, precioMax, tamañoMin, tamañoMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = busqueda.toLowerCase();
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (tamañoMin === null || (p.tamaño !== null && p.tamaño >= tamañoMin)) &&
      (tamañoMax === null || (p.tamaño !== null && p.tamaño <= tamañoMax)) &&
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
        <p class="producto-stock">
          ${agot ? '<span class="texto-agotado">Agotado</span>' : `Disponibles: ${disp}`}
        </p>
      </div>
      <div class="card-acciones">
        <input
          type="number"
          value="1"
          min="1"
          max="${disp}"
          class="cantidad-input"
          id="cantidad-${p.id}"
          ${agot ? 'disabled' : ''}
        >
        <button
          class="boton-agregar ${agot ? 'agotado' : ''}"
          data-id="${p.id}"
          ${agot ? 'disabled' : ''}
        >
          ${agot ? 'Agotado' : '+ Agregar'}
        </button>
        <button class="boton-detalles" data-id="${p.id}">Ver más</button>
      </div>
    </div>
  `;
}

// ===============================
// PAGINACIÓN
// ===============================
function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  const cont = elementos.paginacion;
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
      document.getElementById('galeria-productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    cont.appendChild(b);
  }
}

// ===============================
// RENDERIZADO DE PRODUCTOS
// ===============================
function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  const list = filtrarProductos(productos);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const slice = list.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (slice.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p style="text-align:center;padding:60px;color:var(--brown-mid);font-style:italic;grid-column:1/-1">No se encontraron productos con esos filtros.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = slice.map(crearCardProducto).join('');
  }
  elementos.galeriaProductos.onclick = (e) => {
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
  };
  renderizarPaginacion(list.length);
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function mostrarModalProducto(p) {
  if (!elementos.productoModal || !elementos.modalContenido) return;
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);

  let carruselHtml = '';
  if (p.imagenes.length > 0) {
    carruselHtml += `<img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
    if (p.imagenes.length > 1) {
      carruselHtml += `<div class="modal-thumbnails">
        ${p.imagenes.map((img, i) => `
          <img src="${img || PLACEHOLDER_IMAGE}" class="modal-thumbnail${i === 0 ? ' active' : ''}" alt="Miniatura ${i + 1}" data-index="${i}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
        `).join('')}
      </div>`;
    }
  } else {
    carruselHtml += `<img src="${PLACEHOLDER_IMAGE}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy">`;
  }

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal">&times;</button>
    <div class="modal-flex">
      <div class="modal-carrusel">${carruselHtml}</div>
      <div class="modal-info">
        <h2 class="modal-nombre">${p.nombre}</h2>
        <div class="modal-precio">$U ${p.precio.toLocaleString('es-UY')}</div>
        <div class="modal-stock ${disp > 0 ? 'disponible' : 'agotado'}">
          ${disp > 0 ? `Disponibles: ${disp}` : 'AGOTADO'}
        </div>
        <div class="modal-descripcion">${p.descripcion || ''}</div>
        ${p.adicionales ? `<div class="modal-detalles"><span>Material:</span> ${p.adicionales}</div>` : ''}
        ${p.alto && p.ancho ? `<div class="modal-detalles"><span>Medidas:</span> ${p.alto}×${p.ancho}${p.profundidad ? '×' + p.profundidad : ''} cm</div>` : ''}
        ${p.estado ? `<div class="modal-detalles"><span>Estado:</span> ${p.estado}</div>` : ''}
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${disp <= 0 ? 'disabled' : ''}>
          <button class="boton-agregar-modal${disp <= 0 ? ' agotado' : ''}" ${disp <= 0 ? 'disabled' : ''} data-id="${p.id}">
            ${disp <= 0 ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Carrusel de imágenes
  if (p.imagenes.length > 1) {
    const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
    elementos.modalContenido.querySelectorAll('.modal-thumbnail').forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        elementos.modalContenido.querySelectorAll('.modal-thumbnail').forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImg.src = p.imagenes[i];
      });
    });
  }

  // Cerrar modal
  const cerrarBtn = elementos.modalContenido.querySelector('.cerrar-modal');
  cerrarBtn?.addEventListener('click', cerrarModal);

  // Agregar desde modal
  const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');
  agregarBtn?.addEventListener('click', () => {
    const cantidad = +elementos.modalContenido.querySelector('.cantidad-modal-input').value || 1;
    agregarAlCarrito(p.id, cantidad);
    cerrarModal();
  });

  elementos.productoModal.style.display = 'flex';
  document.body.classList.add('no-scroll');

  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) cerrarModal();
  });

  function cerrarModal() {
    elementos.productoModal.style.display = 'none';
    document.body.classList.remove('no-scroll');
  }
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
    carrito.push({
      id,
      nombre:   prod.nombre,
      precio:   prod.precio,
      cantidad,
      imagen:   prod.imagenes[0] || ''
    });
  }
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${prod.nombre}" añadido a tu bolsa`, 'exito');
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu bolsa está vacía</p>';
    elementos.totalCarrito.textContent = '$U 0';
    return;
  }
  elementos.listaCarrito.innerHTML = carrito.map(i => `
    <li class="carrito-item">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre}</span>
        <span class="carrito-item-subtotal">$U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${i.id}" data-action="decrementar" aria-label="Reducir cantidad">−</button>
          <span class="carrito-item-cantidad">${i.cantidad}</span>
          <button data-id="${i.id}" data-action="incrementar" aria-label="Aumentar cantidad">+</button>
          <button data-id="${i.id}" class="eliminar-item" aria-label="Eliminar">✕</button>
        </div>
      </div>
    </li>`).join('');

  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  elementos.totalCarrito.textContent = `$U ${total.toLocaleString('es-UY')}`;

  elementos.listaCarrito.onclick = (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i.id === id);
    const prod = productos.find(p => p.id === id);
    if (!item || !prod) return;
    if (action === 'incrementar') {
      const disp = prod.stock - item.cantidad;
      if (disp > 0) {
        item.cantidad++;
        guardarCarrito();
        actualizarUI();
      } else {
        mostrarNotificacion('No hay más stock disponible', 'error');
      }
    } else if (action === 'decrementar') {
      item.cantidad--;
      if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
      }
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
// MODAL DE TRANSFERENCIA — CHECKOUT
// ===============================
function abrirModalTransferencia() {
  if (!elementos.avisoPreCompraModal) return;

  // Calcular total
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const totalStr = `$U ${total.toLocaleString('es-UY')}`;

  // Actualizar monto en el modal
  const montoEl = document.getElementById('monto-transferencia');
  if (montoEl) montoEl.textContent = totalStr;

  // Armar resumen del pedido para WhatsApp
  const items = carrito
    .map(i => `• ${i.nombre} x${i.cantidad} = $U ${(i.precio * i.cantidad).toLocaleString('es-UY')}`)
    .join('%0A');
  const wspMsg = encodeURIComponent(
    `Hola Kindora! 👋 Quiero enviar mi comprobante de pago.\n\nPedido:\n${carrito.map(i => `• ${i.nombre} x${i.cantidad}`).join('\n')}\n\nTotal: ${totalStr}\n\nAdjunto el comprobante de transferencia.`
  );
  const wspLink = document.getElementById('wsp-link');
  if (wspLink) wspLink.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${wspMsg}`;

  elementos.avisoPreCompraModal.style.display = 'flex';
  document.body.classList.add('no-scroll');
}

function cerrarModalTransferencia() {
  if (!elementos.avisoPreCompraModal) return;
  elementos.avisoPreCompraModal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}

// ===============================
// ACTUALIZACIÓN DE UI
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
  const pos = window.scrollY;
  actualizarUI();
  window.scrollTo({ top: pos, behavior: 'auto' });
}

// ===============================
// TOGGLE CARRITO
// ===============================
function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = elementos.carritoPanel.classList.toggle('open');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
}

// ===============================
// EVENTOS
// ===============================
function inicializarEventos() {
  // Carrito toggle
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);

  // Vaciar carrito
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    mostrarNotificacion('Bolsa vaciada', 'info');
  });

  // Finalizar compra → abre modal de transferencia
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('Tu bolsa está vacía', 'error');
      return;
    }
    toggleCarrito(); // Cierra el panel del carrito primero
    setTimeout(abrirModalTransferencia, 320); // Espera la animación de cierre
  });

  // Confirmar envío de comprobante → finaliza el pedido
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    cerrarModalTransferencia();
    carrito = [];
    guardarCarrito();
    actualizarUI();
    mostrarNotificacion('¡Pedido confirmado! Te contactamos pronto 📖', 'exito');
  });

  // Cancelar modal de transferencia
  elementos.btnCancelarAviso?.addEventListener('click', cerrarModalTransferencia);

  // Cerrar al hacer click fuera
  elementos.avisoPreCompraModal?.addEventListener('click', (e) => {
    if (e.target === elementos.avisoPreCompraModal) cerrarModalTransferencia();
  });

  // Búsqueda
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });

  // Categoría
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });

  // Rangos de precio / tamaño
  document.querySelectorAll('.aplicar-rango-btn').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.rangeType;
      if (t === 'precio') {
        filtrosActuales.precioMin = elementos.precioMinInput?.value ? +elementos.precioMinInput.value : null;
        filtrosActuales.precioMax = elementos.precioMaxInput?.value ? +elementos.precioMaxInput.value : null;
      } else if (t === 'tamaño') {
        filtrosActuales.tamañoMin = elementos.tamañoMinInput?.value ? +elementos.tamañoMinInput.value : null;
        filtrosActuales.tamañoMax = elementos.tamañoMaxInput?.value ? +elementos.tamañoMaxInput.value : null;
      }
      aplicarFiltros();
    });
  });

  // Resetear filtros
  elementos.botonResetearFiltros?.addEventListener('click', () => {
    filtrosActuales = { precioMin: null, precioMax: null, tamañoMin: null, tamañoMax: null, categoria: 'todos', busqueda: '' };
    if (elementos.inputBusqueda)   elementos.inputBusqueda.value = '';
    if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
    if (elementos.precioMinInput)  elementos.precioMinInput.value = '';
    if (elementos.precioMaxInput)  elementos.precioMaxInput.value = '';
    if (elementos.tamañoMinInput)  elementos.tamañoMinInput.value = '';
    if (elementos.tamañoMaxInput)  elementos.tamañoMaxInput.value = '';
    aplicarFiltros();
  });

  // Menú hamburguesa
  elementos.hamburguesaBtn?.addEventListener('click', () => {
    elementos.menu?.classList.toggle('open');
  });

  // Botón flotante scroll-to-top
  elementos.btnFlotante?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Scroll → mostrar botón flotante + navbar shadow
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('navbar');
    if (nav) nav.style.boxShadow = window.scrollY > 20 ? '0 2px 20px rgba(74,55,40,0.08)' : 'none';
    elementos.btnFlotante?.classList.toggle('visible', window.scrollY > 400);
  });

  // Escape cierra modales
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elementos.productoModal?.style.display === 'flex') {
        elementos.productoModal.style.display = 'none';
        document.body.classList.remove('no-scroll');
      }
      if (elementos.avisoPreCompraModal?.style.display === 'flex') {
        cerrarModalTransferencia();
      }
    }
  });

  // FAQ toggles
  elementos.faqToggles?.forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.parentElement?.classList.toggle('active');
    });
  });

  // Scroll reveal
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        revealObserver.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  // Auto-ciclo testimoniales
  let ti = 0;
  setInterval(() => {
    ti = (ti + 1) % 3;
    const dots = document.querySelectorAll('.dot');
    if (dots[ti]) setTestimonial(ti, dots[ti]);
  }, 5000);
}

// ===============================
// TESTIMONIALES
// ===============================
const testimonials = [
  { text: '"La funda Caoba es exactamente lo que buscaba. Se siente como sostener un libro de primera edición. Llegó en tres días, perfectamente embalada."', author: '— Laura M., Buenos Aires' },
  { text: '"El estuche viajero cambió mis viajes. Todo en su lugar: el Kindle, el cargador, los auriculares. Es bello y funcional al mismo tiempo."',          author: '— Andrés R., Montevideo' },
  { text: '"Compré el protector anti-reflejos y leer en el jardín ya no es un problema. Calidad impecable, y el empaque es un regalo en sí mismo."',           author: '— Valentina S., Santiago' }
];

function setTestimonial(i, dot) {
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
}

// ===============================
// NEWSLETTER
// ===============================
function subscribeNewsletter() {
  const input = document.getElementById('newsletter-email');
  const email = input?.value || '';
  if (email && email.includes('@')) {
    mostrarNotificacion('¡Bienvenida a la biblioteca Kindora!', 'exito');
    if (input) input.value = '';
  } else {
    mostrarNotificacion('Por favor ingresá un email válido', 'error');
  }
}

// ===============================
// INICIALIZACIÓN
// ===============================
function init() {
  if (typeof document === 'undefined') return;
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  evitarScrollPorDefecto();

  // Lazy loading de imágenes
  if ('IntersectionObserver' in window) {
    const imgObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) img.src = img.dataset.src;
          imgObserver.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });
    document.querySelectorAll('img[data-src]').forEach(img => imgObserver.observe(img));
  }
}

if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// ===============================
// EMAILJS — FORMULARIO DE CONTACTO
// ===============================
if (window.emailjs) {
  emailjs.init('o4IxJz0Zz-LQ8jYKG');
}

const formContacto = document.getElementById('form-contacto');
if (formContacto) {
  formContacto.addEventListener('submit', async function (event) {
    event.preventDefault();
    const btnEnviar = document.getElementById('btn-enviar');
    const successMessage = document.getElementById('success-message');
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    const formData = new FormData(formContacto);
    const data = Object.fromEntries(formData.entries());
    try {
      const resp = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!resp.ok) throw new Error('Backend error');
      if (window.emailjs) {
        await emailjs.sendForm('service_89by24g', 'template_8mn7hdp', formContacto);
      }
      formContacto.reset();
      if (successMessage) {
        successMessage.classList.remove('hidden');
        setTimeout(() => successMessage.classList.add('hidden'), 5000);
      }
      mostrarNotificacion('¡Mensaje enviado con éxito!', 'exito');
    } catch (err) {
      console.error(err);
      mostrarNotificacion('Error al enviar el mensaje. Por favor, intentá de nuevo.', 'error');
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar mensaje';
    }
  });
}