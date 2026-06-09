const API_URL = '/api';

const store = {
    data: {
        currentUser: null,
        categories: [],
        dishes: [],
        cart: [],
        orders: [],
        inventory: [],
        customers: [],
        tables: [],
        unsyncedOrders: [], // For offline recovery
        isOnline: true,
        // Temporary Order State
        selectedTableId: null,
        selectedCustomerId: null,
        currentOrderType: 'Dine In',
        settings: {
            business_name: 'TASTY OF ASCENDIA',
            currency_symbol: 'Rs.',
            tax_rate: '10'
        }
    },

    async fetchAPI(endpoint, options = {}) {
        const url = `${API_URL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add Auth Headers
        if (this.data.currentUser) {
            headers['x-user-id'] = this.data.currentUser.id;
            headers['x-user-role'] = this.data.currentUser.role;
        }

        try {
            const response = await fetch(url, { ...options, headers });
            this.data.isOnline = true;
            window.dispatchEvent(new Event('network_status_change'));
            
            if (response.status === 401 || response.status === 403) {
                const errorData = await response.json();
                window.showToast(errorData.error || "Permission denied", "error");
                if (response.status === 401) this.logout();
                throw new Error(errorData.error);
            }
            
            return response;
        } catch (error) {
            this.data.isOnline = false;
            window.dispatchEvent(new Event('network_status_change'));
            throw error;
        }
    },

    async init() {
        try {
            // User session remains local
            const storedUser = localStorage.getItem('tasty_user');
            if (storedUser) {
                this.data.currentUser = JSON.parse(storedUser);
            }

            // Fetch data from Backend (Handling roles gracefully)
            const endpoints = [
                this.fetchAPI('/categories').then(r => r.json()),
                this.fetchAPI('/dishes').then(r => r.json()),
                this.fetchAPI('/orders').then(r => r.json()),
                this.fetchAPI('/customers').then(r => r.json()),
                this.fetchAPI('/tables').then(r => r.json()),
                this.fetchAPI('/settings').then(r => r.json())
            ];

            // Only add restricted endpoints if admin
            if (this.data.currentUser && this.data.currentUser.role === 'admin') {
                endpoints.push(this.fetchAPI('/inventory').then(r => r.json()).catch(() => []));
                endpoints.push(this.fetchAPI('/audit-logs').then(r => r.json()).catch(() => []));
            } else {
                endpoints.push(Promise.resolve([])); // Dummy inventory
                endpoints.push(Promise.resolve([])); // Dummy audit logs
            }

            const [categories, dishes, orders, customers, tables, settings, inventory, auditLogs] = await Promise.all(endpoints);

            this.data.categories = categories.map(c => ({
                ...c,
                count: dishes.filter(d => d.category_id === c.id).length
            }));
            
            this.data.dishes = dishes;
            this.data.orders = orders;
            this.data.customers = customers;
            this.data.tables = tables;
            this.data.settings = settings;
            this.data.inventory = inventory;
            this.data.audit_logs = auditLogs;
            
            // Restore cart from local storage
            const storedCart = localStorage.getItem('tasty_cart');
            if (storedCart) {
                this.data.cart = JSON.parse(storedCart);
            }

            // Restore unsynced orders
            const storedUnsynced = localStorage.getItem('tasty_unsynced');
            if (storedUnsynced) {
                this.data.unsyncedOrders = JSON.parse(storedUnsynced);
                this.attemptSync();
            }

            this.checkLowStock();
            
            window.dispatchEvent(new Event('store_ready'));
        } catch (error) {
            console.error("Error loading data from API:", error);
            // Even if offline, we can show UI from local storage if needed
            window.dispatchEvent(new Event('store_ready'));
        }
    },

    saveCart() {
        localStorage.setItem('tasty_cart', JSON.stringify(this.data.cart));
    },

    saveUnsynced() {
        localStorage.setItem('tasty_unsynced', JSON.stringify(this.data.unsyncedOrders));
    },

    getCategories() {
        return this.data.categories;
    },

    getDishes(categoryId = 'all') {
        if (categoryId === 'all') return this.data.dishes;
        return this.data.dishes.filter(d => d.category_id === categoryId);
    },

    addToCart(dish, qty = 1) {
        const existing = this.data.cart.find(item => item.dish.id === dish.id);
        if (existing) {
            existing.qty += qty;
        } else {
            this.data.cart.push({ dish, qty: qty });
        }
        this.saveCart();
    },

    removeFromCart(dishId) {
        this.data.cart = this.data.cart.filter(item => item.dish.id !== dishId);
        this.saveCart();
    },

    updateCartQty(dishId, qty) {
        const existing = this.data.cart.find(item => item.dish.id === dishId);
        if (existing) {
            existing.qty = qty;
            if (existing.qty <= 0) {
                this.removeFromCart(dishId);
            }
        }
        this.saveCart();
    },

    clearCart() {
        this.data.cart = [];
        this.saveCart();
    },

    async placeOrder(orderType = 'Dine In', paymentMethod = 'Cash', tableId = null, customerId = null) {
        if (this.data.cart.length === 0) {
            window.showToast("Cart is empty!", "error");
            return null;
        }
        
        const subtotal = this.data.cart.reduce((sum, item) => sum + (item.dish.price * item.qty), 0);
        const taxRate = parseFloat(this.data.settings.tax_rate || 0) / 100;
        const total = subtotal * (1 + taxRate);
        
        const orderData = { 
            items: this.data.cart, 
            total, 
            orderType, 
            paymentMethod, 
            table_id: tableId,
            customer_id: customerId 
        };

        try {
            const res = await this.fetchAPI('/orders', {
                method: 'POST',
                body: JSON.stringify(orderData)
            });
            
            const result = await res.json();
            if (!res.ok) {
                window.showToast(result.error || "Failed to place order", "error");
                return null;
            }

            // Update table status if Dine In
            if (orderType === 'Dine In' && tableId) {
                await this.fetchAPI(`/tables/${tableId}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status: 'Occupied' })
                });
            }

            // Sync local data after successful order
            await this.refreshData();
            
            this.clearCart();
            window.showToast("Order placed successfully!");
            return result;
        } catch (e) {
            console.error("Error placing order, saving for later sync", e);
            this.data.unsyncedOrders.push({ ...orderData, id: 'OFF-' + Date.now(), timestamp: new Date().toISOString() });
            this.saveUnsynced();
            this.clearCart();
            window.showToast("Server unreachable. Order saved offline and will sync later.", "warning");
            return { offline: true };
        }
    },

    async refreshData() {
        try {
            const endpoints = [
                this.fetchAPI('/dishes').then(r => r.json()),
                this.fetchAPI('/orders').then(r => r.json()),
                this.fetchAPI('/customers').then(r => r.json()),
                this.fetchAPI('/tables').then(r => r.json()),
                this.fetchAPI('/event-rooms').then(r => r.json()),
                this.fetchAPI('/reservations').then(r => r.json())
            ];

            if (this.data.currentUser && this.data.currentUser.role === 'admin') {
                endpoints.push(this.fetchAPI('/inventory').then(r => r.json()).catch(() => []));
            } else {
                endpoints.push(Promise.resolve(this.data.inventory || [])); 
            }

            const [dishes, orders, customers, tables, eventRooms, reservations, inventory] = await Promise.all(endpoints);
            
            this.data.dishes = dishes;
            this.data.orders = orders;
            this.data.customers = customers;
            this.data.tables = tables;
            this.data.eventRooms = eventRooms;
            this.data.reservations = reservations;
            this.data.inventory = inventory;
            
            this.checkLowStock();
            window.dispatchEvent(new Event('data_refreshed'));
            return true;
        } catch (e) {
            console.error("Data refresh failed", e);
            return false;
        }
    },

    async attemptSync() {
        if (!this.data.isOnline || this.data.unsyncedOrders.length === 0) return;
        
        console.log(`Attempting to sync ${this.data.unsyncedOrders.length} offline orders...`);
        const ordersToSync = [...this.data.unsyncedOrders];
        this.data.unsyncedOrders = [];
        this.saveUnsynced();

        for (const order of ordersToSync) {
            try {
                await this.fetchAPI('/orders', {
                    method: 'POST',
                    body: JSON.stringify(order)
                });
            } catch (e) {
                this.data.unsyncedOrders.push(order);
                this.saveUnsynced();
            }
        }
        if (this.data.unsyncedOrders.length === 0) {
            window.showToast("All offline orders have been synced!");
            this.refreshData();
        }
    },

    checkLowStock() {
        if (!this.data.currentUser || this.data.currentUser.role !== 'admin') return;
        
        const lowItems = this.data.inventory.filter(i => i.stock_qty <= i.low_stock_threshold);
        if (lowItems.length > 0) {
            // Only show toast if it's a "new" alert or periodically?
            // For now, just show a warning if any item is critical
            const names = lowItems.slice(0, 2).map(i => i.name).join(', ');
            const suffix = lowItems.length > 2 ? ` and ${lowItems.length - 2} others` : '';
            window.showToast(`Low Stock Alert: ${names}${suffix}`, "warning");
        }
    },

    async login(username, password) {
        try {
            const res = await this.fetchAPI('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            
            const result = await res.json();
            if (res.ok && result.user) {
                this.data.currentUser = result.user;
                localStorage.setItem('tasty_user', JSON.stringify(result.user));
                await this.init(); // Re-init with full role permissions
                return { success: true };
            } else {
                return { success: false, error: result.error || "Login failed" };
            }
        } catch (e) {
            return { success: false, error: "Network error" };
        }
    },

    logout() {
        this.data.currentUser = null;
        localStorage.removeItem('tasty_user');
        window.location.hash = '#/login';
    }
};

store.init();

// Network state listeners
window.addEventListener('online', () => {
    store.data.isOnline = true;
    window.showToast("Connection restored. Syncing data...", "success");
    store.attemptSync();
});

window.addEventListener('offline', () => {
    store.data.isOnline = false;
    window.showToast("Connection lost. Working in Offline Mode.", "warning");
});
