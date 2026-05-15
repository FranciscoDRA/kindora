// firebase-config.js

// Configuración de Firebase
export const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// URL para fetch directo (fallback cuando no hay SDK)
export const FIREBASE_URL = firebaseConfig.databaseURL;

// Variables globales para Firebase
let db = null;
let auth = null;
let HAS_FIREBASE_SDK = false;

// Función para inicializar Firebase
export async function initFirebase() {
  // Verificar si Firebase ya está disponible (cargado por script en HTML)
  if (typeof firebase === 'undefined') {
    console.warn('⚠️ Firebase SDK no cargado, usando modo fallback con fetch');
    return { db: null, auth: null, hasSDK: false, url: FIREBASE_URL };
  }

  try {
    // Inicializar solo si no existe
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ Firebase inicializado correctamente');
    }

    db = firebase.database();
    auth = firebase.auth();
    HAS_FIREBASE_SDK = true;

    // Listener para estado de autenticación (opcional)
    auth.onAuthStateChanged(user => {
      console.log('🔐 Usuario Firebase:', user ? `Conectado (${user.email})` : 'Desconectado');
    });

    return { db, auth, hasSDK: true, url: FIREBASE_URL };
  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    return { db: null, auth: null, hasSDK: false, url: FIREBASE_URL };
  }
}

// Función para verificar si Firebase está listo
export function isFirebaseReady() {
  return HAS_FIREBASE_SDK && db !== null && auth !== null;
}

// Función para obtener la instancia de la base de datos
export function getDatabase() {
  if (!db) {
    console.warn('⚠️ Database no inicializada, llamá initFirebase() primero');
  }
  return db;
}

// Función para obtener la instancia de autenticación
export function getAuth() {
  if (!auth) {
    console.warn('⚠️ Auth no inicializada, llamá initFirebase() primero');
  }
  return auth;
}

// Exportar instancias y estado (actualizadas después de init)
export { db, auth, HAS_FIREBASE_SDK, FIREBASE_URL };
