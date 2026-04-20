// Carga de productos desde Google Sheets usando PapaParse
// Control de stock y manejo de errores

const SHEET_CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

let productos = [];

function mostrarError(mensaje) {
  const contenedor = document.getElementById('galeria-productos');
  if (contenedor) contenedor.innerHTML = `<p class="error">${mensaje}</p>`;
}

function crearProductoHTML(p) {
  const agotado = p.stock <= 0;
  return `
    <div class="producto-card">
      <div class="producto-img-container">
        <img src="${p.imagen}" alt="${p.nombre}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      </div>
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">${agotado ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${p.stock}`}</p>
      <button class="boton-agregar" ${agotado ? 'disabled' : ''}>Agregar al carrito</button>
    </div>`;
}

function mostrarProductos() {
  const contenedor = document.getElementById('galeria-productos');
  if (!contenedor) return;
  contenedor.innerHTML = productos.map(crearProductoHTML).join('');
}

function cargarProductosDesdeSheets() {
  fetch(SHEET_CSV_URL)
    .then(r => {
      if (!r.ok) throw new Error('No se pudo obtener el CSV');
      return r.text();
    })
    .then(texto => {
      const { data, errors } = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true
      });
      if (errors.length) {
        console.error('Errores al parsear CSV', errors);
        throw new Error('Error al procesar los datos');
      }
      productos = data.map(fila => ({
        id: parseInt(fila.id, 10) || 0,
        nombre: fila.nombre || 'Sin nombre',
        descripcion: fila.descripcion || '',
        precio: parseFloat(fila.precio) || 0,
        stock: parseInt(fila.cantidad, 10) || 0,
        imagen: fila.foto ? fila.foto.split(',')[0].trim() : PLACEHOLDER_IMAGE
      }));
      mostrarProductos();
    })
    .catch(err => {
      console.error(err);
      mostrarError('No se pudieron cargar los productos.');
    });
}

document.addEventListener('DOMContentLoaded', cargarProductosDesdeSheets);
