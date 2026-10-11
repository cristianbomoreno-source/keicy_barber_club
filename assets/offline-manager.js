// ============================================
// Offline Manager - Manejo de modo sin conexión
// ============================================

(function() {
  'use strict';

  const DB_NAME = 'keicy-barber-club-offline';
  const DB_VERSION = 1;
  const STORE_QUEUE = 'pendingActions';
  const STORE_CACHE = 'dataCache';

  let db = null;
  let isOnline = navigator.onLine;

  // =====================
  // 1. INDICADOR VISUAL
  // =====================
  const createOfflineIndicator = () => {
    if (document.getElementById('offline-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'offline-indicator';
    indicator.innerHTML = `
      <style>
        #offline-indicator {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(90deg, #ff6b6b, #ee5a5a);
          color: white;
          padding: 8px 16px;
          text-align: center;
          font-size: 13px;
          font-weight: 500;
          z-index: 99999;
          transform: translateY(-100%);
          transition: transform 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #offline-indicator.show {
          transform: translateY(0);
        }
        #offline-indicator.online {
          background: linear-gradient(90deg, #00c853, #00a846);
        }
        #offline-indicator .dot {
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          animation: pulse-dot 1.5s ease-in-out infinite;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        #offline-indicator .pending-count {
          background: rgba(255,255,255,0.2);
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
        }
      </style>
      <span class="dot"></span>
      <span class="message">Sin conexión - Los cambios se guardarán localmente</span>
      <span class="pending-count" style="display:none">0 pendientes</span>
    `;
    document.body.appendChild(indicator);
    return indicator;
  };

  const showOfflineIndicator = (online = false, pendingCount = 0) => {
    const indicator = document.getElementById('offline-indicator') || createOfflineIndicator();
    const message = indicator.querySelector('.message');
    const pending = indicator.querySelector('.pending-count');

    if (online) {
      indicator.classList.add('online');
      message.textContent = '¡Conexión restaurada! Sincronizando...';
      pending.style.display = 'none';
    } else {
      indicator.classList.remove('online');
      message.textContent = 'Sin conexión - Los cambios se guardarán localmente';
      if (pendingCount > 0) {
        pending.style.display = 'inline';
        pending.textContent = `${pendingCount} pendiente${pendingCount > 1 ? 's' : ''}`;
      }
    }

    indicator.classList.add('show');
  };

  const hideOfflineIndicator = () => {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
      indicator.classList.remove('show');
    }
  };

  // =====================
  // 2. INDEXEDDB SETUP
  // =====================
  const initDB = () => {
    return new Promise((resolve, reject) => {
      if (db) return resolve(db);

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        db = request.result;
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Store para acciones pendientes
        if (!database.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = database.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
          queueStore.createIndex('type', 'type', { unique: false });
        }

        // Store para cache de datos
        if (!database.objectStoreNames.contains(STORE_CACHE)) {
          const cacheStore = database.createObjectStore(STORE_CACHE, { keyPath: 'key' });
          cacheStore.createIndex('expiry', 'expiry', { unique: false });
        }
      };
    });
  };

  // =====================
  // 3. COLA DE ACCIONES
  // =====================
  const queueAction = async (action) => {
    try {
      await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);

        const item = {
          ...action,
          timestamp: Date.now(),
          retries: 0
        };

        const request = store.add(item);
        request.onsuccess = () => {
          console.log('[Offline] Acción guardada en cola:', action.type);
          updatePendingCount();
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('[Offline] Error guardando acción:', e);
    }
  };

  const getPendingActions = async () => {
    try {
      await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const store = tx.objectStore(STORE_QUEUE);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return [];
    }
  };

  const removeAction = async (id) => {
    try {
      await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('[Offline] Error eliminando acción:', e);
    }
  };

  const updatePendingCount = async () => {
    const actions = await getPendingActions();
    const pending = document.querySelector('#offline-indicator .pending-count');
    if (pending && actions.length > 0) {
      pending.style.display = 'inline';
      pending.textContent = `${actions.length} pendiente${actions.length > 1 ? 's' : ''}`;
    }
  };

  // =====================
  // 4. SINCRONIZACIÓN
  // =====================
  const syncPendingActions = async () => {
    if (!navigator.onLine) return;

    const actions = await getPendingActions();
    if (actions.length === 0) return;

    console.log(`[Offline] Sincronizando ${actions.length} acciones pendientes...`);
    showOfflineIndicator(true);

    for (const action of actions) {
      try {
        // Ejecutar la acción según su tipo
        if (action.type === 'supabase' && window.supabase) {
          const { table, method, data, match } = action.payload;
          let query = window.supabase.from(table);

          if (method === 'insert') {
            await query.insert(data);
          } else if (method === 'update') {
            query = query.update(data);
            if (match) {
              Object.entries(match).forEach(([key, value]) => {
                query = query.eq(key, value);
              });
            }
            await query;
          } else if (method === 'delete') {
            query = query.delete();
            if (match) {
              Object.entries(match).forEach(([key, value]) => {
                query = query.eq(key, value);
              });
            }
            await query;
          }
        } else if (action.type === 'fetch') {
          await fetch(action.payload.url, action.payload.options);
        }

        // Acción completada, remover de la cola
        await removeAction(action.id);
        console.log('[Offline] Acción sincronizada:', action.type);

      } catch (e) {
        console.error('[Offline] Error sincronizando acción:', e);
        // Incrementar reintentos si falla
        action.retries = (action.retries || 0) + 1;
        if (action.retries >= 3) {
          await removeAction(action.id);
          console.warn('[Offline] Acción descartada después de 3 intentos:', action);
        }
      }
    }

    // Verificar si quedan acciones
    const remaining = await getPendingActions();
    if (remaining.length === 0) {
      setTimeout(hideOfflineIndicator, 2000);
    }
  };

  // =====================
  // 5. CACHE DE DATOS
  // =====================
  const cacheData = async (key, data, ttlMinutes = 60) => {
    try {
      await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readwrite');
        const store = tx.objectStore(STORE_CACHE);

        const item = {
          key,
          data,
          expiry: Date.now() + (ttlMinutes * 60 * 1000)
        };

        const request = store.put(item);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error('[Offline] Error cacheando datos:', e);
    }
  };

  const getCachedData = async (key) => {
    try {
      await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_CACHE, 'readonly');
        const store = tx.objectStore(STORE_CACHE);
        const request = store.get(key);

        request.onsuccess = () => {
          const item = request.result;
          if (!item) return resolve(null);

          // Verificar si expiró
          if (item.expiry < Date.now()) {
            // Limpiar dato expirado
            const deleteTx = db.transaction(STORE_CACHE, 'readwrite');
            deleteTx.objectStore(STORE_CACHE).delete(key);
            return resolve(null);
          }

          resolve(item.data);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      return null;
    }
  };

  // =====================
  // 6. EVENTOS DE RED
  // =====================
  const handleOnline = () => {
    console.log('[Offline] Conexión restaurada');
    isOnline = true;
    showOfflineIndicator(true);
    syncPendingActions();
  };

  const handleOffline = () => {
    console.log('[Offline] Conexión perdida');
    isOnline = false;
    showOfflineIndicator(false);
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Verificar estado inicial
  if (!navigator.onLine) {
    handleOffline();
  }

  // =====================
  // 7. API PÚBLICA
  // =====================
  window.offlineManager = {
    // Estado
    isOnline: () => navigator.onLine,

    // Cola de acciones
    queue: queueAction,
    getPending: getPendingActions,
    sync: syncPendingActions,

    // Cache de datos
    cache: cacheData,
    getCached: getCachedData,

    // Wrapper para Supabase offline-first
    supabaseOffline: {
      insert: async (table, data) => {
        if (navigator.onLine && window.supabase) {
          return window.supabase.from(table).insert(data);
        }
        await queueAction({
          type: 'supabase',
          payload: { table, method: 'insert', data }
        });
        return { data: null, error: null, offline: true };
      },

      update: async (table, data, match) => {
        if (navigator.onLine && window.supabase) {
          let query = window.supabase.from(table).update(data);
          Object.entries(match).forEach(([k, v]) => query = query.eq(k, v));
          return query;
        }
        await queueAction({
          type: 'supabase',
          payload: { table, method: 'update', data, match }
        });
        return { data: null, error: null, offline: true };
      },

      delete: async (table, match) => {
        if (navigator.onLine && window.supabase) {
          let query = window.supabase.from(table).delete();
          Object.entries(match).forEach(([k, v]) => query = query.eq(k, v));
          return query;
        }
        await queueAction({
          type: 'supabase',
          payload: { table, method: 'delete', match }
        });
        return { data: null, error: null, offline: true };
      }
    }
  };

  // Inicializar DB al cargar
  initDB().then(() => {
    console.log('[Offline] Manager inicializado');
    updatePendingCount();
  });

})();
